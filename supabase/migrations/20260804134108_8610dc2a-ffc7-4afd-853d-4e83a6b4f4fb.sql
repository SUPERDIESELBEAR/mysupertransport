CREATE POLICY "Assignees can view notifications assigned to them"
ON public.notifications
FOR SELECT
TO authenticated
USING (assigned_to = auth.uid());