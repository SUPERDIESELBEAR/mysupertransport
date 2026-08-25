ALTER TABLE public.messages
  ADD COLUMN load_id uuid REFERENCES public.loads(id) ON DELETE SET NULL;

CREATE INDEX idx_messages_load ON public.messages (load_id, sent_at DESC) WHERE load_id IS NOT NULL;

COMMENT ON COLUMN public.messages.load_id IS 'Optional link to the load this message is about. NULL = general message. Does not change threading: load-linked messages stay in the participants'' single conversation.';