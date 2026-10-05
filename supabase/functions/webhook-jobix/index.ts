// Receives call results from Jobix.AI (the callback_url we pass when triggering a call).
// Secured with a shared secret: send header  x-webhook-secret: <WEBHOOK_SECRET>
// or append ?secret=<WEBHOOK_SECRET> if the provider cannot set headers.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function authorised(req: Request): boolean {
  const secret = Deno.env.get("WEBHOOK_SECRET");
  if (!secret) return false;
  const url = new URL(req.url);
  return req.headers.get("x-webhook-secret") === secret || url.searchParams.get("secret") === secret;
}

// Map whatever Jobix calls an outcome onto our statuses.
function classify(outcome: string | undefined, appointmentBooked: boolean) {
  const o = (outcome || "").toLowerCase();
  if (appointmentBooked || /appoint|booked|qualified|meeting/.test(o)) return "meeting_booked";
  if (/dnc|do_not_call|do not call|remove/.test(o)) return "dnc";
  if (/refer/.test(o)) return "referral";
  if (/interest|send_info|send info|more info|follow_up|follow up/.test(o) && !/not_interest|no_interest|not interested/.test(o)) return "interested";
  if (/not_interested|not interested|declined|no_interest/.test(o)) return "not_interested";
  if (/callback|call_back|call back|later|not_now|busy/.test(o)) return "not_now";
  if (/voicemail/.test(o)) return "voicemail";
  if (/no_answer|no answer|unanswered|failed|busy_signal|disconnected/.test(o)) return "no_answer";
  if (/wrong/.test(o)) return "wrong_person";
  if (/transfer/.test(o)) return "transferred";
  return "connected";
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!authorised(req)) return json({ error: "Unauthorised" }, 401);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const ctx = (body.context as Record<string, unknown>) || {};
  const callId = String(body.call_id ?? body.id ?? "");
  const phone = String(body.phone ?? body.to ?? ctx.phone ?? "");
  const leadId = String(body.lead_id ?? ctx.lead_id ?? "");
  const appointmentBooked = Boolean(body.appointment_booked);
  const kind = classify(body.outcome as string, appointmentBooked);

  // Find the lead: by id we passed in context, else by phone number.
  let lead: { id: string; call_attempts: number; status: string } | null = null;
  if (leadId) {
    const { data } = await supabase.from("leads").select("id, call_attempts, status").eq("id", leadId).maybeSingle();
    lead = data;
  }
  if (!lead && phone) {
    const digits = phone.replace(/[^0-9+]/g, "");
    const { data } = await supabase.from("leads").select("id, call_attempts, status").eq("phone", digits).limit(1).maybeSingle();
    lead = data;
  }
  if (!lead) return json({ error: "Lead not found", lead_id: leadId, phone }, 404);

  // Ignore a webhook we have already processed.
  if (callId) {
    const { data: dup } = await supabase.from("lead_events").select("id").eq("source", "jobix").eq("external_id", callId).maybeSingle();
    if (dup) return json({ ok: true, duplicate: true });
  }

  const eventType =
    kind === "voicemail" ? "call_voicemail" :
    kind === "no_answer" ? "call_attempted" :
    kind === "transferred" ? "call_transferred" : "call_outcome";

  await supabase.from("lead_events").insert({
    lead_id: lead.id,
    type: eventType,
    channel: "call",
    source: "jobix",
    external_id: callId || null,
    payload: {
      outcome: body.outcome, duration: body.duration, lead_score: body.lead_score, next_action: body.next_action,
      recording_url: body.recording_url, transcript: body.transcript, appointment_time: body.appointment_time,
    },
  });

  const { data: settings } = await supabase.from("settings").select("key, value").in("key", ["max_call_attempts", "notification_email"]);
  const maxAttempts = Number(settings?.find((s) => s.key === "max_call_attempts")?.value ?? 6);
  const notifyTo = String(settings?.find((s) => s.key === "notification_email")?.value ?? "sales@j2mssp.com");

  const attempts = lead.call_attempts + 1;
  const patch: Record<string, unknown> = { call_attempts: attempts };

  switch (kind) {
    case "meeting_booked": {
      patch.status = "meeting_booked";
      patch.status_reason = "Booked on AI call";
      patch.next_action_at = null;
      const scheduledAt = body.appointment_time ? new Date(String(body.appointment_time)) : null;
      const { data: meeting } = await supabase.from("meetings").insert({
        lead_id: lead.id,
        scheduled_at: scheduledAt && !isNaN(scheduledAt.getTime()) ? scheduledAt.toISOString() : new Date().toISOString(),
        booked_via: "ai_call",
        summary: (body.summary as string) ?? null,
        transcript: (body.transcript as string) ?? null,
        recording_url: (body.recording_url as string) ?? null,
      }).select().single();
      await supabase.from("lead_events").insert({
        lead_id: lead.id, type: "meeting_booked", channel: "call", source: "jobix",
        payload: { meeting_id: meeting?.id, scheduled_at: meeting?.scheduled_at },
      });
      if (meeting) await notifySales(meeting.id, lead.id, notifyTo);
      break;
    }
    case "dnc": {
      const { data: full } = await supabase.from("leads").select("email, phone").eq("id", lead.id).single();
      await supabase.from("do_not_contact").insert({ email: full?.email ?? null, phone: full?.phone ?? null, reason: "Asked not to be called", source: "call" });
      break; // the DNC trigger sets the lead status
    }
    case "not_interested":
      patch.status = "not_interested"; patch.status_reason = "Said no on AI call"; patch.next_action_at = null; break;
    case "not_now": {
      patch.status = "not_now"; patch.status_reason = "Asked to be called back";
      const when = body.callback_at ?? body.next_action_at;
      patch.next_action_at = when ? new Date(String(when)).toISOString() : new Date(Date.now() + 7 * 86400000).toISOString();
      break;
    }
    case "wrong_person":
      patch.status = "wrong_person"; patch.status_reason = "Not the right person; find the right contact"; patch.next_action_at = null; break;
    case "interested":
      patch.status = "interested"; patch.status_reason = (body.next_action as string) || "Showed interest on the call; follow up"; patch.next_action_at = new Date().toISOString(); break;
    case "referral": {
      const ref = (body.referral as Record<string, unknown>) || {};
      const refLead = { full_name: ref.name ?? ref.full_name, job_title: ref.title ?? ref.job_title, email: ref.email, phone: ref.phone, company: ref.company, same_company: !ref.company, note: body.summary ?? body.next_action };
      if (refLead.full_name && (refLead.email || refLead.phone)) {
        const { error } = await supabase.rpc("add_referral", { p_from: lead.id, p_lead: refLead });
        if (!error) break; // add_referral sets the referrer to Deferred
        patch.status = "deferred"; patch.status_reason = `Referral given but could not be saved: ${error.message}`; break;
      }
      patch.status = "wrong_person"; patch.status_reason = "Pointed us elsewhere but gave no usable details"; break;
    }
    case "voicemail":
    case "no_answer":
      if (attempts >= maxAttempts) { patch.status = "unreachable"; patch.status_reason = `No answer after ${attempts} attempts`; patch.next_action_at = null; }
      else { patch.status = "pending"; patch.status_reason = `No answer (attempt ${attempts} of ${maxAttempts}); next attempt scheduled`; patch.next_action_at = new Date(Date.now() + 2 * 86400000).toISOString(); }
      break;
    default:
      patch.status = lead.status === "meeting_booked" ? lead.status : "calling";
  }

  if (kind !== "dnc" && !(kind === "referral" && patch.status === undefined)) await supabase.from("leads").update(patch).eq("id", lead.id);
  else if (kind === "referral") await supabase.from("leads").update({ call_attempts: attempts }).eq("id", lead.id);
  return json({ ok: true, lead_id: lead.id, kind, attempts });
});

