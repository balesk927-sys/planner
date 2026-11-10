import { NextRequest,NextResponse } from "next/server";
import { createHmac,timingSafeEqual } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getNotionPage } from "@/lib/notion";
import { syncAllFromNotion,syncOnePage } from "@/lib/events";
export const runtime="nodejs";
function verify(raw:string,signature:string,secret:string){const expected=createHmac("sha256",secret).update(raw).digest("hex");const received=signature.replace(/^sha256=/,"");try{const a=Buffer.from(expected,"hex"),b=Buffer.from(received,"hex");return a.length===b.length&&timingSafeEqual(a,b);}catch{return false;}}
async function storedSecret(){if(process.env.NOTION_WEBHOOK_VERIFICATION_TOKEN)return process.env.NOTION_WEBHOOK_VERIFICATION_TOKEN;const db=getSupabaseAdmin();const {data}=await db.from("app_secrets").select("secret_value").eq("secret_name","notion_webhook_verification_token").maybeSingle();return data?.secret_value||null;}
async function persistSecret(value:string){const db=getSupabaseAdmin();const {error}=await db.from("app_secrets").upsert({secret_name:"notion_webhook_verification_token",secret_value:value,updated_at:new Date().toISOString()},{onConflict:"secret_name"});if(error)throw error;}
export async function POST(req:NextRequest){
 const raw=await req.text();let payload:any;try{payload=JSON.parse(raw);}catch{return NextResponse.json({error:"Payload JSON tidak valid."},{status:400});}
 try{
  const signature=req.headers.get("x-notion-signature")||"";
  // The initial Notion handshake has no signature. Capture its token once,
  // then use the token to authenticate every subsequent delivery.
  if(payload.verification_token&&!signature){
    const existing=await storedSecret();
    if(existing&&existing!==String(payload.verification_token))return NextResponse.json({error:"Token verifikasi sudah tersimpan. Hapus secret lama sebelum mendaftarkan ulang webhook."},{status:409});
    if(!existing)await persistSecret(String(payload.verification_token));
    return NextResponse.json({ok:true,verificationTokenCaptured:true});
  }
  const secret=await storedSecret();if(!secret||!signature||!verify(raw,signature,secret))return NextResponse.json({error:"Signature webhook tidak valid."},{status:401});
  const id=payload.entity?.id;const type=payload.type||payload.event_type;
  if(type?.includes("deleted")||type?.includes("archived")){if(id){const db=getSupabaseAdmin();await db.from("planner_events").update({is_deleted:true,updated_at:new Date().toISOString()}).eq("page_id",id);}return NextResponse.json({ok:true});}
  const entityType=payload.entity?.entity_type||payload.entity?.type;
  if(entityType==="page"&&id){const page=await getNotionPage(id);await syncOnePage(page);}else{await syncAllFromNotion();}
  return NextResponse.json({ok:true});
 }catch(e:any){return NextResponse.json({error:e.message||"Webhook gagal diproses."},{status:500});}
}
