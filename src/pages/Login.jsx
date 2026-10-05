import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(error.message)
    } else if (mode === 'signup') {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName.trim() }, emailRedirectTo: window.location.origin },
      })
      if (error) setError(error.message)
      else if (!data.session) {
        // Accounts are auto-confirmed in the database, so sign straight in.
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
        if (signInError) setError(`Account created, but signing in failed: ${signInError.message}`)
      }
    } else {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })
      if (error) setError(error.message)
      else setNotice(`If ${email} has an account, a reset link is on its way.`)
    }
    setBusy(false)
  }

  const heading = { signin: 'Sign in', signup: 'Create your account', reset: 'Reset your password' }[mode]
  const action = { signin: 'Sign in', signup: 'Create account', reset: 'Send reset link' }[mode]

  return (
    <div className="auth-page">
      <div className="auth-brand">
        <img src="/favicon.svg" alt="" width="56" height="56" />
        <h1>J2 Outreach</h1>
        <p>Leads in, qualified meetings out.</p>
      </div>
      <div className="auth-card">
        <h2>{heading}</h2>
        <form className="stack" onSubmit={submit}>
          {mode === 'signup' && (
            <label>
              Full name
              <input className="input" required value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" />
            </label>
          )}
          <label>
            Work email
            <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </label>
          {mode !== 'reset' && (
            <label>
              Password
              <input
                className="input"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              />
            </label>
          )}
          {error && <p className="form-error" role="alert">{error}</p>}
          {notice && <p className="form-notice">{notice}</p>}
          <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'One moment' : action}</button>
        </form>
        <div className="auth-switch">
          {mode === 'signin' && (
            <>
              <button className="text-btn" onClick={() => setMode('signup')}>Create an account</button>
              <button className="text-btn" onClick={() => setMode('reset')}>Forgot password</button>
            </>
          )}
          {mode !== 'signin' && <button className="text-btn" onClick={() => setMode('signin')}>Back to sign in</button>}
        </div>
      </div>
    </div>
  )
}
