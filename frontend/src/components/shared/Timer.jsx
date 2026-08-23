export function Timer({ seconds, paused = false, settings }) {
  const urgent = seconds <= 10;
  const label = paused ? `Paused with ${seconds} seconds remaining` : `${seconds} seconds remaining`;
  return (
    <div className="timer-popover">
      <div className={`timer ${urgent ? "urgent" : ""} ${paused ? "paused" : ""}`} aria-label={label} aria-describedby="timer-settings-tooltip" tabIndex="0">
        {paused && <b>Ⅱ</b>}<span>{String(Math.floor(seconds / 60)).padStart(2, "0")}</span><i>:</i><span>{String(seconds % 60).padStart(2, "0")}</span>
      </div>
      {settings && (
        <div className="timer-settings-tooltip" id="timer-settings-tooltip" role="tooltip">
          <strong>Game settings</strong>
          <dl>
            <Setting label="Players" value={settings.player_limit} />
            <Setting label="Rounds" value={settings.rounds} />
            <Setting label="Answer" value={`${settings.answer_seconds}s`} />
            <Setting label="Discussion" value={`${settings.discussion_seconds}s`} />
            <Setting label="Voting" value={`${settings.voting_seconds}s`} />
          </dl>
        </div>
      )}
    </div>
  );
}

function Setting({ label, value }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}
