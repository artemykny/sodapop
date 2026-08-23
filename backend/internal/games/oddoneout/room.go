package oddoneout

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/ak/skewa/backend/internal/identifier"
	"github.com/ak/skewa/backend/internal/snapshot"
	"golang.org/x/crypto/bcrypt"
)

const roundResultDuration = 8 * time.Second

type playerState struct {
	Player
	TokenHash string `json:"token_hash"`
}

type roundState struct {
	QuestionIndex int               `json:"question_index"`
	ImposterID    string            `json:"imposter_id"`
	Answers       map[string]string `json:"answers"`
	Votes         map[string]string `json:"votes"`
	Result        *RoundResult      `json:"result,omitempty"`
}

type persistedRoom struct {
	ID            string         `json:"id"`
	Name          string         `json:"name"`
	PasswordHash  []byte         `json:"password_hash,omitempty"`
	Settings      Settings       `json:"settings"`
	Questions     []Question     `json:"questions"`
	QuestionOrder []int          `json:"question_order"`
	Players       []*playerState `json:"players"`
	Phase         Phase          `json:"phase"`
	Round         int            `json:"round"`
	Current       *roundState    `json:"current,omitempty"`
	Deadline      *time.Time     `json:"deadline,omitempty"`
	Version       uint64         `json:"version"`
}

type Room struct {
	mu sync.RWMutex
	persistedRoom

	playersByID     map[string]*playerState
	sessions        map[string]string
	changes         chan struct{}
	timer           *time.Timer
	timerGeneration uint64
	now             func() time.Time
	intn            func(int) (int, error)
}

func NewRoom(params CreateRoomParams) (*Room, Credentials, error) {
	params.Name = strings.TrimSpace(params.Name)
	params.HostName = strings.TrimSpace(params.HostName)
	for i := range params.Questions {
		params.Questions[i].Real = strings.TrimSpace(params.Questions[i].Real)
		params.Questions[i].Fake = strings.TrimSpace(params.Questions[i].Fake)
	}
	if err := params.Validate(); err != nil {
		return nil, Credentials{}, err
	}

	hash, err := hashPassword(params.Password)
	if err != nil {
		return nil, Credentials{}, err
	}
	host, token, err := newPlayer(params.HostName, true)
	if err != nil {
		return nil, Credentials{}, err
	}

	room := &Room{
		persistedRoom: persistedRoom{
			ID: params.ID, Name: params.Name, PasswordHash: hash,
			Settings: params.Settings, Questions: slices.Clone(params.Questions),
			Players: []*playerState{host}, Phase: PhaseLobby, Version: 1,
		},
		playersByID: map[string]*playerState{host.ID: host},
		sessions:    map[string]string{host.TokenHash: host.ID},
		changes:     make(chan struct{}, 1),
		now:         time.Now,
		intn:        cryptoIntn,
	}
	room.QuestionOrder = make([]int, len(room.Questions))
	for i := range room.QuestionOrder {
		room.QuestionOrder[i] = i
	}
	if err := room.shuffleQuestions(); err != nil {
		return nil, Credentials{}, err
	}
	return room, Credentials{RoomID: room.ID, PlayerID: host.ID, Token: token}, nil
}

func (r *Room) IDValue() string {
	return r.ID
}

func (r *Room) NameValue() string {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.Name
}

func (r *Room) Changes() <-chan struct{} {
	return r.changes
}

func (r *Room) Join(displayName, password string) (Credentials, error) {
	displayName = strings.TrimSpace(displayName)
	if n := len([]rune(displayName)); n < 1 || n > 30 {
		return Credentials{}, errors.New("display name must contain between 1 and 30 characters")
	}

	r.mu.Lock()
	defer r.mu.Unlock()
	if r.Phase != PhaseLobby {
		return Credentials{}, ErrInvalidPhase
	}
	if len(r.Players) >= r.Settings.PlayerLimit {
		return Credentials{}, ErrRoomFull
	}
	if !r.passwordMatches(password) {
		return Credentials{}, ErrInvalidPassword
	}
	for _, player := range r.Players {
		if strings.EqualFold(player.DisplayName, displayName) {
			return Credentials{}, ErrNameTaken
		}
	}

	player, token, err := newPlayer(displayName, false)
	if err != nil {
		return Credentials{}, err
	}
	r.Players = append(r.Players, player)
	r.playersByID[player.ID] = player
	r.sessions[player.TokenHash] = player.ID
	r.changedLocked()
	return Credentials{RoomID: r.ID, PlayerID: player.ID, Token: token}, nil
}

