
## Fix Font Size, Font Family, and Font Color in TipTap Editor

### Root causes found

**Problem 1 — Font size does nothing**
`@tiptap/extension-text-style` does not have a `fontSize` attribute built in. Only `Color` (adds `color`) and `FontFamily` (adds `fontFamily`) register attributes on it. Calling `setMark('textStyle', { fontSize: val })` stores the value but the extension never renders it as an inline CSS `style`. The correct fix is to add `@tiptap/extension-font-size` — a dedicated package that registers `fontSize` on `TextStyle` so it outputs `style="font-size: 14px"` in the HTML.

**Problem 2 — Font family and color render but Tailwind Typography overrides them**
The `EditorContent` wrapper has `className="prose prose-sm …"`. Tailwind Typography (`@tailwindcss/typography`) sets aggressive CSS on all elements inside `.prose`, including overriding `font-family` on `p`, `li`, headings etc. This means even when TipTap correctly outputs `<span style="font-family: Georgia">`, the `.prose` styles win. The fix is to remove `prose prose-sm` from the `EditorContent` wrapper and replace it with explicit manual utility classes for the styles we actually want (line height, list bullets, heading sizes, etc.).

### Changes — two files only

**1. `package.json`**
Add one new dependency:
```
"@tiptap/extension-font-size": "^2.27.2"
```

**2. `src/components/documents/TipTapEditor.tsx`**

- Import `FontSize` from `@tiptap/extension-font-size`
- Replace the manual `setMark('textStyle', { fontSize })` in the font-size select with the proper `FontSize` extension command:
  ```ts
  editor.chain().focus().setFontSize(val).run()   // or unsetFontSize() for default
  ```
- Register `FontSize` in the extensions array
- Remove `prose prose-sm max-w-none` from `EditorContent`'s `className` and replace with manual utility classes that don't override inline styles:
  ```
  px-4 py-3 min-h-[280px] text-sm leading-relaxed
  [&_.tiptap]:outline-none
  [&_.tiptap_h1]:text-xl [&_.tiptap_h1]:font-bold [&_.tiptap_h1]:mb-2
  [&_.tiptap_h2]:text-lg [&_.tiptap_h2]:font-bold [&_.tiptap_h2]:mb-2
  [&_.tiptap_h3]:text-base [&_.tiptap_h3]:font-semibold [&_.tiptap_h3]:mb-1
  [&_.tiptap_p]:mb-2
  [&_.tiptap_ul]:list-disc [&_.tiptap_ul]:pl-5 [&_.tiptap_ul]:mb-2
  [&_.tiptap_ol]:list-decimal [&_.tiptap_ol]:pl-5 [&_.tiptap_ol]:mb-2
  [&_.tiptap_blockquote]:border-l-4 [&_.tiptap_blockquote]:border-border [&_.tiptap_blockquote]:pl-4 [&_.tiptap_blockquote]:italic [&_.tiptap_blockquote]:text-muted-foreground
  [&_.tiptap_hr]:border-border [&_.tiptap_hr]:my-3
  [&_.tiptap_u]:underline [&_.tiptap_s]:line-through
  [&_.tiptap_mark]:bg-accent [&_.tiptap_mark]:text-accent-foreground
  [&_.tiptap_a]:text-primary [&_.tiptap_a]:underline
  [&_.tiptap_p.is-editor-empty:first-child::before]:text-muted-foreground ...
  ```

This approach keeps all the visual styling of the editor intact while allowing inline `style` attributes (font-family, font-size, color) to render without being overridden by the Typography plugin.

### No database changes. No edge functions. No new components.
