// The Queen : fonction "notifier" (Supabase > Edge Functions).
// Elle réveille le téléphone de ta moitié. Elle ne voit jamais le contenu :
// elle transmet seulement un petit aperçu déjà chiffré par ton téléphone.
//
// Secrets à créer (Edge Functions > Secrets) : VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY
import webpush from "npm:web-push@3.6.7";
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
  if (req.method !== "POST") return reply(405, { error: "method" });

  const url = Deno.env.get("SUPABASE_URL")!;
  const user = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: who } = await user.auth.getUser();
  if (!who?.user) return reply(401, { error: "auth" });

  let id = "";
  try { id = String((await req.json()).id ?? ""); } catch { /* vide */ }
  if (!/^[0-9a-f-]{36}$/i.test(id)) return reply(400, { error: "id" });

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: msg } = await admin.from("messages").select("sender, recipient, notif").eq("id", id).maybeSingle();
  if (!msg || msg.sender !== who.user.id) return reply(403, { error: "message" });

  const { data: subs } = await admin.from("push_abonnements").select("endpoint, p256dh, auth").eq("user_id", msg.recipient);
  webpush.setVapidDetails(
    "https://k2kimmorka60-stack.github.io/The-Queen/",
    Deno.env.get("VAPID_PUBLIC_KEY")!,
    Deno.env.get("VAPID_PRIVATE_KEY")!,
  );
  const payload = JSON.stringify({ n: msg.notif ?? null });
  let sent = 0;
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400, urgency: "high" });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await admin.from("push_abonnements").delete().eq("endpoint", s.endpoint);
    }
  }
  return reply(200, { sent });
});
