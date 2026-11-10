import { NextRequest,NextResponse } from "next/server";
import { hasEditorSession } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { fromRow,upsertEvent } from "@/lib/events";
import { saveNotionEvent,trashNotionPage,toDateOnly } from "@/lib/notion";
import { rescheduleConflicts } from "@/lib/scheduler";
import type { EventInput,PlannerEvent } from "@/lib/types";
export const runtime="nodejs";
const responseError=(e:any)=>NextResponse.json({error:e?.message||"Terjadi kesalahan."},{status:500});
export async function GET(){try{const db=getSupabaseAdmin();let {data,error}=await db.from("planner_events").select("*").eq("is_deleted",false).order("start_at",{ascending:true});if(error)throw error;if((data||[]).length===0&&process.env.NOTION_TOKEN){await (await import("@/lib/events")).syncAllFromNotion();const refreshed=await db.from("planner_events").select("*").eq("is_deleted",false).order("start_at",{ascending:true});if(refreshed.error)throw refreshed.error;data=refreshed.data;}return NextResponse.json({events:(data||[]).map(fromRow)});}catch(e:any){return responseError(e);}}
export async function POST(req:NextRequest){
 try{
  if(!await hasEditorSession())return NextResponse.json({error:"Buka mode edit dengan PIN terlebih dahulu."},{status:401});
  const body=await req.json() as EventInput; if(!body.title?.trim())return NextResponse.json({error:"Judul agenda wajib diisi."},{status:400});
  if(!body.start||!body.end)return NextResponse.json({error:"Waktu mulai dan selesai wajib diisi."},{status:400});
  if(Number.isNaN(Date.parse(body.start))||Number.isNaN(Date.parse(body.end))||new Date(body.end)<=new Date(body.start))return NextResponse.json({error:"Waktu selesai harus setelah waktu mulai."},{status:400});
  if(body.source!=="calendar"&&body.source!=="tasks")return NextResponse.json({error:"Jenis agenda tidak valid."},{status:400});
  if(!Array.isArray(body.tags)||body.tags.some((tag:any)=>typeof tag!=="string"))return NextResponse.json({error:"Tag agenda tidak valid."},{status:400});
  if(body.id){const db=getSupabaseAdmin();const {data:prior,error}=await db.from("planner_events").select("source").eq("page_id",body.id).maybeSingle();if(error)throw error;if(prior&&prior.source!==body.source)return NextResponse.json({error:"Jenis database agenda tidak dapat diubah saat mengedit. Buat agenda baru pada database tujuan."},{status:400});}
  const input:EventInput={...body,title:body.title.trim(),source:body.source||"calendar",start:body.allDay?toDateOnly(body.start):body.start,end:body.allDay?toDateOnly(body.end):body.end,notes:(body.notes||"").slice(0,2000),tags:body.tags||[],isFixed:Boolean(body.spontaneous||body.isFixed),reminderMinutes:Math.max(0,Math.min(1440,Number(body.reminderMinutes)||0))};
  const saved=await saveNotionEvent(input);
  const event:PlannerEvent={...input,id:saved.id,url:saved.url,lastEditedTime:saved.last_edited_time};
  await upsertEvent(event);
  const db=getSupabaseAdmin();const {data:rows,error}=await db.from("planner_events").select("*").eq("is_deleted",false);if(error)throw error;
  const existing=(rows||[]).map(fromRow) as PlannerEvent[];
  const plan=rescheduleConflicts(existing,event);
  const movedOk:PlannerEvent[]=[];const moveFailures:string[]=[];
  for(const moved of plan.moved){
   try{const updated=await saveNotionEvent({...moved,id:moved.id} as EventInput);await upsertEvent({...moved,lastEditedTime:updated.last_edited_time});movedOk.push(moved);}
   catch{moveFailures.push(moved.title);}
  }
  return NextResponse.json({ok:true,event,moved:movedOk.map(x=>({id:x.id,title:x.title,start:x.start,end:x.end})),blocked:[...plan.blocked,...moveFailures]});
 }catch(e:any){return responseError(e);}
}
export async function DELETE(req:NextRequest){
 try{if(!await hasEditorSession())return NextResponse.json({error:"Mode edit terkunci."},{status:401});const {id}=await req.json();if(!id)return NextResponse.json({error:"ID agenda tidak ditemukan."},{status:400});await trashNotionPage(id);const db=getSupabaseAdmin();const {error}=await db.from("planner_events").update({is_deleted:true,updated_at:new Date().toISOString()}).eq("page_id",id);if(error)throw error;return NextResponse.json({ok:true});}catch(e:any){return responseError(e);}
}
