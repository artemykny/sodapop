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