func (r *Room) Authenticate(token string) (string, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	playerID, ok := r.sessions[tokenHash(token)]
	if !ok {
		return "", ErrForbidden
	}
	return playerID, nil
}

func (r *Room) SetConnected(playerID string, connected bool) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	player, ok := r.playersByID[playerID]
	if !ok {
		return ErrPlayerNotFound
	}
	if player.Connected == connected {
		return nil
	}
	player.Connected = connected
	r.changedLocked()
	return nil
}

func (r *Room) Start(actorID string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if err := r.requireHostLocked(actorID); err != nil {
		return err
	}
	if r.Phase != PhaseLobby {
		return ErrInvalidPhase
	}
	if len(r.Players) < 3 {
		return errors.New("at least 3 players are required")
	}
	if err := r.beginRoundLocked(); err != nil {
		return err
	}
	r.changedLocked()
	return nil
}

func (r *Room) SubmitAnswer(playerID, answer string) error {
	answer = strings.TrimSpace(answer)
	if answer == "" || len([]rune(answer)) > 500 {
		return errors.New("answer must contain between 1 and 500 characters")
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.Phase != PhaseAnswering || r.Current == nil {
		return ErrInvalidPhase
	}
	if _, ok := r.playersByID[playerID]; !ok {
		return ErrPlayerNotFound
	}
	if _, exists := r.Current.Answers[playerID]; exists {
		return ErrAlreadyLocked
	}
	r.Current.Answers[playerID] = answer
	if len(r.Current.Answers) == len(r.Players) {
		r.beginDiscussionLocked()
	}
	r.changedLocked()
	return nil
}

func (r *Room) UnlockAnswer(playerID string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.Phase != PhaseAnswering || r.Current == nil {
		return ErrInvalidPhase
	}
	if _, ok := r.playersByID[playerID]; !ok {
		return ErrPlayerNotFound
	}
	if _, exists := r.Current.Answers[playerID]; !exists {
		return ErrAnswerNotLocked
	}
	delete(r.Current.Answers, playerID)
	r.changedLocked()
	return nil
}

func (r *Room) CastVote(playerID, targetID string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.Phase != PhaseVoting || r.Current == nil {
		return ErrInvalidPhase
	}
	if _, ok := r.playersByID[playerID]; !ok {
		return ErrPlayerNotFound
	}
	if _, ok := r.playersByID[targetID]; !ok {
		return errors.New("vote target is not a room player")
	}
	if playerID == targetID {
		return errors.New("players cannot vote for themselves")
	}
	if _, exists := r.Current.Votes[playerID]; exists {
		return ErrAlreadyVoted
	}
	r.Current.Votes[playerID] = targetID
	if len(r.Current.Votes) == len(r.Players) {
		r.finishVotingLocked()
	}
	r.changedLocked()
	return nil
}

func (r *Room) UnlockVote(playerID string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.Phase != PhaseVoting || r.Current == nil {
		return ErrInvalidPhase
	}
	if _, ok := r.playersByID[playerID]; !ok {
		return ErrPlayerNotFound
	}
	if _, exists := r.Current.Votes[playerID]; !exists {
		return ErrVoteNotLocked
	}
	delete(r.Current.Votes, playerID)
	r.changedLocked()
	return nil
}

func (r *Room) Advance(actorID string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if err := r.requireHostLocked(actorID); err != nil {
		return err
	}
	switch r.Phase {
	case PhaseAnswering:
		r.beginDiscussionLocked()
	case PhaseDiscussion:
		r.beginVotingLocked()
	case PhaseVoting:
		r.finishVotingLocked()
	case PhaseRoundResult:
		if err := r.nextRoundOrFinishLocked(); err != nil {
			return err
		}
	default:
		return ErrInvalidPhase
	}
	r.changedLocked()
	return nil
}

func (r *Room) Stop(actorID string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if err := r.requireHostLocked(actorID); err != nil {
		return err
	}
	if r.Phase == PhaseFinished {
		return ErrInvalidPhase
	}
	r.stopTimerLocked()
	r.Phase = PhaseFinished
	r.Deadline = nil
	r.changedLocked()
	return nil
}

func (r *Room) View(playerID string) (View, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	if _, ok := r.playersByID[playerID]; !ok {
		return View{}, ErrPlayerNotFound
	}
	view := View{
		Version: r.Version, RoomID: r.ID, RoomName: r.Name, Phase: r.Phase,
		Settings: r.Settings, Players: make([]Player, 0, len(r.Players)),
		Round: r.Round, Deadline: cloneTime(r.Deadline), YourPlayerID: playerID,
	}
	for _, state := range r.Players {
		view.Players = append(view.Players, state.Player)
	}
	if r.Current == nil {
		return view, nil
	}
	if r.Phase == PhaseAnswering {
		question := r.Questions[r.Current.QuestionIndex]
		if playerID == r.Current.ImposterID {
			view.YourPrompt = question.Fake
		} else {
			view.YourPrompt = question.Real
		}
		view.YourAnswer, view.AnswerLocked = r.Current.Answers[playerID]
	}
	if r.Phase == PhaseDiscussion || r.Phase == PhaseVoting || r.Phase == PhaseRoundResult || r.Phase == PhaseFinished {
		view.RealQuestion = r.Questions[r.Current.QuestionIndex].Real
		view.Answers = r.answersLocked()
	}
	if r.Phase == PhaseVoting {
		view.YourVote, view.VoteLocked = r.Current.Votes[playerID]
	}
	if r.Phase == PhaseRoundResult || r.Phase == PhaseFinished {
		view.Result = cloneResult(r.Current.Result)
	}
	return view, nil
}

func (r *Room) Snapshot() (snapshot.Snapshot, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	state, err := json.Marshal(r.persistedRoom)
	if err != nil {
		return snapshot.Snapshot{}, fmt.Errorf("marshal room snapshot: %w", err)
	}
	return snapshot.Snapshot{
		RoomID: r.ID, RoomName: r.Name, Phase: string(r.Phase), Version: r.Version,
		State: state, UpdatedAt: r.now().UTC(),
	}, nil
}

func (r *Room) beginRoundLocked() error {
	if r.Round >= r.Settings.Rounds {
		r.Phase = PhaseFinished
		r.Deadline = nil
		return nil
	}
	imposterIndex, err := r.intn(len(r.Players))
	if err != nil {
		return fmt.Errorf("select imposter: %w", err)
	}
	r.Round++
	r.Current = &roundState{
		QuestionIndex: r.QuestionOrder[r.Round-1], ImposterID: r.Players[imposterIndex].ID,
		Answers: make(map[string]string), Votes: make(map[string]string),
	}
	r.Phase = PhaseAnswering
	r.setDeadlineLocked(time.Duration(r.Settings.AnswerSeconds)*time.Second, PhaseAnswering)
	return nil
}

func (r *Room) beginDiscussionLocked() {
	r.Phase = PhaseDiscussion
	r.setDeadlineLocked(time.Duration(r.Settings.DiscussionSeconds)*time.Second, PhaseDiscussion)
}

func (r *Room) beginVotingLocked() {
	r.Phase = PhaseVoting
	r.setDeadlineLocked(time.Duration(r.Settings.VotingSeconds)*time.Second, PhaseVoting)
}

func (r *Room) finishVotingLocked() {
	counts := make(map[string]int)
	for _, targetID := range r.Current.Votes {
		counts[targetID]++
	}
	winnerID := ""
	highest := 0
	tied := false
	for playerID, count := range counts {
		if count > highest {
			winnerID, highest, tied = playerID, count, false
		} else if count == highest {
			tied = true
		}
	}
	found := highest > 0 && !tied && winnerID == r.Current.ImposterID
	if found {
		for _, player := range r.Players {
			if player.ID != r.Current.ImposterID {
				player.Score++
			}
		}
	} else {
		r.playersByID[r.Current.ImposterID].Score += len(r.Players) - 1
	}
	r.Current.Result = &RoundResult{ImposterID: r.Current.ImposterID, Found: found, VoteCounts: counts}
	r.Phase = PhaseRoundResult
	r.setDeadlineLocked(roundResultDuration, PhaseRoundResult)
}

func (r *Room) nextRoundOrFinishLocked() error {
	if r.Round >= r.Settings.Rounds {
		r.stopTimerLocked()
		r.Phase = PhaseFinished
		r.Deadline = nil
		return nil
	}
	return r.beginRoundLocked()
}

func (r *Room) setDeadlineLocked(duration time.Duration, phase Phase) {
	r.stopTimerLocked()
	r.timerGeneration++
	generation := r.timerGeneration
	deadline := r.now().UTC().Add(duration)
	r.Deadline = &deadline
	r.timer = time.AfterFunc(duration, func() {
		r.onDeadline(phase, generation)
	})
}

func (r *Room) onDeadline(phase Phase, generation uint64) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.Phase != phase || r.timerGeneration != generation {
		return
	}
	switch phase {
	case PhaseAnswering:
		r.beginDiscussionLocked()
	case PhaseDiscussion:
		r.beginVotingLocked()
	case PhaseVoting:
		r.finishVotingLocked()
	case PhaseRoundResult:
		if err := r.nextRoundOrFinishLocked(); err != nil {
			return
		}
	default:
		return
	}
	r.changedLocked()
}

