import { useCallback, useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useToast } from '../lib/toast'
import { useAuth } from '../lib/auth'
import { STATUSES, MANUAL_STATUSES, TIERS, REGIONS, EVENT_LABELS, SCORE_LABELS } from '../lib/constants'
import { fmtDateTime, timeAgo, personName } from '../lib/utils'
import { StatusPill, TierBadge } from './Badges'
import InlineInput from './InlineInput'
import Modal from './Modal'

export default function LeadDrawer({ leadId, onClose, onChanged, isAdmin }) {
  const toast = useToast()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [lead, setLead] = useState(null)
  const [events, setEvents] = useState([])
  const [meetings, setMeetings] = useState([])
  const [referrer, setReferrer] = useState(null)
  const [referrals, setReferrals] = useState([])
  const [assignments, setAssignments] = useState([])
  const [people, setPeople] = useState({})
  const [note, setNote] = useState('')
  const [modal, setModal] = useState(null) // 'status' | 'call' | 'meeting' | 'dnc'
  const [form, setForm] = useState({})

  const load = useCallback(async () => {
    const [l, e, m, p, r, a] = await Promise.all([
      supabase.from('leads').select('*, companies(*)').eq('id', leadId).maybeSingle(),
      supabase.from('lead_events').select('*').eq('lead_id', leadId).order('occurred_at', { ascending: false }).limit(100),
      supabase.from('meetings').select('*').eq('lead_id', leadId).order('scheduled_at', { ascending: false }),
      supabase.from('profiles').select('id, full_name, email'),
      supabase.from('lead_referrals').select('*').eq('from_lead_id', leadId),
      supabase.from('lead_assignments').select('assigned_at, experiments(id, name, factor, status), experiment_variants(key, name)').eq('lead_id', leadId),
    ])
    if (l.error) return toast.error(l.error.message)
    setLead(l.data); setEvents(e.data ?? []); setMeetings(m.data ?? []); setReferrals(r.data ?? []); setAssignments(a.data ?? [])
    setPeople(Object.fromEntries((p.data ?? []).map((x) => [x.id, x])))
    if (l.data?.referred_by_lead_id) {
      const { data: ref } = await supabase.from('leads').select('id, full_name, job_title, status').eq('id', l.data.referred_by_lead_id).maybeSingle()
      setReferrer(ref)
    } else setReferrer(null)
  }, [leadId, toast])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && !modal && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, modal])

  const saveLead = async (patch) => {
    const { error } = await supabase.from('leads').update(patch).eq('id', leadId)
    if (error) return toast.error(`Could not save: ${error.message}`)
    load(); onChanged?.()
  }
  const saveCompany = async (patch) => {
    if (!lead?.company_id) return
    const { error } = await supabase.from('companies').update(patch).eq('id', lead.company_id)
    if (error) return toast.error(`Could not save: ${error.message}`)
    load(); onChanged?.()
  }
  const addEvent = async (type, channel, payload) => {
    const { error } = await supabase.from('lead_events').insert({ lead_id: leadId, type, channel, source: 'app', payload, created_by: user.id })
    if (error) toast.error(error.message)
  }

  const postNote = async () => {
    if (!note.trim()) return
    await addEvent('note', 'system', { text: note.trim() })
    setNote(''); load()
  }

  const setStatus = async () => {
    const { error } = await supabase.rpc('set_lead_status', { p_lead: leadId, p_status: form.status, p_reason: form.reason || null, p_next_action: form.next || null })
    if (error) return toast.error(error.message)
    setModal(null); load(); onChanged?.()
  }

  const logCall = async () => {
    const outcome = form.outcome || 'no_answer'
    const type = outcome === 'no_answer' ? 'call_attempted' : outcome === 'voicemail' ? 'call_voicemail' : 'call_outcome'
    await addEvent(type, 'call', { outcome, notes: form.notes, by: 'human' })
    const patch = { call_attempts: (lead.call_attempts || 0) + 1 }
    if (outcome === 'not_interested') Object.assign(patch, { status: 'not_interested', status_reason: form.notes || 'Said no on a call' })
    if (outcome === 'call_back') Object.assign(patch, { status: 'not_now', status_reason: 'Asked to be called back', next_action_at: form.next || null })
    if (outcome === 'wrong_number') Object.assign(patch, { status: 'unreachable', status_reason: 'Wrong number' })
    await saveLead(patch)
    setModal(null)
  }

  const bookMeeting = async () => {
    if (!form.when) return toast.error('Pick a date and time')
    const { data, error } = await supabase.from('meetings').insert({
      lead_id: leadId, scheduled_at: new Date(form.when).toISOString(), timezone: form.tz || 'Africa/Johannesburg',
      booked_via: 'manual', summary: form.summary || null,
    }).select().single()
    if (error) return toast.error(error.message)
    await addEvent('meeting_booked', 'system', { meeting_id: data.id, scheduled_at: data.scheduled_at, by: 'human' })
    await saveLead({ status: 'meeting_booked', status_reason: 'Booked by hand', next_action_at: null })
    setModal(null)
  }

  const addReferral = async () => {
    const { data, error } = await supabase.rpc('add_referral', {
      p_from: leadId,
      p_lead: { full_name: form.name, job_title: form.title, email: form.email, phone: form.phone, company: form.company, same_company: !form.company, note: form.note },
    })
    if (error) return toast.error(error.message)
    toast.success(`${form.name} added as a referral`)
    setModal(null); onChanged?.()
    navigate(`/leads/${data}`)
  }

  const addDnc = async () => {
    const { error } = await supabase.from('do_not_contact').insert({ email: lead.email, phone: lead.email ? null : lead.phone, reason: form.reason || 'Asked us to stop', source: 'manual', added_by: user.id })
    if (error) return toast.error(error.message)
    toast.success('Added to the do-not-contact list')
    setModal(null); load(); onChanged?.()
  }

  const setMeetingOutcome = async (m, outcome) => {
    const patch = { outcome }
    if (outcome === 'confirmed') Object.assign(patch, { confirmed_at: new Date().toISOString(), confirmed_by: user.id })
    const { error } = await supabase.from('meetings').update(patch).eq('id', m.id)
    if (error) return toast.error(error.message)
    const typeMap = { confirmed: 'meeting_confirmed', held: 'meeting_held', no_show: 'meeting_no_show', cancelled: 'meeting_cancelled' }
    if (typeMap[outcome]) await addEvent(typeMap[outcome], 'system', { meeting_id: m.id })
    load()
  }

  if (!lead) return <aside className="drawer"><div className="drawer-body"><p className="muted">Loading lead</p></div></aside>
  const c = lead.companies
  const open = (kind, init = {}) => { setForm(init); setModal(kind) }

  return (
    <aside className="drawer drawer-wide" aria-label={`Lead: ${lead.full_name}`}>
      <div className="drawer-head">
        <div className="drawer-nav">
          {lead.status === 'referral' && referrer ? <StatusPill status="referral" to={`/leads/${referrer.id}`} title={`Referred by ${referrer.full_name}. Open their lead`} />
            : lead.status === 'deferred' && referrals[0] ? <StatusPill status="deferred" to={`/leads/${referrals[0].to_lead_id}`} title={`Referred us to ${referrals[0].full_name}. Open their lead`} />
            : <StatusPill status={lead.status} />}
          <TierBadge tier={lead.tier} score={lead.score} />
          <span className="drawer-pos">{REGIONS[lead.region] ?? ''}</span>
          <button className="icon-btn" onClick={onClose} aria-label="Close">×</button>
        </div>
        <InlineInput className="drawer-title" value={lead.full_name} onSave={(v) => v.trim() && saveLead({ full_name: v.trim() })} aria-label="Name" />
        <InlineInput className="drawer-sub" value={lead.job_title ?? ''} placeholder="Job title" onSave={(v) => saveLead({ job_title: v.trim() || null })} aria-label="Job title" />
        <p className="next-action"><strong>Next:</strong> {STATUSES[lead.status]?.next}{lead.next_action_at ? ` (${fmtDateTime(lead.next_action_at)})` : ''}</p>
        {lead.status_reason && <p className="muted small">{lead.status_reason}</p>}
        {referrer && <p className="small">Referred by <Link to={`/leads/${referrer.id}`}>{referrer.full_name}</Link>{referrer.job_title ? `, ${referrer.job_title}` : ''}</p>}
        {referrals.length > 0 && <p className="small">Referred us to {referrals.map((r, i) => <span key={r.to_lead_id}>{i > 0 ? ', ' : ''}<Link to={`/leads/${r.to_lead_id}`}>{r.full_name}</Link></span>)}</p>}
        <div className="row-actions wrap">
          {lead.status !== 'dnc' && <>
            {lead.status === 'new' && <button className="btn btn-primary btn-sm" onClick={() => saveLead({ status: 'ready', status_reason: 'Approved for outreach' })}>Mark ready</button>}
            <button className="btn btn-ghost btn-sm" onClick={() => open('status', { status: lead.status, reason: '' })}>Set status</button>
            <button className="btn btn-ghost btn-sm" onClick={() => open('call', { outcome: 'no_answer' })}>Log a call</button>
            <button className="btn btn-ghost btn-sm" onClick={() => open('meeting', { tz: lead.region === 'GB' ? 'Europe/London' : 'Africa/Johannesburg' })}>Book meeting</button>
            <button className="btn btn-ghost btn-sm" onClick={() => open('referral', {})}>Add referral</button>
            <button className="btn btn-danger-ghost btn-sm" onClick={() => open('dnc', {})}>Do not contact</button>
          </>}
          {lead.status === 'dnc' && <span className="muted small">On the do-not-contact list. {isAdmin ? 'Remove them on the Do not contact page to re-open.' : ''}</span>}
        </div>
      </div>

      <div className="drawer-body">
        <section className="facts">
          <h3>Contact</h3>
          <dl>
            <dt>Email</dt><dd><InlineInput className="input input-inline" value={lead.email ?? ''} placeholder="none" onSave={(v) => saveLead({ email: v.trim() || null })} /></dd>
            <dt>Phone</dt><dd><InlineInput className="input input-inline" value={lead.phone ?? ''} placeholder="none" onSave={(v) => saveLead({ phone: v.trim() || null })} /></dd>
            <dt>LinkedIn</dt><dd>{lead.linkedin_url ? <a href={lead.linkedin_url} target="_blank" rel="noreferrer">Profile</a> : <InlineInput className="input input-inline" value="" placeholder="paste URL" onSave={(v) => saveLead({ linkedin_url: v.trim() || null })} />}</dd>
            <dt>Region</dt><dd>
              <select className="input input-compact" value={lead.region ?? ''} onChange={(e) => saveLead({ region: e.target.value || null })}>
                <option value="">Unknown</option>{Object.entries(REGIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </dd>
            <dt>Source</dt><dd>{lead.source}{lead.connectwise_contact_id ? `, ConnectWise #${lead.connectwise_contact_id}` : ''}</dd>
            <dt>Calls</dt><dd>{lead.call_attempts} {lead.call_attempts === 1 ? 'attempt' : 'attempts'}</dd>
          </dl>
        </section>

        <section className="facts">
          <h3>Company</h3>
          {c ? (
            <dl>
              <dt>Name</dt><dd><InlineInput className="input input-inline" value={c.name} onSave={(v) => v.trim() && saveCompany({ name: v.trim() })} /></dd>
              <dt>Domain</dt><dd>{c.domain ?? <span className="muted">unknown</span>}</dd>
              <dt>Industry</dt><dd><InlineInput className="input input-inline" value={c.industry ?? ''} placeholder="unknown" onSave={(v) => saveCompany({ industry: v.trim() || null })} /></dd>
              <dt>Employees</dt><dd><InlineInput type="number" className="input input-inline" value={c.employee_count ?? ''} placeholder="unknown" onSave={(v) => saveCompany({ employee_count: v ? Number(v) : null, employee_band: null })} /> {c.employee_band && <span className="muted small">({c.employee_band})</span>}</dd>
              <dt>DMARC</dt><dd>
                <select className="input input-compact" value={c.dmarc_status ?? 'unknown'} onChange={(e) => saveCompany({ dmarc_status: e.target.value })}>
                  <option value="unknown">Unknown</option><option value="present">Present</option><option value="missing">Missing</option>
                </select>
              </dd>
              <dt>Exposure</dt><dd>
                {Object.keys(c.exposure ?? {}).length ? Object.entries(c.exposure).map(([k, v]) => <span key={k} className="tag">{k.replace(/_/g, ' ')}: {String(v)}</span>) : <span className="muted">Nothing recorded. n8n fills this in from Shodan.</span>}
              </dd>
            </dl>
          ) : <p className="muted small">No company linked.</p>}
        </section>

        <section className="facts">
          <h3>Score: {lead.score} ({TIERS[lead.tier]?.label})</h3>
          {Object.keys(lead.score_breakdown ?? {}).length === 0 ? <p className="muted small">No points yet. Add an industry, company size or exposure data.</p> : (
            <ul className="score-list">
              {Object.entries(lead.score_breakdown).map(([k, v]) => <li key={k}><span>{SCORE_LABELS[k] ?? k}</span><strong>+{v}</strong></li>)}
            </ul>
          )}
        </section>

        {meetings.length > 0 && (
          <section className="facts">
            <h3>Meetings</h3>
            {meetings.map((m) => (
              <div key={m.id} className="meeting-row">
                <div><strong>{fmtDateTime(m.scheduled_at, m.timezone)}</strong> <span className="muted small">{m.timezone}, via {m.booked_via.replace('_', ' ')}</span><div className="muted small">{m.outcome}{m.notification_sent_at ? ', SDR team emailed' : ''}</div>{m.summary && <p className="small">{m.summary}</p>}{m.recording_url && <a className="small" href={m.recording_url} target="_blank" rel="noreferrer">Recording</a>}</div>
                <div className="row-actions">
                  {m.outcome === 'scheduled' && <button className="btn btn-primary btn-sm" onClick={() => setMeetingOutcome(m, 'confirmed')}>Confirm</button>}
                  {['scheduled', 'confirmed'].includes(m.outcome) && <>
                    <button className="btn btn-ghost btn-sm" onClick={() => setMeetingOutcome(m, 'held')}>Held</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setMeetingOutcome(m, 'no_show')}>No show</button>
                    <button className="btn btn-danger-ghost btn-sm" onClick={() => setMeetingOutcome(m, 'cancelled')}>Cancel</button>
                  </>}
                </div>
              </div>
            ))}
          </section>
        )}

        {assignments.length > 0 && (
          <section className="facts">
            <h3>A/B tests</h3>
            <ul className="plain-list small">
              {assignments.map((x, i) => <li key={i}><Link to={`/experiments/${x.experiments?.id}`}>{x.experiments?.name}</Link>: group <strong>{x.experiment_variants?.key}</strong>, {x.experiment_variants?.name} <span className="muted">({x.experiments?.status})</span></li>)}
            </ul>
          </section>
        )}

        <section className="facts">
          <h3>Notes</h3>
          <InlineInput multiline className="input" value={lead.notes ?? ''} placeholder="Anything the team should know about this lead" onSave={(v) => saveLead({ notes: v.trim() || null })} />
        </section>

        <section className="facts">
          <h3>Timeline</h3>
          <div className="comment-form">
            <textarea className="input" rows={2} value={note} placeholder="Add a note to the timeline" onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) postNote() }} />
            <button className="btn btn-ghost btn-sm" disabled={!note.trim()} onClick={postNote}>Add</button>
          </div>
          <ul className="timeline">
            {events.map((e) => (
              <li key={e.id} className={`tl tl-${e.channel}`}>
                <div className="tl-head">
                  <strong>{EVENT_LABELS[e.type] ?? e.type}</strong>
                  {e.type === 'status_changed' && e.payload?.to && <> <StatusPill status={e.payload.to} /></>}
                  <span className="tl-meta">{e.source !== 'app' ? e.source : personName(people, e.created_by)}, {timeAgo(e.occurred_at)}</span>
                </div>
                {renderPayload(e)}
              </li>
            ))}
          </ul>
        </section>
      </div>

      {modal === 'status' && (
        <Modal title="Set status" onClose={() => setModal(null)} footer={<><button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button><button className="btn btn-primary" onClick={setStatus}>Save</button></>}>
          <div className="stack">
            <label>Status<select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{MANUAL_STATUSES.map((s) => <option key={s} value={s}>{STATUSES[s].label}</option>)}</select></label>
            <p className="muted small">{STATUSES[form.status]?.hint}</p>
            <label>Reason<input className="input" value={form.reason ?? ''} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></label>
            {form.status === 'not_now' && <label>Contact again on<input className="input" type="datetime-local" value={form.next ?? ''} onChange={(e) => setForm({ ...form, next: e.target.value })} /></label>}
          </div>
        </Modal>
      )}
      {modal === 'call' && (
        <Modal title="Log a call" onClose={() => setModal(null)} footer={<><button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button><button className="btn btn-primary" onClick={logCall}>Save</button></>}>
          <div className="stack">
            <label>Outcome<select className="input" value={form.outcome} onChange={(e) => setForm({ ...form, outcome: e.target.value })}>
              <option value="no_answer">No answer</option><option value="voicemail">Left voicemail</option><option value="connected">Spoke to them</option>
              <option value="call_back">Asked to be called back</option><option value="not_interested">Not interested</option><option value="wrong_number">Wrong number</option>
            </select></label>
            {form.outcome === 'call_back' && <label>Call back on<input className="input" type="datetime-local" value={form.next ?? ''} onChange={(e) => setForm({ ...form, next: e.target.value })} /></label>}
            <label>Notes<textarea className="input" rows={3} value={form.notes ?? ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
          </div>
        </Modal>
      )}
      {modal === 'meeting' && (
        <Modal title="Book a meeting" onClose={() => setModal(null)} footer={<><button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button><button className="btn btn-primary" onClick={bookMeeting}>Book</button></>}>
          <div className="stack">
            <label>Date and time<input className="input" type="datetime-local" value={form.when ?? ''} onChange={(e) => setForm({ ...form, when: e.target.value })} /></label>
            <label>Time zone<select className="input" value={form.tz} onChange={(e) => setForm({ ...form, tz: e.target.value })}><option value="Africa/Johannesburg">South Africa</option><option value="Europe/London">United Kingdom</option></select></label>
            <label>Summary<textarea className="input" rows={3} value={form.summary ?? ''} onChange={(e) => setForm({ ...form, summary: e.target.value })} placeholder="What they want to talk about" /></label>
          </div>
        </Modal>
      )}
      {modal === 'referral' && (
        <Modal title={`${lead.full_name} referred us to someone`} onClose={() => setModal(null)} footer={<><button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button><button className="btn btn-primary" disabled={!form.name || (!form.email && !form.phone)} onClick={addReferral}>Add referral</button></>}>
          <div className="stack">
            <p className="muted small">A new lead is created with status Referral, linked back to {lead.full_name}, who becomes Deferred. Same company unless you type a different one.</p>
            <label>Name<input className="input" autoFocus value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label>Job title<input className="input" value={form.title ?? ''} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
            <div className="row-2">
              <label>Email<input className="input" type="email" value={form.email ?? ''} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
              <label>Phone<input className="input" value={form.phone ?? ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
            </div>
            <label>Company, only if different<input className="input" value={form.company ?? ''} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder={c?.name ?? ''} /></label>
            <label>What they said<textarea className="input" rows={2} value={form.note ?? ''} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="e.g. Sarah owns security decisions" /></label>
          </div>
        </Modal>
      )}
      {modal === 'dnc' && (
        <Modal title="Add to do-not-contact" onClose={() => setModal(null)} footer={<><button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button><button className="btn btn-primary" onClick={addDnc}>Add</button></>}>
          <div className="stack">
            <p>{lead.full_name} will never be emailed or called again, and this lead will be closed.</p>
            <label>Reason<input className="input" value={form.reason ?? ''} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="e.g. Asked us to stop" /></label>
          </div>
        </Modal>
      )}
    </aside>
  )
}

