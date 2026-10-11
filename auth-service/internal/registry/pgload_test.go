package registry

import (
	"context"
	"testing"
)

func TestLoadAll(t *testing.T) {
	db, _ := freshSchema(t)
	exec(t, db, `INSERT INTO powered_by_project(id,project_name,tier) VALUES (1,'Alpha','developer'), (2,'Beta','partner')`)
	exec(t, db, `INSERT INTO powered_by_apikey(key,project_id,label,allowed_origins) VALUES
		('sfr_alpha000000000000000000000000001',1,'Default key','[]'),
		('sfr_beta0000000000000000000000000001',2,'Web','["https://beta.example.org","https://www.beta.example.org"]'),
		('sfr_beta0000000000000000000000000002',2,'Server',DEFAULT)`)
	exec(t, db, `INSERT INTO powered_by_apikey(key,project_id,label,revoked_at) VALUES ('sfr_revoked00000000000000000000001',1,'Old',now())`)

	keys, err := LoadAll(context.Background(), db)
	if err != nil {
		t.Fatal(err)
	}
	if len(keys) != 4 {
		t.Fatalf("want 4 keys, got %d", len(keys))
	}
	r := New()
	r.Replace(keys)
	web, _ := r.Lookup("sfr_beta0000000000000000000000000001")
	if web.Tier != "partner" || web.ProjectID != "2" || web.Label != "Web" || web.ID == "" ||
		len(web.AllowedOrigins) != 2 || web.AllowedOrigins[0] != "https://beta.example.org" || web.AllowedOrigins[1] != "https://www.beta.example.org" {
		t.Fatalf("beta web key: %+v", web)
	}
	if srv, _ := r.Lookup("sfr_beta0000000000000000000000000002"); srv.AllowedOrigins == nil || len(srv.AllowedOrigins) != 0 || srv.Tier != "partner" {
		t.Fatalf("origins are per key; beta server key: %+v", srv)
	}
	if rv, _ := r.Lookup("sfr_revoked00000000000000000000001"); !rv.Revoked || rv.ProjectID != "1" {
		t.Fatalf("revoked key: %+v", rv)
	}
}

// A malformed origins value fails the whole load, so the caller keeps its last good set instead of dropping a restriction.
func TestLoadAllRejectsNonArrayOrigins(t *testing.T) {
	db, _ := freshSchema(t)
	exec(t, db, `INSERT INTO powered_by_project(id) VALUES (1)`)
	exec(t, db, `INSERT INTO powered_by_apikey(key,project_id,label,allowed_origins) VALUES ('sfr_bad00000000000000000000000000001',1,'Bad','"https://x.example.org"')`)
	if _, err := LoadAll(context.Background(), db); err == nil {
		t.Fatal("want an error for a non-array allowed_origins")
	}
}
