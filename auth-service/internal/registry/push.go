package registry

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/redis/go-redis/v9"
)

func HTTPApplyHandler(apply func(ChangeEvent) error) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		if req.Method != http.MethodPost {
			http.Error(w, "POST only", http.StatusMethodNotAllowed)
			return
		}
		var ev ChangeEvent
		if err := json.NewDecoder(io.LimitReader(req.Body, 1<<16)).Decode(&ev); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if err := apply(ev); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})
}

func SubscribeRedis(ctx context.Context, addr, password, channel string, apply func(ChangeEvent) error, onErr func(error)) {
	for ctx.Err() == nil {
		client := redis.NewClient(&redis.Options{Addr: addr, Password: password})
		sub := client.Subscribe(ctx, channel)
		ch := sub.Channel()
	recv:
		for {
			select {
			case <-ctx.Done():
				_ = sub.Close()
				_ = client.Close()
				return
			case msg, ok := <-ch:
				if !ok {
					break recv
				}
				var ev ChangeEvent
				if err := json.Unmarshal([]byte(msg.Payload), &ev); err != nil {
					onErr(err)
					continue
				}
				if err := apply(ev); err != nil {
					onErr(err)
				}
			}
		}
		_ = sub.Close()
		_ = client.Close()
		onErr(fmt.Errorf("redis subscription lost; reconnecting"))
		time.Sleep(time.Second)
	}
}

func PeriodicReload(ctx context.Context, every time.Duration, load func(context.Context) ([]Key, error), replace func([]Key) error, onErr func(error)) {
	t := time.NewTicker(every)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			keys, err := load(ctx)
			if err != nil {
				onErr(err)
				continue
			}
			if err := replace(keys); err != nil {
				if errors.Is(err, ErrEmptyReload) {
					onErr(ErrEmptyReload)
					continue
				}
				onErr(err)
			}
		}
	}
}

type Publisher interface {
	Publish(ctx context.Context, ev ChangeEvent) error
}

type redisPublisher struct {
	c       *redis.Client
	channel string
}

func NewRedisPublisher(addr, password, channel string) Publisher {
	return &redisPublisher{c: redis.NewClient(&redis.Options{Addr: addr, Password: password}), channel: channel}
}

func (p *redisPublisher) Publish(ctx context.Context, ev ChangeEvent) error {
	b, _ := json.Marshal(ev)
	return p.c.Publish(ctx, p.channel, b).Err()
}

type httpPublisher struct {
	urls []string
}

func NewHTTPPublisher(urls []string) Publisher {
	return &httpPublisher{urls: urls}
}

func (p *httpPublisher) Publish(ctx context.Context, ev ChangeEvent) error {
	b, _ := json.Marshal(ev)
	client := &http.Client{Timeout: 2 * time.Second}
	for _, u := range p.urls {
		req, _ := http.NewRequestWithContext(ctx, http.MethodPost, u, bytes.NewReader(b))
		req.Header.Set("Content-Type", "application/json")
		resp, err := client.Do(req)
		if err != nil {
			return fmt.Errorf("push %s: %w", u, err)
		}
		resp.Body.Close()
		if resp.StatusCode >= 300 {
			return fmt.Errorf("push %s: status %d", u, resp.StatusCode)
		}
	}
	return nil
}

type multiPublisher []Publisher

func (m multiPublisher) Publish(ctx context.Context, ev ChangeEvent) error {
	var firstErr error
	for _, p := range m {
		if err := p.Publish(ctx, ev); err != nil && firstErr == nil {
			firstErr = err
		}
	}
	return firstErr
}

func NewMultiPublisher(ps ...Publisher) Publisher {
	return multiPublisher(ps)
}
