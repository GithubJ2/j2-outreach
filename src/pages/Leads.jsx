import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useToast } from '../lib/toast'
import { useAuth } from '../lib/auth'
import { STATUSES, MANUAL_STATUSES, TIERS, REGIONS } from '../lib/constants'
import { timeAgo } from '../lib/utils'
import { StatusPill, TierBadge } from '../components/Badges'
import LeadDrawer from '../components/LeadDrawer'
import Modal from '../components/Modal'

const PAGE = 50

export default function Leads() {
  const { id: openId } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { isAdmin } = useAuth()
  const [params, setParams] = useSearchParams()

  const status = params.get('status') || ''
  const tier = params.get('tier') || ''
  const region = params.get('region') || ''
  const q = params.get('q') || ''
  const setFilter = (k, v) => {
    const p = new URLSearchParams(params)
    if (v) p.set(k, v); else p.delete(k)
    setParams(p, { replace: true })
  }

  const [leads, setLeads] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(new Set())
  const [bulk, setBulk] = useState(null) // 'status' | 'dnc'
  const [bulkStatus, setBulkStatus] = useState('ready')
  const [bulkReason, setBulkReason] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('leads')
      .select('id, full_name, job_title, email, phone, region, status, tier, score, next_action_at, updated_at, call_attempts, referred_by_lead_id, companies(name, industry, employee_band)', { count: 'exact' })
      .order('score', { ascending: false })
      .order('updated_at', { ascending: false })
      .range(page * PAGE, page * PAGE + PAGE - 1)
    if (status) query = query.eq('status', status)
    else query = query.not('status', 'in', '("archived","dnc")')
    if (tier) query = query.eq('tier', tier)
    if (region) query = query.eq('region', region)
    if (q) query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%,job_title.ilike.%${q}%`)
    const { data, count, error } = await query
    if (error) toast.error(`Could not load leads: ${error.message}`)
    setLeads(data ?? [])
    setTotal(count ?? 0)
    setLoading(false)
  }, [status, tier, region, q, page, toast])

  useEffect(() => { setPage(0) }, [status, tier, region, q])
  useEffect(() => { load() }, [load])
  useEffect(() => { setSelected(new Set()) }, [status, tier, region, q, page])

  const toggle = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleAll = () => setSelected((s) => (s.size === leads.length ? new Set() : new Set(leads.map((l) => l.id))))

  const applyBulkStatus = async () => {
    const { data, error } = await supabase.rpc('bulk_set_status', { p_leads: [...selected], p_status: bulkStatus, p_reason: bulkReason || null })
    if (error) return toast.error(error.message)
    toast.success(`${data} ${data === 1 ? 'lead' : 'leads'} marked ${STATUSES[bulkStatus].label}`)
    setBulk(null); setBulkReason(''); load()
  }

  const applyBulkDnc = async () => {
    const rows = leads.filter((l) => selected.has(l.id)).map((l) => ({ email: l.email, phone: l.email ? null : l.phone, reason: bulkReason || 'Added from lead list', source: 'manual' }))
    let added = 0
    for (const r of rows.filter((x) => x.email || x.phone)) {
      const { error } = await supabase.from('do_not_contact').insert(r)
      if (!error) added++
      else if (error.code !== '23505') return toast.error(error.message)
    }
    toast.success(`${added} added to the do-not-contact list`)
    setBulk(null); setBulkReason(''); load()
  }

  const pages = Math.ceil(total / PAGE)
  const title = status ? STATUSES[status]?.label : 'All active leads'

  return (
    <div className="leads-page">
      <div className="leads-main">
        <div className="page-head">
          <div>
            <h1>{title}</h1>
            <p className="muted small">{loading ? 'Loading' : `${total} ${total === 1 ? 'lead' : 'leads'}`}{status && STATUSES[status] ? `. ${STATUSES[status].hint}.` : ''}</p>
          </div>
          <button className="btn btn-primary" onClick={() => navigate('/import')}>Import leads</button>
        </div>

        <div className="filters">
          <input className="input search" type="search" placeholder="Search name, email or title" value={q} onChange={(e) => setFilter('q', e.target.value)} aria-label="Search leads" />
          <select className="input input-compact" value={status} onChange={(e) => setFilter('status', e.target.value)} aria-label="Status">
            <option value="">All active</option>
            {Object.entries(STATUSES).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
          </select>
          <select className="input input-compact" value={tier} onChange={(e) => setFilter('tier', e.target.value)} aria-label="Tier">
            <option value="">All tiers</option>
            {Object.entries(TIERS).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}
          </select>
          <select className="input input-compact" value={region} onChange={(e) => setFilter('region', e.target.value)} aria-label="Region">
            <option value="">Both regions</option>
            {Object.entries(REGIONS).map(([k, r]) => <option key={k} value={k}>{r}</option>)}
          </select>
          {(status || tier || region || q) && <button className="text-btn" onClick={() => setParams({}, { replace: true })}>Clear</button>}
        </div>

        {selected.size > 0 && (
          <div className="bulk-bar">
            <strong>{selected.size} selected</strong>
            <button className="btn btn-ghost btn-sm" onClick={() => { setBulkStatus('ready'); setBulk('status') }}>Mark ready</button>
            <button className="btn btn-ghost btn-sm" onClick={() => { setBulkStatus('archived'); setBulk('status') }}>Archive</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setBulk('status')}>Set status</button>
            <button className="btn btn-danger-ghost btn-sm" onClick={() => setBulk('dnc')}>Do not contact</button>
            <button className="text-btn" onClick={() => setSelected(new Set())}>Clear selection</button>
          </div>
        )}

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th className="col-check"><input type="checkbox" checked={leads.length > 0 && selected.size === leads.length} onChange={toggleAll} aria-label="Select all" /></th>
                <th>Lead</th>
                <th>Company</th>
                <th>Score</th>
                <th>Status</th>
                <th>Next</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.id} className={openId === l.id ? 'is-open' : ''} onClick={() => navigate(`/leads/${l.id}?${params.toString()}`)}>
                  <td className="col-check" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={selected.has(l.id)} onChange={() => toggle(l.id)} aria-label={`Select ${l.full_name}`} />
                  </td>
                  <td>
                    <div className="cell-main">{l.full_name}</div>
                    <div className="cell-sub">{l.job_title || <span className="muted">No title</span>}</div>
                  </td>
                  <td>
                    <div className="cell-main">{l.companies?.name ?? <span className="muted">Unknown</span>}</div>
                    <div className="cell-sub">{[l.companies?.industry, l.companies?.employee_band, REGIONS[l.region]].filter(Boolean).join(', ')}</div>
                  </td>
                  <td><TierBadge tier={l.tier} score={l.score} /></td>
                  <td>{l.status === 'referral' && l.referred_by_lead_id ? <StatusPill status="referral" to={`/leads/${l.referred_by_lead_id}`} title="Open the lead who referred them" /> : <StatusPill status={l.status} />}</td>
                  <td className="cell-sub">{l.next_action_at ? (new Date(l.next_action_at) < new Date() ? 'Due now' : timeAgo(l.next_action_at).replace(' ago', '')) : ''}</td>
                  <td className="cell-sub">{timeAgo(l.updated_at)}</td>
                </tr>
              ))}
              {!loading && leads.length === 0 && (
                <tr><td colSpan={7} className="empty-cell">No leads match these filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {pages > 1 && (
          <div className="pager">
            <button className="btn btn-ghost btn-sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</button>
            <span className="muted small">Page {page + 1} of {pages}</span>
            <button className="btn btn-ghost btn-sm" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>Next</button>
          </div>
        )}
      </div>

      {openId && (
        <LeadDrawer
          leadId={openId}
          onClose={() => navigate(`/leads?${params.toString()}`)}
          onChanged={load}
          isAdmin={isAdmin}
        />
      )}

      {bulk === 'status' && (
        <Modal title={`Set status for ${selected.size} ${selected.size === 1 ? 'lead' : 'leads'}`} onClose={() => setBulk(null)}
          footer={<><button className="btn btn-ghost" onClick={() => setBulk(null)}>Cancel</button><button className="btn btn-primary" onClick={applyBulkStatus}>Apply</button></>}>
          <div className="stack">
            <label>New status
              <select className="input" value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)}>
                {MANUAL_STATUSES.map((s) => <option key={s} value={s}>{STATUSES[s].label}</option>)}
              </select>
            </label>
            <p className="muted small">{STATUSES[bulkStatus]?.hint}</p>
            <label>Reason (optional)<input className="input" value={bulkReason} onChange={(e) => setBulkReason(e.target.value)} /></label>
            <p className="muted small">Leads on the do-not-contact list are never changed.</p>
          </div>
        </Modal>
      )}

      {bulk === 'dnc' && (
        <Modal title={`Add ${selected.size} ${selected.size === 1 ? 'lead' : 'leads'} to do-not-contact`} onClose={() => setBulk(null)}
          footer={<><button className="btn btn-ghost" onClick={() => setBulk(null)}>Cancel</button><button className="btn btn-primary" onClick={applyBulkDnc}>Add to list</button></>}>
          <div className="stack">
            <p>These people will never be emailed or called again, and their leads will be closed. {isAdmin ? '' : 'Only an admin can remove someone from the list later.'}</p>
            <label>Reason<input className="input" value={bulkReason} onChange={(e) => setBulkReason(e.target.value)} placeholder="e.g. Asked us to stop" /></label>
          </div>
        </Modal>
      )}
    </div>
  )
}

export function useLeadCounts() {
  const [counts, setCounts] = useState({})
  useEffect(() => {
    supabase.from('lead_counts').select('*').then(({ data }) => {
      const o = {}
      for (const r of data ?? []) o[r.status] = (o[r.status] || 0) + r.n
      setCounts(o)
    })
  }, [])
  return useMemo(() => counts, [counts])
}
