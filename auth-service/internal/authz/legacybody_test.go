package authz

import (
	"bytes"
	"context"
	"log/slog"
	"strings"
	"testing"

	authv3 "github.com/envoyproxy/go-control-plane/envoy/service/auth/v3"
)

func TestLegacyBodyKey(t *testing.T) {
	const k = "sfr_legacy000000000000000000000001"
	for _, tc := range []struct{ name, ct, body, want string }{
		{"form", "application/x-www-form-urlencoded", "text=x&apikey=" + k, k},
		{"form with charset", "application/x-www-form-urlencoded; charset=UTF-8", "apikey=" + k, k},
		{"json", "application/json", `{"apikey":"` + k + `","text":"x"}`, k},
		{"no key", "application/x-www-form-urlencoded", "text=x", ""},
		{"broken json", "application/json", `{"apikey":`, ""},
		{"json non-string", "application/json", `{"apikey":42}`, ""},
		{"other content type", "text/plain", "apikey=" + k, ""},
		{"empty", "application/json", "", ""},
	} {
		if got := LegacyBodyKey(tc.ct, []byte(tc.body)); got != tc.want {
			t.Errorf("%s: got %q want %q", tc.name, got, tc.want)
		}
	}
}

func bodyReq(path, ct, body string) *authv3.CheckRequest {
	r := checkReq(path, map[string]string{"content-type": ct})
	r.Attributes.Request.Http.Method = "POST"
	r.Attributes.Request.Http.Body = body
	return r
}

// The legacy route forwards the body so the auth service can see a body-borne key. For now it only records, by
// prefix, whether one is there: the decision does not change and the full key is never logged.
func TestGRPCLogsLegacyBodyKeyPresenceByPrefixOnly(t *testing.T) {
	const k = "sfr_legacy000000000000000000000001"
	var buf bytes.Buffer
	prev := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(&buf, nil)))
	defer slog.SetDefault(prev)

	s := NewGRPCServer(reg, Options{Cfg: enforce}, NopRecorder{})
	resp, err := s.Check(context.Background(), bodyReq("/api/texts/modify-bulk/Genesis", "application/x-www-form-urlencoded", "apikey="+k))
	if err != nil || resp.GetOkResponse() == nil {
		t.Fatalf("decision changed: err=%v resp=%v", err, resp)
	}
	out := buf.String()
	if !strings.Contains(out, "legacy body key") || !strings.Contains(out, "present=true") || !strings.Contains(out, "key_prefix="+k[:12]) {
		t.Fatalf("missing presence log: %s", out)
	}
	if strings.Contains(out, k) {
		t.Fatalf("full key logged: %s", out)
	}

	buf.Reset()
	if _, err := s.Check(context.Background(), bodyReq("/api/texts/modify-bulk/Genesis", "application/x-www-form-urlencoded", "text=x")); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(buf.String(), "present=false") {
		t.Fatalf("absence not logged: %s", buf.String())
	}

	buf.Reset()
	if _, err := s.Check(context.Background(), checkReq("/api/texts/Genesis.1", nil)); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(buf.String(), "legacy body key") {
		t.Fatalf("logged for a request without a body: %s", buf.String())
	}
}
