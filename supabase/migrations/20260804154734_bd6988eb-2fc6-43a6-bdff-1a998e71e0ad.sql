ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS home_country text NOT NULL DEFAULT 'US';
UPDATE public.profiles SET home_country = 'US' WHERE home_country IS NULL OR home_country = '';