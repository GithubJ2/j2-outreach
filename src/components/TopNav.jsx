import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'

export default function TopNav() {
  const { profile, isAdmin, signOut } = useAuth()
  const [pending, setPending] = useState(0)
  const [attention, setAttention] = useState(0)

  useEffect(() => {
    if (isAdmin) {
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('approved', false).then(({ count }) => setPending(count ?? 0))
    }
    supabase.from('leads').select('id', { count: 'exact', head: true }).in('status', ['replied', 'meeting_booked']).then(({ count }) => setAttention(count ?? 0))
  }, [isAdmin])

  return (
    <nav className="topnav">
      <NavLink to="/" className="brand" end>
        <img src="/favicon.svg" alt="" width="22" height="22" />
        <span>J2 Outreach</span>
      </NavLink>
      <div className="topnav-links">
        <NavLink to="/" end>Overview</NavLink>
        <NavLink to="/leads">Leads {attention > 0 && <span className="badge" title="Replies and bookings needing a person">{attention}</span>}</NavLink>
        <NavLink to="/meetings">Meetings</NavLink>
        <NavLink to="/import">Import</NavLink>
        <NavLink to="/dnc">Do not contact</NavLink>
        <NavLink to="/settings">Settings {isAdmin && pending > 0 && <span className="badge">{pending}</span>}</NavLink>
      </div>
      <div className="topnav-user">
        <span className="user-name">{profile?.full_name || profile?.email}</span>
        <button className="btn btn-ghost btn-sm" onClick={signOut}>Sign out</button>
      </div>
    </nav>
  )
}
