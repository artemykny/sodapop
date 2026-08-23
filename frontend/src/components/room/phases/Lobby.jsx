export function Lobby({ state, isHost, send, copyInvite }) {
  const canStart = state.players.length >= 3;
  return (
    <div className="phase-body lobby-body">
      <div className="room-code-card">
        <span className="card-label">Room</span>
        <strong>{state.room_name}</strong>
        <button className="secondary-button" onClick={copyInvite}>Copy invite link <span>↗</span></button>
      </div>
      <div className="lobby-copy">
        <p>{state.players.length < 3 ? `Invite ${3 - state.players.length} more ${3 - state.players.length === 1 ? "player" : "players"} to begin.` : "Everyone is here. Let the suspicion begin."}</p>
        <div className="rules-mini">
          <span>{state.settings.rounds} rounds</span><span>{state.settings.answer_seconds}s answers</span><span>{state.settings.discussion_seconds}s debate</span>
        </div>
        {isHost ? (
          <button className="primary-button stage-action" onClick={() => send("start_game")} disabled={!canStart}>Start the game <span>→</span></button>
        ) : (
          <div className="waiting-note"><span className="pulse-dot" />Waiting for the host to start…</div>
        )}
      </div>
    </div>
  );
}
