package httpapi

import (
	"testing"

	"github.com/ak/skewa/backend/internal/game"
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
	message, send = roomUpdate(&hiddenChange, locked)
	if !send || message.Type != "answer_locked" {
		t.Fatalf("answer lock update = %+v, %v", message, send)
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
}
