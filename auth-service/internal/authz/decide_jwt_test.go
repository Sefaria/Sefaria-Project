package authz

import (
	"errors"
	"testing"

	"github.com/Sefaria/Sefaria-Project/auth-service/internal/jwtverify"
)

type fakeVerifier struct{ err error }

func (f fakeVerifier) Verify(string) (jwtverify.Claims, error) {
	if f.err != nil {
		return jwtverify.Claims{}, f.err
	}
	return jwtverify.Claims{Sub: "sefaria-web", Tier: "firstparty"}, nil
}

func TestDecideJWT(t *testing.T) {
	d := DecideJWT(fakeVerifier{}, "Bearer abc")
	if !d.Allow || d.Tier != "firstparty" || d.Project != "sefaria-web" || d.Result != "ok" {
		t.Fatalf("%+v", d)
	}
	d = DecideJWT(fakeVerifier{err: errors.New("expired")}, "Bearer abc")
	if !d.Allow || d.Tier != "anonymous" || d.Project != "" || d.Result != "jwt_invalid" {
		t.Fatalf("%+v", d)
	}
	d = DecideJWT(fakeVerifier{}, "")
	if !d.Allow || d.Tier != "anonymous" || d.Result != "jwt_missing" {
		t.Fatalf("%+v", d)
	}
}

func TestJWTAuthorizationPrefersBearerAndExtractsConfiguredCookie(t *testing.T) {
	if got := JWTAuthorization("Bearer header-token", "sefaria_jwt=cookie-token", "sefaria_jwt"); got != "Bearer header-token" {
		t.Fatalf("got %q", got)
	}
	if got := JWTAuthorization("", "other=x; custom_jwt=cookie-token; tail=y", "custom_jwt"); got != "Bearer cookie-token" {
		t.Fatalf("got %q", got)
	}
	if got := JWTAuthorization("", "other=x", "custom_jwt"); got != "" {
		t.Fatalf("got %q", got)
	}
}

// A gated path is settled before any bearer token is looked at, so a first-party token never opens a gated route.
func TestGatedPathDeniedBeforeBearerHandling(t *testing.T) {
	cfg := Config{Mode: ModeEnforce, GatedPaths: []string{"/api/knn-search"}}
	d := decideRequest(reg, Options{Cfg: cfg, Verifier: fakeVerifier{}}, Request{Path: "/api/knn-search", Authorization: "Bearer abc"})
	if d.Allow || d.Code != CodeKeyRequired {
		t.Fatalf("%+v", d)
	}
}

func TestDecideRequestSettlesBearerWithVerifier(t *testing.T) {
	cfg := Config{Mode: ModeEnforce}
	d := decideRequest(reg, Options{Cfg: cfg, Verifier: fakeVerifier{}}, Request{Path: "/api/texts/Genesis.1", Authorization: "Bearer abc"})
	if !d.Allow || d.Tier != TierFirstParty || d.Result != "ok" {
		t.Fatalf("verified: %+v", d)
	}
	d = decideRequest(reg, Options{Cfg: cfg}, Request{Path: "/api/texts/Genesis.1", Authorization: "Bearer abc"})
	if d.Tier != TierAnonymous || d.Result != "jwt_pending" {
		t.Fatalf("no verifier: %+v", d)
	}
}
