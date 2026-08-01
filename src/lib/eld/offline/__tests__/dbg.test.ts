import 'fake-indexeddb/auto';
import { it, vi } from 'vitest';
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
import { PDFDocument } from 'pdf-lib';
import { roadsideDb } from '@/lib/eld/offline/db';
import { buildOfficerPacket } from '@/lib/eld/offline/buildOfficerPacket';
it('dbg', async () => {
  const d = await PDFDocument.create(); d.addPage([200,200]);
  const b = await d.save();
  await roadsideDb.rods_pdfs.put({ log_date:'2026-07-01', operator_id:'op', bytes: b.slice().buffer as ArrayBuffer, mime:'application/pdf', uploaded:true, cached_at:new Date().toISOString() } as never);
  console.log('stored', await roadsideDb.rods_pdfs.get('2026-07-01'));
  const p = await buildOfficerPacket({ manifest: { key:'current', operator_id:'op', days:[{kind:'keyed',label:'Certified',cached:true,renderable:true,filename:null,showsTotals:true,printable:true,log_date:'2026-07-01'}], window_start:'2026-07-01', window_end:'2026-07-01', event:null, built_at:new Date().toISOString() } as never, meta: null });
  console.log(JSON.stringify(p.dispositions));
});
