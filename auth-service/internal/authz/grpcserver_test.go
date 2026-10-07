package authz

import (
	"context"
	"testing"

	corev3 "github.com/envoyproxy/go-control-plane/envoy/config/core/v3"
	authv3 "github.com/envoyproxy/go-control-plane/envoy/service/auth/v3"
	"google.golang.org/grpc/codes"
)

func checkReq(path string, headers map[string]string) *authv3.CheckRequest {
	return &authv3.CheckRequest{Attributes: &authv3.AttributeContext{Request: &authv3.AttributeContext_Request{
		Http: &authv3.AttributeContext_HttpRequest{Method: "GET", Path: path, Headers: headers},
	}}}
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
	if len(ok.HeadersToRemove) != 0 || len(ok.QueryParametersToRemove) != 1 || ok.QueryParametersToRemove[0] != "api_key" {
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
	if len(got) != 3 {
		t.Fatalf("expected all identity headers, got=%v", got)
	}
	if len(ok.HeadersToRemove) != 0 || len(ok.QueryParametersToRemove) != 1 || ok.QueryParametersToRemove[0] != "api_key" {
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
