// The API that n8n (the lead data node) talks to.
// Base URL: https://<project>.supabase.co/functions/v1/n8n
// Auth:     header  x-webhook-secret: <WEBHOOK_SECRET>
//
//   POST /n8n/leads       body: one lead object or an array  -> imports (dedupe, DNC check, scoring)
//   POST /n8n/companies   body: {domain, exposure:{open_ports,vulns,...}, dmarc_status, industry, employee_count}
//   POST /n8n/events      body: {lead_id | email | phone, type, channel, payload, external_id}
//   POST /n8n/status      body: {lead_id | email, status, reason, next_action_at}
//   GET  /n8n/queue?status=ready&tier=gold&region=ZA&limit=50   -> leads to act on
//   GET  /n8n/lead?email=...  or ?phone=...  or ?id=...          -> one lead with company
//   GET  /n8n/experiments   -> running A/B experiments with their variants, plus the playbook
//   GET  /n8n/playbook      -> current settings per factor (what to do when no experiment covers it)
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

async function findLead(q: { id?: string; email?: string; phone?: string }) {
  let query = supabase.from("leads").select("*, companies(*)");
  if (q.id) query = query.eq("id", q.id);
  else if (q.email) query = query.eq("email", q.email.toLowerCase().trim());
  else if (q.phone) query = query.eq("phone", q.phone.replace(/[^0-9+]/g, ""));
  else return null;
  const { data } = await query.limit(1).maybeSingle();
  return data;
}

Deno.serve(async (req) => {
  if (!authorised(req)) return json({ error: "Unauthorised" }, 401);
  const url = new URL(req.url);
  const route = url.pathname.replace(/^\/n8n\/?/, "").replace(/\/$/, "");
  const q = Object.fromEntries(url.searchParams.entries());

  try {
    if (req.method === "GET" && route === "queue") {
      let query = supabase.from("leads").select("*, companies(name, domain, industry, employee_band, exposure, dmarc_status)")
        .eq("status", q.status || "ready")
        .order("score", { ascending: false })
        .limit(Math.min(Number(q.limit || 50), 500));
      if (q.tier) query = query.eq("tier", q.tier);
      if (q.region) query = query.eq("region", q.region);
      if (q.due === "true") query = query.lte("next_action_at", new Date().toISOString());
      const { data, error } = await query;
      if (error) throw error;
      // Attach each lead's experiment variants so n8n can route it (campaign, script, timing)
      const ids = data.map((l) => l.id);
      const { data: asg } = ids.length
        ? await supabase.from("lead_assignments").select("lead_id, experiments!inner(id, name, factor, status), experiment_variants(id, key, name, config)").in("lead_id", ids).eq("experiments.status", "running")
        : { data: [] };
      const byLead: Record<string, Record<string, unknown>> = {};
      for (const a of asg ?? []) {
        const ex = a.experiments as { id: string; name: string; factor: string };
        const v = a.experiment_variants as { id: string; key: string; name: string; config: unknown };
        (byLead[a.lead_id] ??= {})[ex.factor] = { experiment_id: ex.id, experiment: ex.name, variant: v.key, variant_id: v.id, name: v.name, config: v.config };
      }
      const { data: pb } = await supabase.from("playbook").select("factor, config");
      const playbook = Object.fromEntries((pb ?? []).map((r) => [r.factor, r.config]));
      return json({ count: data.length, playbook, leads: data.map((l) => ({ ...l, experiments: byLead[l.id] ?? {} })) });
    }

    if (req.method === "GET" && route === "experiments") {
      const { data, error } = await supabase.from("experiments").select("id, name, factor, channel, goal_metric, status, started_at, experiment_variants(id, key, name, config, is_control, weight)").eq("status", "running");
      if (error) throw error;
      const { data: pb } = await supabase.from("playbook").select("factor, config, updated_at");
      return json({ playbook: pb ?? [], experiments: data });
    }

    if (req.method === "GET" && route === "playbook") {
      const { data, error } = await supabase.from("playbook").select("*");
      if (error) throw error;
      return json(Object.fromEntries((data ?? []).map((r) => [r.factor, r.config])));
    }

    if (req.method === "GET" && route === "lead") {
      const lead = await findLead(q);
      return lead ? json(lead) : json({ error: "Lead not found" }, 404);
    }

    if (req.method !== "POST") return json({ error: "Unknown route" }, 404);
    const body = await req.json();

    if (route === "leads") {
      const rows = Array.isArray(body) ? body : [body];
      const { data, error } = await supabase.rpc("import_leads", { rows, p_filename: "n8n", p_source: String(q.source || "n8n") });
      if (error) throw error;
      return json(data);
    }

    if (route === "companies") {
      const domain = String(body.domain || "").toLowerCase().trim();
      if (!domain) return json({ error: "domain is required" }, 400);
      const patch: Record<string, unknown> = {};
      if (body.exposure) patch.exposure = body.exposure;
      if (body.dmarc_status) patch.dmarc_status = body.dmarc_status;
      if (body.industry) patch.industry = body.industry;
      if (body.employee_count) patch.employee_count = Number(body.employee_count);
      if (body.tech_stack) patch.tech_stack = body.tech_stack;
      if (body.country) patch.country = body.country;
      if (body.connectwise_company_id) patch.connectwise_company_id = body.connectwise_company_id;
      const { data: existing } = await supabase.from("companies").select("id").eq("domain", domain).maybeSingle();
      if (existing) {
        const { error } = await supabase.from("companies").update(patch).eq("id", existing.id);
        if (error) throw error;
        return json({ ok: true, company_id: existing.id, updated: true });
      }
      const { data, error } = await supabase.from("companies").insert({ name: body.name || domain, domain, ...patch }).select("id").single();
      if (error) throw error;
      return json({ ok: true, company_id: data.id, created: true });
    }

    if (route === "events") {
      const lead = await findLead(body);
      if (!lead) return json({ error: "Lead not found" }, 404);
      const { error } = await supabase.from("lead_events").insert({
        lead_id: lead.id, type: body.type, channel: body.channel || "system", source: String(body.source || "n8n"),
        external_id: body.external_id || null, payload: body.payload || {},
        occurred_at: body.occurred_at || new Date().toISOString(),
      });
      if (error) throw error;
      if (body.type === "crm_synced" && body.payload?.connectwise_contact_id) {
        await supabase.from("leads").update({ connectwise_contact_id: body.payload.connectwise_contact_id }).eq("id", lead.id);
      }
      return json({ ok: true, lead_id: lead.id });
    }

    if (route === "status") {
      const lead = await findLead(body);
      if (!lead) return json({ error: "Lead not found" }, 404);
      const { error } = await supabase.rpc("set_lead_status", {
        p_lead: lead.id, p_status: body.status, p_reason: body.reason || null, p_next_action: body.next_action_at || null,
      });
      if (error) throw error;
      if (body.external_ids) {
        await supabase.from("leads").update({ external_ids: { ...(lead.external_ids || {}), ...body.external_ids } }).eq("id", lead.id);
      }
      return json({ ok: true, lead_id: lead.id, status: body.status });
    }

    return json({ error: "Unknown route" }, 404);
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
});
