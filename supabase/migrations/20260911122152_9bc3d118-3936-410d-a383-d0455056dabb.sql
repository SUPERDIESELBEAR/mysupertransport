CREATE UNIQUE INDEX user_roles_single_owner
  ON public.user_roles (role)
  WHERE role = 'owner';

COMMENT ON INDEX public.user_roles_single_owner IS
  'At most ONE user may hold the owner role. Storage-layer enforcement, so service_role cannot bypass it. Rejected alternatives: a CHECK constraint cannot see other rows; a counting trigger races under concurrency. This enforces AT MOST one, not exactly one: "exactly one" is preserved by refusing plain deletion of the owner row (Pass 2) and by making transfer atomic in a single function (Pass 3). Consequence: insert-then-delete transfer fails at the insert, and delete-then-insert leaves a zero-owner window while 166 owner-keyed policy expressions are live.';