package httpapi

import (
	"slices"
	"time"

	"github.com/ak/skewa/backend/internal/game"
)

type playersUpdatedPayload struct {
	Version uint64        `json:"version"`
	Players []game.Player `json:"players"`
}

type roundStartedPayload struct {
	Version    uint64        `json:"version"`
	Round      int           `json:"round"`
	Deadline   *time.Time    `json:"deadline,omitempty"`
	YourPrompt string        `json:"your_prompt"`
	Players    []game.Player `json:"players"`
}

type phaseStartedPayload struct {
	Version      uint64        `json:"version"`
	Deadline     *time.Time    `json:"deadline,omitempty"`
	RealQuestion string        `json:"real_question,omitempty"`
	Answers      []game.Answer `json:"answers,omitempty"`
	Players      []game.Player `json:"players"`
}

type lockedPayload struct {
	Version uint64 `json:"version"`
}

type roundResultPayload struct {
	Version      uint64            `json:"version"`
	Deadline     *time.Time        `json:"deadline,omitempty"`
	RealQuestion string            `json:"real_question,omitempty"`
	Answers      []game.Answer     `json:"answers,omitempty"`
	Result       *game.RoundResult `json:"result,omitempty"`
	Players      []game.Player     `json:"players"`
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
				YourPrompt: current.YourPrompt, Players: current.Players,
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
		return serverMessage{Type: "answer_locked", Payload: lockedPayload{Version: current.Version}}, true
	}
	if current.VoteLocked != previous.VoteLocked {
		return serverMessage{Type: "vote_locked", Payload: lockedPayload{Version: current.Version}}, true
	}
	if !slices.Equal(current.Players, previous.Players) {
		return serverMessage{Type: "players_updated", Payload: playersPayload(current)}, true
	}
	return serverMessage{}, false
}

func playersPayload(view game.View) playersUpdatedPayload {
	return playersUpdatedPayload{Version: view.Version, Players: view.Players}
}

func phasePayload(view game.View) phaseStartedPayload {
	return phaseStartedPayload{
		Version: view.Version, Deadline: view.Deadline, RealQuestion: view.RealQuestion,
		Answers: view.Answers, Players: view.Players,
	}
}

func resultPayload(view game.View) roundResultPayload {
	return roundResultPayload{
		Version: view.Version, Deadline: view.Deadline, RealQuestion: view.RealQuestion,
		Answers: view.Answers, Result: view.Result, Players: view.Players,
	}
}
