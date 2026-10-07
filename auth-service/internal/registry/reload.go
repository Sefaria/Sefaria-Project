package registry

import (
	"context"
	"errors"
	"time"
)

// PeriodicReload replaces the in-memory set from load every interval. It is the revocation backstop when
// LISTEN/NOTIFY is down: a load error or an empty result keeps the current set.
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
