package questionpacks

import (
	"slices"

	"github.com/ak/skewa/backend/internal/game"
)

type Pack struct {
	ID          string
	Name        string
	Description string
	Questions   []game.Question
}

type Metadata struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	Description   string `json:"description"`
	QuestionCount int    `json:"question_count"`
}

var catalog = map[string]Pack{
	"classic": {
		ID:          "classic",
		Name:        "Classic mix",
		Description: "Easy to answer, surprisingly hard to explain.",
		Questions: []game.Question{
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
		Questions: []game.Question{
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

var catalogOrder = []string{"classic", "after_dark"}

func Get(id string) (Pack, bool) {
	pack, ok := catalog[id]
	if !ok {
		return Pack{}, false
	}
	pack.Questions = slices.Clone(pack.Questions)
	return pack, true
}

func List() []Metadata {
	result := make([]Metadata, 0, len(catalog))
	for _, id := range catalogOrder {
		pack := catalog[id]
		result = append(result, Metadata{
			ID: pack.ID, Name: pack.Name, Description: pack.Description,
			QuestionCount: len(pack.Questions),
		})
	}
	return result
}
