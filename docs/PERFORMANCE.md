# iJump — Plan de Optimización de Rendimiento

## Diagnóstico

Tiempo de carga actual: ~2-3 segundos por página. Causa: tres problemas apilados.

| # | Problema | Impacto | Dificultad |
|---|----------|---------|------------|
| 1 | Waterfall de 4 queries secuenciales en `getOperationalDay` | ~500ms por navegación | Media |
| 2 | `getUser()` en middleware hace una llamada HTTP al servidor de Auth en cada request | ~150ms por request | Baja |
| 3 | Sin `loading.tsx` — el usuario ve pantalla en blanco mientras carga | UX bloqueante | Baja |
| 4 | Sin caché — cada navegación re-fetcha todo desde cero | Coste acumulado | Media |

---

## Fase 1 — Quick wins (sin tradeoffs)

### 1.1 · `loading.tsx` en las rutas del dashboard

Añadir archivos `loading.tsx` con skeleton UI para que Next.js use Suspense streaming.
El usuario ve la shell y el skeleton instantáneamente; los datos llegan mientras.

- [x] `src/app/(dashboard)/loading.tsx` — skeleton del calendario
- [x] `src/app/(dashboard)/[date]/loading.tsx` — skeleton del manifest del día

### 1.2 · Middleware: `getSession()` en lugar de `getUser()`

`getUser()` hace una llamada HTTP al servidor de Auth de Supabase en **cada request**.
`getSession()` lee la cookie localmente sin red (~0ms).

**Tradeoff aceptado**: un JWT revocado pasaría el check del middleware, pero fallaría
en las Server Actions (que sí verifican con `createClient()`). Para una herramienta
interna con una sola cuenta admin, este tradeoff es irrelevante.

- [x] `src/proxy.ts` — cambiar `getUser()` por `getSession()`

---

## Fase 2 — Eliminar waterfalls (el mayor impacto)

### 2.1 · `getOperationalDay` — colapsar 4+ queries en 1 JOIN

PostgREST soporta nested selects. Un solo HTTP request a Supabase hace todos los JOINs
en el servidor. Pasar de 4 round-trips (~600ms) a 1 round-trip (~150ms).

Query objetivo:
```sql
operational_days (*)
  flights (* ordenados por order_index)
    participants (*)
      payments (*)
      instructors:assigned_instructor_id (*)
      reservation_groups:reservation_group_id (*)
```

- [x] `src/lib/actions/operational-day.ts` — reescribir `getOperationalDay` con JOIN
- [ ] Verificar que RLS permite los joins anidados en Supabase (comprobar en producción)

### 2.2 · `getOperationalDaysWithStats` — colapsar 3 queries en 1

Mismo patrón: el calendario hace 3 queries encadenadas para obtener días → vuelos → participantes.

- [x] `src/lib/actions/operational-day.ts` — reescribir `getOperationalDaysWithStats` con JOIN
  - Usar `flights(id, participants(id))` — solo los campos necesarios para el conteo

---

## Fase 3 — Caché ⚠️ DESCARTADA (conflicto con Realtime)

La caché de datos es incompatible con el sistema Realtime actual sin refactorización mayor.

### Por qué no funciona

`useRealtimeManifest` escucha cambios de Supabase y llama `router.refresh()` cuando otro
dispositivo hace una mutación. Si los getters estuvieran en caché (`unstable_cache` / `'use cache'`),
`router.refresh()` devolvería datos del caché — la pantalla no se actualizaría.

Además, en Next.js 16 `unstable_cache` está deprecado a favor de la directiva `'use cache'`
(requiere `cacheComponents: true` en `next.config.ts`), y ambas opciones prohíben leer
`cookies()` dentro del scope cacheado — lo cual rompe `createClient()`.

### Si se quiere implementar en el futuro

Requiere dos cambios coordinados:
1. Cambiar el hook Realtime para que, antes de llamar `router.refresh()`, llame a un
   Server Action que ejecute `revalidateTag(tag, { expire: 0 })`.
2. Envolver los getters con `'use cache'` + `cacheTag` usando un cliente de servicio
   (service role) que no dependa de cookies.

### Estado: no implementado — las Fases 1 y 2 ya resuelven el 90% del problema

---

## Resultado esperado

| Métrica | Antes | Después Fase 1+2 | Después Fase 3 |
|---------|-------|-------------------|----------------|
| Primera carga (día) | ~2-3s | ~400-600ms | ~400-600ms |
| Navegaciones repetidas | ~2-3s | ~400-600ms | ~50-100ms |
| Tiempo hasta primer pixel | ~2-3s | instantáneo (skeleton) | instantáneo |

---

## Notas de implementación

- El hook `useRealtimeManifest` ya maneja actualizaciones en tiempo real en el cliente —
  no entra en conflicto con el caché porque las mutaciones lo invalidan vía `revalidateTag`.
- No tocar la lógica de Server Actions existente, solo la capa de fetching.
- Verificar RLS en Supabase después de cambiar a JOIN queries — si alguna tabla tiene
  políticas restrictivas, el join anidado puede devolver `null` en lugar de datos.
