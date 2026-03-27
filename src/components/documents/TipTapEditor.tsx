// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { useEditor, EditorContent, Extension } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
import Highlight from '@tiptap/extension-highlight';
import Link from '@tiptap/extension-link';
import TextStyle from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import FontFamily from '@tiptap/extension-font-family';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import { useState, useRef, useEffect } from 'react';

// Custom FontSize extension for TipTap v2 (no v2-compatible package exists)
const FontSize = Extension.create({
  name: 'fontSize',
  addGlobalAttributes() {
    return [
      {
        types: ['textStyle'],
        attributes: {
          fontSize: {
            default: null,
            parseHTML: el => el.style.fontSize || null,
            renderHTML: attrs => {
              if (!attrs.fontSize) return {};
              return { style: `font-size: ${attrs.fontSize}` };
            },
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setFontSize: (fontSize: string) => ({ chain }) =>
        chain().setMark('textStyle', { fontSize }).run(),
      unsetFontSize: () => ({ chain }) =>
        chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run(),
    };
  },
});
import {
  Bold, Italic, List, ListOrdered, Quote, Minus,
  Heading1, Heading2, Heading3, Undo, Redo,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Underline as UnderlineIcon, Strikethrough, Highlighter,
  Link as LinkIcon, Unlink, TableIcon, Plus, Trash2,
  ArrowUpFromLine, ArrowDownFromLine, ArrowLeftFromLine, ArrowRightFromLine,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface TipTapEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

const FONT_FAMILIES = [
  { label: 'Sans-serif', value: '' },
  { label: 'Serif', value: 'Georgia, serif' },
  { label: 'Monospace', value: 'ui-monospace, monospace' },
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
];

const FONT_SIZES = [
  { label: 'Default', value: '' },
  { label: '12', value: '12px' },
  { label: '14', value: '14px' },
  { label: '16', value: '16px' },
  { label: '18', value: '18px' },
  { label: '20', value: '20px' },
  { label: '24', value: '24px' },
  { label: '28', value: '28px' },
  { label: '32', value: '32px' },
  { label: '36', value: '36px' },
];

function ToolbarButton({
  onClick, active, title, children,
}: {
  onClick: () => void;
  active?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        'p-1.5 rounded text-sm transition-colors',
        active
          ? 'bg-foreground text-background'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted',
      )}
    >
      {children}
    </button>
  );
}

function LinkPopover({ editor }: { editor: any }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const isActive = editor.isActive('link');

  useEffect(() => {
    if (open) {
      const existing = editor.getAttributes('link').href ?? '';
      setUrl(existing);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open, editor]);

  const apply = () => {
    const trimmed = url.trim();
    if (!trimmed) {
      editor.chain().focus().unsetLink().run();
    } else {
      const href = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
      editor.chain().focus().setLink({ href, target: '_blank', rel: 'noopener noreferrer' }).run();
    }
    setOpen(false);
  };

  const remove = (e: React.MouseEvent) => {
    e.stopPropagation();
    editor.chain().focus().unsetLink().run();
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={isActive ? 'Edit link' : 'Insert link'}
          className={cn(
            'p-1.5 rounded text-sm transition-colors',
            isActive
              ? 'bg-foreground text-background'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted',
          )}
        >
          <LinkIcon className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" side="bottom" align="start">
        <p className="text-xs font-medium text-muted-foreground mb-2">
          {isActive ? 'Edit link' : 'Insert link'}
        </p>
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://example.com"
            className="h-8 text-sm"
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); apply(); }
              if (e.key === 'Escape') setOpen(false);
            }}
          />
          <Button size="sm" className="h-8 px-3 text-xs" onClick={apply}>
            {url.trim() ? 'Apply' : 'Remove'}
          </Button>
        </div>
        {isActive && (
          <button
            type="button"
            onClick={remove}
            className="mt-2 flex items-center gap-1.5 text-xs text-destructive hover:underline"
          >
            <Unlink className="h-3 w-3" /> Remove link
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

function ColorPicker({ editor }: { editor: any }) {
  const colorInputRef = useRef<HTMLInputElement>(null);
  const currentColor = editor.getAttributes('textStyle').color ?? '#000000';

  return (
    <div className="relative flex items-center gap-0.5">
      <button
        type="button"
        title="Font color"
        onClick={() => colorInputRef.current?.click()}
        className="p-1.5 rounded text-sm transition-colors text-muted-foreground hover:text-foreground hover:bg-muted flex flex-col items-center gap-0.5"
      >
        <span className="text-xs font-bold leading-none" style={{ color: currentColor }}>A</span>
        <span className="block h-1 w-4 rounded-sm" style={{ backgroundColor: currentColor }} />
      </button>
      <input
        ref={colorInputRef}
        type="color"
        value={currentColor}
        onChange={e => editor.chain().focus().setColor(e.target.value).run()}
        className="absolute opacity-0 w-0 h-0 pointer-events-none"
        tabIndex={-1}
      />
      <button
        type="button"
        title="Remove color"
        onClick={() => editor.chain().focus().unsetColor().run()}
        className="p-1 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-muted leading-none"
      >
        ✕
      </button>
    </div>
  );
}

export default function TipTapEditor({ content, onChange, placeholder = 'Start writing…' }: TipTapEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Placeholder.configure({ placeholder }),
      TextAlign.extend({
        addGlobalAttributes() {
          return [
            {
              types: this.options.types,
              attributes: {
                textAlign: {
                  default: this.options.defaultAlignment,
                  parseHTML: (el: HTMLElement) => el.style.textAlign || this.options.defaultAlignment,
                  renderHTML: (attrs: Record<string, string>) => {
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
      }),
      Underline,
      Highlight.configure({ multicolor: false }),
      Link.configure({ openOnClick: false, autolink: true }),
      TextStyle,
      Color,
      FontFamily,
      FontSize,
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content,
    onUpdate({ editor }) {
      onChange(editor.getHTML());
    },
  });

  if (!editor) return null;

  const currentFontFamily = editor.getAttributes('textStyle').fontFamily ?? '';
  const currentFontSize = editor.getAttributes('textStyle').fontSize ?? '';

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-border bg-muted/30">
        {/* Headings */}
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive('heading', { level: 1 })} title="Heading 1">
          <Heading1 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="Heading 2">
          <Heading2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })} title="Heading 3">
          <Heading3 className="h-4 w-4" />
        </ToolbarButton>

        <span className="w-px h-5 bg-border mx-1" />

        {/* Font family */}
        <select
          value={currentFontFamily}
          onChange={e => {
            const val = e.target.value;
            if (val) {
              editor.chain().focus().setFontFamily(val).run();
            } else {
              editor.chain().focus().unsetFontFamily().run();
            }
          }}
          title="Font family"
          className="h-7 text-xs rounded border border-border bg-background text-foreground px-1 cursor-pointer hover:bg-muted transition-colors"
        >
          {FONT_FAMILIES.map(f => (
            <option key={f.label} value={f.value}>{f.label}</option>
          ))}
        </select>

        {/* Font size */}
        <select
          value={currentFontSize}
          onChange={e => {
            const val = e.target.value;
            if (val) {
              editor.chain().focus().setFontSize(val).run();
            } else {
              editor.chain().focus().unsetFontSize().run();
            }
          }}
          title="Font size"
          className="h-7 w-16 text-xs rounded border border-border bg-background text-foreground px-1 cursor-pointer hover:bg-muted transition-colors"
        >
          {FONT_SIZES.map(s => (
            <option key={s.label} value={s.value}>{s.label}</option>
          ))}
        </select>

        {/* Color picker */}
        <ColorPicker editor={editor} />

        <span className="w-px h-5 bg-border mx-1" />

        {/* Inline formatting */}
        <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Bold">
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Italic">
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="Underline">
          <UnderlineIcon className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="Strikethrough">
          <Strikethrough className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleHighlight().run()} active={editor.isActive('highlight')} title="Highlight">
          <Highlighter className="h-4 w-4" />
        </ToolbarButton>
        <LinkPopover editor={editor} />

        <span className="w-px h-5 bg-border mx-1" />

        {/* Lists & blocks */}
        <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Bullet List">
          <List className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Numbered List">
          <ListOrdered className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')} title="Blockquote">
          <Quote className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().setHorizontalRule().run()} active={false} title="Horizontal Rule">
          <Minus className="h-4 w-4" />
        </ToolbarButton>

        <span className="w-px h-5 bg-border mx-1" />

        {/* Alignment */}
        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('left').run()} active={editor.isActive({ textAlign: 'left' })} title="Align Left">
          <AlignLeft className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('center').run()} active={editor.isActive({ textAlign: 'center' })} title="Align Center">
          <AlignCenter className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('right').run()} active={editor.isActive({ textAlign: 'right' })} title="Align Right">
          <AlignRight className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('justify').run()} active={editor.isActive({ textAlign: 'justify' })} title="Justify">
          <AlignJustify className="h-4 w-4" />
        </ToolbarButton>

        <span className="w-px h-5 bg-border mx-1" />

        {/* History */}
        <ToolbarButton onClick={() => editor.chain().focus().undo().run()} active={false} title="Undo">
          <Undo className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().redo().run()} active={false} title="Redo">
          <Redo className="h-4 w-4" />
        </ToolbarButton>
      </div>

      {/* Editor area — prose class intentionally removed so inline font-family/font-size/color styles are not overridden */}
      <EditorContent
        editor={editor}
        className={[
          'px-4 py-3 min-h-[280px] text-sm leading-relaxed focus:outline-none',
          '[&_.tiptap]:outline-none',
          // Headings
          '[&_.tiptap_h1]:text-xl [&_.tiptap_h1]:font-bold [&_.tiptap_h1]:mb-2 [&_.tiptap_h1]:mt-3',
          '[&_.tiptap_h2]:text-lg [&_.tiptap_h2]:font-bold [&_.tiptap_h2]:mb-2 [&_.tiptap_h2]:mt-3',
          '[&_.tiptap_h3]:text-base [&_.tiptap_h3]:font-semibold [&_.tiptap_h3]:mb-1 [&_.tiptap_h3]:mt-2',
          // Paragraphs
          '[&_.tiptap_p]:mb-2',
          // Lists
          '[&_.tiptap_ul]:list-disc [&_.tiptap_ul]:pl-5 [&_.tiptap_ul]:mb-2',
          '[&_.tiptap_ol]:list-decimal [&_.tiptap_ol]:pl-5 [&_.tiptap_ol]:mb-2',
          '[&_.tiptap_li]:mb-0.5',
          // Blockquote & HR
          '[&_.tiptap_blockquote]:border-l-4 [&_.tiptap_blockquote]:border-border [&_.tiptap_blockquote]:pl-4 [&_.tiptap_blockquote]:italic [&_.tiptap_blockquote]:text-muted-foreground [&_.tiptap_blockquote]:my-2',
          '[&_.tiptap_hr]:border-border [&_.tiptap_hr]:my-3',
          // Inline marks
          '[&_.tiptap_u]:underline',
          '[&_.tiptap_s]:line-through',
          '[&_.tiptap_mark]:bg-accent [&_.tiptap_mark]:text-accent-foreground',
          '[&_.tiptap_a]:text-primary [&_.tiptap_a]:underline',
          // Placeholder
          '[&_.tiptap_p.is-editor-empty:first-child::before]:text-muted-foreground',
          '[&_.tiptap_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]',
          '[&_.tiptap_p.is-editor-empty:first-child::before]:float-left',
          '[&_.tiptap_p.is-editor-empty:first-child::before]:pointer-events-none',
          '[&_.tiptap_p.is-editor-empty:first-child::before]:h-0',
        ].join(' ')}
      />
    </div>
  );
}
