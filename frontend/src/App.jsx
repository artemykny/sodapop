import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoom, joinRoom, socketUrl } from "./api.js";
import { phaseCopy, questionPacks } from "./data.js";

const SESSION_KEY = "skewa-session-v1";

function loadSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY)) || null;
  } catch {
    return null;
  }
}

function uid() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function App() {
  const [session, setSession] = useState(loadSession);
  const [connection, setConnection] = useState("connecting");
  const [notice, setNotice] = useState("");
  const socketRef = useRef(null);

  useEffect(() => {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  }, [session]);

  useEffect(() => {
    if (!session?.token) return undefined;
    let disposed = false;
    let retry;

    const connect = () => {
      setConnection("connecting");
      const socket = new WebSocket(socketUrl(session), ["skewa", session.token]);
      socketRef.current = socket;
      socket.onopen = () => setConnection("live");
      socket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.type === "state") {
          setSession((current) => current ? { ...current, state: message.payload } : current);
        }
        if (message.type === "error") setNotice(message.payload?.message || "That move was not accepted.");
      };
      socket.onclose = () => {
        if (disposed) return;
        setConnection("offline");
        retry = window.setTimeout(connect, 1800);
      };
      socket.onerror = () => socket.close();
    };

    connect();
    return () => {
      disposed = true;
      window.clearTimeout(retry);
      socketRef.current?.close(1000, "leaving");
    };
  }, [session?.roomId, session?.token, session?.gameServerUrl, session?.websocketPath]);

  const send = useCallback((type, payload = {}) => {
    if (socketRef.current?.readyState !== WebSocket.OPEN) {
      setNotice("Reconnecting to the room. Try again in a moment.");
      return false;
    }
    socketRef.current.send(JSON.stringify({ type, request_id: uid(), payload }));
    return true;
  }, []);

  const leave = useCallback(() => {
    setSession(null);
    setNotice("");
  }, []);

  return (
    <div className="app-shell">
      {session?.state ? (
        <GameRoom session={session} connection={connection} send={send} leave={leave} setNotice={setNotice} />
      ) : (
        <Home onSession={setSession} />
      )}
      {notice && (
        <div className="toast" role="alert">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice("")} aria-label="Dismiss message">×</button>
        </div>
      )}
    </div>
  );
}

