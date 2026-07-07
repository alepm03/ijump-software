# iJump — Plan de Optimización de Rendimiento

> **v2 — 2026-07-07.** Las Fases 1 y 2 del plan original (abajo, §Histórico) están aplicadas
> y verificadas en el código, pero la navegación sigue superando el objetivo de <1s.
> Este documento re-diagnostica con el código actual y con mediciones de producción,
> y define el plan restante. Objetivo: **cambio entre ventanas <500ms percibido, <1s peor caso.**

---

## Diagnóstico v2 — dónde se va el tiempo hoy

Medición real contra producción (2026-07-07, desde España):

```
X-Vercel-Id: cdg1::iad1::...   ← edge en París, FUNCIÓN en Washington DC (iad1)
TTFB /login (caliente, cacheado): ~180ms · (revalidando): ~900ms
```

Cada render de página dinámica hace: usuario→París→**Washington** (función Next) →
Supabase (presumiblemente UE) y vuelta. Con 2-4 round-trips función↔Supabase por página,
la geografía sola explica 400-800ms antes de pintar nada.

| # | Problema | Impacto | Esfuerzo |
|---|----------|---------|----------|
| P1 | **Función Vercel en iad1 (EEUU), usuarios y Supabase en Europa** — cada query cruza el Atlántico (~90-100ms ida y vuelta cada una) | El mayor multiplicador de todo: afecta a TODAS las páginas | 5 min (dashboard Vercel) |
| P2 | **Layout del dashboard bloquea en serie**: `getUser()` (HTTP a Supabase Auth) y después `countPendingLeads()` — 2 round-trips secuenciales antes del primer byte en cada hard load y cada `router.refresh()` | ~200-500ms añadidos a toda página | Baja |
| P3 | **Tormenta de `router.refresh()`**: `useRealtimeManifest` escucha `participants` y `payments` SIN filtro — cualquier cambio en cualquier día re-renderiza layout+página completos en todos los manifests abiertos. Con 2 tablets en el aeródromo, cada pago/check-in dispara N renders completos | La app se siente lenta justo cuando más se usa | Media |
| P4 | **/reservas sobre-fetchea**: descarga las 3 pestañas completas solo para pintar los contadores (cancelled crece sin límite histórico); `getDayAvailability` re-consulta `business_settings` (getPolicy) una vez POR FECHA distinta | Crece con el uso; hoy ~4-10 queries extra | Baja |
| P5 | **`loading.tsx` incompletos**: /reservas, /administracion(/caja), /admin(/instructors), /finanzas/catalogo y /finanzas/dashboard no tienen skeleton propio (cae al skeleton de calendario del nivel raíz, que engaña) | UX: sensación de cuelgue | Baja |
| P6 | **Cambios de searchParams no dan feedback**: tab de /reservas, mes del calendario — `loading.tsx` no se dispara al navegar dentro del mismo segmento, y no hay `useTransition`/Suspense interno (finanzas sí lo tiene y por eso se siente mejor) | UX: click sin respuesta 0.5-2s | Baja |
| P7 | **Medición sobre `npm run dev`** distorsiona la percepción: Turbopack compila cada ruta bajo demanda; dev siempre parecerá lento | Falso diagnóstico | — |

Lo que **ya está bien** (no tocar): JOINs anidados de `getOperationalDay` /
`getOperationalDaysWithStats`, `getSession()` en el proxy, `Promise.all` en la página del día,
Suspense interno de /finanzas, skeletons de calendario y día.

---

## Fase A — Infraestructura (el 60-70% de la mejora, sin tocar código)

### A.1 · Mover la función de Vercel a Europa ⚠️ EL FIX MÁS RENTABLE

1. Confirmar la región del proyecto Supabase (`ojngrplnuhcenulfnfps`): dashboard Supabase
   → Project Settings → General → Region.
2. En Vercel: Project → Settings → Functions → **Function Region** → elegir la región
   más cercana a la de Supabase (p. ej. `cdg1` París o `fra1` Frankfurt). Gratis en Hobby.
3. Redeploy y verificar: `curl -sI https://ijump-software.vercel.app/login | grep -i x-vercel-id`
   debe mostrar `cdg1::cdg1` (o `fra1`), ya no `::iad1::`.

