package adminapi

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestAuthSupportsLongPasswords(t *testing.T) {
	password := strings.Repeat("very-long-secret-", 40)
	auth := NewAuth(password)
	for _, test := range []struct {
		name       string
		header     string
		want       bool
		wantStatus int
	}{
		{name: "correct", header: "Bearer " + password, want: true, wantStatus: http.StatusOK},
		{name: "wrong", header: "Bearer " + password + "x", wantStatus: http.StatusUnauthorized},
		{name: "missing", wantStatus: http.StatusUnauthorized},
	} {
		t.Run(test.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodGet, "/v1/admin/overview", nil)
			request.Header.Set("Authorization", test.header)
			recorder := httptest.NewRecorder()
			if got := auth.Require(recorder, request); got != test.want {
				t.Fatalf("Require() = %v, want %v", got, test.want)
			}
			if recorder.Code != test.wantStatus {
				t.Fatalf("status = %d, want %d", recorder.Code, test.wantStatus)
			}
		})
	}
}

func TestDisabledAuthFailsClosed(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, "/v1/admin/overview", nil)
	recorder := httptest.NewRecorder()
	if NewAuth("").Require(recorder, request) {
		t.Fatal("unconfigured admin auth allowed request")
	}
	if recorder.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusServiceUnavailable)
	}
}
