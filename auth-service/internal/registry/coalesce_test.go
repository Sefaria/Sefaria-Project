package registry

import (
	"context"
	"sync/atomic"
	"testing"
	"time"
)

// A burst of notifications inside the settle window costs one full reload, not one per notification.
func TestCoalescerMergesBurst(t *testing.T) {
	var reloads atomic.Int32
	c := NewCoalescer(50*time.Millisecond, func() { reloads.Add(1) })
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go c.Run(ctx)
	for i := 0; i < 20; i++ {
		c.Signal()
	}
	time.Sleep(300 * time.Millisecond)
	if n := reloads.Load(); n != 1 {
		t.Fatalf("want 1 reload for a burst, got %d", n)
	}
}

// A change committed while a reload is running must cause another reload, not wait for the periodic one.
func TestCoalescerReloadsAgainForSignalDuringReload(t *testing.T) {
	var reloads atomic.Int32
	started := make(chan struct{}, 4)
	release := make(chan struct{})
	c := NewCoalescer(10*time.Millisecond, func() {
		reloads.Add(1)
		started <- struct{}{}
		<-release
	})
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go c.Run(ctx)
	c.Signal()
	select {
	case <-started:
	case <-time.After(time.Second):
		t.Fatal("first signal never reloaded")
	}
	c.Signal() // arrives mid-reload
	close(release)
	select {
	case <-started:
	case <-time.After(time.Second):
		t.Fatalf("signal during reload was dropped (reloads=%d)", reloads.Load())
	}
}
