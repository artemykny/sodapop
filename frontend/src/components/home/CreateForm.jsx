import { useEffect, useRef, useState } from "react";
import { createRoom } from "../../api/client.js";
import { useI18n } from "../../i18n/I18n.jsx";
import { Field } from "../shared/Field.jsx";
import { FlowProgress } from "./FlowProgress.jsx";

export function CreateForm({ busy, submit, packs, catalogError, playerName, onPlayerNameChange }) {
  const { plural, t } = useI18n();
  const steps = t("create.steps");
  const stepCopy = t("create.copy");
  const [step, setStep] = useState(0);
  const [values, setValues] = useState(() => ({
    roomName: t("create.defaultRoomName"), password: "", playerLimit: 8,
    answerSeconds: 60, discussionSeconds: 120, votingSeconds: 45, rounds: 5, pack: "",
  }));
  const [customQuestions, setCustomQuestions] = useState(null);
  const [packQuery, setPackQuery] = useState("");
  const fileRef = useRef(null);

  useEffect(() => {
    if (packs.length > 0 && !values.pack && !customQuestions) {
      setValues((current) => ({ ...current, pack: packs[0].id }));
    }
  }, [packs, values.pack, customQuestions]);

  const update = (key) => (event) => setValues((current) => ({ ...current, [key]: event.target.value }));
  const selectedPack = packs.find((pack) => pack.id === values.pack);
  const normalizedPackQuery = packQuery.trim().toLowerCase();
  const visiblePacks = packs.filter((pack) => !normalizedPackQuery || [pack.name, pack.description, pack.id].some((value) => value?.toLowerCase().includes(normalizedPackQuery)));
  const maxRounds = customQuestions?.length || selectedPack?.question_count || 1;

  async function uploadQuestions(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (!Array.isArray(parsed) || parsed.length === 0 || parsed.some((item) => !item.real?.trim() || !item.fake?.trim())) throw new Error();
      setCustomQuestions(parsed);
      setValues((current) => ({ ...current, pack: "", rounds: Math.min(Number(current.rounds), parsed.length) }));
    } catch {
      event.target.value = "";
      setCustomQuestions(null);
    }
  }

  function selectPack(pack) {
    setCustomQuestions(null);
    setValues((current) => ({
      ...current,
      pack: pack.id,
      rounds: Math.min(Number(current.rounds), pack.question_count),
    }));
  }

  function onSubmit(event) {
    event.preventDefault();
    if (step < steps.length - 1) {
      setStep((current) => current + 1);
      return;
    }
    const payload = {
      name: values.roomName.trim(), password: values.password, host_name: playerName.trim(),
      settings: {
        player_limit: Number(values.playerLimit), answer_seconds: Number(values.answerSeconds),
        discussion_seconds: Number(values.discussionSeconds), voting_seconds: Number(values.votingSeconds),
        rounds: Number(values.rounds),
      },
    };
    if (customQuestions) payload.questions = customQuestions;
    else payload.question_pack = values.pack;
    submit(() => createRoom(payload));
  }

  const canContinue = step === 0
    ? Boolean(values.roomName.trim() && playerName.trim())
    : step === 1
      ? Boolean(customQuestions || values.pack)
      : step === 2
        ? Boolean(values.password)
        : true;
  const copy = stepCopy[step];

  return (
    <form className="room-form flow-form" onSubmit={onSubmit}>
      <FlowProgress current={step} steps={steps} eyebrow={copy.eyebrow} title={copy.title} description={copy.description} />

      {step === 0 && (
        <section className="flow-step" aria-label={t("create.roomBasics")}>
          <Field label={t("create.yourName")}><input value={playerName} onChange={(event) => onPlayerNameChange(event.target.value)} maxLength={30} placeholder={t("create.yourNamePlaceholder")} autoFocus required /></Field>
          <Field label={t("create.roomName")}><input value={values.roomName} onChange={update("roomName")} maxLength={60} placeholder={t("create.roomNamePlaceholder")} required /></Field>
          <div className="flow-tip"><span>01</span><p>{t("create.hostTip")}</p></div>
        </section>
      )}

      {step === 1 && (
        <section className="flow-step question-pack-step" aria-label={t("create.packSelection")}>
          <fieldset className="field field-group">
            <legend className="visually-hidden">{t("create.questionPack")}</legend>
            <div className="pack-options-heading">
              <div><span className="card-label">{t("create.questionPacks")}</span><strong>{t("create.choosePack")}</strong></div>
              <small>{packs.length ? t("create.packCount", { visible: visiblePacks.length, total: packs.length }) : t("create.noSavedPacks")}</small>
            </div>
            {packs.length > 6 && <label className="pack-search"><span className="visually-hidden">{t("create.searchPacks")}</span><input type="search" value={packQuery} onChange={(event) => setPackQuery(event.target.value)} placeholder={t("create.searchPlaceholder")} /></label>}
            <div className="question-pack-options" role="group" aria-label={t("create.availablePacks")}>
              {!packs.length && !catalogError && (
                <div className="pack-catalog-empty" role="status">
                  <span aria-hidden="true">?</span>
                  <div>
                    <strong>{t("create.noPacksYet")}</strong>
                    <p>{t("create.noPacksHelp")}</p>
                  </div>
                </div>
              )}
              {visiblePacks.map((pack) => (
                <label key={pack.id} className={`pack-browser-option ${!customQuestions && values.pack === pack.id ? "selected" : ""}`}>
                  <input type="radio" name="question-pack" checked={!customQuestions && values.pack === pack.id} onChange={() => selectPack(pack)} />
                  <i>{String(packs.findIndex((item) => item.id === pack.id) + 1).padStart(2, "0")}</i><span><strong>{pack.name}</strong><small>{pack.description} · {plural("create.questions", pack.question_count)}</small></span>
                </label>
              ))}
              {packs.length > 0 && !visiblePacks.length && <p className="pack-search-empty">{t("create.noPackMatch", { query: packQuery.trim() })}</p>}
              <button type="button" className={`pack-browser-option upload-pack-option ${customQuestions ? "selected" : ""}`} onClick={() => fileRef.current?.click()} aria-label={customQuestions ? `${t("common.customQuestions")}: ${t("create.chooseAnotherFile")}` : t("common.upload")} aria-pressed={Boolean(customQuestions)}>
                <i>{customQuestions ? "★" : "+"}</i>
                <span><strong>{customQuestions ? t("common.customQuestions") : t("common.upload")}</strong><small>{customQuestions ? `${plural("create.customPairs", customQuestions.length)} · ${t("create.chooseAnotherFile")}` : t("create.uploadHelp")}</small></span>
              </button>
            </div>
            <input ref={fileRef} className="visually-hidden" type="file" accept="application/json,.json" onChange={uploadQuestions} />
          </fieldset>
          {catalogError && <p className="form-error" role="alert">{t("create.catalogError")}</p>}
        </section>
      )}

      {step === 2 && (
        <section className="flow-step" aria-label={t("create.roomSetup")}>
          <div className="settings-card">
            <div><span className="card-label">{t("create.roomSettings")}</span><strong>{t("create.fineTune")}</strong></div>
            <div className="settings-strip">
              <Field label={t("create.players")}><input type="number" min="3" max="20" value={values.playerLimit} onChange={update("playerLimit")} /></Field>
              <Field label={t("create.rounds")}><input type="number" min="1" max={maxRounds} value={values.rounds} onChange={update("rounds")} /></Field>
              <Field label={t("create.answer")}><select value={values.answerSeconds} onChange={update("answerSeconds")}><option value="30">{t("create.secondsShort", { count: 30 })}</option><option value="60">{t("create.minutesShort", { count: 1 })}</option><option value="90">{t("create.minutesShort", { count: "1½" })}</option><option value="120">{t("create.minutesShort", { count: 2 })}</option></select></Field>
              <Field label={t("create.discuss")}><select value={values.discussionSeconds} onChange={update("discussionSeconds")}><option value="60">{t("create.minutesShort", { count: 1 })}</option><option value="120">{t("create.minutesShort", { count: 2 })}</option><option value="180">{t("create.minutesShort", { count: 3 })}</option><option value="300">{t("create.minutesShort", { count: 5 })}</option></select></Field>
            </div>
          </div>
          <div className="private-room-card">
            <div className="private-room-heading">
              <span className="access-icon">✦</span>
              <div><strong>{t("common.passwordProtected")}</strong><small>{t("create.privateHelp")}</small></div>
            </div>
            <div className="private-password-field">
              <Field label={t("create.roomPassword")}><input type="password" value={values.password} onChange={update("password")} maxLength={100} placeholder={t("create.passwordPlaceholder")} autoFocus required /></Field>
              <p>{t("create.inviteAccessHelp")}</p>
            </div>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="flow-step ready-step" aria-label={t("create.readyLabel")}>
          <div className="ready-hero">
            <span>✓</span>
            <div><p className="kicker">{t("create.roomReady")}</p><h3>{values.roomName}</h3><p>{t("create.hostedBy", { name: playerName })}</p></div>
          </div>
          <dl className="ready-details">
            <div><dt>{t("create.questionsLabel")}</dt><dd>{customQuestions ? plural("create.customPairs", customQuestions.length) : selectedPack?.name}</dd></div>
            <div><dt>{t("create.gameLabel")}</dt><dd>{t("create.roundsPlayers", { rounds: values.rounds, players: values.playerLimit })}</dd></div>
            <div><dt>{t("create.timingLabel")}</dt><dd>{t("create.timing", { answer: values.answerSeconds, discussion: values.discussionSeconds })}</dd></div>
            <div><dt>{t("create.accessLabel")}</dt><dd>{t("common.passwordProtected")}</dd></div>
          </dl>
          <p className="ready-note">{t("create.settingsLater")}</p>
        </section>
      )}

      <div className="flow-actions">
        {step > 0 && <button type="button" className="text-button" onClick={() => setStep((current) => current - 1)}>← {t("common.back")}</button>}
        <button className="primary-button" disabled={busy || !canContinue}>
          {busy ? t("create.building") : step === 0 ? t("create.continueQuestions") : step === 1 ? t("create.continueSetup") : step === 2 ? t("create.reviewRoom") : t("create.createRoom")}<span aria-hidden="true">→</span>
        </button>
      </div>
    </form>
  );
}
