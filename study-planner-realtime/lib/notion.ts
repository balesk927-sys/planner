import type { EventInput, EventSource, PlannerEvent } from "./types";
const VERSION=process.env.NOTION_API_VERSION||"2025-09-03";
export function dataSourceId(source:EventSource){const id=source==="calendar"?process.env.NOTION_CALENDAR_DATA_SOURCE_ID:process.env.NOTION_TASKS_DATA_SOURCE_ID;if(!id)throw new Error(`Data source Notion untuk ${source} belum diatur.`);return id;}
function token(){const t=process.env.NOTION_TOKEN;if(!t)throw new Error("NOTION_TOKEN belum diisi.");return t;}
export async function notionRequest<T=any>(path:string,method="GET",body?:unknown):Promise<T>{
  const res=await fetch(`https://api.notion.com/v1/${path}`,{method,headers:{Authorization:`Bearer ${token()}`,"Notion-Version":VERSION,"Content-Type":"application/json"},body:body?JSON.stringify(body):undefined,cache:"no-store"});
  const data=await res.json().catch(()=>({}));if(!res.ok)throw new Error(data.message||`Notion API error (${res.status})`);return data as T;
}
export async function queryAll(source:EventSource){
  const id=dataSourceId(source);let cursor:string|undefined;const rows:any[]=[];
  do{const result=await notionRequest<any>(`data_sources/${id}/query`,"POST",{page_size:100,...(cursor?{start_cursor:cursor}:{})});rows.push(...(result.results||[]));cursor=result.has_more?result.next_cursor:undefined;}while(cursor);
  return rows;
}
export async function getNotionPage(id:string){return notionRequest<any>(`pages/${id}`)}
const text=(value:string)=>[{type:"text",text:{content:(value||"").slice(0,2000)}}];
export function toDateOnly(value:string){
  if(/^\d{4}-\d{2}-\d{2}$/.test(value))return value;
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:process.env.APP_TIME_ZONE||"Asia/Jakarta",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date(value));
  const values=Object.fromEntries(parts.map(p=>[p.type,p.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
function propertyForDate(start:string|null,end:string|null,allDay:boolean){
  if(!start)return {date:null};
  const iso=(v:string)=>allDay?toDateOnly(v):v;
  return {date:{start:iso(start),...(end?{end:iso(end)}:{})}};
}
export function buildProperties(input:EventInput){
  const dateProp=propertyForDate(input.start,input.end,input.allDay);
  if(input.source==="calendar"){
    return {Name:{title:text(input.title)},Date:dateProp,Tags:{multi_select:input.tags.map(name=>({name}))}};
  }
  const props:any={Name:{title:text(input.title)},Dates:dateProp,Notes:{rich_text:text(input.notes)},Status:{checkbox:input.completed}};
  props.Task={multi_select:input.category?[{name:input.category}]:[]};
  props.Course={select:input.course?{name:input.course}:null};
  props.Weighting={rich_text:input.weighting?text(input.weighting):[]};
  return props;
}
export async function saveNotionEvent(input:EventInput){
  const properties=buildProperties(input);
  if(input.id)return await notionRequest<any>(`pages/${input.id}`,"PATCH",{properties});
  return await notionRequest<any>("pages","POST",{parent:{data_source_id:dataSourceId(input.source)},properties});
}
export async function trashNotionPage(id:string){return notionRequest<any>(`pages/${id}`,"PATCH",{archived:true});}
function plain(rt:any[]|undefined){return (rt||[]).map(x=>x.plain_text||x.text?.content||"").join("");}
function getDateProp(props:any,name:string){return props?.[name]?.date||null;}
export function mapNotionPage(page:any,source:EventSource,previous?:any):PlannerEvent{
  const p=page.properties||{};const title=plain(p.Name?.title)||"Agenda tanpa judul";
  const date=getDateProp(p,source==="calendar"?"Date":"Dates");
  const allDay=Boolean(date?.start&&!String(date.start).includes("T"));
  const start=date?.start||null;let end=date?.end||null;
  if(start&&!end){if(allDay){const d=new Date(`${start}T00:00:00Z`);d.setUTCDate(d.getUTCDate()+1);end=d.toISOString().slice(0,10);}else end=new Date(new Date(start).getTime()+60*60*1000).toISOString();}
  const tags=source==="calendar"?(p.Tags?.multi_select||[]).map((x:any)=>x.name):(p.Task?.multi_select||[]).map((x:any)=>x.name);
  const fixedByTag=tags.some((x:string)=>["tetap","fixed","kuliah"].includes(x.toLowerCase()));
  return {id:page.id,source,title,start,end,allDay,notes:plain(p.Notes?.rich_text),tags,category:tags[0]||"",course:p.Course?.select?.name||"",weighting:plain(p.Weighting?.rich_text),completed:Boolean(p.Status?.checkbox),isFixed:previous?.is_fixed??fixedByTag,reminderMinutes:previous?.reminder_minutes??10,url:page.url||`https://www.notion.so/${String(page.id).replace(/-/g,"")}`,lastEditedTime:page.last_edited_time||null};
}
