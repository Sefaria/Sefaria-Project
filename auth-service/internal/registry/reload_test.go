package registry

import (
	"context"
	"errors"
	"fmt"
	"runtime"
	"sync/atomic"
	"testing"
	"time"
)

type fakeClock struct{ t time.Time }

func (c *fakeClock) now() time.Time          { return c.t }
func (c *fakeClock) advance(d time.Duration) { c.t = c.t.Add(d) }

func newGuarded(gap time.Duration) (*Registry, *fakeClock) {
	r := New()
	c := &fakeClock{t: time.Unix(1000, 0)}
	r.now = c.now
	r.SetEmptyReloadGap(gap)
	r.Replace([]Key{{Key: "keep"}})
	return r, c
}

func TestEmptyReloadWithinGapStaysRejected(t *testing.T) {
	r, c := newGuarded(time.Minute)
	for i := 0; i < 3; i++ {
		if err := r.ReplaceGuarded(nil); !errors.Is(err, ErrEmptyReload) {
			t.Fatalf("empty #%d: err=%v", i, err)
		}
		c.advance(10 * time.Second)
	}
	if r.Len() != 1 {
		t.Fatalf("set was wiped: len=%d", r.Len())
	}
}

func TestEmptyReloadAfterGapIsApplied(t *testing.T) {
	r, c := newGuarded(time.Minute)
	if err := r.ReplaceGuarded(nil); !errors.Is(err, ErrEmptyReload) {
		t.Fatalf("first empty: %v", err)
	}
	c.advance(time.Minute)
	if err := r.ReplaceGuarded(nil); err != nil || r.Len() != 0 {
		t.Fatalf("confirming empty: err=%v len=%d", err, r.Len())
	}
}

func TestReloaderErrorBetweenEmptiesResetsGuard(t *testing.T) {
	r, c := newGuarded(time.Minute)
	var step atomic.Int32
	loadErr := errors.New("db down")
	reloader := NewReloader(func(context.Context) ([]Key, error) {
		if step.Add(1) == 2 {
			r.ResetEmptyReloadGuard()
			return nil, loadErr
		}
		return nil, nil
	}, r.ReplaceGuarded)
	ctx := context.Background()
	if err := reloader.Reload(ctx); !errors.Is(err, ErrEmptyReload) {
		t.Fatalf("first empty: %v", err)
	}
	c.advance(time.Hour)
	if err := reloader.Reload(ctx); !errors.Is(err, loadErr) {
		t.Fatalf("error load: %v", err)
	}
	c.advance(time.Hour)
	// Pending state was reset, so this empty is a first empty again, even though the gap has passed.
	if err := reloader.Reload(ctx); !errors.Is(err, ErrEmptyReload) || r.Len() != 1 {
		t.Fatalf("empty after error: err=%v len=%d", err, r.Len())
	}
	c.advance(time.Minute)
	if err := reloader.Reload(ctx); err != nil || r.Len() != 0 {
		t.Fatalf("confirming empty: err=%v len=%d", err, r.Len())
	}
}

func TestPeriodicReloadGuardsEmpty(t *testing.T) {
	r, c := newGuarded(time.Minute)
	tick := make(chan time.Time)
	results := make(chan error)
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		defer close(done)
		periodicReload(ctx, tick, func(context.Context) error {
			return r.ReplaceGuarded(nil)
		}, func(err error) { results <- err })
	}()
	tick <- time.Now()
	if err := <-results; !errors.Is(err, ErrEmptyReload) {
		t.Fatalf("first tick: %v", err)
	}
	c.advance(time.Minute)
	tick <- time.Now()
	// A successful reload reports no error; the next tick proves the loop finished the previous one.
	tick <- time.Now()
	cancel()
	<-done
	if r.Len() != 0 {
		t.Fatalf("confirmed empty was not applied: len=%d", r.Len())
	}
}

func TestReloaderSerializesLoads(t *testing.T) {
	r := New()
	var calls, inflight atomic.Int32
	var overlap atomic.Bool
	firstStarted := make(chan struct{})
	secondCalling := make(chan struct{})
	releaseFirst := make(chan struct{})
	reloader := NewReloader(func(context.Context) ([]Key, error) {
		n := calls.Add(1)
		if inflight.Add(1) > 1 {
			overlap.Store(true)
		}
		defer inflight.Add(-1)
		switch n {
		case 1:
			close(firstStarted)
			<-releaseFirst
			return []Key{{Key: "first"}}, nil
		case 2:
			return []Key{{Key: "second"}}, nil
		default:
			return nil, fmt.Errorf("unexpected load call %d", n)
		}
	}, func(keys []Key) error {
		r.Replace(keys)
		return nil
	})

	firstDone := make(chan error, 1)
	secondDone := make(chan error, 1)
	go func() { firstDone <- reloader.Reload(context.Background()) }()
	<-firstStarted
	go func() {
		close(secondCalling)
		secondDone <- reloader.Reload(context.Background())
	}()
	<-secondCalling
	for i := 0; i < 200; i++ {
		runtime.Gosched()
	}
	close(releaseFirst)
	if err := <-firstDone; err != nil {
		t.Fatal(err)
	}
	if err := <-secondDone; err != nil {
		t.Fatal(err)
	}
	if overlap.Load() {
		t.Fatal("second load ran while the first load was in flight")
	}
	if _, ok := r.Lookup("second"); !ok || r.Len() != 1 {
		t.Fatalf("final registry did not contain second load: len=%d", r.Len())
	}
}
