package authz

import (
	"encoding/json"
	"strings"
	"testing"
)

// The deny log keeps at most "sfr_" plus 6 characters of an sfr_ key and nothing of a legacy (non-sfr_) key.
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
	if !strings.HasPrefix(key, "sfr_") {
		if logged != "" {
			t.Fatalf("deny log keeps %q of a legacy key, want none", logged)
		}
		return
	}
	if limit := len("sfr_") + 6; len(logged) > limit || !strings.HasPrefix(key, logged) || logged == key {
		t.Fatalf("deny log keeps %q of a %d-character sfr_ key (limit %d, must be a strict prefix)", logged, len(key), limit)
	}
}

func TestDenyLogLegacyKeyPrefix(t *testing.T) {
	for name, k := range map[string]string{
		"legacy 32 hex":        "0123456789abcdef0123456789abcdef",
		"legacy 12 characters": "abcdefghijkl",
		"legacy 8 characters":  "abcdefgh",
	} {
		t.Run("legacy key logs nothing: "+name, func(t *testing.T) {
			wantShortPrefix(t, k, loggedKeyPrefix(t, enforce, "POST", "/api/knn-search", map[string]string{"x-api-key": k}))
		})
	}
}

func TestDenyLogSfrKeyPrefix(t *testing.T) {
	t.Run("valid restricted key denied by Origin", func(t *testing.T) {
		wantShortPrefix(t, beta, loggedKeyPrefix(t, enforce, "GET", "/api/texts/Genesis.1", map[string]string{"x-api-key": beta, "origin": "https://evil.example.org"}))
	})
	t.Run("unknown sfr_ key", func(t *testing.T) {
		wantShortPrefix(t, unknown, loggedKeyPrefix(t, enforce, "POST", "/api/knn-search", map[string]string{"x-api-key": unknown}))
	})
}
