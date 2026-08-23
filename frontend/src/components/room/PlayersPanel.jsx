import { useState } from "react";
import { Avatar } from "../shared/Avatar.jsx";
import { HostControlsModal } from "./HostControlsModal.jsx";

export function PlayersPanel({ state, me, send, copyInvite, leave }) {
  const [controlsOpen, setControlsOpen] = useState(false);
  const ranked = [...state.players].sort((a, b) => b.score - a.score);
  return (
    <aside className="players-panel">
      <div className="players-title"><div><span className="card-label">Room roster</span><h2>{state.players.length} / {state.settings.player_limit} players</h2></div>{state.phase === "lobby" && <button onClick={copyInvite} aria-label="Copy invite">＋</button>}</div>
      <div className="player-list">
        {ranked.map((player) => (
          <div className={`player-row ${player.id === me?.id ? "is-me" : ""}`} key={player.id}>
            <Avatar player={player} />
            <div><strong>{player.display_name}{player.id === me?.id && " (you)"}</strong><span>{player.is_host ? "Host" : player.connected ? "In the room" : "Away"}</span></div>
            <b>{player.score}<small>pts</small></b>
          </div>
        ))}
      </div>
      {me?.is_host && state.phase !== "finished" && <button className="secondary-button room-settings-button" onClick={() => setControlsOpen(true)}>Host controls</button>}
      <button className="text-button leave-button" onClick={leave}>Leave room</button>
      {controlsOpen && state.phase !== "finished" && <HostControlsModal state={state} send={send} onClose={() => setControlsOpen(false)} />}
    </aside>
  );
}
