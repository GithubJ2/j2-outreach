import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../lib/toast'
import { useAuth } from '../lib/auth'
import { timeAgo } from '../lib/utils'

export default function DoNotContact() {
  const toast = useToast()
  const { user, isAdmin } = useAuth()
  const [rows, setRows] = useState(null)
  const [q, setQ] = useState('')
  const [form, setForm] = useState({ email: '', phone: '', domain: '', reason: '' })
  const [bulk, setBulk] = useState('')

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('do_not_contact').select('*').order('created_at', { ascending: false }).limit(500)
    if (error) toast.error(error.message)
    setRows(data ?? [])
  }, [toast])
  useEffect(() => { load() }, [load])

  const add = async (e) => {
    e.preventDefault()
    if (!form.email && !form.phone && !form.domain) return
    const { error } = await supabase.from('do_not_contact').insert({ email: form.email || null, phone: form.phone || null, domain: form.domain || null, reason: form.reason || null, source: 'manual', added_by: user.id })
    if (error) return toast.error(error.message)
    setForm({ email: '', phone: '', domain: '', reason: '' }); toast.success('Added'); load()
  }

  const addBulk = async () => {
    const items = bulk.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean)
    if (!items.length) return
    const entries = items.map((v) => (v.includes('@') ? { email: v.toLowerCase() } : /^[+0-9 ()-]+$/.test(v) ? { phone: v.replace(/[^0-9+]/g, '') } : { domain: v.toLowerCase() }))
    const { error } = await supabase.from('do_not_contact').insert(entries.map((x) => ({ ...x, reason: 'Bulk import', source: 'import', added_by: user.id })))
    if (error) return toast.error(`Some entries may already exist: ${error.message}`)
    setBulk(''); toast.success(`Added ${entries.length}`); load()
  }

  const remove = async (r) => {
    if (!window.confirm('Remove from the list? Their lead stays closed until you re-open it.')) return
    const { error } = await supabase.from('do_not_contact').delete().eq('id', r.id)
    if (error) return toast.error(error.message)
    load()
  }

  const shown = (rows ?? []).filter((r) => !q || [r.email, r.phone, r.domain, r.reason].join(' ').toLowerCase().includes(q.toLowerCase()))

  return (
    <div className="page">
      <h1>Do not contact</h1>
      <p className="muted">Anyone here is never emailed or called. The list is checked on every import and before every send and call. Unsubscribes and "do not call" outcomes are added automatically.</p>
      <section className="panel">
        <h2>Add one</h2>
        <form className="dnc-form" onSubmit={add}>
          <input className="input" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input className="input" placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <input className="input" placeholder="Whole domain, e.g. client.co.za" value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} />
          <input className="input" placeholder="Reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          <button className="btn btn-primary">Add</button>
        </form>
        <details className="mt"><summary className="small">Add many at once</summary>
          <textarea className="input mt" rows={4} placeholder="One email, phone number or domain per line" value={bulk} onChange={(e) => setBulk(e.target.value)} />
          <div className="form-actions"><button className="btn btn-ghost btn-sm" onClick={addBulk}>Add all</button></div>
        </details>
      </section>
      <section className="panel">
        <div className="page-head"><h2>{rows ? `${rows.length} on the list` : 'Loading'}</h2><input className="input search" type="search" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Who</th><th>Reason</th><th>Added</th>{isAdmin && <th></th>}</tr></thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id}>
                <td className="cell-main">{r.email || r.phone || <span>Domain: {r.domain}</span>}</td>
                <td className="cell-sub">{r.reason}{r.source !== 'manual' ? ` (${r.source.replace('_', ' ')})` : ''}</td>
                <td className="cell-sub">{timeAgo(r.created_at)}</td>
                {isAdmin && <td><button className="btn btn-danger-ghost btn-sm" onClick={() => remove(r)}>Remove</button></td>}
              </tr>
            ))}
            {rows && shown.length === 0 && <tr><td colSpan={4} className="empty-cell">Nobody on the list yet.</td></tr>}
          </tbody>
        </table></div>
      </section>
    </div>
  )
}
