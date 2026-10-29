package authz

import (
	"context"
	"testing"

	corev3 "github.com/envoyproxy/go-control-plane/envoy/config/core/v3"
	authv3 "github.com/envoyproxy/go-control-plane/envoy/service/auth/v3"
	"google.golang.org/grpc/codes"
)

func checkReq(path string, headers map[string]string) *authv3.CheckRequest {
	return checkReqMethod("GET", path, headers)
}

func checkReqMethod(method, path string, headers map[string]string) *authv3.CheckRequest {
	return &authv3.CheckRequest{Attributes: &authv3.AttributeContext{Request: &authv3.AttributeContext_Request{
		Http: &authv3.AttributeContext_HttpRequest{Method: method, Path: path, Headers: headers},
	}}}
}

func TestGRPCCheckPreflight(t *testing.T) {
	s := NewGRPCServer(reg, Options{Cfg: enforce}, NopRecorder{})
	resp, err := s.Check(context.Background(), checkReqMethod("OPTIONS", "/api/knn-search", map[string]string{"origin": "https://embed.example.org"}))
	if err != nil || resp.Status.Code != int32(codes.OK) {
		t.Fatalf("err=%v resp=%v", err, resp)
	}
	for _, h := range resp.GetOkResponse().Headers {
		if h.Header.Key == "x-sefaria-tier" && h.Header.Value != "embed" {
			t.Fatalf("tier=%s", h.Header.Value)
		}
		if h.Header.Key == "x-sefaria-auth-result" && h.Header.Value != "preflight" {
			t.Fatalf("result=%s", h.Header.Value)
		}
	}
}

func TestGRPCCheckAllow(t *testing.T) {
	s := NewGRPCServer(reg, Options{Cfg: enforce}, NopRecorder{})
	resp, err := s.Check(context.Background(), checkReq("/api/texts/Genesis.1?api_key=leak", map[string]string{"x-api-key": alpha, "x-sefaria-tier": "partner"}))
	if err != nil || resp.Status.Code != int32(codes.OK) {
		t.Fatalf("err=%v resp=%v", err, resp)
	}
	ok := resp.GetOkResponse()
	got := map[string]string{}
	for _, h := range ok.Headers {
		got[h.Header.Key] = h.Header.Value
		if h.AppendAction != corev3.HeaderValueOption_OVERWRITE_IF_EXISTS_OR_ADD {
			t.Fatalf("%s must overwrite", h.Header.Key)
		}
	}
	if got["x-sefaria-project"] != "proj_alpha" || got["x-sefaria-tier"] != "developer" || got["x-sefaria-auth-result"] != "ok" {
		t.Fatalf("headers=%v", got)
	}
	if len(ok.HeadersToRemove) != 0 || !hasAllAPIKeyRemovals(ok.QueryParametersToRemove) {
		t.Fatalf("remove=%v qp=%v", ok.HeadersToRemove, ok.QueryParametersToRemove)
	}
}

func TestGRPCCheckAnonymousAllowStampsEmptyProject(t *testing.T) {
	s := NewGRPCServer(reg, Options{Cfg: enforce}, NopRecorder{})
	resp, err := s.Check(context.Background(), checkReq("/api/texts/Genesis.1", map[string]string{"x-sefaria-project": "spoof", "x-sefaria-tier": "partner", "x-sefaria-auth-result": "spoof"}))
	if err != nil || resp.Status.Code != int32(codes.OK) {
		t.Fatalf("err=%v resp=%v", err, resp)
	}
	ok := resp.GetOkResponse()
	got := map[string]string{}
	for _, h := range ok.Headers {
		got[h.Header.Key] = h.Header.Value
		if h.AppendAction != corev3.HeaderValueOption_OVERWRITE_IF_EXISTS_OR_ADD {
			t.Fatalf("%s must overwrite", h.Header.Key)
		}
	}
	if got["x-sefaria-project"] != "" || got["x-sefaria-tier"] != "anonymous" || got["x-sefaria-auth-result"] != "anonymous" {
		t.Fatalf("headers=%v", got)
	}
	if len(got) != 4 || got["x-sefaria-meter"] != MeterNone {
		t.Fatalf("expected all identity headers and the meter, got=%v", got)
	}
	if len(ok.HeadersToRemove) != 0 || !hasAllAPIKeyRemovals(ok.QueryParametersToRemove) {
		t.Fatalf("remove=%v qp=%v", ok.HeadersToRemove, ok.QueryParametersToRemove)
	}
}

