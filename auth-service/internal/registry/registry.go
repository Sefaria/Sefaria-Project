package registry

import (
	"errors"
	"fmt"
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

type ChangeEvent struct {
	Op  string    `json:"op"`
	Key Key       `json:"key"`
	TS  time.Time `json:"ts"`
}

type snapshot struct {
	byKey map[string]Key
	byID  map[string]Key
}

type Registry struct {
	snap     atomic.Pointer[snapshot]
	writeMu  sync.Mutex
	version  atomic.Uint64
	loadedAt atomic.Int64
}

func New() *Registry {
	r := &Registry{}
	r.snap.Store(&snapshot{byKey: map[string]Key{}, byID: map[string]Key{}})
	return r
}

func build(keys []Key) *snapshot {
	s := &snapshot{byKey: make(map[string]Key, len(keys)), byID: make(map[string]Key, len(keys))}
	for _, k := range keys {
		s.byKey[k.Key] = k
		if k.ID != "" {
			s.byID[k.ID] = k
		}
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

func (r *Registry) Apply(ev ChangeEvent) error {
	if ev.Op != "upsert" && ev.Op != "delete" {
		return fmt.Errorf("registry: unknown op %q", ev.Op)
	}
	r.writeMu.Lock()
	defer r.writeMu.Unlock()
	old := r.snap.Load()
	next := &snapshot{byKey: make(map[string]Key, len(old.byKey)+1), byID: make(map[string]Key, len(old.byID)+1)}
	for k, v := range old.byKey {
		next.byKey[k] = v
	}
	for k, v := range old.byID {
		next.byID[k] = v
	}
	switch ev.Op {
	case "upsert":
		next.byKey[ev.Key.Key] = ev.Key
		if ev.Key.ID != "" {
			next.byID[ev.Key.ID] = ev.Key
		}
	case "delete":
		if prev, ok := next.byKey[ev.Key.Key]; ok {
			delete(next.byID, prev.ID)
		}
		delete(next.byKey, ev.Key.Key)
		if ev.Key.ID != "" {
			delete(next.byID, ev.Key.ID)
		}
	}
	r.snap.Store(next)
	r.version.Add(1)
	return nil
}

func (r *Registry) Lookup(key string) (Key, bool) {
	k, ok := r.snap.Load().byKey[key]
	return k, ok
}

func (r *Registry) LookupID(id string) (Key, bool) {
	k, ok := r.snap.Load().byID[id]
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
