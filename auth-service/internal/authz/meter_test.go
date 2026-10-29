package authz

import "testing"

func TestParseMeters(t *testing.T) {
	ok, err := ParseMeters("semantic=/api/knn-search, semantic=/api/search")
	if err != nil || len(ok) != 2 || ok[0] != (Meter{Name: "semantic", Prefix: "/api/knn-search"}) || ok[1] != (Meter{Name: "semantic", Prefix: "/api/search"}) {
		t.Fatalf("valid spec: %+v err=%v", ok, err)
	}
	if empty, err := ParseMeters("  "); err != nil || len(empty) != 0 {
		t.Fatalf("empty spec must mean no meters: %+v err=%v", empty, err)
	}
	for name, spec := range map[string]string{
		"entry without =":      "semantic",
		"bad name (uppercase)": "Semantic=/api/knn-search",
		"name none":            "none=/api/knn-search",
		"prefix without /":     "semantic=api/knn-search",
	} {
		if _, err := ParseMeters(spec); err == nil {
			t.Fatalf("%s: want an error for %q", name, spec)
		}
	}
}

func TestMeterForUsesCleanedPath(t *testing.T) {
	cfg := Config{Meters: []Meter{{Name: "semantic", Prefix: "/api/knn-search"}}}
	for path, want := range map[string]string{
		"/api/%6bnn-search":  "semantic",
		"//api/knn-search":   "semantic",
		"/api/knn-search/x":  "semantic",
		"/api/texts/Genesis": MeterNone,
		"/elsewhere":         MeterNone,
	} {
		if got := meterFor(cfg, path); got != want {
			t.Fatalf("meterFor(%q) = %q, want %q", path, got, want)
		}
	}
}
