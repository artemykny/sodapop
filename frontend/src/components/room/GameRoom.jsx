import { useEffect, useRef } from "react";
import { phaseCopy } from "../../constants/phaseCopy.js";
import { useCountdown } from "../../hooks/useCountdown.js";
import { Timer } from "../shared/Timer.jsx";
import { PhaseContent } from "./PhaseContent.jsx";
import { PlayersPanel } from "./PlayersPanel.jsx";

export function GameRoom({ session, connection, send, leave, setNotice }) {
  const state = session.state;
  const me = state.players.find((player) => player.id === state.your_player_id);
  const isHost = Boolean(me?.is_host);
  const copy = phaseCopy[state.phase] || phaseCopy.lobby;
  const countdown = useCountdown(state.deadline);
  const timeLeft = state.paused ? (state.remaining_seconds || 0) : countdown;
  const previousPaused = useRef(state.paused);

  useEffect(() => {
    if (previousPaused.current === state.paused) return;
    setNotice(state.paused
      ? "Game paused. The timer is stopped; answers and votes remain editable."
      : "Game resumed. The timer is running again.");
    previousPaused.current = state.paused;
  }, [state.paused, setNotice]);

  function copyInvite() {
    const params = new URLSearchParams({ room: state.room_name, roomId: state.room_id });
    if (session.invitePassword) params.set("password", session.invitePassword);
    const invite = `${window.location.origin}${window.location.pathname}?${params}`;
    navigator.clipboard?.writeText(invite).then(() => setNotice("Invite link copied."), () => setNotice(invite));
  }

  function confirmLeave() {
    if (state.phase === "finished" || window.confirm("Leave this room? This browser will forget your player session, and you may not be able to rejoin.")) {
      leave();
    }
  }

  return (
    <main className="game-layout">
      <header className="game-header">
        <button className="wordmark wordmark-dark wordmark-button" onClick={confirmLeave} aria-label="Leave game and return home">SODAPOP<span>●</span></button>
        <div className="room-heading">
          <span className="room-name">{state.room_name}</span>
          <span className={`connection connection-${connection}`}><i />{connection === "live" ? "Live" : connection === "offline" ? "Reconnecting" : "Connecting"}</span>
        </div>
        <div className="round-heading">
          {state.phase !== "lobby" && <span>Round {Math.min(state.round, state.settings.rounds)} / {state.settings.rounds}</span>}
          {(state.deadline || state.paused) && <Timer seconds={timeLeft} paused={state.paused} settings={state.settings} />}
        </div>
      </header>

      <section className="game-stage">
        <div className="stage-heading">
          <p className="kicker">{copy.eyebrow}</p>
          <h1>{copy.title}</h1>
        </div>
        <PhaseContent state={state} me={me} isHost={isHost} send={send} copyInvite={copyInvite} leave={leave} />
      </section>

      <PlayersPanel state={state} me={me} send={send} copyInvite={copyInvite} leave={confirmLeave} />
    </main>
  );
}
