// Supabase Edge Function: delete-account
// verify_jwt: true
// Elimina únicamente la cuenta del usuario autenticado que envía el JWT.
// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const supabase = createClient(supabaseUrl, serviceRoleKey);
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

async function collectUserFiles(bucket: string, prefix: string): Promise<string[]> {
  const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error || !data?.length) return [];
  const files: string[] = [];
  for (const entry of data) {
    const path = `${prefix}/${entry.name}`;
    if (entry.id) files.push(path);
    else files.push(...(await collectUserFiles(bucket, path)));
  }
  return files;
}

async function removeUserFiles(bucket: string, userId: string) {
  const files = await collectUserFiles(bucket, userId);
  if (files.length) await supabase.storage.from(bucket).remove(files);
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: corsHeaders });

  const authorization = request.headers.get("Authorization");
  const token = authorization?.replace(/^Bearer\s+/i, "").trim();
  if (!token || !serviceRoleKey) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

  const userId = authData.user.id;
  try {
    await Promise.all([removeUserFiles("profiles", userId), removeUserFiles("stories", userId)]);
    const { error: deleteError } = await supabase.auth.admin.deleteUser(userId);
    if (deleteError) throw deleteError;
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
  } catch (error) {
    console.error("delete-account failed", error);
    return new Response(JSON.stringify({ error: "No se pudo eliminar la cuenta. Inténtalo de nuevo." }), { status: 500, headers: corsHeaders });
  }
});
