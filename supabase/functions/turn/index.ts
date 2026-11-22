// The Queen : fonction "turn" (Supabase > Edge Functions).
// Donne au téléphone des identifiants temporaires (24 h) pour le relais d'appels Cloudflare.
// Le relais transporte l'appel déjà chiffré : il ne peut ni écouter ni regarder.
//
// Secrets à créer : CF_TURN_KEY_ID, CF_TURN_API_TOKEN (Cloudflare > Realtime > TURN Server)
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const user = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: who } = await user.auth.getUser();
  if (!who?.user) return reply(401, { error: "auth" });
  const { data: member } = await user.rpc("est_membre");
  if (member !== true) return reply(403, { error: "membre" });

  const keyId = Deno.env.get("CF_TURN_KEY_ID"), token = Deno.env.get("CF_TURN_API_TOKEN");
  if (!keyId || !token) return reply(200, { iceServers: [] });
  const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate-ice-servers`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ttl: 86400 }),
  });
  if (!r.ok) return reply(200, { iceServers: [] });
  const j = await r.json();
  return reply(200, { iceServers: j.iceServers ?? [] });
});
