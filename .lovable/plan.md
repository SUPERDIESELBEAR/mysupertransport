## Correction accepted — the latch records the outcome, not the attempt

You're right: latching outside the isolated block trades an infinite abort for a silent permanent loss, on a notification the driver needs to sign. Revised shape for `notify_driver_equipment_sheet_ready`:

```text
BEGIN                                  -- isolated delivery
  INSERT INTO public.notifications (... priority 'action' ...);
  v_delivered := true;
EXCEPTION WHEN OTHERS THEN
  v_delivered := false;
  v_err := SQLSTATE || ' ' || SQLERRM;
END;

NEW.equipment_asset_sheet_ready_notified_at := now();   -- unconditional: never re-arms

IF NOT v_delivered THEN
  INSERT INTO public.audit_log (action, entity_type, entity_id, entity_label, metadata)
  VALUES ('notification_delivery_failed', 'operator', NEW.operator_id, <driver name>,
          jsonb_build_object('notification_type','onboarding_update',
                             'subject','equipment_asset_sheet_ready',
                             'error', v_err, 'owed_at', now()));
  BEGIN                                -- best-effort staff bell, nested and non-fatal
    INSERT INTO public.notifications (user_id, type, title, body, link, priority)
    SELECT ur.user_id, 'system_delivery_failure', 'A driver notification could not be delivered',
           <driver name> || ' was not told their Equipment Asset Sheet is ready to sign.',
           '/management?view=drivers&op=' || NEW.operator_id, 'action'
    FROM public.user_roles ur WHERE ur.role IN ('management','owner');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END IF;
```

Rationale for the two sinks: `audit_log` is the durable one — the failing path is a `notifications` insert, so `notifications` cannot be the only record of its own failure, and `RAISE WARNING` is invisible under ten-minute log retention. The staff bell is the surface a human actually watches, so it is attempted too, nested so its own failure cannot cascade. `system_delivery_failure` is registered in `src/lib/notifications/taxonomy.ts` as `tier: 'action'` before the migration writes it, or it renders as an untitled FYI and misses the Action tab.

Net state on failure: coordinator's save commits, trigger never re-arms, and two records exist saying the notification was owed and lost, one of them in front of a person.

This is the same rule for `raise_eld_sync_alert` and `notify_rods_correction_request`: isolated delivery, outcome recorded to `audit_log` on failure, best-effort management bell. It matches the fallback chosen for the unattributed sync alert — Management's bell with no driver name — with `audit_log` underneath it for the case where the bell itself is what broke.

**`record_rods_unlock` gets the same treatment.** It already isolates, but its `EXCEPTION` branch only warns, so it has the identical silent-loss shape and just hasn't hit it (0 unlock events). It stops being purely "the pattern" and gets the audit sink added.

## 20c2b36f is notified as part of the migration

Agreed — the whole failure is that the touch may not come. That driver has been fully verified since 22 July with no prompt. After the function is corrected, the same migration backfills:

- Insert the "Equipment Asset Sheet ready to sign" notification for `20c2b36f`'s user, priority `action`, link `/operator/my-truck?focus=equipment-sheet`.
- Set `equipment_asset_sheet_ready_notified_at = now()` on that row so the corrected trigger won't duplicate it.
- Scope: exactly the rows that are all-verified, have something assigned, are unsigned, and have a null latch. That is one row today; the statement is written as a set so if a second reaches the state between now and apply, it is covered.
- The three partly-verified drivers are left alone — they are not owed anything yet, and the fixed trigger will notify them when their set completes.

## Everything else as approved

**Guard.** Positional parser over `INSERT INTO public.notifications`, swept across all 16 notification-inserting functions and the edge functions. Eight checked-in fixtures: the four real pre-fix bodies (`record_rods_unlock`, `notify_rods_correction_request`, `raise_eld_sync_alert`, `notify_driver_equipment_sheet_ready`), and four adversarial synthetics — nested `CASE`, a function call with commas, a comma inside a quoted literal with an escaped quote, and a combined `INSERT ... SELECT` with `priority` mid-list — each present in an illegal and a legal variant. Meta-assertion: the parser must report an extracted priority ordinal for all eight; zero extractions fails rather than passes, which is what turned the embed rule into a clean-reporting no-op.

**Migration** also carries the approved sync-alert work: explicit `null` as the orphan marker with `''` an error, `raised_by` recording `auth.uid()`, a separate coalesce bucket for unattributed alerts, `is_own_rods_operator` skipped only when the operator is null, `eld_sync_alerts.operator_id` made nullable.

**Verification probe**, in a rolled-back transaction: fire the trigger on a verified row, confirm the UPDATE commits, the latch sets, and the driver notification exists at `action`; then force the delivery to fail and confirm the UPDATE still commits, the latch still sets, and an `audit_log` row plus a management bell row both exist.

**Tests.** The eight fixtures; `sync-payload-operator-id` (`''` rejected, `null` accepted); `emptyEventSet` inverted to expect an unattributed alert with `operator_id: null`; bell tests for an unattributed sync alert and for `system_delivery_failure`, both rendering in Action.

## For whoever runs onboarding

No coordinator work was lost. The trigger was created 2026-07-23 16:41; every completed verification predates it, the latest by twenty minutes. But the "ready to sign" notification has never reached a driver since the feature shipped, and operator `20c2b36f` has been waiting since 22 July — that one is sent by this migration.
