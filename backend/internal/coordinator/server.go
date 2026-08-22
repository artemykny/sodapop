package coordinator

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/ak/skewa/backend/internal/middleware"
)

const maxBodyBytes = 1 << 20

type assignment struct {
	RoomID        string `json:"room_id"`
	RoomName      string `json:"room_name"`
	GameServerURL string `json:"game_server_url"`
}

type Server struct {
	gameServers    []string
	client         *http.Client
	logger         *slog.Logger
	next           atomic.Uint64
	mu             sync.RWMutex
	byID           map[string]assignment
	byName         map[string]string
	pendingNames   map[string]struct{}
	originPatterns []string
}

func New(gameServers []string, client *http.Client, logger *slog.Logger, originPatterns []string) (*Server, error) {
	cleaned := make([]string, 0, len(gameServers))
	for _, rawURL := range gameServers {
		rawURL = strings.TrimRight(strings.TrimSpace(rawURL), "/")
		parsed, err := url.Parse(rawURL)
		if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" {
			return nil, fmt.Errorf("invalid game server URL %q", rawURL)
		}
		cleaned = append(cleaned, rawURL)
	}
	if len(cleaned) == 0 {
		return nil, errors.New("at least one game server URL is required")
	}
	if client == nil {
		client = &http.Client{Timeout: 15 * time.Second}
	}
	if logger == nil {
		logger = slog.Default()
	}
	return &Server{
		gameServers: cleaned, client: client, logger: logger,
		byID: make(map[string]assignment), byName: make(map[string]string),
		pendingNames: make(map[string]struct{}), originPatterns: originPatterns,
	}, nil
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", s.health)
	mux.HandleFunc("POST /v1/rooms", s.createRoom)
	mux.HandleFunc("GET /v1/rooms/{roomID}", s.resolveByID)
	mux.HandleFunc("GET /v1/rooms", s.resolveByName)
	return middleware.CORS(s.originPatterns, mux)
}

func (s *Server) health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) createRoom(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxBodyBytes))
	if err != nil {
		writeProblem(w, http.StatusBadRequest, "invalid_request", "request body is too large")
		return
	}
	var request struct {
		Name string `json:"name"`
	}
	if err := json.Unmarshal(body, &request); err != nil || strings.TrimSpace(request.Name) == "" {
		writeProblem(w, http.StatusBadRequest, "invalid_request", "room name is required")
		return
	}
	nameKey := strings.ToLower(strings.TrimSpace(request.Name))
	s.mu.Lock()
	_, assigned := s.byName[nameKey]
	_, pending := s.pendingNames[nameKey]
	if !assigned && !pending {
		s.pendingNames[nameKey] = struct{}{}
	}
	s.mu.Unlock()
	if assigned || pending {
		writeProblem(w, http.StatusConflict, "name_taken", "room name is already in use")
		return
	}
	defer func() {
		s.mu.Lock()
		delete(s.pendingNames, nameKey)
		s.mu.Unlock()
	}()

	serverURL := s.gameServers[int(s.next.Add(1)-1)%len(s.gameServers)]
	proxyRequest, err := http.NewRequestWithContext(r.Context(), http.MethodPost, serverURL+"/v1/rooms", bytes.NewReader(body))
	if err != nil {
		writeProblem(w, http.StatusInternalServerError, "internal_error", "could not create game-server request")
		return
	}
	proxyRequest.Header.Set("Content-Type", "application/json")
	response, err := s.client.Do(proxyRequest)
	if err != nil {
		s.logger.Error("game server request failed", "game_server_url", serverURL, "error", err)
		writeProblem(w, http.StatusBadGateway, "game_server_unavailable", "selected game server is unavailable")
		return
	}
	defer response.Body.Close()
	responseBody, err := io.ReadAll(io.LimitReader(response.Body, maxBodyBytes+1))
	if err != nil || len(responseBody) > maxBodyBytes {
		writeProblem(w, http.StatusBadGateway, "invalid_game_server_response", "game server returned an invalid response")
		return
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		copyResponse(w, response.StatusCode, response.Header.Get("Content-Type"), responseBody)
		return
	}
	var created struct {
		RoomID string `json:"room_id"`
	}
	if err := json.Unmarshal(responseBody, &created); err != nil || created.RoomID == "" {
		writeProblem(w, http.StatusBadGateway, "invalid_game_server_response", "game server omitted the room id")
		return
	}
	entry := assignment{RoomID: created.RoomID, RoomName: strings.TrimSpace(request.Name), GameServerURL: serverURL}
	s.mu.Lock()
	s.byID[entry.RoomID] = entry
	s.byName[nameKey] = entry.RoomID
	s.mu.Unlock()

	var payload map[string]any
	if err := json.Unmarshal(responseBody, &payload); err != nil {
		writeProblem(w, http.StatusBadGateway, "invalid_game_server_response", "game server returned invalid JSON")
		return
	}
	payload["game_server_url"] = serverURL
	writeJSON(w, response.StatusCode, payload)
}

func (s *Server) resolveByID(w http.ResponseWriter, r *http.Request) {
	s.mu.RLock()
	entry, ok := s.byID[r.PathValue("roomID")]
	s.mu.RUnlock()
	if !ok {
		writeProblem(w, http.StatusNotFound, "room_not_found", "room was not found")
		return
	}
	writeJSON(w, http.StatusOK, entry)
}

func (s *Server) resolveByName(w http.ResponseWriter, r *http.Request) {
	name := strings.TrimSpace(r.URL.Query().Get("name"))
	if name == "" {
		writeProblem(w, http.StatusBadRequest, "invalid_request", "name query parameter is required")
		return
	}
	entry, ok := s.findByName(name)
	if !ok {
		writeProblem(w, http.StatusNotFound, "room_not_found", "room was not found")
		return
	}
	writeJSON(w, http.StatusOK, entry)
}

func (s *Server) findByName(name string) (assignment, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	roomID, ok := s.byName[strings.ToLower(strings.TrimSpace(name))]
	if !ok {
		return assignment{}, false
	}
	entry, ok := s.byID[roomID]
	return entry, ok
}

func copyResponse(w http.ResponseWriter, status int, contentType string, body []byte) {
	if contentType != "" {
		w.Header().Set("Content-Type", contentType)
	}
	w.WriteHeader(status)
	_, _ = w.Write(body)
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeProblem(w http.ResponseWriter, status int, code, detail string) {
	w.Header().Set("Content-Type", "application/problem+json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"type": "about:blank", "title": http.StatusText(status),
		"status": status, "code": code, "detail": detail,
	})
}
