
## Remove Extra Signature Line Above Date

The current signature block (lines 100–134) has this layout:

```text
[ Signature image/line ]   [ Date ]
[ Name (Please Print) ]              ← this is BELOW date
```

But there is also an applicant info box at the top (lines 39–54) which already shows the signed date. Looking at the signature block, the structure is:

- Row 1: Signature (flex: 2) + Date (flex: 1) — side by side
- Row 2: Name (Please Print) — below, spanning full width

The user says there is "an extra signature line above the date section." Looking at the layout, the Signature field and Date field are on the same row (flex row, `alignItems: 'flex-end'`). There's no explicit second signature line above the date — but the blank `<div style={{ borderBottom: '1px solid #000', height: '50px' }} />` at line 116 (the empty signature placeholder when there's no signature image) could be perceived as an extra line.

More likely, the user sees the printed document and the "Signature" line and "Date" are stacked in a way that looks like there are two lines before the Date. The document needs to be looked at more carefully.

Looking at the structure again:
- Lines 101-127: A flex row with [Signature (flex:2)] and [Date (flex:1)]
- Lines 128-133: Name (Please Print) row below

The "extra signature line above the date section" most likely refers to the **Signature** field that appears in the same flex row as Date — when the document is printed on letter paper, the Signature + Date flex row appears, and the user sees the signature blank line as an "extra" line above the date. 

Actually re-reading the user's request: "remove the extra signature line **above the date section**". The date section is likely the full row (Signature + Date). So there might be something above that row.

Looking again at the file: the signature block starts at line 100 with `marginTop: '0.4in'`. Before that is the Authorization section (lines 78-97). There's nothing explicitly "above" the date section that looks like an extra signature line in the code.

Wait — looking at the applicant info box at lines 39-54, it has "Signed Date" field in the top info block. Then at the bottom there's also a Date field in the signature block. These two date fields might be what's confusing — but that's not a signature line.

Most likely interpretation: The **signature line** (the blank line/image) appears **in the same row** as the date, but the user sees the layout as having the signature line appearing above where the date sits (since signature flex:2 and date flex:1 are side by side but the signature is taller). The user wants the signature section removed from this row — keeping only the Date and Name (Please Print) fields.

OR — looking at this from the actual printed view perspective, the flex row shows:
1. Signature block (left, large)
2. Date (right, smaller)

The "extra signature line above the date section" = the signature line itself that sits visually above/beside the date. The user wants to remove the **Signature** row entirely, leaving only:
- Date
- Name (Please Print)

This makes the most sense since the applicant's name and signed date are already captured in the info box at the top, and the Step 9 of the application already captures the actual signature.

**Plan**: Remove the Signature image/blank line from the signature block (lines 101-120), keeping only the Date and Name (Please Print) fields. Restructure the bottom signature block to show Date and Name side by side or stacked without the signature drawing line.

Actually, let me reconsider. The user said "the extra signature line **above the date section**." If Signature and Date are side by side in a flex row, neither is "above" the other. So maybe the layout renders them stacked on the printed page — or the user is describing it differently.

The simplest and clearest interpretation: remove the Signature line/image element from the signature block, keeping Date and Name (Please Print). This removes what appears as an extra line before the date.

**Change**: In `PreEmploymentAuthorizationsDoc.tsx`, remove the entire Signature block (lines 101-120) from the flex row, and adjust the remaining Date and Name fields accordingly.
