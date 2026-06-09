
-- 1. Columns
ALTER TABLE public.operator_documents
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS deleted_by uuid NULL,
  ADD COLUMN IF NOT EXISTS delete_reason text NULL;

-- 2. Partial index for hot path
CREATE INDEX IF NOT EXISTS operator_documents_live_by_op
  ON public.operator_documents (operator_id)
  WHERE deleted_at IS NULL;

-- 3. RLS: drivers only see live docs; staff unchanged (still see all via existing policy)
DROP POLICY IF EXISTS "Operators can view their own operator docs" ON public.operator_documents;
CREATE POLICY "Operators can view their own live operator docs"
  ON public.operator_documents
  FOR SELECT
  USING (
    deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.operators o
      WHERE o.id = operator_documents.operator_id
        AND o.user_id = auth.uid()
    )
  );

-- 4. Trigger: audit log + onboarding_status side-effects on soft-delete / restore
CREATE OR REPLACE FUNCTION public.handle_operator_document_soft_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_name text;
  v_label      text;
  v_doc_type   text := NEW.document_type::text;
  v_live_count int;
BEGIN
  IF OLD.deleted_at IS DISTINCT FROM NEW.deleted_at THEN
    -- Resolve actor name (best-effort)
    SELECT TRIM(COALESCE(first_name,'') || ' ' || COALESCE(last_name,''))
      INTO v_actor_name
      FROM public.profiles
     WHERE user_id = COALESCE(NEW.deleted_by, auth.uid())
     LIMIT 1;

    -- Label = "<First Last> — <doc_type>" if we can find the operator profile
    SELECT TRIM(COALESCE(p.first_name,'') || ' ' || COALESCE(p.last_name,''))
      INTO v_label
      FROM public.operators o
      LEFT JOIN public.profiles p ON p.user_id = o.user_id
     WHERE o.id = NEW.operator_id
     LIMIT 1;

    IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
      -- Soft delete
      INSERT INTO public.audit_log (actor_id, actor_name, action, entity_type, entity_id, entity_label, metadata)
      VALUES (
        COALESCE(NEW.deleted_by, auth.uid()),
        NULLIF(v_actor_name, ''),
        'document_deleted',
        'operator',
        NEW.operator_id,
        NULLIF(v_label, ''),
        jsonb_build_object(
          'document_id',   NEW.id,
          'document_type', v_doc_type,
          'file_name',     NEW.file_name,
          'file_url',      NEW.file_url,
          'uploaded_at',   NEW.uploaded_at,
          'delete_reason', NEW.delete_reason
        )
      );

      -- Reset Stage 2 status if the last live copy is now gone
      SELECT COUNT(*) INTO v_live_count
        FROM public.operator_documents
       WHERE operator_id = NEW.operator_id
         AND document_type = NEW.document_type
         AND deleted_at IS NULL
         AND id <> NEW.id;

      IF v_live_count = 0 THEN
        IF v_doc_type = 'form_2290' THEN
          UPDATE public.onboarding_status SET form_2290 = 'pending'
           WHERE operator_id = NEW.operator_id AND form_2290 = 'received';
        ELSIF v_doc_type = 'truck_title' THEN
          UPDATE public.onboarding_status SET truck_title = 'pending'
           WHERE operator_id = NEW.operator_id AND truck_title = 'received';
        ELSIF v_doc_type = 'truck_photos' THEN
          UPDATE public.onboarding_status SET truck_photos = 'pending'
           WHERE operator_id = NEW.operator_id AND truck_photos = 'received';
        ELSIF v_doc_type = 'truck_inspection' THEN
          UPDATE public.onboarding_status SET truck_inspection = 'pending'
           WHERE operator_id = NEW.operator_id AND truck_inspection = 'received';
        END IF;
      END IF;

    ELSIF NEW.deleted_at IS NULL AND OLD.deleted_at IS NOT NULL THEN
      -- Restore
      INSERT INTO public.audit_log (actor_id, actor_name, action, entity_type, entity_id, entity_label, metadata)
      VALUES (
        auth.uid(),
        NULLIF(v_actor_name, ''),
        'document_restored',
        'operator',
        NEW.operator_id,
        NULLIF(v_label, ''),
        jsonb_build_object(
          'document_id',   NEW.id,
          'document_type', v_doc_type,
          'file_name',     NEW.file_name,
          'file_url',      NEW.file_url
        )
      );

      -- Bump Stage 2 status back to received if it's currently pending
      IF v_doc_type = 'form_2290' THEN
        UPDATE public.onboarding_status SET form_2290 = 'received'
         WHERE operator_id = NEW.operator_id AND form_2290 = 'pending';
      ELSIF v_doc_type = 'truck_title' THEN
        UPDATE public.onboarding_status SET truck_title = 'received'
         WHERE operator_id = NEW.operator_id AND truck_title = 'pending';
      ELSIF v_doc_type = 'truck_photos' THEN
        UPDATE public.onboarding_status SET truck_photos = 'received'
         WHERE operator_id = NEW.operator_id AND truck_photos = 'pending';
      ELSIF v_doc_type = 'truck_inspection' THEN
        UPDATE public.onboarding_status SET truck_inspection = 'received'
         WHERE operator_id = NEW.operator_id AND truck_inspection = 'pending';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_operator_document_soft_delete ON public.operator_documents;
