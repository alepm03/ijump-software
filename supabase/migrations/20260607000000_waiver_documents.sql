-- ============================================================
-- Waiver documents: token-based QR flow, multi-document type,
-- form data storage, and Supabase Storage bucket
-- ============================================================

-- Extend waivers table
ALTER TABLE waivers
  ADD COLUMN token         UUID        NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN document_type TEXT        NOT NULL DEFAULT 'WAIVER',
  ADD COLUMN status        TEXT        NOT NULL DEFAULT 'PENDING',
  ADD COLUMN form_data     JSONB;

-- Constraints
ALTER TABLE waivers
  ADD CONSTRAINT waivers_token_unique
    UNIQUE (token);

ALTER TABLE waivers
  ADD CONSTRAINT waivers_document_type_check
    CHECK (document_type IN ('WAIVER', 'RGPD'));

ALTER TABLE waivers
  ADD CONSTRAINT waivers_status_check
    CHECK (status IN ('PENDING', 'COMPLETED', 'EXPIRED'));

-- Indexes
CREATE INDEX idx_waivers_token         ON waivers(token);
CREATE INDEX idx_waivers_participant_doc ON waivers(participant_id, document_type);

-- ============================================================
-- Storage bucket for waiver PDFs and signature images
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'waiver-documents',
  'waiver-documents',
  false,
  5242880,  -- 5 MB max per file
  ARRAY['application/pdf', 'image/png', 'image/jpeg']
)
ON CONFLICT (id) DO NOTHING;

-- Authenticated staff: full access to stored waiver files
CREATE POLICY "Authenticated can upload waiver documents"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'waiver-documents');

CREATE POLICY "Authenticated can read waiver documents"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'waiver-documents');

CREATE POLICY "Authenticated can delete waiver documents"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'waiver-documents');
