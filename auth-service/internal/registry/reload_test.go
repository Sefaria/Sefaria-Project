package registry

import (
	"context"
	"errors"
	"testing"
	"time"
)

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
