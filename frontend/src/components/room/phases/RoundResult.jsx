import { useI18n } from "../../../i18n/I18n.jsx";

export function RoundResult({ state, isHost }) {
  const { t } = useI18n();
  const imposter = state.players.find((player) => player.id === state.result?.imposter_id);
  return (
    <div className="phase-body result-body">
      <div className={`result-banner ${state.result?.found ? "found" : "escaped"}`}>
        <span>{t(state.result?.found ? "result.found" : "result.escaped")}</span>
        <h2>{t("result.oddOne", { name: imposter?.display_name || t("result.imposter") })}</h2>
        <p>{t(state.result?.found ? "result.foundHelp" : "result.escapedHelp")}</p>
      </div>
      <div className="vote-breakdown">
        <span className="card-label">{t("result.breakdown")}</span>
        {state.players.map((player) => <div className="vote-row" key={player.id}><span>{player.display_name}</span><div><i style={{ width: `${Math.max(5, (state.result?.vote_counts?.[player.id] || 0) * 18)}%` }} /></div><strong>{state.result?.vote_counts?.[player.id] || 0}</strong></div>)}
      </div>
      <div className="waiting-note"><span className="pulse-dot" />{t(isHost ? "result.hostWaiting" : "result.playerWaiting")}</div>
    </div>
  );
}
