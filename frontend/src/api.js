const coordinatorUrl = (import.meta.env.VITE_COORDINATOR_URL || "http://localhost:8080").replace(/\/$/, "");

async function request(url, options = {}) {
  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    });
  } catch {
    throw new Error("Could not reach the game service. Check that it is running and try again.");
  }

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.detail || body?.message || "Something went wrong. Please try again.");
  }
  return body;
}

export async function createRoom(payload) {
  const session = await request(`${coordinatorUrl}/v1/rooms`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return normalizeSession(session, session.game_server_url);
}

export async function joinRoom({ roomName, roomId, gameServerUrl, displayName, password }) {
  let assignment = { room_id: roomId, game_server_url: gameServerUrl };
  if (!roomId || !gameServerUrl) {
    assignment = await request(`${coordinatorUrl}/v1/rooms?name=${encodeURIComponent(roomName)}`);
  }
  const server = assignment.game_server_url.replace(/\/$/, "");
  const session = await request(`${server}/v1/rooms/${encodeURIComponent(assignment.room_id)}/players`, {
    method: "POST",
    body: JSON.stringify({ display_name: displayName, password }),
  });
  return normalizeSession(session, server);
}

function normalizeSession(session, gameServerUrl) {
  return {
    roomId: session.room_id,
    playerId: session.player_id,
    token: session.token,
    websocketPath: session.websocket_path,
    gameServerUrl: gameServerUrl.replace(/\/$/, ""),
    state: session.state,
  };
}

export function socketUrl(session) {
  const url = new URL(session.websocketPath, `${session.gameServerUrl}/`);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}
