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
    <Card className="w-full max-w-sm shadow-sm">
      <CardHeader className="text-center">
        <div className="mx-auto mb-3 w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
          <svg width="18" height="18" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path
              d="M7 1 C7 1 3 4 3 7.5 C3 9.5 4.5 11 7 11 C9.5 11 11 9.5 11 7.5 C11 4 7 1 7 1Z"
              fill="white"
              fillOpacity="0.9"
            />
            <circle cx="7" cy="12.5" r="1" fill="white" fillOpacity="0.6" />
          </svg>
        </div>
        <CardTitle className="text-xl">iJump</CardTitle>
        <p className="text-muted-foreground text-sm">Sistema operacional</p>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="admin@ijump.es"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
          {state?.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}
          <Button
            type="submit"
            disabled={pending}
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            {pending ? 'Entrando...' : 'Entrar'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
