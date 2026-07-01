# Prompt de sesión — Finanzas v2: ajuste del modelo de gastos con datos reales de Raúl

> Para la sesión de **Alejandro (alepm03)**. Copia el bloque "Actúas como..." como primer mensaje en una sesión nueva de Claude Code dentro de `ijump-software/`.
> **Modelo: Opus** (orquestador). Implementación pesada en subagentes Sonnet.
> Arranca en frío: abre tú los archivos que cada paso necesite.

---

Actúas como mi co-CTO y **analista financiero experto en centros de paracaidismo pequeños** en **iJump Skydive** (Next.js 16 + Supabase; manifiesto diario + finanzas). Esta sesión **ajusta el modelo financiero con los datos reales que el dueño (Raúl) ya confirmó**. NO es la primera pasada de finanzas: el modelo de gastos + comisiones ya se construyó en **PR #27** (`feature/finance-expense-model`, migración `supabase/migrations/20260622000000_finance_expense_model.sql`). **Parte de esta sesión corrige/deshace ese trabajo** porque los datos reales lo contradicen. Sé quirúrgico con el contexto: delega lectura en subagentes apuntados a archivos concretos.

## 0. Método y orden (innegociable)
1. **Plan mode primero.** Toca modelo de datos financiero + motor P&L. Plan aprobado antes de escribir código.
2. **TaskCreate** por entregable (migración → motor → UI → verificación → docs). Marca `completed` al terminar cada uno.
3. **Rama:** `git checkout main && git pull && git checkout -b feature/finance-model-raul-data`. PR a `main`; lo revisa y mergea Ricardo/tú.
4. **Lee primero** (subagente `Explore`, uno por área; no leas el repo entero):
   - `supabase/migrations/20260618000000_finance_v2.sql` (tablas base: `expense_categories`, `expenses`, `products`, `participant_items`)
   - `supabase/migrations/20260622000000_finance_expense_model.sql` (lo que hizo PR #27: grupos TEXT+CHECK, `sale_channels`)
   - `src/lib/finance/pnl-engine.ts` + `src/lib/finance/__pnl_check.mts` (motor puro + check de regresión)
   - `src/components/operational/ExpenseCategoryRatesForm.tsx`, `ProductCatalogManager.tsx`, `DayFinanceTab.tsx`, `FinancePnlView.tsx`
   - `src/lib/actions/finance.ts`, `src/types/domain.ts`
   - `docs/FINANCE_MODEL_V2.md` (modelo as-built — actualízalo al final)
   - Datos de negocio: `../../02_roadmap/` y `entregables/modelo-financiero-ijump-jun2026.html` (el documento que respondió Raúl).
5. Puedes apoyar el criterio contable en un subagente `business-analyst`/`data-analyst` o en las skills de `financial-analysis`, pero **la decisión de taxonomía es tuya en la sesión principal**.

## 1. Estado actual del modelo (tras PR #27) — punto de partida
Grupos actuales (`expense_categories.group_type`, TEXT+CHECK):
- `COSTES_DIRECTOS`: VUELOS, COMBUSTIBLE, PLEGADOS, EDICION
- `COMISIONES`: COMISION_GROUPON
- `PERSONAL`: INSTRUCTORES
- `GENERALES`: EQUIPOS, TASAS_AERODROMO, GENERALES
- Tabla `sale_channels` (DIRECT/PLATFORM + `commission_pct` NULL pendiente). El motor aplica la comisión al P&L.

## 2. Cambios confirmados por Raúl (lo que hay que implementar)

### 2.1 Comisiones — NEUTRALIZAR el modelo del P&L (corrige PR #27)
Raúl confirma que **el dinero que entra por Groupon/Smartbox/etc. ya llega NETO** (la plataforma se queda su comisión antes de pagar a iJump). Por tanto, restar una comisión en el P&L sería **doble conteo**.
- **Quita el grupo `COMISIONES` del P&L** y haz que el motor **deje de aplicar `commission_pct`**. Desactiva/elimina la categoría de gasto `COMISION_GROUPON`.
- **CONSERVA la tabla `sale_channels`** como **registro de canal de venta** (identifica el proveedor de cada venta externa; reservas la reutiliza). Mantén `commission_pct` como dato **pendiente/informativo** (cada plataforma tiene tarifa distinta, aún sin confirmar) — pero **no se resta del P&L**.
- Resultado: el ingreso registrado ya es neto; el proveedor se sigue identificando por venta; cero doble conteo.

### 2.2 Reestructura de grupos — "Costes Operativos" con subgrupo "Personal"
"Costes directos" generaba confusión. Renombra y reordena:
- **Renombra `COSTES_DIRECTOS` → `COSTES_OPERATIVOS`** (casi todo es directo por vuelo/salto).
- **El personal es coste operativo directo, pero debe ir sub-desglosado bajo un subgrupo "Personal"** para orden. → **Añade una columna `subgroup` (TEXT, nullable)** a `expense_categories` (aditivo). Dentro de `COSTES_OPERATIVOS`:
  - subgrupo `PERSONAL`: INSTRUCTORES, PLEGADOS, PILOTO (nuevo), CAMARA_EXTERNA (nuevo)
  - subgrupo `MATERIAL` (o NULL): VUELOS, COMBUSTIBLE, EDICION, EQUIPOS
- **Elimina el grupo `PERSONAL`** (queda vacío al mover INSTRUCTORES a operativos/subgrupo personal). El motor P&L debe renderizar el subtotal del subgrupo "Personal" dentro de Costes Operativos.

### 2.3 Tarifas y categorías de personal (subgrupo Personal)
| code | concepto | tarifa | base | acción |
|---|---|---|---|---|
| INSTRUCTORES | Instructor | **30€/salto** | PER_JUMP | mover a operativos+subgrupo personal; fijar rate 30 |
| PLEGADOS | Plegador (pliega el paracaídas) | **15€/plegado** | PER_JUMP | confirmar rate 15; subgrupo personal |
| PILOTO | Piloto | **15€/vuelo** (0 si no hay vuelo) | PER_FLIGHT | **NUEVA**; subgrupo personal |
| CAMARA_EXTERNA | Monitor de cámara externa | **35€/salto con vídeo externo** | condicional (ver 2.6) | **NUEVA**; subgrupo personal |

### 2.4 Material / operativos
- **EDICION**: **10€/vídeo**. Confirmar rate. Subgrupo material.
- **EQUIPOS (paracaídas)**: hay 2 comprados (financiados en parte con la compra del avión, contabilidad pendiente → **no amortizar ahora, documentar**). Cuando hacen **back-to-back alquilan equipo: 25€ por alquiler**. → Modela EQUIPOS como **coste variable de alquiler (25€) solo cuando aplica** (ver 2.6 condicionales). Los comprados: documentar como pendiente, sin amortización.
- **VUELOS (coste de avión por vuelo)**: ⚠️ **coherencia a revisar.** Antes podía ser un coste de alquiler/charter por vuelo. Ahora **el avión es propio** (préstamo, ver 2.5). Si ya no hay coste de "alquiler de avión" por vuelo, **VUELOS podría sobrar o quedar a 0**, sustituido por combustible + piloto por vuelo + cuota mensual del préstamo. **Pregunta de negocio 🔵 a confirmar con Raúl**: ¿sigue existiendo un coste de avión por vuelo aparte de combustible? No lo borres sin confirmar; déjalo documentado.

### 2.5 Costes fijos mensuales (GENERALES) — modelar cash recurrente, NO amortización
- **Bundle aeródromo**: renombra `TASAS_AERODROMO` → **"Tasas aeródromo, hangaraje, luz, habitaciones"**, **1040€/mes** (FIXED). Incluye 2 habitaciones de alquiler y la luz.
- **Aplazamiento por inactividad**: hasta diciembre 2026 pagan **1240€/mes** (1040 + **200€** de aplazamiento por los meses sin operar; llevan pagados mayo y junio). El **+200€ es financiación temporal del dueño**, no coste operativo recurrente. → Modela el bundle a **1040€** y trata los **+200€/mes (may–dic 2026)** como **línea temporal de "Financiación/aplazamiento" claramente etiquetada y acotada en el tiempo, o documéntalo** (Ricardo eligió documentar; si lo modelas, que sea una línea aparte con fin en dic-2026, nunca mezclado en el bundle).
- **Software edición "Swoopware"**: **~30 $/mes** (FIXED, GENERALES). Ojo: importe en **USD** — decide si lo guardas en EUR con nota de conversión o añades soporte de moneda (mínimo: nota clara). Pendiente importe exacto en EUR 🔵.
- **Seguro del avión**: **probablemente NO está incluido en el bundle de aeródromo.** 🔵 Confirmar con Raúl si es línea aparte. Si lo es → **NUEVA** categoría `SEGURO_AVION` (FIXED, GENERALES, importe pendiente).
- **Cuota préstamo avión**: préstamo **150.000€ a 7 años** (compra del avión; el antiguo se rompió, indemnización 105.000€, el nuevo salió más barato y con el excedente compraron un paracaídas). Empezaron a pagar en **junio 2026**. → Modela **UNA sola línea de gasto fijo mensual editable** `CUOTA_PRESTAMO_AVION` (FIXED, GENERALES), importe = la **cuota real del banco (pendiente 🔵)**. **NO construyas tabla de amortización** (principal/interés/capital pendiente): falta el tipo de interés y media tabla no sirve. El desglose contable se documenta como tarea futura. Así la línea queda completa, no a medias.

### 2.6 Costes condicionales (dependen de la operativa del día)
Algunos costes solo aplican según lo que pasa en la jornada. El motor debe calcularlos desde la operativa:
- **CAMARA_EXTERNA (35€)**: solo cuando el salto lleva **vídeo externo** (producto `VIDEO_EXT`). Cuenta participantes con vídeo externo.
- **EQUIPOS alquiler (25€)**: solo en **back-to-back** (cuando alquilan equipo extra).
- Esto puede requerir una **nueva `rate_basis`** (p. ej. `PER_EXTERNAL_VIDEO_JUMP`) o que el motor derive las cantidades de `participant_items`/paquetes y del flag de back-to-back. Decídelo en el plan. Mantén el patrón de motor **puro** + check `jiti`.

### 2.7 IVA — dejar como está
Operan como **club deportivo** (no declaran IVA por ahora; se modificará en el futuro). El modelo ya es "IVA-ready" (`vat_rate` nullable). → **No apliques IVA**; deja `vat_rate` NULL y **documenta** que es club deportivo exento, a revisitar cuando cambien de régimen.

## 3. Edición / integración manifiesto ↔ finanzas (alcance de ESTA sesión)
- **Ahora (fase 1):** las tarifas de las categorías auto-calculadas deben ser **editables en ajustes** (ya existe `ExpenseCategoryRatesForm`, extiéndelo a las nuevas) y debe haber **override de gastos por jornada en el manifiesto** (lo que ya soporta `expenses.operational_day_id`). Las finanzas recogen lo reflejado en la operativa diaria vía estos overrides + los costes condicionales (2.6).
- **Fase 2 (solo documentar, NO implementar):** "módulo de finanzas totalmente editable con todo enlazado / botón de edición en finanzas". Déjalo escrito en `docs/FINANCE_MODEL_V2.md` como fase futura para no inflar esta sesión.

## 4. Incoherencias a vigilar y reportar
Si al implementar detectas incoherencias, **párate y dilo en el PR**. Conocidas:
- **VUELOS vs avión propio** (2.4): posible coste obsoleto ahora que el avión es propio. No borrar sin confirmar.
- **Doble conteo combustible**: si VUELOS incluía combustible, COMBUSTIBLE separado lo duplicaría. 🔵
- La reclasificación + nuevas tarifas **cambiarán** totales históricos (no es solo presentacional como en PR #27). El check `__pnl_check.mts` ya no debe asumir invariante de EBITDA; **reescríbelo** para validar la nueva aritmética (tarifas reales, comisión = 0, subgrupos) con casos representativos.

## 5. Documentar como PENDIENTE (la contabilidad real está desordenada)
Crea/actualiza una sección "Pendientes contables" en `docs/FINANCE_MODEL_V2.md`:
- Amortización del avión (préstamo 150k/7a): cuota real, tipo de interés, reparto principal/interés.
- Amortización de los 2 paracaídas comprados (ligados a la compra del avión).
- Importe exacto del seguro del avión (¿separado del bundle?).
- Tarifas de comisión por plataforma (Groupon/Smartbox/WonderBox/Jumping/Freedom) — para análisis bruto vs neto futuro.
- Swoopware: importe exacto en EUR / soporte de moneda.
- El +200€/mes de aplazamiento (may–dic 2026) y su tratamiento como financiación.
- IVA: cambio de régimen futuro.
- Coherencia VUELOS / combustible.

## 6. Verificación (nada "hecho" sin prueba)
- `npx tsc --noEmit` limpio · `npm run build` EXIT 0.
- `__pnl_check.mts` **reescrito** y en verde con las nuevas reglas (tarifas reales, comisión neutralizada, subgrupos, costes condicionales).
- Migración **aditiva y reversible** con bloque ROLLBACK; probada en **rama de Supabase, nunca prod**; regenerar `database.types.ts` tras aplicar (`supabase gen types typescript`).
- Revisión visual de `/finanzas` (P&L con grupos nuevos + subtotal Personal), `/finanzas/catalogo` y el tab de finanzas de una jornada en el navegador, a ~820px (tablet).

## 7. Revisión adversarial antes del PR
Subagentes en paralelo: **`agent-skills:code-reviewer`** (aritmética del motor, migración reversible, que neutralizar comisión no rompa nada que dependiera de `sale_channels`) + **`agent-skills:security-auditor`** (RLS de columnas/tablas nuevas). Aplica los fixes antes de abrir PR.

## 8. Git y entrega
- Nunca commits a `main`. Trabaja en `feature/finance-model-raul-data`, **PR a `main`** (`gh pr create`).
- Commits en inglés, imperativo, co-autoría al final.
- **Confirma con Ricardo antes de push/PR.**
- Al cerrar: actualiza `docs/FINANCE_MODEL_V2.md` (modelo nuevo + pendientes), la tabla de estado de `CLAUDE.md`, y lista las decisiones 🔵 en el cuerpo del PR para Raúl.

## 9. Decisiones que cierras tú en el plan
1. Mecánica del subgrupo `Personal` en el motor y la UI (subtotal anidado).
2. `rate_basis`/derivación para costes condicionales (cámara 35€, alquiler equipo 25€).
3. Tratamiento del +200€ aplazamiento (línea temporal acotada vs solo documentar).
4. Swoopware en USD: EUR con nota vs soporte de moneda.
5. Reescritura del check de regresión con las nuevas reglas.