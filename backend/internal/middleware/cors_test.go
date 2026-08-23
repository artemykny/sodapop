package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestCORSAllowsConfiguredOrigin(t *testing.T) {
	handler := CORS([]string{"http://localhost:5173"}, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	request := httptest.NewRequest(http.MethodOptions, "http://api.example/v1/rooms", nil)
	request.Header.Set("Origin", "http://localhost:5173")
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusNoContent)
	}
	if got := recorder.Header().Get("Access-Control-Allow-Origin"); got != "http://localhost:5173" {
		t.Fatalf("Access-Control-Allow-Origin = %q", got)
	}
}

func TestCORSDoesNotReflectUnknownOrigin(t *testing.T) {
	handler := CORS([]string{"*.example.com"}, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	request := httptest.NewRequest(http.MethodGet, "http://api.example/v1/rooms", nil)
	request.Header.Set("Origin", "https://attacker.test")
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	if got := recorder.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Fatalf("Access-Control-Allow-Origin = %q, want empty", got)
	}
}

func TestCORSFullOriginRequiresMatchingScheme(t *testing.T) {
	handler := CORS([]string{"https://app.example.com"}, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	for _, test := range []struct {
		origin string
		want   string
	}{
		{origin: "https://app.example.com", want: "https://app.example.com"},
		{origin: "http://app.example.com", want: ""},
	} {
		request := httptest.NewRequest(http.MethodGet, "http://api.example/v1/rooms", nil)
		request.Header.Set("Origin", test.origin)
		recorder := httptest.NewRecorder()
		handler.ServeHTTP(recorder, request)
		if got := recorder.Header().Get("Access-Control-Allow-Origin"); got != test.want {
			t.Errorf("origin %q reflected as %q, want %q", test.origin, got, test.want)
		}
	}
}
