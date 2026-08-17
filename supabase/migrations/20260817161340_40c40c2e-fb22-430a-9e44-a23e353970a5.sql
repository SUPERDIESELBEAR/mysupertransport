DROP POLICY IF EXISTS "tp_participant_insert" ON public.thread_participants;

CREATE POLICY "tp_participant_insert" ON public.thread_participants
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_thread_participant(thread_id, auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.message_threads mt
      WHERE mt.id = thread_id AND mt.created_by = auth.uid()
    )
  );