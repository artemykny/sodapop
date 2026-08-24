package middleware

import (
	"net/http"
	"net/url"
	"path"
	"strings"
)

func CORS(originPatterns []string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" && originAllowed(origin, originPatterns) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			w.Header().Add("Vary", "Origin")
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

// OriginHostPatterns converts full origins or host patterns to the host-only
// patterns expected by the WebSocket origin checker.
func OriginHostPatterns(values []string) []string {
	patterns := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if parsed, err := url.Parse(value); err == nil && parsed.Host != "" {
			value = parsed.Host
		}
		if value != "" {
			patterns = append(patterns, value)
		}
	}
	return patterns
}

func originAllowed(origin string, patterns []string) bool {
	parsed, err := url.Parse(origin)
	if err != nil || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return false
	}
	for _, configured := range patterns {
		configured = strings.TrimSpace(configured)
		pattern, scheme := configured, ""
		if allowed, err := url.Parse(configured); err == nil && allowed.Host != "" {
			pattern, scheme = allowed.Host, strings.ToLower(allowed.Scheme)
		}
		if scheme != "" && scheme != strings.ToLower(parsed.Scheme) {
			continue
		}
		matched, err := path.Match(strings.ToLower(pattern), strings.ToLower(parsed.Host))
		if err == nil && matched {
			return true
		}
	}
	return false
}
