export function Timer({ seconds }) {
  const urgent = seconds <= 10;
  return <div className={`timer ${urgent ? "urgent" : ""}`} aria-label={`${seconds} seconds remaining`}><span>{String(Math.floor(seconds / 60)).padStart(2, "0")}</span><i>:</i><span>{String(seconds % 60).padStart(2, "0")}</span></div>;
}
