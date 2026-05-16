import type { ReactNode } from 'react'
import { requireAuth } from '@/lib/auth'

export default async function InstructionsPage() {
  await requireAuth()

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold text-white">How to Play</h1>
        <p className="text-white/55">ScoreProphet predictions are scoped to the championship selected in the navbar.</p>
      </header>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-[#C9A84C]">Before Kickoff</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Rule title="Match result" points="3 pts">
            Pick home win, draw, or away win.
          </Rule>
          <Rule title="Exact score" points="5 pts">
            Predict the score after 90 minutes. If a knockout match goes to extra time or penalties, exact score is still judged on the regular-time result.
          </Rule>
          <Rule title="Double chance" points="1 pt">
            If enabled for the championship, pick two possible regular-time outcomes instead of one single result.
          </Rule>
          <Rule title="Prediction lock">
            Regular-time predictions lock at kickoff. After kickoff, predictions for that match are visible to the championship.
          </Rule>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-[#C9A84C]">Knockout Matches</h2>
        <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm leading-6 text-white/70">
          <p>
            Knockout matches use the same regular-time result and exact-score rules. Once both teams in a knockout
            matchup are known, you can also choose which team will advance if extra time or penalties are needed.
          </p>
          <p className="mt-3">
            The advancing-team point is awarded only if the match actually reaches extra time or penalties. If the
            match is decided in regular time, this pick is ignored and awards 0 points. This pick locks at kickoff
            with your other predictions.
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-[#C9A84C]">Championships and Live Matches</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Rule title="Multiple championships">
            Use the navbar selector to choose the active championship. Home-page revealed predictions come from that selected championship only.
          </Rule>
          <Rule title="Live match center">
            When a match is live, the match card shows a Match center button. The live page is available only to signed-in users.
          </Rule>
          <Rule title="Leaderboard">
            Points update after match results are synced from the API or entered by an admin.
          </Rule>
          <Rule title="Reminders">
            You can enable email reminders in your profile for matches where your predictions are incomplete.
          </Rule>
        </div>
      </section>
    </div>
  )
}

function Rule({ title, points, children }: { title: string; points?: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="font-semibold text-white">{title}</h3>
        {points && <span className="rounded bg-[#C9A84C]/15 px-2 py-1 text-xs font-semibold text-[#F2D27A]">{points}</span>}
      </div>
      <p className="text-sm leading-6 text-white/60">{children}</p>
    </div>
  )
}
