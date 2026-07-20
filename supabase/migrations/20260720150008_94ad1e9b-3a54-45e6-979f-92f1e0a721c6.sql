ALTER TABLE public.lease_terminations
  DROP CONSTRAINT lease_terminations_ica_contract_id_fkey,
  ADD  CONSTRAINT lease_terminations_ica_contract_id_fkey
       FOREIGN KEY (ica_contract_id)
       REFERENCES public.ica_contracts(id)
       ON DELETE SET NULL;