import { useEffect, useState } from "react";
import { useI18n } from "../../i18n/I18n.jsx";

export function HostControlsModal({ state, send, onClose }) {
  const { t } = useI18n();
  const [values, setValues] = useState(() => ({ ...state.settings }));
  const [working, setWorking] = useState("");
  const minimumRounds = Math.max(1, state.round || 1);
  const maximumRounds = state.max_rounds || 50;
  const phaseAction = getPhaseAction(state, t);
  const canPause = state.phase !== "lobby" && state.phase !== "finished";
  const statusLabel = t(state.phase === "lobby" ? "hostControls.waiting" : state.paused ? "hostControls.paused" : "hostControls.running");

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
          <div><p className="kicker">{t("hostControls.privateTools")}</p><h2 id="host-controls-title">{t("hostControls.title")}</h2></div>
          <button type="button" className="room-settings-close" onClick={onClose} disabled={Boolean(working)} aria-label={t("hostControls.close")}>×</button>
        </header>
        <div className="host-controls-body">
          <section className="host-control-section">
            <div className="host-control-heading"><div><span>{t("hostControls.gameState")}</span><strong>{t(`room.phases.${state.phase}.name`)}</strong></div><b className={state.paused ? "paused" : "running"}>{statusLabel}</b></div>
            {(canPause || phaseAction) && (
              <div className="host-action-grid">
                {canPause && (
                  <button className="secondary-button" onClick={() => runCommand(state.paused ? "resume_game" : "pause_game")} disabled={Boolean(working)}>
                    {t(working ? "hostControls.working" : state.paused ? "hostControls.resume" : "hostControls.pause")}
                  </button>
                )}
                {phaseAction && (
                  <button className="primary-button" onClick={() => runCommand(phaseAction.command, phaseAction.confirmation)} disabled={Boolean(working) || phaseAction.disabled}>
                    {phaseAction.label}<span aria-hidden="true">→</span>
                  </button>
                )}
              </div>
            )}
            {state.paused && <p className="host-paused-note">{t("hostControls.pausedHelp")}</p>}
          </section>

          <form className="host-control-section" onSubmit={submitSettings}>
            <div className="host-control-heading"><div><span>{t("hostControls.configuration")}</span><strong>{t("hostControls.roomSettings")}</strong></div></div>
            {state.phase !== "lobby" && (
              <p className="settings-notice">{t(state.paused ? "hostControls.timerPaused" : "hostControls.timerRunning")} {t("hostControls.durationsHelp")}</p>
            )}
            <div className="room-settings-grid">
              <SettingField label={t("hostControls.playerLimit")} value={values.player_limit} onChange={update("player_limit")} min={state.players.length} max={20} />
              <SettingField label={t("hostControls.rounds")} value={values.rounds} onChange={update("rounds")} min={minimumRounds} max={maximumRounds} />
              <SettingField label={t("hostControls.answerSeconds")} value={values.answer_seconds} onChange={update("answer_seconds")} min={5} max={900} />
              <SettingField label={t("hostControls.discussionSeconds")} value={values.discussion_seconds} onChange={update("discussion_seconds")} min={5} max={3600} />
              <SettingField label={t("hostControls.votingSeconds")} value={values.voting_seconds} onChange={update("voting_seconds")} min={5} max={900} />
            </div>
            <p className="settings-limits">{t("hostControls.limits", { minimum: minimumRounds, maximum: maximumRounds })}</p>
            <button className="secondary-button save-settings-button" disabled={Boolean(working)}>{t(working === "update_settings" ? "hostControls.saving" : "hostControls.save")}</button>
          </form>

          {state.phase !== "lobby" && (
            <section className="host-control-section danger-zone">
              <div><span>{t("hostControls.danger")}</span><strong>{t("hostControls.endForEveryone")}</strong></div>
              <button className="text-button danger-link" onClick={() => runCommand("stop_game", t("hostControls.endConfirm"))} disabled={Boolean(working)}>{t("hostControls.endGame")}</button>
            </section>
          )}
        </div>
      </section>
    </div>
  );
}

function getPhaseAction(state, t) {
  switch (state.phase) {
    case "lobby":
      return null;
    case "answering":
      return { label: t("hostControls.endAnswering"), command: "advance", confirmation: t("hostControls.endAnsweringConfirm") };
    case "discussion":
      return { label: t("hostControls.startVoting"), command: "advance" };
    case "voting":
      return { label: t("hostControls.reveal"), command: "advance", confirmation: t("hostControls.revealConfirm") };
    case "round_result":
      return { label: t(state.round >= state.settings.rounds ? "hostControls.finalScores" : "hostControls.nextRound"), command: "advance" };
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
