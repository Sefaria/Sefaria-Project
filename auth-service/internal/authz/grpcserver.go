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
)

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

func (s *GRPCServer) Check(ctx context.Context, req *authv3.CheckRequest) (*authv3.CheckResponse, error) {
	_ = ctx
	t0 := time.Now()
	httpReq := req.GetAttributes().GetRequest().GetHttp()
	h := httpReq.GetHeaders()
	path := httpReq.GetPath()
	if i := strings.IndexByte(path, '?'); i >= 0 {
		path = path[:i]
	}
	r := Request{Method: httpReq.GetMethod(), Path: path, APIKey: h["x-api-key"], Authorization: h["authorization"], Cookie: h["cookie"], Origin: h["origin"]}
	r.Authorization = JWTAuthorization(r.Authorization, r.Cookie, s.o.Cfg.JWTCookieName)
	if body := httpReq.GetRawBody(); len(body) > 0 || httpReq.GetBody() != "" {
		if len(body) == 0 {
			body = []byte(httpReq.GetBody())
		}
		// Presence only (follow-up F8): the decision is unchanged and only the 12-character prefix is logged.
		k := LegacyBodyKey(h["content-type"], body)
		slog.Info("legacy body key", "present", k != "", "key_prefix", Prefix(k), "header_key", r.APIKey != "", "path", path)
	}
	d := decideRequest(s.l, s.o, r)
	s.rec.Observe(d.Result, d.Allow, time.Since(t0))
	if d.Allow {
		return &authv3.CheckResponse{
			Status: &rpcstatus.Status{Code: int32(codes.OK)},
			HttpResponse: &authv3.CheckResponse_OkResponse{OkResponse: &authv3.OkHttpResponse{
				Headers: []*corev3.HeaderValueOption{
					hdr("x-sefaria-project", d.Project),
					hdr("x-sefaria-tier", d.Tier),
					hdr("x-sefaria-auth-result", d.Result),
				},
				QueryParametersToRemove: []string{"api_key"},
			}},
		}, nil
	}
	slog.Info("deny", "transport", "grpc", "code", d.Code, "key_prefix", Prefix(r.APIKey), "origin", r.Origin, "path", r.Path)
	headers := []*corev3.HeaderValueOption{hdr("content-type", "application/json")}
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
