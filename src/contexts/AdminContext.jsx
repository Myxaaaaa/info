import React, { createContext, useState, useContext, useCallback } from 'react'

const AdminContext = createContext(null)

const LOGS_KEY = 'lk_activity_logs'
const TELEGRAM_KEY = 'lk_telegram_webhook'
const TELEGRAM_CHAT_KEY = 'lk_telegram_chat_id'
const MAX_LOGS = 500

const loadLogs = () => {
  try {
    const saved = localStorage.getItem(LOGS_KEY)
    if (saved) return JSON.parse(saved)
  } catch (_) {}
  return []
}

const loadTelegramUrl = () => {
  try {
    return localStorage.getItem(TELEGRAM_KEY) || ''
  } catch (_) {}
  return ''
}

const loadTelegramChatId = () => {
  try {
    return localStorage.getItem(TELEGRAM_CHAT_KEY) || ''
  } catch (_) {}
  return ''
}

export const AdminProvider = ({ children }) => {
  const [logs, setLogs] = useState(loadLogs)
  const [telegramUrl, setTelegramUrlState] = useState(loadTelegramUrl)
  const [telegramChatId, setTelegramChatIdState] = useState(loadTelegramChatId)

  const addLog = useCallback((action, details = '', userId = '') => {
    const entry = {
      id: Date.now(),
      date: new Date().toISOString(),
      action,
      details,
      userId,
    }
    setLogs((prev) => {
      const next = [entry, ...prev].slice(0, MAX_LOGS)
      localStorage.setItem(LOGS_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  const setTelegramUrl = useCallback((url) => {
    setTelegramUrlState(url || '')
    localStorage.setItem(TELEGRAM_KEY, url || '')
  }, [])

  const setTelegramChatId = useCallback((id) => {
    setTelegramChatIdState(id || '')
    localStorage.setItem(TELEGRAM_CHAT_KEY, id || '')
  }, [])

  const sendTelegramNotification = useCallback(
    async (message) => {
      const chatId = telegramChatId || localStorage.getItem(TELEGRAM_CHAT_KEY)
      if (!chatId?.trim()) return
      try {
        await fetch('/api/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: message, chatId: chatId.trim() }),
        }).catch(() => {})
      } catch (_) {}
    },
    [telegramChatId]
  )

  const value = {
    logs,
    addLog,
    telegramUrl,
    setTelegramUrl,
    telegramChatId,
    setTelegramChatId,
    sendTelegramNotification,
  }

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>
}

export const useAdmin = () => {
  const ctx = useContext(AdminContext)
  if (!ctx) throw new Error('useAdmin must be used within AdminProvider')
  return ctx
}
