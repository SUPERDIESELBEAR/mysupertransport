import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Megaphone, Send, Loader2, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface ReleaseNote {
  id: string;
  title: string;
  body: string;
  created_by: string;
  created_at: string;
}

export default function ReleaseNotesManager() {
  const { session } = useAuth();
  const { toast } = useToast();
  const [notes, setNotes] = useState<ReleaseNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchNotes = async () => {
    const { data } = await supabase
      .from('release_notes')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    setNotes((data as ReleaseNote[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchNotes(); }, []);

  const handlePost = async () => {
    if (!title.trim() || !body.trim()) {
      toast({ title: 'Title and body are required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('release_notes').insert({
      title: title.trim(),
      body: body.trim(),
      created_by: session?.user?.id,
    });
    setSaving(false);
    if (error) {
      toast({ title: 'Failed to post announcement', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Announcement posted!', description: 'All staff will be notified via bell icon and email.' });
      setTitle('');
      setBody('');
      fetchNotes();
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await supabase.from('release_notes').delete().eq('id', deleteId);
    setDeleteId(null);
    fetchNotes();
    toast({ title: 'Announcement deleted' });
  };

  return (
    <div className="space-y-6">
      {/* Compose */}
      <Card className="border-gold/30">
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Megaphone className="h-5 w-5 text-gold" />
            <h3 className="font-semibold text-base">Post a New Announcement</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            All staff members will receive an in-app notification and email when you post.
          </p>
          <Input
            placeholder="Announcement title — e.g. 'In-App Document Preview'"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
          />
          <Textarea
            placeholder="Describe what changed and why it matters…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            maxLength={2000}
          />
          <div className="flex justify-end">
            <Button onClick={handlePost} disabled={saving || !title.trim() || !body.trim()} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {saving ? 'Posting…' : 'Post Announcement'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Past announcements */}
      <div>
        <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider mb-3">
          Past Announcements
        </h3>
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : notes.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-12">
            No announcements yet. Post one above to notify your team.
          </p>
        ) : (
          <div className="space-y-3">
            {notes.map((n) => (
              <Card key={n.id} className="group">
                <CardContent className="py-4 px-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-semibold text-sm truncate">{n.title}</h4>
                        <Badge variant="outline" className="text-[10px] shrink-0">
                          {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground whitespace-pre-line line-clamp-3">{n.body}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 h-8 w-8"
                      onClick={() => setDeleteId(n.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete announcement?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the announcement from the list. Notifications already sent will not be recalled.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
