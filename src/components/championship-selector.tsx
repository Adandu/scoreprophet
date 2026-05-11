'use client'

import { useRouter } from 'next/navigation'
import { usePathname } from 'next/navigation'
import { useTransition } from 'react'
import { selectChampionship } from '@/actions/championships'

interface Championship {
  id: number
  name: string
}

export function ChampionshipSelector({
  championships,
  selectedId,
}: {
  championships: Championship[]
  selectedId: number
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [pending, startTransition] = useTransition()

  if (championships.length === 1) {
    return <span className="text-sm font-semibold text-[#C9A84C]">{championships[0].name}</span>
  }

  return (
    <select
      value={selectedId}
      disabled={pending}
      onChange={(event) => {
        const id = parseInt(event.target.value, 10)
        startTransition(async () => {
          await selectChampionship(id)
          const nextPath = pathname.replace(/\/championships\/\d+\//, `/championships/${id}/`)
          if (nextPath !== pathname) router.push(nextPath)
          else router.refresh()
        })
      }}
      className="h-8 max-w-48 rounded-md border border-white/15 bg-[#0A1628] px-2 text-sm font-semibold text-[#C9A84C]"
      aria-label="Select championship"
    >
      {championships.map((championship) => (
        <option key={championship.id} value={championship.id}>
          {championship.name}
        </option>
      ))}
    </select>
  )
}
