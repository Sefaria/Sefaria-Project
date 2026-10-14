package authz

import (
	"context"
	"testing"

	corev3 "github.com/envoyproxy/go-control-plane/envoy/config/core/v3"
)

var metered = Config{Mode: ModeEnforce, HelpURL: "https://developers.sefaria.org/help/", Meters: []Meter{{Name: "semantic", Prefix: "/api/knn-search"}}}

func TestMeterMatchesTheDecodedCleanedPath(t *testing.T) {
	cases := map[string]string{
		"/api/knn-search":        "semantic",
		"/api/knn-search/extra":  "semantic",
		"/api/%6bnn-search":      "semantic",
		"//api/knn-search":       "semantic",
		"/api/../api/knn-search": "semantic",
		"/api/texts/Genesis.1":   "none",
		"/":                      "none",
	}
	for path, want := range cases {
		if got := Decide(reg, metered, Request{Path: path, APIKey: alpha}).Meter; got != want {
			t.Errorf("path %q: meter %q, want %q", path, got, want)
		}
		if got := meterFor(metered, path); got != want {
			t.Errorf("meterFor(%q) = %q, want %q", path, got, want)
		}
	}
}

func TestMeterLongestPrefixWins(t *testing.T) {
	cfg := Config{Meters: []Meter{{"broad", "/api/search"}, {"narrow", "/api/search/semantic"}}}
	if got := meterFor(cfg, "/api/search/semantic/q"); got != "narrow" {
		t.Fatalf("got %q", got)
	}
	if got := meterFor(cfg, "/api/search/text"); got != "broad" {
		t.Fatalf("got %q", got)
	}
}

func TestNoMetersMeansNone(t *testing.T) {
	if got := Decide(reg, enforce, Request{Path: "/api/knn-search", APIKey: alpha}).Meter; got != MeterNone {
		t.Fatalf("got %q", got)
	}
}

func TestParseMeters(t *testing.T) {
	got, err := ParseMeters("semantic=/api/knn-search, semantic=/api/other ,texts=/api/texts")
	if err != nil || len(got) != 3 || got[0] != (Meter{"semantic", "/api/knn-search"}) || got[1].Prefix != "/api/other" || got[2].Name != "texts" {
		t.Fatalf("got %v err=%v", got, err)
	}
	if got, err := ParseMeters(""); err != nil || got != nil {
		t.Fatalf("empty: %v %v", got, err)
	}
	for _, bad := range []string{
		"semantic", "semantic=", "=/api/x", "semantic=api/x", "Semantic=/api/x", "none=/api/x",
		"semantic=/api/x,", "a b=/api/x", "semantic=/api/x,,texts=/api/t",
	} {
		if got, err := ParseMeters(bad); err == nil {
			t.Errorf("%q accepted: %v", bad, got)
		}
	}
}

func meterHeader(t *testing.T, cfg Config, path string, headers map[string]string) *corev3.HeaderValueOption {
	t.Helper()
	s := NewGRPCServer(reg, Options{Cfg: cfg}, NopRecorder{})
	resp, err := s.Check(context.Background(), checkReq(path, headers))
	if err != nil {
		t.Fatal(err)
	}
	var found *corev3.HeaderValueOption
	for _, h := range resp.GetOkResponse().GetHeaders() {
		if h.Header.Key == "x-sefaria-meter" {
			if found != nil {
				t.Fatal("x-sefaria-meter stamped twice")
			}
			found = h
		}
	}
	if found == nil {
		t.Fatalf("no x-sefaria-meter in %v", resp)
	}
	if found.AppendAction != corev3.HeaderValueOption_OVERWRITE_IF_EXISTS_OR_ADD {
		t.Fatalf("append action %v", found.AppendAction)
	}
	return found
}

func TestGRPCStampsMeterOnMeteredAndOtherPaths(t *testing.T) {
	if h := meterHeader(t, metered, "/api/%6bnn-search?q=x", map[string]string{"x-api-key": alpha}); h.Header.Value != "semantic" {
		t.Fatalf("encoded path: %q", h.Header.Value)
	}
	if h := meterHeader(t, metered, "//api/knn-search", map[string]string{"x-api-key": alpha}); h.Header.Value != "semantic" {
		t.Fatalf("double slash: %q", h.Header.Value)
	}
	if h := meterHeader(t, metered, "/api/texts/Genesis.1", map[string]string{"x-api-key": alpha}); h.Header.Value != "none" {
		t.Fatalf("non-metered: %q", h.Header.Value)
	}
	if h := meterHeader(t, metered, "/api/texts/Genesis.1", nil); h.Header.Value != "none" {
		t.Fatalf("anonymous non-metered: %q", h.Header.Value)
	}
}

func TestGRPCOverwritesClientSentMeter(t *testing.T) {
	h := meterHeader(t, metered, "/api/knn-search", map[string]string{"x-api-key": alpha, "x-sefaria-meter": "none"})
	if h.Header.Value != "semantic" {
		t.Fatalf("client-sent none survived: %q", h.Header.Value)
	}
	h = meterHeader(t, metered, "/api/texts/Genesis.1", map[string]string{"x-api-key": alpha, "x-sefaria-meter": "semantic"})
	if h.Header.Value != "none" {
		t.Fatalf("client-sent semantic survived: %q", h.Header.Value)
	}
}

func TestGRPCStampsMeterInObserveMode(t *testing.T) {
	cfg := metered
	cfg.Mode = ModeObserve
	cfg.GatedPaths = []string{"/api/knn-search"}
	// A would-be 401 is allowed in observe mode and still carries the meter.
	if h := meterHeader(t, cfg, "/api/knn-search", nil); h.Header.Value != "semantic" {
		t.Fatalf("observe: %q", h.Header.Value)
	}
}

func TestGRPCStampsMeterWithVerifier(t *testing.T) {
	s := NewGRPCServer(reg, Options{Cfg: metered, Verifier: fakeVerifier{}}, NopRecorder{})
	resp, err := s.Check(context.Background(), checkReq("/api/knn-search", map[string]string{"authorization": "Bearer abc"}))
	if err != nil {
		t.Fatal(err)
	}
	for _, h := range resp.GetOkResponse().GetHeaders() {
		if h.Header.Key == "x-sefaria-meter" && h.Header.Value == "semantic" {
			return
		}
	}
	t.Fatal("meter lost after JWT verification")
}