func TestGRPCCheckDeny(t *testing.T) {
	s := NewGRPCServer(reg, Options{Cfg: enforce}, NopRecorder{})
	resp, _ := s.Check(context.Background(), checkReq("/x", map[string]string{"x-api-key": beta, "origin": "https://evil.example.org"}))
	if resp.Status.Code != int32(codes.PermissionDenied) {
		t.Fatalf("code=%d", resp.Status.Code)
	}
	d := resp.GetDeniedResponse()
	if d == nil || int(d.Status.Code) != 403 || d.Body == "" {
		t.Fatalf("denied=%v", d)
	}
	cors := false
	for _, h := range d.Headers {
		if h.Header.Key == "access-control-allow-origin" && h.Header.Value == "*" {
			cors = true
		}
	}
	if !cors {
		t.Fatalf("a denial must be readable by a page on another origin: %v", d.Headers)
	}
	resp, _ = s.Check(context.Background(), checkReq("/api/knn-search", map[string]string{}))
	if int(resp.GetDeniedResponse().Status.Code) != 401 {
		t.Fatalf("gated path without key should be 401, got %v", resp.GetDeniedResponse())
	}
}

func TestGRPCObserveMode(t *testing.T) {
	s := NewGRPCServer(reg, Options{Cfg: observe}, NopRecorder{})
	resp, _ := s.Check(context.Background(), checkReq("/x", map[string]string{"x-api-key": unknown}))
	if resp.Status.Code != int32(codes.OK) {
		t.Fatalf("observe mode denied: %v", resp)
	}
	for _, h := range resp.GetOkResponse().Headers {
		if h.Header.Key == "x-sefaria-auth-result" && h.Header.Value != "observed:api_key_invalid" {
			t.Fatalf("result=%s", h.Header.Value)
		}
	}
}

const (
	limited  = "sfr_limited0000000000000000000000001"
	noLimits = "sfr_nolimits00000000000000000000001"
)

// limitReg carries the per-project numbers the auth service hands the gateway as dynamic metadata.
var limitReg = fakeLookup{
	limited:  {ID: "44444444-4444-4444-4444-444444444444", Key: limited, ProjectID: "proj_limited", Tier: "partner", PerMinute: 300, MonthlyLimits: map[string]int64{"semantic": 50000}},
	noLimits: {ID: "55555555-5555-5555-5555-555555555555", Key: noLimits, ProjectID: "proj_nolimits", Tier: "developer", PerMinute: 60},
}

var meteredCfg = Config{Mode: ModeEnforce, GatedPaths: []string{"/api/knn-search"}, Meters: []Meter{{Name: "semantic", Prefix: "/api/knn-search"}}}

func checkWith(t *testing.T, l Lookup, cfg Config, path string, headers map[string]string) *authv3.CheckResponse {
	t.Helper()
	s := NewGRPCServer(l, Options{Cfg: cfg}, NopRecorder{})
	resp, err := s.Check(context.Background(), checkReq(path, headers))
	if err != nil {
		t.Fatalf("Check error: %v", err)
	}
	return resp
}

