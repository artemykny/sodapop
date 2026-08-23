package oddoneout

import (
	"errors"
	"fmt"
	"strings"
	"time"
)

type Phase string

const (
	PhaseLobby       Phase = "lobby"
	PhaseAnswering   Phase = "answering"
	PhaseDiscussion  Phase = "discussion"
	PhaseVoting      Phase = "voting"
	PhaseRoundResult Phase = "round_result"
	PhaseFinished    Phase = "finished"
)

var (
	ErrForbidden       = errors.New("forbidden")
	ErrInvalidPhase    = errors.New("action is not allowed in the current phase")
	ErrPlayerNotFound  = errors.New("player not found")
	ErrRoomFull        = errors.New("room is full")
	ErrInvalidPassword = errors.New("invalid room password")
	ErrNameTaken       = errors.New("display name is already in use")
	ErrAlreadyLocked   = errors.New("answer is already locked")
	ErrAlreadyVoted    = errors.New("vote is already locked")
)

type Question struct {
	Real string `json:"real"`
	Fake string `json:"fake"`
}

type Settings struct {
	PlayerLimit       int `json:"player_limit"`
	AnswerSeconds     int `json:"answer_seconds"`
	DiscussionSeconds int `json:"discussion_seconds"`
	VotingSeconds     int `json:"voting_seconds"`
	Rounds            int `json:"rounds"`
}

func (s Settings) Validate() error {
	if s.PlayerLimit < 3 || s.PlayerLimit > 20 {
		return errors.New("player_limit must be between 3 and 20")
	}
	if s.AnswerSeconds < 5 || s.AnswerSeconds > 900 {
		return errors.New("answer_seconds must be between 5 and 900")
	}
	if s.DiscussionSeconds < 5 || s.DiscussionSeconds > 3600 {
		return errors.New("discussion_seconds must be between 5 and 3600")
	}
	if s.VotingSeconds < 5 || s.VotingSeconds > 900 {
		return errors.New("voting_seconds must be between 5 and 900")
	}
	if s.Rounds < 1 || s.Rounds > 50 {
		return errors.New("rounds must be between 1 and 50")
	}
	return nil
}

type CreateRoomParams struct {
	ID        string
	Name      string
	Password  string
	HostName  string
	Settings  Settings
	Questions []Question
}

func (p CreateRoomParams) Validate() error {
	if strings.TrimSpace(p.ID) == "" {
		return errors.New("room id is required")
	}
	if n := len([]rune(strings.TrimSpace(p.Name))); n < 1 || n > 60 {
		return errors.New("room name must contain between 1 and 60 characters")
	}
	if n := len([]rune(strings.TrimSpace(p.HostName))); n < 1 || n > 30 {
		return errors.New("host display name must contain between 1 and 30 characters")
	}
	if len(p.Password) > 100 {
		return errors.New("password must not exceed 100 characters")
	}
	if err := p.Settings.Validate(); err != nil {
		return err
	}
	if len(p.Questions) < p.Settings.Rounds {
		return fmt.Errorf("at least %d questions are required", p.Settings.Rounds)
	}
	for i, question := range p.Questions {
		if strings.TrimSpace(question.Real) == "" || strings.TrimSpace(question.Fake) == "" {
			return fmt.Errorf("question %d must have real and fake text", i+1)
		}
		if len([]rune(question.Real)) > 500 || len([]rune(question.Fake)) > 500 {
			return fmt.Errorf("question %d must not exceed 500 characters", i+1)
		}
	}
	return nil
}

type Player struct {
	ID          string `json:"id"`
	DisplayName string `json:"display_name"`
	IsHost      bool   `json:"is_host"`
	Connected   bool   `json:"connected"`
	Score       int    `json:"score"`
}

type Answer struct {
	PlayerID   string `json:"player_id"`
	PlayerName string `json:"player_name"`
	Text       string `json:"text"`
}

type RoundResult struct {
	ImposterID string         `json:"imposter_id"`
	Found      bool           `json:"found"`
	VoteCounts map[string]int `json:"vote_counts"`
}

// View is the player-specific transport projection of a room. It must never
// contain hidden room state or questions belonging to another player.
type View struct {
	Version      uint64       `json:"version"`
	RoomID       string       `json:"room_id"`
	RoomName     string       `json:"room_name"`
	Phase        Phase        `json:"phase"`
	Settings     Settings     `json:"settings"`
	Players      []Player     `json:"players"`
	Round        int          `json:"round"`
	Deadline     *time.Time   `json:"deadline,omitempty"`
	YourPlayerID string       `json:"your_player_id"`
	YourPrompt   string       `json:"your_prompt,omitempty"`
	AnswerLocked bool         `json:"answer_locked"`
	VoteLocked   bool         `json:"vote_locked"`
	RealQuestion string       `json:"real_question,omitempty"`
	Answers      []Answer     `json:"answers,omitempty"`
	Result       *RoundResult `json:"result,omitempty"`
}

type Credentials struct {
	RoomID   string `json:"room_id"`
	PlayerID string `json:"player_id"`
	Token    string `json:"token"`
}
