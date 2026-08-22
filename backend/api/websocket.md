# Game WebSocket Protocol

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

The server emits:

- `state`: the complete room view allowed for this player. State messages are
  versioned and may safely replace the client's previous state.
- `ack`: a command was accepted; contains the original `request_id`.
- `error`: a command was rejected; contains the original `request_id` and a
  `{code, message}` payload.

The `state` payload deliberately varies by phase and player. During answering,
only `your_prompt` is present. The real question and all submitted answers are
revealed during discussion. The imposter and vote counts are revealed only in
`round_result` and `finished`.

Clients should calculate a displayed countdown from the server's absolute
`deadline` timestamp. The server remains authoritative for phase transitions.
