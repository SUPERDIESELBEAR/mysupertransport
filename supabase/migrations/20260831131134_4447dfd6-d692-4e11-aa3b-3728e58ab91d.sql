ALTER TABLE public.lease_terminations
  ADD COLUMN voided_at timestamptz,
  ADD COLUMN voided_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN void_reason text;

CREATE INDEX idx_lease_terminations_voided_at ON public.lease_terminations (voided_at) WHERE voided_at IS NOT NULL;

COMMENT ON COLUMN public.lease_terminations.voided_at IS 'Set when the document was generated in error and withdrawn. A voided row is never deleted and never edited; the original effective date, reason, note, carrier signature and audit trail remain exactly as recorded.';
COMMENT ON COLUMN public.lease_terminations.voided_by IS 'profiles(id) of the actor who voided the document. Server-resolved actor, never auth.uid().';
COMMENT ON COLUMN public.lease_terminations.void_reason IS 'Why the document was withdrawn.';