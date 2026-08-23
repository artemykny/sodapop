package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/ak/sodapop/backend/internal/adminapi"
	game "github.com/ak/sodapop/backend/internal/games/oddoneout"
	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
)

func TestHTTPAndWebSocketRoomFlow(t *testing.T) {
	manager := game.NewManager(nil, nil)
	t.Cleanup(manager.Close)
	server := httptest.NewServer(New(manager, nil, nil, "").Handler())
	t.Cleanup(server.Close)

	host := createRoom(t, server.URL)
	joinRoom(t, server.URL, host.RoomID, "Bob")
	joinRoom(t, server.URL, host.RoomID, "Chandra")

	request, err := http.NewRequest(http.MethodGet, server.URL+"/v1/rooms/"+host.RoomID, nil)
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Authorization", "Bearer "+host.Token)
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("GET room: %v", err)
	}
	if response.StatusCode != http.StatusOK {
		t.Fatalf("GET room status = %d", response.StatusCode)
	}
	response.Body.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + host.WebSocketPath
	connection, _, err := websocket.Dial(ctx, wsURL, &websocket.DialOptions{Subprotocols: []string{"sodapop", host.Token}})
	if err != nil {
		t.Fatalf("websocket.Dial() error = %v", err)
	}
	defer connection.CloseNow()
	initialPayload := readPayloadOfType(t, ctx, connection, "sync")
	var initial game.View
	if err := json.Unmarshal(initialPayload, &initial); err != nil {
		t.Fatalf("decode initial sync: %v", err)
	}
	if initial.Phase != game.PhaseLobby || initial.YourPlayerID != host.PlayerID {
		t.Fatalf("initial sync = %+v", initial)
	}

	if err := wsjson.Write(ctx, connection, clientMessage{Type: "start_game", RequestID: "req-1"}); err != nil {
		t.Fatalf("write start_game: %v", err)
	}
	roundPayload := readPayloadOfType(t, ctx, connection, "round_started")
	var round roundStartedPayload
	if err := json.Unmarshal(roundPayload, &round); err != nil {
		t.Fatalf("decode round_started: %v", err)
	}
	if round.YourPrompt == "" || round.Round != 1 {
		t.Fatalf("round_started = %+v", round)
	}
	if bytes.Contains(roundPayload, []byte("real_question")) || bytes.Contains(roundPayload, []byte("questions")) {
		t.Fatalf("round_started leaked hidden state: %s", roundPayload)
	}
}

type testSession struct {
	game.Credentials
	WebSocketPath string `json:"websocket_path"`
}

