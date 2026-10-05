import { Link } from 'react-router-dom'
import { STATUSES, TIERS } from '../lib/constants'

export function StatusPill({ status, to, title }) {
  const s = STATUSES[status] || { label: status }
  if (to) return <Link to={to} className={`pill pill-${status} pill-link`} title={title || s.hint} onClick={(e) => e.stopPropagation()}>{s.label} →</Link>
  return <span className={`pill pill-${status}`} title={s.hint}>{s.label}</span>
}

export function TierBadge({ tier, score }) {
  const t = TIERS[tier] || { label: tier }
  return (
    <span className={`tier tier-${tier}`} title={`${t.label}: ${t.hint}`}>
      <span className="tier-dot" />
      {score ?? ''}
    </span>
  )
}
