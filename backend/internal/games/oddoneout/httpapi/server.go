package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/ak/sodapop/backend/internal/adminapi"
	game "github.com/ak/sodapop/backend/internal/games/oddoneout"
	"github.com/ak/sodapop/backend/internal/games/oddoneout/questionpacks"
	"github.com/ak/sodapop/backend/internal/middleware"
	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
)

const maxRequestBytes = 1 << 20
const maxRoomSuggestions = 10

type Server struct {
	manager        *game.Manager
	packStore      questionpacks.Store
	logger         *slog.Logger
	allowedOrigins []string
	originPatterns []string
	adminAuth      adminapi.Auth

	connectionsMu sync.Mutex
	connections   map[string]int
}

func New(manager *game.Manager, logger *slog.Logger, originPatterns []string, adminPassword string) *Server {
	return NewWithQuestionPacks(manager, questionpacks.NewMemoryStore(nil), logger, originPatterns, adminPassword)
}

func NewWithQuestionPacks(manager *game.Manager, packs questionpacks.Store, logger *slog.Logger, originPatterns []string, adminPassword string) *Server {
	if logger == nil {
		logger = slog.Default()
	}
	if packs == nil {
		packs = questionpacks.NewMemoryStore(nil)
	}
	return &Server{
		manager: manager, packStore: packs, logger: logger, allowedOrigins: slices.Clone(originPatterns),
		originPatterns: middleware.OriginHostPatterns(originPatterns),
		adminAuth:      adminapi.NewAuth(adminPassword),
		connections:    make(map[string]int),
	}
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", s.health)
	mux.HandleFunc("GET /v1/question-packs", s.questionPacks)
	mux.HandleFunc("GET /v1/rooms/search", s.searchRooms)
	mux.HandleFunc("GET /v1/admin/stats", s.adminStats)
	mux.HandleFunc("PUT /v1/admin/question-packs/{packID}", s.saveQuestionPack)
	mux.HandleFunc("DELETE /v1/admin/question-packs/{packID}", s.deleteQuestionPack)
	mux.HandleFunc("POST /v1/rooms", s.createRoom)
	mux.HandleFunc("GET /v1/rooms/{roomID}", s.getRoom)
	mux.HandleFunc("POST /v1/rooms/{roomID}/players", s.joinRoom)
	mux.HandleFunc("GET /v1/rooms/{roomID}/ws", s.roomWebSocket)
	return s.recoverPanic(s.logRequest(middleware.CORS(s.allowedOrigins, mux)))
}

