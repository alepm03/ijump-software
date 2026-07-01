# Revisión estratégica — Gaps operativos día a día

**Fecha:** 2026-07-01
**Autor:** Ricardo (Edrai) actuando como CEO/CTO del proyecto, sesión de revisión post-validación financiera
**Contexto:** Tras validar el módulo financiero con datos reales (fin de semana 18-19 oct 2025), se identificaron 4 áreas a revisar para operativa diaria. Este documento es el resultado de esa revisión: qué existe, qué falta, y una hoja de ruta priorizada.

---

## Resumen ejecutivo

De las 4 áreas planteadas, **una es un hallazgo de mayor calado de lo esperado** (desglose de ingresos), dos son gaps confirmados sin ambigüedad (saldo pendiente de cobro, pagos a instructores), y una es una decisión de producto ya tomada deliberadamente que vale la pena revisar (notas de cliente / CRM).

| # | Área | Estado actual | Severidad |
|---|---|---|---|
| 1 | Desglose de ingresos por producto/canal | Esquema listo, **pero ningún flujo de la app lo alimenta — ni siquiera para datos nuevos de hoy** | 🔴 Alta |
| 2 | Saldo pendiente de cobro en check-in | No existe; consecuencia directa del punto 1 | 🟠 Media-alta |
| 3 | Deuda por instructor / pagos a instructores | Se calcula el agregado, pero sin desglose por instructor ni tracking de si ya se pagó | 🟠 Media-alta |
| 4 | Notas/historial de cliente recurrente | No existe por diseño explícito ("no es un CRM") | 🟡 Media (decisión, no bug) |

---

## 1. Desglose de ingresos por producto y canal

**Lo que vimos en /finanzas:** "Ingresos por producto" muestra una única fila "Sin desglosar (histórico)" con el 100%.

**Lo que hay construido:**
- Existe un catálogo de productos real y con precios (`products`): Salto tándem base 215€, Handycam 60€, Vídeo externo 175€, Fotos 20€, Suplemento sobrepeso 45€, Reportaje terrestre (precio pendiente).
- Existe una tabla `participant_items` pensada para vincular cada participante con los productos que compró, y el motor de P&L (`pnl-engine.ts`) ya sabe leerla y desglosar ingresos por categoría de producto cuando hay datos.
- Existe `sale_channels` con 8 canales (Directa, Bono, Promo, Groupon, Smartbox, Wonder Box, Jumping, Freedom) y campo de comisión, aunque la mayoría de plataformas tienen la comisión "pendiente de confirmar".

**El hallazgo importante:** revisé si el flujo actual de alta de participantes (`AddParticipantDrawer`, `participant.ts`, `payment.ts`) crea filas en `participant_items`. **No lo hace, en ningún caso.** La tabla tiene 0 filas en toda la base de datos, incluyendo los datos que se cargan hoy mismo por el staff. Esto no es solo un problema con el histórico que yo cargué esta sesión — **es un gap activo del sistema en producción**: cada participante que se da de alta hoy en el aeródromo se factura como un pago libre (importe suelto), no como "1 tándem + 1 handycam", así que el desglose por producto seguirá vacío indefinidamente hasta que se conecte esa pieza.

La relación con canal de venta sí funciona (`participants.reservation_group_id` → `reservation_groups.source`), así que un desglose de ingresos brutos por canal (no por comisión, que está deliberadamente desactivado para evitar doble conteo) es más barato de activar que el desglose por producto.

**Qué haría falta:**
1. Añadir selección de producto(s) al formulario "Añadir participante" (o a un paso posterior tipo "cerrar venta"), que cree las filas `participant_items` correspondientes con su precio del catálogo.
2. Opcional y de menor prioridad: una migración de backfill que infiera `participant_items` para los históricos ya cargados a partir de `participants.package_type`, si Raúl quiere ver el histórico también desglosado (decisión de negocio, no técnica).
3. Activar en la UI de /finanzas el desglose de ingresos por canal (`reservation_groups.source`), que con el esquema actual es prácticamente gratis de mostrar.

---

## 2. Saldo pendiente de cobro (visibilidad en check-in/onboarding)

**Lo que existe hoy:** en la fila de cada participante del manifiesto, un badge "Pagado · X€" o "Reservado · X€" (si solo hay depósito), y un diálogo que desglosa cada pago por etapa (Reserva/Liquidación/Suplemento) y método (Efectivo/Tarjeta/Bizum/Transferencia/Groupon). El staff puede crear, editar y borrar pagos libremente.

**Lo que no existe:** ningún cálculo de "cuánto falta por cobrar". No puede existir mientras no haya un importe esperado por participante — y ese importe esperado es exactamente lo que el punto 1 (`participant_items` + `products`) resolvería. Hoy, si alguien paga solo el depósito de 60€ y se va sin pagar la liquidación de 190€, el sistema no avisa a nadie: solo se ve el badge "Reservado · 60€", sin ninguna señal de alarma.

**Por qué importa operativamente:** es exactamente el escenario que describes — al hacer el onboarding del día, el staff necesita ver de un vistazo quién tiene saldo pendiente, no tener que sumar mentalmente reserva vs. tarifa esperada.

**Qué haría falta (depende del punto 1):**
1. Con `participant_items` poblado: `saldo_pendiente = Σ(participant_items.price) − Σ(payments.amount)`, cálculo trivial.
2. Badge visual en rojo/naranja para "saldo pendiente > 0" en la fila del manifiesto, en vez de solo "Reservado".
3. Vista agregada "Pendiente de cobro" en el dashboard del día (quién falta por cobrar, cuánto en total).

---

