# Sodapop Frontend

React and Vite client for the Sodapop multiplayer game application. The current
game is Odd One Out.

The join form searches authoritative game-server state after two typed
characters and suggests only lobby rooms that still have player capacity.
Suggestions include their game identity so the same UI can list future games.
Room creation and joining use progressive steps. Every room requires a
password. Invite links include that password and should be treated as private
access links; guests joining by room name are prompted for it.

Built-in question text is owned by the backend. The client loads only question
pack metadata from the coordinator and sends the selected `question_pack` ID
when creating a room. Hosts may alternatively submit custom question pairs as
write-only room input; question pairs are never bundled into the app or returned
as global room state.

During answering and voting, players can review and unlock only their own
submitted choice while the phase remains open. Refreshing or reconnecting
restores that private locked state from the backend.

The lobby keeps its primary Start the game button in the main stage. The room
sidebar opens one Host controls dialog for in-round phase actions, pause/resume,
room settings, and ending the game. Pausing freezes the authoritative timer but
players can still submit, unlock, and revise answers or votes. The backend
validates and broadcasts settings changes; an active countdown is never reset by
an edit. Pause and resume changes appear as compact notifications instead of
occupying the game stage. Hovering or focusing the active timer in the top-right
corner shows the current room and phase-duration settings.

## Source layout

- `src/api/`: coordinator and game-server requests.
- `src/hooks/`: WebSocket and countdown behavior.
- `src/state/`: reduction of server events into the local player projection.
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
ALLOWED_ORIGINS=http://localhost:5173 go run ./cmd/oddoneout-server
```

Then start the frontend:

```sh
npm install
npm run dev
```

Copy `.env.example` to `.env` to override the coordinator URL. Production
deployments should set `VITE_COORDINATOR_URL` to the public coordinator URL at
build time.

## Admin dashboard

Open `/admin` and paste the `ADMIN_PASSWORD` configured on the coordinator and
all game servers. The password stays in browser memory only: it is not bundled,
put in a URL, or written to local storage. The read-only dashboard aggregates
game types, active rooms, connected players, phase counts, and server health.
General and per-game information have separate sidebar views. Each question pack
opens in a dedicated scrollable modal so large packs do not expand the game page.
One configured game server may report several games. Public catalog and room APIs
still expose metadata only.

## End-to-end tests

Install the Playwright browser once, then run the suite:

```sh
npx playwright install chromium
npm run test:e2e
```

The Playwright configuration starts an isolated game server, coordinator, and
Vite server automatically. The suite covers backend-owned question packs,
custom question input, question secrecy boundaries, invite/password behavior,
and a complete three-player round.

For interactive debugging:

```sh
npm run test:e2e:ui
```
