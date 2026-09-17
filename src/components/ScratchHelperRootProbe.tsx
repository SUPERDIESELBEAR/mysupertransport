// SCRATCH FIXTURE — deleted in the same pass. Proves the embed scanner now
// follows a `.from()` returned by a local helper: the column below does not
// exist, and the guard must name it.
import { supabase } from '@/integrations/supabase/client';

const notesTable = () =>
  (supabase as unknown as { from: (t: string) => any }).from('application_interview_notes');

export async function scratchProbe() {
  await supabase.from('audit_log').insert({ action: 'noop' } as never);
  return notesTable().select('id, no_such_column_here');
}
