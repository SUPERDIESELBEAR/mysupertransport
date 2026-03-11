-- Enable realtime for the applications table so CDL/med cert expiry updates
-- broadcast to PipelineDashboard's subscription in both Staff and Management portals
ALTER PUBLICATION supabase_realtime ADD TABLE public.applications;