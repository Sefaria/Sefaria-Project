package registry

import (
	"context"
	"errors"
	"fmt"
	"sync/atomic"
	"testing"
	"time"
)

func TestPeriodicReloadGuardsEmpty(t *testing.T) {
	r := New()
	r.Replace([]Key{{Key: "keep"}})
	calls, errs := 0, 0
	ctx, cancel := context.WithTimeout(context.Background(), 350*time.Millisecond)
	defer cancel()
	PeriodicReload(ctx, 100*time.Millisecond, func(context.Context) error {
		calls++
		return r.ReplaceGuarded([]Key{})
	}, func(err error) {
		if errors.Is(err, ErrEmptyReload) {
			errs++
		}
	})
	if calls < 2 || errs != 1 || r.Len() != 0 {
		t.Fatalf("calls=%d errs=%d len=%d", calls, errs, r.Len())
	}
}

func TestReloaderSerializesLoads(t *testing.T) {
	r := New()
	var calls atomic.Int32
	firstStarted := make(chan struct{})
	secondStarted := make(chan struct{})
	releaseFirst := make(chan struct{})
	reloader := NewReloader(func(context.Context) ([]Key, error) {
		switch calls.Add(1) {
		case 1:
			close(firstStarted)
			<-releaseFirst
			return []Key{{Key: "first"}}, nil
		case 2:
			close(secondStarted)
			return []Key{{Key: "second"}}, nil
		default:
			return nil, fmt.Errorf("unexpected load call %d", calls.Load())
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
	select {
	case <-secondStarted:
		t.Fatal("second load started before the first load and replace completed")
	case <-time.After(30 * time.Millisecond):
	}
	close(releaseFirst)
	if err := <-firstDone; err != nil {
		t.Fatal(err)
	}
	if err := <-secondDone; err != nil {
		t.Fatal(err)
	}
	if _, ok := r.Lookup("second"); !ok || r.Len() != 1 {
		t.Fatalf("final registry did not contain second load: len=%d", r.Len())
	}
}
