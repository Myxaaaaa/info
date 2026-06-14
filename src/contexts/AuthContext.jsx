import React, { createContext, useState, useContext, useCallback, useEffect } from 'react'

const AuthContext = createContext(null)
const AUTH_SESSION_KEY = 'lk_auth_session'

const saveSession = (sessionUser) => {
  try {
    localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(sessionUser))
  } catch (_) {}
}

const clearSession = () => {
  try {
    localStorage.removeItem(AUTH_SESSION_KEY)
  } catch (_) {}
}

const loadSession = () => {
  try {
    const raw = localStorage.getItem(AUTH_SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed?.id && parsed?.username && parsed?.role) return parsed
  } catch (_) {}
  return null
}

export const AuthProvider = ({ children }) => {
  const [users, setUsers] = useState([])
  const [user, setUser] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [authReady, setAuthReady] = useState(false)

  const login = async (username, password) => {
    setIsLoading(true)
    await new Promise((r) => setTimeout(r, 400))
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const data = await res.json()
      setIsLoading(false)
      if (!res.ok || !data.success) {
        return { success: false, error: data.error || 'Ошибка входа' }
      }
      setUser(data.user)
      saveSession(data.user)
      return { success: true, user: data.user }
    } catch (e) {
      setIsLoading(false)
      return { success: false, error: 'Сервер недоступен' }
    }
  }

  const logout = useCallback(() => {
    setUser(null)
    clearSession()
  }, [])

  // Admin: CRUD users
  const addUser = useCallback(
    async (username, password, role) => {
      try {
        const res = await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username,
            password,
            role,
            createdByAdminId: user?.id,
          }),
        })
        const data = await res.json()
        if (!res.ok || !data.success) {
          return { success: false, error: data.error || 'Ошибка' }
        }
        // Обновляем список пользователей
        const listRes = await fetch('/api/users')
        const listData = await listRes.json()
        if (Array.isArray(listData.users)) {
          setUsers(listData.users)
        }
        return { success: true }
      } catch (e) {
        return { success: false, error: 'Сервер недоступен' }
      }
    },
    [user]
  )

  const updateUserAccess = useCallback(async (userId, sectionAccess) => {
    try {
      const res = await fetch(`/api/users/${userId}/access`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sectionAccess }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        return { success: false, error: data.error || 'Ошибка' }
      }
      const listRes = await fetch('/api/users')
      const listData = await listRes.json()
      if (Array.isArray(listData.users)) setUsers(listData.users)
      return { success: true }
    } catch {
      return { success: false, error: 'Сервер недоступен' }
    }
  }, [])

  const updateUser = useCallback(
    (id, updates) => {
      // Для простоты сейчас не редактируем других пользователей, кроме смены своего пароля.
      console.warn('updateUser is not implemented for server auth', id, updates)
    },
    []
  )

  const deleteUser = useCallback(
    async (id) => {
      if (user?.id === id) return { success: false, error: 'Нельзя удалить себя' }
      try {
        const res = await fetch(`/api/users/${id}`, { method: 'DELETE' })
        const data = await res.json()
        if (!res.ok || !data.success) {
          return { success: false, error: data.error || 'Ошибка' }
        }
        const listRes = await fetch('/api/users')
        const listData = await listRes.json()
        if (Array.isArray(listData.users)) {
          setUsers(listData.users)
        }
        return { success: true }
      } catch (e) {
        return { success: false, error: 'Сервер недоступен' }
      }
    },
    [user]
  )

  const changeOwnPassword = useCallback(
    async (currentPassword, newPassword) => {
      if (!user?.id) return { success: false, error: 'Не авторизован' }
      try {
        const res = await fetch(`/api/users/${user.id}/change_password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ currentPassword, newPassword }),
        })
        const data = await res.json()
        if (!res.ok || !data.success) {
          return { success: false, error: data.error || 'Ошибка' }
        }
        return { success: true }
      } catch (e) {
        return { success: false, error: 'Сервер недоступен' }
      }
    },
    [user]
  )

  useEffect(() => {
    let cancelled = false

    const finishAuth = (sessionUser) => {
      if (!cancelled) {
        if (sessionUser) setUser(sessionUser)
        setAuthReady(true)
      }
    }

    const saved = loadSession()
    if (!saved) {
      finishAuth(null)
    } else {
      fetch(`/api/session?userId=${saved.id}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.valid && data.user) {
            saveSession(data.user)
            finishAuth(data.user)
          } else {
            clearSession()
            finishAuth(null)
          }
        })
        .catch(() => finishAuth(saved))
    }

    fetch('/api/users')
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && Array.isArray(data.users)) {
          setUsers(data.users)
        }
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [])

  const role = user?.role
  const isAdmin = role === 'admin'
  const isBanker = role === 'banker'
  const isUser = role === 'user'
  // Админ = полный доступ (банкир + оператор)
  const canBanker = isAdmin || isBanker
  const canOperator = isAdmin || isUser
  const hasFullSectionAccess = isAdmin || isBanker

  const hasRestrictedAccess = isUser && user?.sectionAccess && Object.keys(user.sectionAccess).length > 0

  const canViewSection = useCallback((sectionId) => {
    if (hasFullSectionAccess) return true
    if (isUser && !hasRestrictedAccess) return true
    if (isUser) return !!(user?.sectionAccess?.[sectionId])
    return false
  }, [hasFullSectionAccess, hasRestrictedAccess, isUser, user])

  const canEditSection = useCallback((sectionId) => {
    if (isAdmin || isBanker) return true
    if (isUser && !hasRestrictedAccess) return true
    if (isUser) return user?.sectionAccess?.[sectionId] === 'edit'
    return false
  }, [isAdmin, isBanker, hasRestrictedAccess, isUser, user])

  const accessibleSections = useCallback((allSections) => {
    if (hasFullSectionAccess) return allSections
    if (isUser && !hasRestrictedAccess) return allSections
    return (allSections || []).filter((s) => user?.sectionAccess?.[s.id])
  }, [hasFullSectionAccess, hasRestrictedAccess, isUser, user])

  const canEdit = !!user

  const value = {
    user,
    users,
    login,
    logout,
    isLoading,
    authReady,
    isAuthenticated: !!user,
    isAdmin,
    isBanker,
    isUser,
    canBanker,
    canOperator,
    canEdit,
    hasFullSectionAccess,
    canViewSection,
    canEditSection,
    accessibleSections,
    addUser,
    updateUser,
    deleteUser,
    changeOwnPassword,
    updateUserAccess,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