> Si Supabase resultara estar en us-east (improbable), la decisión se invierte:
> o migrar Supabase a UE (los usuarios están en España) o dejar todo en iad1.
> Lo importante es que **función y base de datos estén juntas, y cerca del usuario**.

- [x] Verificar región Supabase
- [x] Cambiar Function Region en Vercel + redeploy (2026-07-07: `X-Vercel-Id` ahora `cdg1::arn1` — Estocolmo)
- [x] Re-medir TTFB (2026-07-07: /login en caliente ~180-280ms; antes ~900ms cuando la función trabajaba)

### A.2 · Medir siempre en producción

Los benchmarks de navegación se hacen contra `ijump-software.vercel.app` (o un preview
deploy), nunca contra `npm run dev`. Referencia rápida en DevTools → Network → doc request.

---

## Fase B — Quitar bloqueos del render (código, bajo riesgo)

### B.1 · Layout: paralelizar y aislar el contador del sidebar

`src/app/(dashboard)/layout.tsx` hoy: `await getUser()` → `await countPendingLeads()` (serie).

1. Como mínimo: `Promise.all([supabase.auth.getUser(), countPendingLeads()])`
   (RLS ya protege el count si no hay sesión — devuelve 0).
2. Mejor: extraer el badge a un componente async propio envuelto en `<Suspense>` dentro
   de `AppSidebar`, para que el count no bloquee el primer byte de ninguna página.

- [x] Paralelizar getUser + countPendingLeads
- [ ] (Opcional) Badge de leads en Suspense propio — no hecho; con la paralelización el count ya no añade latencia extra

**No** sustituir el `getUser()` del layout por `getSession()` — es el invariante de
seguridad documentado en AUDITORIA.md H19. Si algún día pesa demasiado, la alternativa
correcta es `supabase.auth.getClaims()` con verificación local de firma (JWT asimétrico),
no `getSession()`.

### B.2 · Domar el realtime (P3)

En `src/hooks/useRealtimeManifest.ts`:

1. **Filtrar** `participants` y `payments` al día abierto. `participants` no tiene
   `operational_day_id`, pero sí `flight_id`: suscribirse con filtro
   `flight_id=in.(…ids de vuelos del día…)` (la página ya los tiene). Los vuelos
   se crean/borran poco; al cambiar la lista, el efecto se re-suscribe.
   Nota: los leads (`flight_id IS NULL`) no pasan el filtro — el manifest del día no
   los pinta, así que no se pierde nada.
2. **Debounce** de `router.refresh()` (~300ms, trailing): una mutación toca
   participante+pago+item y hoy dispara 2-3 refresh completos seguidos.

- [x] Filtro por flight_ids/participant_ids del día — implementado como **predicado client-side**
      (no como filtro de suscripción): los eventos llegan pero solo los relevantes disparan refresh.
      Motivo: el filtro server-side sobre `new.flight_id` perdería los movimientos de participante
      HACIA OTRO día (el `old` solo trae la PK); el predicado cubre ambos sentidos.
- [x] Debounce del refresh (300ms trailing)

### B.3 · /reservas: contar sin descargar (P4)

En `src/app/(dashboard)/reservas/page.tsx` + `src/lib/actions/leads.ts`:

1. Solo la pestaña activa descarga filas; las otras dos usan
   `select('id', { count: 'exact', head: true })` (nueva action `countLeads(filter)`).
2. `getPolicy()` una sola vez en la página y pasarla a `getDayAvailability(date, client, policy)`
   (añadir parámetro opcional) — elimina un round-trip por fecha distinta.

- [x] countLeads con head:true para pestañas inactivas
- [x] getPolicy compartida en el fan-out de availability (también en listNextAvailableSlots del bot)

---

## Fase C — Feedback instantáneo (percepción <100ms)

### C.1 · `loading.tsx` faltantes (P5)

Skeleton propio (forma aproximada de la página real) en:

