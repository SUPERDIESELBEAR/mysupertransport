-- Tenancy step 2, batch B2 part two: user_roles, loads, equipment_items.
-- `applications` is deliberately NOT in this migration: it has an anon INSERT
-- policy, so neither sanctioned stamping shape fits. Reported, not invented.

-- 1. Columns, nullable first, FK to the company with ON DELETE RESTRICT.
ALTER TABLE public.user_roles
  ADD COLUMN company_id uuid REFERENCES public.carrier_profile(id) ON DELETE RESTRICT;
ALTER TABLE public.loads
  ADD COLUMN company_id uuid REFERENCES public.carrier_profile(id) ON DELETE RESTRICT;
ALTER TABLE public.equipment_items
  ADD COLUMN company_id uuid REFERENCES public.carrier_profile(id) ON DELETE RESTRICT;

-- 2. Backfill. Bare scalar subquery: a second carrier row raises 21000 rather
--    than letting the backfill pick one arbitrarily.
ALTER TABLE public.user_roles DISABLE TRIGGER USER;
ALTER TABLE public.loads DISABLE TRIGGER USER;
ALTER TABLE public.equipment_items DISABLE TRIGGER USER;

UPDATE public.user_roles
   SET company_id = (SELECT id FROM public.carrier_profile)
 WHERE company_id IS NULL;
UPDATE public.loads
   SET company_id = (SELECT id FROM public.carrier_profile)
 WHERE company_id IS NULL;
UPDATE public.equipment_items
   SET company_id = (SELECT id FROM public.carrier_profile)
 WHERE company_id IS NULL;

ALTER TABLE public.user_roles ENABLE TRIGGER USER;
ALTER TABLE public.loads ENABLE TRIGGER USER;
ALTER TABLE public.equipment_items ENABLE TRIGGER USER;

-- 3. Required from now on. No default at any point.
ALTER TABLE public.user_roles ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.loads ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.equipment_items ALTER COLUMN company_id SET NOT NULL;

-- 4. Server-side stamp. Same function as batch B2 part one:
--    membership always wins and overwrites; service_role may name a company
--    when membership cannot resolve; anything else refuses.
--    user_roles needs the service-role branch (get-staff-list,
--    provision-demo-driver, provision-test-driver upsert roles with no
--    auth.uid()); loads and equipment_items are written only by signed-in
--    staff, so they only ever take the membership branch.
CREATE TRIGGER stamp_user_roles_company_id
  BEFORE INSERT ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_company_id();
CREATE TRIGGER stamp_loads_company_id
  BEFORE INSERT ON public.loads
  FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_company_id();
CREATE TRIGGER stamp_equipment_items_company_id
  BEFORE INSERT ON public.equipment_items
  FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_company_id();

CREATE INDEX idx_user_roles_company_id ON public.user_roles (company_id);
CREATE INDEX idx_loads_company_id ON public.loads (company_id);
CREATE INDEX idx_equipment_items_company_id ON public.equipment_items (company_id);

-- 5. Uniqueness: PER-COMPANY.
-- One owner per company. Previously one owner globally, which made a second
-- tenant unable to have an owner at all.
DROP INDEX public.user_roles_single_owner;
CREATE UNIQUE INDEX user_roles_single_owner
  ON public.user_roles (company_id, role)
  WHERE role = 'owner';
COMMENT ON INDEX public.user_roles_single_owner IS
  'PER-COMPANY: exactly one owner row per company. Owner writes are additionally gated by enforce_owner_role_writes.';

-- ST- load numbering restarts per carrier.
ALTER TABLE public.loads DROP CONSTRAINT loads_load_number_key;
CREATE UNIQUE INDEX loads_company_load_number_key
  ON public.loads (company_id, load_number);
COMMENT ON INDEX public.loads_company_load_number_key IS
  'PER-COMPANY: load numbers are a carrier-local sequence, so two carriers may both have ST-1001.';

-- Equipment serials: fabricated serials in another company must be able to
-- collide with real ones.
DROP INDEX public.idx_equipment_items_canonical_serial_uniq;
CREATE UNIQUE INDEX idx_equipment_items_canonical_serial_uniq
  ON public.equipment_items (company_id, device_type, public.canonical_equipment_serial(serial_number))
  WHERE status <> 'deactivated';
COMMENT ON INDEX public.idx_equipment_items_canonical_serial_uniq IS
  'PER-COMPANY: canonical serial uniqueness within one carrier''s inventory.';

DROP INDEX public.idx_equipment_items_serial_type;
CREATE UNIQUE INDEX idx_equipment_items_serial_type
  ON public.equipment_items (
    company_id,
    upper(replace(replace(replace(serial_number, '-', ''), '.', ''), ' ', '')),
    device_type
  );
COMMENT ON INDEX public.idx_equipment_items_serial_type IS
  'PER-COMPANY: literal serial+device uniqueness within one carrier''s inventory.';

-- 6. The serial trigger must move with the index, or it would report a
--    collision against another company's inventory.
CREATE OR REPLACE FUNCTION public.enforce_equipment_serial_uniqueness()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  conflicting_serial text;
BEGIN
  -- Retiring a row is the REMEDY for a duplicate. The collision query already
  -- excludes deactivated rows as comparison targets; excluding them as the
  -- subject too means the guard can never block its own cleanup.
  IF NEW.status = 'deactivated' THEN
    RETURN NEW;
  END IF;

  -- Assign / return / archive are status transitions that never touch the
  -- serial. The trigger fires on them only because `status` is in its UPDATE
  -- column list, so exit before the collision query when nothing that can
  -- collide has changed. INSERT has no OLD and always falls through.
  IF TG_OP = 'UPDATE'
     AND OLD.device_type = NEW.device_type
     AND OLD.company_id = NEW.company_id
     AND public.canonical_equipment_serial(OLD.serial_number)
         = public.canonical_equipment_serial(NEW.serial_number)
  THEN
    RETURN NEW;
  END IF;

  -- Scoped to the company, matching idx_equipment_items_canonical_serial_uniq.
  -- Without this, one carrier's inventory would report a collision against
  -- another carrier's serials, which it must never be able to see.
  SELECT ei.serial_number
    INTO conflicting_serial
    FROM public.equipment_items ei
   WHERE ei.id <> NEW.id
     AND ei.company_id = NEW.company_id
     AND ei.device_type = NEW.device_type
     AND ei.status <> 'deactivated'
     AND public.canonical_equipment_serial(ei.serial_number)
         = public.canonical_equipment_serial(NEW.serial_number)
   LIMIT 1;

  IF conflicting_serial IS NOT NULL THEN
    RAISE EXCEPTION
      'That device is already on file as % — only look-alike characters differ.',
      conflicting_serial
      USING ERRCODE = 'unique_violation';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.enforce_equipment_serial_uniqueness() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_equipment_serial_uniqueness() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_equipment_serial_uniqueness() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_equipment_serial_uniqueness() TO service_role;