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
  getCachedSession,
  getToken,
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
  /** True when session came from cache and is still revalidating */
  restoring: boolean
  login: (email: string, password: string) => Promise<CloudPrefs>
  register: (email: string, password: string, name: string) => Promise<CloudPrefs>
  logout: () => void
  clearError: () => void
  setCloudData: (data: CloudPrefs | null) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

function initialFromCache(): {
  user: AuthUser | null
  cloudData: CloudPrefs | null
  hasToken: boolean
} {
  const hasToken = Boolean(getToken())
  if (!hasToken) return { user: null, cloudData: null, hasToken: false }
  const cached = getCachedSession()
  if (cached) {
    return { user: cached.user, cloudData: cached.data, hasToken: true }
  }
  return { user: null, cloudData: null, hasToken: true }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const boot = initialFromCache()
  const [user, setUser] = useState<AuthUser | null>(boot.user)
  const [cloudData, setCloudData] = useState<CloudPrefs | null>(boot.cloudData)
  // If we already have a cached user, don't block the UI on network
  const [loading, setLoading] = useState(!boot.user && boot.hasToken)
  const [restoring, setRestoring] = useState(boot.hasToken)
  const [error, setError] = useState<string | null>(null)

  // Auto sign-in: revalidate stored JWT on every load
  useEffect(() => {
    let cancelled = false
    const token = getToken()
    if (!token) {
      setLoading(false)
      setRestoring(false)
      return
    }

    setRestoring(true)
    ;(async () => {
      try {
        const me = await fetchMe()
        if (cancelled) return
        if (me) {
          setUser(me.user)
          setCloudData(me.data)
        } else {
          // Token invalid
          setUser(null)
          setCloudData(null)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
          setRestoring(false)
        }
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
    setRestoring(false)
    setLoading(false)
    return res.data
  }, [])

  const register = useCallback(async (email: string, password: string, name: string) => {
    setError(null)
    const res = await apiRegister(email, password, name)
    setUser(res.user)
    setCloudData(res.data)
    setRestoring(false)
    setLoading(false)
    return res.data
  }, [])

  const logout = useCallback(() => {
    apiLogout()
    setUser(null)
    setCloudData(null)
    setError(null)
    setRestoring(false)
  }, [])

  const value = useMemo(
    () => ({
      user,
      cloudData,
      loading,
      restoring,
      error,
      login,
      register,
      logout,
      clearError: () => setError(null),
      setCloudData,
    }),
    [user, cloudData, loading, restoring, error, login, register, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
