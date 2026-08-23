import { useEffect, useState } from "react";

export function useCountdown(deadline) {
  const calculate = () => deadline
    ? Math.max(0, Math.ceil((new Date(deadline).getTime() - Date.now()) / 1000))
    : 0;
  const [seconds, setSeconds] = useState(calculate);

  useEffect(() => {
    setSeconds(calculate());
    if (!deadline) return undefined;
    const interval = window.setInterval(() => setSeconds(calculate()), 500);
    return () => window.clearInterval(interval);
  }, [deadline]);

  return seconds;
}
