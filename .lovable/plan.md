
## What I Now Know

**Step 8 (Disclosures) contains exactly 4 sections that will become standalone PDF documents:**

1. **Fair Credit Reporting Act Authorization** — static legal text (no checkboxes, implicit acceptance via signature)
2. **Pre-Employment Authorizations** — 3 checkboxes (auth_safety_history, auth_drug_alcohol, auth_previous_employers)
3. **DOT Drug & Alcohol Pre-Employment Questions** — 2 radio questions (dot_positive_test_past_2yr, dot_return_to_duty_docs)
4. **Certificate of Receipt — Company Testing Policy** — scrollable text + 1 checkbox (testing_policy_accepted)

**Applicant workflow:** Stays embedded in Step 8 — no change to the applicant experience. Sections remain visible and required.

**PDF download:** New "Documents" tab inside the Application Review drawer (staff/management only).

**PDF generation strategy:** On-demand in the browser using a React-rendered print-to-PDF approach, or using an edge function with HTML→PDF rendering. The cleanest approach for this stack is an **edge function** that receives the application data and returns a PDF blob using `reportlab`-style HTML rendering, OR a **client-side approach** using a hidden printable React component per document.

The most pragmatic approach here — given we have no Python runtime in the client — is a **client-side approach**: for each of the 4 documents, create a React component that renders the document in print-ready HTML, then uses `window.print()` scoped to just that component (via a hidden iframe or a dedicated print stylesheet). This avoids needing a new edge function and produces a clean letter-format PDF.

---

## Plan

### 4 New Document Components
Create `src/components/application/documents/` folder with:

1. `FCRAAuthorizationDoc.tsx` — Renders the FCRA text with applicant name, signed date, and signature image
2. `PreEmploymentAuthorizationsDoc.tsx` — Renders the 3 authorization checkboxes/statements with signature
3. `DOTDrugAlcoholQuestionsDoc.tsx` — Renders the 2 DOT drug/alcohol questions with applicant answers and signature
4. `CompanyTestingPolicyCertDoc.tsx` — Renders the full company policy text + acceptance with signature

Each document component renders as a letter-format page with:
- SUPERTRANSPORT header (company name/logo text)
- Document title
- Applicant name, signed date
- Relevant content/answers
- Signature image at bottom

### PDF Print Utility
Create `src/lib/printDocument.ts` — a helper function that takes a React component, renders it into a hidden `<div>`, and triggers a scoped `window.print()` via a temporary `<style>` tag that hides everything except the target element. This is a well-established pattern for client-side PDF generation via the browser's native print-to-PDF dialog.

```typescript
// Approach: inject print CSS that only shows the target element
export function printElement(elementId: string, title: string) {
  const style = document.createElement('style');
  style.id = '__print_scope__';
  style.innerHTML = `
    @media print {
      body > *:not(#${elementId}) { display: none !important; }
      #${elementId} { display: block !important; }
    }
  `;
  document.head.appendChild(style);
  document.title = title;
  window.print();
  document.head.removeChild(style);
}
```

### New "Documents" Tab in ApplicationReviewDrawer
Add a tab strip to the drawer: **Overview** (all existing content) | **Documents** (new tab)

The Documents tab shows 4 cards:
```
┌─────────────────────────────────────────────────┐
│ 📄 FCRA Authorization              [Download PDF] │
│ 📄 Pre-Employment Authorizations   [Download PDF] │
│ 📄 DOT Drug & Alcohol Questions    [Download PDF] │
│ 📄 Certificate of Receipt          [Download PDF] │
└─────────────────────────────────────────────────┘
```

Each "Download PDF" button renders the corresponding document component into a hidden container and triggers the print dialog scoped to that document only.

### Files to create/modify
- **Create** `src/components/application/documents/FCRAAuthorizationDoc.tsx`
- **Create** `src/components/application/documents/PreEmploymentAuthorizationsDoc.tsx`
- **Create** `src/components/application/documents/DOTDrugAlcoholQuestionsDoc.tsx`
- **Create** `src/components/application/documents/CompanyTestingPolicyCertDoc.tsx`
- **Create** `src/lib/printDocument.ts`
- **Modify** `src/components/management/ApplicationReviewDrawer.tsx` — add tab navigation + Documents tab content with hidden print containers

### No database changes needed
All data already exists in the `applications` table. No new columns, no new tables, no migrations required.

### Technical Details

**Print scoping approach:**
Each document component will have a unique `id` attribute (e.g., `id="doc-fcra-print"`). Clicking "Download PDF" will:
1. Mount the doc component in a hidden off-screen `div` (already mounted, just hidden with `display:none`)
2. Toggle its visibility and apply print-only CSS
3. Call `window.print()`
4. Restore the hidden state

The document components will use `@page { size: letter; margin: 1in; }` CSS for proper letter formatting.

**Each document will render:**
- Company header (SUPERTRANSPORT, USDOT/MC numbers if available, otherwise just company name)
- Document title + date generated
- Applicant: full name, DOB if available, signed date
- Body content (the relevant section text + the applicant's answers/authorizations)
- Signature image block at bottom with typed name and date
