package registry

import (
	"context"
	"time"
)

// Coalescer turns change notifications into full reloads: a burst within the settle window costs one reload, and a
// notification that arrives while a reload runs causes one more reload afterwards (it is never dropped).
type Coalescer struct {
	settle time.Duration
	reload func()
	pend   chan struct{}
}

func NewCoalescer(settle time.Duration, reload func()) *Coalescer {
	return &Coalescer{settle: settle, reload: reload, pend: make(chan struct{}, 1)}
}

// Signal marks a reload as pending; it never blocks.
func (c *Coalescer) Signal() {
	select {
	case c.pend <- struct{}{}:
	default:
	}
}

func (c *Coalescer) Run(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case <-c.pend:
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(c.settle):
		}
		// Take whatever arrived during the settle window; anything signalled from here on reloads again.
		select {
		case <-c.pend:
		default:
		}
		c.reload()
	}
}
