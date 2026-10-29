package authz

import (
	"context"
	"log/slog"
	"strings"
	"time"

	corev3 "github.com/envoyproxy/go-control-plane/envoy/config/core/v3"
	authv3 "github.com/envoyproxy/go-control-plane/envoy/service/auth/v3"
	typev3 "github.com/envoyproxy/go-control-plane/envoy/type/v3"
	rpcstatus "google.golang.org/genproto/googleapis/rpc/status"
	"google.golang.org/grpc/codes"
	"google.golang.org/protobuf/types/known/structpb"
)

type Recorder interface {
	Observe(result string, allow bool, d time.Duration)
}

type NopRecorder struct{}

func (NopRecorder) Observe(string, bool, time.Duration) {}

type Options struct {
	Cfg Config
}

type GRPCServer struct {
	authv3.UnimplementedAuthorizationServer
	l   Lookup
	o   Options
	rec Recorder
}

func NewGRPCServer(l Lookup, o Options, rec Recorder) *GRPCServer {
	return &GRPCServer{l: l, o: o, rec: rec}
}

func hdr(k, v string) *corev3.HeaderValueOption {
	return &corev3.HeaderValueOption{
		Header:       &corev3.HeaderValue{Key: k, Value: v},
		AppendAction: corev3.HeaderValueOption_OVERWRITE_IF_EXISTS_OR_ADD,
	}
}

// limitMetadata is the ext_authz dynamic metadata for an allowed keyed request: the project's per-minute limit, and
// its monthly limit for the metered product when the tier has a row for it. Envoy files it under the ext_authz
// namespace, and the gateway's BackendTrafficPolicy reads it with limit.fromMetadata. Anonymous and unkeyed requests
// carry none.
func limitMetadata(d Decision) (*structpb.Struct, error) {
	fields := map[string]any{
		"limit_minute": map[string]any{"requests_per_unit": float64(d.PerMinute), "unit": "MINUTE"},
	}
	if d.MonthlyLimit != nil {
		fields["limit_month_"+d.Meter] = map[string]any{"requests_per_unit": float64(*d.MonthlyLimit), "unit": "MONTH"}
	}
	return structpb.NewStruct(fields)
}

func (s *GRPCServer) Check(ctx context.Context, req *authv3.CheckRequest) (*authv3.CheckResponse, error) {
	_ = ctx
	t0 := time.Now()
	httpReq := req.GetAttributes().GetRequest().GetHttp()
	h := httpReq.GetHeaders()
	path := httpReq.GetPath()
	if i := strings.IndexByte(path, '?'); i >= 0 {
		path = path[:i]
	}
	r := Request{Method: httpReq.GetMethod(), Path: path, APIKey: h["x-api-key"], Authorization: h["authorization"], Origin: h["origin"]}
	d := Decide(s.l, s.o.Cfg, r)
	s.rec.Observe(d.Result, d.Allow, time.Since(t0))
	if d.Allow {
		resp := &authv3.CheckResponse{
			Status: &rpcstatus.Status{Code: int32(codes.OK)},
			HttpResponse: &authv3.CheckResponse_OkResponse{OkResponse: &authv3.OkHttpResponse{
				Headers: []*corev3.HeaderValueOption{
					hdr("x-sefaria-project", d.Project),
					hdr("x-sefaria-tier", d.Tier),
					hdr("x-sefaria-auth-result", d.Result),
					hdr("x-sefaria-meter", d.Meter),
				},
				QueryParametersToRemove: []string{"api_key"},
			}},
		}
		if d.KeyNotAccepted {
			resp.GetOkResponse().Headers = append(resp.GetOkResponse().Headers, hdr(KeyStatusHeader, KeyStatusNotAccepted))
		}
		if d.Keyed {
			md, err := limitMetadata(d)
			if err != nil {
				// Without metadata the gateway's fromMetadata rules fall back to their static limits: fail open, never unlimited.
				slog.Error("limit metadata", "err", err, "project", d.Project)
			} else {
				resp.DynamicMetadata = md
			}
		}
		return resp, nil
	}
	slog.Info("deny", "transport", "grpc", "code", d.Code, "key_prefix", Prefix(r.APIKey), "origin", r.Origin, "path", r.Path)
	// Envoy sends a denial without passing it upstream, so it carries its own CORS header for pages to read it.
	headers := []*corev3.HeaderValueOption{hdr("content-type", "application/json"), hdr("access-control-allow-origin", "*")}
	if d.Status == 401 {
		headers = append(headers, hdr("www-authenticate", `ApiKey realm="sefaria"`))
	}
	return &authv3.CheckResponse{
		Status: &rpcstatus.Status{Code: int32(codes.PermissionDenied), Message: d.Code},
		HttpResponse: &authv3.CheckResponse_DeniedResponse{DeniedResponse: &authv3.DeniedHttpResponse{
			Status:  &typev3.HttpStatus{Code: typev3.StatusCode(d.Status)},
			Headers: headers,
			Body:    string(d.Body(s.o.Cfg.HelpURL)),
		}},
	}, nil
}
