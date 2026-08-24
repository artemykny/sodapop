package questionpacks

import (
	"context"
	"errors"
	"testing"

	"github.com/ak/sodapop/backend/internal/games/oddoneout"
)

func TestMemoryStoreCanConfigurePacks(t *testing.T) {
	store := NewMemoryStore(nil)
	if packs, err := store.ListQuestionPacks(context.Background()); err != nil || len(packs) != 0 {
		t.Fatalf("new store packs = %+v, %v; want empty catalog", packs, err)
	}
	pack := Pack{
		ID: "team-retreat", Name: "Team retreat", Description: "For coworkers",
		Questions: []oddoneout.Question{{Real: "Best office snack?", Fake: "Worst office snack?"}},
	}
	if err := store.SaveQuestionPack(context.Background(), pack); err != nil {
		t.Fatalf("SaveQuestionPack() error = %v", err)
	}
	got, err := store.GetQuestionPack(context.Background(), pack.ID)
	if err != nil || got.Name != pack.Name || len(got.Questions) != 1 {
		t.Fatalf("GetQuestionPack() = %+v, %v", got, err)
	}
	got.Questions[0].Real = "mutated"
	again, _ := store.GetQuestionPack(context.Background(), pack.ID)
	if again.Questions[0].Real == "mutated" {
		t.Fatal("store returned mutable question storage")
	}
	if err := store.DeleteQuestionPack(context.Background(), pack.ID); err != nil {
		t.Fatalf("DeleteQuestionPack() error = %v", err)
	}
	if _, err := store.GetQuestionPack(context.Background(), pack.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("GetQuestionPack() error = %v, want ErrNotFound", err)
	}
}

func TestValidateRejectsInvalidPack(t *testing.T) {
	for _, pack := range []Pack{
		{ID: "Has Spaces", Name: "Pack", Questions: []oddoneout.Question{{Real: "A", Fake: "B"}}},
		{ID: "valid", Name: "", Questions: []oddoneout.Question{{Real: "A", Fake: "B"}}},
		{ID: "valid", Name: "Pack"},
		{ID: "valid", Name: "Pack", Questions: []oddoneout.Question{{Real: "A"}}},
	} {
		if err := Validate(pack); err == nil {
			t.Fatalf("Validate(%+v) succeeded", pack)
		}
	}
}
