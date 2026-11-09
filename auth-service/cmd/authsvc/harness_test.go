package main

import (
	"context"
	"database/sql"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"strconv"
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

const reloadTSSeries = "authsvc_registry_last_reload_success_timestamp_seconds"

// seededSchemaDSN creates the registry tables in a private schema on PG_TEST_DSN, seeds one project and one key,
// and returns a DSN pinned to that schema.
func seededSchemaDSN(t *testing.T) string {
	t.Helper()
	base := os.Getenv("PG_TEST_DSN")
	if base == "" {
		t.Skip("PG_TEST_DSN not set")
	}
	db, err := sql.Open("pgx", base)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	schema := fmt.Sprintf("authsvc_reload_%d", time.Now().UnixNano())
	if _, err := db.Exec("CREATE SCHEMA " + schema); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = db.Exec("DROP SCHEMA " + schema + " CASCADE") })
	u, err := url.Parse(base)
	if err != nil {
		t.Fatal(err)
	}
	q := u.Query()
	q.Set("search_path", schema)
	u.RawQuery = q.Encode()
	ddl, err := os.ReadFile("../../internal/registry/testdata/schema.sql")
	if err != nil {
		t.Fatal(err)
	}
	sdb, err := sql.Open("pgx", u.String())
	if err != nil {
		t.Fatal(err)
	}
	defer sdb.Close()
	seed := []string{
		string(ddl),
		`INSERT INTO powered_by_project(id) VALUES (1)`,
		`INSERT INTO api_project(id,profile_id,tier_id) VALUES (1,1,'developer')`,
		`INSERT INTO powered_by_apikey(key,project_id,label) VALUES ('sfr_reload00000000000000000000000001',1,'Seed')`,
	}
	for _, q := range seed {
		if _, err := sdb.Exec(q); err != nil {
			t.Fatalf("%s: %v", q, err)
		}
	}
	return u.String()
}

// schemaDB opens a handle on a DSN returned by seededSchemaDSN, for changes made while the service runs.
func schemaDB(t *testing.T, dsn string) *sql.DB {
	t.Helper()
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}

// metric returns one /metrics series (name plus labels) as a number, or 0 when the series is not exposed.
func (s *service) metric(t *testing.T, series string) float64 {
	t.Helper()
	return s.metrics(t, series)[0]
}

// metrics reads several series from one /metrics scrape, so the values form a single snapshot.
func (s *service) metrics(t *testing.T, series ...string) []float64 {
	t.Helper()
	resp, err := http.Get(s.httpURL + "/metrics")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatal(err)
	}
	out := make([]float64, len(series))
	for _, line := range strings.Split(string(body), "\n") {
		for i, name := range series {
			if rest, ok := strings.CutPrefix(line, name+" "); ok {
				v, err := strconv.ParseFloat(strings.TrimSpace(rest), 64)
				if err != nil {
					t.Fatalf("%s: %v", line, err)
				}
				out[i] = v
			}
		}
	}
	return out
}

func (s *service) waitMetricAtLeast(t *testing.T, series string, min float64, d time.Duration) {
	t.Helper()
	deadline := time.Now().Add(d)
	for s.metric(t, series) < min {
		if time.Now().After(deadline) {
			t.Fatalf("%s did not reach %v within %s", series, min, d)
		}
		time.Sleep(25 * time.Millisecond)
	}
}

func TestReloadTimestampSetOnSuccess(t *testing.T) {
	s := startService(t, map[string]string{"PG_DSN": seededSchemaDSN(t), "GATED_PATHS": "/api/knn-search", "RELOAD_INTERVAL": "1h"})
	ts := s.metric(t, reloadTSSeries)
	if ts == 0 {
		t.Fatal("reload timestamp is absent or 0 after a successful initial load")
	}
	if d := time.Since(time.Unix(0, int64(ts*1e9))); d < -5*time.Second || d > 5*time.Second {
		t.Fatalf("reload timestamp is %s from now, want within 5s", d)
	}
}

// A failed reload must not move the timestamp: the rename makes every later load fail, and it waits for any load
// already running, so no successful reload can land after it returns.
func TestReloadTimestampUnchangedOnError(t *testing.T) {
	dsn := seededSchemaDSN(t)
	s := startService(t, map[string]string{"PG_DSN": dsn, "GATED_PATHS": "/api/knn-search", "RELOAD_INTERVAL": "200ms"})
	db := schemaDB(t, dsn)
	exec := func(q string) {
		t.Helper()
		if _, err := db.Exec(q); err != nil {
			t.Fatalf("%s: %v", q, err)
		}
	}
	exec("ALTER TABLE powered_by_apikey RENAME TO powered_by_apikey_off")
	t.Cleanup(func() { _, _ = db.Exec("ALTER TABLE powered_by_apikey_off RENAME TO powered_by_apikey") })
	// The first failed reload may race with a successful one already in flight, so take the baseline only after
	// a failure has been observed; every later load fails too.
	const errSeries = `authsvc_reload_total{result="error"}`
	s.waitMetricAtLeast(t, errSeries, 1, 5*time.Second)
	snap := s.metrics(t, errSeries, reloadTSSeries)
	before := snap[1]
	if before == 0 {
		t.Fatal("reload timestamp is absent or 0 after a successful initial load")
	}
	s.waitMetricAtLeast(t, errSeries, snap[0]+1, 5*time.Second)
	if after := s.metric(t, reloadTSSeries); after != before {
		t.Fatalf("reload timestamp moved on a failed reload: %v -> %v", before, after)
	}
}

// An empty table is a rejected reload on its first observation. The confirming empty load comes one interval
// later, so with a 4s interval the timestamp is read while the empty result is still pending.
func TestReloadTimestampUnchangedOnRejectedEmpty(t *testing.T) {
	dsn := seededSchemaDSN(t)
	s := startService(t, map[string]string{"PG_DSN": dsn, "GATED_PATHS": "/api/knn-search", "RELOAD_INTERVAL": "4s"})
	db := schemaDB(t, dsn)
	if _, err := db.Exec("DELETE FROM powered_by_apikey"); err != nil {
		t.Fatal(err)
	}
	before := s.metric(t, reloadTSSeries)
	if before == 0 {
		t.Fatal("reload timestamp is absent or 0 after a successful initial load")
	}
	// Read the counter and the timestamp from one scrape each poll, so the assertion is on a single snapshot
	// taken within ~25ms of the first rejection, far from the confirming empty load one interval later.
	const rejSeries = `authsvc_reload_total{result="rejected_empty"}`
	deadline := time.Now().Add(10 * time.Second)
	for {
		snap := s.metrics(t, rejSeries, reloadTSSeries)
		if snap[0] >= 1 {
			if snap[1] != before {
				t.Fatalf("reload timestamp moved on a rejected empty reload: %v -> %v", before, snap[1])
			}
			return
		}
		if time.Now().After(deadline) {
			t.Fatalf("%s did not reach 1 within 10s", rejSeries)
		}
		time.Sleep(25 * time.Millisecond)
	}
}
