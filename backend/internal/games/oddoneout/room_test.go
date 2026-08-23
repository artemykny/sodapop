package oddoneout

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"
)

func TestRoomRoundFlowAndSecretViews(t *testing.T) {
	room, host, err := NewRoom(testRoomParams())
	if err != nil {
		t.Fatalf("NewRoom() error = %v", err)
	}
	second, err := room.Join("Bob", "secret")
	if err != nil {
		t.Fatalf("Join(Bob) error = %v", err)
	}
	third, err := room.Join("Chandra", "secret")
	if err != nil {
		t.Fatalf("Join(Chandra) error = %v", err)
	}
	room.intn = func(int) (int, error) { return 0, nil }

	if err := room.Start(second.PlayerID); !errors.Is(err, ErrForbidden) {
		t.Fatalf("Start(non-host) error = %v, want ErrForbidden", err)
	}
	if err := room.Start(host.PlayerID); err != nil {
		t.Fatalf("Start(host) error = %v", err)
	}

	hostView := mustView(t, room, host.PlayerID)
	secondView := mustView(t, room, second.PlayerID)
	if hostView.Phase != PhaseAnswering {
		t.Fatalf("phase = %q, want %q", hostView.Phase, PhaseAnswering)
	}
	if hostView.YourPrompt == "" || secondView.YourPrompt == "" || hostView.YourPrompt == secondView.YourPrompt {
		t.Fatalf("personal prompts were not separated: host=%q regular=%q", hostView.YourPrompt, secondView.YourPrompt)
	}
	if hostView.RealQuestion != "" || len(hostView.Answers) != 0 || hostView.Result != nil {
		t.Fatal("answering view leaked round secrets")
	}
	serialized, err := json.Marshal(hostView)
	if err != nil {
		t.Fatalf("marshal answering view: %v", err)
	}
	for _, hiddenField := range []string{`"real_question"`, `"answers"`, `"result"`, `"imposter_id"`, `"questions"`} {
		if strings.Contains(string(serialized), hiddenField) {
			t.Fatalf("answering JSON leaked hidden field %s: %s", hiddenField, serialized)
		}
	}

	if err := room.SubmitAnswer(host.PlayerID, "host answer"); err != nil {
		t.Fatalf("SubmitAnswer(host) error = %v", err)
	}
	lockedAnswer := mustView(t, room, host.PlayerID)
	if !lockedAnswer.AnswerLocked || lockedAnswer.YourAnswer != "host answer" {
		t.Fatalf("locked answer view = %+v", lockedAnswer)
	}
	otherAnswerView := mustView(t, room, second.PlayerID)
	if otherAnswerView.YourAnswer != "" || strings.Contains(mustJSON(t, otherAnswerView), "host answer") {
		t.Fatalf("other player saw hidden answer: %+v", otherAnswerView)
	}
	if err := room.SubmitAnswer(host.PlayerID, "changed"); !errors.Is(err, ErrAlreadyLocked) {
		t.Fatalf("second SubmitAnswer() error = %v, want ErrAlreadyLocked", err)
	}
	if err := room.UnlockAnswer(host.PlayerID); err != nil {
		t.Fatalf("UnlockAnswer(host) error = %v", err)
	}
	if unlocked := mustView(t, room, host.PlayerID); unlocked.AnswerLocked || unlocked.YourAnswer != "" {
		t.Fatalf("unlocked answer view = %+v", unlocked)
	}
	if err := room.UnlockAnswer(host.PlayerID); !errors.Is(err, ErrAnswerNotLocked) {
		t.Fatalf("second UnlockAnswer() error = %v, want ErrAnswerNotLocked", err)
	}
	if err := room.SubmitAnswer(host.PlayerID, "changed host answer"); err != nil {
		t.Fatalf("resubmit answer error = %v", err)
	}
	if err := room.SubmitAnswer(second.PlayerID, "second answer"); err != nil {
		t.Fatalf("SubmitAnswer(second) error = %v", err)
	}
	if err := room.SubmitAnswer(third.PlayerID, "third answer"); err != nil {
		t.Fatalf("SubmitAnswer(third) error = %v", err)
	}

	discussion := mustView(t, room, second.PlayerID)
	if discussion.Phase != PhaseDiscussion || discussion.RealQuestion == "" || len(discussion.Answers) != 3 {
		t.Fatalf("discussion view = %+v", discussion)
	}
	if err := room.Advance(host.PlayerID); err != nil {
		t.Fatalf("Advance(to voting) error = %v", err)
	}
	if err := room.CastVote(host.PlayerID, second.PlayerID); err != nil {
		t.Fatalf("CastVote(host) error = %v", err)
	}
	lockedVote := mustView(t, room, host.PlayerID)
	if !lockedVote.VoteLocked || lockedVote.YourVote != second.PlayerID {
		t.Fatalf("locked vote view = %+v", lockedVote)
	}
	if otherVote := mustView(t, room, second.PlayerID); otherVote.YourVote != "" {
		t.Fatalf("other player saw hidden vote: %+v", otherVote)
	}
	if err := room.UnlockVote(host.PlayerID); err != nil {
		t.Fatalf("UnlockVote(host) error = %v", err)
	}
	if unlocked := mustView(t, room, host.PlayerID); unlocked.VoteLocked || unlocked.YourVote != "" {
		t.Fatalf("unlocked vote view = %+v", unlocked)
	}
	if err := room.UnlockVote(host.PlayerID); !errors.Is(err, ErrVoteNotLocked) {
		t.Fatalf("second UnlockVote() error = %v, want ErrVoteNotLocked", err)
	}
	if err := room.CastVote(host.PlayerID, second.PlayerID); err != nil {
		t.Fatalf("CastVote(host again) error = %v", err)
	}
	if err := room.CastVote(second.PlayerID, host.PlayerID); err != nil {
		t.Fatalf("CastVote(second) error = %v", err)
	}
	if err := room.CastVote(third.PlayerID, host.PlayerID); err != nil {
		t.Fatalf("CastVote(third) error = %v", err)
	}

	result := mustView(t, room, third.PlayerID)
	if result.Phase != PhaseRoundResult || result.Result == nil || !result.Result.Found {
		t.Fatalf("result view = %+v", result)
	}
	for _, player := range result.Players {
		want := 1
		if player.ID == host.PlayerID {
			want = 0
		}
		if player.Score != want {
			t.Errorf("score for %s = %d, want %d", player.DisplayName, player.Score, want)
		}
	}
	if err := room.Advance(host.PlayerID); err != nil {
		t.Fatalf("Advance(to finished) error = %v", err)
	}
	if phase := mustView(t, room, host.PlayerID).Phase; phase != PhaseFinished {
		t.Fatalf("final phase = %q, want %q", phase, PhaseFinished)
	}
}

