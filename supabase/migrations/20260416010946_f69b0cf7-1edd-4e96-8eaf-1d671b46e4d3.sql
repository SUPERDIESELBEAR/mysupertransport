ALTER TABLE public.ica_contracts
  ADD COLUMN deposit_elected boolean NOT NULL DEFAULT false,
  ADD COLUMN deposit_initials text,
  ADD COLUMN deposit_elected_date text;