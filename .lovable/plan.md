## Remove the Ball in Court feature

### Files to delete
- `src/components/staff/BallInCourtBadge.tsx`
- `src/components/operator/BallInCourtBanner.tsx`

### Code changes
- `src/pages/staff/PipelineDashboard.tsx` — remove `BallInCourtBadge` import, the `ball_in_court*` fields from the data fetch/select, and every render of the badge in the pipeline table, card view, and On-Hold list.
- `src/components/operator/OperatorStatusPage.tsx` — remove `BallInCourtBanner` import and its render at the top of the onboarding checklist.

### Database migration
Drop the three columns added for this feature from `public.onboarding_status`:
- `ball_in_court`
- `ball_in_court_updated_at`
- `ball_in_court_updated_by`

Also drop the `ball_in_court` enum type if one was created for it.

### Verification
- TypeScript build passes after `supabase/integrations/supabase/types.ts` regenerates.
- Pipeline view (table, cards, On-Hold) renders with no badge and no console errors.
- Driver portal status page shows no banner.

### Then
After this is approved and merged, I'll resume the original plan to fix the broken gold email CTA buttons.
