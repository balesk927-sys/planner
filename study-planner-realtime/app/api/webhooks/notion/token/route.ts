import { NextResponse } from "next/server";
import { hasEditorSession } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
export const runtime="nodejs";
export async function GET(){
  if(!await hasEditorSession())return NextResponse.json({error:"Buka mode edit dengan PIN terlebih dahulu."},{status:401});
  try{
    const token=process.env.NOTION_WEBHOOK_VERIFICATION_TOKEN;
    if(token)return NextResponse.json({verificationToken:token},{headers:{"Cache-Control":"no-store"}});
    const db=getSupabaseAdmin();
    const {data,error}=await db.from("app_secrets").select("secret_value").eq("secret_name","notion_webhook_verification_token").maybeSingle();
    if(error)throw error;
    if(!data?.secret_value)return NextResponse.json({error:"Token belum diterima. Daftarkan webhook di Notion terlebih dahulu."},{status:404});
    return NextResponse.json({verificationToken:data.secret_value},{headers:{"Cache-Control":"no-store"}});
  }catch(e:any){return NextResponse.json({error:e.message||"Gagal mengambil token."},{status:500});}
}
