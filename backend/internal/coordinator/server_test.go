package coordinator

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/ak/sodapop/backend/internal/adminapi"
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

	coordinator, err := New([]string{gameServer.URL}, nil, nil, nil, "")
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

func TestAdminOverviewAggregatesMultipleGamesAndUnavailableServers(t *testing.T) {
	password := strings.Repeat("long-admin-password-", 32)
	gameServer := func(stats adminapi.GameServerStats) *httptest.Server {
		return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path != "/v1/admin/stats" {
				http.NotFound(w, r)
				return
			}
			if r.Header.Get("Authorization") != "Bearer "+password {
				w.WriteHeader(http.StatusUnauthorized)
				return
			}
			writeJSON(w, http.StatusOK, stats)
		}))
	}
	multiGameServer := gameServer(adminapi.GameServerStats{
		Games: []adminapi.GameStats{
			{
				Game:    adminapi.Game{ID: "oddoneout", Name: "Odd One Out"},
				Rooms:   adminapi.Rooms{Total: 3, Active: 2, Finished: 1, ByPhase: map[string]int{"lobby": 2, "finished": 1}},
				Players: adminapi.Players{Total: 8, Connected: 5},
				QuestionPacks: []adminapi.QuestionPack{{
					ID: "classic", Name: "Classic mix", QuestionCount: 1,
					Items: []adminapi.PackItem{{Fields: []adminapi.ContentField{{Label: "Question", Value: "A question"}}}},
				}},
			},
			{
				Game:    adminapi.Game{ID: "trivia", Name: "Trivia"},
				Rooms:   adminapi.Rooms{Total: 4, Active: 4, ByPhase: map[string]int{"playing": 4}},
				Players: adminapi.Players{Total: 20, Connected: 12},
				QuestionPacks: []adminapi.QuestionPack{{
					ID: "general", Name: "General knowledge", QuestionCount: 1,
					Items: []adminapi.PackItem{{Fields: []adminapi.ContentField{{Label: "Question", Value: "Trivia question"}}}},
				}},
			},
		},
	})
	t.Cleanup(multiGameServer.Close)
	unavailable := httptest.NewServer(http.NotFoundHandler())
	unavailableURL := unavailable.URL
	unavailable.Close()

	coordinator, err := New([]string{multiGameServer.URL, unavailableURL}, nil, nil, nil, password)
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}
	request := httptest.NewRequest(http.MethodGet, "/v1/admin/overview", nil)
	request.Header.Set("Authorization", "Bearer "+password)
	recorder := httptest.NewRecorder()
	coordinator.Handler().ServeHTTP(recorder, request)
	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d: %s", recorder.Code, http.StatusOK, recorder.Body.String())
	}
	var overview adminapi.Overview
	if err := json.NewDecoder(recorder.Body).Decode(&overview); err != nil {
		t.Fatalf("decode overview: %v", err)
	}
	if overview.Totals.GameTypes != 2 || overview.Totals.ServerInstances != 2 || overview.Totals.UnavailableServers != 1 {
		t.Fatalf("instance totals = %+v", overview.Totals)
	}
	if overview.Totals.TotalRooms != 7 || overview.Totals.ActiveRooms != 6 || overview.Totals.ConnectedPlayers != 17 {
		t.Fatalf("activity totals = %+v", overview.Totals)
	}
	if len(overview.Games) != 2 || overview.Games[0].ID != "oddoneout" || overview.Games[1].ID != "trivia" {
		t.Fatalf("games = %+v", overview.Games)
	}
	if len(overview.Instances) != 2 || overview.Instances[0].URL == "" {
		t.Fatalf("instances = %+v", overview.Instances)
	}
	availableInstance := overview.Instances[0]
	if !availableInstance.Available {
		availableInstance = overview.Instances[1]
	}
	if len(availableInstance.GameIDs) != 2 || availableInstance.GameIDs[0] != "oddoneout" || availableInstance.GameIDs[1] != "trivia" {
		t.Fatalf("available instance games = %+v", availableInstance.GameIDs)
	}
}

func TestRoomSearchAggregatesAndRanksMultipleGames(t *testing.T) {
	gameServer := func(rooms []roomSuggestion) *httptest.Server {
		return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path != "/v1/rooms/search" || r.URL.Query().Get("q") != "fri" {
				http.NotFound(w, r)
				return
			}
			writeJSON(w, http.StatusOK, map[string]any{"rooms": rooms})
		}))
	}
	oddOneOut := gameServer([]roomSuggestion{
		{Name: "Our Friday Club", GameID: "oddoneout", GameName: "Odd One Out"},
		{Name: "Friday Friends", GameID: "oddoneout", GameName: "Odd One Out"},
	})
	t.Cleanup(oddOneOut.Close)
	trivia := gameServer([]roomSuggestion{
		{Name: "Friday Trivia", GameID: "trivia", GameName: "Trivia"},
		{Name: "Friday Friends", GameID: "oddoneout", GameName: "Odd One Out"},
	})
	t.Cleanup(trivia.Close)

	coordinator, err := New([]string{oddOneOut.URL, trivia.URL}, nil, nil, nil, "")
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}
	for roomID, entry := range map[string]assignment{
		"room_friends": {RoomID: "room_friends", RoomName: "Friday Friends", GameServerURL: oddOneOut.URL},
		"room_club":    {RoomID: "room_club", RoomName: "Our Friday Club", GameServerURL: oddOneOut.URL},
		"room_trivia":  {RoomID: "room_trivia", RoomName: "Friday Trivia", GameServerURL: trivia.URL},
	} {
		coordinator.byID[roomID] = entry
		coordinator.byName[strings.ToLower(entry.RoomName)] = roomID
	}
	request := httptest.NewRequest(http.MethodGet, "/v1/rooms/search?q=fri", nil)
	recorder := httptest.NewRecorder()
	coordinator.Handler().ServeHTTP(recorder, request)
	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusOK)
	}
	var payload struct {
		Rooms []roomSuggestion `json:"rooms"`
	}
	if err := json.NewDecoder(recorder.Body).Decode(&payload); err != nil {
		t.Fatalf("decode search: %v", err)
	}
	want := []string{"Friday Friends", "Friday Trivia", "Our Friday Club"}
	if len(payload.Rooms) != len(want) {
		t.Fatalf("rooms = %+v", payload.Rooms)
	}
	for i, name := range want {
		if payload.Rooms[i].Name != name {
			t.Errorf("rooms[%d] = %q, want %q", i, payload.Rooms[i].Name, name)
		}
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

	coordinator, err := New([]string{gameServer.URL}, nil, nil, nil, "")
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
