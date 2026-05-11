'use client'

import { useEffect, useState } from 'react'

interface Props {
  kickoff: string
}

function getTimeLeft(kickoff: string): string | null {
  const diff = new Date(kickoff).getTime() - Date.now()
  if (diff <= 0) return null
  const d = Math.floor(diff / (1000 * 60 * 60 * 24))
  const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
  const s = Math.floor((diff % (1000 * 60)) / 1000)
  if (d > 0) return `${d}d ${h}h ${m}m ${s}s`
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

export function Countdown({ kickoff }: Props) {
  const [timeLeft, setTimeLeft] = useState<string | null>(null)

  useEffect(() => {
    const update = () => setTimeLeft(getTimeLeft(kickoff))
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [kickoff])

  if (!timeLeft) return null

  return (
    <p className="text-center text-sm text-[#C9A84C] font-mono tracking-wide">
      ⏱ Kickoff in {timeLeft}
    </p>
  )
}