func TestRoomAuthenticationAndJoinValidation(t *testing.T) {
	room, host, err := NewRoom(testRoomParams())
	if err != nil {
		t.Fatalf("NewRoom() error = %v", err)
	}
	if _, err := room.Join("Bob", "wrong"); !errors.Is(err, ErrInvalidPassword) {
		t.Fatalf("Join(wrong password) error = %v, want ErrInvalidPassword", err)
	}
	if _, err := room.Join("host", "secret"); !errors.Is(err, ErrNameTaken) {
		t.Fatalf("Join(duplicate name) error = %v, want ErrNameTaken", err)
	}
	if got, err := room.Authenticate(host.Token); err != nil || got != host.PlayerID {
		t.Fatalf("Authenticate(host) = %q, %v", got, err)
	}
	if _, err := room.Authenticate("not-a-token"); !errors.Is(err, ErrForbidden) {
		t.Fatalf("Authenticate(invalid) error = %v, want ErrForbidden", err)
	}
}

func TestLongUnicodePassword(t *testing.T) {
	params := testRoomParams()
	params.Password = strings.Repeat("🔐", 100)
	room, _, err := NewRoom(params)
	if err != nil {
		t.Fatalf("NewRoom(100-character password) error = %v", err)
	}
	if _, err := room.Join("Bob", params.Password); err != nil {
		t.Fatalf("Join(long password) error = %v", err)
	}

	params.ID = "room_too_long_password"
	params.Password += "x"
	if _, _, err := NewRoom(params); err == nil {
		t.Fatal("NewRoom(101-character password) succeeded")
	}
}

func TestRoomIDMustBeURLSafe(t *testing.T) {
	for _, roomID := range []string{"", "room/escape", "room with spaces", strings.Repeat("x", 101)} {
		params := testRoomParams()
		params.ID = roomID
		if _, _, err := NewRoom(params); err == nil {
			t.Errorf("NewRoom(ID %q) succeeded", roomID)
		}
	}
}

