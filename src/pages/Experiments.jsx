import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useToast } from '../lib/toast'
import { useAuth } from '../lib/auth'
import { FACTORS, FACTOR_KEYS, METRICS, rate, compare, sampleSize, pct, suggestNext } from '../lib/experiments'
import { fmtDateTime, timeAgo } from '../lib/utils'
import Modal from '../components/Modal'

export default function Experiments() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const view = params.get('view') || (id ? 'detail' : 'home')
  const toast = useToast()
  const [experiments, setExperiments] = useState(null)
  const [playbook, setPlaybook] = useState([])
  const [results, setResults] = useState([])
  const [funnel, setFunnel] = useState(null)
  const [wizard, setWizard] = useState(false)

  const load = useCallback(async () => {
    const [e, p, r, f] = await Promise.all([
      supabase.from('experiments').select('*, experiment_variants!experiment_variants_experiment_id_fkey(*)').order('created_at', { ascending: false }),
      supabase.from('playbook').select('*'),
      supabase.from('experiment_results').select('*'),
      supabase.from('funnel_30d').select('*').maybeSingle(),
    ])
    if (e.error) return toast.error(e.error.message)
    setExperiments(e.data); setPlaybook(p.data ?? []); setResults(r.data ?? []); setFunnel(f.data)
  }, [toast])
  useEffect(() => { load() }, [load])

  if (!experiments) return <div className="splash">Loading A/B testing</div>
  const running = experiments.filter((e) => e.status === 'running')
  const drafts = experiments.filter((e) => e.status === 'draft' || e.status === 'paused')
  const past = experiments.filter((e) => e.status === 'concluded' || e.status === 'abandoned')
  const resultsFor = (exp) => Object.fromEntries(exp.experiment_variants.map((v) => [v.id, results.find((r) => r.variant_id === v.id)]))

  if (id) {
    const exp = experiments.find((e) => e.id === id)
    if (!exp) return <div className="page"><p className="form-error">Experiment not found.</p><Link to="/experiments" className="btn btn-ghost">Back</Link></div>
    return <ExperimentDetail exp={exp} results={resultsFor(exp)} onChanged={load} />
  }

  return (
    <div className="page page-wide">
      <div className="page-head">
        <div>
          <h1>A/B testing</h1>
          <p className="muted small">Change one thing at a time. Measure. Keep what wins.</p>
        </div>
        <div className="row-actions">
          <Link to={view === 'history' ? '/experiments' : '/experiments?view=history'} className="btn btn-ghost">{view === 'history' ? 'Back to now' : `History (${past.length})`}</Link>
          <button className="btn btn-primary" onClick={() => setWizard(true)}>New experiment</button>
        </div>
      </div>

      {view === 'history' ? (
        <History past={past} resultsFor={resultsFor} playbook={playbook} />
      ) : (
        <>
          <div className="grid-2">
            <section className="panel">
              <h2>Running now</h2>
              {running.length === 0 && <p className="muted">Nothing is being tested. Every lead gets the playbook as it stands.</p>}
              {running.map((exp) => <ExperimentCard key={exp.id} exp={exp} results={resultsFor(exp)} />)}
              {drafts.length > 0 && <>
                <h3>Drafts</h3>
                <ul className="plain-list">{drafts.map((d) => <li key={d.id}><Link to={`/experiments/${d.id}`}>{d.name}</Link> <span className="muted small">{FACTORS[d.factor]?.label}, {d.status}</span></li>)}</ul>
              </>}
            </section>
            <Guide funnel={funnel} experiments={experiments} onPick={() => setWizard(true)} />
          </div>
          <Playbook playbook={playbook} experiments={experiments} onChanged={load} />
        </>
      )}

      {wizard && <Wizard funnel={funnel} experiments={experiments} playbook={playbook} onClose={() => setWizard(false)} onCreated={load} />}
    </div>
  )
}

