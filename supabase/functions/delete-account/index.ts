// Edge Function: delete the signed-in user's account and all of their sets.
//
// Why a server function? Deleting a user needs the admin ("service role") key, which bypasses
// every security rule and must never be in the app. Here it only exists as a server-side
// environment variable that Supabase injects; it is not in this repo.
//
// Safety:
//   - Supabase verifies the caller's login token before this code runs (verify_jwt = true).
//   - The account to delete is read FROM that verified token. The request body cannot name
//     another user, so nobody can delete someone else's account.
//   - Only POST, only from our own site (CORS), and the body must say { "confirm": "DELETE" }.
//   - The user's rows in public.sets go with them (foreign key ON DELETE CASCADE).
import { createClient } from "jsr:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set([
  "https://marcus-villan.github.io",
  "http://localhost:5173",
  "http://localhost:4173",
]);

function corsHeaders(origin: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://marcus-villan.github.io",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

Deno.serve(async (req: Request) => {
  const headers = { ...corsHeaders(req.headers.get("origin")), "Content-Type": "application/json" };
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });

  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return reply(405, { error: "Method not allowed" });

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return reply(401, { error: "Not signed in" });

  let body: { confirm?: unknown } = {};
  try { body = await req.json(); } catch { /* handled below */ }
  if (body?.confirm !== "DELETE") return reply(400, { error: "Confirmation missing" });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Who is calling? Ask Supabase Auth to validate the token and tell us the user.
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return reply(401, { error: "Not signed in" });

  const { error: deleteError } = await admin.auth.admin.deleteUser(data.user.id);
  if (deleteError) {
    console.error("delete-account failed", deleteError.message);
    return reply(500, { error: "Could not delete the account. Please try again." });
  }
  return reply(200, { deleted: true });
});
