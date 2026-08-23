import { useState } from "react";
import { joinRoom } from "../../api/client.js";
import { Field } from "../shared/Field.jsx";

export function JoinForm({ busy, submit, invite }) {
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
