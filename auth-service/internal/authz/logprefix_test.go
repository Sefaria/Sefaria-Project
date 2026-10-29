//go:build knowngaps

package authz

import (
	"encoding/json"
	"strings"
	"testing"
)

// The deny log may keep at most "sfr_" plus 4 characters of a key, and at most 4 characters of any other key.
func loggedKeyPrefix(t *testing.T, cfg Config, method, path string, headers map[string]string) string {
	t.Helper()
	logs := captureLogs(t)
	checkDecision(t, cfg, method, path, headers)
	for _, line := range strings.Split(strings.TrimSpace(logs.String()), "\n") {
		var rec map[string]any
		if json.Unmarshal([]byte(line), &rec) == nil && rec["msg"] == "deny" {
			s, _ := rec["key_prefix"].(string)
			return s
		}
	}
	t.Fatalf("no deny line in %q", logs)
	return ""
}

func wantShortPrefix(t *testing.T, key, logged string) {
	t.Helper()
	limit := 4
	if strings.HasPrefix(key, "sfr_") {
		limit = len("sfr_") + 4
	}
	if logged == key || (len(logged) > limit && strings.HasPrefix(key, logged)) {
		t.Fatalf("deny log keeps %d characters of a %d-character key (limit %d)", len(logged), len(key), limit)
	}
}

func TestKnownGapNE2LegacyKeyPrefix(t *testing.T) {
	for name, k := range map[string]string{
		"legacy 32 hex":        "0123456789abcdef0123456789abcdef",
		"legacy 12 characters": "abcdefghijkl",
		"legacy 8 characters":  "abcdefgh",
	} {
		t.Run("@known-gap N-E2 "+name, func(t *testing.T) {
			wantShortPrefix(t, k, loggedKeyPrefix(t, enforce, "POST", "/api/knn-search", map[string]string{"x-api-key": k}))
		})
	}
}

func TestKnownGapNCR4dValidKeyPrefix(t *testing.T) {
	t.Run("@known-gap N-CR4 valid restricted key denied by Origin", func(t *testing.T) {
		wantShortPrefix(t, beta, loggedKeyPrefix(t, enforce, "GET", "/api/texts/Genesis.1", map[string]string{"x-api-key": beta, "origin": "https://evil.example.org"}))
	})
	t.Run("@known-gap N-CR4 unknown sfr_ key", func(t *testing.T) {
		wantShortPrefix(t, unknown, loggedKeyPrefix(t, enforce, "POST", "/api/knn-search", map[string]string{"x-api-key": unknown}))
	})
}
