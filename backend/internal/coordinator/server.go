package coordinator

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/ak/skewa/backend/internal/adminapi"
	"github.com/ak/skewa/backend/internal/middleware"
)

const maxBodyBytes = 1 << 20
const adminStatsTimeout = 5 * time.Second
const maxRoomSuggestions = 10

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
	adminAuth      adminapi.Auth
}

func New(gameServers []string, client *http.Client, logger *slog.Logger, originPatterns []string, adminPassword string) (*Server, error) {
	cleaned := make([]string, 0, len(gameServers))
	for _, rawURL := range gameServers {
		rawURL = strings.TrimRight(strings.TrimSpace(rawURL), "/")
		parsed, err := url.Parse(rawURL)
		if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" ||
			parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" {
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
		adminAuth: adminapi.NewAuth(adminPassword),
	}, nil
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", s.health)
	mux.HandleFunc("GET /v1/question-packs", s.questionPacks)
	mux.HandleFunc("GET /v1/admin/overview", s.adminOverview)
	mux.HandleFunc("GET /v1/rooms/search", s.searchRooms)
	mux.HandleFunc("POST /v1/rooms", s.createRoom)
	mux.HandleFunc("GET /v1/rooms/{roomID}", s.resolveByID)
	mux.HandleFunc("GET /v1/rooms", s.resolveByName)
	return middleware.CORS(s.originPatterns, mux)
}

type roomSuggestion struct {
	Name     string `json:"name"`
	GameID   string `json:"game_id"`
	GameName string `json:"game_name"`
}

type roomSearchResult struct {
	serverURL string
	rooms     []roomSuggestion
}

func (s *Server) searchRooms(w http.ResponseWriter, r *http.Request) {
	query := strings.TrimSpace(r.URL.Query().Get("q"))
	if len([]rune(query)) < 2 {
		writeJSON(w, http.StatusOK, map[string]any{"rooms": []roomSuggestion{}})
		return
	}
	if len([]rune(query)) > 60 {
		writeProblem(w, http.StatusBadRequest, "invalid_request", "room search must not exceed 60 characters")
		return
	}
	results := make(chan roomSearchResult, len(s.gameServers))
	for _, serverURL := range s.gameServers {
		go func() {
			results <- s.fetchRoomSuggestions(r.Context(), serverURL, query)
		}()
	}

	deduplicated := make(map[string]roomSuggestion)
	for range s.gameServers {
		result := <-results
		for _, room := range result.rooms {
			assignment, assigned := s.findByName(room.Name)
			if !assigned || assignment.GameServerURL != result.serverURL {
				continue
			}
			key := strings.ToLower(room.GameID) + "\x00" + strings.ToLower(room.Name)
			deduplicated[key] = room
		}
	}
	rooms := make([]roomSuggestion, 0, len(deduplicated))
	for _, room := range deduplicated {
		rooms = append(rooms, room)
	}
	normalizedQuery := strings.ToLower(query)
	sort.Slice(rooms, func(i, j int) bool {
		iPrefix := strings.HasPrefix(strings.ToLower(rooms[i].Name), normalizedQuery)
		jPrefix := strings.HasPrefix(strings.ToLower(rooms[j].Name), normalizedQuery)
		if iPrefix != jPrefix {
			return iPrefix
		}
		if !strings.EqualFold(rooms[i].Name, rooms[j].Name) {
			return strings.ToLower(rooms[i].Name) < strings.ToLower(rooms[j].Name)
		}
		return strings.ToLower(rooms[i].GameName) < strings.ToLower(rooms[j].GameName)
	})
	if len(rooms) > maxRoomSuggestions {
		rooms = rooms[:maxRoomSuggestions]
	}
	writeJSON(w, http.StatusOK, map[string]any{"rooms": rooms})
}

