import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useToast } from '../lib/toast'
import { parseCsv, guessMapping, rowsToLeads } from '../lib/utils'
import { COLUMN_ALIASES } from '../lib/constants'

const FIELD_LABELS = {
  full_name: 'Full name', first_name: 'First name', last_name: 'Last name', job_title: 'Job title', email: 'Email', phone: 'Phone',
  company: 'Company', domain: 'Domain', website: 'Website', industry: 'Industry', employee_count: 'Employees', country: 'Country', linkedin_url: 'LinkedIn',
}

export default function Import() {
  const toast = useToast()
  const navigate = useNavigate()
  const [filename, setFilename] = useState('')
  const [headers, setHeaders] = useState([])
  const [rows, setRows] = useState([])
  const [mapping, setMapping] = useState({})
  const [source, setSource] = useState('lusha')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)

  const loadText = (text, name) => {
    const parsed = parseCsv(text)
    if (parsed.length < 2) return toast.error('That file has no data rows')
    setFilename(name); setHeaders(parsed[0]); setRows(parsed.slice(1)); setMapping(guessMapping(parsed[0])); setResult(null)
  }
  const onFile = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    const reader = new FileReader()
    reader.onload = () => loadText(String(reader.result), f.name)
    reader.readAsText(f)
  }
  const onPaste = (e) => { const t = e.target.value; if (t.trim()) loadText(t, 'pasted.csv') }

  const leads = rowsToLeads(rows, mapping)
  const hasName = Object.values(mapping).some((f) => ['full_name', 'first_name'].includes(f))
  const hasContact = Object.values(mapping).some((f) => ['email', 'phone'].includes(f))

  const run = async () => {
    setBusy(true)
    const { data, error } = await supabase.rpc('import_leads', { rows: leads, p_filename: filename, p_source: source })
    setBusy(false)
    if (error) return toast.error(`Import failed: ${error.message}`)
    setResult(data)
    toast.success(`Imported ${data.inserted} new ${data.inserted === 1 ? 'lead' : 'leads'}`)
  }

  return (
    <div className="page">
      <h1>Import leads</h1>
      <p className="muted">Upload a CSV export from Lusha or any spreadsheet. Duplicates are merged by email, people on the do-not-contact list are skipped, and every lead is scored on import.</p>

      <section className="panel">
        <div className="row-2">
          <label>CSV file<input className="input" type="file" accept=".csv,text/csv" onChange={onFile} /></label>
          <label>Source<select className="input" value={source} onChange={(e) => setSource(e.target.value)}><option value="lusha">Lusha</option><option value="csv">Other CSV</option><option value="manual">Manual list</option></select></label>
        </div>
        <label className="mt">Or paste CSV text<textarea className="input" rows={3} placeholder="Full name,Email,Phone,Company,Industry,Employees,Country" onBlur={onPaste} /></label>
      </section>

      {headers.length > 0 && !result && (
        <section className="panel">
          <h2>Match the columns</h2>
          <p className="muted small">{rows.length} rows in {filename}. We guessed the matches below; fix any that are wrong. Columns set to "Ignore" are not imported.</p>
          <div className="map-grid">
            {headers.map((h, i) => (
              <label key={i}>
                <span className="map-head">{h || `Column ${i + 1}`}</span>
                <select className="input" value={mapping[i] ?? ''} onChange={(e) => setMapping((m) => { const n = { ...m }; if (e.target.value) n[i] = e.target.value; else delete n[i]; return n })}>
                  <option value="">Ignore</option>
                  {Object.keys(COLUMN_ALIASES).map((f) => <option key={f} value={f}>{FIELD_LABELS[f]}</option>)}
                </select>
                <span className="map-sample muted small">{rows[0]?.[i] || ''}</span>
              </label>
            ))}
          </div>
          {!hasName && <p className="form-error">Match a name column (Full name or First name).</p>}
          {!hasContact && <p className="form-error">Match an Email or Phone column, otherwise there is no way to contact anyone.</p>}
          <div className="form-actions">
            <button className="btn btn-ghost" onClick={() => { setHeaders([]); setRows([]) }}>Start over</button>
            <button className="btn btn-primary" disabled={busy || !hasName || !hasContact} onClick={run}>{busy ? 'Importing' : `Import ${leads.length} leads`}</button>
          </div>
        </section>
      )}

      {result && (
        <section className="panel">
          <h2>Import finished</h2>
          <div className="stats">
            <div><strong className="good">{result.inserted}</strong><span>new leads</span></div>
            <div><strong>{result.updated}</strong><span>existing leads updated</span></div>
            <div><strong>{result.skipped_dnc}</strong><span>skipped, on do-not-contact</span></div>
            <div><strong>{result.skipped_invalid}</strong><span>skipped, missing details</span></div>
          </div>
          {result.errors?.length > 0 && (
            <details><summary className="small">Rows that were skipped</summary>
              <ul className="small">{result.errors.slice(0, 50).map((e, i) => <li key={i}>{e.row?.full_name || e.row?.email || 'row'}: {e.error}</li>)}</ul>
            </details>
          )}
          <p className="mt">New leads start as <strong>New</strong>. Review them, then mark the ones you want contacted as <strong>Ready</strong>.</p>
          <div className="form-actions">
            <button className="btn btn-ghost" onClick={() => { setHeaders([]); setRows([]); setResult(null) }}>Import another file</button>
            <button className="btn btn-primary" onClick={() => navigate('/leads?status=new')}>Review new leads</button>
          </div>
        </section>
      )}
    </div>
  )
}
