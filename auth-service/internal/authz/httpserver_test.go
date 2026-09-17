package authz

import (
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHTTPHandlerAllowStampsAndRemoves(t *testing.T) {
	h := NewHTTPHandler(reg, Options{Cfg: enforce}, NopRecorder{})
	r := httptest.NewRequest("GET", "/api/texts/Genesis.1", nil)
	r.Header.Set("x-api-key", alpha)
	r.Header.Set("x-sefaria-tier", "partner")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != 200 || w.Header().Get("x-sefaria-project") != "proj_alpha" || w.Header().Get("x-sefaria-tier") != "developer" || w.Header().Get("x-sefaria-auth-result") != "ok" {
		t.Fatalf("code=%d headers=%v", w.Code, w.Header())
	}
	if !strings.Contains(w.Header().Get("x-envoy-auth-headers-to-remove"), "x-sefaria-tier") {
		t.Fatal("missing removal")
	}
}
func TestHTTPHandlerClasses(t *testing.T) {
	h := NewHTTPHandler(reg, Options{Cfg: enforce}, NopRecorder{})
	cases := []struct {
		k, o, a   string
		code      int
		tier, res string
	}{{"", "", "", 200, "anonymous", "anonymous"}, {"", "https://embed-one.example.org", "", 200, "embed", "embed"}, {"", "", "Bearer x.y.z", 200, "anonymous", "jwt_pending"}, {unknown, "", "", 401, "", "api_key_invalid"}, {revoked, "", "", 401, "", "api_key_invalid"}, {beta, "https://evil.example.org", "", 403, "", "origin_not_allowed"}}
	for _, c := range cases {
		r := httptest.NewRequest("GET", "/api/texts/Genesis.1", nil)
		if c.k != "" {
			r.Header.Set("x-api-key", c.k)
		}
		if c.o != "" {
			r.Header.Set("origin", c.o)
		}
		if c.a != "" {
			r.Header.Set("authorization", c.a)
		}
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if w.Code != c.code || w.Header().Get("x-sefaria-tier") != c.tier {
			t.Fatalf("code=%d tier=%q", w.Code, w.Header().Get("x-sefaria-tier"))
		}
		if c.code == 200 && w.Header().Get("x-sefaria-auth-result") != c.res {
			t.Fatal("result")
		}
		if c.code != 200 && (w.Header().Get("Content-Type") != "application/json" || w.Body.Len() == 0 || w.Header().Get("x-sefaria-project") != "" || (c.code == 401 && w.Header().Get("WWW-Authenticate") == "")) {
			t.Fatal("deny shape")
		}
	}
}
func TestHTTPHandlerGated(t *testing.T) {
	h := NewHTTPHandler(reg, Options{Cfg: enforce}, NopRecorder{})
	r := httptest.NewRequest("POST", "/api/knn-search", nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != 401 || !strings.Contains(w.Body.String(), "api_key_required") {
		t.Fatalf("code=%d body=%s", w.Code, w.Body.String())
	}
}
