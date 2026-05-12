'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { requestPasswordReset } from '@/actions/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function ForgotPasswordPage() {
  const [state, action, isPending] = useActionState(requestPasswordReset, null)

  return (
    <main className="min-h-screen bg-[#0A1628] flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-white/5 border border-white/10 text-white">
        <CardHeader className="pb-4">
          <CardTitle className="text-2xl font-bold text-center text-[#C9A84C]">
            Reset Password
          </CardTitle>
          <p className="text-center text-white/60 text-sm mt-1">Enter the email address saved on your account.</p>
        </CardHeader>
        <CardContent>
          <form action={action} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-white/80">
                Email
              </Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="bg-white/10 border-white/20 text-white placeholder:text-white/30 focus:border-[#C9A84C] focus:ring-[#C9A84C]"
                placeholder="you@example.com"
              />
            </div>

            {state?.error && (
              <p className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-md px-3 py-2">
                {state.error}
              </p>
            )}
            {state?.success && (
              <p className="text-green-400 text-sm bg-green-400/10 border border-green-400/20 rounded-md px-3 py-2">
                If that email is attached to an account, a reset link has been sent.
              </p>
            )}

            <Button
              type="submit"
              disabled={isPending}
              className="w-full bg-[#C9A84C] text-[#0A1628] font-semibold hover:bg-[#D4B85A] disabled:opacity-50 transition-colors"
            >
              {isPending ? 'Sending...' : 'Send reset link'}
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-white/50">
            <Link href="/login" className="text-[#C9A84C] hover:underline">
              Back to sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  )
}
