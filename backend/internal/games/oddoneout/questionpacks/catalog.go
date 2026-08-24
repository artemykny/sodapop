package questionpacks

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"slices"
	"strings"
	"sync"

	"github.com/ak/sodapop/backend/internal/games/oddoneout"
)

type Pack struct {
	ID          string               `json:"id"`
	Name        string               `json:"name"`
	Description string               `json:"description"`
	Questions   []oddoneout.Question `json:"questions"`
}

type Metadata struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	Description   string `json:"description"`
	QuestionCount int    `json:"question_count"`
}

var builtins = map[string]Pack{
	"classic": {
		ID:          "classic",
		Name:        "Classic mix",
		Description: "Easy to answer, surprisingly hard to explain.",
		Questions: []oddoneout.Question{
			{Real: "What is the best pizza topping?", Fake: "What is the worst pizza topping?"},
			{Real: "Where would you go for a perfect weekend?", Fake: "Where would you never spend a weekend?"},
			{Real: "Which animal would make the best roommate?", Fake: "Which animal would make the worst roommate?"},
			{Real: "What is a skill everyone should learn?", Fake: "What is a skill nobody really needs?"},
			{Real: "Which food is worth waiting in line for?", Fake: "Which food is never worth waiting for?"},
			{Real: "What makes a party memorable?", Fake: "What makes a party unbearable?"},
			{Real: "Which job would be fun for one day?", Fake: "Which job would be awful for one day?"},
			{Real: "What is the most useful thing in a kitchen?", Fake: "What is the most useless thing in a kitchen?"},
			{Real: "Which season has the best energy?", Fake: "Which season has the worst energy?"},
			{Real: "What would you bring to a desert island?", Fake: "What would be useless on a desert island?"},
		},
	},
	"after_dark": {
		ID:          "after_dark",
		Name:        "After hours",
		Description: "A little sharper for groups who know each other.",
		Questions: []oddoneout.Question{
			{Real: "What is a green flag on a first date?", Fake: "What is a red flag on a first date?"},
			{Real: "What is worth lying about?", Fake: "What should you never lie about?"},
			{Real: "What is the best excuse to leave a party?", Fake: "What is the worst excuse to leave a party?"},
			{Real: "Which habit makes someone charming?", Fake: "Which habit makes someone unbearable?"},
			{Real: "What would you spend a surprise bonus on?", Fake: "What would be a terrible use of a surprise bonus?"},
			{Real: "What is acceptable to steal from a hotel?", Fake: "What is unacceptable to steal from a hotel?"},
			{Real: "Which celebrity would be fun at dinner?", Fake: "Which celebrity would ruin dinner?"},
			{Real: "What instantly makes someone interesting?", Fake: "What instantly makes someone boring?"},
			{Real: "Which secret is harmless to keep?", Fake: "Which secret is dangerous to keep?"},
			{Real: "What is a good reason to text an ex?", Fake: "What is the worst reason to text an ex?"},
		},
	},
}

var builtinOrder = []string{"classic", "after_dark"}

var (
	ErrNotFound = errors.New("question pack not found")
	idPattern   = regexp.MustCompile(`^[a-z0-9]+(?:[_-][a-z0-9]+)*$`)
)

type Store interface {
	ListQuestionPacks(context.Context) ([]Pack, error)
	GetQuestionPack(context.Context, string) (Pack, error)
	SaveQuestionPack(context.Context, Pack) error
	DeleteQuestionPack(context.Context, string) error
}

type MemoryStore struct {
	mu    sync.RWMutex
	packs map[string]Pack
}

func NewMemoryStore(initial []Pack) *MemoryStore {
	store := &MemoryStore{packs: make(map[string]Pack, len(initial))}
	for _, pack := range initial {
		store.packs[pack.ID] = clone(pack)
	}
	return store
}

