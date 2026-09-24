package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"log/slog"
	"net"
	"net/http"
	"os"
	"strings"
	"sync/atomic"
	"time"

	authv3 "github.com/envoyproxy/go-control-plane/envoy/service/auth/v3"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/collectors"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"google.golang.org/grpc"
	"google.golang.org/grpc/reflection"

	"github.com/Sefaria/Sefaria-Project/auth-service/internal/authz"
	"github.com/Sefaria/Sefaria-Project/auth-service/internal/jwtverify"
	"github.com/Sefaria/Sefaria-Project/auth-service/internal/registry"
)

func envOr(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}

func main() {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	promReg := prometheus.NewRegistry()
	promReg.MustRegister(collectors.NewGoCollector(), collectors.NewProcessCollector(collectors.ProcessCollectorOpts{}))
	rec := authz.NewPromRecorder(promReg)
	keysGauge := prometheus.NewGauge(prometheus.GaugeOpts{Name: "authsvc_registry_keys"})
	versionGauge := prometheus.NewGauge(prometheus.GaugeOpts{Name: "authsvc_registry_version"})
	reloads := prometheus.NewCounterVec(prometheus.CounterOpts{Name: "authsvc_reload_total"}, []string{"result"})
	pushes := prometheus.NewCounterVec(prometheus.CounterOpts{Name: "authsvc_push_events_total"}, []string{"channel", "result"})
	startup := prometheus.NewGauge(prometheus.GaugeOpts{Name: "authsvc_startup_load_seconds"})
	promReg.MustRegister(keysGauge, versionGauge, reloads, pushes, startup)

	cfg := authz.Config{
		Mode:          authz.Mode(envOr("AUTH_MODE", "enforce")),
		HelpURL:       envOr("HELP_URL", "https://developers.sefaria.org/help/"),
		JWTCookieName: envOr("JWT_COOKIE_NAME", "sefaria_jwt"),
	}
	if gp := os.Getenv("GATED_PATHS"); gp != "" {
		cfg.GatedPaths = strings.Split(gp, ",")
	}
	if cfg.Mode != authz.ModeEnforce && cfg.Mode != authz.ModeObserve {
		panic("AUTH_MODE must be enforce or observe")
	}

	reg := registry.New()
	var ready atomic.Bool
	db, err := sql.Open("pgx", os.Getenv("PG_DSN"))
	if err != nil {
		panic(err)
	}
	load := func(ctx context.Context) ([]registry.Key, error) { return registry.LoadAll(ctx, db) }
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

	apply := func(channel string) func(registry.ChangeEvent) error {
		return func(ev registry.ChangeEvent) error {
			err := reg.Apply(ev)
			res := "ok"
			if err != nil {
				res = "error"
			}
			pushes.WithLabelValues(channel, res).Inc()
			gauges()
			slog.Info("push applied", "channel", channel, "op", ev.Op, "key_prefix", authz.Prefix(ev.Key.Key), "project", ev.Key.ProjectID, "age", time.Since(ev.TS))
			return err
		}
	}
	if addr := os.Getenv("REDIS_ADDR"); addr != "" {
		go registry.SubscribeRedis(ctx, addr, os.Getenv("REDIS_PASSWORD"), envOr("PUSH_CHANNEL", "sefaria.apikeys"), apply("redis"), func(err error) {
			slog.Warn("redis push", "err", err)
		})
	}
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
				pushes.WithLabelValues("postgres", "error").Inc()
				slog.Warn("notify reload failed; keeping in-memory set", "err", err)
				return
			}
			pushes.WithLabelValues("postgres", "ok").Inc()
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
	interval, _ := time.ParseDuration(envOr("RELOAD_INTERVAL", "60s"))
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
	if envOr("JWT_MODE", "envoy") == "authsvc" {
		v, err := jwtverify.New(ctx, os.Getenv("JWKS_URL"), envOr("JWT_ISSUER", "https://mint-authpoc.default.svc.cluster.local"), envOr("JWT_AUDIENCE", "sefaria-api"))
		if err != nil {
			slog.Error("jwks init failed; JWT_MODE=authsvc disabled, tokens deferred to Envoy", "err", err)
		} else {
			opts.Verifier = v
		}
	}

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
	mux.Handle("/internal/keys/apply", registry.HTTPApplyHandler(apply("http")))
	mux.HandleFunc("/internal/keys/", func(w http.ResponseWriter, r *http.Request) {
		id := strings.TrimPrefix(r.URL.Path, "/internal/keys/")
		if k, ok := reg.LookupID(id); ok && !k.Revoked {
			w.WriteHeader(http.StatusOK)
			return
		}
		w.WriteHeader(http.StatusNotFound)
	})
	mux.HandleFunc("/internal/registry", func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"len":       reg.Len(),
			"version":   reg.Version(),
			"loaded_at": reg.LoadedAt(),
			"mode":      cfg.Mode,
			"jwt_mode":  envOr("JWT_MODE", "envoy"),
		})
	})
	mux.Handle("/", authz.NewHTTPHandler(reg, opts, rec))

	go func() {
		lis, err := net.Listen("tcp", envOr("GRPC_ADDR", ":9090"))
		if err != nil {
			panic(err)
		}
		s := grpc.NewServer()
		authv3.RegisterAuthorizationServer(s, authz.NewGRPCServer(reg, opts, rec))
		reflection.Register(s)
		slog.Info("grpc listening", "addr", lis.Addr().String())
		if err := s.Serve(lis); err != nil {
			panic(err)
		}
	}()

	addr := envOr("HTTP_ADDR", ":8080")
	slog.Info("http listening", "addr", addr, "reload_interval", interval, "redis_push", os.Getenv("REDIS_ADDR") != "", "jwt_verifier", opts.Verifier != nil)
	if err := http.ListenAndServe(addr, mux); err != nil && !strings.Contains(err.Error(), "closed") {
		panic(err)
	}
}
