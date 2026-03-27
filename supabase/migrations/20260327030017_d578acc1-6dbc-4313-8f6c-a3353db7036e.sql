CREATE POLICY "Staff can delete applications"
ON public.applications
FOR DELETE
TO authenticated
USING (is_staff(auth.uid()));