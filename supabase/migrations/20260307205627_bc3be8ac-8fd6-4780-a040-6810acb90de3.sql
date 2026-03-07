-- Enable realtime for messages table so staff get live message updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;