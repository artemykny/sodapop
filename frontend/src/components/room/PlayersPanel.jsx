import { useState } from "react";
import { useI18n } from "../../i18n/I18n.jsx";
import { Avatar } from "../shared/Avatar.jsx";
import { HostControlsModal } from "./HostControlsModal.jsx";

export function PlayersPanel({ state, me, send, copyInvite, leave }) {
  const { t } = useI18n();
  const [controlsOpen, setControlsOpen] = useState(false);
  const ranked = [...state.players].sort((a, b) => b.score - a.score);
  return (
    <aside className="players-panel">
      <div className="players-title"><div><span className="card-label">{t("room.roster")}</span><h2>{t("room.playerCount", { current: state.players.length, limit: state.settings.player_limit })}</h2></div>{state.phase === "lobby" && <button onClick={copyInvite} aria-label={t("room.copyInvite")}>＋</button>}</div>
      <div className="player-list">
        {ranked.map((player) => (
          <div className={`player-row ${player.id === me?.id ? "is-me" : ""}`} key={player.id}>
            <Avatar player={player} />
            <div><strong>{player.display_name}{player.id === me?.id && ` (${t("room.you")})`}</strong><span>{t(player.is_host ? "room.host" : player.connected ? "room.inRoom" : "room.away")}</span></div>
            <b>{player.score}<small>{t("room.pointsShort")}</small></b>
          </div>
        ))}
      </div>
      {me?.is_host && state.phase !== "finished" && <button className="secondary-button room-settings-button" onClick={() => setControlsOpen(true)}>{t("room.hostControls")}</button>}
      <button className="text-button leave-button" onClick={leave}>{t("room.leaveRoom")}</button>
      {controlsOpen && state.phase !== "finished" && <HostControlsModal state={state} send={send} onClose={() => setControlsOpen(false)} />}
    </aside>
  );
}
