## Move the Cards/Table toggle next to the search row

Single-file change in `src/pages/dispatch/DispatchPortal.tsx`.

### 1. Remove the toggle from the top header (lines ~1221-1241)
Delete the `<div className="flex items-center bg-muted rounded-lg p-0.5 border border-border">…</div>` block that holds the Cards/Table buttons. Leave the Refresh button in place — it remains a page-level action in the header.

### 2. Add the toggle to the filter/search row (line ~1485, just before the closing `</div>`)
Insert the same toggle markup immediately after the search input, inside the existing `flex flex-col sm:flex-row` row:

```tsx
{/* View toggle — kept next to search so list controls live together */}
<div className="flex items-center bg-muted rounded-lg p-0.5 border border-border shrink-0 self-start sm:self-auto">
  <button
    onClick={() => setViewMode('cards')}
    className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
      viewMode === 'cards' ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
    }`}
  >
    <LayoutGrid className="h-3.5 w-3.5" />
    <span className="hidden sm:inline">Cards</span>
  </button>
  <button
    onClick={() => setViewMode('table')}
    className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
      viewMode === 'table' ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
    }`}
  >
    <List className="h-3.5 w-3.5" />
    <span className="hidden sm:inline">Table</span>
  </button>
</div>
```

Slight padding reduction (`py-1` instead of `py-1.5`) so its height matches the h-8 search input and dispatcher Select on the same row.

### Result

- Top-right header keeps Sound + fleet-unlogged badge + Refresh.
- Filter tabs → Dispatcher select → Search → **View toggle** all sit on one row, mirroring the Driver Hub / Compliance pattern.
- All state, behavior, URL sync (`mode=` param) unchanged — only the JSX location changes.

### Scope

- Visual relocation only. No logic, state, or imports change (LayoutGrid/List icons already imported).
- No other pages touched. When you're ready to add this to more pages, the row will be the consistent home.
