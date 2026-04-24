UPDATE public.onboarding_status os
SET    truck_photos = 'requested', updated_at = now()
WHERE  os.truck_photos = 'not_started'
  AND  EXISTS (
    SELECT 1 FROM public.operator_documents od
    WHERE od.operator_id = os.operator_id
      AND od.document_type = 'truck_photos'
  );