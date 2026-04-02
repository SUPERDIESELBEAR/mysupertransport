
-- Trigger function: copy Stage 2 docs to driver vault on "received"
CREATE OR REPLACE FUNCTION public.copy_stage2_docs_to_vault()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_doc RECORD;
  v_map RECORD;
BEGIN
  -- Build mapping of changed fields
  FOR v_map IN
    SELECT *
    FROM (VALUES
      ('form_2290',   'form_2290',   'IRS Form 2290'),
      ('truck_title', 'truck_title', 'Truck Title'),
      ('truck_photos','truck_photos','Truck Photos')
    ) AS t(status_field, doc_type, vault_label)
  LOOP
    -- Check if this specific field transitioned to 'received'
    IF v_map.status_field = 'form_2290'
       AND OLD.form_2290 IS DISTINCT FROM NEW.form_2290
       AND NEW.form_2290 = 'received'
    THEN
      FOR v_doc IN
        SELECT file_url, file_name
        FROM public.operator_documents
        WHERE operator_id = NEW.operator_id
          AND document_type::text = v_map.doc_type
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

-- Attach trigger
CREATE TRIGGER tr_copy_stage2_to_vault
AFTER UPDATE ON public.onboarding_status
FOR EACH ROW
EXECUTE FUNCTION public.copy_stage2_docs_to_vault();

-- Backfill: copy existing Stage 2 docs for operators already marked "received"
INSERT INTO public.driver_vault_documents (operator_id, category, label, file_url, file_name)
SELECT os.operator_id, od.document_type::text,
  CASE od.document_type::text
    WHEN 'form_2290' THEN 'IRS Form 2290'
    WHEN 'truck_title' THEN 'Truck Title'
    WHEN 'truck_photos' THEN 'Truck Photos'
  END,
  od.file_url, od.file_name
FROM public.onboarding_status os
JOIN public.operator_documents od ON od.operator_id = os.operator_id
WHERE od.document_type::text IN ('form_2290', 'truck_title', 'truck_photos')
  AND (
    (od.document_type::text = 'form_2290' AND os.form_2290 = 'received')
    OR (od.document_type::text = 'truck_title' AND os.truck_title = 'received')
    OR (od.document_type::text = 'truck_photos' AND os.truck_photos = 'received')
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.driver_vault_documents dvd
    WHERE dvd.operator_id = os.operator_id
      AND dvd.category = od.document_type::text
      AND dvd.file_name = od.file_name
  );
