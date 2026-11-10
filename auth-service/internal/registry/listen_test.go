package registry

import (
	"context"
	"database/sql"
	"os"
	"testing"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
)

// freshSchema drops and recreates the registry test fixture (tables, trigger function, triggers) on PG_TEST_DSN.
func freshSchema(t *testing.T) (*sql.DB, string) {
	t.Helper()
	dsn := os.Getenv("PG_TEST_DSN")
	if dsn == "" {
		t.Skip("PG_TEST_DSN not set; run: docker run -d --name pgtest -e POSTGRES_PASSWORD=pw -p 5433:5432 postgres:16-alpine")
	}
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	schema, err := os.ReadFile("testdata/schema.sql")
	if err != nil {
		t.Fatal(err)
	}
	for _, q := range []string{"DROP TABLE IF EXISTS powered_by_apikey, api_project, api_tier_meter_limit, api_tier, powered_by_project", string(schema)} {
		if _, err := db.Exec(q); err != nil {
			t.Fatalf("%s: %v", q, err)
		}
	}
	return db, dsn
}

// startListener runs ListenPostgres until the test ends and returns its notices and established signals.
func startListener(t *testing.T, dsn, app string) (<-chan Notice, <-chan struct{}) {
	t.Helper()
	notices := make(chan Notice, 16)
	established := make(chan struct{}, 4)
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	t.Cleanup(func() { cancel(); <-done })
	go func() {
		defer close(done)
		ListenPostgres(ctx, ListenConfig{
			DSN: dsn, Channel: "sefaria_apikeys", AppName: app,
			MinBackoff: 50 * time.Millisecond, MaxBackoff: 200 * time.Millisecond, WaitTimeout: time.Second,
			OnEstablished: func(context.Context) { established <- struct{}{} },
			OnNotify:      func(n Notice) { notices <- n },
			OnErr:         func(err error) { t.Logf("listener: %v", err) },
		})
	}()
	return notices, established
}

func wait[T any](t *testing.T, ch <-chan T, d time.Duration, what string) T {
	t.Helper()
	select {
	case v := <-ch:
		return v
	case <-time.After(d):
		t.Fatalf("timed out after %s waiting for %s", d, what)
	}
	var zero T
	return zero
}

func exec(t *testing.T, db *sql.DB, q string) {
	t.Helper()
	if _, err := db.Exec(q); err != nil {
		t.Fatalf("%s: %v", q, err)
	}
}

