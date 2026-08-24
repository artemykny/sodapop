import { useState } from "react";
import { useI18n } from "../../../i18n/I18n.jsx";
import { Avatar } from "../../shared/Avatar.jsx";

export function Voting({ state, me, send }) {
  const { t } = useI18n();
  const [selected, setSelected] = useState(state.your_vote || "");
  const [submitted, setSubmitted] = useState(false);
  const [unlocking, setUnlocking] = useState(false);

  function vote() {
    if (selected && send("cast_vote", { player_id: selected }, () => setSubmitted(false))) setSubmitted(true);
  }

  function unlockVote() {
    if (send("unlock_vote", {}, () => setUnlocking(false))) setUnlocking(true);
  }

  if (state.vote_locked) {
    const accused = state.players.find((player) => player.id === state.your_vote);
    return (
      <div className="locked-card">
        <div className="lock-seal accusation">!</div>
        <h2>{t("voting.locked")}</h2>
        <p>{t("voting.lockedHelp")}</p>
        <div className="locked-choice accusation-choice">
          <span>{t("voting.accusation")}</span><strong>{accused?.display_name || t("voting.unknown")}</strong>
        </div>
        <button className="secondary-button" onClick={unlockVote} disabled={unlocking}>{t(unlocking ? "voting.unlocking" : "voting.change")}</button>
      </div>
    );
  }

  return (
    <div className="phase-body">
      <p className="phase-intro">{t("voting.intro")}</p>
      <div className="suspect-grid">
        {state.players.filter((player) => player.id !== me?.id).map((player) => (
          <button className={`suspect-card ${selected === player.id ? "selected" : ""}`} key={player.id} onClick={() => setSelected(player.id)} disabled={submitted} aria-pressed={selected === player.id}>
            <Avatar player={player} /><span>{player.display_name}</span><i>{t(selected === player.id ? "voting.selected" : "voting.choose")}</i>
          </button>
        ))}
      </div>
      <button className="primary-button stage-action" onClick={vote} disabled={!selected || submitted}>{t(submitted ? "voting.submitting" : "voting.lock")} <span>→</span></button>
    </div>
  );
}
