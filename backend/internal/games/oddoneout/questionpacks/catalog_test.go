package questionpacks

import (
	"context"
	"errors"
	"testing"

	"github.com/ak/sodapop/backend/internal/games/oddoneout"
)

func TestGetReturnsQuestionCopy(t *testing.T) {
	pack, ok := Get("classic")
	if !ok || len(pack.Questions) == 0 {
		t.Fatal("classic pack was not found")
	}
	original := pack.Questions[0].Real
	pack.Questions[0].Real = "changed"

	again, ok := Get("classic")
	if !ok || again.Questions[0].Real != original {
		t.Fatal("Get returned mutable catalog storage")
	}
}

func TestMemoryStoreCanConfigurePacks(t *testing.T) {
	store := NewMemoryStore(Builtins())
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