// Any writer's plain SQL change reaches the listener, with a payload that never carries the key.
func TestListenDeliversPlainSQLChanges(t *testing.T) {
	db, dsn := freshSchema(t)
	notices, established := startListener(t, dsn, "authsvc-listener-test1")
	wait(t, established, 5*time.Second, "LISTEN established")

	exec(t, db, `INSERT INTO powered_by_project(id) VALUES (1)`)
	exec(t, db, `INSERT INTO api_project(id,profile_id) VALUES (1,1)`)
	exec(t, db, `INSERT INTO powered_by_apikey(key,project_id,label) VALUES ('sfr_listen0000000000000000000000001',1,'k')`)
	if n := wait(t, notices, time.Second, "key INSERT"); n.Table != "powered_by_apikey" || n.Op != "INSERT" || n.Age < 0 || n.Age > time.Second {
		t.Fatalf("insert notice: %+v", n)
	}
	exec(t, db, `UPDATE api_project SET tier_id='partner' WHERE id=1`)
	if n := wait(t, notices, time.Second, "api project tier UPDATE"); n.Table != "api_project" || n.Op != "UPDATE" {
		t.Fatalf("tier notice: %+v", n)
	}
	exec(t, db, `UPDATE api_tier SET per_minute_per_project=120 WHERE id='partner'`)
	if n := wait(t, notices, time.Second, "api tier UPDATE"); n.Table != "api_tier" || n.Op != "UPDATE" {
		t.Fatalf("tier limit notice: %+v", n)
	}
	exec(t, db, `INSERT INTO api_tier_meter_limit(tier_id,meter,monthly_per_project) VALUES ('partner','semantic',1000)`)
	if n := wait(t, notices, time.Second, "meter limit INSERT"); n.Table != "api_tier_meter_limit" || n.Op != "INSERT" {
		t.Fatalf("meter limit notice: %+v", n)
	}
	exec(t, db, `UPDATE powered_by_apikey SET allowed_origins='["https://a.example.org"]' WHERE project_id=1`)
	if n := wait(t, notices, time.Second, "origins UPDATE"); n.Table != "powered_by_apikey" || n.Op != "UPDATE" {
		t.Fatalf("origins notice: %+v", n)
	}
	exec(t, db, `UPDATE powered_by_apikey SET revoked_at=now() WHERE project_id=1`)
	if n := wait(t, notices, time.Second, "revoke UPDATE"); n.Table != "powered_by_apikey" || n.Op != "UPDATE" {
		t.Fatalf("revoke notice: %+v", n)
	}
	exec(t, db, `DELETE FROM powered_by_apikey`)
	exec(t, db, `DELETE FROM api_project`)
	exec(t, db, `DELETE FROM powered_by_project`)
	for _, table := range []string{"powered_by_apikey", "api_project", "powered_by_project"} {
		if n := wait(t, notices, time.Second, table+" DELETE"); n.Table != table || n.Op != "DELETE" {
			t.Fatalf("delete notice: %+v", n)
		}
	}
}

// Notifications are lost while disconnected, so every reconnect must re-run LISTEN and the caller's full reload.
func TestListenReconnectsAndReestablishes(t *testing.T) {
	db, dsn := freshSchema(t)
	notices, established := startListener(t, dsn, "authsvc-listener-test2")
	wait(t, established, 5*time.Second, "first LISTEN")

	exec(t, db, `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name = 'authsvc-listener-test2'`)
	wait(t, established, 5*time.Second, "LISTEN re-established after the backend was terminated")

	exec(t, db, `INSERT INTO powered_by_project(id) VALUES (2)`)
	exec(t, db, `INSERT INTO api_project(id,profile_id) VALUES (2,2)`)
	exec(t, db, `INSERT INTO powered_by_apikey(key,project_id,label) VALUES ('sfr_listen0000000000000000000000002',2,'k')`)
	wait(t, notices, time.Second, "notice on the new connection")
}

// Bookkeeping writes (last_used_at, a Django save() that rewrites every column unchanged, other project columns)
// must never take the cluster-wide NOTIFY commit lock.
func TestListenIgnoresBookkeepingWrites(t *testing.T) {
	db, dsn := freshSchema(t)
	exec(t, db, `INSERT INTO powered_by_project(id,project_name) VALUES (3,'p3')`)
	exec(t, db, `INSERT INTO api_project(id,profile_id) VALUES (3,3)`)
	exec(t, db, `INSERT INTO powered_by_apikey(key,project_id,label,allowed_origins) VALUES ('sfr_listen0000000000000000000000003',3,'k','["https://a.example.org"]')`)
	notices, established := startListener(t, dsn, "authsvc-listener-test3")
	wait(t, established, 5*time.Second, "LISTEN established")

	exec(t, db, `UPDATE powered_by_apikey SET last_used_at=now()`)
	exec(t, db, `UPDATE powered_by_apikey SET key=key, project_id=project_id, label=label, allowed_origins=allowed_origins, revoked_at=revoked_at, created_at=created_at`)
	exec(t, db, `UPDATE powered_by_project SET project_name='renamed', tier=tier`)
	exec(t, db, `UPDATE api_project SET tier_id=tier_id, deleted_at=deleted_at, updated_at=now()`)
	select {
	case n := <-notices:
		t.Fatalf("bookkeeping write notified: %+v", n)
	case <-time.After(500 * time.Millisecond):
	}
}
