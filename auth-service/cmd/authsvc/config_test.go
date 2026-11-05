//go:build knowngaps

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

// Desired behaviour that the service does not have yet. Run with: go test -tags knowngaps -run KnownGap ./...

func TestKnownGapNA10GatedPathsTrimmed(t *testing.T) {
	s := startService(t, map[string]string{"PG_DSN": unreachableDSN, "GATED_PATHS": "/api/a, /api/b", "RELOAD_INTERVAL": "1h"})
	for _, p := range []string{"/api/a", "/api/b"} {
		t.Run("@known-gap N-A10 "+p, func(t *testing.T) {
			resp, err := s.check("POST", p, nil)
			if err != nil || resp.GetDeniedResponse().GetStatus().GetCode() != 401 {
				t.Fatalf("want 401 api_key_required, got %s", describe(resp, err))
			}
		})
	}
}

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

// A pod that starts against an empty key table must either stay not ready or answer UNAVAILABLE, so that a valid
// key is never denied because the registry is empty.
func TestKnownGapNCR8EmptyTableAtStart(t *testing.T) {
	s := startService(t, map[string]string{"PG_DSN": emptySchemaDSN(t), "GATED_PATHS": "/api/knn-search", "RELOAD_INTERVAL": "1h"})
	t.Run("@known-gap N-CR8 empty start is not ready or UNAVAILABLE", func(t *testing.T) {
		ready := s.readyStatus(t)
		resp, err := s.check("POST", "/api/knn-search", map[string]string{"x-api-key": "sfr_valid_elsewhere_0000000000000001"})
		if ready == http.StatusOK && status.Code(err) != codes.Unavailable {
			t.Fatalf("/readyz=%d and Check answered %s", ready, describe(resp, err))
		}
	})
}
