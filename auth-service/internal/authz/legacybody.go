package authz

import (
	"encoding/json"
	"mime"
	"net/url"
)

// LegacyBodyKey returns the legacy `apikey` carried in a form or JSON request body, or "". Old Sefaria clients send
// their key this way on write routes; Envoy forwards the body to the auth service only on the scoped legacy route.
func LegacyBodyKey(contentType string, body []byte) string {
	if len(body) == 0 {
		return ""
	}
	mt, _, _ := mime.ParseMediaType(contentType)
	switch mt {
	case "application/x-www-form-urlencoded":
		v, err := url.ParseQuery(string(body))
		if err != nil {
			return ""
		}
		return v.Get("apikey")
	case "application/json":
		var p struct {
			APIKey any `json:"apikey"`
		}
		if json.Unmarshal(body, &p) != nil {
			return ""
		}
		if s, ok := p.APIKey.(string); ok {
			return s
		}
	}
	return ""
}
