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