func (r *Room) stopTimerLocked() {
	if r.timer != nil {
		r.timer.Stop()
		r.timer = nil
	}
}

func (r *Room) changedLocked() {
	r.Version++
	select {
	case r.changes <- struct{}{}:
	default:
	}
}

func (r *Room) requireHostLocked(playerID string) error {
	player, ok := r.playersByID[playerID]
	if !ok {
		return ErrPlayerNotFound
	}
	if !player.IsHost {
		return ErrForbidden
	}
	return nil
}

func (r *Room) answersLocked() []Answer {
	answers := make([]Answer, 0, len(r.Current.Answers))
	for _, player := range r.Players {
		if answer, ok := r.Current.Answers[player.ID]; ok {
			answers = append(answers, Answer{PlayerID: player.ID, PlayerName: player.DisplayName, Text: answer})
		}
	}
	return answers
}

func (r *Room) passwordMatches(password string) bool {
	if len(r.PasswordHash) == 0 {
		return password == ""
	}
	key := passwordKey(password)
	return bcrypt.CompareHashAndPassword(r.PasswordHash, key[:]) == nil
}

func (r *Room) shuffleQuestions() error {
	for i := len(r.QuestionOrder) - 1; i > 0; i-- {
		j, err := r.intn(i + 1)
		if err != nil {
			return fmt.Errorf("shuffle questions: %w", err)
		}
		r.QuestionOrder[i], r.QuestionOrder[j] = r.QuestionOrder[j], r.QuestionOrder[i]
	}
	return nil
}

