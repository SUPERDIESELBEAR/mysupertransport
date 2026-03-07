
-- Fix the overly permissive INSERT policy on applications
-- The public application form needs to allow anonymous inserts, but we should restrict it more carefully
DROP POLICY IF EXISTS "Anyone can insert application" ON public.applications;

-- Allow inserts only when email is provided (basic validation at DB level)
-- The actual form validation happens client-side and in the application logic
CREATE POLICY "Public can submit application with email" ON public.applications 
FOR INSERT WITH CHECK (email IS NOT NULL AND email != '');

-- Also allow staff to insert applications (for manual entry)
CREATE POLICY "Staff can insert applications" ON public.applications
FOR INSERT WITH CHECK (public.is_staff(auth.uid()));
