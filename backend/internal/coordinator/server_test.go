package coordinator

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestCreateAndResolveRoom(t *testing.T) {
	gameServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/v1/rooms" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{"room_id":"room_123","player_id":"player_1","token":"token"}`))
	}))
	t.Cleanup(gameServer.Close)

	coordinator, err := New([]string{gameServer.URL}, nil, nil, nil)
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}
	server := httptest.NewServer(coordinator.Handler())
	t.Cleanup(server.Close)

	response, err := http.Post(server.URL+"/v1/rooms", "application/json", strings.NewReader(`{"name":"Friday Game"}`))
	if err != nil {
		t.Fatalf("POST room: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusCreated {
		t.Fatalf("POST room status = %d", response.StatusCode)
	}
	var created map[string]any
	if err := json.NewDecoder(response.Body).Decode(&created); err != nil {
		t.Fatalf("decode create response: %v", err)
	}
	if created["game_server_url"] != gameServer.URL {
		t.Fatalf("game_server_url = %v", created["game_server_url"])
	}

	resolved, err := http.Get(server.URL + "/v1/rooms?name=friday%20game")
	if err != nil {
		t.Fatalf("GET resolve: %v", err)
	}
	defer resolved.Body.Close()
	if resolved.StatusCode != http.StatusOK {
		t.Fatalf("GET resolve status = %d", resolved.StatusCode)
	}
	var entry assignment
	if err := json.NewDecoder(resolved.Body).Decode(&entry); err != nil {
		t.Fatalf("decode resolve response: %v", err)
	}
	if entry.RoomID != "room_123" || entry.GameServerURL != gameServer.URL {
		t.Fatalf("resolved assignment = %+v", entry)
	}
}

func TestQuestionPacks(t *testing.T) {
	gameServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || r.URL.Path != "/v1/question-packs" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"packs":[{"id":"classic","name":"Classic mix","description":"Classic","question_count":10}]}`))
	}))
	t.Cleanup(gameServer.Close)

	coordinator, err := New([]string{gameServer.URL}, nil, nil, nil)
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}
	request := httptest.NewRequest(http.MethodGet, "/v1/question-packs", nil)
	recorder := httptest.NewRecorder()
	coordinator.Handler().ServeHTTP(recorder, request)
	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusOK)
	}
	var response struct {
		Packs []struct {
			ID            string `json:"id"`
			QuestionCount int    `json:"question_count"`
		} `json:"packs"`
	}
	if err := json.NewDecoder(recorder.Body).Decode(&response); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(response.Packs) == 0 || response.Packs[0].ID == "" || response.Packs[0].QuestionCount == 0 {
		t.Fatalf("question packs = %+v", response.Packs)
	}
}