function Home({ onSession }) {
  const invite = useMemo(() => new URLSearchParams(window.location.search), []);
  const [mode, setMode] = useState(invite.has("room") ? "join" : "create");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(action) {
    setBusy(true);
    setError("");
    try {
      onSession(await action());
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="home">
      <section className="home-story" aria-labelledby="home-title">
        <a className="wordmark wordmark-light" href="/" aria-label="Skewa home">SKEWA<span>●</span></a>
        <div className="story-copy">
          <p className="kicker kicker-light">Same room. Different question.</p>
          <h1 id="home-title">Blend in.<br />Call them out.</h1>
          <p className="story-lede">Answer a secret prompt, spot the odd one out, and defend your suspiciously specific answer.</p>
        </div>
        <div className="how-it-works" aria-label="How to play">
          <div><b>01</b><span>Answer</span></div>
          <div><b>02</b><span>Debate</span></div>
          <div><b>03</b><span>Accuse</span></div>
        </div>
        <div className="orbit orbit-one">?</div>
        <div className="orbit orbit-two">!</div>
      </section>

      <section className="home-panel">
        <div className="panel-topline">
          <div className="wordmark wordmark-dark">SKEWA<span>●</span></div>
          <span className="tiny-label">3–20 players</span>
        </div>
        <div className="mode-tabs" role="tablist" aria-label="Room action">
          <button className={mode === "create" ? "active" : ""} onClick={() => setMode("create")} role="tab" aria-selected={mode === "create"}>Create a room</button>
          <button className={mode === "join" ? "active" : ""} onClick={() => setMode("join")} role="tab" aria-selected={mode === "join"}>Join a room</button>
        </div>
        {mode === "create" ? (
          <CreateForm busy={busy} submit={submit} />
        ) : (
          <JoinForm busy={busy} submit={submit} invite={invite} />
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
        <p className="panel-footnote">No account needed. Just invite people you trust to lie convincingly.</p>
      </section>
    </main>
  );
}

function CreateForm({ busy, submit }) {
  const [values, setValues] = useState({
    roomName: "Friday suspects", hostName: "", password: "", playerLimit: 8,
    answerSeconds: 60, discussionSeconds: 120, votingSeconds: 45, rounds: 5, pack: "classic",
  });
  const [customQuestions, setCustomQuestions] = useState(null);
  const fileRef = useRef(null);

  const update = (key) => (event) => setValues((current) => ({ ...current, [key]: event.target.value }));

  async function uploadQuestions(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (!Array.isArray(parsed) || parsed.length === 0 || parsed.some((item) => !item.real?.trim() || !item.fake?.trim())) throw new Error();
      setCustomQuestions(parsed);
      setValues((current) => ({ ...current, rounds: Math.min(Number(current.rounds), parsed.length) }));
    } catch {
      event.target.value = "";
      setCustomQuestions(null);
    }
  }

  function onSubmit(event) {
    event.preventDefault();
    const questions = customQuestions || questionPacks[values.pack].questions;
    submit(() => createRoom({
      name: values.roomName.trim(), password: values.password, host_name: values.hostName.trim(),
      settings: {
        player_limit: Number(values.playerLimit), answer_seconds: Number(values.answerSeconds),
        discussion_seconds: Number(values.discussionSeconds), voting_seconds: Number(values.votingSeconds),
        rounds: Number(values.rounds),
      },
      questions,
    }));
  }

  return (
    <form className="room-form" onSubmit={onSubmit}>
      <div className="field-row">
        <Field label="Room name"><input value={values.roomName} onChange={update("roomName")} maxLength={60} required /></Field>
        <Field label="Your name"><input value={values.hostName} onChange={update("hostName")} maxLength={30} placeholder="Host name" autoFocus required /></Field>
      </div>
      <Field label="Question pack">
        <div className="pack-grid">
          {Object.entries(questionPacks).map(([id, pack]) => (
            <button type="button" key={id} className={`pack-choice ${!customQuestions && values.pack === id ? "selected" : ""}`} onClick={() => { setCustomQuestions(null); setValues((v) => ({ ...v, pack: id })); }}>
              <span>{pack.name}</span><small>{pack.description}</small>
            </button>
          ))}
          <button type="button" className={`pack-choice upload-choice ${customQuestions ? "selected" : ""}`} onClick={() => fileRef.current?.click()}>
            <span>{customQuestions ? `${customQuestions.length} custom pairs` : "Upload JSON"}</span><small>Use your own real/fake question pairs.</small>
          </button>
          <input ref={fileRef} className="visually-hidden" type="file" accept="application/json,.json" onChange={uploadQuestions} />
        </div>
      </Field>
      <div className="settings-strip">
        <Field label="Players"><input type="number" min="3" max="20" value={values.playerLimit} onChange={update("playerLimit")} /></Field>
        <Field label="Rounds"><input type="number" min="1" max={customQuestions?.length || questionPacks[values.pack].questions.length} value={values.rounds} onChange={update("rounds")} /></Field>
        <Field label="Answer"><select value={values.answerSeconds} onChange={update("answerSeconds")}><option value="30">30 sec</option><option value="60">1 min</option><option value="90">1½ min</option><option value="120">2 min</option></select></Field>
        <Field label="Discuss"><select value={values.discussionSeconds} onChange={update("discussionSeconds")}><option value="60">1 min</option><option value="120">2 min</option><option value="180">3 min</option><option value="300">5 min</option></select></Field>
      </div>
      <Field label="Room password" hint="Optional"><input type="password" value={values.password} onChange={update("password")} maxLength={100} placeholder="Leave blank for an open room" /></Field>
      <button className="primary-button" disabled={busy}>{busy ? "Building your room…" : "Create room"}<span aria-hidden="true">→</span></button>
    </form>
  );
}

function JoinForm({ busy, submit, invite }) {
  const [values, setValues] = useState({ roomName: invite.get("room") || "", displayName: "", password: "" });
  const update = (key) => (event) => setValues((current) => ({ ...current, [key]: event.target.value }));

  function onSubmit(event) {
    event.preventDefault();
    submit(() => joinRoom({
      roomName: values.roomName.trim(), displayName: values.displayName.trim(), password: values.password,
      roomId: invite.get("roomId") || "", gameServerUrl: invite.get("server") || "",
    }));
  }

  return (
    <form className="room-form join-form" onSubmit={onSubmit}>
      <div className="join-intro"><span className="join-mark">↳</span><div><h2>Enter the room</h2><p>Use the room name from your host or open their invite link.</p></div></div>
      <Field label="Room name"><input value={values.roomName} onChange={update("roomName")} maxLength={60} placeholder="e.g. Friday suspects" required /></Field>
      <Field label="Your display name"><input value={values.displayName} onChange={update("displayName")} maxLength={30} placeholder="How should we know you?" autoFocus required /></Field>
      <Field label="Password" hint="If required"><input type="password" value={values.password} onChange={update("password")} maxLength={100} /></Field>
      <button className="primary-button" disabled={busy}>{busy ? "Finding the room…" : "Join room"}<span aria-hidden="true">→</span></button>
    </form>
  );
}

function Field({ label, hint, children }) {
  return <label className="field"><span>{label}{hint && <small>{hint}</small>}</span>{children}</label>;
}

function GameRoom({ session, connection, send, leave, setNotice }) {
  const state = session.state;
  const me = state.players.find((player) => player.id === state.your_player_id);
  const isHost = Boolean(me?.is_host);
  const copy = phaseCopy[state.phase] || phaseCopy.lobby;
  const timeLeft = useCountdown(state.deadline);

  function copyInvite() {
    const params = new URLSearchParams({ room: state.room_name, roomId: state.room_id, server: session.gameServerUrl });
    const invite = `${window.location.origin}${window.location.pathname}?${params}`;
    navigator.clipboard?.writeText(invite).then(() => setNotice("Invite link copied."), () => setNotice(invite));
  }

  function stopGame() {
    if (window.confirm("End this game for everyone?")) send("stop_game");
  }

  return (
    <main className="game-layout">
      <header className="game-header">
        <button className="wordmark wordmark-dark wordmark-button" onClick={leave} aria-label="Leave game and return home">SKEWA<span>●</span></button>
        <div className="room-heading">
          <span className="room-name">{state.room_name}</span>
          <span className={`connection connection-${connection}`}><i />{connection === "live" ? "Live" : connection === "offline" ? "Reconnecting" : "Connecting"}</span>
        </div>
        <div className="round-heading">
          {state.phase !== "lobby" && <span>Round {Math.min(state.round, state.settings.rounds)} / {state.settings.rounds}</span>}
          {state.deadline && <Timer seconds={timeLeft} />}
        </div>
      </header>

      <section className="game-stage">
        <div className="stage-heading">
          <p className="kicker">{copy.eyebrow}</p>
          <h1>{copy.title}</h1>
        </div>
        <PhaseContent state={state} me={me} isHost={isHost} send={send} copyInvite={copyInvite} leave={leave} />
        {isHost && state.phase !== "lobby" && state.phase !== "finished" && (
          <button className="text-button danger-link" onClick={stopGame}>End game</button>
        )}
      </section>

      <PlayersPanel state={state} me={me} copyInvite={copyInvite} leave={leave} />
    </main>
  );
}

function PhaseContent({ state, me, isHost, send, copyInvite, leave }) {
  switch (state.phase) {
    case "answering": return <Answering state={state} send={send} isHost={isHost} />;
    case "discussion": return <Discussion state={state} send={send} isHost={isHost} />;
    case "voting": return <Voting state={state} me={me} send={send} isHost={isHost} />;
    case "round_result": return <RoundResult state={state} send={send} isHost={isHost} />;
    case "finished": return <Finished state={state} leave={leave} />;
    default: return <Lobby state={state} isHost={isHost} send={send} copyInvite={copyInvite} />;
  }
}

function Lobby({ state, isHost, send, copyInvite }) {
  const canStart = state.players.length >= 3;
  return (
    <div className="phase-body lobby-body">
      <div className="room-code-card">
        <span className="card-label">Room</span>
        <strong>{state.room_name}</strong>
        <button className="secondary-button" onClick={copyInvite}>Copy invite link <span>↗</span></button>
      </div>
      <div className="lobby-copy">
        <p>{state.players.length < 3 ? `Invite ${3 - state.players.length} more ${3 - state.players.length === 1 ? "player" : "players"} to begin.` : "Everyone is here. Let the suspicion begin."}</p>
        <div className="rules-mini">
          <span>{state.settings.rounds} rounds</span><span>{state.settings.answer_seconds}s answers</span><span>{state.settings.discussion_seconds}s debate</span>
        </div>
        {isHost ? (
          <button className="primary-button stage-action" onClick={() => send("start_game")} disabled={!canStart}>Start the game <span>→</span></button>
        ) : (
          <div className="waiting-note"><span className="pulse-dot" />Waiting for the host to start…</div>
        )}
      </div>
    </div>
  );
}

function Answering({ state, send, isHost }) {
  const [answer, setAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function submitAnswer(event) {
    event.preventDefault();
    if (!answer.trim()) return;
    if (send("submit_answer", { answer: answer.trim() })) setSubmitting(true);
  }

  if (state.answer_locked || submitting) {
    return <div className="locked-card"><div className="lock-seal">✓</div><h2>Answer locked</h2><p>Keep a straight face. The rest of the room is still writing.</p>{isHost && <button className="text-button" onClick={() => send("advance")}>Skip to discussion →</button>}</div>;
  }

  return (
    <form className="answer-card" onSubmit={submitAnswer}>
      <span className="card-label">Your secret question</span>
      <h2>{state.your_prompt}</h2>
      <label className="answer-input"><span>Your answer</span><textarea value={answer} onChange={(event) => setAnswer(event.target.value)} maxLength={500} placeholder="Write something believable…" autoFocus /></label>
      <div className="answer-footer"><span>{answer.length} / 500</span><button className="primary-button compact" disabled={!answer.trim()}>Lock answer <span>→</span></button></div>
    </form>
  );
}

function Discussion({ state, send, isHost }) {
  return (
    <div className="phase-body">
      <div className="reveal-question"><span className="card-label">The real question was</span><h2>{state.real_question}</h2></div>
      <div className="answer-grid">
        {state.answers?.map((answer, index) => <article className="revealed-answer" key={answer.player_id}><span>{String(index + 1).padStart(2, "0")}</span><p>“{answer.text}”</p><strong>{answer.player_name}</strong></article>)}
      </div>
      {isHost ? <button className="primary-button stage-action" onClick={() => send("advance")}>Start the vote <span>→</span></button> : <div className="waiting-note"><span className="pulse-dot" />Make your case. The host will open voting.</div>}
    </div>
  );
}

function Voting({ state, me, send, isHost }) {
  const [selected, setSelected] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const locked = state.vote_locked || submitted;

  function vote() {
    if (selected && send("cast_vote", { player_id: selected })) setSubmitted(true);
  }

  if (locked) return <div className="locked-card"><div className="lock-seal accusation">!</div><h2>Vote locked</h2><p>No taking it back now. Waiting for the final accusations.</p>{isHost && <button className="text-button" onClick={() => send("advance")}>Reveal the vote →</button>}</div>;

  return (
    <div className="phase-body">
      <p className="phase-intro">Choose the player whose answer felt just a little sideways. You cannot vote for yourself.</p>
      <div className="suspect-grid">
        {state.players.filter((player) => player.id !== me?.id).map((player) => (
          <button className={`suspect-card ${selected === player.id ? "selected" : ""}`} key={player.id} onClick={() => setSelected(player.id)}>
            <Avatar player={player} /><span>{player.display_name}</span><i>{selected === player.id ? "Selected" : "Choose"}</i>
          </button>
        ))}
      </div>
      <button className="primary-button stage-action" onClick={vote} disabled={!selected}>Lock accusation <span>→</span></button>
    </div>
  );
}

function RoundResult({ state, send, isHost }) {
  const imposter = state.players.find((player) => player.id === state.result?.imposter_id);
  return (
    <div className="phase-body result-body">
      <div className={`result-banner ${state.result?.found ? "found" : "escaped"}`}>
        <span>{state.result?.found ? "Case cracked" : "Got away with it"}</span>
        <h2>{imposter?.display_name || "The imposter"} was the odd one out.</h2>
        <p>{state.result?.found ? "The room saw through the story. Everyone else scores a point." : "The bluff held. The imposter takes the points."}</p>
      </div>
      <div className="vote-breakdown">
        <span className="card-label">How the room voted</span>
        {state.players.map((player) => <div className="vote-row" key={player.id}><span>{player.display_name}</span><div><i style={{ width: `${Math.max(5, (state.result?.vote_counts?.[player.id] || 0) * 18)}%` }} /></div><strong>{state.result?.vote_counts?.[player.id] || 0}</strong></div>)}
      </div>
      {isHost ? <button className="primary-button stage-action" onClick={() => send("advance")}>{state.round >= state.settings.rounds ? "See final scores" : "Next round"} <span>→</span></button> : <div className="waiting-note"><span className="pulse-dot" />Next round begins shortly…</div>}
    </div>
  );
}

function Finished({ state, leave }) {
  const ranked = [...state.players].sort((a, b) => b.score - a.score);
  const topScore = ranked[0]?.score;
  const winners = ranked.filter((player) => player.score === topScore).map((player) => player.display_name);
  return (
    <div className="phase-body finished-body">
      <div className="winner-card"><span className="winner-crown">★</span><p>{winners.length > 1 ? "Joint winners" : "Tonight's sharpest eye"}</p><h2>{winners.join(" & ")}</h2><strong>{topScore} {topScore === 1 ? "point" : "points"}</strong></div>
      <div className="final-ranking">{ranked.map((player, index) => <div key={player.id}><b>{String(index + 1).padStart(2, "0")}</b><Avatar player={player} /><span>{player.display_name}</span><strong>{player.score}</strong></div>)}</div>
      <button className="secondary-button" onClick={leave}>Play another game</button>
    </div>
  );
}

function PlayersPanel({ state, me, copyInvite, leave }) {
  const ranked = [...state.players].sort((a, b) => b.score - a.score);
  return (
    <aside className="players-panel">
      <div className="players-title"><div><span className="card-label">Room roster</span><h2>{state.players.length} / {state.settings.player_limit} players</h2></div>{state.phase === "lobby" && <button onClick={copyInvite} aria-label="Copy invite">＋</button>}</div>
      <div className="player-list">
        {ranked.map((player) => (
          <div className={`player-row ${player.id === me?.id ? "is-me" : ""}`} key={player.id}>
            <Avatar player={player} />
            <div><strong>{player.display_name}{player.id === me?.id && " (you)"}</strong><span>{player.is_host ? "Host" : player.connected ? "In the room" : "Away"}</span></div>
            <b>{player.score}<small>pts</small></b>
          </div>
        ))}
      </div>
      <div className="panel-settings"><span>{state.settings.rounds} rounds</span><span>{state.settings.answer_seconds}s answer</span><span>{state.settings.voting_seconds}s vote</span></div>
      <button className="text-button leave-button" onClick={leave}>Leave room</button>
    </aside>
  );
}

function Avatar({ player }) {
  const hue = [...player.display_name].reduce((total, char) => total + char.charCodeAt(0), 0) % 360;
  return <span className="avatar" style={{ "--avatar-hue": hue }}>{player.display_name.slice(0, 1).toUpperCase()}<i className={player.connected ? "online" : ""} /></span>;
}

function Timer({ seconds }) {
  const urgent = seconds <= 10;
  return <div className={`timer ${urgent ? "urgent" : ""}`} aria-label={`${seconds} seconds remaining`}><span>{String(Math.floor(seconds / 60)).padStart(2, "0")}</span><i>:</i><span>{String(seconds % 60).padStart(2, "0")}</span></div>;
}

function useCountdown(deadline) {
  const calculate = () => deadline ? Math.max(0, Math.ceil((new Date(deadline).getTime() - Date.now()) / 1000)) : 0;
  const [seconds, setSeconds] = useState(calculate);
  useEffect(() => {
    setSeconds(calculate());
    if (!deadline) return undefined;
    const interval = window.setInterval(() => setSeconds(calculate()), 500);
    return () => window.clearInterval(interval);
  }, [deadline]);
  return seconds;
}

export default App;
