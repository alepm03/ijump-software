# Plan — Módulo de Administración: Tesorería, nóminas operativas y cliente

**Creado:** 2026-07-01
**Estado:** BORRADOR pre-plan. La sesión de ejecución debe empezar en **plan mode**, refinar esto y confirmarlo con Ricardo antes de tocar código.
**Propuesta completa (leer primero):** [`docs/PROPUESTA_ADMINISTRACION_TESORERIA_2026-07.md`](../docs/PROPUESTA_ADMINISTRACION_TESORERIA_2026-07.md)
**Dinámica:** al completar todo el plan, mover este archivo a `tasks/_archivado/` (no borrar) y añadir la sección de review al final.

---

## Fase 0 — Decisiones de negocio (Ricardo/Raúl, no es código, puede ir en paralelo)
- [ ] Modelo de precio por plataforma (Groupon/Smartbox): ¿precio de venta distinto o mismo precio − comisión? **(BLOQUEA Fase 1)**
- [ ] Tarifa del instructor de cámara (importe; cobra menos que tándem — ya confirmado el hecho)
- [ ] Tarifa de plegador (¿por pliegue o por salto?) y de piloto (¿por vuelo?)
- [ ] Bonos regalo propios: qué incluyen, precio, gestión (bloquea Fase 5)
- [ ] Importes reales de préstamo del avión y seguro

## Fase 1 — Itemización + saldo pendiente (AR) · LA CLAVE
- [ ] Diseño en plan mode del modelo de precio por plataforma según decisión de Fase 0
- [ ] Alimentar `participant_items` desde el alta/edición de participante (selección de producto — una sola entrada, en el manifiesto, rápida en tablet)
- [ ] Cálculo de saldo pendiente = Σ(items) − Σ(pagos)
- [ ] Badge de saldo pendiente en la fila del manifiesto (rojo/naranja si > 0)
- [ ] Vista "Cobros pendientes" (AR) en administración
- [ ] Verificar que el desglose de ingresos por producto deja de mostrar "Sin desglosar"
- [ ] Checks de regresión del P&L en verde

## Fase 2 — Cierre de caja diario (máximo ROI)
- [ ] Tabla `cash_close` (una por jornada) — plan mode
- [ ] Cierre por método: efectivo/tarjeta/bizum esperado (derivado de `payments`) vs. contado
- [ ] Registro de descuadre + nota; log de descuadres
- [ ] Vista de cierre de caja en administración

## Fase 3 — Nómina de personal operativo
- [ ] Generalizar `instructors` → roles con tarifa propia (tándem, cámara, plegador, piloto)
- [ ] Atribución por operación: quién hizo cada rol (tándem ya existe; añadir cámara/plegador/piloto)
- [ ] Devengado por persona/periodo con estado pagado/pendiente (`staff_settlements`)
- [ ] Reconciliación con el coste de personal del P&L
- [ ] Vista "Pagos a personal" en administración

## Fase 4 — Cuentas por pagar a proveedores + posición de caja
- [ ] Extender `expenses` (o tabla `payables`) con estado + vencimiento + fecha de pago
- [ ] Vista "Pagos a proveedores" (facturas pendientes/pagadas con vencimiento)
- [ ] Vista de posición de caja en el tiempo (AR + caja − AP)

## Fase 5 — CRM-lite + bonos (opcional/futuro)
- [ ] Entidad `customer` por teléfono/email + FK desde participantes
- [ ] Aviso "cliente ya visto" al dar de alta (UI mínima)
- [ ] Bonos/vouchers regalo con saldo canjeable (tras decisión Fase 0)

## Transversal (aplica a todas las fases)
- [ ] Migraciones aditivas y reversibles con bloque ROLLBACK
- [ ] Regenerar `database.types.ts` tras cada migración
- [ ] Una sola entrada de datos: nada que se derive de la operación tiene tecleo propio
- [ ] Actualizar `docs/finanzas/FINANCE_MODEL_V2.md` y `CLAUDE.md` (§Estado actual) al cerrar cada fase
- [ ] Recordar a Alejandro aplicar migraciones a mano en Supabase tras el merge

---

## Review (rellenar al completar antes de archivar)
- _Pendiente._
