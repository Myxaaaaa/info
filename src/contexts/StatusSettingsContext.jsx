import React, { createContext, useState, useContext, useMemo } from 'react'

const StatusSettingsContext = createContext(null)

const STORAGE_KEY = 'lk_status_settings'

// Дефолтные настройки статусов
const DEFAULT_STATUS_SETTINGS = {
  'актив': { bgColor: '#d1fae5', textColor: '#047857', label: 'Актив' },
  'отдых': { bgColor: '#dbeafe', textColor: '#1d4ed8', label: 'Отдых' },
  'блок': { bgColor: '#fee2e2', textColor: '#b91c1c', label: 'Блок' },
  'вылет': { bgColor: '#e0e7ff', textColor: '#4338ca', label: 'Вылет' },
  'заява': { bgColor: '#fef3c7', textColor: '#b45309', label: 'Заява' },
  'вернули дропу': { bgColor: '#d1fae5', textColor: '#047857', label: 'Вернули дропу' },
  'потеряли': { bgColor: '#f3f4f6', textColor: '#4b5563', label: 'Потеряли' },
  'на отдыхе': { bgColor: '#dbeafe', textColor: '#1d4ed8', label: 'На отдыхе' },
  'в работе': { bgColor: '#d1fae5', textColor: '#047857', label: 'В работе' },
  'заблокирован': { bgColor: '#fee2e2', textColor: '#b91c1c', label: 'Заблокирован' },
  'Вылет': { bgColor: '#e0e7ff', textColor: '#4338ca', label: 'Вылет' },
  'Заява': { bgColor: '#fef3c7', textColor: '#b45309', label: 'Заява' },
  'потерялся': { bgColor: '#f3f4f6', textColor: '#4b5563', label: 'Потерялся' },
  'у дропа': { bgColor: '#d1fae5', textColor: '#047857', label: 'У дропа' },
  'запас': { bgColor: '#d1fae5', textColor: '#047857', label: 'Запас' },
}

const loadSettings = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      return JSON.parse(saved)
    }
  } catch (_) {}
  return DEFAULT_STATUS_SETTINGS
}

// Генерация цвета для статуса
const generateStatusColor = (statusName) => {
  // Генерируем цвет на основе названия статуса
  const hash = statusName.split('').reduce((acc, char) => {
    return char.charCodeAt(0) + ((acc << 5) - acc)
  }, 0)
  
  const hue = Math.abs(hash) % 360
  const saturation = 60 + (Math.abs(hash) % 20)
  const lightness = 85 + (Math.abs(hash) % 10)
  
  const bgColor = `hsl(${hue}, ${saturation}%, ${lightness}%)`
  const textColor = lightness > 50 ? '#1e293b' : '#ffffff'
  
  return { bgColor, textColor }
}

export const StatusSettingsProvider = ({ children }) => {
  const [settings, setSettings] = useState(loadSettings)

  // Автоматически создаем настройки для статусов, которых нет
  const ensureStatusExists = (statusName) => {
    if (!statusName || settings[statusName]) return
    
    const colors = generateStatusColor(statusName)
    const newSettings = {
      ...settings,
      [statusName]: {
        bgColor: colors.bgColor,
        textColor: colors.textColor,
        label: statusName
      }
    }
    setSettings(newSettings)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newSettings))
  }

  const saveSettings = (newSettings) => {
    setSettings(newSettings)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newSettings))
  }

  const addStatus = (statusName, bgColor, textColor, label) => {
    const newSettings = {
      ...settings,
      [statusName]: {
        bgColor,
        textColor,
        label: label || statusName
      }
    }
    saveSettings(newSettings)
  }

  const updateStatus = (statusName, updates) => {
    const newSettings = {
      ...settings,
      [statusName]: {
        ...settings[statusName],
        ...updates
      }
    }
    saveSettings(newSettings)
  }

  const deleteStatus = (statusName) => {
    const newSettings = { ...settings }
    delete newSettings[statusName]
    saveSettings(newSettings)
  }

  const getStatusStyle = (statusName) => {
    if (!statusName) return {}
    let status = settings[statusName]
    
    // Если статуса нет в настройках, используем сгенерированные цвета
    if (!status) {
      const colors = generateStatusColor(statusName)
      status = {
        ...colors,
        label: statusName
      }
    }
    
    return {
      backgroundColor: status.bgColor,
      color: status.textColor
    }
  }

  const getStatusLabel = (statusName) => {
    if (!statusName) return '—'
    return settings[statusName]?.label || statusName
  }

  const value = {
    settings,
    addStatus,
    updateStatus,
    deleteStatus,
    getStatusStyle,
    getStatusLabel,
    saveSettings,
    ensureStatusExists
  }

  return (
    <StatusSettingsContext.Provider value={value}>
      {children}
    </StatusSettingsContext.Provider>
  )
}

export const useStatusSettings = () => {
  const ctx = useContext(StatusSettingsContext)
  if (!ctx) {
    throw new Error('useStatusSettings must be used within StatusSettingsProvider')
  }
  return ctx
}
