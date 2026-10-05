import { STATUSES, TIERS } from '../lib/constants'

export function StatusPill({ status }) {
  const s = STATUSES[status] || { label: status }
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
