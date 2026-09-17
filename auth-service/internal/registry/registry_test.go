package registry

import (
	"errors"
	"sync"
	"testing"
	"time"
)

func TestReplaceAndLookup(t *testing.T) {
	r := New()
	r.Replace([]Key{{ID: "a-id", Key: "a", ProjectID: "p1", Tier: "developer"}, {ID: "b-id", Key: "b", ProjectID: "p2", Tier: "partner"}})
	if r.Len() != 2 {
		t.Fatalf("len=%d", r.Len())
	}
	if k, ok := r.Lookup("b"); !ok || k.ProjectID != "p2" {
		t.Fatalf("lookup b: %v %v", k, ok)
	}
	if k, ok := r.LookupID("a-id"); !ok || k.Key != "a" {
		t.Fatalf("lookup id: %v %v", k, ok)
	}
	if _, ok := r.Lookup("zzz"); ok {
		t.Fatal("unexpected hit")
	}
	if r.Version() != 1 {
		t.Fatalf("version=%d", r.Version())
	}
}

func TestApplyUpsertDelete(t *testing.T) {
	r := New()
	r.Replace([]Key{{ID: "a-id", Key: "a", ProjectID: "p1", Tier: "developer"}})
	if err := r.Apply(ChangeEvent{Op: "upsert", Key: Key{ID: "a-id", Key: "a", ProjectID: "p1", Tier: "developer", Revoked: true}, TS: time.Now()}); err != nil {
		t.Fatal(err)
	}
	if k, _ := r.Lookup("a"); !k.Revoked {
		t.Fatal("upsert did not overwrite")
	}
	if err := r.Apply(ChangeEvent{Op: "delete", Key: Key{ID: "a-id", Key: "a"}}); err != nil {
		t.Fatal(err)
	}
	if _, ok := r.Lookup("a"); ok {
		t.Fatal("delete did not remove")
	}
	if _, ok := r.LookupID("a-id"); ok {
		t.Fatal("delete did not remove id index")
	}
	if err := r.Apply(ChangeEvent{Op: "bogus"}); err == nil {
		t.Fatal("expected error for bogus op")
	}
	if r.Version() != 3 {
		t.Fatalf("version=%d", r.Version())
	}
}

func TestEmptyReloadRejected(t *testing.T) {
	r := New()
	if err := r.ReplaceGuarded(nil); err != nil {
		t.Fatalf("empty into empty must be allowed: %v", err)
	}
	r.Replace([]Key{{Key: "a"}})
	if err := r.ReplaceGuarded([]Key{}); !errors.Is(err, ErrEmptyReload) || r.Len() != 1 {
		t.Fatalf("err=%v len=%d", err, r.Len())
	}
}

func TestConcurrentReadersDuringReplace(t *testing.T) {
	r := New()
	r.Replace([]Key{{Key: "a"}})
	var wg sync.WaitGroup
	for i := 0; i < 200; i++ {
		wg.Add(3)
		go func() { defer wg.Done(); r.Lookup("a") }()
		go func() { defer wg.Done(); r.Replace([]Key{{Key: "a"}, {Key: "b"}}) }()
		go func() { defer wg.Done(); _ = r.Apply(ChangeEvent{Op: "upsert", Key: Key{Key: "c"}}) }()
	}
	wg.Wait()
}
