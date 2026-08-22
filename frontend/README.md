# Skewa Frontend

React and Vite client for the Skewa multiplayer game.

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
