import { createClient } from '@supabase/supabase-js';
const URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const ANON = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
const sess = JSON.parse(process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON);
const TARGET = '7e356f94-ce4a-47aa-8883-0e6b01d09aab';

const owner = createClient(URL, ANON, { auth:{persistSession:false,autoRefreshToken:false},
  global:{ headers:{ Authorization:`Bearer ${sess.access_token}` } } });

const { data: cps, error: cpe } = await owner.functions.invoke('create-preview-session', { body:{ target_user_id: TARGET } });
if (cpe) { console.error('create-preview-session failed', cpe, await cpe.context?.text?.()); process.exit(1); }
const anonC = createClient(URL, ANON, { auth:{persistSession:false,autoRefreshToken:false} });
const { data: rd, error: rde } = await anonC.functions.invoke('redeem-preview-session', { body:{ code: cps.code } });
if (rde) { console.error('redeem failed', rde, await rde.context?.text?.()); process.exit(1); }
console.log('redeem keys', Object.keys(rd));
const driver = createClient(URL, ANON, { auth:{persistSession:false,autoRefreshToken:false} });
const { data: vo, error: voe } = await driver.auth.verifyOtp({ token_hash: rd.token_hash, type: 'email' });
if (voe) { console.error('verifyOtp failed', voe); process.exit(1); }
console.log('driver session user', vo.user.id);
const { data: op, error: ope } = await driver.from('operators').select('id,unit_number').eq('user_id', vo.user.id).maybeSingle();
console.log('operator', op, ope?.message);
