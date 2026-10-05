import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

export default function ResetPassword() {
  const { clearRecovery } = useAuth()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) setError(error.message)
    else clearRecovery()
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h2>Choose a new password</h2>
        <form className="stack" onSubmit={submit}>
          <label>
            New password
            <input className="input" type="password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="btn btn-primary btn-block" disabled={busy}>Save password</button>
        </form>
      </div>
    </div>
  )
}
