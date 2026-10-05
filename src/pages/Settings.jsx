import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../lib/toast'
import { useAuth } from '../lib/auth'

const PROJECT_URL = import.meta.env.VITE_SUPABASE_URL

export default function Settings() {
  const toast = useToast()
  const { user, isAdmin } = useAuth()
  const [settings, setSettings] = useState(null)
  const [draft, setDraft] = useState({})
  const [people, setPeople] = useState([])
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const [s, p] = await Promise.all([
      supabase.from('settings').select('*'),
      isAdmin ? supabase.from('profiles').select('*').order('created_at') : Promise.resolve({ data: [] }),
    ])
    if (s.error) return toast.error(s.error.message)
    const map = Object.fromEntries(s.data.map((r) => [r.key, r.value]))
    setSettings(map)
    setDraft({
      target_industries_ZA: (map.target_industries_ZA || []).join('\n'),
      target_industries_GB: (map.target_industries_GB || []).join('\n'),
      target_titles: (map.target_titles || []).join('\n'),
      ideal_employee_bands: (map.ideal_employee_bands || []).join(', '),
      green: map.tier_thresholds?.green ?? 80,
      gold: map.tier_thresholds?.gold ?? 50,
      max_call_attempts: map.max_call_attempts ?? 6,
      notification_email: map.notification_email ?? 'sales@j2mssp.com',
    })
    setPeople(p.data ?? [])
  }, [isAdmin, toast])
  useEffect(() => { load() }, [load])

  const lines = (s) => s.split('\n').map((x) => x.trim()).filter(Boolean)

  const save = async () => {
    setBusy(true)
    const rows = [
      { key: 'target_industries_ZA', value: lines(draft.target_industries_ZA) },
      { key: 'target_industries_GB', value: lines(draft.target_industries_GB) },
      { key: 'target_titles', value: lines(draft.target_titles) },
      { key: 'ideal_employee_bands', value: draft.ideal_employee_bands.split(',').map((x) => x.trim()).filter(Boolean) },
      { key: 'tier_thresholds', value: { green: Number(draft.green), gold: Number(draft.gold) } },
      { key: 'max_call_attempts', value: Number(draft.max_call_attempts) },
      { key: 'notification_email', value: draft.notification_email.trim() },
    ].map((r) => ({ ...r, updated_by: user.id }))
    const { error } = await supabase.from('settings').upsert(rows, { onConflict: 'key' })
    if (error) { setBusy(false); return toast.error(error.message) }
    const { data: n, error: e2 } = await supabase.rpc('rescore_all_leads')
    setBusy(false)
    if (e2) return toast.error(e2.message)
    toast.success(`Saved. ${n} leads re-scored.`)
    load()
  }

  const setAccess = async (person, approved, role) => {
    const { error } = await supabase.rpc('set_user_access', { target: person.id, make_approved: approved, make_role: role })
    if (error) return toast.error(error.message)
    load()
  }

  if (!settings) return <div className="splash">Loading settings</div>
  const waiting = people.filter((p) => !p.approved)
  const active = people.filter((p) => p.approved)

  return (
    <div className="page">
      <h1>Settings</h1>

      <section className="panel">
        <h2>Targeting and scoring</h2>
        <p className="muted small">Leads get points for matching these. Lists are in order: the first item scores highest. Saving re-scores every lead.</p>
        <div className="row-2">
          <label>Target industries, South Africa (one per line)<textarea className="input" rows={6} value={draft.target_industries_ZA} onChange={(e) => setDraft({ ...draft, target_industries_ZA: e.target.value })} disabled={!isAdmin} /></label>
          <label>Target industries, United Kingdom (one per line)<textarea className="input" rows={6} value={draft.target_industries_GB} onChange={(e) => setDraft({ ...draft, target_industries_GB: e.target.value })} disabled={!isAdmin} /></label>
        </div>
        <div className="row-2">
          <label>Decision-maker titles (one per line)<textarea className="input" rows={6} value={draft.target_titles} onChange={(e) => setDraft({ ...draft, target_titles: e.target.value })} disabled={!isAdmin} /></label>
          <div className="stack">
            <label>Ideal company sizes, best first (comma separated: 1-50, 50-200, 200-1000, 1000+)<input className="input" value={draft.ideal_employee_bands} onChange={(e) => setDraft({ ...draft, ideal_employee_bands: e.target.value })} disabled={!isAdmin} /></label>
            <div className="row-2">
              <label>Green from score<input className="input" type="number" min="0" max="100" value={draft.green} onChange={(e) => setDraft({ ...draft, green: e.target.value })} disabled={!isAdmin} /></label>
              <label>Gold from score<input className="input" type="number" min="0" max="100" value={draft.gold} onChange={(e) => setDraft({ ...draft, gold: e.target.value })} disabled={!isAdmin} /></label>
            </div>
            <div className="row-2">
              <label>Max call attempts per lead<input className="input" type="number" min="1" max="20" value={draft.max_call_attempts} onChange={(e) => setDraft({ ...draft, max_call_attempts: e.target.value })} disabled={!isAdmin} /></label>
              <label>Booking notifications go to<input className="input" type="email" value={draft.notification_email} onChange={(e) => setDraft({ ...draft, notification_email: e.target.value })} disabled={!isAdmin} /></label>
            </div>
          </div>
        </div>
        <div className="score-key">
          <strong>How points work</strong>
          <span>Industry match: 30, 25, 20 for the top three, 15 for others. Company size: 25, 15, 10 in the order above. Exposed systems: up to 25. DMARC missing: 10. Decision-maker title: 10. Has phone: 5. Has email: 5.</span>
        </div>
        {isAdmin ? <div className="form-actions"><button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? 'Saving' : 'Save and re-score'}</button></div> : <p className="muted small">Only admins can change these.</p>}
      </section>

      <section className="panel">
        <h2>Connections</h2>
        <p className="muted small">These are the addresses other systems use to talk to J2 Outreach. Each one needs the shared secret, set once in Supabase under Edge Functions, Secrets, as <code>WEBHOOK_SECRET</code>. Send it as the header <code>x-webhook-secret</code>, or add <code>?secret=...</code> to the address.</p>
        <dl className="endpoints">
          <dt>n8n: push leads in</dt><dd><code>POST {PROJECT_URL}/functions/v1/n8n/leads</code><span className="muted small">Body: one lead or a list. Same fields as the CSV import.</span></dd>
          <dt>n8n: add Shodan or DNS findings</dt><dd><code>POST {PROJECT_URL}/functions/v1/n8n/companies</code><span className="muted small">Body: {'{'}"domain", "exposure": {'{'}"open_ports": 3, "vulns": 1{'}'}, "dmarc_status": "missing"{'}'}</span></dd>
          <dt>n8n: get leads to work</dt><dd><code>GET {PROJECT_URL}/functions/v1/n8n/queue?status=ready&amp;tier=gold&amp;limit=50</code></dd>
          <dt>n8n: record an event or status</dt><dd><code>POST {PROJECT_URL}/functions/v1/n8n/events</code><br /><code>POST {PROJECT_URL}/functions/v1/n8n/status</code></dd>
          <dt>Jobix call results</dt><dd><code>{PROJECT_URL}/functions/v1/webhook-jobix</code><span className="muted small">Use as the callback_url when triggering a call. Pass lead_id in the call context.</span></dd>
          <dt>Instantly email events</dt><dd><code>{PROJECT_URL}/functions/v1/webhook-instantly</code><span className="muted small">Add in Instantly under Integrations, Webhooks, for replies, bounces and unsubscribes.</span></dd>
        </dl>
        <p className="muted small">Booking emails are sent through Resend if a <code>RESEND_API_KEY</code> secret is set. Without it, meetings are still recorded and n8n can send the email instead.</p>
      </section>

      {isAdmin && (
        <section className="panel">
          <h2>Team</h2>
          {waiting.length > 0 && <>
            <h3>Waiting for approval</h3>
            <ul className="people">{waiting.map((p) => (
              <li key={p.id}><span><strong>{p.full_name}</strong> <span className="muted">{p.email}</span></span>
                <span className="row-actions"><button className="btn btn-primary btn-sm" onClick={() => setAccess(p, true, 'sdr')}>Approve as SDR</button><button className="btn btn-ghost btn-sm" onClick={() => setAccess(p, true, 'member')}>Approve as member</button></span></li>
            ))}</ul>
          </>}
          <h3>Members</h3>
          <ul className="people">{active.map((p) => (
            <li key={p.id}><span><strong>{p.full_name}</strong> <span className="muted">{p.email}</span><span className="tag">{p.role}</span></span>
              {p.id !== user.id && <span className="row-actions">
                <select className="input input-compact" value={p.role} onChange={(e) => setAccess(p, true, e.target.value)}><option value="admin">Admin</option><option value="member">Member</option><option value="sdr">SDR</option></select>
                <button className="btn btn-danger-ghost btn-sm" onClick={() => setAccess(p, false, p.role)}>Remove access</button>
              </span>}
            </li>
          ))}</ul>
        </section>
      )}
    </div>
  )
}
