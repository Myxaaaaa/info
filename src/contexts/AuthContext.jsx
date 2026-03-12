import React, { createContext, useState, useContext, useCallback, useEffect } from 'react'

const AuthContext = createContext(null)

export const AuthProvider = ({ children }) => {
  const [users, setUsers] = useState([])
  const [user, setUser] = useState(null)
  const [isLoading, setIsLoading] = useState(false)

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
      return { success: true, user: data.user }
    } catch (e) {
      setIsLoading(false)
      return { success: false, error: 'Сервер недоступен' }
    }
  }

  const logout = useCallback(() => {
    setUser(null)
  }, [])

  // Admin: CRUD users
  const addUser = useCallback(
    async (username, password, role) => {
      try {
        const res = await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password, role }),
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
    []
  )

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
    // Загружаем пользователей с бэкенда (общие для всех устройств)
    fetch('/api/users')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data.users)) {
          setUsers(data.users)
        }
      })
      .catch(() => {})
  }, [])

  const value = {
    user,
    users,
    login,
    logout,
    isLoading,
    isAuthenticated: !!user,
    isAdmin: user?.role === 'admin',
    isBanker: user?.role === 'banker',
    isUser: user?.role === 'user',
    addUser,
    updateUser,
    deleteUser,
    changeOwnPassword,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
