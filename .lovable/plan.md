## Problem

In the Driver Hub roster, the **Compliance** column renders two pills (CDL + Med Cert) inside a `flex-wrap` container. Each pill is sized to its own content, healthy items use a borderless plain-text style while expired/critical/warning items use filled badges, and the "No Date" variant uses yet another style. The result:

- Pills wrap unpredictably and shift width row-to-row
- Healthy vs. at-risk drivers look like different components
- Icon usage is inconsistent (only the "No Date" state has an icon)
- The column reads as cluttered and non-scannable

## Proposed fix (visual only — `src/components/drivers/DriverRoster.tsx`)

Refactor `expiryPill` and the column wrapper so every row renders the **same shape**: a fixed-width status chip with a label, a colored status dot, and the days/status text. This gives the column a uniform two-row stack that aligns vertically across all drivers.

### 1. Column wrapper (line ~1200)
Change from `flex flex-wrap gap-1 items-center` to a vertical stack:

```tsx
<div className="flex flex-col gap-1 min-w-[140px]" onClick={e => e.stopPropagation()}>
  {expiryPill(driver.cdl_expiration, 'CDL')}
  {expiryPill(driver.medical_cert_expiration, 'Med Cert')}
  {showReminderBadge && (<span className="xl:hidden pt-0.5">…</span>)}
</div>
```

A `min-w-[140px]` on the cell content keeps chip widths consistent.

### 2. Unified chip (replace all 4 `expiryPill` return branches)

One single chip component, color-driven by status tier:

```text
┌──────────────────────────┐
│ ● CDL        42d         │   ← healthy (green dot, muted text)
│ ● Med Cert   12d         │   ← warning (amber dot, amber text)
│ ● CDL        Expired     │   ← expired (red dot, red text + bg)
│ ○ Med Cert   No date     │   ← missing  (gray dot, dashed border)
└──────────────────────────┘
```

Implementation outline:

```tsx
const tier = !dateStr ? 'missing'
  : days < 0 ? 'expired'
  : days <= 7 ? 'critical'
  : days <= 30 ? 'warning'
  : 'ok';

const styles = {
  ok:       'bg-muted/40 border-border text-foreground',
  warning:  'bg-[hsl(var(--status-action))]/10 border-[hsl(var(--status-action))]/30 text-[hsl(var(--status-action))]',
  critical: 'bg-destructive/10 border-destructive/30 text-destructive',
  expired:  'bg-destructive/10 border-destructive/40 text-destructive font-semibold',
  missing:  'bg-muted border-dashed border-border text-muted-foreground',
}[tier];

<span className={`inline-flex items-center gap-2 text-xs rounded-md border px-2 py-1 whitespace-nowrap ${styles}`}>
  <span className={`h-1.5 w-1.5 rounded-full ${dotColor[tier]} shrink-0`} />
  <span className="font-medium w-14 shrink-0">{label}</span>
  <span className="ml-auto tabular-nums">{text}</span>
</span>
```

Key details:
- Fixed label width (`w-14`) so "CDL" and "Med Cert" align vertically
- `ml-auto` + `tabular-nums` right-aligns the days text, so all rows line up
- `whitespace-nowrap` prevents the chip wrapping inside itself
- Same border + padding + rounding across all tiers — only color changes
- Tooltip still shows the full formatted date (`MM/dd/yyyy`)

### 3. Header alignment
No header change needed (still "Compliance"), but the column already has `hidden lg:table-cell` so behavior at smaller breakpoints is preserved.

## Scope guardrails

- No logic, filtering, sorting, or data changes
- No changes to other columns or to dispatch mode
- Only touches `expiryPill` and the wrapper `<div>` at line ~1200 in `DriverRoster.tsx`

## Verification

Reload `/dashboard?view=drivers`, confirm:
- CDL and Med Cert chips stack vertically and align across rows
- Labels line up, days/status right-align, tier colors are consistent
- Tooltip on each chip still shows the exact expiration date
