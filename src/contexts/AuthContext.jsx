import React, { createContext, useState, useContext, useCallback } from 'react'

const AuthContext = createContext(null)

const USERS_KEY = 'lk_users'
const DEFAULT_USERS = [
  { id: '1', username: 'admin', password: 'admin123', role: 'admin' },
  { id: '2', username: 'banker', password: 'banker123', role: 'banker' },
  { id: '3', username: 'user', password: 'user123', role: 'user' },
]

const loadUsers = () => {
  try {
    const saved = localStorage.getItem(USERS_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch (_) {}
  return DEFAULT_USERS
}

export const AuthProvider = ({ children }) => {
  const [users, setUsers] = useState(loadUsers)
  const [user, setUser] = useState(null)
  const [isLoading, setIsLoading] = useState(false)

  const saveUsers = useCallback((newUsers) => {
    setUsers(newUsers)
    localStorage.setItem(USERS_KEY, JSON.stringify(newUsers))
  }, [])

  const login = async (username, password) => {
    setIsLoading(true)
    await new Promise((r) => setTimeout(r, 400))
    const found = users.find(
      (u) => u.username.toLowerCase() === username.toLowerCase() && u.password === password
    )
    setIsLoading(false)
    if (found) {
      const userData = { id: found.id, username: found.username, role: found.role }
      setUser(userData)
      localStorage.setItem('user', JSON.stringify(userData))
      return { success: true, user: userData }
    }
    return { success: false, error: 'Неверный логин или пароль' }
  }

  const logout = useCallback(() => {
    setUser(null)
    localStorage.removeItem('user')
  }, [])

  // Admin: CRUD users
  const addUser = useCallback(
    (username, password, role) => {
      const exists = users.some((u) => u.username.toLowerCase() === username.toLowerCase())
      if (exists) return { success: false, error: 'Пользователь с таким логином уже есть' }
      const maxId = Math.max(0, ...users.map((u) => parseInt(u.id) || 0))
      const newUser = {
        id: String(maxId + 1),
        username: username.trim(),
        password: password.trim(),
        role: role || 'user',
      }
      const newUsers = [...users, newUser]
      saveUsers(newUsers)
      return { success: true }
    },
    [users, saveUsers]
  )

  const updateUser = useCallback(
    (id, updates) => {
      const newUsers = users.map((u) =>
        u.id === id ? { ...u, ...updates } : u
      )
      saveUsers(newUsers)
    },
    [users, saveUsers]
  )

  const deleteUser = useCallback(
    (id) => {
      if (user?.id === id) return { success: false, error: 'Нельзя удалить себя' }
      saveUsers(users.filter((u) => u.id !== id))
      return { success: true }
    },
    [users, user, saveUsers]
  )

  const changeOwnPassword = useCallback(
    (currentPassword, newPassword) => {
      if (!user?.id) return { success: false, error: 'Не авторизован' }
      const u = users.find((x) => x.id === user.id)
      if (!u) return { success: false, error: 'Пользователь не найден' }
      if (u.password !== currentPassword) return { success: false, error: 'Неверный текущий пароль' }
      const trimmed = newPassword.trim()
      if (!trimmed) return { success: false, error: 'Введите новый пароль' }
      updateUser(user.id, { password: trimmed })
      return { success: true }
    },
    [user, users, updateUser]
  )

  React.useEffect(() => {
    const saved = localStorage.getItem('user')
    if (saved) {
      try {
        setUser(JSON.parse(saved))
      } catch (_) {
        localStorage.removeItem('user')
      }
    }
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
    saveUsers,
    changeOwnPassword,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
