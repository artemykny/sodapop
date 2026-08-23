package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/ak/skewa/backend/internal/game"
	"github.com/ak/skewa/backend/internal/middleware"
	"github.com/ak/skewa/backend/internal/questionpacks"
	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
)

const maxRequestBytes = 1 << 20

type Server struct {
	manager        *game.Manager
	logger         *slog.Logger
	originPatterns []string

	connectionsMu sync.Mutex
	connections   map[string]int
}

func New(manager *game.Manager, logger *slog.Logger, originPatterns []string) *Server {
	if logger == nil {
		logger = slog.Default()
	}
	return &Server{
		manager: manager, logger: logger, originPatterns: middleware.OriginHostPatterns(originPatterns),
		connections: make(map[string]int),
	}
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", s.health)
	mux.HandleFunc("GET /v1/question-packs", s.questionPacks)
	mux.HandleFunc("POST /v1/rooms", s.createRoom)
	mux.HandleFunc("GET /v1/rooms/{roomID}", s.getRoom)
	mux.HandleFunc("POST /v1/rooms/{roomID}/players", s.joinRoom)
	mux.HandleFunc("GET /v1/rooms/{roomID}/ws", s.roomWebSocket)
	return s.recoverPanic(s.logRequest(middleware.CORS(s.originPatterns, mux)))
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
	WebSocketPath string    `json:"websocket_path"`
	State         game.View `json:"state"`
}

func (s *Server) health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) questionPacks(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"packs": questionpacks.List()})
}

func (s *Server) createRoom(w http.ResponseWriter, r *http.Request) {
	var request createRoomRequest
	if err := decodeJSON(w, r, &request); err != nil {
		writeProblem(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	questions, err := roomQuestions(request.QuestionPack, request.Questions)
	if err != nil {
		writeProblem(w, http.StatusBadRequest, "invalid_question_source", err.Error())
		return
	}
	room, credentials, err := s.manager.Create(game.CreateRoomParams{
		ID: request.RoomID, Name: request.Name, Password: request.Password,
		HostName: request.HostName, Settings: request.Settings, Questions: questions,
	})
	if err != nil {
		writeGameError(w, err)
		return
	}
	state, err := room.View(credentials.PlayerID)
	if err != nil {
		writeProblem(w, http.StatusInternalServerError, "internal_error", "could not create room view")
		return
	}
	writeJSON(w, http.StatusCreated, sessionResponse{
		Credentials:   credentials,
		WebSocketPath: fmt.Sprintf("/v1/rooms/%s/ws", credentials.RoomID),
		State:         state,
	})
}

func roomQuestions(packID string, custom []game.Question) ([]game.Question, error) {
	if packID != "" && len(custom) > 0 {
		return nil, errors.New("choose either question_pack or custom questions")
	}
	if packID != "" {
		pack, ok := questionpacks.Get(packID)
		if !ok {
			return nil, fmt.Errorf("question pack %q was not found", packID)
		}
		return pack.Questions, nil
	}
	if len(custom) == 0 {
		return nil, errors.New("question_pack or custom questions are required")
	}
	return custom, nil
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
	state, err := room.View(credentials.PlayerID)
	if err != nil {
		writeProblem(w, http.StatusInternalServerError, "internal_error", "could not create player view")
		return
	}
	writeJSON(w, http.StatusCreated, sessionResponse{
		Credentials:   credentials,
		WebSocketPath: fmt.Sprintf("/v1/rooms/%s/ws", credentials.RoomID),
		State:         state,
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
		Subprotocols:   []string{"skewa"},
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
			if err != nil || s.writeWebSocket(ctx, connection, serverMessage{Type: "state", Payload: state}) != nil {
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
	case "submit_answer":
		var payload struct {
			Answer string `json:"answer"`
		}
		if err := json.Unmarshal(message.Payload, &payload); err != nil {
			return errors.New("submit_answer payload is invalid")
		}
		return room.SubmitAnswer(playerID, payload.Answer)
	case "cast_vote":
		var payload struct {
			PlayerID string `json:"player_id"`
		}
		if err := json.Unmarshal(message.Payload, &payload); err != nil {
			return errors.New("cast_vote payload is invalid")
		}
		return room.CastVote(playerID, payload.PlayerID)
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
	if decoder.Decode(&struct{}{}) == nil {
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
		errors.Is(err, game.ErrInvalidPhase), errors.Is(err, game.ErrAlreadyLocked), errors.Is(err, game.ErrAlreadyVoted):
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
