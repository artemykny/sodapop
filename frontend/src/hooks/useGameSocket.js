import { useCallback, useEffect, useRef, useState } from "react";
import { socketUrl } from "../api/client.js";

function uid() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function useGameSocket(session, setSession, setNotice) {
  const [connection, setConnection] = useState("connecting");
  const socketRef = useRef(null);

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
        if (message.type === "error") {
          setNotice(message.payload?.message || "That move was not accepted.");
        }
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
  }, [session?.roomId, session?.token, session?.gameServerUrl, session?.websocketPath, setNotice, setSession]);

  const send = useCallback((type, payload = {}) => {
    if (socketRef.current?.readyState !== WebSocket.OPEN) {
      setNotice("Reconnecting to the room. Try again in a moment.");
      return false;
    }
    socketRef.current.send(JSON.stringify({ type, request_id: uid(), payload }));
    return true;
  }, [setNotice]);

  return { connection, send };
}