CREATE TRIGGER trg_operator_document_soft_delete
  AFTER UPDATE OF deleted_at ON public.operator_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_operator_document_soft_delete();

-- 5. Update copy_stage2_docs_to_vault to skip soft-deleted source rows
CREATE OR REPLACE FUNCTION public.copy_stage2_docs_to_vault()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc RECORD;
  v_map RECORD;
BEGIN
  FOR v_map IN
    SELECT *
    FROM (VALUES
      ('form_2290',   'form_2290',   'IRS Form 2290'),
      ('truck_title', 'truck_title', 'Truck Title'),
      ('truck_photos','truck_photos','Truck Photos')
    ) AS t(status_field, doc_type, vault_label)
  LOOP
    IF v_map.status_field = 'form_2290'
       AND OLD.form_2290 IS DISTINCT FROM NEW.form_2290
       AND NEW.form_2290 = 'received'
    THEN
      FOR v_doc IN
        SELECT file_url, file_name
        FROM public.operator_documents
        WHERE operator_id = NEW.operator_id
          AND document_type::text = v_map.doc_type
          AND deleted_at IS NULL
      LOOP
        INSERT INTO public.driver_vault_documents (operator_id, category, label, file_url, file_name, uploaded_by)
        SELECT NEW.operator_id, v_map.doc_type, v_map.vault_label, v_doc.file_url, v_doc.file_name, NEW.updated_by
        WHERE NOT EXISTS (
          SELECT 1 FROM public.driver_vault_documents
          WHERE operator_id = NEW.operator_id
            AND category = v_map.doc_type
            AND file_name = v_doc.file_name
        );
      END LOOP;
    END IF;

    IF v_map.status_field = 'truck_title'
       AND OLD.truck_title IS DISTINCT FROM NEW.truck_title
       AND NEW.truck_title = 'received'
    THEN
      FOR v_doc IN
        SELECT file_url, file_name
        FROM public.operator_documents
        WHERE operator_id = NEW.operator_id
          AND document_type::text = v_map.doc_type
          AND deleted_at IS NULL
      LOOP
        INSERT INTO public.driver_vault_documents (operator_id, category, label, file_url, file_name, uploaded_by)
        SELECT NEW.operator_id, v_map.doc_type, v_map.vault_label, v_doc.file_url, v_doc.file_name, NEW.updated_by
        WHERE NOT EXISTS (
          SELECT 1 FROM public.driver_vault_documents
          WHERE operator_id = NEW.operator_id
            AND category = v_map.doc_type
            AND file_name = v_doc.file_name
        );
      END LOOP;
    END IF;

    IF v_map.status_field = 'truck_photos'
       AND OLD.truck_photos IS DISTINCT FROM NEW.truck_photos
       AND NEW.truck_photos = 'received'
    THEN
      FOR v_doc IN
        SELECT file_url, file_name
        FROM public.operator_documents
        WHERE operator_id = NEW.operator_id
          AND document_type::text = v_map.doc_type
          AND deleted_at IS NULL
      LOOP
        INSERT INTO public.driver_vault_documents (operator_id, category, label, file_url, file_name, uploaded_by)
        SELECT NEW.operator_id, v_map.doc_type, v_map.vault_label, v_doc.file_url, v_doc.file_name, NEW.updated_by
        WHERE NOT EXISTS (
          SELECT 1 FROM public.driver_vault_documents
          WHERE operator_id = NEW.operator_id
            AND category = v_map.doc_type
            AND file_name = v_doc.file_name
        );
      END LOOP;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;
