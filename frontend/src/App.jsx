import { useCallback, useEffect, useState } from "react";
import { Home } from "./components/home/Home.jsx";
import { GameRoom } from "./components/room/GameRoom.jsx";
import { useGameSocket } from "./hooks/useGameSocket.js";

const SESSION_KEY = "skewa-session-v1";

function loadSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY)) || null;
  } catch {
    return null;
  }
}

function App() {
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

export default App;
