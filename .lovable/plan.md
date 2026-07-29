## Skip the intermediate PDF popup

**Where it lives:** `src/components/inspection/DocRow.tsx` — the `FilePreviewModal` renders a "Tap below to open or share this PDF" card whenever the file is a PDF on mobile (the `showMobilePdfFallback` branch, lines ~719–753). Company Documents route through the same modal, so tapping Open shows this card before the PDF actually opens.

**Fix:** Remove the intermediate card so the first tap opens the PDF directly.

1. In `DocRow.tsx`, when `showMobilePdfFallback` becomes true (mobile + PDF + blob ready), auto-invoke `window.open(resolvedUrl, '_blank', 'noopener,noreferrer')` via a `useEffect` and immediately call `onClose()` to dismiss the preview modal.
2. Guard the effect with a `useRef` so it fires only once per opened document (prevents re-opening if state re-renders).
3. Keep the fallback JSX as a graceful backup in case the popup is blocked, but it will normally never render because the modal closes as soon as the tab opens.
4. Desktop PDF rendering (iframe) and image previews (fit-to-screen) are unchanged.

**Result:** Tapping Open on a Company Document PDF opens the PDF immediately in the device's native viewer with no intermediate "Open PDF / Share / Save" card.