func TestAnswerDeadlineSurvivesIntermediateStateChanges(t *testing.T) {
	room, host, err := NewRoom(testRoomParams())
	if err != nil {
		t.Fatalf("NewRoom() error = %v", err)
	}
	if _, err := room.Join("Bob", "secret"); err != nil {
		t.Fatalf("Join(Bob) error = %v", err)
	}
	if _, err := room.Join("Chandra", "secret"); err != nil {
		t.Fatalf("Join(Chandra) error = %v", err)
	}
	if err := room.Start(host.PlayerID); err != nil {
		t.Fatalf("Start() error = %v", err)
	}
	room.mu.RLock()
	generation := room.timerGeneration
	room.mu.RUnlock()
	if err := room.SubmitAnswer(host.PlayerID, "one answer"); err != nil {
		t.Fatalf("SubmitAnswer() error = %v", err)
	}

	room.onDeadline(PhaseAnswering, generation)
	if phase := mustView(t, room, host.PlayerID).Phase; phase != PhaseDiscussion {
		t.Fatalf("phase after deadline = %q, want %q", phase, PhaseDiscussion)
	}
	if err := room.Stop(host.PlayerID); err != nil {
		t.Fatalf("Stop() error = %v", err)
	}
}

func TestHostCanUpdateSettingsWithoutResettingCurrentDeadline(t *testing.T) {
	params := testRoomParams()
	params.Questions = append(params.Questions, Question{Real: "Best drink?", Fake: "Worst drink?"})
	room, host, err := NewRoom(params)
	if err != nil {
		t.Fatalf("NewRoom() error = %v", err)
	}
	bob, err := room.Join("Bob", "secret")
	if err != nil {
		t.Fatalf("Join(Bob) error = %v", err)
	}
	chandra, err := room.Join("Chandra", "secret")
	if err != nil {
		t.Fatalf("Join(Chandra) error = %v", err)
	}

	settings := room.Settings
	settings.PlayerLimit = 8
	settings.Rounds = 2
	if err := room.UpdateSettings(bob.PlayerID, settings); !errors.Is(err, ErrForbidden) {
		t.Fatalf("UpdateSettings(non-host) error = %v, want ErrForbidden", err)
	}
	tooSmall := settings
	tooSmall.PlayerLimit = 2
	if err := room.UpdateSettings(host.PlayerID, tooSmall); err == nil {
		t.Fatal("UpdateSettings(player limit below roster) succeeded")
	}
	tooManyRounds := settings
	tooManyRounds.Rounds = 3
	if err := room.UpdateSettings(host.PlayerID, tooManyRounds); err == nil {
		t.Fatal("UpdateSettings(rounds above question capacity) succeeded")
	}
	if err := room.UpdateSettings(host.PlayerID, settings); err != nil {
		t.Fatalf("UpdateSettings(lobby) error = %v", err)
	}
	if view := mustView(t, room, bob.PlayerID); view.Settings != settings || view.MaxRounds != 2 {
		t.Fatalf("updated lobby view = %+v", view)
	}

	if err := room.Start(host.PlayerID); err != nil {
		t.Fatalf("Start() error = %v", err)
	}
	before := mustView(t, room, host.PlayerID)
	settings.AnswerSeconds = 120
	settings.DiscussionSeconds = 180
	if err := room.UpdateSettings(host.PlayerID, settings); err != nil {
		t.Fatalf("UpdateSettings(active round) error = %v", err)
	}
	after := mustView(t, room, host.PlayerID)
	if after.Settings != settings {
		t.Fatalf("active settings = %+v, want %+v", after.Settings, settings)
	}
	if before.Deadline == nil || after.Deadline == nil || !before.Deadline.Equal(*after.Deadline) {
		t.Fatalf("active deadline changed from %v to %v", before.Deadline, after.Deadline)
	}

	if err := room.Pause(bob.PlayerID); !errors.Is(err, ErrForbidden) {
		t.Fatalf("Pause(non-host) error = %v, want ErrForbidden", err)
	}
	if err := room.Pause(host.PlayerID); err != nil {
		t.Fatalf("Pause(answering) error = %v", err)
	}
	paused := mustView(t, room, bob.PlayerID)
	if !paused.Paused || paused.Deadline != nil || paused.RemainingSeconds < 1 {
		t.Fatalf("paused answering view = %+v", paused)
	}
	if err := room.Pause(host.PlayerID); !errors.Is(err, ErrAlreadyPaused) {
		t.Fatalf("second Pause() error = %v, want ErrAlreadyPaused", err)
	}
	if err := room.Resume(bob.PlayerID); !errors.Is(err, ErrForbidden) {
		t.Fatalf("Resume(non-host) error = %v, want ErrForbidden", err)
	}
	if err := room.Resume(host.PlayerID); err != nil {
		t.Fatalf("Resume(answering before submissions) error = %v", err)
	}
	resumed := mustView(t, room, host.PlayerID)
	if resumed.Phase != PhaseAnswering || resumed.Paused || resumed.Deadline == nil {
		t.Fatalf("resumed answering view = %+v", resumed)
	}
	if err := room.Resume(host.PlayerID); !errors.Is(err, ErrNotPaused) {
		t.Fatalf("second Resume() error = %v, want ErrNotPaused", err)
	}
	if err := room.Pause(host.PlayerID); err != nil {
		t.Fatalf("Pause(answering again) error = %v", err)
	}
	if err := room.SubmitAnswer(host.PlayerID, "Host answer"); err != nil {
		t.Fatalf("SubmitAnswer(host while paused) error = %v", err)
	}
	if err := room.UnlockAnswer(host.PlayerID); err != nil {
		t.Fatalf("UnlockAnswer(host while paused) error = %v", err)
	}
	if err := room.SubmitAnswer(host.PlayerID, "Revised host answer"); err != nil {
		t.Fatalf("SubmitAnswer(host again while paused) error = %v", err)
	}
	if err := room.SubmitAnswer(bob.PlayerID, "Bob answer"); err != nil {
		t.Fatalf("SubmitAnswer(Bob while paused) error = %v", err)
	}
	if err := room.SubmitAnswer(chandra.PlayerID, "Chandra answer"); err != nil {
		t.Fatalf("SubmitAnswer(Chandra while paused) error = %v", err)
	}
	if view := mustView(t, room, host.PlayerID); view.Phase != PhaseAnswering || !view.Paused {
		t.Fatalf("all paused answers advanced phase: %+v", view)
	}
	if err := room.Resume(host.PlayerID); err != nil {
		t.Fatalf("Resume(answering) error = %v", err)
	}
	if view := mustView(t, room, host.PlayerID); view.Phase != PhaseDiscussion || view.Paused {
		t.Fatalf("resume with all answers = %+v", view)
	}
	if err := room.Advance(host.PlayerID); err != nil {
		t.Fatalf("Advance(to voting) error = %v", err)
	}
	if err := room.Pause(host.PlayerID); err != nil {
		t.Fatalf("Pause(voting) error = %v", err)
	}
	if err := room.CastVote(host.PlayerID, bob.PlayerID); err != nil {
		t.Fatalf("CastVote(host while paused) error = %v", err)
	}
	if err := room.UnlockVote(host.PlayerID); err != nil {
		t.Fatalf("UnlockVote(host while paused) error = %v", err)
	}
	if err := room.CastVote(host.PlayerID, chandra.PlayerID); err != nil {
		t.Fatalf("CastVote(host again while paused) error = %v", err)
	}
	if err := room.CastVote(bob.PlayerID, host.PlayerID); err != nil {
		t.Fatalf("CastVote(Bob while paused) error = %v", err)
	}
	if err := room.CastVote(chandra.PlayerID, host.PlayerID); err != nil {
		t.Fatalf("CastVote(Chandra while paused) error = %v", err)
	}
	if view := mustView(t, room, host.PlayerID); view.Phase != PhaseVoting || !view.Paused {
		t.Fatalf("all paused votes advanced phase: %+v", view)
	}
	if err := room.Resume(host.PlayerID); err != nil {
		t.Fatalf("Resume(voting) error = %v", err)
	}
	if view := mustView(t, room, host.PlayerID); view.Phase != PhaseRoundResult || view.Paused {
		t.Fatalf("resume with all votes = %+v", view)
	}
}

func testRoomParams() CreateRoomParams {
	return CreateRoomParams{
		ID: "room_test", Name: "Friday Game", Password: "secret", HostName: "Host",
		Settings:  Settings{PlayerLimit: 6, AnswerSeconds: 30, DiscussionSeconds: 30, VotingSeconds: 30, Rounds: 1},
		Questions: []Question{{Real: "What is the best snack?", Fake: "What is the worst snack?"}},
	}
}

func mustView(t *testing.T, room *Room, playerID string) View {
	t.Helper()
	view, err := room.View(playerID)
	if err != nil {
		t.Fatalf("View(%q) error = %v", playerID, err)
	}
	return view
}

func mustJSON(t *testing.T, value any) string {
	t.Helper()
	serialized, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("json.Marshal() error = %v", err)
	}
	return string(serialized)
}
