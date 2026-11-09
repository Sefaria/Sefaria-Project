package main

import (
	"net/http"
	"os"
	"os/exec"
	"strings"
	"syscall"
	"testing"
	"time"
)

// N-F1: after SIGTERM the pod reports not ready at once but keeps answering checks for SHUTDOWN_DRAIN, so Envoy can
// stop routing to it before the servers close; stopping at once let in-flight checks fail open.
func TestNF1DrainKeepsAnsweringAfterSigterm(t *testing.T) {
	s := startService(t, map[string]string{
		"PG_DSN": seededSchemaDSN(t), "GATED_PATHS": "/api/knn-search", "RELOAD_INTERVAL": "1h", "SHUTDOWN_DRAIN": "2s",
	})
	deadline := time.Now().Add(10 * time.Second)
	for s.readyStatus(t) != http.StatusOK {
		if time.Now().After(deadline) {
			t.Fatal("the service never became ready")
		}
		time.Sleep(50 * time.Millisecond)
	}

	term := time.Now()
	if err := s.cmd.Process.Signal(syscall.SIGTERM); err != nil {
		t.Fatal(err)
	}
	for s.readyStatus(t) != http.StatusServiceUnavailable {
		if time.Since(term) > time.Second {
			t.Fatal("/readyz still 200 a second after SIGTERM")
		}
		time.Sleep(20 * time.Millisecond)
	}

	// Inside the drain the gate still answers: a keyless call to the gated path is denied, not dropped.
	for _, at := range []time.Duration{500 * time.Millisecond, 1500 * time.Millisecond} {
		time.Sleep(time.Until(term.Add(at)))
		resp, err := s.check("POST", "/api/knn-search", nil)
		if err != nil || resp.GetDeniedResponse().GetStatus().GetCode() != 401 {
			t.Fatalf("%v after SIGTERM: %s, want a 401 from a still-serving gate", at, describe(resp, err))
		}
	}

	// After the drain the process exits.
	for {
		resp, err := http.Get(s.httpURL + "/healthz")
		if err != nil {
			break
		}
		resp.Body.Close()
		if time.Since(term) > 10*time.Second {
			t.Fatal("the service still answers 10 s after SIGTERM with a 2 s drain")
		}
		time.Sleep(50 * time.Millisecond)
	}
	if took := time.Since(term); took < 2*time.Second {
		t.Fatalf("the service stopped %v after SIGTERM, before the 2 s drain ended", took)
	}
}

func TestShutdownDrainMustBeADuration(t *testing.T) {
	for _, v := range []string{"5", "-1s", "soon"} {
		cmd := exec.Command(os.Args[0], "-test.run=^$")
		cmd.Env = append(os.Environ(), runMainEnv+"=1", "SHUTDOWN_DRAIN="+v, "PG_DSN="+unreachableDSN,
			"GRPC_ADDR="+freePort(t), "HTTP_ADDR="+freePort(t))
		out, err := cmd.CombinedOutput()
		if err == nil {
			t.Errorf("SHUTDOWN_DRAIN=%q: the service started, want a refusal", v)
		} else if !strings.Contains(string(out), "SHUTDOWN_DRAIN must be") {
			t.Errorf("SHUTDOWN_DRAIN=%q: exited without naming the setting:\n%s", v, out)
		}
	}
}
