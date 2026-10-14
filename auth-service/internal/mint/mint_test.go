package mint

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/MicahParks/keyfunc/v3"
	"github.com/golang-jwt/jwt/v5"
)

const iss, aud = "https://mint-authpoc.default.svc.cluster.local", "sefaria-api"

func jwksServer(m *Minter) *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(m.JWKS())
	}))
}

func verify(t *testing.T, url, tok string) (*jwt.Token, error) {
	k, err := keyfunc.NewDefaultCtx(context.Background(), []string{url})
	if err != nil {
		t.Fatal(err)
	}
	return jwt.Parse(tok, k.Keyfunc, jwt.WithValidMethods([]string{"ES256"}), jwt.WithIssuer(iss), jwt.WithAudience(aud))
}

func TestSignAndVerifyES256(t *testing.T) {
	m, err := New(iss, aud)
	if err != nil {
		t.Fatal(err)
	}
	srv := jwksServer(m)
	defer srv.Close()
	tok, err := m.Sign(Opts{Sub: "sefaria-web", Tier: "firstparty", TTL: time.Hour})
	if err != nil {
		t.Fatal(err)
	}
	parsed, err := verify(t, srv.URL, tok)
	if err != nil || !parsed.Valid {
		t.Fatalf("valid token rejected: %v", err)
	}
	claims := parsed.Claims.(jwt.MapClaims)
	kid, _ := parsed.Header["kid"].(string)
	if claims["tier"] != "firstparty" || claims["jti"] == "" || parsed.Header["alg"] != "ES256" || len(kid) != 43 {
		t.Fatalf("claims=%v header=%v", claims, parsed.Header)
	}
}

func TestBadTokensFail(t *testing.T) {
	m, _ := New(iss, aud)
	srv := jwksServer(m)
	defer srv.Close()
	for _, bad := range []string{"expired", "sig"} {
		tok, _ := m.Sign(Opts{Sub: "x", Tier: "firstparty", TTL: time.Hour, Bad: bad})
		if _, err := verify(t, srv.URL, tok); err == nil {
			t.Fatalf("%s token accepted", bad)
		}
	}
}

func TestRotationStates(t *testing.T) {
	m, _ := New(iss, aud)
	var doc struct{ Keys []map[string]string }
	next, err := m.Next()
	if err != nil {
		t.Fatal(err)
	}
	_ = json.Unmarshal(m.JWKS(), &doc)
	if len(doc.Keys) != 2 || m.Kids()[next] != "next" {
		t.Fatalf("after Next: jwks=%s kids=%v", m.JWKS(), m.Kids())
	}
	if _, err := m.Sign(Opts{Sub: "x", TTL: time.Minute, Kid: next}); err != nil {
		t.Fatal("explicit kid=next must be signable (that is the failure window Task 20 measures)")
	}
	tok, _ := m.Sign(Opts{Sub: "x", TTL: time.Minute})
	if kid := kidOf(t, tok); m.Kids()[kid] != "current" {
		t.Fatalf("default Sign must use current, got %s=%s", kid, m.Kids()[kid])
	}
	cur, ret, err := m.Promote()
	if err != nil || cur != next || m.Kids()[ret] != "retiring" {
		t.Fatalf("promote: cur=%s ret=%s err=%v kids=%v", cur, ret, err, m.Kids())
	}
	if dropped, err := m.Retire(); err != nil || dropped != ret {
		t.Fatalf("retire: %s %v", dropped, err)
	}
	_ = json.Unmarshal(m.JWKS(), &doc)
	if len(doc.Keys) != 1 || doc.Keys[0]["kid"] != cur {
		t.Fatalf("after retire: %s", m.JWKS())
	}
	if _, err := m.Retire(); err == nil {
		t.Fatal("retire with nothing retiring must error")
	}
}

func kidOf(t *testing.T, tok string) string {
	p, _, err := new(jwt.Parser).ParseUnverified(tok, jwt.MapClaims{})
	if err != nil {
		t.Fatal(err)
	}
	return p.Header["kid"].(string)
}