// Email the SDR team about a booked meeting. Uses Resend when RESEND_API_KEY is set;
// otherwise leaves notification_sent_at empty so n8n can send it instead.
async function notifySales(meetingId: string, leadId: string, to: string) {
  const key = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("NOTIFY_FROM") || "J2 Outreach <outreach@j2mssp.com>";
  if (!key) return;
  const { data: m } = await supabase.from("upcoming_meetings").select("*").eq("id", meetingId).maybeSingle();
  if (!m) return;
  const when = new Date(m.scheduled_at).toLocaleString("en-ZA", { timeZone: m.timezone, dateStyle: "full", timeStyle: "short" });
  const text = [
    `A meeting was booked by the AI caller.`,
    ``,
    `When: ${when} (${m.timezone})`,
    `Who: ${m.full_name}${m.job_title ? `, ${m.job_title}` : ""}`,
    `Company: ${m.company_name ?? "Unknown"}`,
    `Phone: ${m.phone ?? "-"}`,
    `Email: ${m.email ?? "-"}`,
    ``,
    m.summary ? `Call summary:\n${m.summary}` : ``,
    m.recording_url ? `Recording: ${m.recording_url}` : ``,
    ``,
    `Please confirm the meeting with the prospect and mark it confirmed in J2 Outreach.`,
  ].join("\n");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject: `Meeting booked: ${m.full_name} at ${m.company_name ?? "unknown company"}, ${when}`, text }),
  });
  if (res.ok) {
    await supabase.from("meetings").update({ notification_sent_at: new Date().toISOString() }).eq("id", meetingId);
    await supabase.from("lead_events").insert({ lead_id: leadId, type: "note", channel: "system", source: "app", payload: { text: `Booking email sent to ${to}` } });
  }
}
