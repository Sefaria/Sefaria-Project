//go:build knowngaps

package authz

import (
	"testing"
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
