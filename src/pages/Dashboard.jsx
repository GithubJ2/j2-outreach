import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { STATUSES, TIERS, EVENT_LABELS } from '../lib/constants'
import { fmtDateTime, timeAgo } from '../lib/utils'
import { StatusPill } from '../components/Badges'

export default function Dashboard() {
  const [counts, setCounts] = useState(null)
  const [activity, setActivity] = useState([])
  const [meetings, setMeetings] = useState([])
  const [recent, setRecent] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    ;(async () => {
      const [c, a, m, r] = await Promise.all([
        supabase.from('lead_counts').select('*'),
        supabase.from('activity_7d').select('*'),
        supabase.from('upcoming_meetings').select('*').limit(6),
        supabase.from('lead_events').select('id, type, occurred_at, payload, leads(id, full_name)').order('occurred_at', { ascending: false }).limit(12),
      ])
      const err = [c, a, m, r].find((x) => x.error)
      if (err) return setError(err.error.message)
      setCounts(c.data); setActivity(a.data); setMeetings(m.data); setRecent(r.data)
    })()
  }, [])

  const byStatus = useMemo(() => {
    const o = {}
    for (const row of counts ?? []) o[row.status] = (o[row.status] || 0) + row.n
    return o
  }, [counts])
  const byTier = useMemo(() => {
    const o = { green: 0, gold: 0, red: 0 }
    for (const row of counts ?? []) if (!['dnc', 'archived'].includes(row.status)) o[row.tier] = (o[row.tier] || 0) + row.n
    return o
  }, [counts])
  const total = Object.values(byStatus).reduce((a, b) => a + b, 0)
  const act = (type) => activity.filter((a) => a.type === type).reduce((n, a) => n + a.n, 0)
  const booked7d = act('meeting_booked')
  const sent7d = act('email_sent')
  const replied7d = act('email_replied')
  const calls7d = act('call_attempted') + act('call_connected') + act('call_voicemail') + act('call_outcome') + act('call_transferred')
  const connected7d = act('call_connected') + act('call_outcome') + act('call_transferred')
  const needsPerson = (byStatus.replied || 0) + (byStatus.meeting_booked || 0)

  if (error) return <div className="page"><p className="form-error">{error}</p></div>
  if (!counts) return <div className="splash">Loading overview</div>

  return (
    <div className="page page-wide">
      <div className="page-head">
        <h1>Overview</h1>
        <div className="row-actions">
          <Link to="/import" className="btn btn-ghost">Import leads</Link>
          <Link to="/leads?status=ready" className="btn btn-primary">Work the queue</Link>
        </div>
      </div>

      {total === 0 && (
        <div className="empty">
          <p>No leads yet. Import a Lusha export to get started, or let n8n push leads in.</p>
          <Link to="/import" className="btn btn-primary">Import leads</Link>
        </div>
      )}

      <div className="stats stats-5">
        <div><strong>{total}</strong><span>leads in total</span></div>
        <div><strong>{byStatus.ready || 0}</strong><span>ready for outreach</span></div>
        <div><strong>{sent7d}</strong><span>emails sent, 7 days</span></div>
        <div><strong>{calls7d}</strong><span>calls made, 7 days</span></div>
        <div><strong className="good">{booked7d}</strong><span>meetings booked, 7 days</span></div>
      </div>

      <div className="grid-2">
        <section className="panel">
          <h2>Needs a person</h2>
          {needsPerson === 0 ? <p className="muted">Nothing waiting. Replies and new bookings will appear here.</p> : (
            <ul className="plain-list">
              {byStatus.replied > 0 && <li><Link to="/leads?status=replied"><StatusPill status="replied" /> {byStatus.replied} {byStatus.replied === 1 ? 'reply' : 'replies'} to answer</Link></li>}
              {byStatus.meeting_booked > 0 && <li><Link to="/meetings"><StatusPill status="meeting_booked" /> {byStatus.meeting_booked} {byStatus.meeting_booked === 1 ? 'meeting' : 'meetings'} to confirm</Link></li>}
            </ul>
          )}
          <h2 className="mt">Pipeline</h2>
          <ul className="bars">
            {Object.keys(STATUSES).filter((s) => byStatus[s]).map((s) => (
              <li key={s}>
                <Link to={`/leads?status=${s}`} className="bar-row">
                  <span className="bar-label">{STATUSES[s].label}</span>
                  <span className="bar-track"><span className={`bar-fill fill-${s}`} style={{ width: `${(byStatus[s] / total) * 100}%` }} /></span>
                  <span className="bar-n">{byStatus[s]}</span>
                </Link>
              </li>
            ))}
          </ul>
          <h2 className="mt">Lead quality</h2>
          <div className="tiers">
            {Object.entries(TIERS).map(([k, t]) => (
              <Link key={k} to={`/leads?tier=${k}`} className={`tier-card tier-${k}`}>
                <strong>{byTier[k] || 0}</strong><span>{t.label}</span><small>{t.hint}</small>
              </Link>
            ))}
          </div>
        </section>

        <section className="panel">
          <h2>Last 7 days</h2>
          <div className="kpis">
            <div><strong>{sent7d ? Math.round((replied7d / sent7d) * 100) : 0}%</strong><span>reply rate</span></div>
            <div><strong>{calls7d ? Math.round((connected7d / calls7d) * 100) : 0}%</strong><span>call connect rate</span></div>
            <div><strong>{replied7d}</strong><span>replies</span></div>
            <div><strong>{act('unsubscribed') + act('dnc_added')}</strong><span>opt-outs</span></div>
          </div>
          <h2 className="mt">Upcoming meetings</h2>
          {meetings.length === 0 ? <p className="muted">No meetings scheduled.</p> : (
            <ul className="plain-list">
              {meetings.map((m) => (
                <li key={m.id}><Link to={`/leads/${m.lead_id}`}><strong>{m.full_name}</strong>, {m.company_name ?? 'unknown company'} <span className="muted">{fmtDateTime(m.scheduled_at, m.timezone)}</span></Link></li>
              ))}
            </ul>
          )}
          <h2 className="mt">Recent activity</h2>
          <ul className="activity">
            {recent.map((e) => (
              <li key={e.id}>
                <Link to={`/leads/${e.leads?.id}`}><strong>{e.leads?.full_name ?? 'Unknown lead'}</strong></Link> {EVENT_LABELS[e.type] ?? e.type}
                {e.type === 'status_changed' && e.payload?.to && <> to <StatusPill status={e.payload.to} /></>}
                <span className="activity-when">{timeAgo(e.occurred_at)}</span>
              </li>
            ))}
            {recent.length === 0 && <li className="muted">Nothing yet.</li>}
          </ul>
        </section>
      </div>
    </div>
  )
}
