import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTH_UID, PROFILE_ID, createPgFake, functionBody, roleGateFor } from './helpers/pgFake';

/**
 * `loads.dispatcher_id` after creation.
 *
 * Creation derives the dispatcher server-side: the creator is stamped ONLY if
 * they hold the dispatcher role, so an owner-created load has none. Changing it
 * afterwards is a separate writer, management/owner only, recorded in
 * `load_change_history`.
 */

const fake = createPgFake();
const holder = globalThis as unknown as { __pgFake: { client: unknown } };
holder.__pgFake = fake;
vi.mock('@/integrations/supabase/client', () => ({
  get supabase() { return holder.__pgFake.client; },
}));

const OTHER_PROFILE = 'b1e0f0aa-1111-4444-8888-0c0ffee00002';
const OTHER_UID = 'c0ffee00-0000-4000-8000-000000000002';

const rpc = (fn: string, args: Record<string, unknown>) =>
  (fake.client as { rpc: (f: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> })
    .rpc(fn, args);

const stops = [
  { facility_name: 'Origin', stop_type: 'pickup' },
  { facility_name: 'Destination', stop_type: 'delivery' },
];

const createLoad = async () => {
  const { data, error } = await rpc('create_load_with_stops', {
    p_load: { load_number: 'ST-DISP-1', equipment_type: 'dry_van' },
    p_stops: stops,
    p_charges: [],
  });
  if (error) throw error;
  return data as string;
};

beforeEach(() => {
  fake.reset();
  fake.tables.profiles.push({
    id: OTHER_PROFILE, user_id: OTHER_UID, first_name: 'Dana', last_name: 'Reyes',
  });
  fake.tables.user_roles.push({ user_id: OTHER_UID, role: 'dispatcher' });
});

describe('create_load_with_stops stamps the dispatcher from the creator’s role', () => {
  it('gates the stamp on has_role(auth.uid(), dispatcher) in the SQL itself', () => {
    const body = functionBody('create_load_with_stops') ?? '';
    expect(body, 'create_load_with_stops is not in the migration set').toBeTruthy();
    expect(roleGateFor(body, 'v_dispatcher')).toBe('dispatcher');
  });

  it('a dispatcher creating a load is stamped as its dispatcher', async () => {
    fake.setActorRoles(['dispatcher']);
    const id = await createLoad();
    expect(fake.tables.loads.find(l => l.id === id)?.dispatcher_id).toBe(PROFILE_ID);
  });

  it('an owner creating a load leaves the dispatcher unassigned', async () => {
    fake.setActorRoles(['owner', 'management']);
    const id = await createLoad();
    expect(fake.tables.loads.find(l => l.id === id)?.dispatcher_id).toBeNull();
  });
});

describe('set_load_dispatcher', () => {
  it('refuses a caller who is only a dispatcher', async () => {
    fake.setActorRoles(['dispatcher']);
    const id = await createLoad();
    const { error } = await rpc('set_load_dispatcher', { p_load_id: id, p_dispatcher_id: OTHER_PROFILE });
    expect((error as { message: string } | null)?.message).toMatch(/management or the owner/i);
    expect(fake.tables.load_change_history).toHaveLength(0);
  });

  it('refuses a target who does not hold the dispatcher role', async () => {
    fake.setActorRoles(['management']);
    const id = await createLoad();
    fake.tables.user_roles.push({ user_id: 'someone', role: 'management' });
    fake.tables.profiles.push({ id: 'profile-x', user_id: 'someone', first_name: 'Not', last_name: 'Dispatcher' });
    const { error } = await rpc('set_load_dispatcher', { p_load_id: id, p_dispatcher_id: 'profile-x' });
    expect((error as { message: string } | null)?.message).toMatch(/not a dispatcher/i);
  });

  it('management assigns a dispatcher and the change is recorded', async () => {
    fake.setActorRoles(['management']);
    const id = await createLoad();
    expect(fake.tables.loads.find(l => l.id === id)?.dispatcher_id).toBeNull();

    const { error } = await rpc('set_load_dispatcher', {
      p_load_id: id, p_dispatcher_id: OTHER_PROFILE, p_reason: 'Desk handover',
    });
    expect(error).toBeNull();
    expect(fake.tables.loads.find(l => l.id === id)?.dispatcher_id).toBe(OTHER_PROFILE);

    const hist = fake.tables.load_change_history.filter(h => h.load_id === id);
    expect(hist).toHaveLength(1);
    expect(hist[0]).toMatchObject({
      field_path: 'dispatcher_id',
      previous_value: null,
      new_value: 'Dana Reyes',
      is_financial: false,
      reason: 'Desk handover',
      changed_by: PROFILE_ID,
    });
  });

  it('clearing the dispatcher is allowed and recorded', async () => {
    fake.setActorRoles(['dispatcher', 'management']);
    const id = await createLoad();
    expect(fake.tables.loads.find(l => l.id === id)?.dispatcher_id).toBe(PROFILE_ID);

    await rpc('set_load_dispatcher', { p_load_id: id, p_dispatcher_id: null });
    expect(fake.tables.loads.find(l => l.id === id)?.dispatcher_id).toBeNull();
    const hist = fake.tables.load_change_history.filter(h => h.load_id === id);
    expect(hist[0].new_value).toBeNull();
  });

  it('an unchanged dispatcher writes no history row', async () => {
    fake.setActorRoles(['dispatcher', 'management']);
    const id = await createLoad();
    await rpc('set_load_dispatcher', { p_load_id: id, p_dispatcher_id: PROFILE_ID });
    expect(fake.tables.load_change_history.filter(h => h.load_id === id)).toHaveLength(0);
  });

  it('the acting profile, not the auth uid, is stamped', async () => {
    fake.setActorRoles(['management']);
    const id = await createLoad();
    await rpc('set_load_dispatcher', { p_load_id: id, p_dispatcher_id: OTHER_PROFILE });
    const hist = fake.tables.load_change_history.filter(h => h.load_id === id);
    expect(hist[0].changed_by).not.toBe(AUTH_UID);
    expect(hist[0].changed_by).toBe(PROFILE_ID);
  });
});
