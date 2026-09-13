-- Naming/ordering consistency with batch B2 part one. BEFORE triggers fire in
-- alphabetical order, so the stamp must sort ahead of any validation trigger
-- that could read NEW.company_id (equipment serial uniqueness does).
ALTER TRIGGER stamp_user_roles_company_id ON public.user_roles
  RENAME TO aa_stamp_tenant_company_id;
ALTER TRIGGER stamp_loads_company_id ON public.loads
  RENAME TO aa_stamp_tenant_company_id;
ALTER TRIGGER stamp_equipment_items_company_id ON public.equipment_items
  RENAME TO aa_stamp_tenant_company_id;