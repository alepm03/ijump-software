'use client'

import { useActionState } from 'react'
import { login, type LoginState } from '@/lib/actions/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function LoginPage() {
  const [state, action, pending] = useActionState<LoginState, FormData>(
    login,
    undefined
  )

  return (
    <Card className="w-full max-w-sm bg-zinc-900 border-zinc-800">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl text-white">iJump</CardTitle>
        <p className="text-zinc-400 text-sm">Sistema operacional</p>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-zinc-300">
              Email
            </Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="admin@ijump.es"
              className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password" className="text-zinc-300">
              Contraseña
            </Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="bg-zinc-800 border-zinc-700 text-white"
            />
          </div>
          {state?.error && (
            <p className="text-sm text-red-400">{state.error}</p>
          )}
          <Button
            type="submit"
            disabled={pending}
            className="w-full bg-sky-600 hover:bg-sky-500 text-white"
          >
            {pending ? 'Entrando...' : 'Entrar'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
