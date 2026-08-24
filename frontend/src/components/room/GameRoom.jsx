import { useEffect, useRef } from "react";
import { useCountdown } from "../../hooks/useCountdown.js";
import { useI18n } from "../../i18n/I18n.jsx";
import { Timer } from "../shared/Timer.jsx";
import { PhaseContent } from "./PhaseContent.jsx";
import { PlayersPanel } from "./PlayersPanel.jsx";

const knownPhases = new Set(["lobby", "answering", "discussion", "voting", "round_result", "finished"]);

export function GameRoom({ session, connection, send, leave, setNotice }) {
  const { t } = useI18n();
  const state = session.state;
  const me = state.players.find((player) => player.id === state.your_player_id);
  const isHost = Boolean(me?.is_host);
  const phase = knownPhases.has(state.phase) ? state.phase : "lobby";
  const countdown = useCountdown(state.deadline);
  const timeLeft = state.paused ? (state.remaining_seconds || 0) : countdown;
  const previousPaused = useRef(state.paused);

  useEffect(() => {
    if (previousPaused.current === state.paused) return;
    setNotice(t(state.paused ? "room.pausedNotice" : "room.resumedNotice"));
    previousPaused.current = state.paused;
  }, [state.paused, setNotice, t]);

  function copyInvite() {
    const params = new URLSearchParams({ room: state.room_name, roomId: state.room_id });
    if (session.invitePassword) params.set("password", session.invitePassword);
    const invite = `${window.location.origin}${window.location.pathname}?${params}`;
    navigator.clipboard?.writeText(invite).then(() => setNotice(t("room.inviteCopied")), () => setNotice(invite));
  }

  function confirmLeave() {
    if (state.phase === "finished" || window.confirm(t("room.leaveConfirm"))) {
      leave();
    }
  }

  return (
    <main className="game-layout">
      <header className="game-header">
        <button className="wordmark wordmark-dark wordmark-button" onClick={confirmLeave} aria-label={t("room.leaveHome")}>SODAPOP<span>●</span></button>
        <div className="room-heading">
          <span className="room-name">{state.room_name}</span>
          <span className={`connection connection-${connection}`}><i />{t(connection === "live" ? "room.live" : connection === "offline" ? "room.reconnecting" : "room.connecting")}</span>
        </div>
        <div className="round-heading">
          {state.phase !== "lobby" && <span>{t("room.round", { current: Math.min(state.round, state.settings.rounds), total: state.settings.rounds })}</span>}
          {(state.deadline || state.paused) && <Timer seconds={timeLeft} paused={state.paused} settings={state.settings} />}
        </div>
      </header>

      <section className="game-stage">
        <div className="stage-heading">
          <p className="kicker">{t(`room.phases.${phase}.eyebrow`)}</p>
          <h1>{t(`room.phases.${phase}.title`)}</h1>
        </div>
        <PhaseContent state={state} me={me} isHost={isHost} send={send} copyInvite={copyInvite} leave={leave} />
      </section>

      <PlayersPanel state={state} me={me} send={send} copyInvite={copyInvite} leave={confirmLeave} />
    </main>
  );
}
