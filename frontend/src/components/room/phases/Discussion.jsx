export function Discussion({ state, isHost }) {
  return (
    <div className="phase-body">
      <div className="reveal-question"><span className="card-label">The real question was</span><h2>{state.real_question}</h2></div>
      <div className="answer-grid">
        {state.answers?.map((answer, index) => <article className="revealed-answer" key={answer.player_id}><span>{String(index + 1).padStart(2, "0")}</span><p>“{answer.text}”</p><strong>{answer.player_name}</strong></article>)}
      </div>
      {!state.answers?.length && <p className="phase-empty">No answers were locked before discussion began.</p>}
      <div className="waiting-note"><span className="pulse-dot" />{isHost ? "Use Host controls when the room is ready to vote." : "Make your case. The host will open voting."}</div>
    </div>
  );
}
