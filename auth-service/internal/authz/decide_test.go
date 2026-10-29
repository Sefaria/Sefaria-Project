package authz

import (
	"encoding/json"
	"strings"
	"testing"

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
		{"unknown key on gated path", Request{Path: "/api/knn-search", Method: "POST", APIKey: unknown}, false, 401, "api_key_invalid", "", "", "api_key_invalid"},
		{"revoked key on gated path", Request{Path: "/api/knn-search", Method: "POST", APIKey: revoked}, false, 401, "api_key_invalid", "", "", "api_key_invalid"},
		{"unknown key on ungated path is anonymous", Request{Path: "/x", APIKey: unknown}, true, 200, "", "", "anonymous", "api_key_invalid"},
		{"revoked key on ungated path is anonymous", Request{Path: "/x", APIKey: revoked}, true, 200, "", "", "anonymous", "api_key_invalid"},
		{"registered origin ok", Request{Path: "/x", APIKey: beta, Origin: "https://beta.example.org"}, true, 200, "", "proj_beta", "partner", "ok"},
		{"registered origin mismatch", Request{Path: "/x", APIKey: beta, Origin: "https://evil.example.org"}, false, 403, "origin_not_allowed", "", "", "origin_not_allowed"},
		{"registered origin, call without Origin refused", Request{Path: "/x", APIKey: beta}, false, 403, "origin_not_allowed", "", "", "origin_not_allowed"},
		{"anonymous", Request{Path: "/api/texts/Genesis.1"}, true, 200, "", "", "anonymous", "anonymous"},
		{"embed by Origin", Request{Path: "/api/texts/Genesis.1", Origin: "https://embed-one.example.org"}, true, 200, "", "", "embed", "embed"},
		{"bearer without key defers to Envoy", Request{Path: "/x", Authorization: "Bearer abc.def.ghi"}, true, 200, "", "", "anonymous", "jwt_pending"},
		{"gated path without key", Request{Path: "/api/knn-search", Method: "POST"}, false, 401, "api_key_required", "", "", "api_key_required"},
		{"gated preflight without key", Request{Path: "/api/knn-search", Method: "OPTIONS", Origin: "https://embed.example.org"}, true, 200, "", "", "embed", "preflight"},
		{"OPTIONS without Origin on gated path", Request{Path: "/api/knn-search", Method: "OPTIONS"}, false, 401, "api_key_required", "", "", "api_key_required"},
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

func withKeyed(d Decision) Decision {
	d.Keyed = true
	return d
}

func withMeter(d Decision, meter string) Decision {
	d.Meter = meter
	return d
}

func TestDecidePreflight(t *testing.T) {
	for _, tc := range []struct {
		name string
		r    Request
		want Decision
	}{
		{"preflight", Request{Method: "OPTIONS", Path: "/x", Origin: "https://embed.example.org"}, withMeter(allow("", TierEmbed, "preflight"), MeterNone)},
		{"key takes precedence", Request{Method: "OPTIONS", Path: "/api/knn-search", Origin: "https://embed.example.org", APIKey: alpha}, withKeyed(withMeter(allow("proj_alpha", "developer", "ok"), MeterNone))},
		{"other method is not preflight", Request{Method: "GET", Path: "/api/knn-search", Origin: "https://embed.example.org"}, withMeter(deny(enforce, 401, CodeKeyRequired, "This route requires an x-api-key header."), MeterNone)},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := Decide(reg, enforce, tc.r); got != tc.want {
				t.Fatalf("got %+v want %+v", got, tc.want)
			}
		})
	}
}

