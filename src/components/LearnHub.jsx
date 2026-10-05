import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { StatusPill, TierBadge } from './Badges'

// One idea per screen. Every screen has one small thing to do before moving on.
// Nothing here is timed, nothing is scored, and the window can be closed at any point.
const LESSONS = [
  {
    key: 'what',
    title: 'What this portal does',
    lead: 'Three things. Tap each one.',
    task: { type: 'reveal', items: [
      { label: 'Leads in', detail: 'People we might contact arrive here from Lusha, n8n and CSV files.' },
      { label: 'Contact them', detail: 'Emails go out through Instantly. Calls go out through Jobix. Both report back here.' },
      { label: 'Meetings out', detail: 'When a meeting is booked, the SDR team gets an email and confirms it.' },
    ] },
    done: 'That is the whole idea. Everything else is detail.',
  },
  {
    key: 'journey',
    title: 'A lead moves through statuses',
    lead: 'Each status is one step. Tap a status to see what it means.',
    task: { type: 'reveal', items: [
      { pill: 'new', detail: 'Just imported. A person checks it first.' },
      { pill: 'ready', detail: 'Approved. The system can start contacting them.' },
      { pill: 'in_sequence', detail: 'Emails are going out.' },
      { pill: 'calling', detail: 'The AI is calling them.' },
      { pill: 'replied', detail: 'They wrote back. A person must answer.' },
      { pill: 'meeting_booked', detail: 'A meeting is booked. An SDR confirms it.' },
    ] },
    done: 'Grey and dashed means waiting. Solid green means a result.',
  },
  {
    key: 'person',
    title: 'When do you need to act?',
    lead: 'Which status means a person must do something now?',
    task: { type: 'choice', options: [
      { pill: 'ready', ok: false, say: 'Not quite. Ready means the system takes over from here.' },
      { pill: 'replied', ok: true, say: 'Yes. Someone wrote back and is waiting for a human.' },
      { pill: 'calling', ok: false, say: 'Not quite. The AI is handling this one.' },
    ] },
    done: 'Replied and Meeting booked are the two that need you. The number on the Leads tab counts them.',
  },
  {
    key: 'tiers',
    title: 'Colour means quality',
    lead: 'Every lead gets a score from 0 to 100, then a colour.',
    task: { type: 'choice', question: 'A CISO at a 500-person bank with exposed systems online. Which colour?', options: [
      { tier: 'green', ok: true, say: 'Yes. High score. Green leads get personal outreach from the best SDRs.' },
      { tier: 'gold', ok: false, say: 'Close. Gold is good, but this one ticks every box.' },
      { tier: 'red', ok: false, say: 'No. Red is a weak fit, used for testing.' },
    ] },
    done: 'Green: personal outreach. Gold: automated. Red: testing. Scores update themselves when new facts arrive.',
  },
  {
    key: 'loop',
    title: 'Your daily loop',
    lead: 'Tap the three steps in the right order.',
    task: { type: 'order', items: ['Import leads', 'Mark the good ones Ready', 'Answer replies and confirm meetings'] },
    done: 'Import. Mark ready. Handle what comes back. That is a normal day.',
  },
  {
    key: 'dnc',
    title: 'Do not contact',
    lead: 'People on this list are never emailed or called again.',
    task: { type: 'choice', question: 'Someone clicks unsubscribe in an email. Do you need to add them to the list by hand?', options: [
      { label: 'Yes', ok: false, say: 'No need. It happens on its own.' },
      { label: 'No', ok: true, say: 'Correct. Unsubscribes and "do not call" outcomes are added automatically.' },
    ] },
    done: 'The list is checked on every import, every email and every call. You can add people by hand on the Do not contact page.',
  },
  {
    key: 'tools',
    title: 'Who does what',
    lead: 'Tap the tool that matches each job.',
    task: { type: 'match', pairs: [
      { job: 'Makes the phone calls', tool: 'Jobix' },
      { job: 'Sends the emails', tool: 'Instantly' },
      { job: 'Moves data between everything', tool: 'n8n' },
      { job: 'Keeps the customer records', tool: 'ConnectWise' },
    ] },
    done: 'This portal is the one place that sees all four.',
  },
]

export default function LearnHub({ onClose }) {
  const [i, setI] = useState(0)
  const [finished, setFinished] = useState(false)
  const lesson = LESSONS[i]

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const next = () => (i < LESSONS.length - 1 ? setI(i + 1) : setFinished(true))

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal learn" role="dialog" aria-modal="true" aria-label="Learn how J2 Outreach works">
        <div className="modal-head">
          <div className="learn-progress" aria-label={`Step ${Math.min(i + 1, LESSONS.length)} of ${LESSONS.length}`}>
            {LESSONS.map((l, n) => <span key={l.key} className={`learn-dot${n < i || finished ? ' is-done' : n === i && !finished ? ' is-now' : ''}`} />)}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="modal-body learn-body">
          {finished ? (
            <Finish onReplay={() => { setI(0); setFinished(false) }} onClose={onClose} />
          ) : (
            <Lesson key={lesson.key} lesson={lesson} index={i} onNext={next} onSkip={next} />
          )}
        </div>
      </div>
    </div>
  )
}

function Lesson({ lesson, index, onNext, onSkip }) {
  const [complete, setComplete] = useState(false)
  return (
    <div className="lesson">
      <p className="learn-step">Step {index + 1} of {LESSONS.length}</p>
      <h2>{lesson.title}</h2>
      <p className="learn-lead">{lesson.lead}</p>
      <Task task={lesson.task} onComplete={() => setComplete(true)} />
      {complete && <p className="learn-done">{lesson.done}</p>}
      <div className="learn-actions">
        {!complete && <button className="text-btn" onClick={onSkip}>Skip this one</button>}
        <button className="btn btn-primary" disabled={!complete} onClick={onNext}>{index === LESSONS.length - 1 ? 'Finish' : 'Next'}</button>
      </div>
    </div>
  )
}

