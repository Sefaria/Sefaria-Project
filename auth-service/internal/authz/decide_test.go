package authz

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/Sefaria/Sefaria-Project/auth-service/internal/jwtverify"
	"github.com/Sefaria/Sefaria-Project/auth-service/internal/registry"
)

type fakeLookup map[string]registry.Key

func (f fakeLookup) Lookup(k string) (registry.Key, bool) { v, ok := f[k]; return v, ok }

const (
	alpha   = "sfr_alpha000000000000000000000000001"
	beta    = "sfr_beta0000000000000000000000000001"
	revoked = "sfr_revoked00000000000000000000001"
	unknown = "sfr_unknown00000000000000000000001"
)

var reg = fakeLookup{
	alpha:   {ID: "11111111-1111-1111-1111-111111111111", Key: alpha, ProjectID: "proj_alpha", Tier: "developer"},
	beta:    {ID: "22222222-2222-2222-2222-222222222222", Key: beta, ProjectID: "proj_beta", Tier: "partner", AllowedOrigins: []string{"https://beta.example.org"}},
	revoked: {ID: "33333333-3333-3333-3333-333333333333", Key: revoked, ProjectID: "proj_alpha", Tier: "developer", Revoked: true},
}

var enforce = Config{Mode: ModeEnforce, GatedPaths: []string{"/api/knn-search"}, HelpURL: "https://developers.sefaria.org/help/"}
var observe = Config{Mode: ModeObserve, GatedPaths: []string{"/api/knn-search"}, HelpURL: "https://developers.sefaria.org/help/"}

func TestDecideEnforce(t *testing.T) {
	cases := []struct {
		name                        string
		r                           Request
		allow                       bool
		status                      int
		code, project, tier, result string
	}{
		{"valid key", Request{Path: "/api/texts/Genesis.1", APIKey: alpha}, true, 200, "", "proj_alpha", "developer", "ok"},
		{"valid key, any origin when none registered", Request{Path: "/x", APIKey: alpha, Origin: "https://x.org"}, true, 200, "", "proj_alpha", "developer", "ok"},
		{"unknown key", Request{Path: "/x", APIKey: unknown}, false, 401, "api_key_invalid", "", "", "api_key_invalid"},
		{"revoked key", Request{Path: "/x", APIKey: revoked}, false, 401, "api_key_invalid", "", "", "api_key_invalid"},
		{"registered origin ok", Request{Path: "/x", APIKey: beta, Origin: "https://beta.example.org"}, true, 200, "", "proj_beta", "partner", "ok"},
		{"registered origin mismatch", Request{Path: "/x", APIKey: beta, Origin: "https://evil.example.org"}, false, 403, "origin_not_allowed", "", "", "origin_not_allowed"},
		{"registered origin, server call without Origin", Request{Path: "/x", APIKey: beta}, true, 200, "", "proj_beta", "partner", "ok"},
		{"anonymous", Request{Path: "/api/texts/Genesis.1"}, true, 200, "", "", "anonymous", "anonymous"},
		{"embed by Origin", Request{Path: "/api/texts/Genesis.1", Origin: "https://embed-one.example.org"}, true, 200, "", "", "embed", "embed"},
		{"bearer without key defers to Envoy", Request{Path: "/x", Authorization: "Bearer abc.def.ghi"}, true, 200, "", "", "anonymous", "jwt_pending"},
		{"gated path without key", Request{Path: "/api/knn-search", Method: "POST"}, false, 401, "api_key_required", "", "", "api_key_required"},
		{"gated path with key", Request{Path: "/api/knn-search", Method: "POST", APIKey: alpha}, true, 200, "", "proj_alpha", "developer", "ok"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			d := Decide(reg, enforce, c.r)
			if d.Allow != c.allow || d.Status != c.status || d.Code != c.code || d.Project != c.project || d.Tier != c.tier || d.Result != c.result {
				t.Fatalf("got %+v", d)
			}
		})
	}
}

func TestDecideObserveNeverDenies(t *testing.T) {
	for name, r := range map[string]Request{
		"unknown": {Path: "/x", APIKey: unknown}, "revoked": {Path: "/x", APIKey: revoked},
		"origin": {Path: "/x", APIKey: beta, Origin: "https://evil.example.org"}, "gated": {Path: "/api/knn-search"},
	} {
		d := Decide(reg, observe, r)
		if !d.Allow || d.Status != 200 || d.Tier != "anonymous" || d.Project != "" || !strings.HasPrefix(d.Result, "observed:") {
			t.Fatalf("%s: %+v", name, d)
		}
	}
	if d := Decide(reg, observe, Request{Path: "/x", APIKey: alpha}); d.Result != "ok" || d.Tier != "developer" {
		t.Fatalf("observe must not alter allows: %+v", d)
	}
}

func TestBodyShapeAndNoLeak(t *testing.T) {
	d := Decide(reg, enforce, Request{Path: "/x", APIKey: unknown})
	var m map[string]string
	if err := json.Unmarshal(d.Body(enforce.HelpURL), &m); err != nil {
		t.Fatal(err)
	}
	if m["code"] != "api_key_invalid" || m["error"] == "" || m["help"] != "https://developers.sefaria.org/help/api_key_invalid" {
		t.Fatalf("body=%s", d.Body(enforce.HelpURL))
	}
	if strings.Contains(string(d.Body(enforce.HelpURL)), unknown) {
		t.Fatal("body leaks the key")
	}
	same := Decide(reg, enforce, Request{Path: "/x", APIKey: revoked})
	if string(same.Body(enforce.HelpURL)) != string(d.Body(enforce.HelpURL)) {
		t.Fatal("unknown and revoked must produce the same body (product spec: no hint which)")
	}
	o := Decide(reg, enforce, Request{Path: "/x", APIKey: beta, Origin: "https://evil.example.org"})
	if !strings.Contains(o.Message, "https://evil.example.org") {
		t.Fatalf("origin_not_allowed must name the origin seen: %q", o.Message)
	}
}

func TestPrefixAndBearer(t *testing.T) {
	if got := Prefix(alpha); got != "sfr_alpha000" {
		t.Fatalf("got %q", got)
	}
	if got := Prefix("short"); got != "short" {
		t.Fatalf("got %q", got)
	}
	if tok, ok := BearerToken("Bearer abc"); !ok || tok != "abc" {
		t.Fatal("bearer parse")
	}
	if _, ok := BearerToken("Basic abc"); ok {
		t.Fatal("non-bearer accepted")
	}
}

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

func TestGatedPathEncodedAndDoubleSlash(t *testing.T) {
	cfg := Config{GatedPaths: []string{"/api/knn-search"}}
	for _, p := range []string{"/api/knn-search", "/api/%6bnn-search", "//api/knn-search", "/api/./knn-search", "/api/knn-search%2Fx"} {
		if !gated(cfg, p) {
			t.Errorf("gated(%q) = false, want true", p)
		}
	}
	if gated(cfg, "/api/texts/Genesis.1") {
		t.Error("ungated path reported gated")
	}
}
