import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { NEEDS_PERSON } from '../lib/constants'
import BasketballLogo from './BasketballLogo'
import LearnHub from './LearnHub'
import { useTheme } from '../lib/theme'

export default function TopNav() {
  const { profile, isAdmin, signOut } = useAuth()
  const [pending, setPending] = useState(0)
  const [attention, setAttention] = useState(0)
  const [learn, setLearn] = useState(false)
  const [theme, toggleTheme] = useTheme()

  useEffect(() => {
    if (isAdmin) {
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('approved', false).then(({ count }) => setPending(count ?? 0))
    }
    supabase.from('leads').select('id', { count: 'exact', head: true }).in('status', NEEDS_PERSON).then(({ count }) => setAttention(count ?? 0))
  }, [isAdmin])

  return (
    <nav className="topnav">
      <div className="brand">
        <BasketballLogo onScore={() => setLearn(true)} />
        <NavLink to="/" className="brand-name" end>J2 Outreach</NavLink>
      </div>
      <div className="topnav-links">
        <NavLink to="/" end>Overview</NavLink>
        <NavLink to="/leads">Leads {attention > 0 && <span className="badge" title="Replies and bookings needing a person">{attention}</span>}</NavLink>
        <NavLink to="/meetings">Meetings</NavLink>
        <NavLink to="/import">Import</NavLink>
        <NavLink to="/experiments">A/B testing</NavLink>
        <NavLink to="/dnc">Do not contact</NavLink>
        <NavLink to="/settings">Settings {isAdmin && pending > 0 && <span className="badge">{pending}</span>}</NavLink>
      </div>
      <div className="topnav-user">
        <button className="btn btn-ghost btn-sm" onClick={() => setLearn(true)}>Learn</button>
        <button className="icon-btn theme-btn" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} title={theme === 'dark' ? 'Light mode' : 'Dark mode'}>
          {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>
        <span className="user-name">{profile?.full_name || profile?.email}</span>
        <button className="btn btn-ghost btn-sm" onClick={signOut}>Sign out</button>
      </div>
      {learn && <LearnHub onClose={() => setLearn(false)} />}
    </nav>
  )
}

function MoonIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
}
function SunIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
}
