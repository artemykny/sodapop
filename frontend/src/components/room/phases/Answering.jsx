import { useState } from "react";

export function Answering({ state, send, isHost }) {
  const [answer, setAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function submitAnswer(event) {
    event.preventDefault();
    if (!answer.trim()) return;
    if (send("submit_answer", { answer: answer.trim() }, (accepted) => {
      if (!accepted) setSubmitting(false);
    })) setSubmitting(true);
  }

  if (state.answer_locked) {
    return <div className="locked-card"><div className="lock-seal">✓</div><h2>Answer locked</h2><p>Keep a straight face. The rest of the room is still writing.</p>{isHost && <button className="text-button" onClick={() => send("advance")}>Skip to discussion →</button>}</div>;
  }

  return (
    <form className="answer-card" onSubmit={submitAnswer}>
      <span className="card-label">Your secret question</span>
      <h2>{state.your_prompt}</h2>
      <label className="answer-input"><span>Your answer</span><textarea value={answer} onChange={(event) => setAnswer(event.target.value)} maxLength={500} placeholder="Write something believable…" autoFocus disabled={submitting} /></label>
      <div className="answer-footer"><span>{answer.length} / 500</span><button className="primary-button compact" disabled={!answer.trim() || submitting}>{submitting ? "Submitting…" : "Lock answer"} <span>→</span></button></div>
    </form>
  );
}
