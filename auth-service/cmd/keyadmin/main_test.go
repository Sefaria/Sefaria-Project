package main

import (
	"strings"
	"testing"

	"github.com/Sefaria/Sefaria-Project/auth-service/internal/registry"
)

func TestRedactedEventNeverCarriesFullKey(t *testing.T) {
	full := "sfr_alpha000000000000000000000000001"
	out := redactedEvent(registry.ChangeEvent{Op: "upsert", Key: registry.Key{Key: full, ProjectID: "proj_alpha"}})
	if strings.Contains(out, full) {
		t.Fatalf("event output leaks the full key: %s", out)
	}
	if !strings.Contains(out, "sfr_alpha000") || !strings.Contains(out, "proj_alpha") {
		t.Fatalf("event output lost prefix or project: %s", out)
	}
}
