package identifier

import (
	"crypto/rand"
	"encoding/base64"
	"fmt"
)

// New returns a URL-safe, cryptographically random identifier.
func New(prefix string, bytes int) (string, error) {
	value := make([]byte, bytes)
	if _, err := rand.Read(value); err != nil {
		return "", fmt.Errorf("generate random identifier: %w", err)
	}
	return prefix + base64.RawURLEncoding.EncodeToString(value), nil
}
