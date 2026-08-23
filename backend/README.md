# Skewa Backend

The backend contains two Go services:

- `game-server` owns active rooms, validates commands, advances timers, sends a
  personalized WebSocket sync, then emits small player-specific events.
- `coordinator` selects a game server when a room is created and resolves room
  names or IDs to that server.

Built-in question packs live in `internal/questionpacks`. Both services expose
pack metadata at `GET /v1/question-packs`, while the question text remains on
the backend. Room creation accepts either a backend `question_pack` identifier
or custom `questions` as write-only input. Question pairs are never returned in
catalog or room-state responses.

## Requirements

- Go 1.26 or newer
- Docker for PostgreSQL integration tests
- PostgreSQL 14 or newer when snapshot persistence is enabled

## Run locally

Start a game server without persistence:

```sh
go run ./cmd/game-server
```

Start a coordinator in another terminal:

```sh
GAME_SERVERS=http://localhost:8081 go run ./cmd/coordinator
```

Set `DATABASE_URL` on the game server to enable snapshots. The embedded SQL
migration is applied at startup.

```sh
DATABASE_URL=postgres://skewa:skewa@localhost:5432/skewa?sslmode=disable \
  go run ./cmd/game-server
```

## Configuration

### Game server

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `8081` | HTTP listen port |
| `DATABASE_URL` | empty | PostgreSQL connection string; persistence is disabled when empty |
| `ALLOWED_ORIGINS` | same-origin only | Comma-separated frontend origins or host patterns, such as `http://localhost:5173` |

### Coordinator

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `8080` | HTTP listen port |
| `GAME_SERVERS` | required | Comma-separated public game-server base URLs |
| `ALLOWED_ORIGINS` | same-origin only | Comma-separated frontend origins or host patterns |

## Tests

Run unit, HTTP, WebSocket, coordinator, and PostgreSQL Testcontainers tests:

```sh
go test ./...
```

Run only tests that do not start containers:

```sh
go test -short ./...
```

Run the race detector without integration tests:

```sh
go test -race -short ./...
```

## Contracts

- [`api/game-server.openapi.yaml`](api/game-server.openapi.yaml) describes the
  game-server HTTP API.
- [`api/coordinator.openapi.yaml`](api/coordinator.openapi.yaml) describes the
  coordinator HTTP API.
- [`api/websocket.md`](api/websocket.md) describes WebSocket authentication,
  commands, and events.

Room snapshots are currently written for durability and inspection. Automatic
room restoration and coordinator assignment persistence are intentionally left
for the next backend milestone.
