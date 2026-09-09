-- Attribution for account-name changes.
--
-- A driver can rename their own login account from the operator app. That write
-- goes straight to public.profiles, and operators cannot insert into audit_log
-- (the INSERT policy is is_staff only), so the change left no trail at all.
-- This trigger records it server-side, where the actor cannot be spoofed.

create or replace function public.audit_profile_name_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_first text := coalesce(old.first_name, '');
  v_old_last  text := coalesce(old.last_name, '');
  v_new_first text := coalesce(new.first_name, '');
  v_new_last  text := coalesce(new.last_name, '');
  v_actor uuid := auth.uid();
  v_operator_id uuid;
begin
  -- Only a real name change is an event.
  if v_old_first = v_new_first and v_old_last = v_new_last then
    return new;
  end if;

  select o.id into v_operator_id
  from public.operators o
  where o.user_id = new.user_id
  limit 1;

  insert into public.audit_log (
    action, entity_type, entity_id, entity_label, actor_id, actor_name, metadata
  ) values (
    'profile_name_changed',
    case when v_operator_id is not null then 'operator' else 'profile' end,
    coalesce(v_operator_id, new.id),
    nullif(btrim(v_new_first || ' ' || v_new_last), ''),
    v_actor,
    public._audit_actor_name(v_actor),
    jsonb_build_object(
      'old_first', v_old_first,
      'old_last', v_old_last,
      'new_first', v_new_first,
      'new_last', v_new_last,
      'changed_by_self', (v_actor is not null and v_actor = new.user_id),
      'target_user_id', new.user_id
    )
  );

  return new;
end;
$$;

revoke all on function public.audit_profile_name_change() from public;
revoke all on function public.audit_profile_name_change() from anon;
revoke all on function public.audit_profile_name_change() from authenticated;

drop trigger if exists trg_audit_profile_name_change on public.profiles;
create trigger trg_audit_profile_name_change
after update of first_name, last_name on public.profiles
for each row
execute function public.audit_profile_name_change();
