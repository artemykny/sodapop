import { Avatar } from "../../shared/Avatar.jsx";
import { useI18n } from "../../../i18n/I18n.jsx";

export function Finished({ state, leave }) {
  const { plural, t } = useI18n();
  const ranked = [...state.players].sort((a, b) => b.score - a.score);
  const topScore = ranked[0]?.score;
  const winners = ranked.filter((player) => player.score === topScore).map((player) => player.display_name);
  return (
    <div className="phase-body finished-body">
      <div className="winner-card"><span className="winner-crown">★</span><p>{t(winners.length > 1 ? "finished.jointWinners" : "finished.winner")}</p><h2>{winners.join(" & ")}</h2><strong>{plural("finished.points", topScore)}</strong></div>
      <div className="final-ranking">{ranked.map((player, index) => <div key={player.id}><b>{String(index + 1).padStart(2, "0")}</b><Avatar player={player} /><span>{player.display_name}</span><strong>{player.score}</strong></div>)}</div>
      <button className="secondary-button" onClick={leave}>{t("finished.playAgain")}</button>
    </div>
  );
}
