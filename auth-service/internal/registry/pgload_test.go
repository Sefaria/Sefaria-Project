package registry

import (
	"context"
	"database/sql"
	"os"
	"testing"

	_ "github.com/jackc/pgx/v5/stdlib"
)

func TestLoadAll(t *testing.T) {
	dsn := os.Getenv("PG_TEST_DSN")
	if dsn == "" {
		t.Skip("PG_TEST_DSN not set; run: docker run -d --name pgtest -e POSTGRES_PASSWORD=pw -p 5433:5432 postgres:16-alpine")
	}
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	ctx := context.Background()
	schema, _ := os.ReadFile("schema.sql")
	for _, q := range []string{"DROP TABLE IF EXISTS api_keys", "DROP TABLE IF EXISTS projects", string(schema),
		`INSERT INTO projects VALUES ('proj_alpha','Alpha','developer','{}'), ('proj_beta','Beta','partner','{https://beta.example.org}')`,
		`INSERT INTO api_keys(key,project_id) VALUES ('sfr_alpha000000000000000000000000001','proj_alpha'), ('sfr_beta0000000000000000000000000001','proj_beta')`,
		`INSERT INTO api_keys(key,project_id,revoked_at) VALUES ('sfr_revoked00000000000000000000001','proj_alpha',now())`} {
		if _, err := db.ExecContext(ctx, q); err != nil {
			t.Fatalf("%s: %v", q, err)
		}
	}
	keys, err := LoadAll(ctx, db)
	if err != nil {
		t.Fatal(err)
	}
	if len(keys) != 3 {
		t.Fatalf("want 3 keys, got %d", len(keys))
	}
	r := New()
	r.Replace(keys)
	b, _ := r.Lookup("sfr_beta0000000000000000000000000001")
	if b.Tier != "partner" || len(b.AllowedOrigins) != 1 || b.AllowedOrigins[0] != "https://beta.example.org" || b.ID == "" {
		t.Fatalf("beta: %+v", b)
	}
	if rv, _ := r.Lookup("sfr_revoked00000000000000000000001"); !rv.Revoked {
		t.Fatal("revoked flag not loaded")
	}
	if k := NewKey(); len(k) != 36 || k[:4] != "sfr_" {
		t.Fatalf("key format: %q", k)
	}
}
