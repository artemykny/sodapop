package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/ak/skewa/backend/internal/game"
	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
)

func TestHTTPAndWebSocketRoomFlow(t *testing.T) {
	manager := game.NewManager(nil, nil)
	t.Cleanup(manager.Close)
	server := httptest.NewServer(New(manager, nil, nil).Handler())
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
	connection, _, err := websocket.Dial(ctx, wsURL, &websocket.DialOptions{Subprotocols: []string{"skewa", host.Token}})
	if err != nil {
		t.Fatalf("websocket.Dial() error = %v", err)
	}
	defer connection.CloseNow()

	if err := wsjson.Write(ctx, connection, clientMessage{Type: "start_game", RequestID: "req-1"}); err != nil {
		t.Fatalf("write start_game: %v", err)
	}
	state := readStateInPhase(t, ctx, connection, game.PhaseAnswering)
	if state.YourPrompt == "" || state.RealQuestion != "" {
		t.Fatalf("answering state leaked or omitted prompt: %+v", state)
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
		"questions":[{"real":"Best snack?","fake":"Worst snack?"}]
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

func readStateInPhase(t *testing.T, ctx context.Context, connection *websocket.Conn, phase game.Phase) game.View {
	t.Helper()
	for {
		var message struct {
			Type    string          `json:"type"`
			Payload json.RawMessage `json:"payload"`
		}
		if err := wsjson.Read(ctx, connection, &message); err != nil {
			t.Fatalf("read websocket message: %v", err)
		}
		if message.Type != "state" {
			continue
		}
		var state game.View
		if err := json.Unmarshal(message.Payload, &state); err != nil {
			t.Fatalf("decode state: %v", err)
		}
		if state.Phase == phase {
			return state
		}
	}
}
