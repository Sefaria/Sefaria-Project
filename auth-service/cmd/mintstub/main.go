package main

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/Sefaria/Sefaria-Project/auth-service/internal/mint"
)

func envOr(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}

func main() {
	issuer := envOr("JWT_ISSUER", "https://mint-authpoc.default.svc.cluster.local")
	aud := envOr("JWT_AUDIENCE", "sefaria-api")
	m, err := mint.New(issuer, aud)
	if err != nil {
		panic(err)
	}
	writeJSON := func(w http.ResponseWriter, v any) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(v)
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })
	mux.HandleFunc("/.well-known/jwks.json", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "max-age=300")
		_, _ = w.Write(m.JWKS())
	})
	mux.HandleFunc("/token", func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		ttl, _ := strconv.Atoi(q.Get("ttl"))
		if ttl == 0 {
			ttl = 3600
		}
		tier := q.Get("tier")
		if tier == "" {
			tier = "firstparty"
		}
		tok, err := m.Sign(mint.Opts{Sub: q.Get("sub"), Tier: tier, Kid: q.Get("kid"), TTL: time.Duration(ttl) * time.Second, Bad: q.Get("bad")})
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		writeJSON(w, map[string]any{"token": tok, "kids": m.Kids()})
	})
	post := func(f func() (any, error)) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			if r.Method != http.MethodPost {
				http.Error(w, "POST only", http.StatusMethodNotAllowed)
				return
			}
			v, err := f()
			if err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			writeJSON(w, map[string]any{"result": v, "kids": m.Kids()})
		}
	}
	mux.HandleFunc("/keys/next", post(func() (any, error) { return m.Next() }))
	mux.HandleFunc("/keys/promote", post(func() (any, error) {
		c, r, err := m.Promote()
		return map[string]string{"current": c, "retiring": r}, err
	}))
	mux.HandleFunc("/keys/retire", post(func() (any, error) { return m.Retire() }))
	mux.HandleFunc("/keys", func(w http.ResponseWriter, _ *http.Request) { writeJSON(w, m.Kids()) })
	slog.Info("mintstub listening", "addr", ":8081", "issuer", issuer)
	if err := http.ListenAndServe(":8081", mux); err != nil {
		panic(err)
	}
}
