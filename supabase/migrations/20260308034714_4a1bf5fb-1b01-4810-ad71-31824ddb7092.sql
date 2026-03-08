
-- Create dispatch status history table
CREATE TABLE public.dispatch_status_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  operator_id uuid NOT NULL REFERENCES public.operators(id) ON DELETE CASCADE,
  dispatch_status public.dispatch_status NOT NULL,
  current_load_lane text NULL,
  status_notes text NULL,
  changed_at timestamp with time zone NOT NULL DEFAULT now(),
  changed_by uuid NULL
);

-- Index for fast lookup by operator
CREATE INDEX idx_dispatch_status_history_operator_id ON public.dispatch_status_history(operator_id, changed_at DESC);

-- Enable RLS
ALTER TABLE public.dispatch_status_history ENABLE ROW LEVEL SECURITY;

-- Staff can view all history
CREATE POLICY "Staff can view dispatch history"
  ON public.dispatch_status_history
  FOR SELECT
  USING (is_staff(auth.uid()));

-- Operators can view their own dispatch history
CREATE POLICY "Operators can view their own dispatch history"
  ON public.dispatch_status_history
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.operators
    WHERE operators.id = dispatch_status_history.operator_id
      AND operators.user_id = auth.uid()
  ));

-- Staff can insert dispatch history
CREATE POLICY "Staff can insert dispatch history"
  ON public.dispatch_status_history
  FOR INSERT
  WITH CHECK (is_staff(auth.uid()));

-- Trigger function to auto-log status changes on active_dispatch
CREATE OR REPLACE FUNCTION public.log_dispatch_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'INSERT') OR (OLD.dispatch_status IS DISTINCT FROM NEW.dispatch_status) THEN
    INSERT INTO public.dispatch_status_history (
      operator_id,
      dispatch_status,
      current_load_lane,
      status_notes,
      changed_at,
      changed_by
    ) VALUES (
      NEW.operator_id,
      NEW.dispatch_status,
      NEW.current_load_lane,
      NEW.status_notes,
      now(),
      NEW.updated_by
    );
  END IF;
  RETURN NEW;
END;
$$;

-- Attach trigger to active_dispatch
CREATE TRIGGER trg_dispatch_status_history
  AFTER INSERT OR UPDATE ON public.active_dispatch
  FOR EACH ROW
  EXECUTE FUNCTION public.log_dispatch_status_change();
