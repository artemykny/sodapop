import { useCallback, useEffect, useRef, useState } from "react";
import { socketUrl } from "../api/client.js";
import { useI18n } from "../i18n/I18n.jsx";
import { applyRoomEvent } from "../state/roomEvents.js";

function uid() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function useGameSocket(session, setSession, setNotice) {
  const { t } = useI18n();
  const [connection, setConnection] = useState("connecting");
  const socketRef = useRef(null);
  const pendingRef = useRef(new Map());

  useEffect(() => {
    if (!session?.token) return undefined;
    let disposed = false;
    let retry;

    const connect = () => {
      setConnection("connecting");
      const socket = new WebSocket(socketUrl(session), ["sodapop", session.token]);
      socketRef.current = socket;
      socket.onopen = () => setConnection("live");
      socket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.type === "sync" || message.payload?.version) {
          setSession((current) => current ? {
            ...current,
            state: applyRoomEvent(current.state, message),
          } : current);
        }
        if (message.type === "error") {
          const code = message.payload?.code;
          const translated = code ? t(`errors.${code}`) : "";
          setNotice(translated && translated !== `errors.${code}` ? translated : message.payload?.message || t("errors.move_rejected"));
        }
        if (message.type === "ack" || message.type === "error") {
          const callback = pendingRef.current.get(message.request_id);
          pendingRef.current.delete(message.request_id);
          callback?.(message.type === "ack");
        }
      };
      socket.onclose = () => {
        for (const callback of pendingRef.current.values()) callback(false);
        pendingRef.current.clear();
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

  const send = useCallback((type, payload = {}, onResult) => {
    if (socketRef.current?.readyState !== WebSocket.OPEN) {
      setNotice(t("errors.reconnecting"));
      onResult?.(false);
      return false;
    }
    const requestId = uid();
    if (onResult) pendingRef.current.set(requestId, onResult);
    socketRef.current.send(JSON.stringify({ type, request_id: requestId, payload }));
    return true;
  }, [setNotice, t]);

  return { connection, send };
}
