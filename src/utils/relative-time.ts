const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// .NET DateTime values may arrive with no offset and up to 7 fractional digits;
// no offset means UTC.
export function parseBackendDate(iso: string): Date {
  let value = iso.replace(/(\.\d{3})\d+/, '$1');
  if (!/[zZ]|[+-]\d{2}:?\d{2}$/.test(value)) value += 'Z';
  return new Date(value);
}

export function formatRelativeTime(iso: string | undefined, now: Date = new Date()): string {
  if (!iso) return '';
  const date = parseBackendDate(iso);
  const ms = now.getTime() - date.getTime();
  if (Number.isNaN(ms)) return '';

  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;

  const label = `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`;
  return date.getUTCFullYear() === now.getUTCFullYear() ? label : `${label}, ${date.getUTCFullYear()}`;
}
