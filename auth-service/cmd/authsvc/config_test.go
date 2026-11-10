//go:build knowngaps

package main

import (
	"testing"
)

// Desired behaviour that the service does not have yet. Run with: go test -tags knowngaps -run KnownGap ./...

func TestKnownGapNA10GatedPathsTrimmed(t *testing.T) {
	s := startService(t, map[string]string{"PG_DSN": unreachableDSN, "GATED_PATHS": "/api/a, /api/b", "RELOAD_INTERVAL": "1h"})
	for _, p := range []string{"/api/a", "/api/b"} {
		t.Run("@known-gap N-A10 "+p, func(t *testing.T) {
			resp, err := s.check("POST", p, nil)
			if err != nil || resp.GetDeniedResponse().GetStatus().GetCode() != 401 {
				t.Fatalf("want 401 api_key_required, got %s", describe(resp, err))
			}
		})
	}
}