- [x] `(dashboard)/reservas/loading.tsx`
- [x] `(dashboard)/administracion/loading.tsx` (cubre también `caja/` como boundary padre)
- [x] `(dashboard)/admin/loading.tsx` (cubre también `instructors/`)
- [x] `(dashboard)/finanzas/dashboard/loading.tsx` y `catalogo/loading.tsx`

### C.2 · Transiciones con feedback en navegación por searchParams (P6)

`loading.tsx` no se dispara cuando solo cambian los searchParams. Patrón (ya probado en
finanzas): Suspense interno con `key` + control cliente con `useTransition`.

- [x] /reservas: segmented control con `useTransition` (pending → contenido atenuado)
- [x] Calendario: prev/next mes, month picker y "Hoy" con `useTransition` + grid atenuado
- [x] /finanzas: `useTransition` en FinancePeriodSelector (título del periodo atenuado en pending)

---

## Explícitamente descartado (sin cambios vs. v1)

- **Caché de datos (`'use cache'` / unstable_cache)** — sigue en conflicto con el modelo
  Realtime + `router.refresh()` y con `cookies()` en los getters. Con Fases A-C el objetivo
  se cumple sin caché. Revisitar solo si tras medir sigue habiendo páginas >1s.
- **PPR / experimental** — no compensa el riesgo en Next 16 para una app interna.

---

## Resultado esperado y verificación

| Métrica (producción, desde España) | Hoy (estimado) | Tras Fase A | Tras A+B+C |
|---|---|---|---|
| TTFB página dinámica (caliente) | 600-1200ms | 250-400ms | 150-300ms |
| Cambio de ventana percibido | 1-3s | <1s | **<500ms** (skeleton <100ms) |
| Refresh realtime tras mutación ajena | 2-3 renders completos | igual | 1 render filtrado |

Verificación al cerrar cada fase: DevTools Network sobre producción, navegar
calendario → día → reservas → finanzas → administracion, anotar TTFB del document/RSC
request de cada una. Todas <1s (objetivo <500ms) = hecho.

> Cold start: el primer hit tras inactividad en Vercel Hobby añade ~0.5-1s de arranque
> de función. Es el único caso donde >1s puede persistir; aceptado (herramienta interna).
> Si molesta en la operación de fin de semana, opciones: cron de calentamiento a primera
> hora de los días operativos, o plan Pro.

---
---

# Histórico — Plan v1 (ejecutado)

## Diagnóstico

Tiempo de carga actual: ~2-3 segundos por página. Causa: tres problemas apilados.

| # | Problema | Impacto | Dificultad |
|---|----------|---------|------------|
| 1 | Waterfall de 4 queries secuenciales en `getOperationalDay` | ~500ms por navegación | Media |
| 2 | `getUser()` en middleware hace una llamada HTTP al servidor de Auth en cada request | ~150ms por request | Baja |
| 3 | Sin `loading.tsx` — el usuario ve pantalla en blanco mientras carga | UX bloqueante | Baja |
| 4 | Sin caché — cada navegación re-fetcha todo desde cero | Coste acumulado | Media |

## Fase 1 — Quick wins (sin tradeoffs) ✅

- [x] `src/app/(dashboard)/loading.tsx` — skeleton del calendario
- [x] `src/app/(dashboard)/[date]/loading.tsx` — skeleton del manifest del día
- [x] `src/proxy.ts` — cambiar `getUser()` por `getSession()` (tradeoff documentado:
      un JWT revocado pasa el middleware pero falla en las Server Actions)

## Fase 2 — Eliminar waterfalls ✅

- [x] `getOperationalDay` reescrito con JOIN anidado de PostgREST (4+ queries → 1)
- [x] `getOperationalDaysWithStats` reescrito con JOIN (3 queries → 1)
- [ ] Verificar que RLS permite los joins anidados en Supabase (comprobar en producción)

## Fase 3 — Caché ⚠️ DESCARTADA (conflicto con Realtime)

`useRealtimeManifest` llama `router.refresh()` cuando otro dispositivo muta; con getters
cacheados el refresh devolvería datos viejos. Además `'use cache'` prohíbe `cookies()`
dentro del scope cacheado, lo que rompe `createClient()`. Si se retoma: revalidateTag
desde un Server Action + getters con service client. Estado: no implementado.
