# Uploaded Documents Carousel Navigation in Application Review Drawer

## Goal
In the management application review drawer, allow staff to move from one uploaded applicant document to the next using arrow buttons inside the in-app file preview modal. Users already click **View** on each document individually; once a preview is open, they should be able to navigate to the next/previous uploaded document without closing the modal.

## Current state
- The application review drawer (`src/components/management/ApplicationReviewDrawer.tsx`) lists three fixed uploaded documents in the **Overview** tab: **Front of Driver's License**, **Rear of Driver's License**, and **Medical Certificate**.
- Each document has a **View** button that opens the existing `FilePreviewModal`.
- `FilePreviewModal` (`src/components/inspection/DocRow.tsx`) already supports carousel navigation: it accepts optional `onPrev`, `onNext`, `counter`, `index`, and `total` props, and responds to keyboard left/right arrows and mobile swipe gestures.
- The current drawer code only passes `url`, `name`, `onClose`, and `onEdit` to the modal, so the carousel arrows and counter are not rendered.

## Proposed changes

1. Build an ordered list of viewable documents inside the drawer
   - Define the three fixed slots (`dl_front_url`, `dl_rear_url`, `medical_cert_url`) with human-readable labels.
   - Filter to only the slots that have a current file path (so the carousel only includes documents that actually exist), preserving the defined order.

2. Track the active preview index
   - Replace the single `previewDoc` object with state that stores the selected index within the viewable list.
   - When a user clicks **View**, open the modal at the index of that document.

3. Pass carousel props to `FilePreviewModal`
   - Provide `onPrev` / `onNext` callbacks that update the active index (wrapping around or clamping at the ends).
   - Pass `counter` (e.g., `"1 of 3"`), `index`, and `total` so the modal renders the arrow buttons and counter in the header.
   - Keep the existing `onEdit` behavior for the currently active document.

4. Keep keyboard/swipe behavior intact
   - `FilePreviewModal` already handles left/right arrow keys and mobile swipes when `onPrev`/`onNext` are provided; no additional changes required.

5. Preserve the existing edit flow
   - When **Edit** is clicked from the modal, use the current document's key/path to open the `DocumentEditor` as before.

## Out of scope
- The **Documents** tab contains printable generated forms (FCRA, PSP, DOT questions, etc.) and does not use the file preview modal; no changes there.
- `DocumentHistoryList` shows previous versions/replacements but is not a primary carousel; no changes there.

## Files to modify
- `src/components/management/ApplicationReviewDrawer.tsx` — add the viewable list, index state, and carousel props to the `FilePreviewModal` call.

## Verification
- Open an application that has at least two of the three uploaded documents (DL front, DL rear, medical certificate).
- Click **View** on one document; the modal should show left/right arrows in the header and a counter like `"1 of 3"`.
- Use arrow buttons, keyboard left/right keys, and mobile swipe to move between documents.
- Confirm the **Edit** button still opens the editor for the active document.
