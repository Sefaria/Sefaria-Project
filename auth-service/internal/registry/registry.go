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

// ChangeEvent is keyadmin's redacted change log record. Running services never consume it: they
// reload the full set on NOTIFY.
type ChangeEvent struct {
	Op  string    `json:"op"`
	Key Key       `json:"key"`
	TS  time.Time `json:"ts"`
}

type snapshot struct {
	byKey map[string]Key
}

type Registry struct {
	snap     atomic.Pointer[snapshot]
	writeMu  sync.Mutex
	version  atomic.Uint64
	loadedAt atomic.Int64
}

func New() *Registry {
	r := &Registry{}
	r.snap.Store(&snapshot{byKey: map[string]Key{}})
	return r
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
	r.snap.Store(build(keys))
	r.loadedAt.Store(time.Now().UnixNano())
	r.version.Add(1)
}

func (r *Registry) ReplaceGuarded(keys []Key) error {
	if len(keys) == 0 && r.Len() > 0 {
		return ErrEmptyReload
	}
	r.Replace(keys)
	return nil
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
