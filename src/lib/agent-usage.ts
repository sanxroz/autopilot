export function formatQuotaWindow(minutes: number | null): string {
  if (minutes === 300) return "5-hour limit";
  if (minutes === 10_080) return "Weekly limit";
  if (minutes === null) return "Usage limit";
  if (minutes % 1_440 === 0) return `${minutes / 1_440}-day limit`;
  if (minutes % 60 === 0) return `${minutes / 60}-hour limit`;
  return `${minutes}-minute limit`;
}

export function formatResetTime(timestamp: number | null, now = Date.now()): string {
  if (timestamp === null) return "Reset time unavailable";
  const reset = timestamp * 1000;
  if (reset <= now) return "Reset time elapsed";
  const remainingMinutes = Math.round((reset - now) / 60_000);
  if (remainingMinutes < 60) return `Resets in ${remainingMinutes}m`;
  if (remainingMinutes < 1_440) return `Resets in ${Math.round(remainingMinutes / 60)}h`;
  return `Resets ${new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(reset)}`;
}
