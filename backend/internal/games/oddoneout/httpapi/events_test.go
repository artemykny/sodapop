package httpapi

import (
	"testing"

	game "github.com/ak/skewa/backend/internal/games/oddoneout"
)

func TestRoomUpdateProjectsOnlyPublicChanges(t *testing.T) {
	base := game.View{
		Version: 1, Phase: game.PhaseAnswering, Round: 1, YourPrompt: "your prompt",
		Players: []game.Player{{ID: "one", DisplayName: "One"}},
	}

	message, send := roomUpdate(nil, base)
	if !send || message.Type != "sync" {
		t.Fatalf("initial update = %+v, %v", message, send)
	}

	hiddenChange := base
	hiddenChange.Version = 2
	if message, send := roomUpdate(&base, hiddenChange); send {
		t.Fatalf("hidden server change emitted %+v", message)
	}

	locked := hiddenChange
	locked.Version = 3
	locked.AnswerLocked = true
	locked.Players = []game.Player{{ID: "one", DisplayName: "One", Connected: true}}
	message, send = roomUpdate(&hiddenChange, locked)
	if !send || message.Type != "answer_locked" {
		t.Fatalf("answer lock update = %+v, %v", message, send)
	}
	lockedUpdate := message.Payload.(lockedPayload)
	if len(lockedUpdate.Players) != 1 || !lockedUpdate.Players[0].Connected {
		t.Fatalf("answer lock dropped coalesced roster update: %+v", lockedUpdate)
	}

	discussion := locked
	discussion.Version = 4
	discussion.Phase = game.PhaseDiscussion
	discussion.YourPrompt = ""
	discussion.RealQuestion = "revealed question"
	message, send = roomUpdate(&locked, discussion)
	if !send || message.Type != "discussion_started" {
		t.Fatalf("discussion update = %+v, %v", message, send)
	}
	if update := message.Payload.(phaseStartedPayload); update.Round != discussion.Round {
		t.Fatalf("discussion round = %d, want %d", update.Round, discussion.Round)
	}

	// Subscription notifications are deliberately coalesced. A phase event must
	// therefore stand on its own even if the client never observed round_started.
	lobby := game.View{Version: 10, Phase: game.PhaseLobby}
	voting := game.View{Version: 14, Phase: game.PhaseVoting, Round: 2}
	message, send = roomUpdate(&lobby, voting)
	if !send || message.Type != "voting_started" {
		t.Fatalf("coalesced phase update = %+v, %v", message, send)
	}
	if update := message.Payload.(phaseStartedPayload); update.Round != 2 {
		t.Fatalf("coalesced voting round = %d, want 2", update.Round)
	}
}
