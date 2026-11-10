import { NextRequest,NextResponse } from "next/server";
import { hasEditorSession } from "@/lib/auth";
import { syncAllFromNotion } from "@/lib/events";
export const runtime="nodejs";
export async function POST(req:NextRequest){try{const cron=req.headers.get("authorization")==`Bearer ${process.env.CRON_SECRET}`&&Boolean(process.env.CRON_SECRET);if(!cron&&!await hasEditorSession())return NextResponse.json({error:"Mode edit diperlukan."},{status:401});const result=await syncAllFromNotion();return NextResponse.json({ok:true,...result,at:new Date().toISOString()});}catch(e:any){return NextResponse.json({error:e.message||"Sinkronisasi gagal."},{status:500});}}
