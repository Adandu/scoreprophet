import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const { token } = await params
  const { error } = await searchParams
  const session = await getSession()
  const invitePath = `/invite/${encodeURIComponent(token)}`

  if (!session.userId) redirect(`/login?next=${encodeURIComponent(invitePath)}`)

  if (!error) redirect(`/invite/${encodeURIComponent(token)}/accept`)

  return (
    <div className="mx-auto max-w-lg rounded-lg border border-white/10 bg-white/5 p-8 text-center">
      <h1 className="text-2xl font-bold text-white">Invitation unavailable</h1>
      <p className="mt-3 text-sm text-white/50">{error}</p>
      <Link href="/" className="mt-6 inline-flex text-sm font-semibold text-[#C9A84C] hover:underline">
        Return home
      </Link>
    </div>
  )
}
