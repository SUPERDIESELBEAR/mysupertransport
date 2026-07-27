import { useState } from 'react';
import { z } from 'zod';
import { toast } from 'sonner';
import { Loader2, MessageSquare } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { addStaffNote } from '@/lib/pei/api';
import type { PEIStaffNote } from '@/lib/pei/types';

const schema = z.string().trim().min(1, 'Note cannot be empty').max(2000, 'Note is too long');

interface Props {
  requestId: string;
  notes: PEIStaffNote[];
  onSaved: () => void;
}

/** Timestamped, attributed staff notes for one previous-employer request. */
export function StaffNotesPopover({ requestId, notes, onSaved }: Props) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const list = Array.isArray(notes) ? notes : [];

  async function save() {
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setSaving(true);
    try {
      await addStaffNote(requestId, parsed.data);
      setValue('');
      toast.success('Note added');
      onSaved();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to add note');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="ghost" title="Staff notes">
          <MessageSquare className="h-3 w-3 mr-1" />
          {list.length > 0 ? list.length : 'Notes'}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-3 space-y-3 pointer-events-auto">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Staff notes</p>
        {list.length === 0 ? (
          <p className="text-xs text-muted-foreground">No notes yet.</p>
        ) : (
          <ul className="space-y-2 max-h-48 overflow-y-auto">
            {list.map((n, i) => (
              <li key={i} className="text-xs border-l-2 border-border pl-2">
                <p className="whitespace-pre-wrap text-foreground">{n.note}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {n.author} · {n.at ? new Date(n.at).toLocaleString() : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
        <Textarea
          rows={3}
          maxLength={2000}
          value={value}
          placeholder="Add a note…"
          onChange={(e) => setValue(e.target.value)}
        />
        <Button size="sm" className="w-full" onClick={save} disabled={saving}>
          {saving && <Loader2 className="h-3 w-3 animate-spin mr-2" />}
          Add note
        </Button>
      </PopoverContent>
    </Popover>
  );
}