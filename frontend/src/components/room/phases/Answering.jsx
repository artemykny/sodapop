import { useState } from "react";

export function Answering({ state, send, isHost }) {
  const [answer, setAnswer] = useState(state.your_answer || "");
  const [submitting, setSubmitting] = useState(false);
  const [unlocking, setUnlocking] = useState(false);

  function submitAnswer(event) {
    event.preventDefault();
    if (!answer.trim()) return;
    if (send("submit_answer", { answer: answer.trim() }, () => setSubmitting(false))) setSubmitting(true);
  }

  function unlockAnswer() {
    if (send("unlock_answer", {}, () => setUnlocking(false))) setUnlocking(true);
  }

  function skipToDiscussion() {
    if (window.confirm("End answering now? Players who have not locked an answer will be left out of this round.")) {
      send("advance");
    }
  }

  if (state.answer_locked) {
    return (
      <div className="locked-card">
        <div className="lock-seal">✓</div>
        <h2>Answer locked</h2>
        <p>Only you can see this answer until discussion begins.</p>
        <div className="locked-choice">
          <span>Your question</span><strong>{state.your_prompt}</strong>
          <span>Your answer</span><blockquote>“{state.your_answer}”</blockquote>
        </div>
        <button className="secondary-button" onClick={unlockAnswer} disabled={unlocking}>{unlocking ? "Unlocking…" : "Edit answer"}</button>
        {isHost && <button className="text-button" onClick={skipToDiscussion}>Skip to discussion →</button>}
      </div>
    );
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
