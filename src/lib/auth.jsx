import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  // undefined = still loading, null = none
  const [session, setSession] = useState(undefined)
  const [profile, setProfile] = useState(undefined)
  const [recovery, setRecovery] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null))
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
      setSession(s ?? null)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const userId = session?.user?.id

  const refreshProfile = useCallback(async () => {
    if (!userId) {
      setProfile(null)
      return
    }
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
    setProfile(data ?? null)
  }, [userId])

  useEffect(() => {
    if (session === undefined) return
    setProfile(undefined)
    refreshProfile()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, session === undefined])

  const signOut = () => supabase.auth.signOut()

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    loading: session === undefined || (session && profile === undefined),
    recovery,
    clearRecovery: () => setRecovery(false),
    refreshProfile,
    signOut,
    isAdmin: profile?.role === 'admin' && profile?.approved,
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