type roomSuggestion struct {
	Name      string `json:"name"`
	GameID    string `json:"game_id"`
	GameName  string `json:"game_name"`
	Protected bool   `json:"protected"`
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
	matches := s.manager.SearchJoinable(query, maxRoomSuggestions)
	rooms := make([]roomSuggestion, 0, len(matches))
	for _, room := range matches {
		rooms = append(rooms, roomSuggestion{
			Name: room.Name, GameID: "oddoneout", GameName: "Odd One Out", Protected: room.Protected,
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"rooms": rooms})
}

func (s *Server) adminStats(w http.ResponseWriter, r *http.Request) {
	if !s.adminAuth.Require(w, r) {
		return
	}
	stats := s.manager.Stats()
	byPhase := make(map[string]int, len(stats.RoomsByPhase))
	for phase, count := range stats.RoomsByPhase {
		byPhase[string(phase)] = count
	}
	packs, err := s.packStore.ListQuestionPacks(r.Context())
	if err != nil {
		s.logger.Error("list question packs for admin", "error", err)
		writeProblem(w, http.StatusInternalServerError, "question_catalog_unavailable", "question packs could not be loaded")
		return
	}
	packStats := make([]adminapi.QuestionPack, 0, len(packs))
	for _, pack := range packs {
		items := make([]adminapi.PackItem, 0, len(pack.Questions))
		for _, question := range pack.Questions {
			items = append(items, adminapi.PackItem{Fields: []adminapi.ContentField{
				{Label: "Question", Value: question.Real},
				{Label: "Odd question", Value: question.Fake},
			}})
		}
		packStats = append(packStats, adminapi.QuestionPack{
			ID: pack.ID, Name: pack.Name, Description: pack.Description,
			QuestionCount: len(pack.Questions), Items: items,
		})
	}
	writeJSON(w, http.StatusOK, adminapi.GameServerStats{
		Games: []adminapi.GameStats{{
			Game: adminapi.Game{ID: "oddoneout", Name: "Odd One Out"},
			Rooms: adminapi.Rooms{
				Total: stats.RoomsTotal, Active: stats.RoomsActive,
				Finished: stats.RoomsFinished, ByPhase: byPhase,
			},
			Players:       adminapi.Players{Total: stats.PlayersTotal, Connected: stats.PlayersConnected},
			QuestionPacks: packStats,
		}},
	})
}

type createRoomRequest struct {
	RoomID       string          `json:"room_id,omitempty"`
	Name         string          `json:"name"`
	Password     string          `json:"password"`
	HostName     string          `json:"host_name"`
	Settings     game.Settings   `json:"settings"`
	QuestionPack string          `json:"question_pack,omitempty"`
	Questions    []game.Question `json:"questions,omitempty"`
}

type joinRoomRequest struct {
	DisplayName string `json:"display_name"`
	Password    string `json:"password"`
}

type sessionResponse struct {
	game.Credentials
	WebSocketPath string `json:"websocket_path"`
}

func (s *Server) health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) questionPacks(w http.ResponseWriter, r *http.Request) {
	packs, err := s.packStore.ListQuestionPacks(r.Context())
	if err != nil {
		s.logger.Error("list question packs", "error", err)
		writeProblem(w, http.StatusInternalServerError, "question_catalog_unavailable", "question packs could not be loaded")
		return
	}
	metadata := make([]questionpacks.Metadata, 0, len(packs))
	for _, pack := range packs {
		metadata = append(metadata, questionpacks.Metadata{
			ID: pack.ID, Name: pack.Name, Description: pack.Description, QuestionCount: len(pack.Questions),
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"packs": metadata})
}

func (s *Server) createRoom(w http.ResponseWriter, r *http.Request) {
	var request createRoomRequest
	if err := decodeJSON(w, r, &request); err != nil {
		writeProblem(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	questions, err := s.roomQuestions(r.Context(), request.QuestionPack, request.Questions)
	if err != nil {
		writeProblem(w, http.StatusBadRequest, "invalid_question_source", err.Error())
		return
	}
	_, credentials, err := s.manager.Create(game.CreateRoomParams{
		ID: request.RoomID, Name: request.Name, Password: request.Password,
		HostName: request.HostName, Settings: request.Settings, Questions: questions,
	})
	if err != nil {
		writeGameError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, sessionResponse{
		Credentials:   credentials,
		WebSocketPath: fmt.Sprintf("/v1/rooms/%s/ws", credentials.RoomID),
	})
}

func (s *Server) roomQuestions(ctx context.Context, packID string, custom []game.Question) ([]game.Question, error) {
	if packID != "" && len(custom) > 0 {
		return nil, errors.New("choose either question_pack or custom questions")
	}
	if packID != "" {
		pack, err := s.packStore.GetQuestionPack(ctx, packID)
		if errors.Is(err, questionpacks.ErrNotFound) {
			return nil, fmt.Errorf("question pack %q was not found", packID)
		}
		if err != nil {
			return nil, errors.New("question catalog is unavailable")
		}
		return pack.Questions, nil
	}
	if len(custom) == 0 {
		return nil, errors.New("question_pack or custom questions are required")
	}
	return custom, nil
}

func (s *Server) saveQuestionPack(w http.ResponseWriter, r *http.Request) {
	if !s.adminAuth.Require(w, r) {
		return
	}
	var pack questionpacks.Pack
	if err := decodeJSON(w, r, &pack); err != nil {
		writeProblem(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	pack.ID = r.PathValue("packID")
	pack = questionpacks.Normalize(pack)
	if err := questionpacks.Validate(pack); err != nil {
		writeProblem(w, http.StatusBadRequest, "invalid_question_pack", err.Error())
		return
	}
	if err := s.packStore.SaveQuestionPack(r.Context(), pack); err != nil {
		s.logger.Error("save question pack", "pack_id", pack.ID, "error", err)
		writeProblem(w, http.StatusInternalServerError, "question_pack_save_failed", "question pack could not be saved")
		return
	}
	writeJSON(w, http.StatusOK, pack)
}

func (s *Server) deleteQuestionPack(w http.ResponseWriter, r *http.Request) {
	if !s.adminAuth.Require(w, r) {
		return
	}
	id := r.PathValue("packID")
	if err := s.packStore.DeleteQuestionPack(r.Context(), id); err != nil {
		if errors.Is(err, questionpacks.ErrNotFound) {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		s.logger.Error("delete question pack", "pack_id", id, "error", err)
		writeProblem(w, http.StatusInternalServerError, "question_pack_delete_failed", "question pack could not be deleted")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) joinRoom(w http.ResponseWriter, r *http.Request) {
	room, err := s.manager.Get(r.PathValue("roomID"))
	if err != nil {
		writeGameError(w, err)
		return
	}
	var request joinRoomRequest
	if err := decodeJSON(w, r, &request); err != nil {
		writeProblem(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	credentials, err := room.Join(request.DisplayName, request.Password)
	if err != nil {
		writeGameError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, sessionResponse{
		Credentials:   credentials,
		WebSocketPath: fmt.Sprintf("/v1/rooms/%s/ws", credentials.RoomID),
	})
}

func (s *Server) getRoom(w http.ResponseWriter, r *http.Request) {
	room, err := s.manager.Get(r.PathValue("roomID"))
	if err != nil {
		writeGameError(w, err)
		return
	}
	playerID, err := room.Authenticate(bearerToken(r))
	if err != nil {
		writeGameError(w, err)
		return
	}
	state, err := room.View(playerID)
	if err != nil {
		writeGameError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, state)
}

type clientMessage struct {
	Type      string          `json:"type"`
	RequestID string          `json:"request_id,omitempty"`
	Payload   json.RawMessage `json:"payload,omitempty"`
}

type serverMessage struct {
	Type      string `json:"type"`
	RequestID string `json:"request_id,omitempty"`
	Payload   any    `json:"payload,omitempty"`
}

type commandError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

func (s *Server) roomWebSocket(w http.ResponseWriter, r *http.Request) {
	room, err := s.manager.Get(r.PathValue("roomID"))
	if err != nil {
		writeGameError(w, err)
		return
	}
	token := webSocketToken(r)
	playerID, err := room.Authenticate(token)
	if err != nil {
		writeGameError(w, err)
		return
	}
	connection, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		OriginPatterns: s.originPatterns,
		Subprotocols:   []string{"sodapop"},
	})
	if err != nil {
		s.logger.Warn("accept websocket", "room_id", room.IDValue(), "error", err)
		return
	}
	defer connection.CloseNow()
	connection.SetReadLimit(maxRequestBytes)

	s.setConnected(room, playerID, true)
	defer s.setConnected(room, playerID, false)
	updates, unsubscribe, err := s.manager.Subscribe(room.IDValue())
	if err != nil {
		_ = connection.Close(websocket.StatusInternalError, "could not subscribe to room")
		return
	}
	defer unsubscribe()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	outbound := make(chan serverMessage, 16)
	readDone := make(chan error, 1)
	go s.readCommands(ctx, connection, room, playerID, outbound, readDone)
	var previous *game.View

	for {
		select {
		case <-ctx.Done():
			return
		case err := <-readDone:
			if websocket.CloseStatus(err) != websocket.StatusNormalClosure && !errors.Is(err, context.Canceled) {
				s.logger.Debug("websocket reader stopped", "room_id", room.IDValue(), "player_id", playerID, "error", err)
			}
			return
		case <-updates:
			state, err := room.View(playerID)
			if err != nil {
				return
			}
			message, send := roomUpdate(previous, state)
			previous = &state
			if send && s.writeWebSocket(ctx, connection, message) != nil {
				return
			}
		case message := <-outbound:
			if s.writeWebSocket(ctx, connection, message) != nil {
				return
			}
		}
	}
}

func (s *Server) readCommands(
	ctx context.Context,
	connection *websocket.Conn,
	room *game.Room,
	playerID string,
	outbound chan<- serverMessage,
	done chan<- error,
) {
	for {
		var message clientMessage
		if err := wsjson.Read(ctx, connection, &message); err != nil {
			done <- err
			return
		}
		err := executeCommand(room, playerID, message)
		response := serverMessage{Type: "ack", RequestID: message.RequestID}
		if err != nil {
			response.Type = "error"
			response.Payload = commandError{Code: errorCode(err), Message: err.Error()}
		}
		select {
		case outbound <- response:
		case <-ctx.Done():
			return
		}
	}
}

func executeCommand(room *game.Room, playerID string, message clientMessage) error {
	switch message.Type {
	case "start_game":
		return room.Start(playerID)
	case "update_settings":
		var payload struct {
			Settings game.Settings `json:"settings"`
		}
		if err := json.Unmarshal(message.Payload, &payload); err != nil {
			return errors.New("update_settings payload is invalid")
		}
		return room.UpdateSettings(playerID, payload.Settings)
	case "pause_game":
		return room.Pause(playerID)
	case "resume_game":
		return room.Resume(playerID)
	case "submit_answer":
		var payload struct {
			Answer string `json:"answer"`
		}
		if err := json.Unmarshal(message.Payload, &payload); err != nil {
			return errors.New("submit_answer payload is invalid")
		}
		return room.SubmitAnswer(playerID, payload.Answer)
	case "unlock_answer":
		return room.UnlockAnswer(playerID)
	case "cast_vote":
		var payload struct {
			PlayerID string `json:"player_id"`
		}
		if err := json.Unmarshal(message.Payload, &payload); err != nil {
			return errors.New("cast_vote payload is invalid")
		}
		return room.CastVote(playerID, payload.PlayerID)
	case "unlock_vote":
		return room.UnlockVote(playerID)
	case "advance":
		return room.Advance(playerID)
	case "stop_game":
		return room.Stop(playerID)
	case "ping":
		return nil
	default:
		return fmt.Errorf("unknown command type %q", message.Type)
	}
}

func (s *Server) writeWebSocket(ctx context.Context, connection *websocket.Conn, message serverMessage) error {
	writeCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	return wsjson.Write(writeCtx, connection, message)
}

func (s *Server) setConnected(room *game.Room, playerID string, connected bool) {
	key := room.IDValue() + ":" + playerID
	s.connectionsMu.Lock()
	if connected {
		s.connections[key]++
		if s.connections[key] == 1 {
			_ = room.SetConnected(playerID, true)
		}
	} else {
		s.connections[key]--
		if s.connections[key] <= 0 {
			delete(s.connections, key)
			_ = room.SetConnected(playerID, false)
		}
	}
	s.connectionsMu.Unlock()
}

func webSocketToken(r *http.Request) string {
	if token := bearerToken(r); token != "" {
		return token
	}
	for _, protocol := range strings.Split(r.Header.Get("Sec-WebSocket-Protocol"), ",") {
		protocol = strings.TrimSpace(protocol)
		if strings.HasPrefix(protocol, "skw_") {
			return protocol
		}
	}
	return r.URL.Query().Get("token")
}

func bearerToken(r *http.Request) string {
	value := r.Header.Get("Authorization")
	if len(value) > 7 && strings.EqualFold(value[:7], "Bearer ") {
		return strings.TrimSpace(value[7:])
	}
	return ""
}

func decodeJSON(w http.ResponseWriter, r *http.Request, target any) error {
	r.Body = http.MaxBytesReader(w, r.Body, maxRequestBytes)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return err
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		if err != nil {
			return errors.New("request body contains invalid trailing data")
		}
		return errors.New("request body must contain a single JSON object")
	}
	return nil
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeGameError(w http.ResponseWriter, err error) {
	status := http.StatusBadRequest
	switch {
	case errors.Is(err, game.ErrRoomNotFound), errors.Is(err, game.ErrPlayerNotFound):
		status = http.StatusNotFound
	case errors.Is(err, game.ErrForbidden), errors.Is(err, game.ErrInvalidPassword):
		status = http.StatusForbidden
	case errors.Is(err, game.ErrRoomFull), errors.Is(err, game.ErrNameTaken),
		errors.Is(err, game.ErrInvalidPhase), errors.Is(err, game.ErrAlreadyLocked), errors.Is(err, game.ErrAlreadyVoted),
		errors.Is(err, game.ErrAnswerNotLocked), errors.Is(err, game.ErrVoteNotLocked),
		errors.Is(err, game.ErrAlreadyPaused), errors.Is(err, game.ErrNotPaused):
		status = http.StatusConflict
	}
	writeProblem(w, status, errorCode(err), err.Error())
}

func errorCode(err error) string {
	switch {
	case errors.Is(err, game.ErrRoomNotFound):
		return "room_not_found"
	case errors.Is(err, game.ErrPlayerNotFound):
		return "player_not_found"
	case errors.Is(err, game.ErrForbidden):
		return "forbidden"
	case errors.Is(err, game.ErrInvalidPassword):
		return "invalid_password"
	case errors.Is(err, game.ErrRoomFull):
		return "room_full"
	case errors.Is(err, game.ErrNameTaken):
		return "name_taken"
	case errors.Is(err, game.ErrInvalidPhase):
		return "invalid_phase"
	case errors.Is(err, game.ErrAlreadyLocked):
		return "answer_already_locked"
	case errors.Is(err, game.ErrAlreadyVoted):
		return "vote_already_locked"
	case errors.Is(err, game.ErrAnswerNotLocked):
		return "answer_not_locked"
	case errors.Is(err, game.ErrVoteNotLocked):
		return "vote_not_locked"
	case errors.Is(err, game.ErrAlreadyPaused):
		return "already_paused"
	case errors.Is(err, game.ErrNotPaused):
		return "not_paused"
	default:
		return "invalid_command"
	}
}

func writeProblem(w http.ResponseWriter, status int, code, detail string) {
	w.Header().Set("Content-Type", "application/problem+json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"type": "about:blank", "title": http.StatusText(status),
		"status": status, "code": code, "detail": detail,
	})
}

func (s *Server) logRequest(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		started := time.Now()
		next.ServeHTTP(w, r)
		s.logger.Info("http request", "method", r.Method, "path", r.URL.Path, "duration", time.Since(started))
	})
}

func (s *Server) recoverPanic(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if recovered := recover(); recovered != nil {
				s.logger.Error("panic serving request", "method", r.Method, "path", r.URL.Path, "panic", recovered)
				writeProblem(w, http.StatusInternalServerError, "internal_error", "internal server error")
			}
		}()
		next.ServeHTTP(w, r)
	})
}
