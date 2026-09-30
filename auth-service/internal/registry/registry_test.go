package registry

import (
	"errors"
	"sync"
	"testing"
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
	if _, ok := r.Lookup("zzz"); ok {
		t.Fatal("unexpected hit")
	}
	if r.Version() != 1 {
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
		go func() { defer wg.Done(); _ = r.ReplaceGuarded([]Key{{Key: "c"}}) }()
	}
	wg.Wait()
}
