import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useToast } from '../lib/toast'
import { useAuth } from '../lib/auth'
import { fmtDateTime } from '../lib/utils'

export default function Meetings() {
  const toast = useToast()
  const { user } = useAuth()
  const [rows, setRows] = useState(null)
  const [past, setPast] = useState([])

  const load = useCallback(async () => {
    const [u, p] = await Promise.all([
      supabase.from('upcoming_meetings').select('*'),
      supabase.from('meetings').select('*, leads(full_name, companies(name))').not('outcome', 'in', '("scheduled","confirmed")').order('scheduled_at', { ascending: false }).limit(30),
    ])
    if (u.error) toast.error(u.error.message)
    setRows(u.data ?? []); setPast(p.data ?? [])
  }, [toast])
  useEffect(() => { load() }, [load])

  const setOutcome = async (m, outcome) => {
    const patch = { outcome }
    if (outcome === 'confirmed') Object.assign(patch, { confirmed_at: new Date().toISOString(), confirmed_by: user.id })
    const { error } = await supabase.from('meetings').update(patch).eq('id', m.id)
    if (error) return toast.error(error.message)
    const typeMap = { confirmed: 'meeting_confirmed', held: 'meeting_held', no_show: 'meeting_no_show', cancelled: 'meeting_cancelled' }
    await supabase.from('lead_events').insert({ lead_id: m.lead_id, type: typeMap[outcome], channel: 'system', source: 'app', payload: { meeting_id: m.id }, created_by: user.id })
    load()
  }

  if (!rows) return <div className="splash">Loading meetings</div>
  const toConfirm = rows.filter((m) => m.outcome === 'scheduled')

  return (
    <div className="page page-wide">
      <div className="page-head"><h1>Meetings</h1></div>
      {toConfirm.length > 0 && <p className="notice">{toConfirm.length} {toConfirm.length === 1 ? 'meeting needs' : 'meetings need'} an SDR to confirm with the prospect.</p>}
      <section className="panel">
        <h2>Upcoming</h2>
        {rows.length === 0 ? <p className="muted">No upcoming meetings. Bookings from AI calls appear here automatically.</p> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>When</th><th>Who</th><th>Company</th><th>Booked via</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id}>
                  <td><div className="cell-main">{fmtDateTime(m.scheduled_at, m.timezone)}</div><div className="cell-sub">{m.timezone}</div></td>
                  <td><Link to={`/leads/${m.lead_id}`} className="cell-main">{m.full_name}</Link><div className="cell-sub">{m.job_title}</div></td>
                  <td>{m.company_name ?? <span className="muted">Unknown</span>}</td>
                  <td className="cell-sub">{m.booked_via.replace('_', ' ')}{m.notification_sent_at ? ', team emailed' : ''}</td>
                  <td><span className={`pill pill-m-${m.outcome}`}>{m.outcome}</span></td>
                  <td className="row-actions">
                    {m.outcome === 'scheduled' && <button className="btn btn-primary btn-sm" onClick={() => setOutcome(m, 'confirmed')}>Confirm</button>}
                    <button className="btn btn-ghost btn-sm" onClick={() => setOutcome(m, 'held')}>Held</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setOutcome(m, 'no_show')}>No show</button>
                    <button className="btn btn-danger-ghost btn-sm" onClick={() => setOutcome(m, 'cancelled')}>Cancel</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </section>
      {past.length > 0 && (
        <section className="panel">
          <h2>Past</h2>
          <div className="table-wrap"><table className="table">
            <thead><tr><th>When</th><th>Who</th><th>Company</th><th>Outcome</th></tr></thead>
            <tbody>{past.map((m) => (
              <tr key={m.id}><td className="cell-sub">{fmtDateTime(m.scheduled_at, m.timezone)}</td><td><Link to={`/leads/${m.lead_id}`}>{m.leads?.full_name}</Link></td><td>{m.leads?.companies?.name}</td><td><span className={`pill pill-m-${m.outcome}`}>{m.outcome.replace('_', ' ')}</span></td></tr>
            ))}</tbody>
          </table></div>
        </section>
      )}
    </div>
  )
}
