import { useState } from "react";
import { Avatar } from "../../shared/Avatar.jsx";

export function Voting({ state, me, send }) {
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
        <h2>Vote locked</h2>
        <p>Only you can see this choice until the result is revealed.</p>
        <div className="locked-choice accusation-choice">
          <span>Your accusation</span><strong>{accused?.display_name || "Unknown player"}</strong>
        </div>
        <button className="secondary-button" onClick={unlockVote} disabled={unlocking}>{unlocking ? "Unlocking…" : "Change vote"}</button>
      </div>
    );
  }

  return (
    <div className="phase-body">
      <p className="phase-intro">Choose the player whose answer felt just a little sideways. You cannot vote for yourself.</p>
      <div className="suspect-grid">
        {state.players.filter((player) => player.id !== me?.id).map((player) => (
          <button className={`suspect-card ${selected === player.id ? "selected" : ""}`} key={player.id} onClick={() => setSelected(player.id)} disabled={submitted} aria-pressed={selected === player.id}>
            <Avatar player={player} /><span>{player.display_name}</span><i>{selected === player.id ? "Selected" : "Choose"}</i>
          </button>
        ))}
      </div>
      <button className="primary-button stage-action" onClick={vote} disabled={!selected || submitted}>{submitted ? "Submitting…" : "Lock accusation"} <span>→</span></button>
    </div>
  );
}
