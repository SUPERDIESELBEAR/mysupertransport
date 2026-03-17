
DROP TRIGGER IF EXISTS trg_notify_driver_on_upload_status_change ON public.driver_uploads;

-- Also clean up the duplicate notifications just created
DELETE FROM public.notifications
WHERE id IN ('0626e1b4-3c68-4a91-b674-807c855d1a09', 'ff06e876-e420-4767-8ee1-4d4caf4d9dd7');

-- Reset the test upload back to pending_review for future testing
UPDATE public.driver_uploads
SET status = 'pending_review', reviewed_at = NULL, reviewed_by = NULL
WHERE id = '72ad2f82-c66c-4b43-bada-63ea41e783f7';
