package authz

import (
	"bytes"
	"context"
	"log/slog"
	"strings"
	"testing"

	authv3 "github.com/envoyproxy/go-control-plane/envoy/service/auth/v3"
	"google.golang.org/grpc/codes"
)

// captureLogs routes slog to a buffer for the duration of the test.
func captureLogs(t *testing.T) *bytes.Buffer {
	t.Helper()
	var buf bytes.Buffer
	prev := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&buf, nil)))
	t.Cleanup(func() { slog.SetDefault(prev) })
	return &buf
}

func checkDecision(t *testing.T, cfg Config, method, path string, headers map[string]string) (*authv3.CheckResponse, map[string]string) {
	t.Helper()
	s := NewGRPCServer(reg, Options{Cfg: cfg}, NopRecorder{})
	resp, err := s.Check(context.Background(), checkReqMethod(method, path, headers))
	if err != nil {
		t.Fatalf("Check error: %v", err)
	}
	got := map[string]string{}
	for _, h := range resp.GetOkResponse().GetHeaders() {
		got[h.Header.Key] = h.Header.Value
	}
	return resp, got
}

func wantDeny(t *testing.T, resp *authv3.CheckResponse, status int, code string) {
	t.Helper()
	if resp.Status.Code != int32(codes.PermissionDenied) {
		t.Fatalf("want a deny, got status %v ok=%v", resp.Status, resp.GetOkResponse())
	}
	dr := resp.GetDeniedResponse()
	if int(dr.GetStatus().GetCode()) != status || !strings.Contains(dr.GetBody(), `"code":"`+code+`"`) {
		t.Fatalf("want %d %s, got %d %s", status, code, dr.GetStatus().GetCode(), dr.GetBody())
	}
}

func TestA4bBearerOnlyOnGatedPath(t *testing.T) {
	resp, _ := checkDecision(t, enforce, "POST", "/api/knn-search", map[string]string{"authorization": "Bearer la.jwt.token"})
	wantDeny(t, resp, 401, CodeKeyRequired)
}

func TestA4cBearerAndValidKeyOnGatedPath(t *testing.T) {
	resp, got := checkDecision(t, enforce, "POST", "/api/knn-search", map[string]string{"authorization": "Bearer wrong.jwt.token", "x-api-key": alpha})
	if resp.Status.Code != int32(codes.OK) {
		t.Fatalf("key must decide; got %v", resp.Status)
	}
	if got["x-sefaria-project"] != "proj_alpha" || got["x-sefaria-auth-result"] != "ok" {
		t.Fatalf("headers=%v", got)
	}
	for _, h := range resp.GetOkResponse().GetHeadersToRemove() {
		if strings.EqualFold(h, "authorization") {
			t.Fatal("the Bearer must reach Django, which checks it")
		}
	}
}

func TestA5cOptionsWithKey(t *testing.T) {
	for _, path := range []string{"/api/knn-search", "/api/texts/Genesis.1"} {
		t.Run("restricted key, wrong Origin "+path, func(t *testing.T) {
			resp, _ := checkDecision(t, enforce, "OPTIONS", path, map[string]string{"x-api-key": beta, "origin": "https://evil.example.org"})
			wantDeny(t, resp, 403, CodeOriginNotAllowed)
		})
		t.Run("unknown key "+path, func(t *testing.T) {
			resp, _ := checkDecision(t, enforce, "OPTIONS", path, map[string]string{"x-api-key": unknown, "origin": "https://embed.example.org"})
			wantDeny(t, resp, 401, CodeKeyInvalid)
		})
	}
}

// Envoy joins repeated request headers with a comma before ext_authz sees them.
func TestA2dDuplicateKeyHeaderOnGatedPath(t *testing.T) {
	for name, v := range map[string]string{"same key twice": alpha + "," + alpha, "key and unknown": alpha + "," + unknown} {
		t.Run(name, func(t *testing.T) {
			resp, _ := checkDecision(t, enforce, "POST", "/api/knn-search", map[string]string{"x-api-key": v})
			wantDeny(t, resp, 401, CodeKeyInvalid)
		})
	}
}

func TestNA5KeyInAuthorizationHeader(t *testing.T) {
	h := map[string]string{"authorization": "Bearer " + alpha}
	t.Run("ungated", func(t *testing.T) {
		resp, got := checkDecision(t, enforce, "GET", "/api/texts/Genesis.1", h)
		if resp.Status.Code != int32(codes.OK) || got["x-sefaria-tier"] != TierAnonymous || got["x-sefaria-auth-result"] != "jwt_pending" || got["x-sefaria-project"] != "" {
			t.Fatalf("status=%v headers=%v", resp.Status, got)
		}
	})
	t.Run("gated", func(t *testing.T) {
		resp, _ := checkDecision(t, enforce, "POST", "/api/knn-search", h)
		wantDeny(t, resp, 401, CodeKeyRequired)
	})
}

func TestGRPCQueryStrip(t *testing.T) {
	t.Run("query key is not a credential and the gate sees the bare path", func(t *testing.T) {
		logs := captureLogs(t)
		resp, _ := checkDecision(t, enforce, "POST", "/api/knn-search?api_key="+alpha, nil)
		wantDeny(t, resp, 401, CodeKeyRequired)
		if strings.Contains(logs.String(), alpha) || strings.Contains(logs.String(), "api_key=") {
			t.Fatalf("deny log carries the query string: %s", logs)
		}
	})
	t.Run("empty query on gated path", func(t *testing.T) {
		resp, _ := checkDecision(t, enforce, "POST", "/api/knn-search?", nil)
		wantDeny(t, resp, 401, CodeKeyRequired)
	})
	t.Run("gated prefix only in the query", func(t *testing.T) {
		resp, got := checkDecision(t, enforce, "GET", "/api/texts/Genesis.1?next=/api/knn-search", nil)
		if resp.Status.Code != int32(codes.OK) || got["x-sefaria-auth-result"] != TierAnonymous {
			t.Fatalf("status=%v headers=%v", resp.Status, got)
		}
	})
	t.Run("encoded question mark stays part of the path", func(t *testing.T) {
		resp, _ := checkDecision(t, enforce, "POST", "/api/knn-search%3Fx=1", nil)
		wantDeny(t, resp, 401, CodeKeyRequired)
	})
	t.Run("allow strips api_key from the query", func(t *testing.T) {
		resp, _ := checkDecision(t, enforce, "GET", "/api/texts/Genesis.1?api_key=x", nil)
		qp := resp.GetOkResponse().GetQueryParametersToRemove()
		if !hasAllAPIKeyRemovals(qp) {
			t.Fatalf("qp=%v", qp)
		}
	})
}

// The cases of N-CR9 that the service already gates on its own.
func TestNCR9MalformedGatedPathsGated(t *testing.T) {
	for _, p := range []string{"/api/knn-search%zz", "/api/knn-search;x", "/api/knn-search%00"} {
		t.Run(p, func(t *testing.T) {
			resp, _ := checkDecision(t, enforce, "POST", p, nil)
			wantDeny(t, resp, 401, CodeKeyRequired)
		})
	}
}
