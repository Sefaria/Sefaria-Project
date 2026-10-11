package registry

import (
	"context"
	"errors"
	"fmt"
	"runtime"
	"slices"
	"strings"
	"sync"
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
			return nil, loadErr
		}
		return nil, nil
	}, r.ReplaceGuarded, WithLoadErrorHook(r.ResetEmptyReloadGuard))
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

// reloaderWaiters counts goroutines parked on a Mutex inside Reloader.Reload.
func reloaderWaiters() int {
	buf := make([]byte, 1<<20)
	buf = buf[:runtime.Stack(buf, true)]
	n := 0
	for _, g := range strings.Split(string(buf), "\n\n") {
		if strings.Contains(g, "(*Reloader).Reload") && strings.Contains(g, "sync.(*Mutex).Lock") {
			n++
		}
	}
	return n
}

func TestReloaderSerializesLoads(t *testing.T) {
	r := New()
	var mu sync.Mutex
	var events []string
	log := func(e string) {
		mu.Lock()
		events = append(events, e)
		mu.Unlock()
	}
	var calls atomic.Int32
	firstStarted := make(chan struct{})
	releaseFirst := make(chan struct{})
	reloader := NewReloader(func(context.Context) ([]Key, error) {
		switch n := calls.Add(1); n {
		case 1:
			log("first-start")
			close(firstStarted)
			<-releaseFirst
			log("first-end")
			return []Key{{Key: "first"}}, nil
		case 2:
			log("second-start")
			log("second-end")
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
	go func() { secondDone <- reloader.Reload(context.Background()) }()
	// Release the first load only once the second Reload is parked on the Reloader lock (or has
	// wrongly run past it, which the ordering assertion below catches).
	deadline := time.Now().Add(2 * time.Second)
	for reloaderWaiters() == 0 && calls.Load() < 2 {
		if time.Now().After(deadline) {
			t.Fatal("second Reload never reached the Reloader lock")
		}
		runtime.Gosched()
	}
	close(releaseFirst)
	for _, ch := range []chan error{firstDone, secondDone} {
		select {
		case err := <-ch:
			if err != nil {
				t.Fatal(err)
			}
		case <-time.After(2 * time.Second):
			t.Fatal("reload did not finish")
		}
	}
	want := []string{"first-start", "first-end", "second-start", "second-end"}
	mu.Lock()
	got := append([]string(nil), events...)
	mu.Unlock()
	if !slices.Equal(got, want) {
		t.Fatalf("load order = %v, want %v", got, want)
	}
	if _, ok := r.Lookup("second"); !ok || r.Len() != 1 {
		t.Fatalf("final registry did not contain second load: len=%d", r.Len())
	}
}
