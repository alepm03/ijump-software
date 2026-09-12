-- Allow a third legal document: the club membership form (SOCIO).
--
-- waivers.document_type is a text column guarded by a CHECK constraint, so a
-- new document type means widening that list. Purely additive: the two existing
-- values keep working and no row is rewritten.
--
-- The signing UI, the PDF generator and the staff card all read the document
-- list from src/lib/waiver-templates/registry.ts. This migration and that
-- registry have to agree — a type allowed here but missing there raises at
-- generation time rather than rendering the wrong document.

ALTER TABLE waivers
  DROP CONSTRAINT IF EXISTS waivers_document_type_check;

ALTER TABLE waivers
  ADD CONSTRAINT waivers_document_type_check
  CHECK (document_type = ANY (ARRAY['WAIVER'::text, 'RGPD'::text, 'SOCIO'::text]));

-- ─── ROLLBACK ────────────────────────────────────────────────────────────────
-- Reverts to the original two-document constraint. Delete any SOCIO rows first
-- or the ADD CONSTRAINT fails — they would violate the narrower check.
--
-- DELETE FROM waivers WHERE document_type = 'SOCIO';
--
-- ALTER TABLE waivers
--   DROP CONSTRAINT IF EXISTS waivers_document_type_check;
--
-- ALTER TABLE waivers
--   ADD CONSTRAINT waivers_document_type_check
--   CHECK (document_type = ANY (ARRAY['WAIVER'::text, 'RGPD'::text]));
