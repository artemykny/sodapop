import { useI18n } from "../../i18n/I18n.jsx";

export function Timer({ seconds, paused = false, settings }) {
  const { t } = useI18n();
  const urgent = seconds <= 10;
  const label = t(paused ? "timer.pausedLabel" : "timer.remainingLabel", { count: seconds });
  return (
    <div className="timer-popover">
      <div className={`timer ${urgent ? "urgent" : ""} ${paused ? "paused" : ""}`} aria-label={label} aria-describedby="timer-settings-tooltip" tabIndex="0">
        {paused && <b>Ⅱ</b>}<span>{String(Math.floor(seconds / 60)).padStart(2, "0")}</span><i>:</i><span>{String(seconds % 60).padStart(2, "0")}</span>
      </div>
      {settings && (
        <div className="timer-settings-tooltip" id="timer-settings-tooltip" role="tooltip">
          <strong>{t("timer.settings")}</strong>
          <dl>
            <Setting label={t("timer.players")} value={settings.player_limit} />
            <Setting label={t("timer.rounds")} value={settings.rounds} />
            <Setting label={t("timer.answer")} value={`${settings.answer_seconds}s`} />
            <Setting label={t("timer.discussion")} value={`${settings.discussion_seconds}s`} />
            <Setting label={t("timer.voting")} value={`${settings.voting_seconds}s`} />
          </dl>
        </div>
      )}
    </div>
  );
}

function Setting({ label, value }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}
