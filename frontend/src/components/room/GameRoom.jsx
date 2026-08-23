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
  const timeLeft = useCountdown(state.deadline);

  function copyInvite() {
    const params = new URLSearchParams({ room: state.room_name, roomId: state.room_id });
    const invite = `${window.location.origin}${window.location.pathname}?${params}`;
    navigator.clipboard?.writeText(invite).then(() => setNotice("Invite link copied."), () => setNotice(invite));
  }

  function stopGame() {
    if (window.confirm("End this game for everyone?")) send("stop_game");
  }

  function confirmLeave() {
    if (state.phase === "finished" || window.confirm("Leave this room? This browser will forget your player session, and you may not be able to rejoin.")) {
      leave();
    }
  }

  return (
    <main className="game-layout">
      <header className="game-header">
        <button className="wordmark wordmark-dark wordmark-button" onClick={confirmLeave} aria-label="Leave game and return home">SKEWA<span>●</span></button>
        <div className="room-heading">
          <span className="room-name">{state.room_name}</span>
          <span className={`connection connection-${connection}`}><i />{connection === "live" ? "Live" : connection === "offline" ? "Reconnecting" : "Connecting"}</span>
        </div>
        <div className="round-heading">
          {state.phase !== "lobby" && <span>Round {Math.min(state.round, state.settings.rounds)} / {state.settings.rounds}</span>}
          {state.deadline && <Timer seconds={timeLeft} />}
        </div>
      </header>

      <section className="game-stage">
        <div className="stage-heading">
          <p className="kicker">{copy.eyebrow}</p>
          <h1>{copy.title}</h1>
        </div>
        <PhaseContent state={state} me={me} isHost={isHost} send={send} copyInvite={copyInvite} leave={leave} />
        {isHost && state.phase !== "lobby" && state.phase !== "finished" && (
          <button className="text-button danger-link" onClick={stopGame}>End game</button>
        )}
      </section>

      <PlayersPanel state={state} me={me} copyInvite={copyInvite} leave={confirmLeave} />
    </main>
  );
}