func TestDecideObserveNeverDenies(t *testing.T) {
	for name, r := range map[string]Request{
		"unknown": {Path: "/api/knn-search", APIKey: unknown}, "revoked": {Path: "/api/knn-search", APIKey: revoked},
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
	d := Decide(reg, enforce, Request{Path: "/api/knn-search", Method: "POST", APIKey: unknown})
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
	same := Decide(reg, enforce, Request{Path: "/api/knn-search", Method: "POST", APIKey: revoked})
	if string(same.Body(enforce.HelpURL)) != string(d.Body(enforce.HelpURL)) {
		t.Fatal("unknown and revoked must produce the same body (product spec: no hint which)")
	}
	o := Decide(reg, enforce, Request{Path: "/x", APIKey: beta, Origin: "https://evil.example.org"})
	if !strings.Contains(o.Message, "https://evil.example.org") {
		t.Fatalf("origin_not_allowed must name the origin seen: %q", o.Message)
	}
}

func TestPrefixAndBearer(t *testing.T) {
	if got := Prefix(alpha); got != "sfr_alpha0" {
		t.Fatalf("got %q", got)
	}
	if got := Prefix("short"); got != "" {
		t.Fatalf("got %q", got)
	}
	if tok, ok := BearerToken("Bearer abc"); !ok || tok != "abc" {
		t.Fatal("bearer parse")
	}
	if _, ok := BearerToken("Basic abc"); ok {
		t.Fatal("non-bearer accepted")
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

// A bad sfr_ key on an ungated path is answered as anonymous, flagged so the caller learns the key was not accepted.
func TestBadKeyUngatedIsAnonymousNotAccepted(t *testing.T) {
	for name, k := range map[string]string{"unknown": unknown, "revoked": revoked, "comma-joined unknown": alpha + "," + unknown, "comma-joined same key": alpha + "," + alpha} {
		for _, p := range []string{"/api/texts/Genesis.1", "/", "/static/js/app.js"} {
			t.Run(name+" "+p, func(t *testing.T) {
				d := Decide(reg, enforce, Request{Method: "GET", Path: p, APIKey: k})
				if !d.Allow || d.Status != 200 || d.Tier != TierAnonymous || d.Project != "" || d.Keyed || d.Result != CodeKeyInvalid || !d.KeyNotAccepted {
					t.Fatalf("got %+v", d)
				}
			})
		}
	}
}

// A legacy (Mongo, non-sfr_) key is not a credential at this gate: it counts as no key, so it is not flagged.
func TestLegacyKeyGatedPathRequiresKey(t *testing.T) {
	legacy := "0123456789abcdef0123456789abcdef"
	d := Decide(reg, enforce, Request{Method: "POST", Path: "/api/knn-search", APIKey: legacy})
	if d.Allow || d.Status != 401 || d.Code != CodeKeyRequired {
		t.Fatalf("gated legacy key: got %+v", d)
	}
	d = Decide(reg, enforce, Request{Method: "GET", Path: "/api/texts/Genesis.1", APIKey: legacy})
	if !d.Allow || d.Tier != TierAnonymous || d.Result != TierAnonymous || d.KeyNotAccepted || d.Keyed {
		t.Fatalf("ungated legacy key: got %+v", d)
	}
}

// Keys that fail the gate are 401 on a gated path, as before.
func TestInvalidSfrKeyGatedStill401(t *testing.T) {
	for name, k := range map[string]string{"unknown": unknown, "revoked": revoked, "comma-joined": alpha + "," + unknown} {
		t.Run(name, func(t *testing.T) {
			d := Decide(reg, enforce, Request{Method: "POST", Path: "/api/knn-search", APIKey: k})
			if d.Allow || d.Status != 401 || d.Code != CodeKeyInvalid || d.Result != CodeKeyInvalid {
				t.Fatalf("got %+v", d)
			}
		})
	}
}

// Observe mode never denies, but the bad key stays visible in the result and in the not-accepted flag.
func TestObserveModeInvalidKeyGated(t *testing.T) {
	d := Decide(reg, observe, Request{Method: "POST", Path: "/api/knn-search", APIKey: unknown})
	if !d.Allow || d.Status != 200 || d.Result != "observed:api_key_invalid" || !d.KeyNotAccepted {
		t.Fatalf("got %+v", d)
	}
}

// Envoy joins repeated headers with a comma: such a value is never a keyed allow, on any path.
func TestCommaJoinedKeyNeverKeyed(t *testing.T) {
	for _, v := range []string{alpha + "," + alpha, alpha + "," + unknown, alpha + ", " + alpha} {
		for _, p := range []string{"/api/knn-search", "/api/texts/Genesis.1"} {
			d := Decide(reg, enforce, Request{Method: "POST", Path: p, APIKey: v})
			if d.Keyed || d.Project != "" || d.Tier == "developer" {
				t.Fatalf("%s %q: keyed allow %+v", p, v, d)
			}
		}
	}
}

func TestPrefixCapsAtSfrPlus6(t *testing.T) {
	if got := Prefix("sfr_abcdefghij"); got != "sfr_abcdef" {
		t.Fatalf("got %q", got)
	}
	if got := Prefix("sfr_abc"); got != "sfr_abc" {
		t.Fatalf("got %q", got)
	}
	if got := Prefix("0123456789abcdef0123456789abcdef"); got != "" {
		t.Fatalf("legacy key logs a prefix: %q", got)
	}
}
