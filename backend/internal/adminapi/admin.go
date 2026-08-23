package adminapi

import (
	"crypto/sha256"
	"crypto/subtle"
	"encoding/json"
	"net/http"
	"strings"
	"time"
)

type Auth struct {
	configured bool
	digest     [sha256.Size]byte
}

func NewAuth(password string) Auth {
	if password == "" {
		return Auth{}
	}
	return Auth{configured: true, digest: sha256.Sum256([]byte(password))}
}

func (a Auth) Require(w http.ResponseWriter, r *http.Request) bool {
	if !a.configured {
		writeProblem(w, http.StatusServiceUnavailable, "admin_disabled", "admin access is not configured")
		return false
	}
	password, ok := bearerToken(r.Header.Get("Authorization"))
	provided := sha256.Sum256([]byte(password))
	if !ok || subtle.ConstantTimeCompare(a.digest[:], provided[:]) != 1 {
		w.Header().Set("WWW-Authenticate", `Bearer realm="skewa-admin"`)
		writeProblem(w, http.StatusUnauthorized, "invalid_admin_password", "admin password is invalid")
		return false
	}
	return true
}

func bearerToken(value string) (string, bool) {
	if len(value) <= 7 || !strings.EqualFold(value[:7], "Bearer ") {
		return "", false
	}
	token := strings.TrimSpace(value[7:])
	return token, token != ""
}

func writeProblem(w http.ResponseWriter, status int, code, detail string) {
	w.Header().Set("Content-Type", "application/problem+json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"type": "about:blank", "title": http.StatusText(status),
		"status": status, "code": code, "detail": detail,
	})
}

type Game struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type QuestionPack struct {
	ID            string     `json:"id"`
	Name          string     `json:"name"`
	Description   string     `json:"description"`
	QuestionCount int        `json:"question_count"`
	Items         []PackItem `json:"items"`
}

type PackItem struct {
	Fields []ContentField `json:"fields"`
}

type ContentField struct {
	Label string `json:"label"`
	Value string `json:"value"`
}

type Rooms struct {
	Total    int            `json:"total"`
	Active   int            `json:"active"`
	Finished int            `json:"finished"`
	ByPhase  map[string]int `json:"by_phase"`
}

type Players struct {
	Total     int `json:"total"`
	Connected int `json:"connected"`
}

type GameServerStats struct {
	Game          Game           `json:"game"`
	Rooms         Rooms          `json:"rooms"`
	Players       Players        `json:"players"`
	QuestionPacks []QuestionPack `json:"question_packs"`
}

type Instance struct {
	URL       string `json:"url"`
	GameID    string `json:"game_id,omitempty"`
	Available bool   `json:"available"`
	Error     string `json:"error,omitempty"`
}

type GameOverview struct {
	Game
	ServerInstances int            `json:"server_instances"`
	Rooms           Rooms          `json:"rooms"`
	Players         Players        `json:"players"`
	QuestionPacks   []QuestionPack `json:"question_packs"`
}

type Totals struct {
	GameTypes          int `json:"game_types"`
	ServerInstances    int `json:"server_instances"`
	UnavailableServers int `json:"unavailable_servers"`
	TotalRooms         int `json:"total_rooms"`
	ActiveRooms        int `json:"active_rooms"`
	ConnectedPlayers   int `json:"connected_players"`
}

type Overview struct {
	GeneratedAt time.Time      `json:"generated_at"`
	Totals      Totals         `json:"totals"`
	Games       []GameOverview `json:"games"`
	Instances   []Instance     `json:"instances"`
}
