
CREATE TRIGGER trg_notify_driver_on_upload_status_change
AFTER UPDATE OF status ON public.driver_uploads
FOR EACH ROW
EXECUTE FUNCTION public.notify_driver_on_upload_status_change();
