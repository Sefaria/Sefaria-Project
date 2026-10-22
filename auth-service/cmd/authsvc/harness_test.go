package main

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"strings"
	"syscall"
	"testing"
	"time"

	authv3 "github.com/envoyproxy/go-control-plane/envoy/service/auth/v3"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

const runMainEnv = "AUTHSVC_TEST_RUN_MAIN"

const unreachableDSN = "postgres://nobody:nothing@127.0.0.1:1/none?sslmode=disable&connect_timeout=2"

func TestMain(m *testing.M) {
	if os.Getenv(runMainEnv) == "1" {
		main()
		os.Exit(0)
	}
	os.Exit(m.Run())
}

type service struct {
	httpURL string
	client  authv3.AuthorizationClient
}

func freePort(t *testing.T) string {
	t.Helper()
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer l.Close()
	return l.Addr().String()
}

// startService runs the real main() in a child process with the given environment and waits until it serves.
func startService(t *testing.T, env map[string]string) *service {
	t.Helper()
	grpcAddr, httpAddr := freePort(t), freePort(t)
	cmd := exec.Command(os.Args[0], "-test.run=^$")
	cmd.Env = append(os.Environ(), runMainEnv+"=1", "GRPC_ADDR="+grpcAddr, "HTTP_ADDR="+httpAddr)
	for k, v := range env {
		cmd.Env = append(cmd.Env, k+"="+v)
	}
	var out strings.Builder
	cmd.Stdout, cmd.Stderr = &out, &out
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_ = cmd.Process.Signal(syscall.SIGTERM)
		done := make(chan struct{})
		go func() { _ = cmd.Wait(); close(done) }()
		select {
		case <-done:
		case <-time.After(10 * time.Second):
			_ = cmd.Process.Kill()
		}
		if t.Failed() {
			t.Logf("service output:\n%s", out.String())
		}
	})
	s := &service{httpURL: "http://" + httpAddr}
	deadline := time.Now().Add(20 * time.Second)
	for {
		if resp, err := http.Get(s.httpURL + "/healthz"); err == nil {
			resp.Body.Close()
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("service did not come up:\n%s", out.String())
		}
		time.Sleep(50 * time.Millisecond)
	}
	conn, err := grpc.NewClient(grpcAddr, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { conn.Close() })
	s.client = authv3.NewAuthorizationClient(conn)
	return s
}

func (s *service) readyStatus(t *testing.T) int {
	t.Helper()
	resp, err := http.Get(s.httpURL + "/readyz")
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	return resp.StatusCode
}

func (s *service) check(method, path string, headers map[string]string) (*authv3.CheckResponse, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return s.client.Check(ctx, &authv3.CheckRequest{Attributes: &authv3.AttributeContext{Request: &authv3.AttributeContext_Request{
		Http: &authv3.AttributeContext_HttpRequest{Method: method, Path: path, Headers: headers},
	}}})
}

func describe(resp *authv3.CheckResponse, err error) string {
	if err != nil {
		return fmt.Sprintf("err=%v", err)
	}
	if dr := resp.GetDeniedResponse(); dr != nil {
		return fmt.Sprintf("deny %d %s", dr.GetStatus().GetCode(), dr.GetBody())
	}
	return fmt.Sprintf("allow %v", resp.GetOkResponse().GetHeaders())
}

// A first load that fails leaves the pod not ready, so no valid key is denied through a ready endpoint.
func TestNCR8FirstLoadFailsKeepsPodNotReady(t *testing.T) {
	s := startService(t, map[string]string{"PG_DSN": unreachableDSN, "GATED_PATHS": "/api/knn-search", "RELOAD_INTERVAL": "1h"})
	if got := s.readyStatus(t); got != http.StatusServiceUnavailable {
		t.Fatalf("/readyz = %d after a failed first load, want 503", got)
	}
}

func TestGatedPathsCommaList(t *testing.T) {
	s := startService(t, map[string]string{"PG_DSN": unreachableDSN, "GATED_PATHS": "/api/a,/api/b", "RELOAD_INTERVAL": "1h"})
	for _, p := range []string{"/api/a", "/api/b/x", "/api/c"} {
		resp, err := s.check("POST", p, nil)
		denied := err == nil && resp.GetDeniedResponse().GetStatus().GetCode() == 401
		if denied != (p != "/api/c") {
			t.Errorf("%s: %s", p, describe(resp, err))
		}
	}
}
