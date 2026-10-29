//go:build knowngaps

package authz

import (
	"context"
	"testing"

	"github.com/Sefaria/Sefaria-Project/auth-service/internal/registry"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// Desired behaviour that the service does not have yet. Run with: go test -tags knowngaps -run KnownGap ./...

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