func newPlayer(displayName string, host bool) (*playerState, string, error) {
	playerID, err := identifier.New("ply_", 12)
	if err != nil {
		return nil, "", err
	}
	token, err := identifier.New("skw_", 32)
	if err != nil {
		return nil, "", err
	}
	return &playerState{
		Player:    Player{ID: playerID, DisplayName: displayName, IsHost: host},
		TokenHash: tokenHash(token),
	}, token, nil
}

func hashPassword(password string) ([]byte, error) {
	if password == "" {
		return nil, nil
	}
	key := passwordKey(password)
	hash, err := bcrypt.GenerateFromPassword(key[:], bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("hash room password: %w", err)
	}
	return hash, nil
}

func passwordKey(password string) [sha256.Size]byte {
	return sha256.Sum256([]byte(password))
}

func tokenHash(token string) string {
	value := sha256.Sum256([]byte(token))
	return hex.EncodeToString(value[:])
}

func cryptoIntn(max int) (int, error) {
	value, err := rand.Int(rand.Reader, big.NewInt(int64(max)))
	if err != nil {
		return 0, err
	}
	return int(value.Int64()), nil
}

func cloneTime(value *time.Time) *time.Time {
	if value == nil {
		return nil
	}
	copy := *value
	return &copy
}

func cloneResult(result *RoundResult) *RoundResult {
	if result == nil {
		return nil
	}
	copy := &RoundResult{ImposterID: result.ImposterID, Found: result.Found, VoteCounts: make(map[string]int, len(result.VoteCounts))}
	for playerID, count := range result.VoteCounts {
		copy.VoteCounts[playerID] = count
	}
	return copy
}
