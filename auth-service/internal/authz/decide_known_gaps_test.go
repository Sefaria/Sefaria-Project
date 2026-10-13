//go:build knowngaps

package authz

import (
	"context"
	"strings"
	"testing"

	"github.com/Sefaria/Sefaria-Project/auth-service/internal/registry"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// Desired behaviour that the service does not have yet. Run with: go test -tags knowngaps -run KnownGap ./...

func wantAnonymousInvalidKey(t *testing.T, d Decision) {
	t.Helper()
	if !d.Allow || d.Tier != TierAnonymous || d.Project != "" || !strings.Contains(d.Result, CodeKeyInvalid) {
		t.Fatalf("want an anonymous allow recorded as %s, got %+v", CodeKeyInvalid, d)
	}
}

func TestKnownGapA2dDuplicateKeyHeaderUngated(t *testing.T) {
	for name, v := range map[string]string{"same key twice": alpha + "," + alpha, "key and unknown": alpha + "," + unknown} {
		t.Run("@known-gap D2 "+name, func(t *testing.T) {
			wantAnonymousInvalidKey(t, Decide(reg, enforce, Request{Method: "GET", Path: "/api/texts/Genesis.1", APIKey: v}))
		})
	}
}

func TestKnownGapA2bInvalidKeyUngated(t *testing.T) {
	for name, k := range map[string]string{"unknown sfr_": unknown, "revoked": revoked, "legacy": "0123456789abcdef0123456789abcdef"} {
		for _, p := range []string{"/api/texts/Genesis.1", "/", "/static/js/app.js"} {
			t.Run("@known-gap D2 "+name+" "+p, func(t *testing.T) {
				wantAnonymousInvalidKey(t, Decide(reg, enforce, Request{Method: "GET", Path: p, APIKey: k}))
			})
		}
	}
}

func TestKnownGapNCR9MalformedGatedPaths(t *testing.T) {
	for _, p := range []string{"/api/%6bnn-search%", "/api/%256bnn-search"} {
		t.Run("@known-gap N-CR9 "+p, func(t *testing.T) {
			resp, _ := checkDecision(t, enforce, "POST", p, nil)
			wantDeny(t, resp, 401, CodeKeyRequired)
		})
	}
}

func TestKnownGapNCR8NeverLoadedRegistry(t *testing.T) {
	s := NewGRPCServer(registry.New(), Options{Cfg: enforce}, NopRecorder{})
	for name, path := range map[string]string{"gated": "/api/knn-search", "ungated": "/api/texts/Genesis.1"} {
		t.Run("@known-gap N-CR8 keyed request, "+name, func(t *testing.T) {
			resp, err := s.Check(context.Background(), checkReqMethod("POST", path, map[string]string{"x-api-key": alpha}))
			if status.Code(err) != codes.Unavailable {
				t.Fatalf("want gRPC UNAVAILABLE so Envoy fails open, got err=%v status=%v body=%s", err, resp.GetStatus(), resp.GetDeniedResponse().GetBody())
			}
		})
	}
}
