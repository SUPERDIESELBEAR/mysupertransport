import { createClient } from '@supabase/supabase-js';
const URL_=process.env.VITE_SUPABASE_URL, ANON=process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const sess=JSON.parse(process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON);
const TARGET='7e356f94-ce4a-47aa-8883-0e6b01d09aab';
const owner=createClient(URL_,ANON,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:`Bearer ${sess.access_token}`}}});
const {data:cps}=await owner.functions.invoke('create-preview-session',{body:{target_user_id:TARGET}});
const anonC=createClient(URL_,ANON,{auth:{persistSession:false,autoRefreshToken:false}});
const {data:rd}=await anonC.functions.invoke('redeem-preview-session',{body:{code:cps.code}});
const db=createClient(URL_,ANON,{auth:{persistSession:false,autoRefreshToken:false}});
const {data:vo}=await db.auth.verifyOtp({token_hash:rd.token_hash,type:'email'});
const uid=vo.user.id;
const {data:op}=await db.from('operators').select('id').eq('user_id',uid).maybeSingle();
const OP=op.id;
const uuid=()=>crypto.randomUUID();
const rec=[];
const log=(label,e,expect)=>{rec.push({label,expect,code:e?.code??null,msg:(e?.message??'(no error)').slice(0,110)});};

const HDR={carrier_name:'SuperTransport',carrier_usdot:'123456',carrier_mc:'MC-1',main_office_address:'1 Main St',home_terminal_address:'2 Yard Rd',home_terminal_timezone:'America/Chicago',truck_number:'T1',from_location:'Dallas, TX',to_location:'Waco, TX',co_driver_name:'None',shipping_document_no:'BOL-1',total_miles_driving_today:100};
async function mkDay(date,extra={}){const{data,error}=await db.from('rods_days').insert({operator_id:OP,log_date:date,status:'draft',locked:false,record_source:'keyed',...HDR,...extra}).select().single();if(error)throw new Error('mkDay '+date+': '+error.message);return data;}
async function fullEvents(dayId){const{error}=await db.from('rods_events').insert([{rods_day_id:dayId,start_minute:0,end_minute:1440,duty_status:1,city:'Dallas',state:'TX'}]);if(error)throw new Error('events: '+error.message);}
const certify=(id,name='Demo Driver',tok=uuid())=>db.rpc('certify_rods_day',{_day_id:id,_legal_name:name,_signature_path:'sig/x.png',_pdf_path:null,_device_info:'seeded-run',p_certification_token:tok});

// P0010
log('P0010 null token',(await db.rpc('certify_rods_day',{_day_id:uuid(),_legal_name:'X',_signature_path:null,_pdf_path:null,_device_info:null,p_certification_token:null})).error,'P0010');
// P0011
log('P0011 unknown day',(await certify(uuid())).error,'P0011');
// P0012 foreign operator's day (seeded out-of-band)
const FOREIGN=process.env.FOREIGN_DAY_ID;
if(FOREIGN) log('P0012 foreign day',(await certify(FOREIGN)).error,'P0012');
// P0020 incomplete entry
const d20=await mkDay('2020-01-20');
await db.from('rods_events').insert({rods_day_id:d20.id,start_minute:0,end_minute:1440,duty_status:1,city:'',state:'TX'});
log('P0020 incomplete entry',(await certify(d20.id)).error,'P0020');
// P0021 gap
const d21=await mkDay('2020-01-21');
await db.from('rods_events').insert({rods_day_id:d21.id,start_minute:60,end_minute:1440,duty_status:1,city:'Dallas',state:'TX'});
log('P0021 gap',(await certify(d21.id)).error,'P0021');
// P0022 overlap
const d22=await mkDay('2020-01-22');
await db.from('rods_events').insert([{rods_day_id:d22.id,start_minute:0,end_minute:600,duty_status:1,city:'A',state:'TX'},{rods_day_id:d22.id,start_minute:300,end_minute:1440,duty_status:3,city:'B',state:'TX'}]);
log('P0022 overlap',(await certify(d22.id)).error,'P0022');
// P0023 short
const d23=await mkDay('2020-01-23');
await db.from('rods_events').insert({rods_day_id:d23.id,start_minute:0,end_minute:1000,duty_status:1,city:'A',state:'TX'});
log('P0023 unaccounted',(await certify(d23.id)).error,'P0023');
// P0030 missing headers
const d30=await mkDay('2020-01-30',{carrier_mc:null,from_location:null});
await fullEvents(d30.id);
log('P0030 missing headers',(await certify(d30.id)).error,'P0030');
// good day -> certified
const dA=await mkDay('2020-01-02'); await fullEvents(dA.id);
const tokA=uuid();
const rA=await certify(dA.id,'Demo Driver',tokA);
log('certify OK',rA.error,'null');
// P0014 already certified (re-certify with new token)
log('P0014 not draft',(await certify(dA.id)).error,'P0014');
// P0013 token belongs to another log
const d13=await mkDay('2020-01-13'); await fullEvents(d13.id);
log('P0013 token mismatch',(await certify(d13.id,'Demo Driver',tokA)).error,'P0013');
// P0015 empty legal name
log('P0015 blank name',(await certify(d13.id,'   ')).error,'P0015');
// P0031 duplicate certified date
const dDup=await mkDay('2020-01-02'); await fullEvents(dDup.id);
log('P0031 duplicate date',(await certify(dDup.id)).error,'P0031');
// P0040 update a locked day
log('P0040 update locked',(await db.from('rods_days').update({from_location:'Hack, TX'}).eq('id',dA.id)).error,'P0040');
// P0002 / P0041 delete attempts
const delCert=await db.from('rods_days').delete().eq('id',dA.id).select();
log('P0002 delete certified',delCert.error,'P0002 (RLS may hide row)');
console.log('delete certified rows affected:',delCert.data?.length??0);
console.table(rec);
console.log(JSON.stringify({OP,certifiedDayId:dA.id,tokA},null,1));
