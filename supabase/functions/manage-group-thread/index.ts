import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

type Action =
  | { action: 'create'; title: string; participant_ids: string[] }
  | { action: 'rename'; thread_id: string; title: string }
  | { action: 'add'; thread_id: string; participant_ids: string[] }
  | { action: 'remove'; thread_id: string; user_id: string }
  | { action: 'leave'; thread_id: string };

const STAFF_ROLES = new Set(['owner', 'management', 'onboarding_staff', 'dispatcher']);

async function getRolesFor(admin: ReturnType<typeof createClient>, userId: string): Promise<Set<string>> {
  const { data } = await admin.from('user_roles').select('role').eq('user_id', userId);
  return new Set((data ?? []).map((r: { role: string }) => r.role));
}

function isStaffRole(roles: Set<string>) {
  for (const r of roles) if (STAFF_ROLES.has(r)) return true;
  return false;
}

function displayName(p: { first_name: string | null; last_name: string | null } | null | undefined): string {
  if (!p) return 'Someone';
  return `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'Someone';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: claims, error: claimsErr } = await admin.auth.getUser(token);
    if (claimsErr || !claims?.user) {
      return new Response(JSON.stringify({ error: 'invalid token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const meId = claims.user.id;
    const myRoles = await getRolesFor(admin, meId);
    const iAmStaff = isStaffRole(myRoles);

    const body = (await req.json()) as Action;

    // Fetch my profile for system-message wording
    const { data: myProfile } = await admin
      .from('profiles').select('first_name,last_name').eq('user_id', meId).maybeSingle();
    const myName = displayName(myProfile);

    async function postSystem(threadId: string, text: string) {
      await admin.from('messages').insert({
        thread_id: threadId,
        sender_id: meId,
        recipient_id: null,
        body: text,
        is_system: true,
      });
      await admin.from('message_threads').update({ last_message_at: new Date().toISOString() }).eq('id', threadId);
    }

    async function validateParticipantSet(ids: string[]): Promise<{ ok: true } | { ok: false; error: string }> {
      if (!ids.length) return { ok: false, error: 'No participants provided' };
      // Enforce driver rule: if I'm a driver (not staff), every added participant must be staff
      if (!iAmStaff) {
        for (const uid of ids) {
          const r = await getRolesFor(admin, uid);
          if (!isStaffRole(r)) return { ok: false, error: 'Drivers can only add staff members to a group' };
        }
      }
      return { ok: true };
    }

    switch (body.action) {
      case 'create': {
        const title = (body.title ?? '').trim();
        if (!title) return json({ error: 'Group name is required' }, 400);
        const partIds = Array.from(new Set(body.participant_ids.filter(id => id !== meId)));
        const v = await validateParticipantSet(partIds);
        if (!v.ok) return json({ error: v.error }, 403);

        const { data: thread, error: tErr } = await admin
          .from('message_threads')
          .insert({ is_group: true, title, created_by: meId, last_message_at: new Date().toISOString() })
          .select('id').single();
        if (tErr || !thread) return json({ error: tErr?.message ?? 'thread create failed' }, 500);

        const rows = [
          { thread_id: thread.id, user_id: meId, role_in_thread: 'admin' },
          ...partIds.map(uid => ({ thread_id: thread.id, user_id: uid, role_in_thread: 'member' })),
        ];
        const { error: pErr } = await admin.from('thread_participants').insert(rows);
        if (pErr) return json({ error: pErr.message }, 500);

        await postSystem(thread.id, `${myName} created the group "${title}".`);
        // fan-out in-app notification
        for (const uid of partIds) {
          await admin.from('notifications').insert({
            user_id: uid,
            title: `Added to group "${title}"`,
            body: `${myName} added you to a group chat.`,
            type: 'new_message',
            channel: 'in_app',
            link: linkFor(myRoles, uid),
          }).select();
        }
        return json({ thread_id: thread.id });
      }

      case 'rename': {
        const title = (body.title ?? '').trim();
        if (!title) return json({ error: 'Title required' }, 400);
        const isAdmin = await callerIsAdmin(admin, body.thread_id, meId);
        if (!isAdmin) return json({ error: 'Only group admins can rename' }, 403);
        const { error } = await admin.from('message_threads').update({ title }).eq('id', body.thread_id);
        if (error) return json({ error: error.message }, 500);
        await postSystem(body.thread_id, `${myName} renamed the group to "${title}".`);
        return json({ ok: true });
      }

      case 'add': {
        const isAdmin = await callerIsAdmin(admin, body.thread_id, meId);
        if (!isAdmin) return json({ error: 'Only group admins can add members' }, 403);
        const ids = Array.from(new Set(body.participant_ids));
        const v = await validateParticipantSet(ids);
        if (!v.ok) return json({ error: v.error }, 403);
        const rows = ids.map(uid => ({ thread_id: body.thread_id, user_id: uid, role_in_thread: 'member' }));
        const { error } = await admin.from('thread_participants').upsert(rows, { onConflict: 'thread_id,user_id' });
        if (error) return json({ error: error.message }, 500);
        const { data: profs } = await admin.from('profiles').select('user_id,first_name,last_name').in('user_id', ids);
        const names = ids.map(id => displayName(profs?.find(p => p.user_id === id))).join(', ');
        await postSystem(body.thread_id, `${myName} added ${names}.`);
        return json({ ok: true });
      }

      case 'remove': {
        const isAdmin = await callerIsAdmin(admin, body.thread_id, meId);
        if (!isAdmin) return json({ error: 'Only group admins can remove members' }, 403);
        if (body.user_id === meId) return json({ error: 'Use leave to remove yourself' }, 400);
        const { data: prof } = await admin.from('profiles').select('first_name,last_name').eq('user_id', body.user_id).maybeSingle();
        const { error } = await admin.from('thread_participants')
          .delete().eq('thread_id', body.thread_id).eq('user_id', body.user_id);
        if (error) return json({ error: error.message }, 500);
        await postSystem(body.thread_id, `${myName} removed ${displayName(prof)}.`);
        return json({ ok: true });
      }

      case 'leave': {
        // Only staff can self-leave
        if (!iAmStaff) return json({ error: 'Drivers cannot leave a group; ask staff to remove you' }, 403);
        const { error } = await admin.from('thread_participants')
          .delete().eq('thread_id', body.thread_id).eq('user_id', meId);
        if (error) return json({ error: error.message }, 500);
        await postSystem(body.thread_id, `${myName} left the group.`);
        return json({ ok: true });
      }

      default:
        return json({ error: 'unknown action' }, 400);
    }
  } catch (err) {
    console.error('[manage-group-thread] error', err);
    return json({ error: String(err) }, 500);
  }
});

async function callerIsAdmin(admin: ReturnType<typeof createClient>, threadId: string, userId: string): Promise<boolean> {
  const { data: thread } = await admin.from('message_threads').select('created_by').eq('id', threadId).maybeSingle();
  if (thread?.created_by === userId) return true;
  const { data: tp } = await admin.from('thread_participants').select('role_in_thread').eq('thread_id', threadId).eq('user_id', userId).maybeSingle();
  return tp?.role_in_thread === 'admin';
}

function linkFor(myRoles: Set<string>, _recipientId: string): string {
  // Best-effort deep link — recipient-side portal is decided in-app; default to operator inbox.
  // (We could look up recipient roles for finer routing but it's not required here.)
  return '/operator?tab=messages';
}

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}