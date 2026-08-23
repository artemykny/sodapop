import { useEffect, useState } from "react";
import { joinRoom, searchRooms } from "../../api/client.js";
import { Field } from "../shared/Field.jsx";

export function JoinForm({ busy, submit, invite }) {
  const [values, setValues] = useState({ roomName: invite.get("room") || "", displayName: "", password: "" });
  const [roomId, setRoomId] = useState(invite.get("roomId") || "");
  const [suggestions, setSuggestions] = useState([]);
  const update = (key) => (event) => setValues((current) => ({ ...current, [key]: event.target.value }));

  useEffect(() => {
    const query = values.roomName.trim();
    if ([...query].length < 2) {
      setSuggestions([]);
      return undefined;
    }
    let disposed = false;
    const timer = window.setTimeout(() => {
      searchRooms(query).then(
        (rooms) => { if (!disposed) setSuggestions(rooms); },
        () => { if (!disposed) setSuggestions([]); },
      );
    }, 200);
    return () => {
      disposed = true;
      window.clearTimeout(timer);
    };
  }, [values.roomName]);

  function updateRoomName(event) {
    setRoomId("");
    setValues((current) => ({ ...current, roomName: event.target.value }));
  }

  function onSubmit(event) {
    event.preventDefault();
    submit(() => joinRoom({
      roomName: values.roomName.trim(), displayName: values.displayName.trim(), password: values.password,
      roomId,
    }));
  }

  return (
    <form className="room-form join-form" onSubmit={onSubmit}>
      <div className="join-intro"><span className="join-mark">↳</span><div><h2>Enter the room</h2><p>Use the room name from your host or open their invite link.</p></div></div>
      <Field label="Room name" hint="Type 2+ characters">
        <input
          value={values.roomName}
          onChange={updateRoomName}
          maxLength={60}
          placeholder="e.g. Friday suspects"
          list="joinable-room-suggestions"
          autoComplete="off"
          required
        />
        <datalist id="joinable-room-suggestions">
          {suggestions.map((room) => <option key={`${room.game_id}:${room.name}`} value={room.name}>{room.game_name}</option>)}
        </datalist>
      </Field>
      <Field label="Your display name"><input value={values.displayName} onChange={update("displayName")} maxLength={30} placeholder="How should we know you?" autoFocus required /></Field>
      <Field label="Password" hint="If required"><input type="password" value={values.password} onChange={update("password")} maxLength={100} /></Field>
      <button className="primary-button" disabled={busy}>{busy ? "Finding the room…" : "Join room"}<span aria-hidden="true">→</span></button>
    </form>
  );
}
