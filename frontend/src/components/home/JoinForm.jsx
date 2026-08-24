import { useEffect, useState } from "react";
import { joinRoom, resolveRoom, searchRooms } from "../../api/client.js";
import { localizeError, useI18n } from "../../i18n/I18n.jsx";
import { Field } from "../shared/Field.jsx";
import { FlowProgress } from "./FlowProgress.jsx";

export function JoinForm({ busy, submit, invite, playerName, onPlayerNameChange }) {
  const { t } = useI18n();
  const [step, setStep] = useState(0);
  const [values, setValues] = useState({ roomName: invite.get("room") || "", password: invite.get("password") || "" });
  const [roomId, setRoomId] = useState(invite.get("roomId") || "");
  const [assignment, setAssignment] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [lookupError, setLookupError] = useState("");
  const [resolving, setResolving] = useState(false);
  const [inviteAccess, setInviteAccess] = useState(Boolean(invite.get("password")));
  const update = (key) => (event) => setValues((current) => ({ ...current, [key]: event.target.value }));

  useEffect(() => {
    const query = values.roomName.trim();
    if (roomId || step !== 0 || [...query].length < 2) {
      setSuggestions([]);
      return undefined;
    }
    let disposed = false;
    const timer = window.setTimeout(() => {
      searchRooms(query).then(
        (rooms) => { if (!disposed) setSuggestions(rooms); },
        () => { if (!disposed) setSuggestions([]); },
      );
    }, 200);
    return () => {
      disposed = true;
      window.clearTimeout(timer);
    };
  }, [roomId, step, values.roomName]);

  useEffect(() => {
    const invitedRoomId = invite.get("roomId");
    if (!invitedRoomId) return undefined;

    let disposed = false;
    setResolving(true);
    setLookupError("");
    resolveRoom({ roomName: invite.get("room")?.trim() || "", roomId: invitedRoomId }).then(
      (result) => {
        if (disposed) return;
        setAssignment(result);
        setValues((current) => ({ ...current, roomName: result.room_name }));
        setStep(invite.get("password") ? 2 : 1);
      },
      (err) => { if (!disposed) setLookupError(localizeError(err, t)); },
    ).finally(() => { if (!disposed) setResolving(false); });

    return () => { disposed = true; };
  }, [invite, t]);

  function updateRoomName(event) {
    setRoomId("");
    setAssignment(null);
    setInviteAccess(false);
    setLookupError("");
    setValues((current) => ({ ...current, roomName: event.target.value, password: "" }));
  }

  function chooseSuggestion(room) {
    setRoomId("");
    setAssignment(null);
    setInviteAccess(false);
    setLookupError("");
    setValues((current) => ({ ...current, roomName: room.name, password: "" }));
  }

  async function findRoom() {
    setResolving(true);
    setLookupError("");
    try {
      const result = await resolveRoom({ roomName: values.roomName.trim(), roomId });
      setAssignment(result);
      setValues((current) => ({ ...current, roomName: result.room_name }));
      setStep(1);
    } catch (err) {
      setLookupError(localizeError(err, t));
    } finally {
      setResolving(false);
    }
  }

  async function enterRoom() {
    const result = await submit(() => joinRoom({
      assignment, displayName: playerName.trim(), password: values.password,
    }));
    if (!result.ok && result.error?.code === "invalid_password") {
      setValues((current) => ({ ...current, password: "" }));
      setInviteAccess(false);
      setStep(1);
    }
  }

  async function onSubmit(event) {
    event.preventDefault();
    if (step === 0) {
      await findRoom();
      return;
    }
    if (step === 1) {
      setStep(2);
      return;
    }
    await enterRoom();
  }

  const isIdentityStep = step === 2;
  const isPasswordStep = step === 1;
  const steps = t("join.steps");
  const visibleStep = Math.min(step, steps.length - 1);
  const copy = step === 0
    ? { eyebrow: t("join.findEyebrow"), title: t("join.whichRoom"), description: t("join.findDescription") }
    : isPasswordStep
      ? { eyebrow: t("join.privateEyebrow"), title: t("join.secretTitle"), description: t("join.secretDescription") }
      : { eyebrow: t("join.foundEyebrow"), title: t("join.joinTitle", { room: assignment?.room_name || t("join.roomFallback") }), description: inviteAccess ? t("join.inviteDescription") : t("join.identityDescription") };

  return (
    <form className="room-form flow-form join-form" onSubmit={onSubmit}>
      <FlowProgress current={visibleStep} steps={steps} eyebrow={copy.eyebrow} title={copy.title} description={copy.description} />

      {step === 0 && (
        <section className="flow-step" aria-label={t("join.findRoom")}>
          <Field label={t("join.roomName")} hint={t("join.typeHint")}>
            <input value={values.roomName} onChange={updateRoomName} maxLength={60} placeholder={t("join.roomPlaceholder")} autoComplete="off" autoFocus required />
          </Field>
          {suggestions.length > 0 && (
            <div className="room-suggestions" role="listbox" aria-label={t("join.joinableRooms")}>
              {suggestions.map((room) => (
                <button type="button" role="option" className={`pack-browser-option room-suggestion ${values.roomName === room.name ? "selected" : ""}`} aria-selected={values.roomName === room.name} key={`${room.game_id}:${room.name}`} onClick={() => chooseSuggestion(room)}>
                  <span><strong>{room.name}</strong></span><b>{t("join.protected")}</b>
                </button>
              ))}
            </div>
          )}
          {invite.has("roomId") && <div className="flow-tip invite-tip"><span>↗</span><p>{t("join.inviteDetected")}</p></div>}
          {lookupError && <p className="form-error" role="alert">{lookupError}</p>}
        </section>
      )}

      {isIdentityStep && (
        <section className="flow-step" aria-label={t("join.identity")}>
          <div className="found-room protected">
            <span className="access-icon">✦</span>
            <div><span className="card-label">{t("join.privateRoom")}</span><strong>{assignment.room_name}</strong></div>
            {inviteAccess && <b>{t("join.accessIncluded")}</b>}
          </div>
          <Field label={t("join.displayName")}><input value={playerName} onChange={(event) => onPlayerNameChange(event.target.value)} maxLength={30} placeholder={t("create.yourNamePlaceholder")} autoFocus required /></Field>
        </section>
      )}

      {isPasswordStep && (
        <section className="flow-step" aria-label={t("join.privateAccess")}>
          <div className="password-card join-password-card">
            <span className="access-icon">✦</span>
            <Field label={t("join.password")}><input type="password" value={values.password} onChange={update("password")} maxLength={100} placeholder={t("join.passwordPlaceholder")} autoFocus required /></Field>
          </div>
        </section>
      )}

      <div className="flow-actions">
        {step > 0 && <button type="button" className="text-button" onClick={() => setStep((current) => current - 1)}>← {t("common.back")}</button>}
        <button className="primary-button" disabled={busy || resolving || (step === 0 ? !values.roomName.trim() : isPasswordStep ? !values.password : !playerName.trim())}>
          {busy ? t("join.entering") : resolving ? t("join.looking") : step === 0 ? t("common.continue") : isPasswordStep ? t("join.continueName") : t("join.joinRoom")}<span aria-hidden="true">→</span>
        </button>
      </div>
    </form>
  );
}
