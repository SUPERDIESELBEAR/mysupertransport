import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1';
import { companyIdForUser } from '../_shared/tenancy.ts';
import { buildPacketParts, combineParts, PacketError } from '../_shared/invoice/packet.ts';
const ROLES=['dispatcher','management','owner'];
const UUID=/^[0-9a-f-]{36}$/i;
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,'Content-Type':'application/json'}});
async function cover(loadNumber:string){const p=await PDFDocument.create(),g=p.addPage([612,792]),b=await p.embedFont(StandardFonts.HelveticaBold),r=await p.embedFont(StandardFonts.Helvetica);g.drawRectangle({x:0,y:778,width:612,height:14,color:rgb(.79,.66,.3)});g.drawText('PREVIEW — INVOICE NOT YET ISSUED',{x:48,y:690,size:18,font:b});g.drawText(`Load ${loadNumber}`,{x:48,y:664,size:11,font:r});return new Uint8Array(await p.save());}
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders}); if(req.method!=='POST')return json({error:'Method not allowed'},405);
 const auth=req.headers.get('Authorization')??''; if(!auth.startsWith('Bearer '))return json({error:'Unauthorized'},401);
 const url=Deno.env.get('SUPABASE_URL')!,admin=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!),user=createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:auth}}});
 const {data:claims,error:ae}=await user.auth.getClaims(auth.slice(7)),uid=claims?.claims?.sub as string|undefined;if(ae||!uid)return json({error:'Unauthorized'},401);
 const {data:rr}=await admin.from('user_roles').select('role').eq('user_id',uid).in('role',ROLES).limit(1);if(!rr?.length)return json({error:'Forbidden'},403);
 const body=await req.json().catch(()=>({})),loadId=typeof body?.load_id==='string'?body.load_id:'';if(!UUID.test(loadId))return json({error:'Load not found'},404);
 let companyId:string;try{companyId=await companyIdForUser(admin,uid)}catch{return json({error:'Forbidden'},403)}
 const [{data:load},{data:factor}]=await Promise.all([admin.from('loads').select('id,load_number').eq('id',loadId).eq('company_id',companyId).maybeSingle(),admin.from('factoring_companies').select('packet_style').eq('company_id',companyId).eq('is_default',true).maybeSingle()]);
 if(!load)return json({error:'Load not found'},404);if(!factor)return json({error:'No default factoring company is configured'},409);if(factor.packet_style!=='combined')return json({error:'This factoring company uses separate attachments'},409);
 const {data:invoice}=await admin.from('invoices').select('id,invoice_number').eq('load_id',loadId).eq('company_id',companyId).order('created_at',{ascending:false}).limit(1).maybeSingle();let invoiceBytes:Uint8Array;
 if(invoice){const {data:saved}=await admin.from('invoice_files').select('storage_path').eq('invoice_id',invoice.id).eq('company_id',companyId).maybeSingle();if(saved){const {data:blob,error}=await admin.storage.from('invoice-files').download(saved.storage_path);if(error||!blob)return json({error:'The saved invoice PDF could not be read'},500);invoiceBytes=new Uint8Array(await blob.arrayBuffer())}else{const res=await fetch(`${url}/functions/v1/generate-invoice-pdf`,{method:'POST',headers:{Authorization:auth,'Content-Type':'application/json'},body:JSON.stringify({invoice_id:invoice.id,dry_run:true})});if(!res.ok)return json(await res.json().catch(()=>({error:'Invoice preview failed'})),res.status);invoiceBytes=new Uint8Array(await res.arrayBuffer())}}else invoiceBytes=await cover(load.load_number);
 // P79 order and contents, built by the module send-invoice-packet also uses.
 let packet;try{packet=await combineParts(await buildPacketParts(admin,companyId,loadId,{bytes:invoiceBytes,name:invoice?.invoice_number??'preview invoice'}))}catch(e){if(e instanceof PacketError)return json({error:e.message},e.status);throw e}
 const {bytes,pageCount,manifest}=packet;return new Response(bytes,{headers:{...corsHeaders,'Content-Type':'application/pdf','Content-Disposition':`inline; filename="Packet-${load.load_number}.pdf"`,'X-Page-Count':String(pageCount),'X-Packet-Bytes':String(bytes.byteLength),'X-Packet-Manifest':encodeURIComponent(JSON.stringify(manifest)),'Access-Control-Expose-Headers':'X-Page-Count, X-Packet-Bytes, X-Packet-Manifest'}})
});
