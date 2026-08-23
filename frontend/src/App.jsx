import { useCallback, useEffect, useState } from "react";
import { AdminPage } from "./components/admin/AdminPage.jsx";
import { Home } from "./components/home/Home.jsx";
import { GameRoom } from "./components/room/GameRoom.jsx";
import { useGameSocket } from "./hooks/useGameSocket.js";

const SESSION_KEY = "skewa-session-v1";

function loadSession() {
  try {
    const stored = JSON.parse(localStorage.getItem(SESSION_KEY));
    return stored ? { ...stored, state: undefined } : null;
  } catch {
    return null;
  }
}

function GameApplication() {
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
          <p>Syncing your room…</p>
          <button className="text-button" onClick={leave}>Cancel</button>
        </main>
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

function App() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  return path === "/admin" ? <AdminPage /> : <GameApplication />;
}

export default App;
