package httpapi

import (
	"slices"
	"time"

	game "github.com/ak/sodapop/backend/internal/games/oddoneout"
)

type playersUpdatedPayload struct {
	Version          uint64        `json:"version"`
	Settings         game.Settings `json:"settings"`
	MaxRounds        int           `json:"max_rounds"`
	Deadline         *time.Time    `json:"deadline"`
	Paused           bool          `json:"paused"`
	RemainingSeconds int           `json:"remaining_seconds,omitempty"`
	Players          []game.Player `json:"players"`
}

type roundStartedPayload struct {
	Version          uint64        `json:"version"`
	Round            int           `json:"round"`
	Deadline         *time.Time    `json:"deadline,omitempty"`
	YourPrompt       string        `json:"your_prompt"`
	Settings         game.Settings `json:"settings"`
	MaxRounds        int           `json:"max_rounds"`
	Paused           bool          `json:"paused"`
	RemainingSeconds int           `json:"remaining_seconds,omitempty"`
	Players          []game.Player `json:"players"`
}

type phaseStartedPayload struct {
	Version          uint64        `json:"version"`
	Round            int           `json:"round"`
	Deadline         *time.Time    `json:"deadline,omitempty"`
	RealQuestion     string        `json:"real_question,omitempty"`
	Answers          []game.Answer `json:"answers,omitempty"`
	Settings         game.Settings `json:"settings"`
	MaxRounds        int           `json:"max_rounds"`
	Paused           bool          `json:"paused"`
	RemainingSeconds int           `json:"remaining_seconds,omitempty"`
	Players          []game.Player `json:"players"`
}

type lockedPayload struct {
	Version          uint64        `json:"version"`
	Players          []game.Player `json:"players"`
	YourAnswer       string        `json:"your_answer,omitempty"`
	YourVote         string        `json:"your_vote,omitempty"`
	Settings         game.Settings `json:"settings"`
	MaxRounds        int           `json:"max_rounds"`
	Paused           bool          `json:"paused"`
	RemainingSeconds int           `json:"remaining_seconds,omitempty"`
}

type roundResultPayload struct {
	Version          uint64            `json:"version"`
	Round            int               `json:"round"`
	Deadline         *time.Time        `json:"deadline,omitempty"`
	RealQuestion     string            `json:"real_question,omitempty"`
	Answers          []game.Answer     `json:"answers,omitempty"`
	Result           *game.RoundResult `json:"result,omitempty"`
	Settings         game.Settings     `json:"settings"`
	MaxRounds        int               `json:"max_rounds"`
	Paused           bool              `json:"paused"`
	RemainingSeconds int               `json:"remaining_seconds,omitempty"`
	Players          []game.Player     `json:"players"`
}

// roomUpdate converts an authoritative player view into at most one public
// event. Hidden answer/vote activity advances the server version without
// producing traffic for other players.
func roomUpdate(previous *game.View, current game.View) (serverMessage, bool) {
	if previous == nil {
		return serverMessage{Type: "sync", Payload: current}, true
	}
	if current.Version <= previous.Version {
		return serverMessage{}, false
	}
	if current.Phase != previous.Phase || current.Round != previous.Round {
		switch current.Phase {
		case game.PhaseLobby:
			return serverMessage{Type: "players_updated", Payload: playersPayload(current)}, true
		case game.PhaseAnswering:
			return serverMessage{Type: "round_started", Payload: roundStartedPayload{
				Version: current.Version, Round: current.Round, Deadline: current.Deadline,
				YourPrompt: current.YourPrompt, Settings: current.Settings,
				MaxRounds: current.MaxRounds, Paused: current.Paused,
				RemainingSeconds: current.RemainingSeconds, Players: current.Players,
			}}, true
		case game.PhaseDiscussion:
			return serverMessage{Type: "discussion_started", Payload: phasePayload(current)}, true
		case game.PhaseVoting:
			return serverMessage{Type: "voting_started", Payload: phasePayload(current)}, true
		case game.PhaseRoundResult:
			return serverMessage{Type: "round_result", Payload: resultPayload(current)}, true
		case game.PhaseFinished:
			return serverMessage{Type: "game_finished", Payload: resultPayload(current)}, true
		}
	}
	if current.AnswerLocked != previous.AnswerLocked {
		eventType := "answer_locked"
		if !current.AnswerLocked {
			eventType = "answer_unlocked"
		}
		return serverMessage{Type: eventType, Payload: lockedPayload{
			Version: current.Version, Players: current.Players, YourAnswer: current.YourAnswer,
			Settings: current.Settings, MaxRounds: current.MaxRounds,
			Paused: current.Paused, RemainingSeconds: current.RemainingSeconds,
		}}, true
	}
	if current.VoteLocked != previous.VoteLocked {
		eventType := "vote_locked"
		if !current.VoteLocked {
			eventType = "vote_unlocked"
		}
		return serverMessage{Type: eventType, Payload: lockedPayload{
			Version: current.Version, Players: current.Players, YourVote: current.YourVote,
			Settings: current.Settings, MaxRounds: current.MaxRounds,
			Paused: current.Paused, RemainingSeconds: current.RemainingSeconds,
		}}, true
	}
	if current.Paused != previous.Paused {
		eventType := "game_paused"
		if !current.Paused {
			eventType = "game_resumed"
		}
		return serverMessage{Type: eventType, Payload: playersPayload(current)}, true
	}
	if current.Settings != previous.Settings {
		return serverMessage{Type: "settings_updated", Payload: playersPayload(current)}, true
	}
	if !slices.Equal(current.Players, previous.Players) {
		return serverMessage{Type: "players_updated", Payload: playersPayload(current)}, true
	}
	return serverMessage{}, false
}

func playersPayload(view game.View) playersUpdatedPayload {
	return playersUpdatedPayload{
		Version: view.Version, Settings: view.Settings, MaxRounds: view.MaxRounds,
		Deadline: view.Deadline, Paused: view.Paused,
		RemainingSeconds: view.RemainingSeconds, Players: view.Players,
	}
}

func phasePayload(view game.View) phaseStartedPayload {
	return phaseStartedPayload{
		Version: view.Version, Round: view.Round, Deadline: view.Deadline, RealQuestion: view.RealQuestion,
		Answers: view.Answers, Settings: view.Settings, MaxRounds: view.MaxRounds,
		Paused: view.Paused, RemainingSeconds: view.RemainingSeconds, Players: view.Players,
	}
}

func resultPayload(view game.View) roundResultPayload {
	return roundResultPayload{
		Version: view.Version, Round: view.Round, Deadline: view.Deadline, RealQuestion: view.RealQuestion,
		Answers: view.Answers, Result: view.Result, Settings: view.Settings,
		MaxRounds: view.MaxRounds, Paused: view.Paused,
		RemainingSeconds: view.RemainingSeconds, Players: view.Players,
	}
}
