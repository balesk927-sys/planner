import { NextRequest,NextResponse } from "next/server";
import webpush from "web-push";
import { getSupabaseAdmin } from "@/lib/supabase";
export const runtime="nodejs";
export async function POST(req:NextRequest){
 try{
  if(!process.env.CRON_SECRET||req.headers.get("authorization")!==`Bearer ${process.env.CRON_SECRET}`)return NextResponse.json({error:"Unauthorized"},{status:401});
  const db=getSupabaseAdmin();const now=Date.now();
  const {data:events,error:eErr}=await db.from("planner_events").select("page_id,title,start_at,reminder_minutes,url").eq("is_deleted",false).eq("is_completed",false).gt("reminder_minutes",0).gte("start_at",new Date(now-24*60*60*1000).toISOString()).lte("start_at",new Date(now+24*60*60*1000).toISOString());if(eErr)throw eErr;
  const {data:subs,error:sErr}=await db.from("push_subscriptions").select("endpoint,subscription");if(sErr)throw sErr;
  if(!process.env.VAPID_PRIVATE_KEY||!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY)throw new Error("VAPID keys belum dikonfigurasi.");
  webpush.setVapidDetails(process.env.VAPID_SUBJECT||"mailto:planner@example.com",process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,process.env.VAPID_PRIVATE_KEY);
  let sent=0,expired=0;
  for(const event of events||[]){const due=new Date(new Date(event.start_at).getTime()-Number(event.reminder_minutes)*60_000);if(due.getTime()>now||due.getTime()<=now-3*60_000)continue;
   for(const sub of subs||[]){const key=`${event.page_id}|${event.start_at}|${sub.endpoint}`;const {data:exists}=await db.from("notification_deliveries").select("id").eq("delivery_key",key).maybeSingle();if(exists)continue;
    try{await webpush.sendNotification(sub.subscription,JSON.stringify({title:`Pengingat: ${event.title}`,body:`Dimulai ${new Date(event.start_at).toLocaleString("id-ID",{timeZone:process.env.APP_TIME_ZONE||"Asia/Jakarta",hour:"2-digit",minute:"2-digit",day:"2-digit",month:"short"})}`,url:event.url||"/",tag:`planner-${event.page_id}-${new Date(event.start_at).getTime()}`}));sent++;await db.from("notification_deliveries").insert({delivery_key:key,event_page_id:event.page_id,scheduled_at:due.toISOString()});}
    catch(err:any){if(err.statusCode===404||err.statusCode===410){expired++;await db.from("push_subscriptions").delete().eq("endpoint",sub.endpoint);}else console.error("Push failed",err.message);}
   }
  }
  return NextResponse.json({ok:true,sent,expired,checked:events?.length||0});
 }catch(e:any){return NextResponse.json({error:e.message||"Dispatch notifikasi gagal."},{status:500});}
}
