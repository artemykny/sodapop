export const questionPacks = {
  classic: {
    name: "Classic mix",
    description: "Easy to answer, surprisingly hard to explain.",
    questions: [
      { real: "What is the best pizza topping?", fake: "What is the worst pizza topping?" },
      { real: "Where would you go for a perfect weekend?", fake: "Where would you never spend a weekend?" },
      { real: "Which animal would make the best roommate?", fake: "Which animal would make the worst roommate?" },
      { real: "What is a skill everyone should learn?", fake: "What is a skill nobody really needs?" },
      { real: "Which food is worth waiting in line for?", fake: "Which food is never worth waiting for?" },
      { real: "What makes a party memorable?", fake: "What makes a party unbearable?" },
      { real: "Which job would be fun for one day?", fake: "Which job would be awful for one day?" },
      { real: "What is the most useful thing in a kitchen?", fake: "What is the most useless thing in a kitchen?" },
      { real: "Which season has the best energy?", fake: "Which season has the worst energy?" },
      { real: "What would you bring to a desert island?", fake: "What would be useless on a desert island?" },
    ],
  },
  afterDark: {
    name: "After hours",
    description: "A little sharper for groups who know each other.",
    questions: [
      { real: "What is a green flag on a first date?", fake: "What is a red flag on a first date?" },
      { real: "What is worth lying about?", fake: "What should you never lie about?" },
      { real: "What is the best excuse to leave a party?", fake: "What is the worst excuse to leave a party?" },
      { real: "Which habit makes someone charming?", fake: "Which habit makes someone unbearable?" },
      { real: "What would you spend a surprise bonus on?", fake: "What would be a terrible use of a surprise bonus?" },
      { real: "What is acceptable to steal from a hotel?", fake: "What is unacceptable to steal from a hotel?" },
      { real: "Which celebrity would be fun at dinner?", fake: "Which celebrity would ruin dinner?" },
      { real: "What instantly makes someone interesting?", fake: "What instantly makes someone boring?" },
      { real: "Which secret is harmless to keep?", fake: "Which secret is dangerous to keep?" },
      { real: "What is a good reason to text an ex?", fake: "What is the worst reason to text an ex?" },
    ],
  },
};

export const phaseCopy = {
  lobby: { eyebrow: "Gather the suspects", title: "The room is open" },
  answering: { eyebrow: "Keep it convincing", title: "Answer in secret" },
  discussion: { eyebrow: "Read between the lines", title: "Who got a different question?" },
  voting: { eyebrow: "Trust your instincts", title: "Point the finger" },
  round_result: { eyebrow: "The truth is out", title: "Round revealed" },
  finished: { eyebrow: "Case closed", title: "Final scores" },
};
