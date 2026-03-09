-- Allow staff (onboarding_staff, dispatcher, management) to delete ICA contracts
-- This is needed for the Void ICA feature so staff can clear a contract and re-issue
CREATE POLICY "Staff can delete ICA contracts"
ON public.ica_contracts
FOR DELETE
USING (is_staff(auth.uid()));