package authz

import (
	"encoding/json"
	"fmt"
	"net/url"
	pathpkg "path"
	"strings"

	"github.com/Sefaria/Sefaria-Project/auth-service/internal/jwtverify"
	"github.com/Sefaria/Sefaria-Project/auth-service/internal/registry"
)

type Claims = jwtverify.Claims

type JWTVerifier interface {
	Verify(token string) (jwtverify.Claims, error)
}

type Mode string

const (
	ModeEnforce Mode = "enforce"
	ModeObserve Mode = "observe"
)

const (
	TierAnonymous  = "anonymous"
	TierEmbed      = "embed"
	TierFirstParty = "firstparty"

	CodeKeyRequired      = "api_key_required"
	CodeKeyInvalid       = "api_key_invalid"
	CodeOriginNotAllowed = "origin_not_allowed"
	CodeRateLimited      = "rate_limited"
)

type Lookup interface {
	Lookup(key string) (registry.Key, bool)
}

type Request struct {
	Method, Path, APIKey, Authorization, Origin string
}

type Decision struct {
	Allow   bool
	Status  int
	Code    string
	Project string
	Tier    string
	Result  string
	Message string
}

type Config struct {
	Mode       Mode
	GatedPaths []string
	HelpURL    string
}

func allow(project, tier, result string) Decision {
	return Decision{Allow: true, Status: 200, Project: project, Tier: tier, Result: result}
}

func deny(cfg Config, status int, code, message string) Decision {
	if cfg.Mode == ModeObserve {
		return Decision{Allow: true, Status: 200, Tier: TierAnonymous, Result: "observed:" + code}
	}
	return Decision{Status: status, Code: code, Result: code, Message: message}
}

// gated matches on the decoded, cleaned path so /api/%6bnn-search or //api/knn-search cannot
// slip past a prefix that the upstream router would still resolve (security review, finding H).
func gated(cfg Config, raw string) bool {
	path := raw
	if u, err := url.PathUnescape(raw); err == nil {
		path = u
	}
	path = pathpkg.Clean("/" + path)
	for _, p := range cfg.GatedPaths {
		if p != "" && (strings.HasPrefix(path, p) || strings.HasPrefix(raw, p)) {
			return true
		}
	}
	return false
}

func Decide(l Lookup, cfg Config, r Request) Decision {
	if r.APIKey != "" {
		k, ok := l.Lookup(r.APIKey)
		if !ok || k.Revoked {
			return deny(cfg, 401, CodeKeyInvalid, "The x-api-key is not valid for this project.")
		}
		if r.Origin != "" && len(k.AllowedOrigins) > 0 && !contains(k.AllowedOrigins, r.Origin) {
			return deny(cfg, 403, CodeOriginNotAllowed, fmt.Sprintf("This key's project restricts browser origins and %s is not registered. Turn the restriction off if your project has its own server.", r.Origin))
		}
		return allow(k.ProjectID, k.Tier, "ok")
	}
	if gated(cfg, r.Path) {
		return deny(cfg, 401, CodeKeyRequired, "This route requires an x-api-key header.")
	}
	if _, ok := BearerToken(r.Authorization); ok {
		return allow("", TierAnonymous, "jwt_pending")
	}
	if r.Origin != "" {
		return allow("", TierEmbed, TierEmbed)
	}
	return allow("", TierAnonymous, TierAnonymous)
}

func (d Decision) Body(helpURL string) []byte {
	b, _ := json.Marshal(map[string]string{"error": d.Message, "code": d.Code, "help": helpURL + d.Code})
	return b
}

func Prefix(key string) string {
	if len(key) <= 12 {
		return key
	}
	return key[:12]
}

func BearerToken(authorization string) (string, bool) {
	const p = "Bearer "
	if len(authorization) > len(p) && strings.EqualFold(authorization[:len(p)], p) {
		return strings.TrimSpace(authorization[len(p):]), true
	}
	return "", false
}

func contains(list []string, v string) bool {
	for _, x := range list {
		if x == v {
			return true
		}
	}
	return false
}

// DecideJWT never denies: invalid or missing first-party tokens ride the anonymous tier.
func DecideJWT(v JWTVerifier, authorization string) Decision {
	tok, ok := BearerToken(authorization)
	if !ok {
		return allow("", TierAnonymous, "jwt_missing")
	}
	c, err := v.Verify(tok)
	if err != nil {
		return allow("", TierAnonymous, "jwt_invalid")
	}
	return allow(c.Sub, c.Tier, "ok")
}
