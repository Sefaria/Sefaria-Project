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

// A malformed origins value skips only that key: it is unknown (denied) and the rest of the load still succeeds.
func TestLoadAllSkipsNonArrayOrigins(t *testing.T) {
	db, _ := freshSchema(t)
	exec(t, db, `INSERT INTO powered_by_project(id) VALUES (1)`)
	exec(t, db, `INSERT INTO powered_by_apikey(key,project_id,label,allowed_origins) VALUES
		('sfr_bad00000000000000000000000000001',1,'Bad','"https://x.example.org"'),
		('sfr_good0000000000000000000000000001',1,'Good','["https://ok.example.org"]')`)
	keys, err := LoadAll(context.Background(), db)
	if err != nil {
		t.Fatal(err)
	}
	r := New()
	r.Replace(keys)
	if _, ok := r.Lookup("sfr_bad00000000000000000000000000001"); ok {
		t.Fatal("the malformed key must be unknown")
	}
	if g, ok := r.Lookup("sfr_good0000000000000000000000000001"); !ok || len(g.AllowedOrigins) != 1 {
		t.Fatalf("the good key must still load: %+v", g)
	}
}

// Keys of a soft-deleted project are still loaded, marked revoked, so they are denied.
func TestLoadAllMarksDeletedProjectKeysRevoked(t *testing.T) {
	db, _ := freshSchema(t)
	exec(t, db, `INSERT INTO powered_by_project(id,deleted_at) VALUES (1,NULL), (2,now())`)
	exec(t, db, `INSERT INTO powered_by_apikey(key,project_id,label) VALUES
		('sfr_live0000000000000000000000000001',1,'Live'),
		('sfr_gone0000000000000000000000000001',2,'Gone')`)
	keys, err := LoadAll(context.Background(), db)
	if err != nil {
		t.Fatal(err)
	}
	if len(keys) != 2 {
		t.Fatalf("want both keys loaded, got %+v", keys)
	}
	r := New()
	r.Replace(keys)
	if live, ok := r.Lookup("sfr_live0000000000000000000000000001"); !ok || live.Revoked {
		t.Fatalf("live key: %+v", live)
	}
	if gone, ok := r.Lookup("sfr_gone0000000000000000000000000001"); !ok || !gone.Revoked {
		t.Fatalf("deleted project's key must load as revoked: %+v", gone)
	}
}

// Deleting the only keyed project must not look like an empty load: the reload applies at once and the key is revoked.
func TestDeletingTheOnlyKeyedProjectRevokesItImmediately(t *testing.T) {
	db, _ := freshSchema(t)
	exec(t, db, `INSERT INTO powered_by_project(id) VALUES (1)`)
	exec(t, db, `INSERT INTO powered_by_apikey(key,project_id,label) VALUES ('sfr_only0000000000000000000000000001',1,'Only')`)
	r := New()
	keys, err := LoadAll(context.Background(), db)
	if err != nil {
		t.Fatal(err)
	}
	if err := r.ReplaceGuarded(keys); err != nil {
		t.Fatal(err)
	}
	if k, _ := r.Lookup("sfr_only0000000000000000000000000001"); k.Revoked {
		t.Fatalf("key must start live: %+v", k)
	}

	exec(t, db, `UPDATE powered_by_project SET deleted_at = now() WHERE id = 1`)
	keys, err = LoadAll(context.Background(), db)
	if err != nil {
		t.Fatal(err)
	}
	if len(keys) != 1 {
		t.Fatalf("the reload must not be empty, got %+v", keys)
	}
	if err := r.ReplaceGuarded(keys); err != nil {
		t.Fatalf("the reload must apply immediately: %v", err)
	}
	if k, ok := r.Lookup("sfr_only0000000000000000000000000001"); !ok || !k.Revoked {
		t.Fatalf("key must now be revoked: %+v", k)
	}
}
