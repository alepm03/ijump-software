-- ============================================================
-- Reservas de grupo — recuperar la semántica de `reservation_groups`
--
-- Contexto (docs/reservas/CRM_REVIEW_2026-07.md §"Badge Grupo", CHECKLIST §92):
-- `reservation_groups` se diseñó para agrupar una reserva de varias personas,
-- pero acabó usada como portadora del campo `source`: createParticipant crea
-- un grupo nuevo por CADA participante, así que en la práctica todos los
-- grupos son de 1 y la agrupación real nunca ha existido. Encima, la API del
-- bot descarta los acompañantes por contrato, y el chatbot ni siquiera llama
-- a la API cuando n_personas > 1 — una reserva de pareja o grupo no llega al
-- sistema en absoluto.
--
-- A partir de aquí, una fila de `reservation_groups` es UNA RESERVA con
-- 1..N participantes. No hace falta migrar datos: los grupos-de-1 existentes
-- ya son, bajo esta semántica, reservas de una persona correctas.
--
-- Los acompañantes son filas `participants` completas (no un JSON) porque
-- cada persona necesita su propio waiver (QR individual), su propio
-- participant_items (facturación por persona), su propio asiento, su propio
-- instructor y su propio recargo OW. El acompañante es simplemente un
-- participante que no aporta teléfono ni email.
--
-- Aditiva y reversible. Bloque de ROLLBACK al final.
-- ============================================================

-- ============================================================
-- 1. participants — rol dentro del grupo y marca de menor de edad
-- ============================================================

ALTER TABLE participants
  ADD COLUMN is_organizer BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN is_minor     BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN participants.is_organizer IS
  'Quien hace la reserva y aporta los datos de contacto del grupo. Único por grupo (índice parcial). Una reserva de 1 persona también tiene su organizador.';
COMMENT ON COLUMN participants.is_minor IS
  'Menor de edad: requiere autorización paterna firmada. El manifest lo avisa mientras falte.';

-- Backfill: en cada grupo existente, el miembro más antiguo es el organizador.
-- Hoy todos los grupos son de 1, así que esto marca exactamente a esa persona;
-- se escribe genérico para que sea correcto si algún grupo tuviera ya 2+.
WITH first_member AS (
  SELECT DISTINCT ON (reservation_group_id) id
  FROM participants
  WHERE reservation_group_id IS NOT NULL
  ORDER BY reservation_group_id, created_at, id
)
UPDATE participants p
SET is_organizer = TRUE
FROM first_member fm
WHERE p.id = fm.id;

-- Un solo organizador por grupo. Parcial: los participantes sin grupo
-- (altas directas en el manifest) no entran en la restricción.
CREATE UNIQUE INDEX idx_participants_one_organizer_per_group
  ON participants (reservation_group_id)
  WHERE is_organizer AND reservation_group_id IS NOT NULL;

-- ============================================================
-- 2. reservation_groups — modo de cobro acordado con el cliente
--
-- INFORMATIVO, nunca una restricción: solo decide la acción de cobro por
-- defecto en la UI y el aviso en el manifest. El caso real mixto (el
-- organizador paga las señales de todos y cada uno liquida lo suyo el día
-- del salto) sigue siendo posible con cualquier valor.
-- ============================================================

ALTER TABLE reservation_groups
  ADD COLUMN payment_mode TEXT NOT NULL DEFAULT 'UNDECIDED';

ALTER TABLE reservation_groups
  ADD CONSTRAINT reservation_groups_payment_mode_check
    CHECK (payment_mode IN ('ORGANIZER', 'INDIVIDUAL', 'UNDECIDED'));

COMMENT ON COLUMN reservation_groups.payment_mode IS
  'Cómo se acordó cobrar: ORGANIZER (uno paga por todos), INDIVIDUAL (cada uno lo suyo) o UNDECIDED. Informativo: no restringe ningún cobro.';

-- ============================================================
-- 3. payments — agrupar las N filas de un cobro único del organizador
--
-- El modelo de pagos NO cambia: siguen siendo por participante, para que
-- caja, AR, cierre de caja y P&L sigan cuadrando exactamente igual. Esta
-- columna solo permite mostrar y deshacer como UNA operación las N filas
-- que genera un cobro de grupo repartido.
-- ============================================================

ALTER TABLE payments
  ADD COLUMN group_payment_id UUID;

CREATE INDEX idx_payments_group_payment_id
  ON payments (group_payment_id)
  WHERE group_payment_id IS NOT NULL;

COMMENT ON COLUMN payments.group_payment_id IS
  'Agrupa las filas generadas por un cobro único repartido entre los miembros de un grupo. NULL en cobros individuales.';

-- ============================================================
-- 4. business_settings — umbral de evento
--
-- A partir de este tamaño, una reserva de grupo se trata como EVENTO: se
-- acepta igual, pero nunca se autoconfirma y el equipo tiene que
-- confirmarla expresamente. Decisión de negocio (Ricardo, 2026-09-11):
-- hasta 9 es una reserva normal, 10+ es un evento a negociar.
-- ============================================================

INSERT INTO business_settings (key, value, description) VALUES
  ('group_event_threshold', '10', 'Tamaño de grupo a partir del cual la reserva es un EVENTO: nunca se autoconfirma, la confirma el equipo expresamente.')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- ROLLBACK (manual, ejecutar a mano si hay que revertir)
-- ============================================================
-- DELETE FROM business_settings WHERE key = 'group_event_threshold';
-- DROP INDEX IF EXISTS idx_payments_group_payment_id;
-- ALTER TABLE payments DROP COLUMN IF EXISTS group_payment_id;
-- ALTER TABLE reservation_groups
--   DROP CONSTRAINT IF EXISTS reservation_groups_payment_mode_check,
--   DROP COLUMN IF EXISTS payment_mode;
-- DROP INDEX IF EXISTS idx_participants_one_organizer_per_group;
-- ALTER TABLE participants
--   DROP COLUMN IF EXISTS is_organizer,
--   DROP COLUMN IF EXISTS is_minor;
--
-- Las funciones (reservations_assign_group y el arreglo de
-- reservations_assign_seat) van en 20260911000001 y tienen su propio ROLLBACK.
