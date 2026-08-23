import { useEffect, useMemo, useState } from "react";
import { getQuestionPacks } from "../../api/client.js";
import { CreateForm } from "./CreateForm.jsx";
import { JoinForm } from "./JoinForm.jsx";

const PLAYER_NAME_KEY = "sodapop-player-name-v1";

function loadPlayerName() {
  try {
    return localStorage.getItem(PLAYER_NAME_KEY) || "";
  } catch {
    return "";
  }
}

export function Home({ onSession }) {
  const invite = useMemo(() => new URLSearchParams(window.location.search), []);
  const [mode, setMode] = useState(invite.has("room") ? "join" : "create");
  const [playerName, setPlayerName] = useState(loadPlayerName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [packs, setPacks] = useState([]);
  const [catalogError, setCatalogError] = useState("");

  useEffect(() => {
    let disposed = false;
    getQuestionPacks().then(
      (result) => { if (!disposed) setPacks(result); },
      (err) => { if (!disposed) setCatalogError(err.message); },
    );
    return () => { disposed = true; };
  }, []);

  async function submit(action) {
    setBusy(true);
    setError("");
    try {
      onSession(await action());
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  function rememberPlayerName(name) {
    setPlayerName(name);
    try {
      if (name) localStorage.setItem(PLAYER_NAME_KEY, name);
      else localStorage.removeItem(PLAYER_NAME_KEY);
    } catch {
      // The forms still share state when browser storage is unavailable.
    }
  }

  return (
    <main className="home">
      <section className="home-story" aria-labelledby="home-title">
        <a className="wordmark wordmark-light" href="/" aria-label="Sodapop home">SODAPOP<span>●</span></a>
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
          <div className="wordmark wordmark-dark">SODAPOP<span>●</span></div>
          <span className="tiny-label">3–20 players</span>
        </div>
        <div className="mode-tabs" role="tablist" aria-label="Room action">
          <button className={mode === "create" ? "active" : ""} onClick={() => setMode("create")} role="tab" aria-selected={mode === "create"}>Create a room</button>
          <button className={mode === "join" ? "active" : ""} onClick={() => setMode("join")} role="tab" aria-selected={mode === "join"}>Join a room</button>
        </div>
        {mode === "create" ? (
          <CreateForm busy={busy} submit={submit} packs={packs} catalogError={catalogError} playerName={playerName} onPlayerNameChange={rememberPlayerName} />
        ) : (
          <JoinForm busy={busy} submit={submit} invite={invite} playerName={playerName} onPlayerNameChange={rememberPlayerName} />
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
        <p className="panel-footnote">No account needed. Just invite people you trust to lie convincingly.</p>
      </section>
    </main>
  );
}
