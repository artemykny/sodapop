# Odd One Out WebSocket Protocol

Connect to `GET /v1/rooms/{room_id}/ws` after creating or joining a room.
Browser clients authenticate with WebSocket subprotocols:

```js
new WebSocket(url, ["skewa", sessionToken]);
```

Non-browser clients may instead send `Authorization: Bearer <token>`. The
query-string `token` fallback exists for limited clients but should not be used
in production because URLs are commonly logged.

## Client messages

Every client message has this envelope:

```json
{
  "type": "submit_answer",
  "request_id": "client-generated-id",
  "payload": {}
}
```

Supported commands:

| Type | Payload | Who may send it |
| --- | --- | --- |
| `start_game` | none | Host in the lobby |
| `submit_answer` | `{"answer":"..."}` | Any player during answering |
| `cast_vote` | `{"player_id":"ply_..."}` | Any player during voting |
| `advance` | none | Host during an active round |
| `stop_game` | none | Host before the game finishes |
| `ping` | none | Any authenticated player |

Answers and votes lock on their first accepted submission.

## Server messages

The server owns the authoritative room. On connection it emits one personalized
`sync` containing the player's current room projection. After that it sends only
incremental public events:

| Type | Meaning |
| --- | --- |
| `players_updated` | Public roster, connection, or score data changed |
| `round_started` | A new round began; includes only this player's prompt |
| `answer_locked` | This player's answer was accepted |
| `discussion_started` | The real question and submitted answers became public |
| `voting_started` | Voting opened |
| `vote_locked` | This player's vote was accepted |
| `round_result` | The imposter, counts, and updated scores became public |
| `game_finished` | The game ended and final scores became public |

Every incremental payload has a monotonically increasing `version`. Versions
may skip because hidden actions by other players intentionally produce no event.
Clients discard stale versions and update only their local projection.

Command outcomes remain separate:

- `ack`: a command was accepted; contains the original `request_id`.
- `error`: a command was rejected; contains the original `request_id` and a
  `{code, message}` payload.

The personalized projection deliberately varies by phase and player. During
answering, `round_started` contains only `your_prompt`. The real question and
submitted answers appear only once discussion starts. The imposter and vote
counts appear only in `round_result` and a reconnecting player's finished sync.

Clients calculate a displayed countdown from absolute `deadline` timestamps.
The server remains authoritative for every phase transition and locked action.
