package authz

import (
	"log/slog"
	"net/http"
	"time"
)

type Recorder interface {
	Observe(result string, allow bool, d time.Duration)
}

type NopRecorder struct{}

func (NopRecorder) Observe(string, bool, time.Duration) {}

type Options struct {
	Cfg      Config
	Verifier JWTVerifier
}

const identityHeaders = "x-sefaria-project, x-sefaria-tier, x-sefaria-auth-result"

func decideRequest(l Lookup, o Options, r Request) Decision {
	d := Decide(l, o.Cfg, r)
	if d.Result == "jwt_pending" && o.Verifier != nil {
		d = DecideJWT(o.Verifier, r.Authorization)
	}
	return d
}

func NewHTTPHandler(l Lookup, o Options, rec Recorder) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t0 := time.Now()
		req := Request{
			Method:        r.Method,
			Path:          r.URL.Path,
			APIKey:        r.Header.Get("x-api-key"),
			Authorization: r.Header.Get("authorization"),
			Origin:        r.Header.Get("origin"),
		}
		d := decideRequest(l, o, req)
		rec.Observe(d.Result, d.Allow, time.Since(t0))
		if d.Allow {
			w.Header().Set("x-envoy-auth-headers-to-remove", identityHeaders)
			w.Header().Set("x-sefaria-project", d.Project)
			w.Header().Set("x-sefaria-tier", d.Tier)
			w.Header().Set("x-sefaria-auth-result", d.Result)
			w.WriteHeader(http.StatusOK)
			return
		}
		slog.Info("deny", "transport", "http", "code", d.Code, "key_prefix", Prefix(req.APIKey), "origin", req.Origin, "path", req.Path)
		w.Header().Set("Content-Type", "application/json")
		if d.Status == http.StatusUnauthorized {
			w.Header().Set("WWW-Authenticate", `ApiKey realm="sefaria"`)
		}
		w.WriteHeader(d.Status)
		_, _ = w.Write(d.Body(o.Cfg.HelpURL))
	})
}