function Task({ task, onComplete }) {
  if (task.type === 'reveal') return <Reveal items={task.items} onComplete={onComplete} />
  if (task.type === 'choice') return <Choice task={task} onComplete={onComplete} />
  if (task.type === 'order') return <Order items={task.items} onComplete={onComplete} />
  if (task.type === 'match') return <Match pairs={task.pairs} onComplete={onComplete} />
  return null
}

function Reveal({ items, onComplete }) {
  const [open, setOpen] = useState(new Set())
  const tap = (n) => {
    const next = new Set(open); next.add(n); setOpen(next)
    if (next.size === items.length) onComplete()
  }
  return (
    <div className="learn-reveal">
      {items.map((it, n) => (
        <button key={n} type="button" className={`learn-card${open.has(n) ? ' is-open' : ''}`} onClick={() => tap(n)} aria-expanded={open.has(n)}>
          <span className="learn-card-label">{it.pill ? <StatusPill status={it.pill} /> : it.label}</span>
          {open.has(n) ? <span className="learn-card-detail">{it.detail}</span> : <span className="learn-card-hint">Tap</span>}
        </button>
      ))}
      <p className="muted small">{open.size} of {items.length} opened</p>
    </div>
  )
}

function Choice({ task, onComplete }) {
  const [picked, setPicked] = useState(null)
  const choose = (n) => { setPicked(n); if (task.options[n].ok) onComplete() }
  return (
    <div className="learn-choice">
      {task.question && <p className="learn-question">{task.question}</p>}
      <div className="learn-options">
        {task.options.map((o, n) => (
          <button key={n} type="button" className={`learn-option${picked === n ? (o.ok ? ' is-right' : ' is-wrong') : ''}`} onClick={() => choose(n)}>
            {o.pill ? <StatusPill status={o.pill} /> : o.tier ? <span className="tier-pick"><TierBadge tier={o.tier} /> {o.tier[0].toUpperCase() + o.tier.slice(1)}</span> : o.label}
          </button>
        ))}
      </div>
      {picked !== null && <p className={`learn-say ${task.options[picked].ok ? 'good' : ''}`}>{task.options[picked].say}{!task.options[picked].ok ? ' Try another.' : ''}</p>}
    </div>
  )
}

function Order({ items, onComplete }) {
  const [picked, setPicked] = useState([])
  const [wrong, setWrong] = useState(false)
  const tap = (n) => {
    if (picked.includes(n)) return
    if (n !== picked.length) { setWrong(true); setTimeout(() => setWrong(false), 900); return }
    const next = [...picked, n]; setPicked(next)
    if (next.length === items.length) onComplete()
  }
  return (
    <div className="learn-order">
      <div className="learn-options">
        {items.map((label, n) => (
          <button key={n} type="button" className={`learn-option${picked.includes(n) ? ' is-right' : ''}`} onClick={() => tap(n)} disabled={picked.includes(n)}>
            {picked.includes(n) && <span className="learn-num">{picked.indexOf(n) + 1}</span>}{label}
          </button>
        ))}
      </div>
      {wrong && <p className="learn-say">Not that one yet. What comes before it?</p>}
    </div>
  )
}

function Match({ pairs, onComplete }) {
  const [current, setCurrent] = useState(0)
  const [wrong, setWrong] = useState(null)
  const tools = pairs.map((p) => p.tool).sort()
  const pick = (tool) => {
    if (tool === pairs[current].tool) { setWrong(null); if (current + 1 === pairs.length) onComplete(); setCurrent(current + 1) }
    else { setWrong(tool); setTimeout(() => setWrong(null), 900) }
  }
  const finished = current >= pairs.length
  return (
    <div className="learn-match">
      <p className="learn-question">{finished ? 'All matched.' : pairs[current].job}</p>
      <div className="learn-options">
        {tools.map((t) => {
          const solved = pairs.slice(0, current).some((p) => p.tool === t)
          return <button key={t} type="button" className={`learn-option${solved ? ' is-right' : wrong === t ? ' is-wrong' : ''}`} disabled={solved || finished} onClick={() => pick(t)}>{t}</button>
        })}
      </div>
      <p className="muted small">{Math.min(current, pairs.length)} of {pairs.length} matched</p>
    </div>
  )
}

function Finish({ onReplay, onClose }) {
  return (
    <div className="lesson learn-finish">
      <div className="learn-ball" aria-hidden="true">🏀</div>
      <h2>Nothing but net</h2>
      <p className="learn-lead">You know how the portal works. Here is where to go next.</p>
      <div className="learn-links">
        <Link to="/import" className="learn-card" onClick={onClose}><span className="learn-card-label">Import leads</span><span className="learn-card-detail">Start with a small Lusha file.</span></Link>
        <Link to="/leads?status=new" className="learn-card" onClick={onClose}><span className="learn-card-label">Review new leads</span><span className="learn-card-detail">Mark the good ones Ready.</span></Link>
        <Link to="/settings" className="learn-card" onClick={onClose}><span className="learn-card-label">Settings</span><span className="learn-card-detail">Targets, scoring and connections.</span></Link>
      </div>
      <div className="learn-actions">
        <button className="text-btn" onClick={onReplay}>Play again</button>
        <button className="btn btn-primary" onClick={onClose}>Done</button>
      </div>
      <p className="muted small">To open this again, drag the logo down the page and sink it in the hoop, or use the Learn button.</p>
    </div>
  )
}
