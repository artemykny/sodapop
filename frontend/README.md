# Skewa Frontend

React and Vite client for the Skewa multiplayer game.

Built-in question text is owned by the backend. The client loads only question
pack metadata from the coordinator and sends the selected `question_pack` ID
when creating a room. Custom JSON uploads are sent as explicit custom questions.

## Source layout

- `src/api/`: coordinator and game-server requests.
- `src/hooks/`: WebSocket and countdown behavior.
- `src/components/home/`: room creation and joining.
- `src/components/room/`: room shell, roster, and phase routing.
- `src/components/room/phases/`: one component per game phase.
- `src/components/shared/`: reusable presentation components.
- `src/constants/`: UI-only copy and constants.

## Development

Start the backend coordinator and at least one game server first. Allow the
frontend origin on both services:

```sh
ALLOWED_ORIGINS=http://localhost:5173 GAME_SERVERS=http://localhost:8081 go run ./cmd/coordinator
ALLOWED_ORIGINS=http://localhost:5173 go run ./cmd/game-server
```

Then start the frontend:

```sh
npm install
npm run dev
```

Copy `.env.example` to `.env` to override the coordinator URL. Production
deployments should set `VITE_COORDINATOR_URL` to the public coordinator URL at
build time.

## End-to-end tests

Install the Playwright browser once, then run the suite:

```sh
npx playwright install chromium
npm run test:e2e
```

The Playwright configuration starts an isolated game server, coordinator, and
Vite server automatically. The suite covers backend-owned question packs,
custom uploads, invite/password behavior, and a complete three-player round.

For interactive debugging:

```sh
npm run test:e2e:ui
```
