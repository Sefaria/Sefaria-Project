package main

import (
	"database/sql"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"testing"
	"time"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// emptySchemaDSN creates the registry tables, empty, in a private schema on PG_TEST_DSN and returns a DSN pinned to it.
func emptySchemaDSN(t *testing.T) string {
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
	schema := fmt.Sprintf("authsvc_empty_%d", time.Now().UnixNano())
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
	if _, err := sdb.Exec(string(ddl)); err != nil {
		t.Fatal(err)
	}
	return u.String()
}

// A pod that starts against an empty key table must stay not ready, so that a valid key is never denied because the
// registry is empty (Envoy fails open while the pod is not ready).
func TestNCR8EmptyTableAtStart(t *testing.T) {
	s := startService(t, map[string]string{"PG_DSN": emptySchemaDSN(t), "GATED_PATHS": "/api/knn-search", "RELOAD_INTERVAL": "1h"})
	ready := s.readyStatus(t)
	resp, err := s.check("POST", "/api/knn-search", map[string]string{"x-api-key": "sfr_valid_elsewhere_0000000000000001"})
	if ready == http.StatusOK && status.Code(err) != codes.Unavailable {
		t.Fatalf("/readyz=%d and Check answered %s", ready, describe(resp, err))
	}
	if ready != http.StatusServiceUnavailable {
		t.Fatalf("/readyz=%d on an empty first load, want 503", ready)
	}
}

// A genuinely empty registry (a fresh environment) still comes up once a second empty load confirms it.
func TestEmptyStartBecomesReadyAfterConfirmedEmpty(t *testing.T) {
	s := startService(t, map[string]string{"PG_DSN": emptySchemaDSN(t), "GATED_PATHS": "/api/knn-search", "RELOAD_INTERVAL": "2s"})
	// No not-ready assertion here: the confirming reload runs on a real timer, so one made after startup would race
	// it. "Not ready until confirmed" is asserted without a race by TestNCR8EmptyTableAtStart (1h interval, so no
	// confirming reload can arrive during the test) and by the registry's fake-clock tests.
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		if s.readyStatus(t) == http.StatusOK {
			return
		}
		time.Sleep(100 * time.Millisecond)
	}
	t.Fatal("/readyz never became 200 within 5s after a confirming empty reload")
}