func (s *MemoryStore) ListQuestionPacks(context.Context) ([]Pack, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := make([]Pack, 0, len(s.packs))
	for _, pack := range s.packs {
		result = append(result, clone(pack))
	}
	slices.SortFunc(result, func(a, b Pack) int {
		if result := strings.Compare(strings.ToLower(a.Name), strings.ToLower(b.Name)); result != 0 {
			return result
		}
		return strings.Compare(a.ID, b.ID)
	})
	return result, nil
}

func (s *MemoryStore) GetQuestionPack(_ context.Context, id string) (Pack, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	pack, ok := s.packs[id]
	if !ok {
		return Pack{}, ErrNotFound
	}
	return clone(pack), nil
}

func (s *MemoryStore) SaveQuestionPack(_ context.Context, pack Pack) error {
	pack = Normalize(pack)
	if err := Validate(pack); err != nil {
		return err
	}
	s.mu.Lock()
	s.packs[pack.ID] = clone(pack)
	s.mu.Unlock()
	return nil
}

func (s *MemoryStore) DeleteQuestionPack(_ context.Context, id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.packs[id]; !ok {
		return ErrNotFound
	}
	delete(s.packs, id)
	return nil
}

func Builtins() []Pack {
	result := make([]Pack, 0, len(builtinOrder))
	for _, id := range builtinOrder {
		result = append(result, clone(builtins[id]))
	}
	return result
}

func Validate(pack Pack) error {
	pack.ID = strings.TrimSpace(pack.ID)
	pack.Name = strings.TrimSpace(pack.Name)
	pack.Description = strings.TrimSpace(pack.Description)
	if !idPattern.MatchString(pack.ID) || len(pack.ID) > 60 {
		return errors.New("id must be 1-60 lowercase letters, numbers, hyphens, or underscores")
	}
	if pack.Name == "" || len([]rune(pack.Name)) > 100 {
		return errors.New("name must be 1-100 characters")
	}
	if len([]rune(pack.Description)) > 300 {
		return errors.New("description must not exceed 300 characters")
	}
	if len(pack.Questions) < 1 || len(pack.Questions) > 500 {
		return errors.New("a pack must contain 1-500 question pairs")
	}
	for i, question := range pack.Questions {
		if strings.TrimSpace(question.Real) == "" || strings.TrimSpace(question.Fake) == "" {
			return fmt.Errorf("question pair %d must include both questions", i+1)
		}
		if len([]rune(question.Real)) > 500 || len([]rune(question.Fake)) > 500 {
			return fmt.Errorf("question pair %d must not exceed 500 characters per question", i+1)
		}
	}
	return nil
}

func Normalize(pack Pack) Pack {
	pack.ID = strings.TrimSpace(pack.ID)
	pack.Name = strings.TrimSpace(pack.Name)
	pack.Description = strings.TrimSpace(pack.Description)
	pack.Questions = slices.Clone(pack.Questions)
	for i := range pack.Questions {
		pack.Questions[i].Real = strings.TrimSpace(pack.Questions[i].Real)
		pack.Questions[i].Fake = strings.TrimSpace(pack.Questions[i].Fake)
	}
	return pack
}

func clone(pack Pack) Pack {
	pack.Questions = slices.Clone(pack.Questions)
	return pack
}

func Get(id string) (Pack, bool) {
	pack, ok := builtins[id]
	if !ok {
		return Pack{}, false
	}
	return clone(pack), true
}

func List() []Metadata {
	result := make([]Metadata, 0, len(builtins))
	for _, id := range builtinOrder {
		pack := builtins[id]
		result = append(result, Metadata{
			ID: pack.ID, Name: pack.Name, Description: pack.Description,
			QuestionCount: len(pack.Questions),
		})
	}
	return result
}

func All() []Pack {
	result := make([]Pack, 0, len(builtinOrder))
	for _, id := range builtinOrder {
		pack, _ := Get(id)
		result = append(result, pack)
	}
	return result
}
