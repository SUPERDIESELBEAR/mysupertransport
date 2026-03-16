
## Fix: Downgrade TipTap v3 → v2.11.0

The build errors confirm all 7 `@tiptap/*` packages are still at `^3.20.2` in `package.json`. No code changes are needed — only the version strings need updating.

### Single file change: `package.json`

Lines 49–55, change all 7 TipTap versions from `^3.20.2` to `^2.11.0`:

```
@tiptap/extension-blockquote      ^3.20.2  →  ^2.11.0
@tiptap/extension-heading         ^3.20.2  →  ^2.11.0
@tiptap/extension-horizontal-rule ^3.20.2  →  ^2.11.0
@tiptap/extension-placeholder     ^3.20.2  →  ^2.11.0
@tiptap/pm                        ^3.20.2  →  ^2.11.0
@tiptap/react                     ^3.20.2  →  ^2.11.0
@tiptap/starter-kit               ^3.20.2  →  ^2.11.0
```

`TipTapEditor.tsx` uses the same API in both v2 and v3 — no component changes needed.
