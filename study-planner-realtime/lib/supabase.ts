import { createClient, SupabaseClient } from "@supabase/supabase-js";
let admin: SupabaseClient | null = null;
export function getSupabaseAdmin(): SupabaseClient {
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key) throw new Error("Supabase belum dikonfigurasi. Isi URL dan SERVICE_ROLE_KEY.");
  if(!admin) admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  return admin;
}
export function isSupabaseConfigured(){return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL&&process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY&&process.env.SUPABASE_SERVICE_ROLE_KEY)}
