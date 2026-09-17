package mint

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

type state string

const (
	stateNext     state = "next"
	stateCurrent  state = "current"
	stateRetiring state = "retiring"
)

type keyEntry struct {
	kid   string
	priv  *ecdsa.PrivateKey
	state state
}

type Minter struct {
	mu       sync.RWMutex
	issuer   string
	audience string
	keys     []*keyEntry
}

type Opts struct {
	Sub, Tier, Kid string
	TTL            time.Duration
	Bad            string
}

func b64(b []byte) string {
	return base64.RawURLEncoding.EncodeToString(b)
}

func coords(pub *ecdsa.PublicKey) (x, y string) {
	raw, err := pub.Bytes()
	if err != nil || len(raw) != 65 {
		panic("mint: unexpected public key encoding")
	}
	return b64(raw[1:33]), b64(raw[33:65])
}

func Thumbprint(pub *ecdsa.PublicKey) string {
	x, y := coords(pub)
	canon := fmt.Sprintf(`{"crv":"P-256","kty":"EC","x":"%s","y":"%s"}`, x, y)
	sum := sha256.Sum256([]byte(canon))
	return b64(sum[:])
}

func newEntry(st state) (*keyEntry, error) {
	priv, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return nil, err
	}
	return &keyEntry{kid: Thumbprint(&priv.PublicKey), priv: priv, state: st}, nil
}

func New(issuer, audience string) (*Minter, error) {
	cur, err := newEntry(stateCurrent)
	if err != nil {
		return nil, err
	}
	return &Minter{issuer: issuer, audience: audience, keys: []*keyEntry{cur}}, nil
}

func (m *Minter) find(pred func(*keyEntry) bool) *keyEntry {
	for _, k := range m.keys {
		if pred(k) {
			return k
		}
	}
	return nil
}

func (m *Minter) Sign(o Opts) (string, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	var k *keyEntry
	if o.Kid == "" {
		k = m.find(func(e *keyEntry) bool { return e.state == stateCurrent })
	} else {
		k = m.find(func(e *keyEntry) bool { return e.kid == o.Kid })
	}
	if k == nil {
		return "", fmt.Errorf("mint: no key for kid %q", o.Kid)
	}
	now := time.Now()
	exp := now.Add(o.TTL)
	if o.Bad == "expired" {
		exp = now.Add(-time.Minute)
		now = now.Add(-2 * time.Minute)
	}
	jti := make([]byte, 16)
	_, _ = rand.Read(jti)
	claims := jwt.MapClaims{
		"iss": m.issuer, "aud": m.audience, "sub": o.Sub, "tier": o.Tier,
		"jti": hex.EncodeToString(jti), "iat": now.Unix(), "exp": exp.Unix(),
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodES256, claims)
	tok.Header["kid"] = k.kid
	signer := k.priv
	if o.Bad == "sig" {
		signer, _ = ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	}
	return tok.SignedString(signer)
}

func (m *Minter) JWKS() []byte {
	m.mu.RLock()
	defer m.mu.RUnlock()
	keys := make([]map[string]string, 0, len(m.keys))
	for _, k := range m.keys {
		x, y := coords(&k.priv.PublicKey)
		keys = append(keys, map[string]string{"kty": "EC", "crv": "P-256", "use": "sig", "alg": "ES256", "kid": k.kid, "x": x, "y": y})
	}
	out, _ := json.Marshal(map[string]any{"keys": keys})
	return out
}

func (m *Minter) Next() (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.find(func(e *keyEntry) bool { return e.state == stateNext }) != nil {
		return "", fmt.Errorf("mint: a next key already exists; promote it first")
	}
	e, err := newEntry(stateNext)
	if err != nil {
		return "", err
	}
	m.keys = append(m.keys, e)
	return e.kid, nil
}

func (m *Minter) Promote() (string, string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	next := m.find(func(e *keyEntry) bool { return e.state == stateNext })
	if next == nil {
		return "", "", fmt.Errorf("mint: nothing to promote")
	}
	kept := m.keys[:0]
	for _, k := range m.keys {
		if k.state != stateRetiring {
			kept = append(kept, k)
		}
	}
	m.keys = kept
	var retiring string
	if cur := m.find(func(e *keyEntry) bool { return e.state == stateCurrent }); cur != nil {
		cur.state = stateRetiring
		retiring = cur.kid
	}
	next.state = stateCurrent
	return next.kid, retiring, nil
}

func (m *Minter) Retire() (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for i, k := range m.keys {
		if k.state == stateRetiring {
			m.keys = append(m.keys[:i], m.keys[i+1:]...)
			return k.kid, nil
		}
	}
	return "", fmt.Errorf("mint: nothing retiring")
}

func (m *Minter) Kids() map[string]string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := map[string]string{}
	for _, k := range m.keys {
		out[k.kid] = string(k.state)
	}
	return out
}