// ---------------- Playbook: what we are doing right now ----------------
function Playbook({ playbook, experiments, onChanged }) {
  const toast = useToast()
  const { user } = useAuth()
  const [editing, setEditing] = useState(null)
  const [value, setValue] = useState('')
  const byFactor = Object.fromEntries(playbook.map((p) => [p.factor, p]))
  const running = new Set(experiments.filter((e) => e.status === 'running').map((e) => e.factor))

  const save = async () => {
    const f = FACTORS[editing]
    const { error } = await supabase.from('playbook').upsert({ factor: editing, config: { [f.field]: value.trim() }, updated_by: user.id }, { onConflict: 'factor' })
    if (error) return toast.error(error.message)
    setEditing(null); onChanged()
  }

  return (
    <section className="panel">
      <h2>The playbook: what every lead gets right now</h2>
      <p className="muted small">One setting per factor. A running experiment overrides its factor for the leads in the test; the winner becomes the new setting.</p>
      <div className="playbook">
        {FACTOR_KEYS.map((k) => {
          const f = FACTORS[k]; const p = byFactor[k]; const val = p?.config?.[f.field]
          return (
            <div key={k} className={`pb-row${running.has(k) ? ' is-testing' : ''}`}>
              <div className="pb-factor"><strong>{f.label}</strong><span className="muted small">{f.channel === 'both' ? 'email and calls' : f.channel}</span></div>
              <div className="pb-value">{val ? <span>{val}</span> : <span className="muted">Not set. n8n uses its default.</span>}{p?.set_from_experiment && <span className="tag">won in a test</span>}{running.has(k) && <span className="tag">testing now</span>}</div>
              <div className="pb-actions"><button className="text-btn" onClick={() => { setEditing(k); setValue(val ?? '') }}>Edit</button></div>
            </div>
          )
        })}
      </div>
      {editing && (
        <Modal title={FACTORS[editing].label} onClose={() => setEditing(null)} footer={<><button className="btn btn-ghost" onClick={() => setEditing(null)}>Cancel</button><button className="btn btn-primary" onClick={save}>Save</button></>}>
          <div className="stack">
            <p className="muted small">{FACTORS[editing].why}</p>
            <label>{FACTORS[editing].fieldLabel}<textarea className="input" rows={3} value={value} onChange={(e) => setValue(e.target.value)} /></label>
            <p className="muted small">Changing this by hand is fine, but you will not learn whether it was better. Prefer an experiment when you can.</p>
          </div>
        </Modal>
      )}
    </section>
  )
}

// ---------------- Guide: what to try next ----------------
function Guide({ funnel, experiments, onPick }) {
  const tips = suggestNext(funnel, experiments)
  const f = funnel || {}
  return (
    <section className="panel guide">
      <h2>What to try next</h2>
      <div className="funnel-mini">
        <span>Emailed <strong>{f.emailed ?? 0}</strong></span><span>Replied <strong>{f.replied ?? 0}</strong></span>
        <span>Called <strong>{f.called ?? 0}</strong></span><span>Connected <strong>{f.connected ?? 0}</strong></span>
        <span>Meetings <strong>{f.meetings ?? 0}</strong></span><span>Held <strong>{f.held ?? 0}</strong></span>
      </div>
      <p className="muted small">Last 30 days. The guide looks for the biggest leak and suggests the one factor most likely to fix it.</p>
      <ol className="guide-list">
        {tips.map((t, i) => (
          <li key={t.factor}>
            <div><strong>{FACTORS[t.factor].label}</strong>{t.tested && <span className="tag">tested before</span>}<p>{t.reason}</p></div>
            {i === 0 && <button className="btn btn-primary btn-sm" onClick={onPick}>Set it up</button>}
          </li>
        ))}
      </ol>
    </section>
  )
}

