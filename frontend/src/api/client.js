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
    const error = new Error("Could not reach the game service. Check that it is running and try again.");
    error.code = "network_error";
    throw error;
  }

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(body?.detail || body?.message || "Something went wrong. Please try again.");
    error.code = body?.code || "request_failed";
    error.status = response.status;
    throw error;
  }
  return body;
}

export async function getQuestionPacks() {
  const catalog = await request(`${coordinatorUrl}/v1/question-packs`);
  return catalog.packs || [];
}

export function getAdminOverview(password) {
  return request(`${coordinatorUrl}/v1/admin/overview`, {
    headers: { Authorization: `Bearer ${password}` },
  });
}

export function saveAdminQuestionPack(password, pack) {
  return request(`${coordinatorUrl}/v1/admin/question-packs/${encodeURIComponent(pack.id)}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${password}` },
    body: JSON.stringify(pack),
  });
}

export function deleteAdminQuestionPack(password, packId) {
  return request(`${coordinatorUrl}/v1/admin/question-packs/${encodeURIComponent(packId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${password}` },
  });
}

export async function searchRooms(query) {
  const result = await request(`${coordinatorUrl}/v1/rooms/search?q=${encodeURIComponent(query)}`);
  return result.rooms || [];
}

export function resolveRoom({ roomName, roomId }) {
  return roomId
    ? request(`${coordinatorUrl}/v1/rooms/${encodeURIComponent(roomId)}`)
    : request(`${coordinatorUrl}/v1/rooms?name=${encodeURIComponent(roomName)}`);
}

export async function createRoom(payload) {
  const session = await request(`${coordinatorUrl}/v1/rooms`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return normalizeSession(session, session.game_server_url, payload.password);
}

export async function joinRoom({ assignment, roomName, roomId, displayName, password }) {
  assignment ||= await resolveRoom({ roomName, roomId });
  const server = assignment.game_server_url.replace(/\/$/, "");
  const roomPassword = assignment.protected ? password : "";
  const session = await request(`${server}/v1/rooms/${encodeURIComponent(assignment.room_id)}/players`, {
    method: "POST",
    body: JSON.stringify({ display_name: displayName, password: roomPassword }),
  });
  return normalizeSession(session, server, roomPassword);
}

function normalizeSession(session, gameServerUrl, invitePassword) {
  return {
    roomId: session.room_id,
    playerId: session.player_id,
    token: session.token,
    websocketPath: session.websocket_path,
    gameServerUrl: gameServerUrl.replace(/\/$/, ""),
    ...(invitePassword ? { invitePassword } : {}),
  };
}

export function socketUrl(session) {
  const url = new URL(session.websocketPath, `${session.gameServerUrl}/`);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}
