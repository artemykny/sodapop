import { Avatar } from "../../shared/Avatar.jsx";

export function Finished({ state, leave }) {
  const ranked = [...state.players].sort((a, b) => b.score - a.score);
  const topScore = ranked[0]?.score;
  const winners = ranked.filter((player) => player.score === topScore).map((player) => player.display_name);
  return (
    <div className="phase-body finished-body">
      <div className="winner-card"><span className="winner-crown">★</span><p>{winners.length > 1 ? "Joint winners" : "Tonight's sharpest eye"}</p><h2>{winners.join(" & ")}</h2><strong>{topScore} {topScore === 1 ? "point" : "points"}</strong></div>
      <div className="final-ranking">{ranked.map((player, index) => <div key={player.id}><b>{String(index + 1).padStart(2, "0")}</b><Avatar player={player} /><span>{player.display_name}</span><strong>{player.score}</strong></div>)}</div>
      <button className="secondary-button" onClick={leave}>Play another game</button>
    </div>
  );
}
