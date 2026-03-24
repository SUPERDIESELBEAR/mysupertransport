
## Add Tooltips to Collapsed Sidebar Nav Items

### What & Why
When the desktop sidebar is collapsed (w-16), nav items show only icons. There's no text hint, so users must memorize the icon mapping. Wrapping each nav `<button>` in a Tooltip that shows the item label on hover (right-side) gives instant discoverability — only when collapsed, since the label is already visible when expanded.

### What changes
**`src/components/layouts/StaffLayout.tsx`**

1. Import `Tooltip`, `TooltipContent`, `TooltipProvider`, `TooltipTrigger` from `@/components/ui/tooltip`.
2. In `sidebarContent()`, wrap the nav `<button>` for each item inside a `<Tooltip>` with `side="right"`.
   - Only render tooltip content when `!sidebarOpen && !isMobileDrawer` (i.e. collapsed desktop state).
   - When expanded or in the mobile drawer, the label is already visible — no tooltip needed.
3. Wrap the nav list in a single `<TooltipProvider delayDuration={300}>` so all tooltips share one provider.

### Behaviour
- Collapsed desktop: hover an icon → label pops up on the right side, styled consistently with the rest of the app.
- Expanded desktop or mobile drawer: tooltip is suppressed (disabled prop or empty content), so no double-label.

### Technical detail
```text
<TooltipProvider delayDuration={300}>
  {navItems.map(item => (
    <Tooltip key={item.path}>
      <TooltipTrigger asChild>
        <button ...>  {/* existing nav button */}
          ...
        </button>
      </TooltipTrigger>
      {!sidebarOpen && !isMobileDrawer && (
        <TooltipContent side="right">
          {item.label}
        </TooltipContent>
      )}
    </Tooltip>
  ))}
</TooltipProvider>
```

Single file change, no new dependencies, no schema changes.
