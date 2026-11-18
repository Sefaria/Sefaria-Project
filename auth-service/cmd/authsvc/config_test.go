package main

import (
	"os"
	"os/exec"
	"reflect"
	"strings"
	"syscall"
	"testing"
	"time"
)

func TestParseGatedPaths(t *testing.T) {
	cases := []struct {
		name, in string
		want     []string
	}{
		{"empty", "", nil},
		{"blank", "  ", nil},
		{"only commas", " , ,", nil},
		{"one", "/api/knn-search", []string{"/api/knn-search"}},
		{"space after comma", "/api/a, /api/b", []string{"/api/a", "/api/b"}},
		{"empty entry", "/api/a,,/api/b", []string{"/api/a", "/api/b"}},
		{"padded entries", "  /api/a  ,\t/api/b ,", []string{"/api/a", "/api/b"}},
		{"chart default", "/api/knn-search", []string{"/api/knn-search"}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got, err := parseGatedPaths(c.in)
			if err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(got, c.want) {
				t.Fatalf("parseGatedPaths(%q) = %q, want %q", c.in, got, c.want)
			}
		})
	}
}

func TestParseGatedPathsRejectsEntryWithoutLeadingSlash(t *testing.T) {
	for _, in := range []string{"api/knn-search", "/api/a, api/b", "/api/a,knn-search", "https://x/api"} {
		t.Run(in, func(t *testing.T) {
			got, err := parseGatedPaths(in)
			if err == nil {
				t.Fatalf("parseGatedPaths(%q) = %q, want an error", in, got)
			}
			if !strings.Contains(err.Error(), "GATED_PATHS") || !strings.Contains(err.Error(), "must start with /") {
				t.Fatalf("unclear error: %v", err)
			}
		})
	}
}

// A malformed GATED_PATHS stops the process at startup instead of leaving a path ungated.
func TestStartupFailsOnMalformedGatedPaths(t *testing.T) {
	cmd := exec.Command(os.Args[0], "-test.run=^$")
	addrs := freePorts(t, 2)
	cmd.Env = append(os.Environ(), runMainEnv+"=1", "PG_DSN="+unreachableDSN, "GATED_PATHS=/api/a,api/b",
		"GRPC_ADDR="+addrs[0], "HTTP_ADDR="+addrs[1])
	var out strings.Builder
	cmd.Stdout, cmd.Stderr = &out, &out
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	done := make(chan error, 1)
	go func() { done <- cmd.Wait() }()
	select {
	case err := <-done:
		if err == nil {
			t.Fatal("process exited 0 with a malformed GATED_PATHS")
		}
		if !strings.Contains(out.String(), `GATED_PATHS entry "api/b" must start with /`) {
			t.Fatalf("output lacks the clear error:\n%s", out.String())
		}
	case <-time.After(10 * time.Second):
		_ = cmd.Process.Signal(syscall.SIGKILL)
		t.Fatal("process still running with a malformed GATED_PATHS")
	}
}

func TestGatedPathsTrimmedEndToEnd(t *testing.T) {
	for _, spec := range []string{"/api/a, /api/b", "/api/a,,/api/b"} {
		s := startService(t, map[string]string{"PG_DSN": unreachableDSN, "GATED_PATHS": spec, "RELOAD_INTERVAL": "1h"})
		for _, p := range []string{"/api/a", "/api/b"} {
			t.Run(spec+" "+p, func(t *testing.T) {
				resp, err := s.check("POST", p, nil)
				if err != nil || resp.GetDeniedResponse().GetStatus().GetCode() != 401 {
					t.Fatalf("want 401 api_key_required, got %s", describe(resp, err))
				}
			})
		}
	}
}

func TestBlankGatedPathsGatesNothing(t *testing.T) {
	s := startService(t, map[string]string{"PG_DSN": unreachableDSN, "GATED_PATHS": "  ", "RELOAD_INTERVAL": "1h"})
	resp, err := s.check("POST", "/api/knn-search", nil)
	if err != nil || resp.GetOkResponse() == nil {
		t.Fatalf("want allow on an ungated path, got %s", describe(resp, err))
	}
}
