
UPDATE public.driver_uploads
SET status = 'needs_attention',
    reviewed_at = now(),
    reviewed_by = (SELECT id FROM auth.users WHERE email = 'teststaff@example.com' LIMIT 1)
WHERE id = '72ad2f82-c66c-4b43-bada-63ea41e783f7'
  AND status = 'pending_review';