func TestMeterHeaderAlwaysStamped(t *testing.T) {
	cases := []struct {
		name    string
		path    string
		headers map[string]string
		want    string
	}{
		{"keyed metered", "/api/knn-search", map[string]string{"x-api-key": limited}, "semantic"},
		{"keyed unmetered", "/api/texts/Genesis.1", map[string]string{"x-api-key": limited}, MeterNone},
		{"anonymous", "/api/texts/Genesis.1", map[string]string{}, MeterNone},
		{"client-sent meter on a keyed metered request", "/api/knn-search", map[string]string{"x-api-key": limited, "x-sefaria-meter": "none"}, "semantic"},
		{"client-sent meter on an anonymous request", "/api/texts/Genesis.1", map[string]string{"x-sefaria-meter": "semantic"}, MeterNone},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			resp := checkWith(t, limitReg, meteredCfg, tc.path, tc.headers)
			if resp.Status.Code != int32(codes.OK) {
				t.Fatalf("denied: %v", resp)
			}
			var found []*corev3.HeaderValueOption
			for _, h := range resp.GetOkResponse().GetHeaders() {
				if h.Header.Key == "x-sefaria-meter" {
					found = append(found, h)
				}
			}
			if len(found) != 1 || found[0].Header.Value != tc.want || found[0].AppendAction != corev3.HeaderValueOption_OVERWRITE_IF_EXISTS_OR_ADD {
				t.Fatalf("x-sefaria-meter: %+v, want one overwrite of %q", found, tc.want)
			}
		})
	}
}

func limitNumbers(t *testing.T, resp *authv3.CheckResponse, key string) (float64, string) {
	t.Helper()
	v := resp.GetDynamicMetadata().GetFields()[key]
	if v == nil {
		t.Fatalf("no %s in dynamic metadata: %v", key, resp.GetDynamicMetadata())
	}
	f := v.GetStructValue().GetFields()
	return f["requests_per_unit"].GetNumberValue(), f["unit"].GetStringValue()
}

func TestMetadataCarriesTierNumbers(t *testing.T) {
	resp := checkWith(t, limitReg, meteredCfg, "/api/knn-search", map[string]string{"x-api-key": limited})
	if n, unit := limitNumbers(t, resp, "limit_minute"); n != 300 || unit != "MINUTE" {
		t.Fatalf("limit_minute = %v %s", n, unit)
	}
	if n, unit := limitNumbers(t, resp, "limit_month_semantic"); n != 50000 || unit != "MONTH" {
		t.Fatalf("limit_month_semantic = %v %s", n, unit)
	}
}

func TestUnknownMeterHasNoMonthlyMetadata(t *testing.T) {
	// The tier has no row for the metered product: a minute limit only, never a zero monthly limit.
	resp := checkWith(t, limitReg, meteredCfg, "/api/knn-search", map[string]string{"x-api-key": noLimits})
	if n, unit := limitNumbers(t, resp, "limit_minute"); n != 60 || unit != "MINUTE" {
		t.Fatalf("limit_minute = %v %s", n, unit)
	}
	if _, ok := resp.GetDynamicMetadata().GetFields()["limit_month_semantic"]; ok {
		t.Fatalf("a tier without a meter row must carry no monthly limit: %v", resp.GetDynamicMetadata())
	}
	// An unmetered keyed request carries no monthly limit either.
	resp = checkWith(t, limitReg, meteredCfg, "/api/texts/Genesis.1", map[string]string{"x-api-key": limited})
	for k := range resp.GetDynamicMetadata().GetFields() {
		if len(k) >= len("limit_month_") && k[:len("limit_month_")] == "limit_month_" {
			t.Fatalf("unmetered request carries %s", k)
		}
	}
}

func TestAnonymousHasNoLimitMetadata(t *testing.T) {
	resp := checkWith(t, limitReg, meteredCfg, "/api/knn-search", map[string]string{})
	if resp.GetDynamicMetadata() != nil {
		t.Fatalf("an anonymous request must carry no limit metadata: %v", resp.GetDynamicMetadata())
	}
}
