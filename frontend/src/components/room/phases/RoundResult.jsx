export function RoundResult({ state, send, isHost }) {
  const imposter = state.players.find((player) => player.id === state.result?.imposter_id);
  return (
    <div className="phase-body result-body">
      <div className={`result-banner ${state.result?.found ? "found" : "escaped"}`}>
        <span>{state.result?.found ? "Case cracked" : "Got away with it"}</span>
        <h2>{imposter?.display_name || "The imposter"} was the odd one out.</h2>
        <p>{state.result?.found ? "The room saw through the story. Everyone else scores a point." : "The bluff held. The imposter takes the points."}</p>
      </div>
      <div className="vote-breakdown">
        <span className="card-label">How the room voted</span>
        {state.players.map((player) => <div className="vote-row" key={player.id}><span>{player.display_name}</span><div><i style={{ width: `${Math.max(5, (state.result?.vote_counts?.[player.id] || 0) * 18)}%` }} /></div><strong>{state.result?.vote_counts?.[player.id] || 0}</strong></div>)}
      </div>
      {isHost ? <button className="primary-button stage-action" onClick={() => send("advance")}>{state.round >= state.settings.rounds ? "See final scores" : "Next round"} <span>→</span></button> : <div className="waiting-note"><span className="pulse-dot" />Waiting for the host to continue…</div>}
    </div>
  );
}
