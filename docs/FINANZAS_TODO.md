# Finanzas v2 — TODO (rama feature/finance-v2)

Worktree aislado: `ijump-software-finance-v2/` · No tocar `feature/ui-redesign-v2`.
PR a `main` en `alepm03/ijump-software` solo cuando Ricardo lo pida. Nada se mergea sin su OK.

## B — Modelo de datos (Opus) ✅ escrito, ⏳ pendiente validar
- [x] Reconciliar spec vs finanzas v1 (ground truth verificado por subagente Explore)
- [x] Migración `20260618000000_finance_v2.sql` (products, participant_items, expense_categories, expenses; aditiva + reversible)
- [x] Migración aparte `20260618000001_extend_reservation_sources.sql` (enum, no reversible, aislada)
- [x] Doc as-built `docs/FINANCE_MODEL_V2.md` con las 3 correcciones (forward-only itemization, bucket "sin desglosar", reversibilidad)
- [ ] **Validar en BD real** (branch Supabase del proyecto del hermano) — BLOQUEADO por conexión del MCP. Datos intactos + P&L cuadra vs mes real del Excel.
- [ ] Regenerar `database.types.ts` tras aplicar la migración

## C — Reporting (Sonnet)
- [ ] Reescribir `src/lib/actions/finance.ts`: getDay/Week/Month/Year sobre el nuevo modelo, regla COALESCE(items, payments), EBITDA por grupos
- [ ] CRUD de products / participant_items / expense_categories / expenses
- [ ] Tipos en `src/types/domain.ts`
- [ ] Componentes P&L: reestructurar DayFinanceTab / FinanceMonthView / FinanceMonthDetail; selector Día/Semana/Mes; vista anual/YTD; `ProductCatalogManager`
- [ ] Selector de productos en alta/edición de participante (`participant.ts`)

## D — Exportación (Sonnet)
- [ ] Excel `exceljs` (hojas Ingresos / Gastos [proveedor+sociedad] / Resumen P&L)
- [ ] CSV por tabla
- [ ] PDF mensual/anual (patrón `generate-waiver-pdf.ts`)

## E — Dashboard KPIs (Sonnet)
- [ ] Ocupación de vuelo (clientes/vuelo vs capacidad 2), ingreso medio/salto, mix origen+producto, productividad instructor, % cancelación meteo, depósitos vs liquidación

## R — Revisión + entrega
- [x] `code-reviewer` + `security-auditor` ejecutados; hallazgos reales arreglados y re-verificados:
  - [x] BLOCKER: invariante revenue con categoría null → bucket OTHER (`pnl-engine.ts`) + regresión
  - [x] MAJOR: doble conteo de overrides en hoja Gastos → línea calculada = coste − filas reales (`excel.ts`/`csv.ts`) + check de footing
  - [x] MEDIO seg.: guard de inyección de fórmulas (CSV/Excel) + 500 del export sin filtrar `error.message`
  - [x] Minors: fixture EDICION/COMISION_GROUPON, `default_rate` LIMIT 1, comentario copy one-shot
- [ ] Diferido: RLS por rol antes de un 2º usuario (Workstream R); renombrar `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY` (repo principal); exponer `ytdThrough` en la ruta al cablear la UI
- [ ] `npm run build` limpio (necesita env/BD); responsive tablet ~820px (necesita BD para QA visual)
- [ ] PR a main con descripción ES (cuando Ricardo lo pida)

## F — Requisitos nuevos (revisión con el dueño, jun 2026) — pendientes de planificar
Surgidos al validar el doc `modelo-financiero-ijump-jun2026.html`. No están en finance v2.1; van a una fase posterior.
- [ ] **Combustible por compra de bidones (stock valorado).** Registrar el gasto en el momento de la compra en gasolinera (litros + precio), no por consumo diario estimado. Lo que sobra queda en inventario al precio de compra. Diseñar tabla de compras/stock de combustible y cómo se relaciona con el coste imputado al periodo.
- [ ] **Categoría de gasto nueva `SOFTWARE`** (grupo GENERALES): chatbot + hosting del software. Variable. Añadir al seed de `expense_categories`.
- [ ] **Edición de vídeo = importe fijo por salto con vídeo** (lo hace Ale). Resolver cómo imputar la **suscripción a la plataforma de edición** (¿gasto fijo mensual aparte, o prorrateo por vídeo?).
- [ ] **IVA activable y por periodo.** Casilla on/off fácil para poner/quitar IVA, ajustable día a día y mes a mes (no solo un tipo global fijo). Revisar implicación en `vat_rate` (hoy nullable a nivel de línea/categoría).
- [ ] **Módulo de tesorería / cash flow (alcance acotado).** Vista de entradas y salidas previstas por fecha aprovechando que cobros y gastos ya llevan fecha: cobros diferidos de plataformas (Groupon y otras), anticipos de depósito de reserva, cupones directos cobrados de una vez, y desembolso adelantado del combustible. Evaluar esfuerzo antes de comprometer.
- [ ] **Catálogo:** quitar `GROUND_REPORT` (reportaje terrestre ya no se realiza). `Paquete sin cámara` solo por plataformas; venta directa únicamente como excepción con aprobación explícita de Raúl (no publicitado).
- [ ] **Partida `PILOTO`** (grupo PERSONAL, confirmada): añadir al seed de `expense_categories`. Falta solo la base de cálculo (por vuelo / jornada / fijo, ver PREGUNTAS Q10b) y si el avión es propio o de un tercero.

## Bloqueos / dependencias
- **Conexión Supabase del hermano al MCP** (proyecto `ojngrplnuhcenulfnfps`) → valida migración contra datos reales.
- Lista de precios oficial + costes reales + IVA + sociedades (Raúl/Ana, ver PREGUNTAS_NEGOCIO_FINANZAS.md) → solo afinan el sembrado.
