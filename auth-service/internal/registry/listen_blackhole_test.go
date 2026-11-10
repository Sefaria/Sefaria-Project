package registry

import (
	"context"
	"net"
	"testing"
	"time"
)

// A peer that accepts the TCP connection and never answers must not strand the listener: the connect is bounded by
// OpTimeout, so the listener reports the error and retries. Needs no Postgres.
func TestListenerConnectBoundedOnBlackHole(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()
	go func() {
		for {
			c, err := ln.Accept()
			if err != nil {
				return
			}
			defer c.Close() // held open, never read from or written to
		}
	}()
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	errs := make(chan error, 4)
	go func() {
		defer close(done)
		ListenPostgres(ctx, ListenConfig{
			DSN:        "postgres://u:p@" + ln.Addr().String() + "/db?sslmode=disable",
			Channel:    "c",
			MinBackoff: 10 * time.Millisecond, MaxBackoff: 20 * time.Millisecond, WaitTimeout: time.Second,
			OpTimeout:     200 * time.Millisecond,
			OnEstablished: func(context.Context) { t.Error("must not establish against a black hole") },
			OnNotify:      func(Notice) {},
			OnErr:         func(err error) { errs <- err },
		})
	}()
	select {
	case <-errs:
	case <-time.After(3 * time.Second):
		t.Fatal("listener still stuck connecting after 3s with a 200ms OpTimeout")
	}
	cancel()
	select {
	case <-done:
	case <-time.After(3 * time.Second):
		t.Fatal("listener did not stop after cancel")
	}
}
