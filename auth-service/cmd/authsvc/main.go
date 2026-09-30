package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"sync/atomic"
	"syscall"
	"time"

	authv3 "github.com/envoyproxy/go-control-plane/envoy/service/auth/v3"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/collectors"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"google.golang.org/grpc"
	"google.golang.org/grpc/reflection"

	"github.com/Sefaria/Sefaria-Project/auth-service/internal/authz"
	"github.com/Sefaria/Sefaria-Project/auth-service/internal/registry"
)

const (
	loadTimeout     = 10 * time.Second
	shutdownTimeout = 20 * time.Second
)

func envOr(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}

func main() {
	// SIGTERM (rollout, drain) cancels ctx: the background loops exit and both servers drain in-flight calls.
	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGTERM, os.Interrupt)
	defer cancel()

	promReg := prometheus.NewRegistry()
	promReg.MustRegister(collectors.NewGoCollector(), collectors.NewProcessCollector(collectors.ProcessCollectorOpts{}))
	rec := authz.NewPromRecorder(promReg)
	keysGauge := prometheus.NewGauge(prometheus.GaugeOpts{Name: "authsvc_registry_keys"})
	versionGauge := prometheus.NewGauge(prometheus.GaugeOpts{Name: "authsvc_registry_version"})
	reloads := prometheus.NewCounterVec(prometheus.CounterOpts{Name: "authsvc_reload_total"}, []string{"result"})
	notifyReloads := prometheus.NewCounterVec(prometheus.CounterOpts{Name: "authsvc_notify_reload_total"}, []string{"result"})
	startup := prometheus.NewGauge(prometheus.GaugeOpts{Name: "authsvc_startup_load_seconds"})
	promReg.MustRegister(keysGauge, versionGauge, reloads, notifyReloads, startup)

	cfg := authz.Config{
		Mode:    authz.Mode(envOr("AUTH_MODE", "enforce")),
		HelpURL: envOr("HELP_URL", "https://developers.sefaria.org/help/"),
	}
	if gp := os.Getenv("GATED_PATHS"); gp != "" {
		cfg.GatedPaths = strings.Split(gp, ",")
	}
	if cfg.Mode != authz.ModeEnforce && cfg.Mode != authz.ModeObserve {
		panic("AUTH_MODE must be enforce or observe")
	}
	interval, err := time.ParseDuration(envOr("RELOAD_INTERVAL", "60s"))
	if err != nil || interval <= 0 {
		panic(fmt.Sprintf("RELOAD_INTERVAL must be a positive Go duration such as 60s, got %q", os.Getenv("RELOAD_INTERVAL")))
	}

	reg := registry.New()
	var ready atomic.Bool
	db, err := sql.Open("pgx", os.Getenv("PG_DSN"))
	if err != nil {
		panic(err)
	}
	// A hung Postgres must not stall startup past the liveness probe or block the reload loops for good.
	load := func(ctx context.Context) ([]registry.Key, error) {
		ctx, cancel := context.WithTimeout(ctx, loadTimeout)
		defer cancel()
		return registry.LoadAll(ctx, db)
	}
	gauges := func() {
		keysGauge.Set(float64(reg.Len()))
		versionGauge.Set(float64(reg.Version()))
	}
	replace := func(keys []registry.Key) error {
		if err := reg.ReplaceGuarded(keys); err != nil {
			reloads.WithLabelValues("rejected_empty").Inc()
			return err
		}
		gauges()
		reloads.WithLabelValues("ok").Inc()
		ready.Store(true)
		return nil
	}

	t0 := time.Now()
	if keys, err := load(ctx); err != nil {
		slog.Error("initial load failed; serving empty set until a reload succeeds", "err", err)
		reloads.WithLabelValues("error").Inc()
	} else {
		reg.Replace(keys)
		gauges()
		reloads.WithLabelValues("ok").Inc()
		ready.Store(true)
	}
	startup.Set(time.Since(t0).Seconds())
	slog.Info("registry loaded", "keys", reg.Len(), "took", time.Since(t0), "mode", cfg.Mode)

	if channel := os.Getenv("PG_NOTIFY_CHANNEL"); channel != "" {
		// The registry's triggers NOTIFY on every committed key/tier/origin change, whoever wrote it. Each notice
		// schedules one coalesced full reload on the query pool (never on the listener's own connection).
		co := registry.NewCoalescer(50*time.Millisecond, func() {
			t0 := time.Now()
			keys, err := load(ctx)
			if err == nil {
				err = replace(keys)
			} else {
				reloads.WithLabelValues("error").Inc()
			}
			if err != nil {
				notifyReloads.WithLabelValues("error").Inc()
				slog.Warn("notify reload failed; keeping in-memory set", "err", err)
				return
			}
			notifyReloads.WithLabelValues("ok").Inc()
			slog.Info("notify reload", "keys", reg.Len(), "took", time.Since(t0))
		})
		go co.Run(ctx)
		go registry.ListenPostgres(ctx, registry.ListenConfig{
			DSN: os.Getenv("PG_DSN"), Channel: channel, AppName: "authsvc-listener",
			MinBackoff: time.Second, MaxBackoff: 30 * time.Second, WaitTimeout: 30 * time.Second,
			// LISTEN is active before this runs, so a reload here cannot miss a change made while disconnected.
			OnEstablished: func(context.Context) { slog.Info("postgres listener established", "channel", channel); co.Signal() },
			OnNotify: func(n registry.Notice) {
				slog.Info("notify received", "table", n.Table, "op", n.Op, "age", n.Age)
				co.Signal()
			},
			OnErr: func(err error) { slog.Warn("postgres listener", "err", err) },
		})
	}
	go registry.PeriodicReload(ctx, interval, func(ctx context.Context) ([]registry.Key, error) {
		k, err := load(ctx)
		if err != nil {
			reloads.WithLabelValues("error").Inc()
		}
		return k, err
	}, replace, func(err error) {
		slog.Warn("reload skipped; keeping in-memory set", "err", err)
	})

	opts := authz.Options{Cfg: cfg}

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })
	mux.HandleFunc("/readyz", func(w http.ResponseWriter, _ *http.Request) {
		if ready.Load() {
			w.WriteHeader(http.StatusOK)
			return
		}
		w.WriteHeader(http.StatusServiceUnavailable)
	})
	mux.Handle("/metrics", promhttp.HandlerFor(promReg, promhttp.HandlerOpts{}))
	mux.HandleFunc("/internal/registry", func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"len":       reg.Len(),
			"version":   reg.Version(),
			"loaded_at": reg.LoadedAt(),
			"mode":      cfg.Mode,
		})
	})

	lis, err := net.Listen("tcp", envOr("GRPC_ADDR", ":9090"))
	if err != nil {
		panic(err)
	}
	gs := grpc.NewServer()
	authv3.RegisterAuthorizationServer(gs, authz.NewGRPCServer(reg, opts, rec))
	reflection.Register(gs)
	go func() {
		slog.Info("grpc listening", "addr", lis.Addr().String())
		if err := gs.Serve(lis); err != nil {
			panic(err)
		}
	}()

	hs := &http.Server{Addr: envOr("HTTP_ADDR", ":8080"), Handler: mux, ReadHeaderTimeout: 5 * time.Second}
	go func() {
		slog.Info("http listening", "addr", hs.Addr, "reload_interval", interval, "pg_notify", os.Getenv("PG_NOTIFY_CHANNEL") != "")
		if err := hs.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			panic(err)
		}
	}()

	<-ctx.Done()
	slog.Info("shutting down")
	ready.Store(false)
	done := make(chan struct{})
	go func() { gs.GracefulStop(); close(done) }()
	select {
	case <-done:
	case <-time.After(shutdownTimeout):
		gs.Stop()
	}
	sctx, scancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer scancel()
	_ = hs.Shutdown(sctx)
	_ = db.Close()
}
