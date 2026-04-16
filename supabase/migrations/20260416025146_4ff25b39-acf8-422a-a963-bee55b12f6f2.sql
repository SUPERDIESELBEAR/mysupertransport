
-- Create enum for daily dispatch status
CREATE TYPE public.daily_dispatch_status AS ENUM ('dispatched', 'home', 'truck_down', 'not_dispatched');

-- Create dispatch_daily_log table
CREATE TABLE public.dispatch_daily_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  operator_id UUID NOT NULL REFERENCES public.operators(id) ON DELETE CASCADE,
  log_date DATE NOT NULL,
  status public.daily_dispatch_status NOT NULL,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT unique_operator_log_date UNIQUE (operator_id, log_date)
);

-- Enable RLS
ALTER TABLE public.dispatch_daily_log ENABLE ROW LEVEL SECURITY;

-- Staff can view all logs
CREATE POLICY "Staff can view all dispatch daily logs"
ON public.dispatch_daily_log
FOR SELECT
USING (public.is_staff(auth.uid()));

-- Staff can insert logs
CREATE POLICY "Staff can insert dispatch daily logs"
ON public.dispatch_daily_log
FOR INSERT
WITH CHECK (public.is_staff(auth.uid()));

-- Staff can update logs
CREATE POLICY "Staff can update dispatch daily logs"
ON public.dispatch_daily_log
FOR UPDATE
USING (public.is_staff(auth.uid()));

-- Staff can delete logs
CREATE POLICY "Staff can delete dispatch daily logs"
ON public.dispatch_daily_log
FOR DELETE
USING (public.is_staff(auth.uid()));

-- Operators can view their own logs
CREATE POLICY "Operators can view their own dispatch daily logs"
ON public.dispatch_daily_log
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.operators
  WHERE operators.id = dispatch_daily_log.operator_id
    AND operators.user_id = auth.uid()
));

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.dispatch_daily_log;
