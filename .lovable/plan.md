
## Profile Photo Upload — Staff & Operators

### What we're building
A photo upload feature so every user (staff and operators alike) can add a headshot. Staff photos surface in the sidebar and Staff Directory; operators see their dispatcher's photo on the Dispatch Status page.

### Database change
Add `avatar_url text` (nullable) to the `profiles` table via migration.

### Storage
Create a new public `avatars` storage bucket with an RLS policy allowing authenticated users to upload/update their own file and anyone to read (public).

### File path convention
`avatars/<user_id>.jpg` — overwriting on each new upload keeps it simple with no orphan files.

### Where photos appear

| Surface | Who sees it | Photo shown |
|---|---|---|
| Staff sidebar footer (StaffLayout) | Staff/Management themselves | Their own photo |
| Staff Directory (StaffDirectory.tsx) | Management | Each staff member's photo |
| Operator Dispatch Status card | Operators | Assigned dispatcher's photo |
| Dispatch Portal driver rows | Dispatchers | Operator's photo (unit avatar) |
| Operator Portal header | Operators | Their own photo |

### Upload surfaces

**Staff/Management** — in `EditProfileModal`, add a circular avatar picker at the top with a camera-icon overlay. Clicking it opens a hidden file input, uploads to `avatars/<user_id>.jpg`, updates `profiles.avatar_url`, and refreshes the auth context.

**Operators** — same `EditProfileModal` (already used in `OperatorPortal` with `variant='dark'`), so both user types get the upload in the same modal.

**Management editing a staff member** — in `StaffDirectory`'s "Manage Access" panel, add a small avatar with an upload button so management can also set/clear a staff member's photo if needed.

### Changes — file by file

1. **Migration** — `ALTER TABLE public.profiles ADD COLUMN avatar_url text;`

2. **Storage bucket SQL** — create `avatars` bucket (public), add RLS policies: authenticated users can INSERT/UPDATE their own file; public SELECT.

3. **`src/hooks/useAuth.tsx`** — add `avatar_url` to the `ProfileData` interface and the `fetchProfile` select query so it's available everywhere via context.

4. **`src/components/EditProfileModal.tsx`** — add an avatar upload row at the top of the form:
   - Circular image (shows photo or initials fallback)
   - Camera icon overlay on hover
   - Hidden `<input type="file" accept="image/*">` 
   - On select: validate ≤5 MB + image type, upload to storage, update `profiles.avatar_url`, call `refreshProfile()`
   - Works for both `default` and `dark` variants

5. **`src/components/layouts/StaffLayout.tsx`** — replace the initials circle in the sidebar footer with an `<img>` (avatar_url) or initials fallback. Also update the collapsed icon state.

6. **`src/components/management/StaffDirectory.tsx`** — add `avatar_url` to the `StaffMember` interface and the fetch query; render a small avatar circle next to each staff row name; add an upload button in the Manage Access expand panel.

7. **`src/components/operator/OperatorDispatchStatus.tsx`** — update `fetchDispatcherInfo` to also select `avatar_url`; replace the initials `dispatcherInitial` circle with a photo-or-initials avatar.

8. **`src/pages/dispatch/DispatchPortal.tsx`** — add `avatar_url` to `DispatchRow` and the query; show operator avatar in the driver card/row.

9. **`src/pages/operator/OperatorPortal.tsx`** — show the operator's own avatar in the profile header area (the user pill / top area of the portal).

### Technical notes
- Max upload size: 5 MB, accepted types: `image/jpeg`, `image/png`, `image/webp`
- Use `upsert: true` on storage upload so re-uploads overwrite without error
- Append `?t=<timestamp>` cache-buster to the avatar URL after upload so the browser shows the new image immediately
- No new edge functions needed — all uploads are direct from the browser to storage
- `avatar_url` stored as full public URL (not a path) for simplicity
