-- P57: one owner login may own many trucks. A truck still has ONE owner
-- (truck_owners_operator_id_key stays) and a person still drives ONE truck
-- (operators_user_id_key stays).
-- UNDO: ALTER TABLE public.truck_owners DROP CONSTRAINT truck_owners_user_id_operator_id_key;
--       ALTER TABLE public.truck_owners ADD CONSTRAINT truck_owners_user_id_key UNIQUE (user_id);
ALTER TABLE public.truck_owners DROP CONSTRAINT truck_owners_user_id_key;
ALTER TABLE public.truck_owners ADD CONSTRAINT truck_owners_user_id_operator_id_key UNIQUE (user_id, operator_id);

-- P60: owner reads of his trucks' binder, loads and fuel. SELECT only;
-- tenant_isolation (restrictive) still applies.
CREATE POLICY "Truck owners view their drivers' binder docs"
ON public.inspection_documents FOR SELECT TO authenticated
USING (
  scope = 'per_driver'::inspection_doc_scope
  AND EXISTS (
    SELECT 1 FROM public.operators o
    WHERE o.user_id = inspection_documents.driver_id
      AND public.is_truck_owner_for_operator(auth.uid(), o.id)
  )
);

CREATE POLICY loads_truck_owner_read
ON public.loads FOR SELECT TO authenticated
USING (operator_id IS NOT NULL AND public.is_truck_owner_for_operator(auth.uid(), operator_id));

CREATE POLICY fuel_transactions_truck_owner_read
ON public.fuel_transactions FOR SELECT TO authenticated
USING (operator_id IS NOT NULL AND public.is_truck_owner_for_operator(auth.uid(), operator_id));