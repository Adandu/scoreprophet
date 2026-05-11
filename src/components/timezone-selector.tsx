'use client'

import { useTransition } from 'react'
import { updateTimezone } from '@/actions/auth'

export const TIMEZONES = [
  { value: 'Europe/Bucharest', label: 'Bucharest (GMT+3)' },
  { value: 'Europe/London', label: 'London (GMT+1)' },
  { value: 'Europe/Paris', label: 'Paris (GMT+2)' },
  { value: 'Europe/Berlin', label: 'Berlin (GMT+2)' },
  { value: 'Europe/Madrid', label: 'Madrid (GMT+2)' },
  { value: 'Europe/Rome', label: 'Rome (GMT+2)' },
  { value: 'Europe/Amsterdam', label: 'Amsterdam (GMT+2)' },
  { value: 'Europe/Athens', label: 'Athens (GMT+3)' },
  { value: 'Europe/Moscow', label: 'Moscow (GMT+3)' },
  { value: 'America/New_York', label: 'New York (GMT-4)' },
  { value: 'America/Chicago', label: 'Chicago (GMT-5)' },
  { value: 'America/Denver', label: 'Denver (GMT-6)' },
  { value: 'America/Los_Angeles', label: 'Los Angeles (GMT-7)' },
  { value: 'America/Toronto', label: 'Toronto (GMT-4)' },
  { value: 'America/Sao_Paulo', label: 'São Paulo (GMT-3)' },
  { value: 'Asia/Dubai', label: 'Dubai (GMT+4)' },
  { value: 'Asia/Istanbul', label: 'Istanbul (GMT+3)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (GMT+9)' },
  { value: 'Asia/Kolkata', label: 'Kolkata (GMT+5:30)' },
  { value: 'Australia/Sydney', label: 'Sydney (GMT+10)' },
  { value: 'Pacific/Auckland', label: 'Auckland (GMT+12)' },
  { value: 'UTC', label: 'UTC' },
]

export function TimezoneSelector({ timezone }: { timezone: string }) {
  const [isPending, startTransition] = useTransition()

  return (
    <select
      value={timezone}
      disabled={isPending}
      onChange={(e) => {
        const value = e.target.value
        startTransition(async () => {
          await updateTimezone(value)
        })
      }}
      className="bg-[#0A1628] text-white/50 text-xs border border-white/20 rounded px-2 py-1 cursor-pointer hover:border-white/40 disabled:opacity-50"
    >
      {TIMEZONES.map((tz) => (
        <option key={tz.value} value={tz.value} className="bg-[#0A1628]">
          {tz.label}
        </option>
      ))}
    </select>
  )
}
