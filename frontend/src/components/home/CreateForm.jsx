import { useEffect, useRef, useState } from "react";
import { createRoom } from "../../api/client.js";
import { Field } from "../shared/Field.jsx";
import { FlowProgress } from "./FlowProgress.jsx";

const steps = ["Basics", "Questions", "Setup", "Review"];
const stepCopy = [
  { eyebrow: "Make it yours", title: "Name the gathering", description: "Give everyone a room to recognize and tell us what to call you." },
  { eyebrow: "Choose the questions", title: "Choose the deck", description: "Browse the collection, pick a mood, or bring a question set of your own." },
  { eyebrow: "Tune the room", title: "Set the pace and password", description: "Choose the room size, round timing, and the secret your guests will use to join." },
  { eyebrow: "Everything looks good", title: "Ready to create", description: "Take one last look. Your room will open as soon as you continue." },
];

export function CreateForm({ busy, submit, packs, catalogError, playerName, onPlayerNameChange }) {
  const [step, setStep] = useState(0);
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
        <section className="flow-step" aria-label="Room basics">
          <Field label="Your name"><input value={playerName} onChange={(event) => onPlayerNameChange(event.target.value)} maxLength={30} placeholder="How should we know you?" autoFocus required /></Field>
          <Field label="Room name"><input value={values.roomName} onChange={update("roomName")} maxLength={60} placeholder="e.g. Friday suspects" required /></Field>
          <div className="flow-tip"><span>01</span><p>You’ll be the host. You can change game settings from the room later.</p></div>
        </section>
      )}

      {step === 1 && (
        <section className="flow-step question-pack-step" aria-label="Question pack selection">
          <fieldset className="field field-group">
            <legend className="visually-hidden">Question pack</legend>
            <div className="pack-options-heading">
              <div><span className="card-label">Question packs</span><strong>Choose one for this room</strong></div>
              <small>{packs.length + 1} options</small>
            </div>
            <div className="question-pack-options" role="group" aria-label="Available question packs">
              {packs.map((pack, index) => (
                <label key={pack.id} className={`pack-browser-option ${!customQuestions && values.pack === pack.id ? "selected" : ""}`}>
                  <input type="radio" name="question-pack" checked={!customQuestions && values.pack === pack.id} onChange={() => selectPack(pack)} />
                  <i>{String(index + 1).padStart(2, "0")}</i><span><strong>{pack.name}</strong><small>{pack.description} · {pack.question_count} questions</small></span>
                </label>
              ))}
              <button type="button" className={`pack-browser-option upload-pack-option ${customQuestions ? "selected" : ""}`} onClick={() => fileRef.current?.click()} aria-label={customQuestions ? "Custom questions: choose another file" : "Upload"} aria-pressed={Boolean(customQuestions)}>
                <i>{customQuestions ? "★" : "+"}</i>
                <span><strong>{customQuestions ? "Custom questions" : "Upload"}</strong><small>{customQuestions ? `${customQuestions.length} pairs · Choose another file` : "Use your own JSON question set"}</small></span>
              </button>
            </div>
            <input ref={fileRef} className="visually-hidden" type="file" accept="application/json,.json" onChange={uploadQuestions} />
          </fieldset>
          {catalogError && <p className="form-error" role="alert">Built-in packs could not be loaded. You can still upload a custom pack.</p>}
        </section>
      )}

      {step === 2 && (
        <section className="flow-step" aria-label="Room setup">
          <div className="settings-card">
            <div><span className="card-label">Room settings</span><strong>Fine-tune the pace</strong></div>
            <div className="settings-strip">
              <Field label="Players"><input type="number" min="3" max="20" value={values.playerLimit} onChange={update("playerLimit")} /></Field>
              <Field label="Rounds"><input type="number" min="1" max={maxRounds} value={values.rounds} onChange={update("rounds")} /></Field>
              <Field label="Answer"><select value={values.answerSeconds} onChange={update("answerSeconds")}><option value="30">30 sec</option><option value="60">1 min</option><option value="90">1½ min</option><option value="120">2 min</option></select></Field>
              <Field label="Discuss"><select value={values.discussionSeconds} onChange={update("discussionSeconds")}><option value="60">1 min</option><option value="120">2 min</option><option value="180">3 min</option><option value="300">5 min</option></select></Field>
            </div>
          </div>
          <div className="private-room-card">
            <div className="private-room-heading">
              <span className="access-icon">✦</span>
              <div><strong>Password protected</strong><small>Every room is private. The invite link carries the password for your guests.</small></div>
            </div>
            <div className="private-password-field">
              <Field label="Room password"><input type="password" value={values.password} onChange={update("password")} maxLength={100} placeholder="Choose a secret knock" autoFocus required /></Field>
              <p>Guests using the invite link get access automatically.</p>
            </div>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="flow-step ready-step" aria-label="Ready to create">
          <div className="ready-hero">
            <span>✓</span>
            <div><p className="kicker">Room ready</p><h3>{values.roomName}</h3><p>Hosted by {playerName}</p></div>
          </div>
          <dl className="ready-details">
            <div><dt>Questions</dt><dd>{customQuestions ? `${customQuestions.length} custom pairs` : selectedPack?.name}</dd></div>
            <div><dt>Game</dt><dd>{values.rounds} rounds · {values.playerLimit} players</dd></div>
            <div><dt>Timing</dt><dd>{values.answerSeconds}s answer · {values.discussionSeconds}s discuss</dd></div>
            <div><dt>Access</dt><dd>Password protected</dd></div>
          </dl>
          <p className="ready-note">You can adjust room settings later from the host controls.</p>
        </section>
      )}

      <div className="flow-actions">
        {step > 0 && <button type="button" className="text-button" onClick={() => setStep((current) => current - 1)}>← Back</button>}
        <button className="primary-button" disabled={busy || !canContinue}>
          {busy ? "Building your room…" : step === 0 ? "Continue to questions" : step === 1 ? "Continue to setup" : step === 2 ? "Review room" : "Create room"}<span aria-hidden="true">→</span>
        </button>
      </div>
    </form>
  );
}
