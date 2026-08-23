package questionpacks

import "testing"

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
