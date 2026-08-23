export function Discussion({ state, send, isHost }) {
  return (
    <div className="phase-body">
      <div className="reveal-question"><span className="card-label">The real question was</span><h2>{state.real_question}</h2></div>
      <div className="answer-grid">
        {state.answers?.map((answer, index) => <article className="revealed-answer" key={answer.player_id}><span>{String(index + 1).padStart(2, "0")}</span><p>“{answer.text}”</p><strong>{answer.player_name}</strong></article>)}
      </div>
      {!state.answers?.length && <p className="phase-empty">No answers were locked before discussion began.</p>}
      {isHost ? <button className="primary-button stage-action" onClick={() => send("advance")}>Start the vote <span>→</span></button> : <div className="waiting-note"><span className="pulse-dot" />Make your case. The host will open voting.</div>}
    </div>
  );
}
