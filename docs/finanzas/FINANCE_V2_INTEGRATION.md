# Finanzas v2 — Guía de integración y reversión (para revisión del PR)

Rama: `feature/finance-v2` (sale de `main` `bc30029`). **Nada mergeado todavía.**
Este documento es la guía para revisar el PR, revertir si hace falta, y la lista de acciones humanas pendientes.

---

## 1. Resumen en una frase

Módulo financiero v2 **aditivo**: reproduce los Excel reales (P&L por categoría → grupos → EBITDA), añade catálogo de productos, export (Excel/CSV/PDF) y nuevas vistas. No altera ni borra nada del modelo actual; la app v1 sigue funcionando intacta.

---

## 2. Cambios de base de datos (aditivos) + cómo revertir

Migración: `supabase/migrations/20260618000000_finance_v2.sql`.

**Crea** (no toca nada existente):
- Enums: `product_category`, `expense_group`, `rate_basis`.
- Tablas: `products`, `participant_items`, `expenses`, `expense_categories` (con RLS `authenticated`, igual que el resto).
- Semillas: 9 categorías de coste, catálogo de productos con **precios provisionales** (de la KB), y `default_rate` copiado de `financial_settings`.
- Copia de datos: `day_expenses` → `expenses` (los originales quedan intactos).

**No** modifica ni borra: `participants`, `payments`, `financial_settings`, `day_expenses`, `operational_days`, `flights`, `instructors`. Se conservan (deprecadas pero presentes).

**Cómo revertir la BD:** el propio archivo de migración lleva al final un bloque `ROLLBACK` comentado que hace `DROP` de las tablas y enums nuevos. Como las tablas viejas no se tocan, ejecutar ese bloque deja la BD **exactamente** como estaba. Riesgo de pérdida de datos: cero (solo se borra lo nuevo).

---

## 3. Cambios de código

**Archivos nuevos** (no pisan nada):
- `src/lib/finance/pnl-engine.ts` — motor de cálculo P&L puro (testeado).
- `src/lib/finance/__pnl_check.mts`, `src/lib/export/__gastos_check.mts` — checks de regresión (matemática P&L y cuadre de export). Se ejecutan con `node_modules/.bin/jiti <archivo>`.
- `src/lib/export/{excel,csv,pdf,index}.ts` — export.
- `src/app/(dashboard)/finanzas/export/route.ts` — endpoint de descarga.
- `src/components/operational/FinancePnlView.tsx`, `FinancePeriodSelector.tsx`, `ProductCatalogManager.tsx`, `ExpenseCategoryRatesForm.tsx`.
- `src/app/(dashboard)/finanzas/catalogo/page.tsx`.
- `docs/finanzas/FINANCE_MODEL_V2.md` (diseño) y este doc.

**Archivos modificados** (revisar con cuidado el diff):
- `src/lib/actions/finance.ts` — se **añaden** funciones v2 (getDay/Week/Month/Year Pnl + CRUD). Las funciones v1 existentes se conservan; solo se movieron los helpers puros a `pnl-engine.ts`. Comportamiento v1 sin cambios.
- `src/types/domain.ts` — tipos nuevos añadidos; nada renombrado/borrado.
- `src/lib/supabase/database.types.ts` — tablas nuevas añadidas **a mano** (ver pendiente 5.1).
- `src/app/(dashboard)/finanzas/page.tsx` — pasa a la nueva vista P&L + selector + export.
- `src/app/(dashboard)/admin/page.tsx` — pasa a gestionar tarifas por categoría (`ExpenseCategoryRatesForm`). Se retiró el `FinancialSettingsForm` v1.
- `src/app/(dashboard)/finanzas/page.tsx` y `[date]` (DayFinanceTab) — ahora en el modelo v2.
- `package.json` — añade `exceljs`.

**Archivos RETIRADOS (huérfanos v1, recuperables de git):**
- `src/app/(dashboard)/finanzas/[month]/` (page + loading), `FinanceMonthView.tsx`, `FinanceMonthDetail.tsx`, `FinancialSettingsForm.tsx`.
- En `finance.ts` quedan **funciones v1 sin uso** (getMonthFinancials, getMonthFinancialsDetail, getDayFinancials, upsert/deleteDayExpense, getInstructorPayouts, get/updateFinancialSettings): código muerto, borrable en follow-up (tsc no las marca porque `noUnusedLocals` está off).

**Reversión de código:** todo vive en `feature/finance-v2`, sin mergear. Revertir = no mergear, o revertir el PR. Los componentes y funciones v1 se dejan en disco para que la vuelta atrás sea trivial.

---

## 4. Coherencia: decisiones tomadas

