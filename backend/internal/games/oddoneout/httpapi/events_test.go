package httpapi

import (
	"testing"
	"time"

	game "github.com/ak/sodapop/backend/internal/games/oddoneout"
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
	locked.YourAnswer = "My answer"
	locked.Players = []game.Player{{ID: "one", DisplayName: "One", Connected: true}}
	message, send = roomUpdate(&hiddenChange, locked)
	if !send || message.Type != "answer_locked" {
		t.Fatalf("answer lock update = %+v, %v", message, send)
	}
	lockedUpdate := message.Payload.(lockedPayload)
	if len(lockedUpdate.Players) != 1 || !lockedUpdate.Players[0].Connected {
		t.Fatalf("answer lock dropped coalesced roster update: %+v", lockedUpdate)
	}
	if lockedUpdate.YourAnswer != "My answer" {
		t.Fatalf("answer lock dropped player's answer: %+v", lockedUpdate)
	}

	unlocked := locked
	unlocked.Version = 4
	unlocked.AnswerLocked = false
	unlocked.YourAnswer = ""
	message, send = roomUpdate(&locked, unlocked)
	if !send || message.Type != "answer_unlocked" {
		t.Fatalf("answer unlock update = %+v, %v", message, send)
	}

	discussion := locked
	discussion.Version = 5
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

	voteLocked := voting
	voteLocked.Version = 15
	voteLocked.VoteLocked = true
	voteLocked.YourVote = "player-two"
	message, send = roomUpdate(&voting, voteLocked)
	if !send || message.Type != "vote_locked" || message.Payload.(lockedPayload).YourVote != "player-two" {
		t.Fatalf("vote lock update = %+v, %v", message, send)
	}
	voteUnlocked := voteLocked
	voteUnlocked.Version = 16
	voteUnlocked.VoteLocked = false
	voteUnlocked.YourVote = ""
	message, send = roomUpdate(&voteLocked, voteUnlocked)
	if !send || message.Type != "vote_unlocked" {
		t.Fatalf("vote unlock update = %+v, %v", message, send)
	}

	settingsChanged := base
	settingsChanged.Version = 20
	settingsChanged.Settings = game.Settings{
		PlayerLimit: 8, AnswerSeconds: 90, DiscussionSeconds: 120, VotingSeconds: 45, Rounds: 3,
	}
	settingsChanged.MaxRounds = 10
	message, send = roomUpdate(&base, settingsChanged)
	if !send || message.Type != "settings_updated" {
		t.Fatalf("settings update = %+v, %v", message, send)
	}
	update := message.Payload.(playersUpdatedPayload)
	if update.Settings.AnswerSeconds != 90 || update.MaxRounds != 10 {
		t.Fatalf("settings payload = %+v", update)
	}

	paused := settingsChanged
	paused.Version = 21
	paused.Paused = true
	paused.RemainingSeconds = 42
	paused.Deadline = nil
	message, send = roomUpdate(&settingsChanged, paused)
	if !send || message.Type != "game_paused" {
		t.Fatalf("pause update = %+v, %v", message, send)
	}
	pauseUpdate := message.Payload.(playersUpdatedPayload)
	if !pauseUpdate.Paused || pauseUpdate.RemainingSeconds != 42 || pauseUpdate.Deadline != nil {
		t.Fatalf("pause payload = %+v", pauseUpdate)
	}
	resumed := paused
	resumed.Version = 22
	resumed.Paused = false
	resumed.RemainingSeconds = 0
	resumeDeadline := time.Now().UTC().Add(42 * time.Second)
	resumed.Deadline = &resumeDeadline
	message, send = roomUpdate(&paused, resumed)
	resumeUpdate := message.Payload.(playersUpdatedPayload)
	if !send || message.Type != "game_resumed" || resumeUpdate.Paused || resumeUpdate.Deadline == nil || !resumeUpdate.Deadline.Equal(resumeDeadline) {
		t.Fatalf("resume update = %+v, %v", message, send)
	}
}
