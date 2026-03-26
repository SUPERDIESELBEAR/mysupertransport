
## Add "View" + "Download" buttons for QPassport

### What changes

**Only `src/components/operator/PEScreeningTimeline.tsx`**

The QPassport step currently renders a single gold "Download QPassport" anchor. Replace it with two side-by-side buttons:
- **"View QPassport"** — opens the existing `FilePreviewModal` (in-app, full-screen, blob-based viewer with zoom/print/download) 
- **"Download"** — direct `<a href download>` link, same as the current button

The `FilePreviewModal` is already exported from `src/components/inspection/DocRow.tsx` and used throughout the app (InspectionBinderAdmin, OperatorBinderPanel, OperatorInspectionBinder). Zero new infrastructure needed.

### Implementation detail

1. Import `FilePreviewModal` from `@/components/inspection/DocRow`.
2. Add local state: `const [viewingQPassport, setViewingQPassport] = useState(false)`.
3. In Step 2's `action`, replace the single anchor with:
   ```tsx
   <div className="mt-2 flex items-center gap-2">
     {/* View button */}
     <button onClick={() => setViewingQPassport(true)} className="...gold outlined style...">
       <Eye className="h-3.5 w-3.5" /> View QPassport
     </button>
     {/* Download button */}
     <a href={qpassportUrl} download="QPassport.pdf" className="...ghost small style...">
       <Download className="h-3.5 w-3.5" /> Download
     </a>
   </div>
   ```
4. Render `FilePreviewModal` at the bottom of the component (conditionally):
   ```tsx
   {viewingQPassport && qpassportUrl && (
     <FilePreviewModal url={qpassportUrl} name="QPassport.pdf" onClose={() => setViewingQPassport(false)} />
   )}
   ```

The same two-button pattern (View + Download) should also be applied to the **OperatorStatusPage** QPassport banner that was planned but not yet built — that banner will be implemented as part of this change.

### OperatorStatusPage banner (same message)

Since the QPassport banner for `OperatorStatusPage` was approved in the previous plan but never implemented, it makes sense to build it in this same pass with the View+Download button pattern baked in from the start. No extra files needed — `OperatorStatusPage.tsx` already imports from `@/components/operator/OnboardingChecklist` so adding a `FilePreviewModal` import is straightforward.

**Files changed:** `src/components/operator/PEScreeningTimeline.tsx` and `src/components/operator/OperatorStatusPage.tsx`
