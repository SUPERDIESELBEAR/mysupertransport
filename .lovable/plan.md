
## Add Text Alignment + Enhanced Toolbar to TipTap Editor

### What's missing

The editor has no text alignment, no underline, no highlight, and no strikethrough button (StarterKit includes the node but no toolbar button). The plan adds the most useful missing features in a clean grouped toolbar.

### New features

| Feature | Package needed |
|---|---|
| Left / Center / Right / Justify alignment | `@tiptap/extension-text-align` (new install) |
| Underline | `@tiptap/extension-underline` (new install) |
| Strikethrough button | no new package — StarterKit already has it |
| Highlight | `@tiptap/extension-highlight` (new install) |

Links were considered but require a popover input which adds significant complexity — leaving for a later pass.

### Changes

**1. `package.json`** — add three new TipTap packages at the same `^2.27.2` version:
```
@tiptap/extension-text-align
@tiptap/extension-underline
@tiptap/extension-highlight
```

**2. `src/components/documents/TipTapEditor.tsx`** — single file to update:

- Import the three new extensions
- Add them to `useEditor` extensions array:
  ```ts
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  Underline,
  Highlight.configure({ multicolor: false }),
  ```
- Add new Lucide icons: `AlignLeft`, `AlignCenter`, `AlignRight`, `AlignJustify`, `Underline`, `Strikethrough`, `Highlighter`
- Add a new toolbar group for **formatting** (underline, strikethrough, highlight) between Bold/Italic and lists
- Add a new toolbar group for **alignment** (left, center, right, justify) at the end before undo/redo
- Add `prose` CSS to `EditorContent` for underline/strikethrough/highlight rendering

### Result

The toolbar will be organized as:
```
H1 H2 H3 | Bold Italic Underline Strike Highlight | • 1. " — | ← ↑ → ⇔ | ↩ ↪
```

No database changes. No edge functions. No new components.
