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
	if _, ok := r.Lookup("zzz"); ok {
		t.Fatal("unexpected hit")
	}
	if r.Version() != 1 {
		t.Fatalf("version=%d", r.Version())
	}
}

func TestEmptyReloadGuard(t *testing.T) {
	r := New()
	if err := r.ReplaceGuarded(nil); !errors.Is(err, ErrEmptyReload) || r.Settled() {
		t.Fatalf("first empty into a fresh registry must be pending, not settled: err=%v", err)
	}
	if err := r.ReplaceGuarded(nil); err != nil || !r.Settled() {
		t.Fatalf("second consecutive empty must confirm and settle: err=%v", err)
	}
	r.Replace([]Key{{Key: "a"}})
	if err := r.ReplaceGuarded([]Key{}); !errors.Is(err, ErrEmptyReload) || r.Len() != 1 {
		t.Fatalf("first empty err=%v len=%d", err, r.Len())
	}
	if err := r.ReplaceGuarded([]Key{}); err != nil || r.Len() != 0 {
		t.Fatalf("second consecutive empty err=%v len=%d", err, r.Len())
	}
	if err := r.ReplaceGuarded([]Key{}); err != nil || r.Len() != 0 {
		t.Fatalf("empty into empty err=%v len=%d", err, r.Len())
	}
	r.Replace([]Key{{Key: "b"}})
	if err := r.ReplaceGuarded(nil); !errors.Is(err, ErrEmptyReload) {
		t.Fatalf("first empty after non-empty err=%v", err)
	}
	r.ResetEmptyReloadGuard()
	if err := r.ReplaceGuarded(nil); !errors.Is(err, ErrEmptyReload) || r.Len() != 1 {
		t.Fatalf("empty after reset err=%v len=%d", err, r.Len())
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

func TestSettledAfterFirstNonEmptyLoad(t *testing.T) {
	r := New()
	if r.Settled() {
		t.Fatal("fresh registry must not be settled")
	}
	if err := r.ReplaceGuarded([]Key{{Key: "a"}}); err != nil || !r.Settled() {
		t.Fatalf("non-empty load must settle: err=%v", err)
	}
}

func TestSettledOnlyAfterConfirmedEmptyAndMovesTimestamp(t *testing.T) {
	r := New()
	c := &fakeClock{t: time.Unix(1000, 0)}
	r.now = c.now
	r.SetEmptyReloadGap(time.Minute)
	if err := r.ReplaceGuarded(nil); !errors.Is(err, ErrEmptyReload) || r.Settled() || r.Version() != 0 {
		t.Fatalf("first empty: err=%v settled=%v version=%d", err, r.Settled(), r.Version())
	}
	c.advance(10 * time.Second)
	if err := r.ReplaceGuarded(nil); !errors.Is(err, ErrEmptyReload) || r.Settled() {
		t.Fatalf("empty within gap must stay pending: err=%v settled=%v", err, r.Settled())
	}
	c.advance(time.Minute)
	if err := r.ReplaceGuarded(nil); err != nil || !r.Settled() || r.Version() != 1 || !r.LoadedAt().Equal(c.t) {
		t.Fatalf("confirmed empty: err=%v settled=%v version=%d", err, r.Settled(), r.Version())
	}
}
