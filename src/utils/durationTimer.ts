/**
 * Live Audit Duration Timer Utilities
 * Formats active inspection duration and handles human-readable outputs.
 */

export function formatTimeClock(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds || 0));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

export function formatHumanDuration(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds || 0));
  if (safeSeconds === 0) return '0.0 Hours';

  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);

  if (hours === 0 && minutes === 0) {
    return `${safeSeconds} Secs`;
  }

  const decimalHours = (safeSeconds / 3600).toFixed(1);
  if (hours === 0) {
    return `${minutes} Mins (${decimalHours}h)`;
  }
  return `${hours}h ${minutes}m (${decimalHours} Hours)`;
}

export function parseSecondsFromText(text: string): number {
  if (!text) return 0;
  // If formatted as HH:MM:SS
  const clockMatch = text.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
  if (clockMatch) {
    const h = parseInt(clockMatch[1], 10);
    const m = parseInt(clockMatch[2], 10);
    const s = parseInt(clockMatch[3], 10);
    return h * 3600 + m * 60 + s;
  }

  // If formatted as "8.5 Hours" or "8 Hours"
  const hoursMatch = text.match(/([\d.]+)\s*Hour/i);
  if (hoursMatch) {
    const hrs = parseFloat(hoursMatch[1]);
    return Math.round(hrs * 3600);
  }

  return 0;
}
