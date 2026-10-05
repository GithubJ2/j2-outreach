// Receives email events from Instantly (replies, opens, bounces, unsubscribes).
// In Instantly: Settings > Integrations > Webhooks. Point each event at:
//   https://<project>.supabase.co/functions/v1/webhook-instantly?secret=<WEBHOOK_SECRET>
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
function authorised(req: Request): boolean {
  const secret = Deno.env.get("WEBHOOK_SECRET");
  if (!secret) return false;
  return req.headers.get("x-webhook-secret") === secret || new URL(req.url).searchParams.get("secret") === secret;
}

// Instantly event names vary slightly between versions; match loosely.
function classify(eventType: string) {
  const e = eventType.toLowerCase();
  if (/unsub/.test(e)) return "unsubscribed";
  if (/bounce/.test(e)) return "email_bounced";
  if (/repl/.test(e)) return "email_replied";
  if (/click/.test(e)) return "email_clicked";
  if (/open/.test(e)) return "email_opened";
  if (/sent/.test(e)) return "email_sent";
  return null;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!authorised(req)) return json({ error: "Unauthorised" }, 401);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const eventType = String(body.event_type ?? body.event ?? body.type ?? "");
  const kind = classify(eventType);
  if (!kind) return json({ ok: true, ignored: eventType });

  const email = String(body.lead_email ?? body.email ?? body.to_email ?? (body.lead as Record<string, unknown>)?.email ?? "").toLowerCase().trim();
  if (!email) return json({ error: "No lead email in payload" }, 400);

  const { data: lead } = await supabase.from("leads").select("id, status").eq("email", email).maybeSingle();
  if (!lead) return json({ error: "Lead not found", email }, 404);

  const externalId = body.id ? `${kind}:${body.id}` : null;
  if (externalId) {
    const { data: dup } = await supabase.from("lead_events").select("id").eq("source", "instantly").eq("external_id", externalId).maybeSingle();
    if (dup) return json({ ok: true, duplicate: true });
  }

  await supabase.from("lead_events").insert({
    lead_id: lead.id,
    type: kind,
    channel: "email",
    source: "instantly",
    external_id: externalId,
    occurred_at: body.timestamp ? new Date(String(body.timestamp)).toISOString() : new Date().toISOString(),
    payload: {
      event_type: eventType, campaign_id: body.campaign_id, campaign_name: body.campaign_name,
      email_account: body.email_account, step: body.step, subject: body.subject ?? body.email_subject,
      reply_text: body.reply_text ?? body.reply_text_snippet ?? body.body, is_auto_reply: body.is_auto_reply,
    },
  });

  const patch: Record<string, unknown> = {};
  switch (kind) {
    case "unsubscribed":
      await supabase.from("do_not_contact").insert({ email, reason: "Unsubscribed from email", source: "opt_out" });
      return json({ ok: true, lead_id: lead.id, kind }); // DNC trigger closes the lead
    case "email_bounced":
      patch.status = "unreachable"; patch.status_reason = "Email bounced"; break;
    case "email_replied":
      if (!["meeting_booked", "dnc"].includes(lead.status) && !body.is_auto_reply) {
        patch.status = "replied"; patch.status_reason = "Replied to email"; patch.next_action_at = new Date().toISOString();
      }
      break;
    case "email_sent":
      if (["new", "ready"].includes(lead.status)) { patch.status = "in_sequence"; patch.status_reason = "First email sent"; }
      break;
  }
  if (Object.keys(patch).length) await supabase.from("leads").update(patch).eq("id", lead.id);
  return json({ ok: true, lead_id: lead.id, kind });
});
