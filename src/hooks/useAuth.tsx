import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  fetchMe,
  login as apiLogin,
  logout as apiLogout,
  register as apiRegister,
  type AuthUser,
  type CloudPrefs,
} from '../api/auth'

interface AuthContextValue {
  user: AuthUser | null
  cloudData: CloudPrefs | null
  loading: boolean
  error: string | null
  login: (email: string, password: string) => Promise<CloudPrefs>
  register: (email: string, password: string, name: string) => Promise<CloudPrefs>
  logout: () => void
  clearError: () => void
  setCloudData: (data: CloudPrefs | null) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [cloudData, setCloudData] = useState<CloudPrefs | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const me = await fetchMe()
        if (cancelled) return
        if (me) {
          setUser(me.user)
          setCloudData(me.data)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    setError(null)
    const res = await apiLogin(email, password)
    setUser(res.user)
    setCloudData(res.data)
    return res.data
  }, [])

  const register = useCallback(async (email: string, password: string, name: string) => {
    setError(null)
    const res = await apiRegister(email, password, name)
    setUser(res.user)
    setCloudData(res.data)
    return res.data
  }, [])

  const logout = useCallback(() => {
    apiLogout()
    setUser(null)
    setCloudData(null)
    setError(null)
  }, [])

  const value = useMemo(
    () => ({
      user,
      cloudData,
      loading,
      error,
      login,
      register,
      logout,
      clearError: () => setError(null),
      setCloudData,
    }),
    [user, cloudData, loading, error, login, register, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
