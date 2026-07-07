## Findings

The ICA banners live in `src/pages/operator/OperatorPortal.tsx` (~lines 1356–1410), in a shared header region rendered above every view. They're only gated on `view !== 'ica'`, which is why the "ICA Agreement Signed" (green) and "Action Required — Sign Your ICA" (gold) banners appear on FAQ, Messages, Binder, Doc Hub, etc.

The "Documents Requested" banner (~line 1412) sits in the exact same region with the same pattern — currently gated only on `view !== 'documents'`, so it also leaks onto FAQ/Messages/Binder/etc.

## Answers to your questions

1. **Global or per-page?** Global — rendered once in the OperatorPortal shell above the view switcher, gated only against the destination view.
2. **Dismissible signed banner?** Technically easy (localStorage flag keyed by contract id, or a `dismissed_at` column on `ica_driver_acknowledgments`/`ica_contracts`). But once we scope it to Status only, it becomes a small, appropriate piece of the onboarding summary and doesn't need to be dismissible. **Recommend: skip dismiss for now** — revisit only if drivers complain after scoping.
3. **Other leaky banners?** Yes — the **"Documents Requested"** banner directly below has the same bug and should be scoped to Status too. The **"Action Required — Sign Your ICA"** (gold) banner has the same shape; scoping it to Status keeps behavior consistent (drivers still see it on the Status landing when they open the app, and the bottom-nav Status tab is the natural home).

## Recommendation

Scope all three shell banners (ICA signed, ICA action-required, Documents requested) to the Status view only.

## Plan

Edit `src/pages/operator/OperatorPortal.tsx`:

- **~line 1357** — ICA action-required banner: change gate from `view !== 'ica'` to `view === 'status'`.
- **~line 1385** — ICA signed banner: change gate from `view !== 'ica'` to `view === 'status'`.
- **~line 1427** — Documents-requested banner: change gate from `view !== 'documents'` to `view === 'status'`.

No other files change. No business logic, data, or dismiss state added.

## Verification

1. Sign in as a driver with a signed ICA → Status tab shows green banner; FAQ / Messages / Binder / Doc Hub / ICA views show none.
2. Sign in as a driver with an unsigned ICA → Status shows gold "Action Required" banner; other tabs clean; ICA tab clean.
3. Driver with outstanding requested docs → banner visible only on Status; Doc Hub and others clean.