function renderPayload(e) {
  const p = e.payload || {}
  if (e.type === 'note') return <p className="tl-text">{p.text}</p>
  if (e.type === 'status_changed') return p.reason ? <p className="tl-text muted">{p.reason}</p> : null
  if (e.type === 'score_changed') return <p className="tl-text muted">{p.from_score} to {p.to_score}</p>
  if (e.type === 'email_replied' && p.reply_text) return <p className="tl-text">{String(p.reply_text).slice(0, 600)}</p>
  if (e.channel === 'call') return (
    <p className="tl-text muted">
      {[p.outcome, p.duration ? `${p.duration}s` : null, p.notes, p.next_action].filter(Boolean).join(', ')}
      {p.recording_url && <> <a href={p.recording_url} target="_blank" rel="noreferrer">Recording</a></>}
    </p>
  )
  if (e.type === 'dnc_added') return <p className="tl-text muted">{p.reason}</p>
  if (e.type === 'referral_made') return <p className="tl-text">To <Link to={`/leads/${p.to_lead_id}`}>{p.to_name}</Link>{p.note ? `. ${p.note}` : ''}</p>
  if (e.type === 'referral_received') return <p className="tl-text">From <Link to={`/leads/${p.from_lead_id}`}>{p.from_name}</Link>{p.note ? `. ${p.note}` : ''}</p>
  return null
}
