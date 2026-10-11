package registry

import (
	"errors"
	"sync"
	"sync/atomic"
	"time"
)

type Key struct {
	ID             string   `json:"id"`
	Key            string   `json:"key"`
	ProjectID      string   `json:"project_id"`
	Label          string   `json:"label"`
	Tier           string   `json:"tier"`
	AllowedOrigins []string `json:"allowed_origins"`
	Revoked        bool     `json:"revoked"`
}

var ErrEmptyReload = errors.New("registry: refusing to replace a non-empty key set with an empty one")

type snapshot struct {
	byKey map[string]Key
}

type Registry struct {
	snap         atomic.Pointer[snapshot]
	writeMu      sync.Mutex
	pendingEmpty bool
	firstEmptyAt time.Time
	minGap       time.Duration
	now          func() time.Time
	version      atomic.Uint64
	loadedAt     atomic.Int64
}

func New() *Registry {
	r := &Registry{now: time.Now}
	r.snap.Store(&snapshot{byKey: map[string]Key{}})
	return r
}

// SetEmptyReloadGap sets the minimum time between the first empty load and the empty load that
// confirms it. Two empties closer together than this (a NOTIFY reload and a periodic reload) are
// treated as one observation. Zero means any second consecutive empty confirms.
func (r *Registry) SetEmptyReloadGap(d time.Duration) {
	r.writeMu.Lock()
	r.minGap = d
	r.writeMu.Unlock()
}

func build(keys []Key) *snapshot {
	s := &snapshot{byKey: make(map[string]Key, len(keys))}
	for _, k := range keys {
		s.byKey[k.Key] = k
	}
	return s
}

func (r *Registry) Replace(keys []Key) {
	r.writeMu.Lock()
	defer r.writeMu.Unlock()
	r.pendingEmpty = false
	r.replaceLocked(keys)
}

func (r *Registry) replaceLocked(keys []Key) {
	r.snap.Store(build(keys))
	r.loadedAt.Store(r.now().UnixNano())
	r.version.Add(1)
}

func (r *Registry) ReplaceGuarded(keys []Key) error {
	r.writeMu.Lock()
	defer r.writeMu.Unlock()
	if len(keys) > 0 || r.Len() == 0 {
		r.pendingEmpty = false
	} else if !r.pendingEmpty {
		r.pendingEmpty = true
		r.firstEmptyAt = r.now()
		return ErrEmptyReload
	} else if r.now().Sub(r.firstEmptyAt) < r.minGap {
		return ErrEmptyReload
	} else {
		r.pendingEmpty = false
	}
	r.replaceLocked(keys)
	return nil
}

// ResetEmptyReloadGuard clears a pending first empty result after a failed load.
func (r *Registry) ResetEmptyReloadGuard() {
	r.writeMu.Lock()
	r.pendingEmpty = false
	r.writeMu.Unlock()
}

func (r *Registry) Lookup(key string) (Key, bool) {
	k, ok := r.snap.Load().byKey[key]
	return k, ok
}

func (r *Registry) Len() int {
	return len(r.snap.Load().byKey)
}

func (r *Registry) Version() uint64 {
	return r.version.Load()
}

func (r *Registry) LoadedAt() time.Time {
	return time.Unix(0, r.loadedAt.Load())
}
