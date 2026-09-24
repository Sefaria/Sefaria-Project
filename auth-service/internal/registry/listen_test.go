package registry

import (
	"context"
	"database/sql"
	"os"
	"testing"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
)

// freshSchema drops and recreates the registry schema (tables, trigger function, triggers) on PG_TEST_DSN.
func freshSchema(t *testing.T) (*sql.DB, string) {
	t.Helper()
	dsn := os.Getenv("PG_TEST_DSN")
	if dsn == "" {
		t.Skip("PG_TEST_DSN not set")
	}
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	schema, err := os.ReadFile("schema.sql")
	if err != nil {
		t.Fatal(err)
	}
	for _, q := range []string{"DROP TABLE IF EXISTS api_keys", "DROP TABLE IF EXISTS projects", string(schema)} {
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

// Any writer's plain SQL change (no keyadmin push) reaches the listener, with a payload that never carries the key.
func TestListenDeliversPlainSQLChanges(t *testing.T) {
	db, dsn := freshSchema(t)
	notices, established := startListener(t, dsn, "authsvc-listener-test1")
	wait(t, established, 5*time.Second, "LISTEN established")

	exec(t, db, `INSERT INTO projects(id,name,tier) VALUES ('p1','p1','developer')`)
	exec(t, db, `INSERT INTO api_keys(key,project_id) VALUES ('sfr_listen0000000000000000000000001','p1')`)
	if n := wait(t, notices, time.Second, "api_keys INSERT"); n.Table != "api_keys" || n.Op != "INSERT" || n.Age < 0 || n.Age > time.Second {
		t.Fatalf("insert notice: %+v", n)
	}
	exec(t, db, `UPDATE projects SET tier='partner' WHERE id='p1'`)
	if n := wait(t, notices, time.Second, "projects tier UPDATE"); n.Table != "projects" || n.Op != "UPDATE" {
		t.Fatalf("tier notice: %+v", n)
	}
	exec(t, db, `UPDATE api_keys SET revoked_at=now() WHERE project_id='p1'`)
	if n := wait(t, notices, time.Second, "revoke UPDATE"); n.Table != "api_keys" || n.Op != "UPDATE" {
		t.Fatalf("revoke notice: %+v", n)
	}
}

// Notifications are lost while disconnected, so every reconnect must re-run LISTEN and the caller's full reload.
func TestListenReconnectsAndReestablishes(t *testing.T) {
	db, dsn := freshSchema(t)
	notices, established := startListener(t, dsn, "authsvc-listener-test2")
	wait(t, established, 5*time.Second, "first LISTEN")

	exec(t, db, `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name = 'authsvc-listener-test2'`)
	wait(t, established, 5*time.Second, "LISTEN re-established after the backend was terminated")

	exec(t, db, `INSERT INTO projects(id,name) VALUES ('p2','p2')`)
	exec(t, db, `INSERT INTO api_keys(key,project_id) VALUES ('sfr_listen0000000000000000000000002','p2')`)
	wait(t, notices, time.Second, "notice on the new connection")
}

// last_used_at is bookkeeping that may be written per request; it must never take the cluster-wide NOTIFY commit lock.
func TestListenIgnoresLastUsedAt(t *testing.T) {
	db, dsn := freshSchema(t)
	exec(t, db, `INSERT INTO projects(id,name) VALUES ('p3','p3')`)
	exec(t, db, `INSERT INTO api_keys(key,project_id) VALUES ('sfr_listen0000000000000000000000003','p3')`)
	notices, established := startListener(t, dsn, "authsvc-listener-test3")
	wait(t, established, 5*time.Second, "LISTEN established")

	exec(t, db, `UPDATE api_keys SET last_used_at=now()`)
	select {
	case n := <-notices:
		t.Fatalf("last_used_at update notified: %+v", n)
	case <-time.After(500 * time.Millisecond):
	}
}