- **Pestaña de finanzas del día (`DayFinanceTab`):** se migra al modelo nuevo para que haya **una sola fuente de verdad** (entrada de gastos por `expenses`, no por `day_expenses`). [EN CURSO — ver estado al final.] Para históricos, v1 y v2 dan los mismos números por diseño; el riesgo era solo en datos nuevos por doble vía, que esta migración elimina.
- **Vista vieja `/finanzas/[month]` + funciones v1 huérfanas:** se reconcilian/retiran al cerrar la migración de la pestaña. [PENDIENTE — ver estado al final.]
- **Tipos:** `database.types.ts` a mano hasta regenerar desde la BD real (pendiente 5.1).

---

## 5. PENDIENTE DE ACCIÓN HUMANA

### 5.1 — Tu hermano (desarrollador / dueño de la BD)
- [ ] **Regenerar `src/lib/supabase/database.types.ts`** desde la BD una vez aplicada la migración: `supabase gen types typescript ... > src/lib/supabase/database.types.ts`. Reemplaza la versión escrita a mano. (Compila igual, pero la generada es la fuente de verdad.)
- [ ] **Confirmar cómo se aplican las migraciones a prod** (integración GitHub de Supabase vs CLI a mano), para que al mergear la migración entre sola y sin choque de historial.
- [ ] Revisar el diff del PR + esta guía.

### 5.2 — Ricardo / negocio
- [ ] **Lista de precios oficial y costes reales** (Raúl/Ana): el catálogo va sembrado con precios **provisionales** (215/60/175/20/45/0). Editables desde `/finanzas/catalogo` sin tocar BD. Ver `02_roadmap/PREGUNTAS_NEGOCIO_FINANZAS.md`.
- [ ] Decidir IVA (el esquema es "IVA-ready": `vat_rate` nullable ya está).

### 5.3 — Seguridad (del audit, no bloquean el merge)
- [ ] **Renombrar `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY`** en el `.env.local` del repo principal (quitar el prefijo `NEXT_PUBLIC_`) y auditar las env de Vercel. Hoy no se filtra (no se referencia), pero es un footgun.
- [ ] **RLS por rol** en las tablas financieras **antes** de crear un 2º usuario de Supabase Auth (hoy `authenticated` da acceso total, correcto para un solo admin).

---

## 6. Diferido (fuera de este PR a propósito)

- **Extensión del enum `reservation_source`** (WONDERBOX/JUMPING/FREEDOM): la saco de este PR porque **no la usa nada todavía** (el dashboard no está) y `ALTER TYPE ADD VALUE` **no es reversible**. Se añadirá cuando el dashboard la necesite. SQL preservado:
  ```sql
  ALTER TYPE reservation_source ADD VALUE IF NOT EXISTS 'WONDERBOX';
  ALTER TYPE reservation_source ADD VALUE IF NOT EXISTS 'JUMPING';
  ALTER TYPE reservation_source ADD VALUE IF NOT EXISTS 'FREEDOM';
  ```

---

## 7. ANDAMIAJE DE QA — quitar antes del PR

Esto es solo para enseñar la UI sin BD; **no debe llegar al PR**:
- `src/app/finanzas-preview/` (rutas de preview con datos mock).
- El retoque temporal en `src/proxy.ts` (marca `/finanzas-preview` como ruta pública). Revertir.
- `.env.local` copiado al worktree (gitignored, no se commitea de todas formas).

---

## Estado de cierre (se actualiza al avanzar)

- [x] Modelo de datos + migración (aditiva, reversible) — validada (P&L 925/460/465).
- [x] Server actions + motor P&L + export — tsc limpio, checks en verde.
- [x] Revisión adversarial (code-reviewer + security-auditor) — hallazgos reales corregidos.
- [x] Vistas P&L + catálogo + ajustes + dashboard KPIs — construidas, look aprobado.
- [x] Migrar `DayFinanceTab` al modelo nuevo (coherencia, fuente única) — HECHO (display vía `FinancePnlView` + alta de gastos por `expenses` con proveedor/sociedad). `DayManifest` sin tocar. **Necesita QA en vivo** tras aplicar la migración (es flujo operativo).
- [→] Alta de líneas en participante (itemización) — **DIFERIDA a fast-follow con QA en vivo.** Motivo: toca el flujo central del participante; construirla a ciegas es donde se cuelan bugs operativos. El módulo es **correcto** sin ella (ingreso = COALESCE→pagos = "Sin desglosar"); el desglose por producto se puebla cuando se cablee con datos reales. Revert: git.
- [x] Reconciliar/retirar huérfanos — UI v1 retirada; funciones v1 quedan como exports muertos (borrables en follow-up).
- [x] Quitar andamiaje — rutas de preview eliminadas, `proxy.ts` revertido.
- [x] **`npm run build` + `tsc --noEmit` limpios** sin andamiaje (estado real del PR, verificado).
- [ ] Abrir PR (solo cuando Ricardo lo pida).
