package registry

import (
	"context"
	"testing"
)

func TestLoadAll(t *testing.T) {
	db, _ := freshSchema(t)
	exec(t, db, `INSERT INTO powered_by_project(id,project_name) VALUES (1,'Alpha'), (2,'Beta')`)
	exec(t, db, `INSERT INTO api_project(id,profile_id,tier_id) VALUES (1,1,'developer'), (2,2,'partner')`)
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
	exec(t, db, `INSERT INTO api_project(id,profile_id) VALUES (1,1)`)
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

// Keys of a soft-deleted API project are still loaded, marked revoked, so they are denied.
func TestLoadMarksDeletedProjectKeysRevoked(t *testing.T) {
	db, _ := freshSchema(t)
	exec(t, db, `INSERT INTO powered_by_project(id) VALUES (1), (2)`)
	exec(t, db, `INSERT INTO api_project(id,profile_id,deleted_at) VALUES (1,1,NULL), (2,2,now())`)
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
	exec(t, db, `INSERT INTO api_project(id,profile_id) VALUES (1,1)`)
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

	exec(t, db, `UPDATE api_project SET deleted_at = now() WHERE id = 1`)
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

// The key's tier comes from api_project and its limits from api_tier and api_tier_meter_limit, joined per project.
func TestLoadJoinsApiProjectAndTier(t *testing.T) {
	db, _ := freshSchema(t)
	exec(t, db, `INSERT INTO powered_by_project(id) VALUES (1), (2)`)
	exec(t, db, `UPDATE api_tier SET per_minute_per_project=60 WHERE id='developer'`)
	exec(t, db, `UPDATE api_tier SET per_minute_per_project=300 WHERE id='partner'`)
	exec(t, db, `INSERT INTO api_tier_meter_limit(tier_id,meter,monthly_per_project) VALUES
		('developer','semantic',1000), ('partner','semantic',50000)`)
	exec(t, db, `INSERT INTO api_project(id,profile_id,tier_id) VALUES (1,1,'developer'), (2,2,'partner')`)
	exec(t, db, `INSERT INTO powered_by_apikey(key,project_id,label) VALUES
		('sfr_dev00000000000000000000000000001',1,'Dev'),
		('sfr_par00000000000000000000000000001',2,'Partner')`)
	keys, err := LoadAll(context.Background(), db)
	if err != nil {
		t.Fatal(err)
	}
	r := New()
	r.Replace(keys)
	dev, _ := r.Lookup("sfr_dev00000000000000000000000000001")
	if dev.ProjectID != "1" || dev.Tier != "developer" || dev.PerMinute != 60 || dev.MonthlyLimits["semantic"] != 1000 {
		t.Fatalf("developer key: %+v", dev)
	}
	par, _ := r.Lookup("sfr_par00000000000000000000000000001")
	if par.ProjectID != "2" || par.Tier != "partner" || par.PerMinute != 300 || par.MonthlyLimits["semantic"] != 50000 {
		t.Fatalf("partner key: %+v", par)
	}
}

// An old image still writes powered_by_project.tier; the tier that counts is the one on the API project.
func TestLoadIgnoresLegacyTierColumn(t *testing.T) {
	db, _ := freshSchema(t)
	exec(t, db, `INSERT INTO powered_by_project(id,tier) VALUES (1,'partner')`)
	exec(t, db, `INSERT INTO api_project(id,profile_id,tier_id) VALUES (1,1,'developer')`)
	exec(t, db, `INSERT INTO powered_by_apikey(key,project_id,label) VALUES ('sfr_legacy000000000000000000000000001',1,'Legacy')`)
	keys, err := LoadAll(context.Background(), db)
	if err != nil {
		t.Fatal(err)
	}
	if len(keys) != 1 || keys[0].Tier != "developer" {
		t.Fatalf("legacy tier column must be ignored, got %+v", keys)
	}
}
