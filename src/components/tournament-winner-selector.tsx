'use client'

import { useState, useRef, useEffect, useActionState, useTransition } from 'react'
import Image from 'next/image'
import { saveTournamentWinnerPrediction } from '@/actions/predictions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface Team {
  name: string
  shortName: string
  crest: string
}

interface Props {
  teams: Team[]
  existing: string | null
  championshipId: number
  locked: boolean
}

export function TournamentWinnerSelector({ teams, existing, championshipId, locked }: Props) {
  const [state, formAction] = useActionState(saveTournamentWinnerPrediction, null)
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string | null>(existing)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = search.trim()
    ? teams.filter(
        (t) =>
          t.name.toLowerCase().includes(search.toLowerCase()) ||
          t.shortName.toLowerCase().includes(search.toLowerCase()),
      )
    : teams

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function openDropdown() {
    setOpen(true)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  function pickTeam(name: string) {
    setSelected(name)
    setOpen(false)
    setSearch('')
  }

  const selectedTeam = selected ? teams.find((t) => t.name === selected) : null

  if (locked) {
    const existingTeam = existing ? teams.find((t) => t.name === existing) : null
    return (
      <div className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.03] p-4">
        <div className="flex-1">
          {existing ? (
            <div className="flex items-center gap-2">
              {existingTeam?.crest && (
                <Image src={existingTeam.crest} alt="" width={20} height={20} className="max-h-5 w-auto object-contain" />
              )}
              <span className="text-sm font-semibold text-white">{existing}</span>
            </div>
          ) : (
            <span className="text-sm text-white/40">No prediction set</span>
          )}
        </div>
        <Badge variant="outline" className="text-xs border-white/20 text-white/40">Locked</Badge>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
      <div className="relative">
        <button
          type="button"
          onClick={openDropdown}
          className="w-full text-left bg-[#0A1628] text-white border border-white/20 rounded px-3 py-2 text-sm cursor-pointer hover:border-white/40 flex items-center gap-2"
        >
          {selectedTeam ? (
            <>
              {selectedTeam.crest && (
                <Image src={selectedTeam.crest} alt="" width={20} height={20} className="max-h-5 w-auto object-contain shrink-0" />
              )}
              <span className="truncate">{selectedTeam.name}</span>
            </>
          ) : (
            <span className="text-white/40">Select a team…</span>
          )}
        </button>

        {open && (
          <div className="absolute left-0 top-full mt-1 z-50 w-full rounded border border-white/20 bg-[#0A1628] shadow-2xl">
            <div className="p-2 border-b border-white/10">
              <input
                ref={inputRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search team…"
                className="w-full bg-white/5 text-white text-xs rounded px-3 py-1.5 outline-none placeholder:text-white/30 border border-white/10 focus:border-white/30 caret-white"
              />
            </div>
            <div className="max-h-64 overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="px-3 py-3 text-xs text-white/30 text-center">No results</div>
              ) : (
                filtered.map((team) => (
                  <button
                    key={team.name}
                    type="button"
                    onClick={() => pickTeam(team.name)}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-white/10 transition-colors flex items-center gap-2 ${
                      team.name === selected ? 'text-[#C9A84C] bg-white/5' : 'text-white/70'
                    }`}
                  >
                    {team.crest && (
                      <Image src={team.crest} alt="" width={16} height={16} className="max-h-4 w-auto object-contain shrink-0" />
                    )}
                    {team.name}
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      <form
        action={formAction}
        onSubmit={(e) => {
          e.preventDefault()
          const fd = new FormData(e.currentTarget)
          startTransition(() => { formAction(fd) })
        }}
      >
        <input type="hidden" name="championshipId" value={championshipId} />
        <input type="hidden" name="predictedTeam" value={selected ?? ''} />
        <div className="flex items-center gap-3">
          <Button
            type="submit"
            size="sm"
            disabled={isPending || !selected}
            className="bg-[#C9A84C] hover:bg-[#C9A84C]/80 text-black font-semibold disabled:opacity-50"
          >
            {isPending ? 'Saving…' : 'Save prediction'}
          </Button>
          {state?.success && <span className="text-xs text-green-400">Saved!</span>}
          {state?.error && <span className="text-xs text-red-400">{state.error}</span>}
        </div>
      </form>
    </div>
  )
}
