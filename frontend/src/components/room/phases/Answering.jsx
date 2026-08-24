import { useState } from "react";
import { useI18n } from "../../../i18n/I18n.jsx";

export function Answering({ state, send }) {
  const { t } = useI18n();
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

  if (state.answer_locked) {
    return (
      <div className="locked-card">
        <div className="lock-seal">✓</div>
        <h2>{t("answering.locked")}</h2>
        <p>{t("answering.lockedHelp")}</p>
        <div className="locked-choice">
          <span>{t("answering.yourQuestion")}</span><strong>{state.your_prompt}</strong>
          <span>{t("answering.yourAnswer")}</span><blockquote>“{state.your_answer}”</blockquote>
        </div>
        <button className="secondary-button" onClick={unlockAnswer} disabled={unlocking}>{t(unlocking ? "answering.unlocking" : "answering.edit")}</button>
      </div>
    );
  }

  return (
    <form className="answer-card" onSubmit={submitAnswer}>
      <span className="card-label">{t("answering.secretQuestion")}</span>
      <h2>{state.your_prompt}</h2>
      <label className="answer-input"><span>{t("answering.yourAnswer")}</span><textarea value={answer} onChange={(event) => setAnswer(event.target.value)} maxLength={500} placeholder={t("answering.placeholder")} autoFocus disabled={submitting} /></label>
      <div className="answer-footer"><span>{answer.length} / 500</span><button className="primary-button compact" disabled={!answer.trim() || submitting}>{t(submitting ? "answering.submitting" : "answering.lock")} <span>→</span></button></div>
    </form>
  );
}
