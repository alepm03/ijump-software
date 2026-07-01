# Índice de `docs/`

Guía de navegación de la documentación de iJump Software. Léelo antes de buscar nada aquí a mano — te ahorra abrir archivos que ya no aplican.

**Regla general:** todo lo que está fuera de una carpeta `_archivado/` es vigente y se mantiene actualizado. Todo lo que está dentro de una `_archivado/` es referencia histórica (planes ya ejecutados, versiones superadas) — puede ser útil para entender *por qué* algo se construyó así, pero no lo uses como fuente de verdad del estado actual. No se borra nada por si hace falta consultarlo, pero no se actualiza.

**Cada carpeta temática guarda su propio histórico dentro de su propia `_archivado/`** (`finanzas/_archivado/`, `reservas/_archivado/`), en vez de un archivo central único — así, si trabajas en un módulo concreto, encuentras su historial ahí mismo sin tener que buscar en otro sitio. El `docs/_archivado/` de la raíz es solo para documentos que no pertenecen a ningún módulo con carpeta propia (diseño, datos sueltos).

Si tienes dudas sobre el estado real de una funcionalidad, la fuente de verdad siempre es el `CLAUDE.md` de la raíz del repo (sección "Estado actual del software"), no un doc individual de `docs/`.

---

## Empezar por aquí

- **`ijump_operational_system_architecture_masterplan.md`** — visión y arquitectura global del proyecto: por qué el software gira alrededor del `OperationalDay` y no del cliente, fases, filosofía de producto. Léelo si eres nuevo en el proyecto.
- **`CHECKLIST.md`** — checklist general de avance del MVP (todos los módulos operacionales).
- **`REVISION_ESTRATEGICA_OPERACIONES_2026-07.md`** — revisión estratégica (jul-2026): gaps identificados en desglose de ingresos, saldo pendiente de cobro, pagos a instructores y notas de cliente.
- **`PROPUESTA_ADMINISTRACION_TESORERIA_2026-07.md`** — propuesta que desarrolla esa revisión: módulo de tesorería/caja, nóminas de personal operativo y CRM-lite de cliente, con benchmarking del gremio (Burble, LoadUp, DZ-Manager) y de sectores análogos (Checkfront, FareHarbor). Es la referencia activa hasta que se ejecute — ver `tasks/2026-07-modulo-administracion-tesoreria.md` para el plan por fases.
- **`DESIGN_SYSTEM.md`** — sistema de diseño (única fuente de verdad de UI, OKLCH/light-mode). Toda pantalla nueva debe seguirlo.
- **`PERFORMANCE.md`** — plan de optimización de rendimiento. ⚠️ Su estado real necesita revalidación (parte de lo que describe puede que ya esté resuelto en producción sin que el doc se haya actualizado) — no lo des por vigente al 100% sin comprobarlo contra el código.

## `finanzas/`

Todo lo relacionado con el motor de P&L, catálogo de productos y modelo de gastos (Finanzas v2, en producción desde PR #20).

- **`FINANCE_MODEL_V2.md`** — modelo de datos as-built. Es la referencia técnica vigente.
- **`FINANCE_V2_INTEGRATION.md`** — guía post-merge: qué se construyó, cómo revertir cada pieza, plantilla para futuros módulos grandes.
- **`FINANZAS_TODO.md`** — backlog de finanzas.
- **`PREGUNTAS_NEGOCIO_FINANZAS.md`** — preguntas de negocio a Raúl (tarifas, costes, fiscalidad). Algunas ya resueltas y marcadas como tal inline (ej. pregunta 16, tarifa de instructores), otras siguen abiertas.
- **`finance_v2_validation.sql`** — script de validación/seed para probar el modelo en una rama de Supabase antes de mergear cambios financieros.
- **`_archivado/FINANZAS_MODELO_DATOS.md`** — spec preliminar de finanzas v2, superada por `FINANCE_MODEL_V2.md` (as-built). Histórico.

## `legal/`

- **`DOCUMENTO-CONSENTIMIENTO-INFORMADO.md`** — waiver/consentimiento informado del participante.
- **`TERMINOS-Y-CONDICIONES.md`** — términos y condiciones del servicio.

## `reservas/`

Documentación **activa** del sistema de reservas (lead → confirmación → manifiesto + API del bot, en producción, R1–R10 completados).

- **`CHECKLIST.md`** — estado real fase por fase. Fuente de verdad de progreso de este módulo.
- **`RESERVATIONS_INTEGRATION.md`** — guía post-merge: arquitectura, decisiones tomadas, qué tocar para extenderlo.
- **`BOT_API_CONTRACT.md`** — contrato de la API que consume el chatbot (relevante para el lado de Ricardo, R5).
- **`_archivado/`** — planes preliminares y prompts de handoff ya ejecutados (R1–R10 en producción): `RESERVAS_MASTER_PLAN_v2.md`, `RESERVAS_TECH_APPENDIX_v2.md` (incluye diseño de Stripe, fuera de alcance real del MVP), `RESERVAS_MODULE_PLAN_v1.md` (plan preliminar, ver nota de corrección al inicio del propio archivo), `RESERVAS_HANDOFF_PROMPT.md`, `FINANZAS_REMODEL_V2.MD` (prompt de sesión del ajuste de gastos con datos reales de Raúl, PR #27).

## `_archivado/` (raíz)

Referencia histórica sin módulo propio dentro de `docs/`.

- `REDESIGN.md` — plan de rediseño de UI, superado por `DESIGN_SYSTEM.md`.
- `ijump-prototype-v2.html` — prototipo visual del rediseño, sin lógica, ya no se usa.
- `28 SEPT.xlsx` — archivo de datos suelto sin contexto claro, se archiva a la espera de confirmar si tiene valor.

---

*Reorganizado 2026-07-01. Si añades un doc nuevo, ponlo en la carpeta temática que corresponda (o crea una si no existe ninguna adecuada) y actualiza este índice — no lo dejes suelto en la raíz de `docs/`. Si archivas algo de una carpeta temática, créale su propia `_archivado/` interna en vez de usar la de la raíz.*
