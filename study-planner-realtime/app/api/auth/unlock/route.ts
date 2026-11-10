import { NextRequest,NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { checkPin,startEditorSession } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
export const runtime="nodejs";
function clientHash(req:NextRequest){
  const ip=(req.headers.get("x-forwarded-for")||req.headers.get("x-real-ip")||"unknown").split(",")[0].trim();
  const secret=process.env.PLANNER_SESSION_SECRET||"";
  return createHash("sha256").update(`${secret}:${ip}`).digest("hex");
}
export async function POST(req:NextRequest){
  try{
    const body=await req.json();const pin=String(body.pin||"");
    if(!pin||pin.length>128)return NextResponse.json({error:"PIN tidak sesuai."},{status:401});
    const db=getSupabaseAdmin();const ipHash=clientHash(req);const now=new Date();
    const {data:record,error}=await db.from("planner_pin_attempts").select("attempts,window_started_at,locked_until").eq("ip_hash",ipHash).maybeSingle();
    if(error)throw error;
    if(record?.locked_until&&new Date(record.locked_until)>now)return NextResponse.json({error:"Terlalu banyak percobaan. Coba lagi 15 menit kemudian."},{status:429});
    const inWindow=record&&now.getTime()-new Date(record.window_started_at).getTime()<15*60*1000;
    if(!checkPin(pin)){
      const attempts=inWindow?(record?.attempts||0)+1:1;
      const lockedUntil=attempts>=5?new Date(now.getTime()+15*60*1000).toISOString():null;
      const {error:saveError}=await db.from("planner_pin_attempts").upsert({ip_hash:ipHash,attempts,window_started_at:inWindow?record!.window_started_at:now.toISOString(),locked_until:lockedUntil,updated_at:now.toISOString()},{onConflict:"ip_hash"});
      if(saveError)throw saveError;
      return NextResponse.json({error:lockedUntil?"Terlalu banyak percobaan. Mode edit terkunci 15 menit.":"PIN tidak sesuai."},{status:lockedUntil?429:401});
    }
    const {error:clearError}=await db.from("planner_pin_attempts").delete().eq("ip_hash",ipHash);if(clearError)throw clearError;
    await startEditorSession();return NextResponse.json({ok:true});
  }catch(e:any){return NextResponse.json({error:e.message||"Gagal membuka mode edit."},{status:500});}
}
