
CREATE TYPE public.faq_audience AS ENUM ('owner_operator', 'staff');

ALTER TABLE public.faq
  ADD COLUMN audience public.faq_audience NOT NULL DEFAULT 'owner_operator';

ALTER TABLE public.faq_history
  ADD COLUMN audience public.faq_audience;

-- Tighten public read: only published owner-operator FAQs are visible to anon/authenticated
DROP POLICY IF EXISTS "Anyone can view published FAQs" ON public.faq;
CREATE POLICY "Anyone can view published owner-operator FAQs"
  ON public.faq FOR SELECT
  USING (is_published = true AND audience = 'owner_operator');
