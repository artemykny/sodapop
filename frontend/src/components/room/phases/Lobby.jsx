import { useI18n } from "../../../i18n/I18n.jsx";

export function Lobby({ state, isHost, send, copyInvite }) {
  const { plural, t } = useI18n();
  const canStart = state.players.length >= 3;
  return (
    <div className="phase-body lobby-body">
      <div className="room-code-card">
        <span className="card-label">{t("lobby.room")}</span>
        <strong>{state.room_name}</strong>
        <button className="secondary-button" onClick={copyInvite}>{t("lobby.copyInvite")} <span>↗</span></button>
      </div>
      <div className="lobby-copy">
        <p>{state.players.length < 3 ? plural("lobby.inviteMore", 3 - state.players.length) : t("lobby.everyoneHere")}</p>
        <div className="rules-mini">
          <span>{t("lobby.rounds", { count: state.settings.rounds })}</span><span>{t("lobby.answers", { count: state.settings.answer_seconds })}</span><span>{t("lobby.debate", { count: state.settings.discussion_seconds })}</span>
        </div>
        {isHost ? (
          <button className="primary-button stage-action" onClick={() => send("start_game")} disabled={!canStart}>{t("lobby.start")} <span>→</span></button>
        ) : (
          <div className="waiting-note"><span className="pulse-dot" />{t("lobby.waiting")}</div>
        )}
      </div>
    </div>
  );
}
