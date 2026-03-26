
## Root Cause: TextAlign Default Suppresses Inline Style Output

### What's failing

TipTap's `TextAlign` extension (v2) is registered with its default configuration. The extension works by adding a `textAlign` global attribute to `paragraph` and `heading` nodes. The problem is the extension's built-in `renderHTML` function **only emits the `style="text-align: ..."` attribute when the value differs from the default** — and the default is `'left'`. This means:

- Clicking **Left** on an already-left paragraph: no style attribute emitted → browser renders left-aligned (correct visually but the HTML is unstylized)
- Clicking **Center/Right/Justify**: works initially
- But re-clicking **Left** to reset: the attribute reverts to the default `'left'`, so no inline style is emitted — this part is fine

However, the deeper issue is that when `StarterKit` provides `Paragraph` and `Heading` nodes AND `TextAlign` tries to add global attributes to those same node types, the attribute may not survive the render pipeline correctly in v2.27.x. The fix is to explicitly configure `TextAlign` with `alignments` and `defaultAlignment` set, so it always emits the style.

Additionally, both `DocumentViewer.tsx` (line 174) and `DocumentEditorModal.tsx` preview tab (line 539) use `prose prose-sm max-w-none` on the `dangerouslySetInnerHTML` div. While `@tailwindcss/typography` is not installed (so `prose` classes do nothing), this still looks wrong. More importantly, neither viewer div has `[&_[style*="text-align"]]` passthrough — but since there's no typography plugin overriding it, inline styles should pass through fine there.

The **primary fix** is in `TipTapEditor.tsx`:

### Fix — `src/components/documents/TipTapEditor.tsx` only

Change the `TextAlign` configuration from:
```ts
TextAlign.configure({ types: ['heading', 'paragraph'] }),
```
to:
```ts
TextAlign.configure({
  types: ['heading', 'paragraph'],
  alignments: ['left', 'center', 'right', 'justify'],
  defaultAlignment: 'left',
}),
```

Then override the extension to force `renderHTML` to always emit the style (even for the default value) by extending the extension:

```ts
TextAlign.extend({
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          textAlign: {
            default: this.options.defaultAlignment,
            parseHTML: el => el.style.textAlign || this.options.defaultAlignment,
            renderHTML: attrs => {
              // Always emit the style, even for the default value
              if (!attrs.textAlign) return {};
              return { style: `text-align: ${attrs.textAlign}` };
            },
          },
        },
      },
    ];
  },
}).configure({
  types: ['heading', 'paragraph'],
  alignments: ['left', 'center', 'right', 'justify'],
  defaultAlignment: 'left',
})
```

This guarantees the `style` attribute is always written to the HTML output for any alignment value.

### Secondary fix — ensure the `EditorContent` area visually respects inline text-align

The `EditorContent` wrapper's existing classes do not interfere with inline styles (no `@tailwindcss/typography`). However, to be explicit and prevent any Tailwind reset from affecting alignment, add:

```
[&_.tiptap_p[style]]:text-inherit
[&_.tiptap_h1[style]]:text-inherit
[&_.tiptap_h2[style]]:text-inherit
[&_.tiptap_h3[style]]:text-inherit
```

Actually the simpler and more robust fix is to add a `tiptap-editor` CSS class in `src/index.css` targeting alignment styles explicitly:

```css
.tiptap [style*="text-align: center"] { text-align: center !important; }
.tiptap [style*="text-align: right"]  { text-align: right  !important; }
.tiptap [style*="text-align: justify"]{ text-align: justify !important; }
```

This guarantees alignment renders regardless of any future Tailwind conflicts.

### Summary of changes

**`src/components/documents/TipTapEditor.tsx`**
- Replace `TextAlign.configure(...)` with the `.extend({ addGlobalAttributes() { ... } }).configure(...)` version that always emits the inline style

**`src/index.css`**
- Add 3 explicit CSS rules to ensure `.tiptap` alignment inline styles are never suppressed

No database changes. No new components. No edge functions.
