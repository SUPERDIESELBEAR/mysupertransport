create or replace function public.record_load_reference_baseline(
  p_load_id uuid,
  p_document_id uuid,
  p_document_label text,
  p_summary text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (
    has_role(auth.uid(), 'dispatcher'::app_role)
    or has_role(auth.uid(), 'management'::app_role)
    or has_role(auth.uid(), 'owner'::app_role)
  ) then
    raise exception 'Not authorized to file reference numbers on a load';
  end if;

  if not exists (select 1 from public.loads where id = p_load_id) then
    raise exception 'Load not found';
  end if;

  insert into public.load_change_history (
    load_id, field_path, previous_value, new_value, is_financial, reason, change_source, changed_by
  ) values (
    p_load_id,
    'references.baseline',
    'No reference numbers on file',
    coalesce(p_summary, 'Reference numbers filed'),
    false,
    'Reference baseline filed from '
      || coalesce(nullif(p_document_label, ''), 'a rate confirmation')
      || coalesce(' (document ' || p_document_id::text || ')', ''),
    'reference_baseline',
    auth.uid()
  );
end;
$$;

revoke all on function public.record_load_reference_baseline(uuid, uuid, text, text) from public;
grant execute on function public.record_load_reference_baseline(uuid, uuid, text, text) to authenticated;