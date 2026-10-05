import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import { ToastProvider } from './lib/toast'
import { configMissing } from './lib/supabase'
import TopNav from './components/TopNav'
import Login from './pages/Login'
import ResetPassword from './pages/ResetPassword'
import Pending from './pages/Pending'
import Dashboard from './pages/Dashboard'
import Leads from './pages/Leads'
import Meetings from './pages/Meetings'
import Import from './pages/Import'
import DoNotContact from './pages/DoNotContact'
import Settings from './pages/Settings'
import Experiments from './pages/Experiments'

export default function App() {
  if (configMissing) {
    return (
      <div className="auth-page"><div className="auth-card">
        <h2>Supabase is not configured</h2>
        <p>Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> to the environment variables, then redeploy.</p>
      </div></div>
    )
  }
  return (
    <ToastProvider><AuthProvider><Gate /></AuthProvider></ToastProvider>
  )
}

function Gate() {
  const { session, profile, loading, recovery } = useAuth()
  if (loading) return <div className="splash">Loading J2 Outreach</div>
  if (recovery) return <ResetPassword />
  if (!session) return <Login />
  if (!profile?.approved) return <Pending />
  return (
    <div className="app">
      <TopNav />
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/leads" element={<Leads />} />
        <Route path="/leads/:id" element={<Leads />} />
        <Route path="/meetings" element={<Meetings />} />
        <Route path="/import" element={<Import />} />
        <Route path="/experiments" element={<Experiments />} />
        <Route path="/experiments/:id" element={<Experiments />} />
        <Route path="/dnc" element={<DoNotContact />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  )
}
