alter function public.audit_profile_name_change() set search_path to 'public', 'extensions';
alter function public.audit_roadside_stop() set search_path to 'public', 'extensions';
alter function public.stamp_roadside_stop() set search_path to 'public', 'extensions';
alter function public.is_own_operator(uuid) set search_path to 'public', 'extensions';

revoke all on function public.audit_profile_name_change() from public, anon, authenticated;
revoke all on function public.audit_roadside_stop() from public, anon, authenticated;
revoke all on function public.stamp_roadside_stop() from public, anon, authenticated;
grant execute on function public.audit_profile_name_change() to service_role;
grant execute on function public.audit_roadside_stop() to service_role;
grant execute on function public.stamp_roadside_stop() to service_role;

revoke all on function public.is_own_operator(uuid) from public, anon;
grant execute on function public.is_own_operator(uuid) to authenticated, service_role;