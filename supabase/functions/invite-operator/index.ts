import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user: callerUser }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !callerUser) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: roleCheck } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', callerUser.id)
      .in('role', ['management', 'onboarding_staff'])
      .limit(1);

    if (!roleCheck || roleCheck.length === 0) {
      return new Response(JSON.stringify({ error: 'Forbidden: insufficient role' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { application_id, reviewer_notes, skip_invite } = await req.json();
    if (!application_id) {
      return new Response(JSON.stringify({ error: 'application_id is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: app, error: appError } = await supabaseAdmin
      .from('applications')
      .select('*')
      .eq('id', application_id)
      .single();

    if (appError || !app) {
      return new Response(JSON.stringify({ error: 'Application not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (app.review_status !== 'pending' && app.review_status !== 'approved') {
      return new Response(JSON.stringify({ error: 'Application is not in pending or approved status' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update application to approved
    const { error: updateAppError } = await supabaseAdmin
      .from('applications')
      .update({
        review_status: 'approved',
        reviewed_at: new Date().toISOString(),
        reviewed_by: callerUser.id,
        reviewer_notes: reviewer_notes ?? null,
        is_draft: false,
      })
      .eq('id', application_id);

    if (updateAppError) {
      return new Response(JSON.stringify({ error: updateAppError.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create or find the auth user
    let invitedUserId: string | null = null;

    if (skip_invite) {
      // For pre-existing operators: check if auth user exists, create without invite if not
      const { data: { users } } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
      const existing = users?.find(u => u.email === app.email);
      if (existing) {
        invitedUserId = existing.id;
      } else {
        // Create user with a random password (they can reset later)
        const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
          email: app.email,
          email_confirm: true,
          user_metadata: {
            first_name: app.first_name ?? '',
            last_name: app.last_name ?? '',
            invited_as: 'operator',
          },
        });
        if (createErr) console.error('Create user error:', createErr.message);
        if (newUser?.user) invitedUserId = newUser.user.id;
      }
    } else {
      // Standard flow: send Supabase auth invite email
      const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
        app.email,
        {
          data: {
            first_name: app.first_name ?? '',
            last_name: app.last_name ?? '',
            invited_as: 'operator',
          },
          redirectTo: `${Deno.env.get('APP_URL') ?? 'https://mysupertransport.lovable.app'}/welcome`,
        }
      );

      if (inviteError) {
        console.error('Invite error (may already exist):', inviteError.message);
      }

      if (inviteData?.user) {
        invitedUserId = inviteData.user.id;
      } else {
        const { data: { users } } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
        const existing = users?.find(u => u.email === app.email);
        if (existing) invitedUserId = existing.id;
      }
    }

    if (!invitedUserId) {
      return new Response(JSON.stringify({ error: 'Could not resolve user id for invite' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    await supabaseAdmin.from('applications').update({ user_id: invitedUserId }).eq('id', application_id);
    await supabaseAdmin.from('user_roles').upsert({ user_id: invitedUserId, role: 'operator' }, { onConflict: 'user_id,role' });

    // Sync profile name from the (normalized) application so they stay consistent
    if (app.first_name || app.last_name) {
      await supabaseAdmin.from('profiles').update({
        first_name: app.first_name ?? null,
        last_name: app.last_name ?? null,
      }).eq('user_id', invitedUserId);
    }

    const { data: existingOp } = await supabaseAdmin.from('operators').select('id').eq('user_id', invitedUserId).maybeSingle();

    let operatorId: string | null = existingOp?.id ?? null;

    if (!existingOp) {
      const { data: newOp, error: opError } = await supabaseAdmin
        .from('operators')
        .insert({
          user_id: invitedUserId,
          application_id: application_id,
          assigned_onboarding_staff: callerUser.id,
        })
        .select('id')
        .single();

      if (opError) {
        console.error('Operator create error:', opError.message);
      } else if (newOp) {
        operatorId = newOp.id;

        if (skip_invite) {
          const today = new Date().toISOString().split('T')[0];
          // Pre-existing operator: mark all 8 stages complete atomically
          await supabaseAdmin.from('onboarding_status').insert({
            operator_id: newOp.id,
            // Stage 1 — Background
            mvr_status: 'received',
            ch_status: 'received',
            mvr_ch_approval: 'approved',
            pe_screening: 'results_in',
            pe_screening_result: 'clear',
            // Stage 2 — Documents
            form_2290: 'received',
            truck_title: 'received',
            truck_photos: 'received',
            truck_inspection: 'received',
            // Stage 3 — ICA
            ica_status: 'complete',
            // Stage 4 — MO Registration
            mo_docs_submitted: 'submitted',
            mo_reg_received: 'yes',
            // Stage 5 — Equipment
            decal_applied: 'yes',
            eld_installed: 'yes',
            fuel_card_issued: 'yes',
            // Stage 6 — Insurance (triggers fully_onboarded)
            insurance_added_date: today,
            // Stage 7 — Go Live
            go_live_date: today,
          });
          // Create active_dispatch row server-side
          await supabaseAdmin.from('active_dispatch').insert({
            operator_id: newOp.id,
            dispatch_status: 'not_dispatched',
            updated_by: callerUser.id,
          });
        } else {
          // Carry forward background verification statuses from application
          const onboardingInsert: Record<string, unknown> = { operator_id: newOp.id };
          if (app.mvr_status) onboardingInsert.mvr_status = app.mvr_status;
          if (app.ch_status) onboardingInsert.ch_status = app.ch_status;
          if (app.mvr_status === 'received' && app.ch_status === 'received') {
            onboardingInsert.mvr_ch_approval = 'approved';
          }
          await supabaseAdmin.from('onboarding_status').insert(onboardingInsert);
        }
      }
    }

    // ── Auto-sync application docs to Inspection Binder ──
    // Resolve bare storage paths (from application-documents bucket) to long-lived
    // signed URLs so they actually load in the Flipbook / preview.
    const FIVE_YEARS_SECS = 60 * 60 * 24 * 365 * 5;
    async function signAppDoc(rawPath: string | null): Promise<{ url: string | null; path: string | null }> {
      if (!rawPath) return { url: null, path: null };
      // Already a full URL — leave it as-is.
      if (rawPath.startsWith('http://') || rawPath.startsWith('https://')) {
        return { url: rawPath, path: null };
      }
      const { data, error } = await supabaseAdmin.storage
        .from('application-documents')
        .createSignedUrl(rawPath, FIVE_YEARS_SECS);
      if (error || !data?.signedUrl) {
        console.error('signAppDoc error for path', rawPath, error?.message);
        return { url: null, path: rawPath };
      }
      return { url: data.signedUrl, path: rawPath };
    }

    if (operatorId && invitedUserId) {
      const docRows: Array<{
        name: string;
        scope: 'per_driver';
        driver_id: string;
        file_url: string;
        file_path: string | null;
        uploaded_by: string;
        expires_at: string | null;
      }> = [];

      if (app.dl_front_url) {
        const { url, path } = await signAppDoc(app.dl_front_url);
        if (url) {
          docRows.push({
            name: 'CDL (Front)',
            scope: 'per_driver',
            driver_id: invitedUserId,
            file_url: url,
            file_path: path,
            uploaded_by: callerUser.id,
            expires_at: app.cdl_expiration ?? null,
          });
        }
      }
      if (app.dl_rear_url) {
        const { url, path } = await signAppDoc(app.dl_rear_url);
        if (url) {
          docRows.push({
            name: 'CDL (Back)',
            scope: 'per_driver',
            driver_id: invitedUserId,
            file_url: url,
            file_path: path,
            uploaded_by: callerUser.id,
            expires_at: app.cdl_expiration ?? null,
          });
        }
      }
      if (app.medical_cert_url) {
        const { url, path } = await signAppDoc(app.medical_cert_url);
        if (url) {
          docRows.push({
            name: 'Medical Certificate',
            scope: 'per_driver',
            driver_id: invitedUserId,
            file_url: url,
            file_path: path,
            uploaded_by: callerUser.id,
            expires_at: app.medical_cert_expiration ?? null,
          });
        }
      }

      if (docRows.length > 0) {
        await supabaseAdmin.from('inspection_documents').insert(docRows);
      }
    }

    // ── Resolve actor name & applicant name (shared by audit + notifs) ──
    const callerProfile = await supabaseAdmin
      .from('profiles')
      .select('first_name, last_name')
      .eq('user_id', callerUser.id)
      .maybeSingle();
    const actorName = callerProfile.data
      ? `${callerProfile.data.first_name ?? ''} ${callerProfile.data.last_name ?? ''}`.trim() || callerUser.email
      : callerUser.email;
    const applicantName = `${app.first_name ?? ''} ${app.last_name ?? ''}`.trim() || app.email;

    // ── In-app notifications & approval email (skip for pre-existing) ──
    if (!skip_invite) {
      const { data: mgmtRoles } = await supabaseAdmin
        .from('user_roles')
        .select('user_id')
        .eq('role', 'management');

      if (mgmtRoles && mgmtRoles.length > 0 && operatorId) {
        const notifLink = `/staff?operator=${operatorId}`;
        const { data: optedOut } = await supabaseAdmin
          .from('notification_preferences')
          .select('user_id')
          .in('user_id', mgmtRoles.map(r => r.user_id))
          .eq('event_type', 'application_approved')
          .eq('in_app_enabled', false);
        const optedOutIds = new Set((optedOut ?? []).map(r => r.user_id));

        const notifRows = mgmtRoles
          .filter(({ user_id }) => !optedOutIds.has(user_id))
          .map(({ user_id }) => ({
            user_id,
            title: 'Application Approved',
            body: `${applicantName} has been approved and invited as an Operator.`,
            type: 'application_approved',
            channel: 'in_app' as const,
            link: notifLink,
          }));
        if (notifRows.length > 0) {
          supabaseAdmin.from('notifications').insert(notifRows)
            .then(({ error }) => { if (error) console.error('Mgmt notification error:', error.message); });
        }
      }

      // Fire approval notification email (fire-and-forget)
      const notifUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-notification`;
      fetch(notifUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
        body: JSON.stringify({
          type: 'application_approved',
          applicant_name: applicantName,
          applicant_email: app.email,
          reviewer_notes: reviewer_notes ?? null,
        }),
      }).catch(e => console.error('Notification fire-and-forget error:', e));

      // NOTE: We intentionally do NOT fire `notify-pwa-install` on first invite anymore.
      // The invite email itself includes install instructions, and the /welcome page
      // walks the new operator through installation right after they set their password.
      // Sending two emails caused applicants to install before authenticating, leading
      // to blank-page / no-session confusion. `notify-pwa-install` remains available for
      // bulk re-engagement of existing operators (called from staff tools).
    }

    return new Response(JSON.stringify({ success: true, user_id: invitedUserId }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Unexpected error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
