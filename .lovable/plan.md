
## Add Font Color, Font Size, and Font Family to TipTap Editor

### What's needed

Three new TipTap extensions, all at `^2.27.2`:

| Feature | Package |
|---|---|
| Font color | `@tiptap/extension-color` + `@tiptap/extension-text-style` (required peer) |
| Font size | `@tiptap/extension-text-style` (already needed above) + custom size attribute via `TextStyle` |
| Font family | `@tiptap/extension-font-family` |

`@tiptap/extension-text-style` is a shared peer that all three features depend on — install it once.

### Toolbar controls

All three use `<select>` dropdowns in the toolbar (not icon buttons, since they carry values):

**Font family** — a compact select:
```
Sans-serif (default) | Serif | Monospace | Georgia | Arial
```

**Font size** — a compact select:
```
Default | 12 | 14 | 16 | 18 | 20 | 24 | 28 | 32 | 36
```

**Font color** — a native `<input type="color">` disguised as a toolbar button (a colored "A" icon), no external color picker library needed.

### Changes

**`package.json`** — add:
- `@tiptap/extension-color@^2.27.2`
- `@tiptap/extension-text-style@^2.27.2`
- `@tiptap/extension-font-family@^2.27.2`

**`src/components/documents/TipTapEditor.tsx`** — single file:
1. Import the three new extensions
2. Register in `useEditor`:
   ```ts
   TextStyle,
   Color,
   FontFamily,
   ```
3. Add a new toolbar group after headings, before bold/italic (since these are character-level properties that make sense to set first):
   - `FontFamilySelect` — small inline `<select>` calling `editor.chain().focus().setFontFamily(val).run()`
   - `FontSizeSelect` — small inline `<select>` calling `editor.chain().focus().setMark('textStyle', { fontSize: val }).run()`
   - `ColorPicker` — a button wrapping a hidden `<input type="color">`, showing a colored "A" with the current color underneath; calls `editor.chain().focus().setColor(hex).run()`
4. Add a "remove color" / "clear formatting" reset option in the color picker
5. Add `[&_.tiptap_[style*="font-family"]]:font-[inherit]` and similar CSS passthrough so the editor area renders the inline styles

### Toolbar layout after change
```
H1 H2 H3 | [Font Family ▾] [Size ▾] [A color] | Bold Italic Underline Strike Highlight Link | • 1. " — | ← ↑ → ↔ | ↩ ↪
```

### No database changes. No edge functions. No new components.
