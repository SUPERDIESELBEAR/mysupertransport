-- Add QPassport URL and PE Receipt URL columns to onboarding_status
ALTER TABLE public.onboarding_status
  ADD COLUMN IF NOT EXISTS qpassport_url TEXT,
  ADD COLUMN IF NOT EXISTS pe_receipt_url TEXT;

-- Add pe_receipt to operator_doc_type enum
ALTER TYPE public.operator_doc_type ADD VALUE IF NOT EXISTS 'pe_receipt';