## 3. Pagos a instructores (payroll / liquidación)

**Lo que existe:** el coste de instructores se calcula dinámicamente como `saltos_completados × fee_per_jump` del instructor asignado, y se agrega en Gastos > Personal > Instructores del P&L (ej. "1.400 €" para el mes). Este cálculo **no se persiste** — se recalcula cada vez que se abre /finanzas.

**Lo que no existe:**
- Ningún desglose por instructor individual ("esto es lo que se le debe a Mihai, esto a Raúl").
- Ninguna tabla ni campo que registre que un instructor **ya cobró** (no hay `instructor_payouts`, `paid_at`, ni nada equivalente).
- Ninguna vista de "liquidación de instructores" del mes.

Es un cálculo contable correcto para el P&L, pero **cero utilidad operativa** para saber a quién hay que pagar y cuánto, ni para llevar el flujo de caja real frente a instructores.

**Pregunta de negocio ya abierta y sin responder** (`PREGUNTAS_NEGOCIO_FINANZAS.md`, pregunta 16): si la tarifa de cada instructor varía según el tipo de salto o paquete. Hoy el sistema asume una tarifa fija por instructor, sin variación. Si la realidad es distinta, el modelo de datos necesitará ajustarse antes de construir nada encima.

**Qué haría falta:**
1. Resolver primero con Raúl la pregunta 16 (tarifa fija vs. variable por tipo de salto) — condiciona el diseño.
2. Vista "Instructores" en Finanzas: por instructor, por periodo, saltos realizados × tarifa = total, con botón/estado "marcar como pagado" (tabla nueva `instructor_payouts` con `instructor_id`, `period`, `amount`, `paid_at`, `notes`).
3. Esto conecta directamente con flujo de caja: sabrías en cualquier momento cuánto tienes pendiente de pagar a instructores, no solo el agregado en el P&L.

---

## 4. Notas / historial de cliente

**Lo que existe:** cada participante tiene un campo `notes` de texto libre, editable en la ficha del participante, pero **acotado a esa reserva concreta**. No hay concepto de "cliente" que persista entre reservas.

**Esto no es un descuido — es una decisión de diseño explícita** documentada en el masterplan de arquitectura: el sistema está construido alrededor del concepto `OperationalDay` (la jornada operativa), no alrededor del cliente. Un CRM avanzado con historial de cliente recurrente está listado explícitamente como fuera de alcance ("Lo que NO está en scope (aún)") en el `CLAUDE.md` del repo.

**Mi lectura como CTO:** la decisión de no construir un CRM completo (contactos, segmentación, campañas) sigue siendo correcta para el tamaño del negocio — sería sobre-ingeniería. Pero hay un término medio barato entre "nada" y "CRM completo" que sí resuelve tu pregunta real ("otras circunstancias que puedan surgir con el cliente particular"):

**Propuesta de bajo coste:** al escribir un teléfono o email en "Añadir participante", buscar coincidencias previas en `participants` (mismo teléfono/email) y, si las hay, mostrar un aviso no bloqueante tipo "Este cliente ya saltó el 13/07/2025 — ver notas anteriores" con enlace a esa reserva. No requiere tabla de clientes nueva, ni agregación permanente — solo una búsqueda al vuelo por teléfono/email sobre `participants` existente. Cubre el caso real (alergia, incidencia previa, cliente conflictivo, etc.) sin construir un CRM.

---

## Otras oportunidades identificadas (fuera de lo preguntado)

Como referencia, señalo brevemente — sin desarrollarlas — cosas que vale la pena tener en el radar aunque no estén priorizadas ahora:

- **Cancelaciones por meteo:** existe `weather_status` en `operational_days`, pero no vi flujo de reprogramación automática de un participante cancelado por meteo a otro día.
- **Certificación/vigencia de instructores:** no hay campo para caducidad de licencia o seguro de instructor — relevante para riesgo regulatorio, aunque de menor urgencia con un único instructor activo (Mihai) hoy.
- **Consentimiento informado:** ya existe generación de PDF de waiver (`generate-waiver-pdf.ts`) y flag `waiver_signed` — no lo he auditado a fondo, pero está cubierto a nivel básico.

---

## Hoja de ruta propuesta

| Prioridad | Qué | Por qué en ese orden |
|---|---|---|
| **P0** | Conectar `participant_items` al flujo de alta de participantes (selección de producto al vender) | Desbloquea el punto 1 y es prerrequisito técnico directo del punto 2 (saldo pendiente). Es la pieza que más se repite en el resto de gaps. |
| **P0** | Resolver con Raúl la pregunta 16 (tarifa de instructor fija vs. variable) | Bloquea cualquier diseño de payroll de instructores; es una pregunta de negocio, no de código, y ya lleva tiempo abierta. |
| **P1** | Saldo pendiente de cobro visible en el manifiesto (badge rojo) | Impacto operativo diario alto, coste bajo una vez resuelto el P0 de arriba. |
| **P1** | Vista de liquidación de instructores con estado "pagado" | Resuelve directamente tu pregunta de flujo de caja frente a instructores. |
| **P2** | Aviso de "cliente ya visto antes" por teléfono/email al dar de alta | Bajo coste, alto valor puntual, no requiere CRM completo. |
| **P2** | Desglose de ingresos por canal en /finanzas (no por producto) | Casi gratis con el esquema actual (`reservation_groups.source`), pero de menor urgencia que el desglose por producto. |

**Mi recomendación:** los dos P0 conviene tratarlos como un sprint corto conjunto con Alejandro (uno es código, el otro es una conversación con Raúl que puede correr en paralelo). El resto son mejoras incrementales que no requieren replantear arquitectura.
