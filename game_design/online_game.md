# Online Game Scenario

Sodapop is a multiplayer odd-one-out deduction game. Each round, most players
receive the same real question, while one player, the imposter, receives a
different fake question. Everyone answers, then tries to work out who was
playing from the wrong prompt.

## Setup Phase

One player creates a room and becomes the host.

The host configures the game:

- Question source: upload a custom file or select a backend-owned pack.
- Room name.
- Password.
- Player limit.
- Writing answer duration.
- Discussion duration.
- Voting duration.
- Number of rounds.

After the room is created, other players can join by:

- Searching for the room name and entering the password.
- Opening an invite link.

Each joining player chooses a display name before entering the room.

The lobby shows:

- Room name.
- Host.
- Joined players.
- Player limit.
- Selected game settings.

Once all expected players have joined, the host starts the game.

## Game Phase

The game consists of rounds.

At the start of each round:

- One player is secretly selected as the imposter.
- Every non-imposter player receives the same real question.
- The imposter receives a fake question.
- Players do not know who received which question.

Each player writes an answer and locks it in.

The answer phase ends when:

- Every player has locked an answer.
- Or the answer timer reaches zero.

After the answer phase, the game reveals:

- The real question.
- Every player's answer.

Players then have a limited amount of time to discuss. Regular players try to
identify the imposter. The imposter tries to blend in.

When discussion time ends, the voting phase begins.

Each player votes for the person they think is the imposter.

After voting:

- If the imposter is found, every non-imposter player gets 1 point.
- If the imposter is not found, the imposter gets 1 point for every non-imposter.

Then the next round begins.

The game ends after the configured number of rounds or when the host decides to
stop the game. Then the game shows final scores and the winner.

## UX Notes

- The host is also a player. The host only has extra controls for starting,
  advancing, or stopping the game flow.
- Players should clearly see when they are waiting on other players.
- Locking an answer should feel final for that round.
- Timers should be visible but not visually overwhelming.
- The imposter should not be told they are the imposter directly. They only see
  their fake question and must infer the situation from play.
- The first version should keep scoring simple and predictable.
