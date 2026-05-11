const FALLBACK_TZ = 'Europe/Bucharest'

const FORMAT_OPTS: Intl.DateTimeFormatOptions = {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
}

export function formatMatchTime(date: Date | string, timezone: string = FALLBACK_TZ): string {
  const d = typeof date === 'string' ? new Date(date) : date
  try {
    return new Intl.DateTimeFormat('en-GB', { ...FORMAT_OPTS, timeZone: timezone }).format(d)
  } catch {
    return new Intl.DateTimeFormat('en-GB', { ...FORMAT_OPTS, timeZone: FALLBACK_TZ }).format(d)
  }
}
