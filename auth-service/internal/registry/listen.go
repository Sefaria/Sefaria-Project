package registry

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// Notice is one change broadcast by the registry's triggers (Django migrations in powered_by/). It says what changed, never which key.
type Notice struct {
	Table string
	Op    string
	Age   time.Duration // commit-side trigger time to receipt; informational (clock skew applies)
}

// defaultOpTimeout bounds each connect, LISTEN and idle Ping when ListenConfig.OpTimeout is zero. A black-holed connection
// (no RST, no reply) would otherwise hold the listener forever, since the process-lifetime context has no deadline.
const defaultOpTimeout = 10 * time.Second

type ListenConfig struct {
	OpTimeout              time.Duration // per connect, LISTEN and Ping; zero means defaultOpTimeout
	DSN, Channel, AppName  string
	MinBackoff, MaxBackoff time.Duration
	WaitTimeout            time.Duration // idle wait before a Ping; proxies and idle_session_timeout kill silent sessions
	OnEstablished          func(context.Context)
	OnNotify               func(Notice)
	OnErr                  func(error)
}

// ListenPostgres keeps one dedicated connection LISTENing on cfg.Channel until ctx ends. NOTIFY is not durable, so on
// every (re)connect it calls OnEstablished after LISTEN has taken effect: the caller reloads the full key set there, and
// nothing committed while disconnected is missed. On any error it closes the connection and reconnects with backoff.
func ListenPostgres(ctx context.Context, cfg ListenConfig) {
	backoff := cfg.MinBackoff
	for ctx.Err() == nil {
		err := listenOnce(ctx, cfg, func() { backoff = cfg.MinBackoff })
		if ctx.Err() != nil {
			return
		}
		cfg.OnErr(fmt.Errorf("postgres listener: %w; reconnecting in %s", err, backoff))
		select {
		case <-ctx.Done():
			return
		case <-time.After(backoff):
		}
		backoff = min(backoff*2, cfg.MaxBackoff)
	}
}

func listenOnce(ctx context.Context, cfg ListenConfig, connected func()) error {
	pc, err := pgx.ParseConfig(cfg.DSN)
	if err != nil {
		return err
	}
	if cfg.AppName != "" {
		pc.RuntimeParams["application_name"] = cfg.AppName
	}
	// A dedicated connection, not a pool member: a pool can recycle it and silently drop the LISTEN.
	opTimeout := cfg.OpTimeout
	if opTimeout <= 0 {
		opTimeout = defaultOpTimeout
	}
	cctx, cancel := context.WithTimeout(ctx, opTimeout)
	conn, err := pgx.ConnectConfig(cctx, pc)
	cancel()
	if err != nil {
		return err
	}
	// Close with a bound too: a dead peer must not hang the teardown.
	defer func() {
		closeCtx, cancel := context.WithTimeout(context.Background(), opTimeout)
		defer cancel()
		_ = conn.Close(closeCtx)
	}()
	lctx, cancel := context.WithTimeout(ctx, opTimeout)
	_, err = conn.Exec(lctx, "LISTEN "+pgx.Identifier{cfg.Channel}.Sanitize())
	cancel()
	if err != nil {
		return err
	}
	connected()
	cfg.OnEstablished(ctx)
	for {
		wctx, cancel := context.WithTimeout(ctx, cfg.WaitTimeout)
		n, err := conn.WaitForNotification(wctx)
		cancel()
		if err != nil {
			if ctx.Err() != nil {
				return ctx.Err()
			}
			if errors.Is(err, context.DeadlineExceeded) || pgconn.Timeout(err) {
				pctx, cancel := context.WithTimeout(ctx, opTimeout)
				err := conn.Ping(pctx)
				cancel()
				if err != nil {
					return err
				}
				continue
			}
			return err
		}
		cfg.OnNotify(parseNotice(n.Payload))
	}
}

func parseNotice(payload string) Notice {
	var p struct {
		Table string    `json:"table"`
		Op    string    `json:"op"`
		TS    time.Time `json:"ts"`
	}
	_ = json.Unmarshal([]byte(payload), &p)
	n := Notice{Table: p.Table, Op: p.Op}
	if !p.TS.IsZero() {
		n.Age = time.Since(p.TS)
	}
	return n
}