// ---------------- One experiment, summarised ----------------
function ExperimentCard({ exp, results }) {
  const control = exp.experiment_variants.find((v) => v.is_control) || exp.experiment_variants[0]
  const others = exp.experiment_variants.filter((v) => v.id !== control.id)
  const a = rate(results[control.id], exp.goal_metric)
  const best = others.map((v) => ({ v, r: rate(results[v.id], exp.goal_metric) })).sort((x, y) => y.r.value - x.r.value)[0]
  const cmp = best ? compare(a, best.r) : null
  const minAssigned = Math.min(...exp.experiment_variants.map((v) => results[v.id]?.assigned || 0))
  const progress = Math.min(1, minAssigned / exp.min_sample)
  const days = exp.started_at ? Math.floor((Date.now() - new Date(exp.started_at)) / 86400000) : 0
  return (
    <Link to={`/experiments/${exp.id}`} className="exp-card">
      <div className="exp-head"><strong>{exp.name}</strong><span className="muted small">{FACTORS[exp.factor]?.label}, day {days} of {exp.max_days}</span></div>
      <div className="exp-vs">
        <span>A <em>{pct(a.value)}</em><small>{a.num}/{a.den}</small></span>
        <span className="exp-vs-sep">vs</span>
        {best && <span>{best.v.key} <em>{pct(best.r.value)}</em><small>{best.r.num}/{best.r.den}</small></span>}
      </div>
      <div className="progress progress-sm"><div className="progress-track"><span className="seg seg-decided" style={{ width: `${progress * 100}%` }} /><span className="seg-open" /></div></div>
      <div className="muted small">{minAssigned} of {exp.min_sample} leads per group. {cmp && cmp.den !== 0 ? (cmp.enough ? `${best.v.key} is ${cmp.lift > 0 ? 'ahead' : 'behind'} with ${pct(cmp.confidence, 0)} confidence.` : `${pct(cmp.confidence, 0)} confidence so far; keep going.`) : 'No results yet.'}</div>
    </Link>
  )
}

