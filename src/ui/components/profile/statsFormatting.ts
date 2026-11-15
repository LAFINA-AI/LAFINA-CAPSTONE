/**
 * Formatting helpers shared by the Profile overview card and detailed stats modal.
 */

export const formatHoursCompact = (totalMinutes: number): string => {
  const mins = Math.max(0, Math.round(totalMinutes));
  if (mins === 0) return '0h';
  if (mins < 60) return `${mins}m`;
  const hours = mins / 60;
  return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1)}h`;
};

export const formatMinutesVerbose = (totalMinutes: number): string => {
  const mins = Math.max(0, Math.round(totalMinutes));
  if (mins === 0) return '0m';
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem === 0 ? `${h}h` : `${h}h ${rem}m`;
};

export const formatAudioDuration = (totalSeconds: number): string => {
  const secs = Math.max(0, Math.round(totalSeconds));
  if (secs === 0) return '0m audio';
  if (secs < 60) return `${secs}s audio`;
  const totalMinutes = Math.round(secs / 60);
  if (totalMinutes < 60) return `${totalMinutes}m audio`;
  const h = Math.floor(totalMinutes / 60);
  const rem = totalMinutes % 60;
  return rem === 0 ? `${h}h audio` : `${h}h ${rem}m audio`;
};
