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
const {data:op}=await db.from('operators').select('id').eq('user_id',vo.user.id).maybeSingle();
const OP=op.id, uuid=()=>crypto.randomUUID();
const certify=(id,tok=uuid(),name='Demo Driver')=>db.rpc('certify_rods_day',{_day_id:id,_legal_name:name,_signature_path:'sig/x.png',_pdf_path:null,_device_info:'seeded-run',p_certification_token:tok});
const out=[];
// P0012: foreign-owned day
const f=await certify(process.env.FOREIGN_DAY_ID);
out.push({label:'P0012 foreign day',code:f.error?.code??null,msg:f.error?.message});
// Amendment flow on the certified day
const CERT='b9204ddc-9ce2-483b-a22a-3e8d4b504b76';
const {data:orig}=await db.from('rods_days').select('*').eq('id',CERT).single();
const RESET=new Set(['id','created_at','updated_at','status','locked','certified_at','certified_by','certification_legal_name','certification_signature_path','certification_device_info','certification_token','pdf_path','supersedes_day_id','amendment_reason']);
const draft={};for(const[k,v]of Object.entries(orig))if(!RESET.has(k))draft[k]=v;
Object.assign(draft,{status:'draft',locked:false,supersedes_day_id:CERT,amendment_reason:'Corrected destination and mileage'});
// --- negative control: amendment on a DIFFERENT date must trip the deferred continuity trigger at COMMIT
const bad={...draft,log_date:'2020-01-03'};
const {data:badDraft,error:badErr}=await db.from('rods_days').insert(bad).select().single();
if(badErr){out.push({label:'bad draft insert',code:badErr.code,msg:badErr.message});}
else{
  const {error:be}=await db.from('rods_events').insert({rods_day_id:badDraft.id,start_minute:0,end_minute:1440,duty_status:1,city:'Dallas',state:'TX'});
  const bc=await certify(badDraft.id);
  out.push({label:'continuity trigger (deferred, date-mismatch amendment)',code:bc.error?.code??null,msg:bc.error?.message??'(no error)',eventsErr:be?.message});
  await db.from('rods_days').delete().eq('id',badDraft.id);
}
// --- real amendment, same date
const {data:good,error:ge}=await db.from('rods_days').insert({...draft,to_location:'Austin, TX',total_miles_driving_today:142}).select().single();
if(ge){out.push({label:'amend draft insert',code:ge.code,msg:ge.message});}
else{
  await db.from('rods_events').insert({rods_day_id:good.id,start_minute:0,end_minute:1440,duty_status:1,city:'Dallas',state:'TX'});
  const n=await db.rpc('record_rods_amendments',{_day_id:good.id,_reason:'Corrected destination and mileage',_changes:[
    {field_path:'to_location',old_value:orig.to_location,new_value:'Austin, TX'},
    {field_path:'total_miles_driving_today',old_value:String(orig.total_miles_driving_today),new_value:'142'}]});
  out.push({label:'record_rods_amendments rows written',code:n.error?.code??null,msg:String(n.data??n.error?.message)});
  const c=await certify(good.id);
  out.push({label:'certify amendment',code:c.error?.code??null,msg:c.error?.message??'(no error)'});
  const {data:days}=await db.from('rods_days').select('id,log_date,status,locked,supersedes_day_id,to_location,total_miles_driving_today').eq('operator_id',OP).order('log_date');
  console.log('DAYS',JSON.stringify(days,null,1));
  const {data:am}=await db.from('rods_amendments').select('field_path,old_value,new_value,reason').eq('rods_day_id',good.id);
  console.log('AMENDMENTS',JSON.stringify(am,null,1));
}
console.table(out);
