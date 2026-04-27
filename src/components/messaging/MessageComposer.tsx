import { useRef, useState } from 'react';
import { Send, Paperclip, X, FileText, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChatMessage, isImageMime, isPdfMime, formatBytes } from './types';

interface Props {
  placeholder: string;
  replyTo: ChatMessage | null;
  onCancelReply: () => void;
  onSend: (body: string, file: File | null) => Promise<void>;
  onTyping: () => void;
  onStoppedTyping: () => void;
  myUserId: string | null;
}

const MAX_BYTES = 10 * 1024 * 1024;

export function MessageComposer({
  placeholder, replyTo, onCancelReply, onSend, onTyping, onStoppedTyping, myUserId,
}: Props) {
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const submit = async () => {
    if (sending) return;
    if (!text.trim() && !file) return;
    setSending(true);
    try {
      await onSend(text, file);
      setText('');
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } finally {
      setSending(false);
    }
  };

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    if (f && f.size > MAX_BYTES) {
      alert('File must be 10 MB or smaller');
      e.target.value = '';
      return;
    }
    setFile(f);
  };

  return (
    <div className="px-5 py-3 border-t border-border bg-background shrink-0 space-y-2">
      {/* Reply banner */}
      {replyTo && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/60 border-l-2 border-primary">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold text-primary mb-0.5">
              Replying to {replyTo.sender_id === myUserId ? 'yourself' : 'message'}
            </p>
            <p className="text-xs text-foreground/70 truncate">
              {replyTo.deleted_at
                ? '(deleted)'
                : replyTo.body || (replyTo.attachment_name ?? 'Attachment')}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancelReply}
            className="h-6 w-6 rounded-full hover:bg-background flex items-center justify-center text-muted-foreground"
            aria-label="Cancel reply"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Attachment preview */}
      {file && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/60 border border-border">
          {isImageMime(file.type) ? (
            <ImageIcon className="h-4 w-4 text-primary shrink-0" />
          ) : isPdfMime(file.type) ? (
            <FileText className="h-4 w-4 text-primary shrink-0" />
          ) : (
            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate">{file.name}</p>
            <p className="text-[10px] text-muted-foreground">{formatBytes(file.size)}</p>
          </div>
          <button
            type="button"
            onClick={() => { setFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
            className="h-6 w-6 rounded-full hover:bg-background flex items-center justify-center text-muted-foreground"
            aria-label="Remove attachment"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Composer row */}
      <form
        onSubmit={e => { e.preventDefault(); void submit(); }}
        className="flex items-center gap-2"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/jpg,image/webp,image/gif,application/pdf"
          className="hidden"
          onChange={onPickFile}
        />
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-10 w-10 shrink-0 text-muted-foreground"
          onClick={() => fileInputRef.current?.click()}
          disabled={sending}
          aria-label="Attach file"
        >
          <Paperclip className="h-4 w-4" />
        </Button>
        <Input
          value={text}
          onChange={e => {
            setText(e.target.value);
            if (e.target.value.length > 0) onTyping();
            else onStoppedTyping();
          }}
          onBlur={onStoppedTyping}
          placeholder={placeholder}
          className="flex-1 h-10 text-sm"
          disabled={sending}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
        />
        <Button
          type="submit"
          size="sm"
          disabled={(!text.trim() && !file) || sending}
          className="h-10 px-4 gap-2"
        >
          <Send className="h-4 w-4" />
          <span className="hidden sm:inline">Send</span>
        </Button>
      </form>
    </div>
  );
}