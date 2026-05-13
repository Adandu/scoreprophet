import { NextResponse } from 'next/server'
import { getAppUrl } from '@/lib/app-url'
import { acceptInviteToken } from '@/lib/invites'

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const result = await acceptInviteToken(token)
  const appUrl = await getAppUrl()

  if (result.success) {
    return NextResponse.redirect(new URL(`/championships/${result.championshipId}/predictions`, appUrl))
  }

  const errorUrl = new URL(`/invite/${encodeURIComponent(token)}`, appUrl)
  errorUrl.searchParams.set('error', result.error ?? 'This invitation link could not be used.')
  return NextResponse.redirect(errorUrl)
}
