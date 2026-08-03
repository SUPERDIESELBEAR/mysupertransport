## Goal

1. Confirm the driver's license (front/rear) and medical card uploads work for a logged-out applicant after last turn's storage-policy fix.
2. Let applicants either pick an existing image/PDF **or** take a photo directly with the phone camera.

## Current state (verified)

- `src/components/application/Step7Documents.tsx` has one `FileUploader` per document; each renders a single hidden `<input type="file" accept="image/*,application/pdf">` with no `capture` attribute.
- On phones, `image/*` already makes the OS offer "Camera" in its picker sheet, but there is no explicit in-app "Take Photo" action, and behavior varies by browser.
- The app already uses `capture="environment"` elsewhere (`TruckPhotoGuideModal.tsx`, `EquipmentReturnCard.tsx`), so the pattern is established.

## Part 1 — Verification pass

Drive the live app with Playwright as an anonymous applicant:
- Start a new application, advance to Step 7.
- Upload a test JPG to "Front of Driver's License", a PNG to "Rear", and a PDF to "Medical Certificate".
- Assert each tile flips to the green "File uploaded successfully" state, capture screenshots, and watch console/network for any 403 / "permission denied" responses.
- Confirm the objects actually landed in the `application-documents` bucket under the draft-token folder, then remove the test objects so no junk stays behind.

Report pass/fail per document with evidence.

## Part 2 — Add direct photo capture

In `Step7Documents.tsx`, change each uploader's empty state from one tap-target into two explicit actions (drag & drop still works on desktop):

```text
┌───────────────────────────────────────┐
│   [ Take Photo ]   [ Choose File ]    │
│   JPG, PNG, or PDF · Max 10 MB        │
└───────────────────────────────────────┘
```

- **Take Photo** → hidden input with `accept="image/*"` + `capture="environment"` (rear camera).
- **Choose File** → existing hidden input with `accept="image/*,application/pdf"` (photo library, Files, scans).
- Both feed the same `handleFile` path, so validation (`validateFile`, 10 MB, type check) and the `uploadToBucket` call are unchanged.
- Show "Take Photo" only on touch/mobile devices so the desktop experience stays a single clean drop zone.
- Keep accessible labels and 44px tap targets per the existing mobile patterns.

## Technical notes

- No backend, storage-policy, or schema changes needed — Part 2 is presentation-only.
- `capture` is a hint: desktop browsers ignore it, iOS Safari and Android Chrome open the camera directly.
- Live-camera capture from a browser cannot bypass the OS camera UI without a full `getUserMedia` viewfinder; the `capture` attribute is the standard, reliable approach and is what the rest of the app uses.
