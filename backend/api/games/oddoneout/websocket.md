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
| `update_settings` | `{"settings":{...}}` | Host before the game finishes |
| `pause_game` | none | Host while a phase timer is running |
| `resume_game` | none | Host while the game is paused |
| `submit_answer` | `{"answer":"..."}` | Any player during answering |
| `unlock_answer` | none | A player with a locked answer during answering |
| `cast_vote` | `{"player_id":"ply_..."}` | Any player during voting |
| `unlock_vote` | none | A player with a locked vote during voting |
| `advance` | none | Host during an active round |
| `stop_game` | none | Host before the game finishes |
| `ping` | none | Any authenticated player |

Answers and votes lock on submission but remain editable until the server moves
to the next phase. Unlocking removes the current choice; the player must submit
again before it counts.

## Server messages

The server owns the authoritative room. On connection it emits one personalized
`sync` containing the player's current room projection. After that it sends only
incremental player-safe events:

| Type | Meaning |
| --- | --- |
| `players_updated` | Public roster, connection, or score data changed |
| `settings_updated` | Host changed the room settings |
| `game_paused` | The phase timer stopped with a fixed `remaining_seconds` |
| `game_resumed` | The phase timer resumed with a new absolute `deadline` |
| `round_started` | A new round began; includes only this player's prompt |
| `answer_locked` | This player's answer was accepted |
| `answer_unlocked` | This player's answer was unlocked |
| `discussion_started` | The real question and submitted answers became public |
| `voting_started` | Voting opened |
| `vote_locked` | This player's vote was accepted |
| `vote_unlocked` | This player's vote was unlocked |
| `round_result` | The imposter, counts, and updated scores became public |
| `game_finished` | The game ended and final scores became public |

Every incremental payload has a monotonically increasing `version`. Versions
may skip because hidden actions by other players intentionally produce no event.
Clients discard stale versions and update only their local projection. Public
notifications may also be coalesced, so phase and lock events include the
current round and roster needed to recover directly to the latest projection.

Command outcomes remain separate:

- `ack`: a command was accepted; contains the original `request_id`.
- `error`: a command was rejected; contains the original `request_id` and a
  `{code, message}` payload.

The personalized projection deliberately varies by phase and player. During
answering, `round_started` contains only `your_prompt`; a player may also receive
their own `your_answer` after locking. During voting, a player may receive only
their own `your_vote`. The real question and all submitted answers appear only
once discussion starts. The imposter and vote counts appear only in
`round_result` and a reconnecting player's finished sync.

Clients calculate a displayed countdown from absolute `deadline` timestamps.
Changing settings does not reset an active deadline; duration changes apply the
next time that phase starts. While paused, the server removes the deadline and
publishes a fixed remaining time. Players can continue submitting, unlocking,
and revising answers or votes, but completing every response does not advance
the phase until the host resumes or advances manually. The server remains
authoritative for every phase transition, settings update, and locked action.
