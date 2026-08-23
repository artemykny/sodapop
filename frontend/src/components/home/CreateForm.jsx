import { useEffect, useRef, useState } from "react";
import { createRoom } from "../../api/client.js";
import { Field } from "../shared/Field.jsx";
import { FlowProgress } from "./FlowProgress.jsx";

const steps = ["Basics", "Game", "Access"];
const stepCopy = [
  { eyebrow: "Make it yours", title: "Name the gathering", description: "Give everyone a room to recognize and tell us what to call you." },
  { eyebrow: "Set the game", title: "Choose the chaos", description: "Pick a question pack and tune the pace for your group." },
  { eyebrow: "Invite your people", title: "Open door or secret knock?", description: "Keep it effortless, or protect the room with a password included in its invite link." },
];

export function CreateForm({ busy, submit, packs, catalogError, playerName, onPlayerNameChange }) {
  const [step, setStep] = useState(0);
  const [privateRoom, setPrivateRoom] = useState(false);
  const [values, setValues] = useState({
    roomName: "Friday suspects", password: "", playerLimit: 8,
    answerSeconds: 60, discussionSeconds: 120, votingSeconds: 45, rounds: 5, pack: "",
  });
  const [customQuestions, setCustomQuestions] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => {
    if (packs.length > 0 && !values.pack && !customQuestions) {
      setValues((current) => ({ ...current, pack: packs[0].id }));
    }
  }, [packs, values.pack, customQuestions]);

  const update = (key) => (event) => setValues((current) => ({ ...current, [key]: event.target.value }));
  const selectedPack = packs.find((pack) => pack.id === values.pack);
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
      name: values.roomName.trim(), password: privateRoom ? values.password : "", host_name: playerName.trim(),
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
      : !privateRoom || Boolean(values.password);
  const copy = stepCopy[step];

  return (
    <form className="room-form flow-form" onSubmit={onSubmit}>
      <FlowProgress current={step} steps={steps} eyebrow={copy.eyebrow} title={copy.title} description={copy.description} />

      {step === 0 && (
        <section className="flow-step" aria-label="Room basics">
          <Field label="Your name"><input value={playerName} onChange={(event) => onPlayerNameChange(event.target.value)} maxLength={30} placeholder="How should we know you?" autoFocus required /></Field>
          <Field label="Room name"><input value={values.roomName} onChange={update("roomName")} maxLength={60} placeholder="e.g. Friday suspects" required /></Field>
          <div className="flow-tip"><span>01</span><p>You’ll be the host. You can change game settings from the room later.</p></div>
        </section>
      )}

      {step === 1 && (
        <section className="flow-step" aria-label="Game setup">
          <fieldset className="field field-group">
            <legend>Question pack</legend>
            <div className="pack-grid">
              {packs.map((pack) => (
                <button type="button" key={pack.id} className={`pack-choice ${!customQuestions && values.pack === pack.id ? "selected" : ""}`} onClick={() => selectPack(pack)} aria-pressed={!customQuestions && values.pack === pack.id}>
                  <span>{pack.name}</span><small>{pack.description}</small>
                </button>
              ))}
              <button type="button" className={`pack-choice upload-choice ${customQuestions ? "selected" : ""}`} onClick={() => fileRef.current?.click()} aria-pressed={Boolean(customQuestions)}>
                <span>{customQuestions ? `${customQuestions.length} custom pairs` : "Upload JSON"}</span><small>Bring your own real and odd questions.</small>
              </button>
              <input ref={fileRef} className="visually-hidden" type="file" accept="application/json,.json" onChange={uploadQuestions} />
            </div>
          </fieldset>
          {catalogError && <p className="form-error" role="alert">Built-in packs could not be loaded. You can still upload a custom pack.</p>}
          <div className="settings-card">
            <div><span className="card-label">Room settings</span><strong>Fine-tune the pace</strong></div>
            <div className="settings-strip">
              <Field label="Players"><input type="number" min="3" max="20" value={values.playerLimit} onChange={update("playerLimit")} /></Field>
              <Field label="Rounds"><input type="number" min="1" max={maxRounds} value={values.rounds} onChange={update("rounds")} /></Field>
              <Field label="Answer"><select value={values.answerSeconds} onChange={update("answerSeconds")}><option value="30">30 sec</option><option value="60">1 min</option><option value="90">1½ min</option><option value="120">2 min</option></select></Field>
              <Field label="Discuss"><select value={values.discussionSeconds} onChange={update("discussionSeconds")}><option value="60">1 min</option><option value="120">2 min</option><option value="180">3 min</option><option value="300">5 min</option></select></Field>
            </div>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="flow-step" aria-label="Room access">
          <div className="access-grid">
            <button type="button" className={`access-choice ${!privateRoom ? "selected" : ""}`} onClick={() => setPrivateRoom(false)} aria-pressed={!privateRoom}>
              <span className="access-icon">↗</span><strong>Open room</strong><small>Anyone with the room name or link can join.</small>
            </button>
            <button type="button" className={`access-choice ${privateRoom ? "selected" : ""}`} onClick={() => setPrivateRoom(true)} aria-pressed={privateRoom}>
              <span className="access-icon">✦</span><strong>Private room</strong><small>The invite link carries the password for your guests.</small>
            </button>
          </div>
          {privateRoom && (
            <div className="password-card">
              <Field label="Room password"><input type="password" value={values.password} onChange={update("password")} maxLength={100} placeholder="Choose a secret knock" autoFocus required /></Field>
              <p>Anyone opening your invite link gets access automatically. People joining by room name will be asked for this password.</p>
            </div>
          )}
          <div className="room-review">
            <span className="card-label">Ready to create</span>
            <strong>{values.roomName}</strong>
            <p>{playerName} · {values.rounds} rounds · up to {values.playerLimit} players · {privateRoom ? "private" : "open"}</p>
          </div>
        </section>
      )}

      <div className="flow-actions">
        {step > 0 && <button type="button" className="text-button" onClick={() => setStep((current) => current - 1)}>← Back</button>}
        <button className="primary-button" disabled={busy || !canContinue}>
          {busy ? "Building your room…" : step === 0 ? "Continue to game" : step === 1 ? "Continue to access" : "Create room"}<span aria-hidden="true">→</span>
        </button>
      </div>
    </form>
  );
}
