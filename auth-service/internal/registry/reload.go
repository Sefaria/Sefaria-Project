package registry

import (
	"context"
	"errors"
	"sync"
	"time"
)

// Reloader serializes a complete load-and-replace operation. Without holding
// the lock across both steps, a slow older load can overwrite a newer snapshot.
type Reloader struct {
	mu      sync.Mutex
	load    func(context.Context) ([]Key, error)
	replace func([]Key) error
}

func NewReloader(load func(context.Context) ([]Key, error), replace func([]Key) error) *Reloader {
	return &Reloader{load: load, replace: replace}
}

func (r *Reloader) Reload(ctx context.Context) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	keys, err := r.load(ctx)
	if err != nil {
		return err
	}
	return r.replace(keys)
}

// PeriodicReload runs reload every interval. It is the revocation backstop when LISTEN/NOTIFY is down;
// the reload callback owns loading, guarded replacement and error handling.
func PeriodicReload(ctx context.Context, every time.Duration, reload func(context.Context) error, onErr func(error)) {
	t := time.NewTicker(every)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			if err := reload(ctx); err != nil {
				if errors.Is(err, ErrEmptyReload) {
					onErr(ErrEmptyReload)
					continue
				}
				onErr(err)
			}
		}
	}
}
