import { useState } from "react";
import { Avatar } from "../../shared/Avatar.jsx";

export function Voting({ state, me, send, isHost }) {
  const [selected, setSelected] = useState("");
  const [submitted, setSubmitted] = useState(false);

  function vote() {
    if (selected && send("cast_vote", { player_id: selected }, (accepted) => {
      if (!accepted) setSubmitted(false);
    })) setSubmitted(true);
  }

  if (state.vote_locked) return <div className="locked-card"><div className="lock-seal accusation">!</div><h2>Vote locked</h2><p>No taking it back now. Waiting for the final accusations.</p>{isHost && <button className="text-button" onClick={() => send("advance")}>Reveal the vote →</button>}</div>;

  return (
    <div className="phase-body">
      <p className="phase-intro">Choose the player whose answer felt just a little sideways. You cannot vote for yourself.</p>
      <div className="suspect-grid">
        {state.players.filter((player) => player.id !== me?.id).map((player) => (
          <button className={`suspect-card ${selected === player.id ? "selected" : ""}`} key={player.id} onClick={() => setSelected(player.id)} disabled={submitted}>
            <Avatar player={player} /><span>{player.display_name}</span><i>{selected === player.id ? "Selected" : "Choose"}</i>
          </button>
        ))}
      </div>
      <button className="primary-button stage-action" onClick={vote} disabled={!selected || submitted}>{submitted ? "Submitting…" : "Lock accusation"} <span>→</span></button>
    </div>
  );
}
