package authz

import (
	"encoding/json"
	"fmt"
	"net/url"
	pathpkg "path"
	"regexp"
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
	Method, Path, APIKey, Authorization, Cookie, Origin string
}

type Decision struct {
	Allow   bool
	Status  int
	Code    string
	Project string
	Tier    string
	Meter   string
	Result  string
	Message string
}

type Config struct {
	Mode          Mode
	GatedPaths    []string
	HelpURL       string
	JWTCookieName string
	Meters        []Meter
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

// cleanPath decodes and cleans a request path so /api/%6bnn-search or //api/knn-search cannot
// slip past a prefix that the upstream router would still resolve (security review, finding H).
func cleanPath(raw string) string {
	path := raw
	if u, err := url.PathUnescape(raw); err == nil {
		path = u
	}
	return pathpkg.Clean("/" + path)
}

func hasPrefix(raw, path, p string) bool {
	return p != "" && (strings.HasPrefix(path, p) || strings.HasPrefix(raw, p))
}

// gated matches on the decoded, cleaned path.
func gated(cfg Config, raw string) bool {
	path := cleanPath(raw)
	for _, p := range cfg.GatedPaths {
		if hasPrefix(raw, path, p) {
			return true
		}
	}
	return false
}

// MeterNone is the x-sefaria-meter value of a request that belongs to no metered product.
const MeterNone = "none"

// Meter maps a path prefix to the metered product whose monthly quota the request counts against.
type Meter struct{ Name, Prefix string }

var meterName = regexp.MustCompile(`^[a-z][a-z0-9_-]*$`)

// ParseMeters parses METERED_PATHS, comma-separated meter=prefix entries such as semantic=/api/knn-search. A meter
// may list several prefixes. Empty input is no meters; a malformed entry is an error, so a typo cannot silently
// leave a product unmetered.
func ParseMeters(spec string) ([]Meter, error) {
	if strings.TrimSpace(spec) == "" {
		return nil, nil
	}
	var out []Meter
	for _, entry := range strings.Split(spec, ",") {
		name, prefix, ok := strings.Cut(strings.TrimSpace(entry), "=")
		name, prefix = strings.TrimSpace(name), strings.TrimSpace(prefix)
		switch {
		case !ok:
			return nil, fmt.Errorf("METERED_PATHS entry %q is not meter=prefix", entry)
		case !meterName.MatchString(name) || name == MeterNone:
			return nil, fmt.Errorf("METERED_PATHS meter name %q must match %s and not be %q", name, meterName, MeterNone)
		case !strings.HasPrefix(prefix, "/"):
			return nil, fmt.Errorf("METERED_PATHS prefix %q for %s must start with /", prefix, name)
		}
		out = append(out, Meter{Name: name, Prefix: prefix})
	}
	return out, nil
}

// meterFor matches on the same decoded, cleaned path as gated. The longest matching prefix wins; off every
// metered path the meter is none.
func meterFor(cfg Config, raw string) string {
	path := cleanPath(raw)
	best, name := -1, MeterNone
	for _, m := range cfg.Meters {
		if hasPrefix(raw, path, m.Prefix) && len(m.Prefix) > best {
			best, name = len(m.Prefix), m.Name
		}
	}
	return name
}

func Decide(l Lookup, cfg Config, r Request) Decision {
	d := decide(l, cfg, r)
	d.Meter = meterFor(cfg, r.Path)
	return d
}

func decide(l Lookup, cfg Config, r Request) Decision {
	if r.APIKey != "" {
		k, ok := l.Lookup(r.APIKey)
		if !ok || k.Revoked {
			return deny(cfg, 401, CodeKeyInvalid, "The x-api-key is not valid for this project.")
		}
		if len(k.AllowedOrigins) > 0 && !contains(k.AllowedOrigins, r.Origin) {
			origin := r.Origin
			if origin == "" {
				origin = "a request without an Origin header"
			}
			return deny(cfg, 403, CodeOriginNotAllowed, fmt.Sprintf("This key only accepts requests from its registered website, and %s is not one. Turn the restriction off for keys used from a server, script, app or agent.", origin))
		}
		return allow(k.ProjectID, k.Tier, "ok")
	}
	// Browser CORS preflights do not carry application credentials. Let Envoy
	// answer OPTIONS requests with an Origin header before applying path gates.
	if r.Method == "OPTIONS" && r.Origin != "" {
		return allow("", TierEmbed, "preflight")
	}
	if gated(cfg, r.Path) {
		return deny(cfg, 401, CodeKeyRequired, "This route requires an x-api-key header.")
	}
	// A bearer token rides the anonymous tier, marked for the log, unless decideRequest has a verifier to settle it.
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

// JWTAuthorization returns the Authorization value to verify: the bearer header when present, else the named cookie.
func JWTAuthorization(authorization, cookie, cookieName string) string {
	if _, ok := BearerToken(authorization); ok {
		return authorization
	}
	if cookieName == "" {
		cookieName = "sefaria_jwt"
	}
	for _, part := range strings.Split(cookie, ";") {
		name, value, ok := strings.Cut(strings.TrimSpace(part), "=")
		if ok && name == cookieName && strings.TrimSpace(value) != "" {
			return "Bearer " + strings.TrimSpace(value)
		}
	}
	return authorization
}
