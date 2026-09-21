-- Mark a profile as an internal test login (2026-09-21).
--
-- Permission proofs need a real staff login holding exactly one role. Such an
-- account must never be offered when assigning a coordinator, never be
-- auto-assigned work, and must be visibly a test account wherever staff are
-- listed. A dedicated flag says that plainly instead of overloading
-- profiles.is_demo, which already means "demo driver" and carries email
-- rerouting and the showDemo screen toggle with it.
--
-- Additive only: default false, so every existing row reads as it did before.
--
-- UNDO: ALTER TABLE public.profiles DROP COLUMN is_test_account;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_test_account boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.is_test_account IS
  'True for internal test logins used in permission proofs. Excluded from coordinator assignment lists, notification assignee lists and onboarding workload; badged as TEST wherever staff are listed. Not a tenancy or security control.';