// ---------------- Detail: live results, decide ----------------
function ExperimentDetail({ exp, results, onChanged }) {
  const toast = useToast()
  const navigate = useNavigate()
  const [daily, setDaily] = useState([])
  const [decide, setDecide] = useState(false)
  const [winner, setWinner] = useState(exp.winner_variant_id || '')
  const [conclusion, setConclusion] = useState(exp.conclusion || '')
  const metric = METRICS[exp.goal_metric]
  const control = exp.experiment_variants.find((v) => v.is_control) || exp.experiment_variants[0]

  useEffect(() => {
    supabase.from('experiment_daily').select('*').eq('experiment_id', exp.id).order('day').then(({ data }) => setDaily(data ?? []))
  }, [exp.id])

  const rows = exp.experiment_variants.map((v) => ({ v, r: results[v.id], m: rate(results[v.id], exp.goal_metric) }))
  const a = rows.find((x) => x.v.id === control.id).m
  const minAssigned = Math.min(...rows.map((x) => x.r?.assigned || 0))
  const days = exp.started_at ? Math.floor((Date.now() - new Date(exp.started_at)) / 86400000) : 0
  const bestOther = rows.filter((x) => x.v.id !== control.id).sort((x, y) => y.m.value - x.m.value)[0]
  const cmp = bestOther ? compare(a, bestOther.m) : null
  const readyToDecide = minAssigned >= exp.min_sample || (cmp && cmp.enough && minAssigned >= exp.min_sample / 2) || days >= exp.max_days

  const verdict = () => {
    if (!cmp || !a.den) return 'No results yet. Results appear as emails are sent and calls are made.'
    if (cmp.enough) return `${bestOther.v.key} (${bestOther.v.name}) is ${cmp.lift > 0 ? 'better' : 'worse'} than A by ${pct(Math.abs(cmp.lift), 0)} relative, with ${pct(cmp.confidence, 0)} confidence. ${minAssigned >= exp.min_sample ? 'Safe to decide.' : 'Strong signal, but the sample is still small; a few more days would make it solid.'}`
    if (minAssigned >= exp.min_sample) return `Sample reached, but the difference is not clear (${pct(cmp.confidence, 0)} confidence). That is a result too: this factor does not matter much. Keep A and move on.`
    return `${pct(cmp.confidence, 0)} confidence so far. Not enough yet; ${exp.min_sample - minAssigned} more leads per group to go.`
  }

  const act = async (fn, msg) => { const { error } = await fn(); if (error) return toast.error(error.message); toast.success(msg); onChanged() }
  const start = () => act(() => supabase.rpc('start_experiment', { p_id: exp.id }), 'Experiment started. Ready leads are being split now.')
  const pause = () => act(() => supabase.from('experiments').update({ status: 'paused' }).eq('id', exp.id), 'Paused. No new leads will join; existing ones keep their variant.')
  const abandon = () => window.confirm('Abandon this experiment? Results stay in history.') && act(() => supabase.from('experiments').update({ status: 'abandoned', ended_at: new Date().toISOString() }).eq('id', exp.id), 'Abandoned')
  const remove = () => window.confirm('Delete this draft?') && act(async () => { const r = await supabase.from('experiments').delete().eq('id', exp.id); if (!r.error) navigate('/experiments'); return r }, 'Deleted')
  const conclude = async () => {
    const { error } = await supabase.rpc('conclude_experiment', { p_id: exp.id, p_winner: winner || null, p_conclusion: conclusion || null, p_apply: Boolean(winner) })
    if (error) return toast.error(error.message)
    toast.success(winner ? 'Concluded. The winner is now in the playbook.' : 'Concluded with no change to the playbook.')
    setDecide(false); onChanged()
  }

  const dayKeys = [...new Set(daily.map((d) => d.day))].sort()
  const seriesFor = (vid) => {
    let num = 0, den = 0
    return dayKeys.map((day) => { const d = daily.find((x) => x.variant_id === vid && x.day === day); if (d) { num += d[metric.num === 'assigned' ? 'emailed' : metric.num] || 0; den += d[metric.den === 'assigned' ? 'emailed' : metric.den] || 0 } return den ? num / den : 0 })
  }

  return (
    <div className="page page-wide">
      <Link to="/experiments" className="back-link">A/B testing</Link>
      <div className="page-head">
        <div>
          <h1>{exp.name}</h1>
          <p className="muted small">{FACTORS[exp.factor]?.label}. Goal: {metric.label}. <span className={`pill pill-x-${exp.status}`}>{exp.status}</span>{exp.started_at ? ` Started ${timeAgo(exp.started_at)}.` : ''}{exp.ended_at ? ` Ended ${timeAgo(exp.ended_at)}.` : ''}</p>
        </div>
        <div className="row-actions">
          {(exp.status === 'draft' || exp.status === 'paused') && <button className="btn btn-primary" onClick={start}>{exp.status === 'paused' ? 'Resume' : 'Start'}</button>}
          {exp.status === 'running' && <button className="btn btn-ghost" onClick={pause}>Pause</button>}
          {(exp.status === 'running' || exp.status === 'paused') && <button className={`btn ${readyToDecide ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setDecide(true)}>Decide</button>}
          {exp.status === 'draft' && <button className="btn btn-danger-ghost" onClick={remove}>Delete</button>}
          {(exp.status === 'running' || exp.status === 'paused') && <button className="btn btn-danger-ghost" onClick={abandon}>Abandon</button>}
        </div>
      </div>

      {exp.hypothesis && <p className="notice-quiet"><strong>Hypothesis:</strong> {exp.hypothesis}</p>}

      <section className="panel">
        <h2>Verdict</h2>
        <p className={readyToDecide && cmp?.enough ? 'good' : ''}>{verdict()}</p>
        <div className="progress progress-lg"><div className="progress-head"><span className="progress-pct">{Math.min(100, Math.round((minAssigned / exp.min_sample) * 100))}%</span><span className="progress-caption">of the sample ({minAssigned} of {exp.min_sample} leads per group)</span></div>
          <div className="progress-track"><span className="seg seg-decided" style={{ width: `${Math.min(100, (minAssigned / exp.min_sample) * 100)}%` }} /><span className="seg-open" /></div></div>
      </section>

      <section className="panel">
        <h2>Results by variant</h2>
        <div className="table-wrap"><table className="table table-static">
          <thead><tr><th>Variant</th><th>{metric.label}</th><th>In test</th><th>Emailed</th><th>Replied</th><th>Called</th><th>Connected</th><th>Meetings</th><th>Held</th><th>Positive</th><th>Said no</th></tr></thead>
          <tbody>{rows.map(({ v, r, m }) => (
            <tr key={v.id} className={v.id === exp.winner_variant_id ? 'is-winner' : ''}>
              <td><div className="cell-main">{v.key}: {v.name}{v.is_control && <span className="tag">control</span>}{v.id === exp.winner_variant_id && <span className="tag">winner</span>}</div><div className="cell-sub">{v.config?.[FACTORS[exp.factor]?.field] ?? JSON.stringify(v.config)}</div></td>
              <td><strong className="big-num">{pct(m.value)}</strong><div className="cell-sub">{m.num} of {m.den}</div></td>
              <td>{r?.assigned ?? 0}</td><td>{r?.emailed ?? 0}</td><td>{r?.replied ?? 0}</td><td>{r?.called ?? 0}</td><td>{r?.connected ?? 0}</td><td>{r?.meetings ?? 0}</td><td>{r?.held ?? 0}</td><td>{r?.positive ?? 0}</td><td>{r?.negative ?? 0}</td>
            </tr>
          ))}</tbody>
        </table></div>
        {dayKeys.length > 1 && (
          <div className="chart">
            <h3>{metric.label} over time (cumulative)</h3>
            <Sparklines series={rows.map(({ v }) => ({ key: v.key, name: v.name, points: seriesFor(v.id) }))} labels={dayKeys} />
          </div>
        )}
      </section>

      <section className="panel">
        <h2>How this test works</h2>
        <ul className="plain-list small">
          <li>Leads join when they become Ready and fit the audience{exp.audience?.tiers?.length ? ` (tiers: ${exp.audience.tiers.join(', ')})` : ''}{exp.audience?.regions?.length ? ` (regions: ${exp.audience.regions.join(', ')})` : ''}. Each is placed in a group by a stable hash, so the split is even and never changes.</li>
          <li>n8n reads each lead's variant from the queue and sends it through the matching campaign or script. Only this one factor differs.</li>
          <li>{metric.explain}. Counted from each lead's timeline after it joined the test.</li>
          <li>Decide when the sample is reached, confidence passes 95%, or {exp.max_days} days are up. Choosing a winner updates the playbook for everyone.</li>
        </ul>
      </section>

      {decide && (
        <Modal title="Decide this experiment" onClose={() => setDecide(false)} footer={<><button className="btn btn-ghost" onClick={() => setDecide(false)}>Cancel</button><button className="btn btn-primary" onClick={conclude}>Conclude</button></>}>
          <div className="stack">
            <p>{verdict()}</p>
            <label>Winner
              <select className="input" value={winner} onChange={(e) => setWinner(e.target.value)}>
                <option value="">No clear winner, keep the playbook as it is</option>
                {rows.map(({ v, m }) => <option key={v.id} value={v.id}>{v.key}: {v.name} ({pct(m.value)})</option>)}
              </select>
            </label>
            <label>What we learned<textarea className="input" rows={3} value={conclusion} onChange={(e) => setConclusion(e.target.value)} placeholder="One or two sentences for the history" /></label>
            {winner && <p className="muted small">The winner's setting becomes the playbook for this factor. Future leads get it; the next experiment on this factor starts from it.</p>}
          </div>
        </Modal>
      )}
    </div>
  )
}

function Sparklines({ series, labels }) {
  const W = 600, H = 140, pad = 24
  const max = Math.max(0.01, ...series.flatMap((s) => s.points))
  const x = (i) => pad + (i / Math.max(1, labels.length - 1)) * (W - pad * 2)
  const y = (v) => H - pad - (v / max) * (H - pad * 2)
  const colors = ['var(--fog)', 'var(--settled)', 'var(--confirm)', 'var(--link)']
  return (
    <div className="spark">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Results over time">
        <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke="var(--line)" />
        <text x={pad} y={pad - 8} fontSize="11" fill="var(--fog)">{pct(max, 0)}</text>
        {series.map((s, i) => <polyline key={s.key} fill="none" stroke={colors[i % colors.length]} strokeWidth="2.5" points={s.points.map((p, j) => `${x(j)},${y(p)}`).join(' ')} />)}
        <text x={pad} y={H - 6} fontSize="11" fill="var(--fog)">{labels[0]}</text>
        <text x={W - pad} y={H - 6} fontSize="11" fill="var(--fog)" textAnchor="end">{labels[labels.length - 1]}</text>
      </svg>
      <div className="spark-legend">{series.map((s, i) => <span key={s.key}><i style={{ background: colors[i % colors.length] }} />{s.key}: {s.name}</span>)}</div>
    </div>
  )
}

// ---------------- History ----------------
function History({ past, resultsFor, playbook }) {
  if (!past.length) return <section className="panel"><p className="muted">No finished experiments yet. Everything you decide ends up here, with what changed and by how much.</p></section>
  return (
    <section className="panel">
      <h2>What changed, and what it did</h2>
      <ul className="history">
        {past.map((exp) => {
          const res = resultsFor(exp)
          const control = exp.experiment_variants.find((v) => v.is_control) || exp.experiment_variants[0]
          const win = exp.experiment_variants.find((v) => v.id === exp.winner_variant_id)
          const a = rate(res[control.id], exp.goal_metric)
          const b = win ? rate(res[win.id], exp.goal_metric) : null
          const cmp = b ? compare(a, b) : null
          return (
            <li key={exp.id} className={`hist hist-${exp.status}`}>
              <div className="hist-when">{exp.ended_at ? new Date(exp.ended_at).toLocaleDateString() : ''}</div>
              <div className="hist-body">
                <Link to={`/experiments/${exp.id}`}><strong>{exp.name}</strong></Link> <span className="muted small">{FACTORS[exp.factor]?.label}, {METRICS[exp.goal_metric].label}</span>
                {exp.status === 'abandoned' ? <p className="muted small">Abandoned.</p> : win ? (
                  <p className="small"><strong>{win.key} won</strong> and became the playbook: "{win.config?.[FACTORS[exp.factor]?.field]}". {pct(a.value)} → {pct(b.value)}{cmp ? ` (${cmp.lift > 0 ? '+' : ''}${pct(cmp.lift, 0)} relative, ${pct(cmp.confidence, 0)} confidence)` : ''}.</p>
                ) : <p className="small">No clear winner. Playbook unchanged. A was {pct(a.value)}.</p>}
                {exp.conclusion && <p className="small muted">{exp.conclusion}</p>}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

// ---------------- Wizard: guided setup ----------------
function Wizard({ funnel, experiments, playbook, onClose, onCreated }) {
  const toast = useToast()
  const navigate = useNavigate()
  const { user } = useAuth()
  const tips = suggestNext(funnel, experiments)
  const [step, setStep] = useState(0)
  const [factor, setFactor] = useState(tips[0]?.factor || 'email_subject')
  const f = FACTORS[factor]
  const current = playbook.find((p) => p.factor === factor)?.config?.[f.field] || ''
  const [goal, setGoal] = useState(f.goal)
  const [name, setName] = useState('')
  const [hypothesis, setHypothesis] = useState('')
  const [aText, setAText] = useState(current)
  const [bText, setBText] = useState('')
  const [bName, setBName] = useState('')
  const [tiers, setTiers] = useState([])
  const [regions, setRegions] = useState([])
  const [lift, setLift] = useState(50)
  const [maxDays, setMaxDays] = useState(21)
  const [busy, setBusy] = useState(false)
  const running = new Set(experiments.filter((e) => e.status === 'running').map((e) => e.factor))

  useEffect(() => { setGoal(FACTORS[factor].goal); setAText(playbook.find((p) => p.factor === factor)?.config?.[FACTORS[factor].field] || ''); setName(`${FACTORS[factor].label} test`) }, [factor, playbook])

  const baseline = useMemo(() => {
    const m = METRICS[goal]; const fn = funnel || {}
    const den = fn[m.den === 'assigned' ? 'emailed' : m.den] || 0; const num = fn[m.num] || 0
    return den >= 30 ? num / den : m.baseline
  }, [goal, funnel])
  const need = sampleSize(baseline, lift / 100)
  const ready = funnel?.ready_now || 0

  const create = async () => {
    if (!bText.trim()) return toast.error('Describe variant B')
    setBusy(true)
    const { data: exp, error } = await supabase.from('experiments').insert({
      name: name.trim() || `${f.label} test`, factor, channel: f.channel, goal_metric: goal, hypothesis: hypothesis.trim() || null,
      audience: { tiers, regions }, min_sample: need, max_days: Number(maxDays), created_by: user.id,
    }).select().single()
    if (error) { setBusy(false); return toast.error(error.message) }
    const { error: e2 } = await supabase.from('experiment_variants').insert([
      { experiment_id: exp.id, key: 'A', name: 'Current (control)', config: { [f.field]: aText.trim() }, is_control: true, weight: 50 },
      { experiment_id: exp.id, key: 'B', name: bName.trim() || 'Variant B', config: { [f.field]: bText.trim() }, is_control: false, weight: 50 },
    ])
    setBusy(false)
    if (e2) return toast.error(e2.message)
    toast.success('Experiment created as a draft. Start it when n8n is set up for both variants.')
    onCreated(); onClose(); navigate(`/experiments/${exp.id}`)
  }

  const steps = ['Goal', 'Factor', 'Variants', 'Who and how long', 'Review']
  return (
    <Modal title="New experiment" onClose={onClose} wide footer={<>
      {step > 0 && <button className="btn btn-ghost" onClick={() => setStep(step - 1)}>Back</button>}
      {step < steps.length - 1 ? <button className="btn btn-primary" onClick={() => setStep(step + 1)} disabled={step === 2 && !bText.trim()}>Next</button> : <button className="btn btn-primary" disabled={busy} onClick={create}>{busy ? 'Creating' : 'Create draft'}</button>}
    </>}>
      <div className="wiz-steps">{steps.map((s, i) => <span key={s} className={i === step ? 'is-now' : i < step ? 'is-done' : ''}>{i + 1}. {s}</span>)}</div>

      {step === 0 && (
        <div className="stack">
          <p>What do you want to improve? Pick one number. The whole test is judged on it.</p>
          <div className="learn-options">{Object.entries(METRICS).map(([k, m]) => <button key={k} type="button" className={`learn-option${goal === k ? ' is-right' : ''}`} onClick={() => setGoal(k)}>{m.label}</button>)}</div>
          <p className="muted small">{METRICS[goal].explain}. Baseline right now: <strong>{pct(baseline)}</strong>{funnel?.[METRICS[goal].den === 'assigned' ? 'emailed' : METRICS[goal].den] >= 30 ? ' (from your last 30 days)' : ' (typical; not enough data yet)'}.</p>
        </div>
      )}

      {step === 1 && (
        <div className="stack">
          <p>Change <strong>one</strong> thing. The guide's suggestions are first.</p>
          <div className="factor-grid">
            {[...tips.map((t) => t.factor), ...FACTOR_KEYS.filter((k) => !tips.some((t) => t.factor === k))].map((k) => {
              const t = tips.find((x) => x.factor === k)
              return (
                <button key={k} type="button" className={`learn-card${factor === k ? ' is-open' : ''}`} onClick={() => setFactor(k)} disabled={running.has(k)}>
                  <span className="learn-card-label">{FACTORS[k].label}{t && <span className="tag">suggested</span>}{running.has(k) && <span className="tag">running now</span>}</span>
                  <span className="learn-card-detail">{t ? t.reason : FACTORS[k].why}</span>
                </button>
              )
            })}
          </div>
          {METRICS[goal].channel !== 'both' && f.channel !== 'both' && f.channel !== METRICS[goal].channel && <p className="form-error">This factor affects {f.channel}, but your goal measures {METRICS[goal].channel}. Pick a matching goal or factor.</p>}
        </div>
      )}

      {step === 2 && (
        <div className="stack">
          <p className="muted small">{f.why}</p>
          <label>A, the control: what we do now<textarea className="input" rows={2} value={aText} onChange={(e) => setAText(e.target.value)} placeholder={`Current ${f.fieldLabel.toLowerCase()}`} /></label>
          <label>B, the change<textarea className="input" rows={2} value={bText} onChange={(e) => setBText(e.target.value)} placeholder={`New ${f.fieldLabel.toLowerCase()}`} /></label>
          <div className="learn-options">{f.ideas.map((idea) => <button key={idea} type="button" className="learn-option" onClick={() => { setBText(idea); setBName(idea.slice(0, 40)) }}>{idea}</button>)}</div>
          <label>Short name for B<input className="input" value={bName} onChange={(e) => setBName(e.target.value)} placeholder="e.g. Risk-led subject" /></label>
          <label>Hypothesis (why B should win)<input className="input" value={hypothesis} onChange={(e) => setHypothesis(e.target.value)} placeholder="If we ..., then ... because ..." /></label>
        </div>
      )}

      {step === 3 && (
        <div className="stack">
          <label>Experiment name<input className="input" value={name} onChange={(e) => setName(e.target.value)} /></label>
          <div className="row-2">
            <div><span className="lbl">Only these tiers (none = all)</span><div className="chips">{['green', 'gold', 'red'].map((t) => <button key={t} type="button" className={`chip${tiers.includes(t) ? ' is-on' : ''}`} onClick={() => setTiers(tiers.includes(t) ? tiers.filter((x) => x !== t) : [...tiers, t])}>{t}</button>)}</div></div>
            <div><span className="lbl">Only these regions (none = all)</span><div className="chips">{['ZA', 'GB'].map((r) => <button key={r} type="button" className={`chip${regions.includes(r) ? ' is-on' : ''}`} onClick={() => setRegions(regions.includes(r) ? regions.filter((x) => x !== r) : [...regions, r])}>{r}</button>)}</div></div>
          </div>
          <div className="row-2">
            <label>Smallest lift worth detecting: {lift}%<input type="range" min="10" max="100" step="5" value={lift} onChange={(e) => setLift(Number(e.target.value))} /></label>
            <label>Stop after (days)<input className="input" type="number" min="3" max="90" value={maxDays} onChange={(e) => setMaxDays(e.target.value)} /></label>
          </div>
          <div className="score-key"><strong>Sample size: {need} leads per group, {need * 2} in total.</strong><span>To see a {lift}% relative lift on a {pct(baseline)} baseline with 95% confidence. You have {ready} leads Ready right now; new Ready leads join as they come. A smaller lift needs many more leads: at your volume, aim for big, obvious changes first.</span></div>
        </div>
      )}

      {step === 4 && (
        <div className="stack review">
          <p><strong>{name}</strong></p>
          <p>Goal: <strong>{METRICS[goal].label}</strong>, from {pct(baseline)} today.</p>
          <p>Factor: <strong>{f.label}</strong></p>
          <p>A (control): {aText || <em className="muted">not set, uses n8n's default</em>}</p>
          <p>B ({bName || 'Variant B'}): {bText}</p>
          {hypothesis && <p>Hypothesis: {hypothesis}</p>}
          <p>Audience: {tiers.length ? tiers.join(', ') : 'all tiers'}, {regions.length ? regions.join(', ') : 'both regions'}. Split 50/50. Decide at {need} leads per group or {maxDays} days.</p>
          <p className="notice-quiet">After creating, set up both variants in n8n (two Instantly campaigns or two Jobix scripts), then press Start. n8n reads each lead's variant from the queue.</p>
        </div>
      )}
    </Modal>
  )
}
