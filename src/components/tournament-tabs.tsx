'use client'

import { useState, type ReactNode } from 'react'

export function TournamentTabs({ groups, bracket }: { groups: ReactNode; bracket: ReactNode }) {
  const [active, setActive] = useState<'groups' | 'bracket'>('groups')

  return (
    <div className="space-y-5">
      <div className="border-b border-white/10">
        <div className="flex gap-6">
          <button
            type="button"
            onClick={() => setActive('groups')}
            className={`border-b-2 px-1 pb-3 text-sm font-semibold transition-colors ${active === 'groups' ? 'border-[#C9A84C] text-[#C9A84C]' : 'border-transparent text-white/50 hover:text-white'}`}
          >
            Group Stage
          </button>
          <button
            type="button"
            onClick={() => setActive('bracket')}
            className={`border-b-2 px-1 pb-3 text-sm font-semibold transition-colors ${active === 'bracket' ? 'border-[#C9A84C] text-[#C9A84C]' : 'border-transparent text-white/50 hover:text-white'}`}
          >
            Knockout Bracket
          </button>
        </div>
      </div>
      {active === 'groups' ? groups : bracket}
    </div>
  )
}
