import { NextResponse } from 'next/server'
import { acceptInviteToken } from '@/lib/invites'

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const result = await acceptInviteToken(token)

  if (result.success) {
    return NextResponse.redirect(new URL(`/championships/${result.championshipId}/predictions`, _request.url))
  }

  const errorUrl = new URL(`/invite/${encodeURIComponent(token)}`, _request.url)
  errorUrl.searchParams.set('error', result.error ?? 'This invitation link could not be used.')
  return NextResponse.redirect(errorUrl)
}
