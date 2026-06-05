package aiclient

import (
	"os"
	"strings"
)

func BaseURL() string {
	base := strings.TrimRight(strings.TrimSpace(os.Getenv("AI_SERVICE_BASE_URL")), "/")
	if base == "" {
		return "http://127.0.0.1:8000"
	}
	return base
}

func URL(path string) string {
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}
	return BaseURL() + path
}
