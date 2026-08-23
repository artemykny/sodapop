export function Avatar({ player }) {
  const hue = [...player.display_name].reduce((total, char) => total + char.charCodeAt(0), 0) % 360;
  return <span className="avatar" style={{ "--avatar-hue": hue }}>{player.display_name.slice(0, 1).toUpperCase()}<i className={player.connected ? "online" : ""} /></span>;
}
