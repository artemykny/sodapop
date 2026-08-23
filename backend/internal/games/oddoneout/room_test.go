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
	if err := room.SubmitAnswer(host.PlayerID, "changed"); !errors.Is(err, ErrAlreadyLocked) {
		t.Fatalf("second SubmitAnswer() error = %v, want ErrAlreadyLocked", err)
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
