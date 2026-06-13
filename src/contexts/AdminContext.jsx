import React, { createContext, useState, useContext, useCallback, useEffect, useRef } from 'react'

const AdminContext = createContext(null)

const TELEGRAM_CHAT_KEY = 'lk_telegram_chat_id'
const MAX_LOGS = 500

export const AdminProvider = ({ children }) => {
  const [logs, setLogs] = useState([])
  const [telegramChatId, setTelegramChatIdState] = useState('')
  const [telegramEnabled, setTelegramEnabled] = useState(false)
  const saveTimeoutRef = useRef(null)

  useEffect(() => {
    fetch('/api/settings')
      .then((res) => res.json())
      .then((data) => {
        if (data.telegramChatId) {
          setTelegramChatIdState(data.telegramChatId)
          localStorage.setItem(TELEGRAM_CHAT_KEY, data.telegramChatId)
        }
        setTelegramEnabled(!!data.telegramEnabled)
        if (data.telegramBotUsername && !data.telegramEnabled) {
          console.warn('Telegram: токен невалидный')
        }
      })
      .catch(() => {
        const saved = localStorage.getItem(TELEGRAM_CHAT_KEY)
        if (saved) setTelegramChatIdState(saved)
      })

    fetch('/api/logs')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data.logs)) setLogs(data.logs)
      })
      .catch(() => {})

    const t = setInterval(() => {
      fetch('/api/logs')
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data.logs)) setLogs(data.logs)
        })
        .catch(() => {})
    }, 8000)
    return () => clearInterval(t)
  }, [])

  const addLog = useCallback((action, details = '', userId = '') => {
    const entry = {
      id: Date.now(),
      date: new Date().toISOString(),
      action,
      details,
      userId,
    }
    setLogs((prev) => [entry, ...prev].slice(0, MAX_LOGS))
    fetch('/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, details, userId }),
    }).catch(() => {})
  }, [])

  const setTelegramChatId = useCallback((id) => {
    const val = id || ''
    setTelegramChatIdState(val)
    localStorage.setItem(TELEGRAM_CHAT_KEY, val)
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(() => {
      fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telegramChatId: val }),
      })
        .then((res) => res.json())
        .then((data) => setTelegramEnabled(!!data.settings?.telegramEnabled))
        .catch(() => {})
    }, 500)
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
        })
      } catch (_) {}
    },
    [telegramChatId]
  )

  const value = {
    logs,
    addLog,
    telegramChatId,
    setTelegramChatId,
    telegramEnabled,
    sendTelegramNotification,
  }

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>
}

export const useAdmin = () => {
  const ctx = useContext(AdminContext)
  if (!ctx) throw new Error('useAdmin must be used within AdminProvider')
  return ctx
}
