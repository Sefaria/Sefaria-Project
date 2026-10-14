package main

import (
	"strings"
	"testing"
)

func TestNewKeyMatchesDjangoFormat(t *testing.T) {
	k := newKey()
	if !strings.HasPrefix(k, keyPrefix) || len(k) != len(keyPrefix)+keyLength {
		t.Fatalf("unexpected key shape %q", k)
	}
	if newKey() == k {
		t.Fatal("two keys collided")
	}
}

func TestSafePrefixNeverCarriesFullKey(t *testing.T) {
	full := "sfr_alpha000000000000000000000000001"
	if out := safePrefix(full); strings.Contains(out, full) || out != "sfr_alpha000" {
		t.Fatalf("prefix leaks or is wrong: %s", out)
	}
}

func TestOriginsJSON(t *testing.T) {
	if got := originsJSON(""); got != "[]" {
		t.Fatalf("empty origins = %s", got)
	}
	if got := originsJSON("https://a.org,https://b.org"); got != `["https://a.org","https://b.org"]` {
		t.Fatalf("origins = %s", got)
	}
}
