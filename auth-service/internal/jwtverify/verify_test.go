package jwtverify

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/Sefaria/Sefaria-Project/auth-service/internal/mint"
)

func TestVerify(t *testing.T) {
	m, _ := mint.New("https://iss", "aud")
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write(m.JWKS())
	}))
	defer srv.Close()

	v, err := New(context.Background(), srv.URL, "https://iss", "aud")
	if err != nil {
		t.Fatal(err)
	}
	good, _ := m.Sign(mint.Opts{Sub: "web", Tier: "firstparty", TTL: time.Hour})
	c, err := v.Verify(good)
	if err != nil || c.Sub != "web" || c.Tier != "firstparty" {
		t.Fatalf("c=%+v err=%v", c, err)
	}
	for _, bad := range []string{"expired", "sig"} {
		tok, _ := m.Sign(mint.Opts{Sub: "web", Tier: "firstparty", TTL: time.Hour, Bad: bad})
		if _, err := v.Verify(tok); err == nil {
			t.Fatalf("%s accepted", bad)
		}
	}
	if _, err := v.Verify("garbage"); err == nil {
		t.Fatal("garbage accepted")
	}
	next, _ := m.Next()
	tok, _ := m.Sign(mint.Opts{Sub: "web", Tier: "firstparty", TTL: time.Hour, Kid: next})
	if _, err := v.Verify(tok); err != nil {
		t.Fatalf("keyfunc must refetch on unknown kid: %v", err)
	}
}
