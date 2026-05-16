export async function getAppUrl(): Promise<string> {
  const url = process.env.APP_URL
  if (!url) throw new Error('APP_URL environment variable is required')
  return url.replace(/\/$/, '')
}

export function getSafeRedirectPath(value: FormDataEntryValue | string | null): string {
  const path = String(value ?? '').trim()
  if (!path.startsWith('/') || path.startsWith('//')) return '/'
  return path
}
