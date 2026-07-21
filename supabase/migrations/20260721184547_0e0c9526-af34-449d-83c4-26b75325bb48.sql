DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='passenger_authorizations' AND policyname='Driver reads own passenger authorizations') THEN
    CREATE POLICY "Driver reads own passenger authorizations"
      ON public.passenger_authorizations
      FOR SELECT
      TO authenticated
      USING (operator_id IN (SELECT id FROM public.operators WHERE user_id = auth.uid()));
  END IF;
END $$;

INSERT INTO public.notifications (user_id, type, title, body, link, entity_type, entity_id, priority, channel)
SELECT o.user_id,
       'assignment',
       'Passenger Authorization required',
       'Complete the Passenger Authorization for Unit ' || pa.unit_number || ' and sign the form.',
       '/passenger-auth/' || pa.response_token,
       'passenger_authorization',
       pa.id,
       'action',
       'in_app'
  FROM public.passenger_authorizations pa
  JOIN public.operators o ON o.id = pa.operator_id
 WHERE pa.status IN ('sent','opened')
   AND o.user_id IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.notifications n
      WHERE n.entity_type = 'passenger_authorization' AND n.entity_id = pa.id
   );