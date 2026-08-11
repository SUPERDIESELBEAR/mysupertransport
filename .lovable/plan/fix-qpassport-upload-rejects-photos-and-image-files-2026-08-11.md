# Fix: QPassport upload rejects photos and image files

## What's happening

It's not a permissions or connection bug — the Stage 6 "Upload QPassport" button is the only uploader in the app hard-locked to PDF files. The file picker filters to `.pdf` only, so photos, screenshots, and scans show greyed out and can't be selected. Even if a non-PDF got through, a second check would reject it with a "PDF only" message.

Every other uploader in the app accepts images and PDFs, which is why this one feels broken.

Good news: the driver-side viewer and the download link already handle images (PNG, JPG, WEBP, GIF) correctly, so accepting images here needs no downstream changes.

## The fix

1. Let the uploader accept the same file types as everywhere else: PDF, JPG, PNG, WEBP — keeping the 10 MB limit.
2. Preserve the real file extension when saving (today it always saves as `.pdf` regardless of the file), and send the correct content type so the file opens properly for the driver.
3. On phones and tablets, add a "Take Photo" option alongside "Choose File", matching the applicant document uploader.
4. Update the label from "QPassport PDF" to "QPassport" with a hint listing accepted types, and replace the "PDF only" error with the shared file-validation message.
5. Keep everything else identical: same storage location, the automatic move of PE Screening to "Scheduled" on first upload, and the driver notification.

## Technical notes

- File: `src/pages/staff/OperatorDetailPanel.tsx`, `QPassportUploader` component (~lines 236–331).
- Swap the ad-hoc PDF check for `validateFile` from `src/lib/validateFile.ts` (the shared type/size validator used by the other uploaders).
- Build the storage path with the file's actual extension instead of a hardcoded `.pdf`, and pass `contentType: file.type` to `uploadToBucket`.
- Add a camera-capture input gated on `matchMedia('(pointer: coarse)')`, same pattern as `Step7Documents.tsx`.
- No database, storage-policy, or edge-function changes: `download-qpassport` already maps image extensions to the right content type, and `QPassportView` falls back to PDF rendering only for non-image files.