func createRoom(t *testing.T, baseURL string) testSession {
	t.Helper()
	body := `{
			"name":"Friday Game","password":"secret","host_name":"Host",
			"settings":{"player_limit":6,"answer_seconds":30,"discussion_seconds":30,"voting_seconds":30,"rounds":1},
			"question_pack":"classic"
		}`
	response, err := http.Post(baseURL+"/v1/rooms", "application/json", strings.NewReader(body))
	if err != nil {
		t.Fatalf("POST room: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusCreated {
		t.Fatalf("POST room status = %d", response.StatusCode)
	}
	var session testSession
	if err := json.NewDecoder(response.Body).Decode(&session); err != nil {
		t.Fatalf("decode room response: %v", err)
	}
	return session
}

func TestQuestionPacksAndInvalidSelection(t *testing.T) {
	manager := game.NewManager(nil, nil)
	t.Cleanup(manager.Close)
	server := httptest.NewServer(New(manager, nil, nil, "").Handler())
	t.Cleanup(server.Close)

	response, err := http.Get(server.URL + "/v1/question-packs")
	if err != nil {
		t.Fatalf("GET question packs: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("GET question packs status = %d", response.StatusCode)
	}
	var catalog struct {
		Packs []struct {
			ID            string `json:"id"`
			QuestionCount int    `json:"question_count"`
		} `json:"packs"`
	}
	if err := json.NewDecoder(response.Body).Decode(&catalog); err != nil {
		t.Fatalf("decode question packs: %v", err)
	}
	if len(catalog.Packs) == 0 || catalog.Packs[0].ID == "" || catalog.Packs[0].QuestionCount == 0 {
		t.Fatalf("question pack catalog = %+v", catalog)
	}

	invalidBody := `{
		"name":"Invalid Pack","password":"","host_name":"Host",
		"settings":{"player_limit":6,"answer_seconds":30,"discussion_seconds":30,"voting_seconds":30,"rounds":1},
		"question_pack":"missing"
	}`
	invalid, err := http.Post(server.URL+"/v1/rooms", "application/json", strings.NewReader(invalidBody))
	if err != nil {
		t.Fatalf("POST invalid pack: %v", err)
	}
	defer invalid.Body.Close()
	if invalid.StatusCode != http.StatusBadRequest {
		t.Fatalf("POST invalid pack status = %d, want %d", invalid.StatusCode, http.StatusBadRequest)
	}
}

func TestCreateRoomRejectsTrailingJSONData(t *testing.T) {
	manager := game.NewManager(nil, nil)
	t.Cleanup(manager.Close)
	server := httptest.NewServer(New(manager, nil, nil, "").Handler())
	t.Cleanup(server.Close)

	body := `{
		"name":"Trailing Data","password":"","host_name":"Host",
		"settings":{"player_limit":6,"answer_seconds":30,"discussion_seconds":30,"voting_seconds":30,"rounds":1},
		"question_pack":"classic"
	} trailing garbage`
	response, err := http.Post(server.URL+"/v1/rooms", "application/json", strings.NewReader(body))
	if err != nil {
		t.Fatalf("POST room: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", response.StatusCode, http.StatusBadRequest)
	}
	if _, err := manager.FindByName("Trailing Data"); !errors.Is(err, game.ErrRoomNotFound) {
		t.Fatalf("invalid request created room: %v", err)
	}
}

func TestAdminStatsRequireLongPassword(t *testing.T) {
	manager := game.NewManager(nil, nil)
	t.Cleanup(manager.Close)
	password := strings.Repeat("admin-secret-", 40)
	server := httptest.NewServer(New(manager, nil, nil, password).Handler())
	t.Cleanup(server.Close)
	createRoom(t, server.URL)

	unauthorized, err := http.Get(server.URL + "/v1/admin/stats")
	if err != nil {
		t.Fatalf("GET unauthorized admin stats: %v", err)
	}
	unauthorized.Body.Close()
	if unauthorized.StatusCode != http.StatusUnauthorized {
		t.Fatalf("unauthorized status = %d, want %d", unauthorized.StatusCode, http.StatusUnauthorized)
	}

	request, err := http.NewRequest(http.MethodGet, server.URL+"/v1/admin/stats", nil)
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Authorization", "Bearer "+password)
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("GET admin stats: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("admin status = %d, want %d", response.StatusCode, http.StatusOK)
	}
	var stats adminapi.GameServerStats
	if err := json.NewDecoder(response.Body).Decode(&stats); err != nil {
		t.Fatalf("decode admin stats: %v", err)
	}
	if len(stats.Games) != 1 || stats.Games[0].Game.ID != "oddoneout" ||
		stats.Games[0].Rooms.Total != 1 || stats.Games[0].Rooms.Active != 1 {
		t.Fatalf("admin stats = %+v", stats)
	}
	gameStats := stats.Games[0]
	if len(gameStats.QuestionPacks) == 0 || gameStats.QuestionPacks[0].QuestionCount == 0 ||
		len(gameStats.QuestionPacks[0].Items) != gameStats.QuestionPacks[0].QuestionCount {
		t.Fatalf("question packs = %+v", gameStats.QuestionPacks)
	}
	if got := gameStats.QuestionPacks[0].Items[0].Fields; len(got) != 2 || got[0].Value == "" || got[1].Value == "" {
		t.Fatalf("question fields = %+v", got)
	}
}

func TestRoomSearchReturnsOnlyPublicJoinableMetadata(t *testing.T) {
	manager := game.NewManager(nil, nil)
	t.Cleanup(manager.Close)
	server := httptest.NewServer(New(manager, nil, nil, "").Handler())
	t.Cleanup(server.Close)
	createRoom(t, server.URL)

	response, err := http.Get(server.URL + "/v1/rooms/search?q=fri")
	if err != nil {
		t.Fatalf("GET room search: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want %d", response.StatusCode, http.StatusOK)
	}
	body, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatalf("read search response: %v", err)
	}
	var payload struct {
		Rooms []roomSuggestion `json:"rooms"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		t.Fatalf("decode search: %v", err)
	}
	if len(payload.Rooms) != 1 || payload.Rooms[0].Name != "Friday Game" || payload.Rooms[0].GameID != "oddoneout" {
		t.Fatalf("rooms = %+v", payload.Rooms)
	}
	for _, forbidden := range []string{"room_id", "password", "question", "player"} {
		if bytes.Contains(bytes.ToLower(body), []byte(forbidden)) {
			t.Fatalf("search leaked %q: %s", forbidden, body)
		}
	}
}

func joinRoom(t *testing.T, baseURL, roomID, displayName string) testSession {
	t.Helper()
	payload, _ := json.Marshal(map[string]string{"display_name": displayName, "password": "secret"})
	response, err := http.Post(
		fmt.Sprintf("%s/v1/rooms/%s/players", baseURL, roomID),
		"application/json", bytes.NewReader(payload),
	)
	if err != nil {
		t.Fatalf("POST player: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusCreated {
		t.Fatalf("POST player status = %d", response.StatusCode)
	}
	var session testSession
	if err := json.NewDecoder(response.Body).Decode(&session); err != nil {
		t.Fatalf("decode player response: %v", err)
	}
	return session
}

func readPayloadOfType(t *testing.T, ctx context.Context, connection *websocket.Conn, messageType string) json.RawMessage {
	t.Helper()
	for {
		var message struct {
			Type    string          `json:"type"`
			Payload json.RawMessage `json:"payload"`
		}
		if err := wsjson.Read(ctx, connection, &message); err != nil {
			t.Fatalf("read websocket message: %v", err)
		}
		if message.Type != messageType {
			continue
		}
		return message.Payload
	}
}
