import type { PlannerEvent } from "./types";
const STEP=15*60*1000;
const DAY=24*60*60*1000;
const OPEN_HOUR=6, CLOSE_HOUR=22;
const TZ=process.env.APP_TIME_ZONE||"Asia/Jakarta";
function localParts(ms:number){
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:TZ,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date(ms));
  const v=Object.fromEntries(parts.map(p=>[p.type,p.value]));
  return {year:Number(v.year),month:Number(v.month),date:Number(v.day),hour:Number(v.hour),minute:Number(v.minute)};
}
function fromLocal(y:number,mo:number,d:number,h:number,m:number){
  const target=Date.UTC(y,mo-1,d,h,m,0,0);const p=localParts(target);const represented=Date.UTC(p.year,p.month-1,p.date,p.hour,p.minute,0,0);return target+(target-represented);
}
function atLocal(ms:number,h:number,m:number){const p=localParts(ms);return fromLocal(p.year,p.month,p.date,h,m);}
function interval(e:PlannerEvent){
  if(!e.start||!e.end)return null;
  if(!e.allDay)return [new Date(e.start).getTime(),new Date(e.end).getTime()] as [number,number];
  const p=localParts(new Date(e.start).getTime());return [fromLocal(p.year,p.month,p.date,0,0),fromLocal(p.year,p.month,p.date+1,0,0)] as [number,number];
}
const overlaps=(a:PlannerEvent,b:PlannerEvent)=>{
  const ia=interval(a),ib=interval(b);if(!ia||!ib)return false;
  return ia[0]<ib[1]&&ia[1]>ib[0];
};
function slotFor(event:PlannerEvent,after:number,obstacles:PlannerEvent[],maxDays=14){
  const origin=Math.max(new Date(event.start!).getTime(),after);
  if(event.allDay){
    const p=localParts(origin);
    for(let day=0;day<maxDays;day++){
      const start=fromLocal(p.year,p.month,p.date+day,0,0);
      const end=fromLocal(p.year,p.month,p.date+day+1,0,0);
      const startDate=localParts(start),endDate=localParts(end);
      const trial={...event,start:`${startDate.year}-${String(startDate.month).padStart(2,"0")}-${String(startDate.date).padStart(2,"0")}`,end:`${endDate.year}-${String(endDate.month).padStart(2,"0")}-${String(endDate.date).padStart(2,"0")}`};
      if(!obstacles.some(o=>overlaps(trial,o)))return trial;
    }
    return null;
  }
  const duration=Math.max(15*60*1000,(new Date(event.end!).getTime()-new Date(event.start!).getTime()));
  const startDay=atLocal(origin,OPEN_HOUR,0);
  for(let day=0;day<maxDays;day++){
    const dayStart=startDay+day*DAY;let candidate=Math.max(dayStart,Math.ceil(origin/STEP)*STEP);
    if(day>0)candidate=dayStart;
    const last=atLocal(dayStart,CLOSE_HOUR,0)-duration;
    for(;candidate<=last;candidate+=STEP){
      const trial={...event,start:new Date(candidate).toISOString(),end:new Date(candidate+duration).toISOString()};
      if(!obstacles.some(o=>overlaps(trial,o)))return trial;
    }
  }
  return null;
}
export function rescheduleConflicts(events:PlannerEvent[],incoming:PlannerEvent){
  if(!incoming.start||!incoming.end)return {moved:[] as PlannerEvent[],blocked:[] as string[]};
  const changedId=incoming.id;
  const immovable=events.filter(e=>e.id!==changedId&&(e.isFixed||e.completed)&&overlaps(e,incoming));
  const affected=events.filter(e=>e.id!==changedId&&!e.isFixed&&!e.completed&&overlaps(e,incoming)).sort((a,b)=>(a.start||"").localeCompare(b.start||""));
  const obstacles=events.filter(e=>e.id!==changedId&&!affected.some(a=>a.id===e.id));obstacles.push(incoming);
  const moved:PlannerEvent[]=[];const blocked:string[]=immovable.map(e=>e.title);
  for(const event of affected){const slot=slotFor(event,new Date(incoming.end!).getTime(),obstacles);if(!slot){blocked.push(event.title);continue;}moved.push(slot);obstacles.push(slot);}
  return {moved,blocked};
}
