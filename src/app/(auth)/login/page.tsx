'use client'

import { useActionState } from 'react'
import Image from 'next/image'
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
        <div className="mx-auto mb-3 w-12 h-12 rounded-xl overflow-hidden">
          <Image
            src="/logo-ijump.png"
            alt="iJump Skydive"
            width={48}
            height={48}
            className="w-full h-full object-cover"
            priority
          />
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
