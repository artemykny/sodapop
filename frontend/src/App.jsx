import { useCallback, useEffect, useState } from "react";
import { AdminPage } from "./components/admin/AdminPage.jsx";
import { Home } from "./components/home/Home.jsx";
import { GameRoom } from "./components/room/GameRoom.jsx";
import { LanguageSwitcher } from "./components/shared/LanguageSwitcher.jsx";
import { useGameSocket } from "./hooks/useGameSocket.js";
import { useI18n } from "./i18n/I18n.jsx";

const SESSION_KEY = "sodapop-session-v1";

function loadSession() {
  try {
    const stored = JSON.parse(localStorage.getItem(SESSION_KEY));
    return stored ? { ...stored, state: undefined } : null;
  } catch {
    return null;
  }
}

function GameApplication() {
  const { t } = useI18n();
  const [session, setSession] = useState(loadSession);
  const [notice, setNotice] = useState("");
  const { connection, send } = useGameSocket(session, setSession, setNotice);

  useEffect(() => {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  }, [session]);

  const leave = useCallback(() => {
    setSession(null);
    setNotice("");
  }, []);

  return (
    <div className="app-shell">
      {session?.state ? (
        <GameRoom session={session} connection={connection} send={send} leave={leave} setNotice={setNotice} />
      ) : session ? (
        <main className="room-loading" aria-live="polite">
          <div className="pulse-dot" />
          <p>{t("app.syncing")}</p>
          <button className="text-button" onClick={leave}>{t("common.cancel")}</button>
        </main>
      ) : (
        <Home onSession={setSession} />
      )}
      {notice && (
        <div className="toast" role="alert">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice("")} aria-label={t("app.dismiss")}>×</button>
        </div>
      )}
    </div>
  );
}

function App() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  return <><LanguageSwitcher />{path === "/admin" ? <AdminPage /> : <GameApplication />}</>;
}

export default App;