func (s *Server) fetchRoomSuggestions(parent context.Context, serverURL, query string) roomSearchResult {
	ctx, cancel := context.WithTimeout(parent, adminStatsTimeout)
	defer cancel()
	endpoint := serverURL + "/v1/rooms/search?q=" + url.QueryEscape(query)
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return roomSearchResult{serverURL: serverURL}
	}
	response, err := s.client.Do(request)
	if err != nil {
		return roomSearchResult{serverURL: serverURL}
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return roomSearchResult{serverURL: serverURL}
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, maxBodyBytes+1))
	if err != nil || len(body) > maxBodyBytes {
		return roomSearchResult{serverURL: serverURL}
	}
	var payload struct {
		Rooms []roomSuggestion `json:"rooms"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		return roomSearchResult{serverURL: serverURL}
	}
	valid := make([]roomSuggestion, 0, len(payload.Rooms))
	for _, room := range payload.Rooms {
		room.Name = strings.TrimSpace(room.Name)
		room.GameID = strings.TrimSpace(room.GameID)
		room.GameName = strings.TrimSpace(room.GameName)
		if len([]rune(room.Name)) < 1 || len([]rune(room.Name)) > 60 || room.GameID == "" || room.GameName == "" {
			continue
		}
		valid = append(valid, room)
	}
	return roomSearchResult{serverURL: serverURL, rooms: valid}
}

type adminStatsResult struct {
	instance adminapi.Instance
	stats    *adminapi.GameServerStats
}

type gameAggregate struct {
	overview adminapi.GameOverview
	packs    map[string]adminapi.QuestionPack
}

func (s *Server) adminOverview(w http.ResponseWriter, r *http.Request) {
	if !s.adminAuth.Require(w, r) {
		return
	}
	results := make(chan adminStatsResult, len(s.gameServers))
	authorization := r.Header.Get("Authorization")
	for _, serverURL := range s.gameServers {
		go func() {
			results <- s.fetchAdminStats(r.Context(), authorization, serverURL)
		}()
	}

	overview := adminapi.Overview{
		GeneratedAt: time.Now().UTC(),
		Totals:      adminapi.Totals{ServerInstances: len(s.gameServers)},
		Instances:   make([]adminapi.Instance, 0, len(s.gameServers)),
	}
	aggregates := make(map[string]*gameAggregate)
	allResults := make([]adminStatsResult, 0, len(s.gameServers))
	for range s.gameServers {
		allResults = append(allResults, <-results)
	}
	sort.Slice(allResults, func(i, j int) bool { return allResults[i].instance.URL < allResults[j].instance.URL })
	for _, result := range allResults {
		overview.Instances = append(overview.Instances, result.instance)
		if result.stats == nil {
			overview.Totals.UnavailableServers++
			continue
		}
		stats := result.stats
		aggregate := aggregates[stats.Game.ID]
		if aggregate == nil {
			aggregate = &gameAggregate{
				overview: adminapi.GameOverview{
					Game: stats.Game, Rooms: adminapi.Rooms{ByPhase: make(map[string]int)},
				},
				packs: make(map[string]adminapi.QuestionPack),
			}
			aggregates[stats.Game.ID] = aggregate
		}
		aggregate.overview.ServerInstances++
		aggregate.overview.Rooms.Total += stats.Rooms.Total
		aggregate.overview.Rooms.Active += stats.Rooms.Active
		aggregate.overview.Rooms.Finished += stats.Rooms.Finished
		for phase, count := range stats.Rooms.ByPhase {
			aggregate.overview.Rooms.ByPhase[phase] += count
		}
		aggregate.overview.Players.Total += stats.Players.Total
		aggregate.overview.Players.Connected += stats.Players.Connected
		for _, pack := range stats.QuestionPacks {
			aggregate.packs[pack.ID] = pack
		}
		overview.Totals.TotalRooms += stats.Rooms.Total
		overview.Totals.ActiveRooms += stats.Rooms.Active
		overview.Totals.ConnectedPlayers += stats.Players.Connected
	}

	overview.Games = make([]adminapi.GameOverview, 0, len(aggregates))
	for _, aggregate := range aggregates {
		for _, pack := range aggregate.packs {
			aggregate.overview.QuestionPacks = append(aggregate.overview.QuestionPacks, pack)
		}
		sort.Slice(aggregate.overview.QuestionPacks, func(i, j int) bool {
			return aggregate.overview.QuestionPacks[i].Name < aggregate.overview.QuestionPacks[j].Name
		})
		overview.Games = append(overview.Games, aggregate.overview)
	}
	sort.Slice(overview.Games, func(i, j int) bool { return overview.Games[i].Name < overview.Games[j].Name })
	overview.Totals.GameTypes = len(overview.Games)
	writeJSON(w, http.StatusOK, overview)
}

func (s *Server) fetchAdminStats(parent context.Context, authorization, serverURL string) adminStatsResult {
	instance := adminapi.Instance{URL: serverURL}
	ctx, cancel := context.WithTimeout(parent, adminStatsTimeout)
	defer cancel()
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, serverURL+"/v1/admin/stats", nil)
	if err != nil {
		instance.Error = "could not create request"
		return adminStatsResult{instance: instance}
	}
	request.Header.Set("Authorization", authorization)
	response, err := s.client.Do(request)
	if err != nil {
		instance.Error = "server did not respond"
		return adminStatsResult{instance: instance}
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		instance.Error = fmt.Sprintf("server returned %d", response.StatusCode)
		return adminStatsResult{instance: instance}
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, maxBodyBytes+1))
	if err != nil || len(body) > maxBodyBytes {
		instance.Error = "server returned an oversized or unreadable response"
		return adminStatsResult{instance: instance}
	}
	var stats adminapi.GameServerStats
	if err := json.Unmarshal(body, &stats); err != nil || !validAdminStats(stats) {
		instance.Error = "server returned invalid statistics"
		return adminStatsResult{instance: instance}
	}
	instance.Available = true
	instance.GameID = stats.Game.ID
	return adminStatsResult{instance: instance, stats: &stats}
}

func validAdminStats(stats adminapi.GameServerStats) bool {
	if strings.TrimSpace(stats.Game.ID) == "" || strings.TrimSpace(stats.Game.Name) == "" ||
		stats.Rooms.Total < 0 || stats.Rooms.Active < 0 || stats.Rooms.Finished < 0 ||
		stats.Rooms.Active+stats.Rooms.Finished != stats.Rooms.Total ||
		stats.Players.Total < 0 || stats.Players.Connected < 0 || stats.Players.Connected > stats.Players.Total {
		return false
	}
	roomsByPhase := 0
	for _, count := range stats.Rooms.ByPhase {
		if count < 0 {
			return false
		}
		roomsByPhase += count
	}
	if roomsByPhase != stats.Rooms.Total {
		return false
	}
	for _, pack := range stats.QuestionPacks {
		if strings.TrimSpace(pack.ID) == "" || strings.TrimSpace(pack.Name) == "" ||
			pack.QuestionCount < 1 || len(pack.Items) != pack.QuestionCount {
			return false
		}
		for _, item := range pack.Items {
			if len(item.Fields) == 0 {
				return false
			}
			for _, field := range item.Fields {
				if strings.TrimSpace(field.Label) == "" || strings.TrimSpace(field.Value) == "" {
					return false
				}
			}
		}
	}
	return true
}

func (s *Server) health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) questionPacks(w http.ResponseWriter, r *http.Request) {
	serverURL := s.gameServers[0]
	request, err := http.NewRequestWithContext(r.Context(), http.MethodGet, serverURL+"/v1/question-packs", nil)
	if err != nil {
		writeProblem(w, http.StatusInternalServerError, "internal_error", "could not create game-server request")
		return
	}
	response, err := s.client.Do(request)
	if err != nil {
		s.logger.Error("question catalog request failed", "game_server_url", serverURL, "error", err)
		writeProblem(w, http.StatusBadGateway, "game_server_unavailable", "question catalog is unavailable")
		return
	}
	defer response.Body.Close()
	body, err := io.ReadAll(io.LimitReader(response.Body, maxBodyBytes+1))
	if err != nil || len(body) > maxBodyBytes {
		writeProblem(w, http.StatusBadGateway, "invalid_game_server_response", "game server returned an invalid response")
		return
	}
	copyResponse(w, response.StatusCode, response.Header.Get("Content-Type"), body)
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
