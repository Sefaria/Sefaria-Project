package registry

import (
	"context"
	"sync"
	"time"
)

// Reloader serializes a complete load-and-replace operation. Without holding
// the lock across both steps, a slow older load can overwrite a newer snapshot.
type Reloader struct {
	mu      sync.Mutex
	load    func(context.Context) ([]Key, error)
	replace func([]Key) error
	onErr   func()
}

// ReloaderOption configures a Reloader.
type ReloaderOption func(*Reloader)

// WithLoadErrorHook runs fn, under the Reloader lock, after every failed load. The service uses it to
// reset the registry's pending-empty guard so two empty results separated by an error never confirm.
func WithLoadErrorHook(fn func()) ReloaderOption {
	return func(r *Reloader) { r.onErr = fn }
}

func NewReloader(load func(context.Context) ([]Key, error), replace func([]Key) error, opts ...ReloaderOption) *Reloader {
	r := &Reloader{load: load, replace: replace}
	for _, o := range opts {
		o(r)
	}
	return r
}

func (r *Reloader) Reload(ctx context.Context) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	keys, err := r.load(ctx)
	if err != nil {
		if r.onErr != nil {
			r.onErr()
		}
		return err
	}
	return r.replace(keys)
}

// PeriodicReload runs reload every interval. It is the revocation backstop when LISTEN/NOTIFY is down;
// the reload callback owns loading, guarded replacement and error handling.
func PeriodicReload(ctx context.Context, every time.Duration, reload func(context.Context) error, onErr func(error)) {
	t := time.NewTicker(every)
	defer t.Stop()
	periodicReload(ctx, t.C, reload, onErr)
}

func periodicReload(ctx context.Context, tick <-chan time.Time, reload func(context.Context) error, onErr func(error)) {
	for {
		select {
		case <-ctx.Done():
			return
		case <-tick:
			if err := reload(ctx); err != nil {
				onErr(err)
			}
		}
	}
}
