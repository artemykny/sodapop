import { useEffect, useState } from "react";

export function HostControlsModal({ state, send, onClose }) {
  const [values, setValues] = useState(() => ({ ...state.settings }));
  const [working, setWorking] = useState("");
  const minimumRounds = Math.max(1, state.round || 1);
  const maximumRounds = state.max_rounds || 50;
  const phaseAction = getPhaseAction(state);
  const canPause = state.phase !== "lobby" && state.phase !== "finished";
  const statusLabel = state.phase === "lobby" ? "Waiting" : state.paused ? "Paused" : "Running";

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function closeOnEscape(event) {
      if (event.key === "Escape" && !working) onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose, working]);

  function update(field) {
    return (event) => setValues((current) => ({ ...current, [field]: event.target.value }));
  }

  function runCommand(type, confirmation) {
    if (confirmation && !window.confirm(confirmation)) return;
    if (send(type, {}, (accepted) => {
      setWorking("");
      if (accepted) onClose();
    })) setWorking(type);
  }

  function submitSettings(event) {
    event.preventDefault();
    const settings = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, Number(value)]));
    if (send("update_settings", { settings }, (accepted) => {
      setWorking("");
      if (accepted) onClose();
    })) setWorking("update_settings");
  }

  return (
    <div className="room-settings-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !working && onClose()}>
      <section className="room-settings-modal host-controls-modal" role="dialog" aria-modal="true" aria-labelledby="host-controls-title">
        <header>
          <div><p className="kicker">Private host tools</p><h2 id="host-controls-title">Host controls</h2></div>
          <button type="button" className="room-settings-close" onClick={onClose} disabled={Boolean(working)} aria-label="Close host controls">×</button>
        </header>
        <div className="host-controls-body">
          <section className="host-control-section">
            <div className="host-control-heading"><div><span>Game state</span><strong>{formatPhase(state.phase)}</strong></div><b className={state.paused ? "paused" : "running"}>{statusLabel}</b></div>
            {(canPause || phaseAction) && (
              <div className="host-action-grid">
                {canPause && (
                  <button className="secondary-button" onClick={() => runCommand(state.paused ? "resume_game" : "pause_game")} disabled={Boolean(working)}>
                    {working ? "Working…" : state.paused ? "Resume timer" : "Pause timer"}
                  </button>
                )}
                {phaseAction && (
                  <button className="primary-button" onClick={() => runCommand(phaseAction.command, phaseAction.confirmation)} disabled={Boolean(working) || phaseAction.disabled}>
                    {phaseAction.label}<span aria-hidden="true">→</span>
                  </button>
                )}
              </div>
            )}
            {state.paused && <p className="host-paused-note">Players can still edit and submit answers or votes while paused. Automatic progression resumes only when you resume or advance manually.</p>}
          </section>

          <form className="host-control-section" onSubmit={submitSettings}>
            <div className="host-control-heading"><div><span>Configuration</span><strong>Room settings</strong></div></div>
            {state.phase !== "lobby" && (
              <p className="settings-notice">{state.paused ? "The timer is paused." : "The current countdown will keep running."} New durations apply the next time each phase starts.</p>
            )}
            <div className="room-settings-grid">
              <SettingField label="Player limit" value={values.player_limit} onChange={update("player_limit")} min={state.players.length} max={20} />
              <SettingField label="Rounds" value={values.rounds} onChange={update("rounds")} min={minimumRounds} max={maximumRounds} />
              <SettingField label="Answer time (seconds)" value={values.answer_seconds} onChange={update("answer_seconds")} min={5} max={900} />
              <SettingField label="Discussion time (seconds)" value={values.discussion_seconds} onChange={update("discussion_seconds")} min={5} max={3600} />
              <SettingField label="Voting time (seconds)" value={values.voting_seconds} onChange={update("voting_seconds")} min={5} max={900} />
            </div>
            <p className="settings-limits">Rounds: {minimumRounds}–{maximumRounds}. Player limit cannot be lower than the current roster.</p>
            <button className="secondary-button save-settings-button" disabled={Boolean(working)}>{working === "update_settings" ? "Saving…" : "Save settings"}</button>
          </form>

          {state.phase !== "lobby" && (
            <section className="host-control-section danger-zone">
              <div><span>Danger zone</span><strong>End the game for everyone</strong></div>
              <button className="text-button danger-link" onClick={() => runCommand("stop_game", "End this game for everyone?")} disabled={Boolean(working)}>End game</button>
            </section>
          )}
        </div>
      </section>
    </div>
  );
}

function getPhaseAction(state) {
  switch (state.phase) {
    case "lobby":
      return null;
    case "answering":
      return { label: "End answering", command: "advance", confirmation: "End answering now? Players who have not locked an answer will be left out of this round." };
    case "discussion":
      return { label: "Start voting", command: "advance" };
    case "voting":
      return { label: "Reveal result", command: "advance", confirmation: "Reveal the result now? Players who have not locked a vote will not be counted." };
    case "round_result":
      return { label: state.round >= state.settings.rounds ? "Show final scores" : "Start next round", command: "advance" };
    default:
      return null;
  }
}

function SettingField({ label, value, onChange, min, max }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type="number" inputMode="numeric" value={value} onChange={onChange} min={min} max={max} required />
    </label>
  );
}

function formatPhase(value) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
