import { cookies } from "next/headers";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
const COOKIE="planner_editor";
function hmac(value:string){const secret=process.env.PLANNER_SESSION_SECRET;if(!secret)throw new Error("PLANNER_SESSION_SECRET belum diisi.");return createHmac("sha256",secret).update(value).digest("hex");}
function safeEqual(a:string,b:string){const aa=Buffer.from(a),bb=Buffer.from(b);return aa.length===bb.length&&timingSafeEqual(aa,bb)}
export function checkPin(pin:string){const expected=process.env.PLANNER_PIN;if(!expected)throw new Error("PLANNER_PIN belum diatur di hosting.");return safeEqual(pin,expected)}
export async function startEditorSession(){
  const exp=Date.now()+12*60*60*1000;const payload=`${exp}.${randomBytes(18).toString("hex")}`;const value=`${payload}.${hmac(payload)}`;
  const jar=await cookies();jar.set(COOKIE,value,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",expires:new Date(exp)});
}
export async function endEditorSession(){const jar=await cookies();jar.delete(COOKIE)}
export async function hasEditorSession(){
  try{const jar=await cookies();const raw=jar.get(COOKIE)?.value;if(!raw)return false;const parts=raw.split(".");if(parts.length!==3)return false;const payload=`${parts[0]}.${parts[1]}`;if(!/^\d+$/.test(parts[0])||Number(parts[0])<Date.now())return false;return safeEqual(hmac(payload),parts[2]);}catch{return false}
}
