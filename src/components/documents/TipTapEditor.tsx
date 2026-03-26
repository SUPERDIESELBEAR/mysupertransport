// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
import Highlight from '@tiptap/extension-highlight';
import Link from '@tiptap/extension-link';
import { useState, useRef, useEffect } from 'react';
import {
  Bold, Italic, List, ListOrdered, Quote, Minus,
  Heading1, Heading2, Heading3, Undo, Redo,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Underline as UnderlineIcon, Strikethrough, Highlighter,
  Link as LinkIcon, Unlink,
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

  // When opening, pre-fill with existing href if cursor is on a link
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

export default function TipTapEditor({ content, onChange, placeholder = 'Start writing…' }: TipTapEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Placeholder.configure({ placeholder }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Underline,
      Highlight.configure({ multicolor: false }),
      Link.configure({ openOnClick: false, autolink: true }),
    ],
    content,
    onUpdate({ editor }) {
      onChange(editor.getHTML());
    },
  });

  if (!editor) return null;

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

      {/* Editor area */}
      <EditorContent
        editor={editor}
        className="prose prose-sm max-w-none px-4 py-3 min-h-[280px] focus:outline-none [&_.tiptap]:outline-none [&_.tiptap_p.is-editor-empty:first-child::before]:text-muted-foreground [&_.tiptap_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)] [&_.tiptap_p.is-editor-empty:first-child::before]:float-left [&_.tiptap_p.is-editor-empty:first-child::before]:pointer-events-none [&_.tiptap_p.is-editor-empty:first-child::before]:h-0 [&_.tiptap_u]:underline [&_.tiptap_s]:line-through [&_.tiptap_mark]:bg-accent [&_.tiptap_mark]:text-accent-foreground [&_.tiptap_a]:text-primary [&_.tiptap_a]:underline"
      />
    </div>
  );
}
