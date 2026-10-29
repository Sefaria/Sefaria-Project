package authz

import (
	"strings"
	"testing"
)

// hasAllAPIKeyRemovals reports whether qp is exactly the apiKeyQueryParams set (same names, no extras).
func hasAllAPIKeyRemovals(qp []string) bool {
	if len(qp) != len(apiKeyQueryParams) {
		return false
	}
	seen := make(map[string]bool, len(qp))
	for _, n := range qp {
		seen[n] = true
	}
	for _, n := range apiKeyQueryParams {
		if !seen[n] {
			return false
		}
	}
	return true
}

func TestAPIKeyQueryParamsCoverEveryCasing(t *testing.T) {
	// 64 casings of api_key, 64 of apikey, 128 of api%5Fkey (the hex digit F/f counts as a letter).
	if len(apiKeyQueryParams) != 256 {
		t.Fatalf("want 256 names, got %d", len(apiKeyQueryParams))
	}
	uniq := map[string]bool{}
	for _, n := range apiKeyQueryParams {
		if uniq[n] {
			t.Fatalf("duplicate %q", n)
		}
		uniq[n] = true
		if l := strings.ToLower(n); l != "api_key" && l != "apikey" && l != "api%5fkey" {
			t.Fatalf("unexpected name %q", n)
		}
	}
	for _, want := range []string{"api_key", "API_KEY", "Api_Key", "apikey", "APIKEY", "ApiKey", "api%5Fkey", "API%5FKEY", "api%5fkey"} {
		if !uniq[want] {
			t.Fatalf("missing %q", want)
		}
	}
}

func TestAllowSendsEveryCasingForRemoval(t *testing.T) {
	resp, _ := checkDecision(t, enforce, "GET", "/api/texts/Genesis.1?API_KEY=x&a=1", nil)
	qp := resp.GetOkResponse().GetQueryParametersToRemove()
	if !hasAllAPIKeyRemovals(qp) {
		t.Fatalf("allow must remove all %d casings, got %d", len(apiKeyQueryParams), len(qp))
	}
}
