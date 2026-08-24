import { useEffect, useMemo, useState } from "react";
import { getQuestionPacks } from "../../api/client.js";
import { localizeError, useI18n } from "../../i18n/I18n.jsx";
import { CreateForm } from "./CreateForm.jsx";
import { GameSelector } from "./GameSelector.jsx";
import { JoinForm } from "./JoinForm.jsx";

const PLAYER_NAME_KEY = "sodapop-player-name-v1";

const GAMES = [
  {
    id: "oddoneout",
    mark: "?",
  },
];

function loadPlayerName() {
  try {
    return localStorage.getItem(PLAYER_NAME_KEY) || "";
  } catch {
    return "";
  }
}

export function Home({ onSession }) {
  const { t } = useI18n();
  const invite = useMemo(() => new URLSearchParams(window.location.search), []);
  const [selectedGameId, setSelectedGameId] = useState(GAMES[0].id);
  const [mode, setMode] = useState(invite.has("room") ? "join" : "create");
  const [playerName, setPlayerName] = useState(loadPlayerName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [packs, setPacks] = useState([]);
  const [catalogError, setCatalogError] = useState("");
  const games = GAMES.map((game) => ({ ...game, name: t(`game.${game.id}.name`), category: t(`game.${game.id}.category`), players: t(`game.${game.id}.players`) }));
  const selectedGame = games.find((game) => game.id === selectedGameId) || games[0];

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
      return { ok: true };
    } catch (err) {
      setError(localizeError(err, t));
      return { ok: false, error: err };
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
        <a className="wordmark wordmark-light" href="/" aria-label={t("home.homeLabel")}>SODAPOP<span>●</span></a>
        <div className="story-copy">
          <p className="kicker kicker-light">{t("home.kicker")}</p>
          <h1 id="home-title">{t("home.title1")}<br />{t("home.title2")}</h1>
          <p className="story-lede">{t("home.description")}</p>
        </div>
        <div className="how-it-works" aria-label={t("home.howToPlay")}>
          <div><b>01</b><span>{t("home.answer")}</span></div>
          <div><b>02</b><span>{t("home.debate")}</span></div>
          <div><b>03</b><span>{t("home.accuse")}</span></div>
        </div>
        <div className="orbit orbit-one">?</div>
        <div className="orbit orbit-two">!</div>
      </section>

      <section className="home-panel">
        <div className="panel-topline">
          <GameSelector games={games} value={selectedGame.id} onChange={setSelectedGameId} />
        </div>
        <div className="mode-tabs" role="tablist" aria-label={t("home.roomAction")}>
          <button className={mode === "create" ? "active" : ""} onClick={() => setMode("create")} role="tab" aria-selected={mode === "create"}>{t("home.createTab")}</button>
          <button className={mode === "join" ? "active" : ""} onClick={() => setMode("join")} role="tab" aria-selected={mode === "join"}>{t("home.joinTab")}</button>
        </div>
        {mode === "create" ? (
          <CreateForm busy={busy} submit={submit} packs={packs} catalogError={catalogError} playerName={playerName} onPlayerNameChange={rememberPlayerName} />
        ) : (
          <JoinForm busy={busy} submit={submit} invite={invite} playerName={playerName} onPlayerNameChange={rememberPlayerName} />
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
        <p className="panel-footnote">{t("home.footnote")}</p>
      </section>
    </main>
  );
}
