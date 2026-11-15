import { formatRelativeTime, parseBackendDate } from '@/utils/relative-time';

const now = new Date('2026-11-14T12:00:00Z');

describe('formatRelativeTime', () => {
  it.each([
    ['2026-11-14T11:59:40Z', 'now'],
    ['2026-11-14T11:55:00Z', '5m'],
    ['2026-11-14T09:00:00Z', '3h'],
    ['2026-11-12T12:00:00Z', '2d'],
    ['2026-09-03T12:00:00Z', 'Sep 3'],
    ['2025-12-25T12:00:00Z', 'Dec 25, 2025'],
  ])('%s → %s', (iso, expected) => {
    expect(formatRelativeTime(iso, now)).toBe(expected);
  });

  it('returns empty for missing or invalid input', () => {
    expect(formatRelativeTime(undefined, now)).toBe('');
    expect(formatRelativeTime('nope', now)).toBe('');
  });
});

describe('parseBackendDate', () => {
  it('treats a timestamp with no offset as UTC and trims 7 fractional digits', () => {
    expect(parseBackendDate('2026-11-14T11:00:00.1234567').toISOString()).toBe('2026-11-14T11:00:00.123Z');
  });
});
