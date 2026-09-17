package registry

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"
)

func TestHTTPApplyHandler(t *testing.T) {
	r := New()
	srv := httptest.NewServer(HTTPApplyHandler(r.Apply))
	defer srv.Close()
	ev := ChangeEvent{Op: "upsert", Key: Key{ID: "k1-id", Key: "k1", ProjectID: "p", Tier: "developer"}, TS: time.Now()}
	if err := NewHTTPPublisher([]string{srv.URL}).Publish(context.Background(), ev); err != nil {
		t.Fatal(err)
	}
	if _, ok := r.Lookup("k1"); !ok {
		t.Fatal("event not applied")
	}
	bad, _ := json.Marshal(ChangeEvent{Op: "nope"})
	resp, _ := http.Post(srv.URL, "application/json", bytes.NewReader(bad))
	if resp.StatusCode != 400 {
		t.Fatalf("bad op status %d", resp.StatusCode)
	}
}

func TestPeriodicReloadGuardsEmpty(t *testing.T) {
	r := New()
	r.Replace([]Key{{Key: "keep"}})
	calls, errs := 0, 0
	ctx, cancel := context.WithTimeout(context.Background(), 350*time.Millisecond)
	defer cancel()
	PeriodicReload(ctx, 100*time.Millisecond, func(context.Context) ([]Key, error) {
		calls++
		return []Key{}, nil
	}, r.ReplaceGuarded, func(err error) {
		if errors.Is(err, ErrEmptyReload) {
			errs++
		}
	})
	if calls < 2 || errs < 2 || r.Len() != 1 {
		t.Fatalf("calls=%d errs=%d len=%d", calls, errs, r.Len())
	}
}

func TestRedisRoundTrip(t *testing.T) {
	addr := os.Getenv("REDIS_TEST_ADDR")
	if addr == "" {
		t.Skip("REDIS_TEST_ADDR not set; run: docker run -d --name redistest -p 6380:6379 redis:7-alpine")
	}
	r := New()
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	go SubscribeRedis(ctx, addr, "", "sefaria.apikeys", r.Apply, func(err error) { t.Log(err) })
	time.Sleep(200 * time.Millisecond)
	if err := NewRedisPublisher(addr, "", "sefaria.apikeys").Publish(ctx, ChangeEvent{Op: "upsert", Key: Key{Key: "k2"}}); err != nil {
		t.Fatal(err)
	}
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if _, ok := r.Lookup("k2"); ok {
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatal("event never arrived over redis")
}
