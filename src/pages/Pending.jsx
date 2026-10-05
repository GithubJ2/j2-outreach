import { useEffect, useState } from 'react'
import { useAuth } from '../lib/auth'

export default function Pending() {
  const { user, profile, refreshProfile, signOut } = useAuth()
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    const t = setInterval(() => refreshProfile(), 15000)
    return () => clearInterval(t)
  }, [refreshProfile])

  const check = async () => {
    setChecking(true)
    await refreshProfile()
    setChecking(false)
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h2>Waiting for approval</h2>
        <p>
          {profile ? (
            <>An admin needs to approve <strong>{user.email}</strong> before you can see leads. Let them know you have signed up. This page checks again automatically.</>
          ) : (
            <>Your account is still being set up. Check again in a moment.</>
          )}
        </p>
        <div className="form-actions">
          <button className="btn btn-ghost" onClick={signOut}>Sign out</button>
          <button className="btn btn-primary" onClick={check} disabled={checking}>{checking ? 'Checking' : 'Check again'}</button>
        </div>
      </div>
    </div>
  )
}
