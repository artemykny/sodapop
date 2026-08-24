import { useI18n } from "../../../i18n/I18n.jsx";

export function Discussion({ state, isHost }) {
  const { t } = useI18n();
  return (
    <div className="phase-body">
      <div className="reveal-question"><span className="card-label">{t("discussion.realQuestion")}</span><h2>{state.real_question}</h2></div>
      <div className="answer-grid">
        {state.answers?.map((answer, index) => <article className="revealed-answer" key={answer.player_id}><span>{String(index + 1).padStart(2, "0")}</span><p>“{answer.text}”</p><strong>{answer.player_name}</strong></article>)}
      </div>
      {!state.answers?.length && <p className="phase-empty">{t("discussion.noAnswers")}</p>}
      <div className="waiting-note"><span className="pulse-dot" />{t(isHost ? "discussion.hostWaiting" : "discussion.playerWaiting")}</div>
    </div>
  );
}
