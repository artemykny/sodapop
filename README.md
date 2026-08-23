# Skewa

Skewa is a multiplayer game application. Its first game, Odd One Out, has
players answer secretly assigned prompts, discuss the revealed answers, and
vote to find the player who was answering a different question.

## Technology Stack

- Backend language: Go
- HTTP router: net/http
- Realtime transport: coder/websocket
- API contract: OpenAPI 3.1
- Data schemas: JSON Schema
- Active game state: in memory
- Persistent state: PostgreSQL snapshots
- Frontend language: JavaScript
- Frontend framework: React
- Frontend build tool: Vite
- Deployment: Render Web Services
- Managed database: Render Postgres
- Backend integration testing: Testcontainers
- End-to-end testing: Playwright

## Backend Architecture

- Coordinator service assigns rooms to game servers.
- Coordinator service returns the game server host for room connections.
- Coordinator service and game servers run as separate deployed services.
- Game servers own active rooms and keep game state in memory.
- Game servers write room snapshots to PostgreSQL.
- A password-protected `/admin` dashboard aggregates operational metadata from
  every game type and server instance.

## Project Structure

- `backend/`: Go coordinator, game modules, API contracts, migrations, and tests.
- `backend/internal/games/oddoneout/`: Odd One Out domain, question catalog, and transport.
- `backend/internal/snapshot/` and `backend/internal/storage/`: game-neutral persistence.
- `frontend/`: modular React client for creating, joining, and playing games.
- `game_design/`: Product scenarios and game rules.

See [`backend/README.md`](backend/README.md) and
[`frontend/README.md`](frontend/README.md) for local development commands and
service configuration, including the Playwright end-to-end suite.
