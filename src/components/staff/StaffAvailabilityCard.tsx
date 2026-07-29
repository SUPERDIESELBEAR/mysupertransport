import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Users } from 'lucide-react';

type Mode = 'all_drivers' | 'specific_drivers' | 'none';

/**
 * Lets a staff member (or admin viewing their own row) control whether
 * drivers can start messages with them.
 */
export default function StaffAvailabilityCard() {
  const { user } = useAuth();
  const [mode, setMode] = useState<Mode>('none');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const { data } = await supabase
        .from('staff_messaging_settings')
        .select('availability_mode, availability_note')
        .eq('staff_id', user.id)
        .maybeSingle();
      if (data) {
        setMode(data.availability_mode as Mode);
        setNote(data.availability_note ?? '');
      }
      setLoading(false);
    })();
  }, [user?.id]);

  const save = async () => {
    if (!user?.id) return;
    setSaving(true);
    const { error } = await supabase.from('staff_messaging_settings').upsert({
      staff_id: user.id,
      availability_mode: mode,
      availability_note: note || null,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Availability updated');
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Driver Availability</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        Controls whether drivers can start a message thread with you. This does not affect
        threads staff or a driver's dispatcher/onboarding lead already have with them.
      </p>

      <div className="space-y-1.5">
        <Label className="text-xs">Who can message you?</Label>
        <Select value={mode} onValueChange={(v) => setMode(v as Mode)} disabled={loading}>
          <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No drivers (default)</SelectItem>
            <SelectItem value="specific_drivers">Specific drivers only</SelectItem>
            <SelectItem value="all_drivers">All active drivers</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Short note (optional)</Label>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          maxLength={140}
          placeholder="e.g. Dispatch questions only, M–F 8a–5p CT"
          className="text-sm"
        />
      </div>

      <Button size="sm" onClick={save} disabled={saving || loading}>
        {saving ? 'Saving…' : 'Save'}
      </Button>
    </Card>
  );
}