import { useEffect, useRef, useState } from "react";
import { createRoom } from "../../api/client.js";
import { Field } from "../shared/Field.jsx";

export function CreateForm({ busy, submit, packs, catalogError }) {
  const [values, setValues] = useState({
    roomName: "Friday suspects", hostName: "", password: "", playerLimit: 8,
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
    const payload = {
      name: values.roomName.trim(), password: values.password, host_name: values.hostName.trim(),
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

  return (
    <form className="room-form" onSubmit={onSubmit}>
      <div className="field-row">
        <Field label="Room name"><input value={values.roomName} onChange={update("roomName")} maxLength={60} required /></Field>
        <Field label="Your name"><input value={values.hostName} onChange={update("hostName")} maxLength={30} placeholder="Host name" autoFocus required /></Field>
      </div>
      <fieldset className="field field-group">
        <legend>Question pack</legend>
        <div className="pack-grid">
          {packs.map((pack) => (
            <button type="button" key={pack.id} className={`pack-choice ${!customQuestions && values.pack === pack.id ? "selected" : ""}`} onClick={() => selectPack(pack)}>
              <span>{pack.name}</span><small>{pack.description}</small>
            </button>
          ))}
          <button type="button" className={`pack-choice upload-choice ${customQuestions ? "selected" : ""}`} onClick={() => fileRef.current?.click()}>
            <span>{customQuestions ? `${customQuestions.length} custom pairs` : "Upload JSON"}</span><small>Use your own real/fake question pairs.</small>
          </button>
          <input ref={fileRef} className="visually-hidden" type="file" accept="application/json,.json" onChange={uploadQuestions} />
        </div>
      </fieldset>
      {catalogError && <p className="form-error" role="alert">Built-in packs could not be loaded. You can still upload a custom pack.</p>}
      <div className="settings-strip">
        <Field label="Players"><input type="number" min="3" max="20" value={values.playerLimit} onChange={update("playerLimit")} /></Field>
        <Field label="Rounds"><input type="number" min="1" max={maxRounds} value={values.rounds} onChange={update("rounds")} /></Field>
        <Field label="Answer"><select value={values.answerSeconds} onChange={update("answerSeconds")}><option value="30">30 sec</option><option value="60">1 min</option><option value="90">1½ min</option><option value="120">2 min</option></select></Field>
        <Field label="Discuss"><select value={values.discussionSeconds} onChange={update("discussionSeconds")}><option value="60">1 min</option><option value="120">2 min</option><option value="180">3 min</option><option value="300">5 min</option></select></Field>
      </div>
      <Field label="Room password" hint="Optional"><input type="password" value={values.password} onChange={update("password")} maxLength={100} placeholder="Leave blank for an open room" /></Field>
      <button className="primary-button" disabled={busy || (!customQuestions && !values.pack)}>{busy ? "Building your room…" : "Create room"}<span aria-hidden="true">→</span></button>
    </form>
  );
}
