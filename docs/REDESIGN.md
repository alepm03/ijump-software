# iJump — Rediseño Frontend v2

> Plan de reacondicionamiento visual completo del sistema operacional.
> Skills utilizados: `/impeccable` (decisiones de diseño), `/huashu-design` (prototipo HTML previo a código), `/web-design-guidelines` (auditoría final a11y + buenas prácticas).

---

## Contexto y motivación

La v1 del frontend usa un dark theme genérico (zinc-900) sin identidad de marca ni estructura de navegación.
Este rediseño lo convierte en un CRM operacional moderno con:

- **Light mode** — legibilidad máxima en exterior (drop zone con luz solar directa)
- **Naranja corporativo** — acento de marca, no dominante (~8% de la superficie)
- **Sidebar de navegación** — estructura estándar de dashboard/CRM
- **Vista día vertical** — vuelos como filas full-width apiladas, no columnas Kanban con scroll lateral

---

## Sistema de color (OKLCH)

```css
/* Fondos */
--background:        oklch(0.985 0.006 55)   /* blanco cálido base */
--surface:           oklch(0.998 0.003 55)   /* blanco tarjetas */
--sidebar:           oklch(0.975 0.008 55)   /* sidebar levemente más oscura */

/* Texto */
--foreground:        oklch(0.175 0.015 55)   /* casi negro cálido */
--foreground-muted:  oklch(0.480 0.012 55)   /* secundario */
--foreground-subtle: oklch(0.700 0.008 55)   /* placeholders */

/* Bordes */
--border:            oklch(0.912 0.009 55)
--border-strong:     oklch(0.860 0.012 55)

/* Naranja corporativo */
--brand:             oklch(0.640 0.175 42)   /* botones primarios, active nav */
--brand-hover:       oklch(0.600 0.180 42)
--brand-light:       oklch(0.955 0.040 55)   /* bg tint hover/active */
--brand-muted:       oklch(0.880 0.070 50)   /* bordes suaves, badges */
```

---

## Layout — App Shell

```
┌──────────────────────────────────────────────────────────┐
│  SIDEBAR (224px)         │  MAIN CONTENT (flex-1)        │
│                          │                               │
│  iJump  ⊙               │  [página activa]              │
│                          │                               │
│  ○  Calendario           │                               │
│  ○  Hoy                  │                               │
│                          │                               │
│  ─────────────────────   │                               │
│  admin@ijump.es  [↪]     │                               │
└──────────────────────────────────────────────────────────┘
```

---

## Vista día — layout vertical

```
┌─────────────────────────────────────────────────────────────┐
│  ⠿  #1  ·  09:00  ·  ● Programado   2 participantes  [+] [⋮]│
├─────────────────────────────────────────────────────────────┤
│  ⠿  Juan García    Pendiente   HC    Carlos   W C G  75kg  €│
│  ⠿  Ana Martínez   Check-in    Solo  —        W ✓ G  60kg   │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  ⠿  #2  ·  10:30  ·  ● Embarcando   1 participante  [+] [⋮] │
├─────────────────────────────────────────────────────────────┤
│  ⠿  Pedro Sánchez  Equipado    HC+F  Luis    W C G  80kg 190€│
└─────────────────────────────────────────────────────────────┘

┌── dashed ───────────────────────────────────────────────────┐
│                    + Añadir vuelo                           │
└─────────────────────────────────────────────────────────────┘
```

---

## Checklist de implementación

### Fase 0 — Prototipo visual (huashu-design)
- [x] Generar prototipo HTML interactivo con el nuevo diseño
- [x] Validar paleta, tipografía y layout con el usuario

### Fase 1 — Tokens y shell global
- [ ] `src/app/globals.css` — nuevo sistema de variables CSS (OKLCH)
- [ ] `src/app/(dashboard)/layout.tsx` — sidebar + quitar header bar
- [ ] `src/app/layout.tsx` — verificar fuente y reset

### Fase 2 — Vista del día (cambio más crítico)
- [ ] `src/components/operational/DayManifest.tsx` — layout vertical + `verticalListSortingStrategy`
- [ ] `src/components/operational/FlightCard.tsx` — rediseño como fila full-width
- [ ] `src/components/operational/DayHeader.tsx` — adaptar a light mode
- [ ] `src/components/operational/ParticipantRow.tsx` — adaptar a light mode
- [ ] `src/components/operational/DailySummaryPanel.tsx` — adaptar a light mode
- [ ] `src/components/operational/AddParticipantDrawer.tsx` — adaptar a light mode

### Fase 3 — Calendario
- [ ] `src/components/operational/CalendarView.tsx` — adaptar a light mode + naranja
- [ ] `src/components/operational/DayCard.tsx` — adaptar a light mode + naranja

### Fase 4 — Auth
- [ ] `src/app/(auth)/login/page.tsx` — adaptar a light mode + brand naranja

### Fase 5 — Auditoría final (web-design-guidelines)
- [ ] Contraste de texto (WCAG AA mínimo)
- [ ] Focus states visibles en todos los controles
- [ ] Touch targets ≥ 44×44px en elementos táctiles
- [ ] Responsive: tablet (768px) y desktop (1280px+)

---

## Lo que NO cambia

- Server Actions, lógica de DB, DnD
- Props y contratos de componentes
- Módulo de pagos (recién implementado)
- Realtime hook

---

## Referencias de diseño

CRMs de referencia: Linear, Vercel Dashboard, HubSpot (sidebar + light + un acento de color).
Anti-referencias: dark SaaS genérico, glassmorphism decorativo, grid de cards idénticas.
