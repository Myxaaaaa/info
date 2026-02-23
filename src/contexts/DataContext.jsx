import React, { createContext, useState, useContext, useMemo, useEffect, useRef } from 'react'
import lkRegistryData from '../data/lk_registry.json'
import { useAdmin } from './AdminContext'

const DataContext = createContext(null)

const STORAGE_KEY = 'lk_table_data'
const HISTORY_KEY = 'lk_status_history'
const REQUESTS_KEY = 'lk_banker_requests'
const RAISED_KEY = 'lk_raised_from_rest'
const SOON_TO_REST_THRESHOLD = 4_000_000

const parseTurnover = (v) => {
  if (v == null || v === '') return 0
  const n = parseFloat(String(v).replace(/\s/g, '').replace(',', '.'))
  return isNaN(n) ? 0 : n
}

// Преобразование данных из JSON в формат таблицы
const transformData = (jsonData) => {
  if (!Array.isArray(jsonData)) return []
  
  // Список менеджеров (от кого)
  const managers = ['махабат', 'бэн', 'Бэн', 'mayson', 'Mayson', 'эрл', 'Эрл', 'алекс', 'адам', 
    'адам-ади', 'аман', 'Аман', 'узб', 'Uzb', 'UZB', 'док', 'изи', 'мырза', 'майкл', 'баха',
    'кана', 'эдиль', 'мэйсон', 'Умар', 'умар', 'мелис', 'Бэн', 'oss uzb', 'Oss uzb']
  
  // Маппинг статусов из JSON на фиксированные
  const statusMapping = {
    'на отдыхе': 'отдых',
    'в работе': 'актив',
    'заблокирован': 'блок',
    'Вылет': 'вылет',
    'Заява': 'заява',
    'у дропа': 'вернули дропу',
    'потерялся': 'потеряли',
    'запас': 'актив',
    'Запас': 'актив'
  }
  
  // Список статусов для проверки
  const statusKeywords = ['актив', 'отдых', 'блок', 'вылет', 'заява', 'вернули дропу', 'потеряли',
    'заблокирован', 'на отдыхе', 'в работе', 'Вылет', 'Заява', 'потерялся', 'у дропа', 'запас', 'Запас']
  
  return jsonData.map((item, index) => {
    // Обработка телефона - убираем +996 если есть
    let phone = item.phone || ''
    if (phone && phone.startsWith('+996')) {
      phone = phone.replace('+996', '').trim()
    }
    
    // Определяем имя - если в full_name номер карты, берем из card или оставляем пустым
    let name = item.full_name || ''
    let card = item.card || ''
    let manager = item.manager || ''
    
    // Проверяем, является ли full_name номером карты (только цифры и пробелы)
    const isCardNumber = /^[\d\s]+$/.test(name.trim())
    
    if (isCardNumber) {
      // Если full_name - это номер карты, то:
      // card = full_name (номер карты)
      // name = пустое или берем из другого места
      card = name.trim()
      name = '' // Имя не указано, оставляем пустым
    }
    
    // Проверяем поле card - если там менеджер, переносим в manager
    const cardLower = (card || '').toLowerCase().trim()
    if (managers.some(m => cardLower === m.toLowerCase())) {
      manager = card
      card = ''
    }
    
    // Если в card статус - обрабатываем
    if (statusKeywords.some(keyword => cardLower === keyword.toLowerCase())) {
      // Если статус пустой, переносим из card
      if (!item.status) {
        item.status = card
      }
      card = ''
    }
    
    // Если card пустой, но в full_name есть номер карты - используем его
    if (!card && !isCardNumber && /^[\d\s]+$/.test(name.trim())) {
      card = name.trim()
      name = ''
    }
    
    // Обработка статуса - маппинг и замена "запас" на "актив"
    let status = item.status || ''
    if (status) {
      // Применяем маппинг статусов
      status = statusMapping[status] || status
      // Заменяем "запас" на "актив"
      if (status.toLowerCase() === 'запас' || status === 'Запас') {
        status = 'актив'
      }
    }
    
    // Формируем примечания
    let extra = ''
    if (item.remaining_funds) {
      extra = `Остаток: ${item.remaining_funds}`
    }
    
    return {
      id: parseInt(item.id) || index + 1,
      name: name,
      phone: phone,
      card: card,
      status: status,
      manager: manager,
      extra: extra,
      bank: item.bank || '',
      turnover: 0,
    }
  })
  // Импортируем ВСЕ записи, даже если некоторые поля пустые
}

// Автоматическое извлечение статусов из данных
const extractStatusesFromData = (data) => {
  const statuses = new Set()
  data.forEach((item) => {
    if (item.status && item.status.trim()) {
      statuses.add(item.status.trim())
    }
  })
  return Array.from(statuses).sort()
}

const loadData = () => {
  // Всегда загружаем из JSON файла при первом запуске
  // transformData уже обрабатывает все данные правильно
  const transformed = transformData(lkRegistryData)
  
  // Если есть сохраненные изменения в localStorage, применяем их к данным из JSON
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const savedData = JSON.parse(saved)
      if (Array.isArray(savedData) && savedData.length > 0) {
        // Создаем карту сохраненных изменений по ID
        const savedMap = new Map()
        savedData.forEach(item => {
          if (item.id) savedMap.set(item.id, item)
        })
        
        // Применяем сохраненные изменения к данным из JSON
        return transformed.map(item => {
          const saved = savedMap.get(item.id)
          return saved ? { ...item, ...saved } : item
        })
      }
    }
  } catch (_) {}
  
  return transformed
}

export const DataProvider = ({ children }) => {
  const { addLog, sendTelegramNotification } = useAdmin()
  const [rows, setRows] = useState(() => {
    // При первой загрузке всегда берем данные из JSON
    // transformData уже обрабатывает все данные правильно
    const jsonData = loadData()
    return jsonData
  })

  // Автоматически извлекаем статусы из данных
  const statusOptions = useMemo(() => {
    const extracted = extractStatusesFromData(rows)
    // Добавляем базовые статусы, если их нет
    const baseStatuses = ['актив', 'отдых', 'блок', 'вылет', 'заява', 'вернули дропу', 'потеряли']
    const allStatuses = new Set([...baseStatuses, ...extracted])
    return Array.from(allStatuses).sort()
  }, [rows])

  const saveData = (newRows) => {
    setRows(newRows)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newRows))
  }

  // Загрузка истории изменений статусов
  const loadHistory = () => {
    try {
      const saved = localStorage.getItem(HISTORY_KEY)
      if (saved) {
        return JSON.parse(saved)
      }
    } catch (_) {}
    return {}
  }

  // Загрузка запросов банкира
  const loadRequests = () => {
    try {
      const saved = localStorage.getItem(REQUESTS_KEY)
      if (saved) {
        return JSON.parse(saved)
      }
    } catch (_) {}
    return {}
  }

  const [statusHistory, setStatusHistory] = useState(loadHistory)
  const [bankerRequests, setBankerRequests] = useState(loadRequests)

  const loadRaised = () => {
    try {
      const saved = localStorage.getItem(RAISED_KEY)
      if (saved) return JSON.parse(saved)
    } catch (_) {}
    return {}
  }
  const [raisedFromRest, setRaisedFromRest] = useState(loadRaised)

  const saveRaised = (data) => {
    setRaisedFromRest(data)
    localStorage.setItem(RAISED_KEY, JSON.stringify(data))
  }

  // Сохранение истории
  const saveHistory = (newHistory) => {
    setStatusHistory(newHistory)
    localStorage.setItem(HISTORY_KEY, JSON.stringify(newHistory))
  }

  // Сохранение запросов
  const saveRequests = (newRequests) => {
    setBankerRequests(newRequests)
    localStorage.setItem(REQUESTS_KEY, JSON.stringify(newRequests))
  }

  const updateStatus = (id, newStatus, changedBy = 'user') => {
    const updated = rows.map((r) => {
      if (r.id === id) {
        // Сохраняем историю изменения статуса
        const history = statusHistory[id] || []
        const newHistoryEntry = {
          from: r.status || '',
          to: newStatus,
          date: new Date().toISOString(),
          changedBy: changedBy
        }
        
        const newHistory = {
          ...statusHistory,
          [id]: [...history, newHistoryEntry]
        }
        saveHistory(newHistory)
        
        return { ...r, status: newStatus }
      }
      return r
    })
    saveData(updated)
  }

  // Функция очистки данных от статусов в неправильных полях
  const cleanLKData = (data) => {
    const cleaned = { ...data }
    
    // Список менеджеров
    const managers = ['махабат', 'бэн', 'Бэн', 'mayson', 'Mayson', 'эрл', 'Эрл', 'алекс', 'адам', 
      'адам-ади', 'аман', 'Аман', 'узб', 'Uzb', 'UZB', 'док', 'изи', 'мырза', 'майкл', 'баха',
      'кана', 'эдиль', 'мэйсон', 'Умар', 'умар', 'мелис', 'oss uzb', 'Oss uzb']
    
    // Маппинг статусов
    const statusMapping = {
      'на отдыхе': 'отдых',
      'в работе': 'актив',
      'заблокирован': 'блок',
      'Вылет': 'вылет',
      'Заява': 'заява',
      'у дропа': 'вернули дропу',
      'потерялся': 'потеряли',
      'запас': 'актив',
      'Запас': 'актив'
    }
    
    // Заменяем "запас" на "актив" в статусе и применяем маппинг
    if (cleaned.status) {
      cleaned.status = statusMapping[cleaned.status] || cleaned.status
      if (cleaned.status.toLowerCase() === 'запас' || cleaned.status === 'Запас') {
        cleaned.status = 'актив'
      }
    }
    
    // Проверяем поле card - если там менеджер, переносим в manager
    const cardLower = (cleaned.card || '').toLowerCase().trim()
    if (managers.some(m => cardLower === m.toLowerCase())) {
      if (!cleaned.manager) {
        cleaned.manager = cleaned.card
      }
      cleaned.card = ''
    }
    
    // Очищаем поле card от статусов
    const statusKeywords = ['актив', 'отдых', 'блок', 'вылет', 'заява', 'вернули дропу', 'потеряли',
      'заблокирован', 'на отдыхе', 'в работе', 'Вылет', 'Заява', 'потерялся', 'у дропа', 'запас', 'Запас']
    
    if (statusKeywords.some(keyword => cardLower === keyword.toLowerCase())) {
      // Если статус пустой, переносим из card в status
      if (!cleaned.status) {
        cleaned.status = cleaned.card
      }
      cleaned.card = ''
    }
    
    return cleaned
  }

  // Обновление ЛК (полное редактирование)
  const updateLK = (id, updates) => {
    const cleanedUpdates = cleanLKData(updates)
    if (cleanedUpdates.turnover != null) {
      cleanedUpdates.turnover = parseTurnover(cleanedUpdates.turnover)
    }
    const updated = rows.map((r) =>
      r.id === id ? { ...r, ...cleanedUpdates } : r
    )
    saveData(updated)
    addLog('Обновление ЛК', `#${id}`, '')
  }

  // Обновление оборота (с уведомлением при > 4 млн)
  const updateTurnover = (id, value) => {
    const prev = rows.find((r) => r.id === id)
    const prevVal = prev?.turnover || 0
    const num = parseTurnover(value)
    const updated = rows.map((r) =>
      r.id === id ? { ...r, turnover: num } : r
    )
    saveData(updated)
    if (prevVal < SOON_TO_REST_THRESHOLD && num >= SOON_TO_REST_THRESHOLD) {
      const lk = updated.find((r) => r.id === id)
      const info = lk ? `${lk.name || lk.card || 'ЛК'} #${id}` : `ЛК #${id}`
      sendTelegramNotification(`⚠️ Оборот > 4 млн — скоро на отдых: ${info} — ${new Intl.NumberFormat('ru-RU').format(num)}`)
    }
  }

  // Добавление ЛК
  const addLK = (data) => {
    const cleanedData = cleanLKData(data)
    const maxId = rows.length > 0 ? Math.max(...rows.map((r) => r.id)) : 0
    const newLK = {
      id: maxId + 1,
      name: cleanedData.name || '',
      phone: cleanedData.phone || '',
      card: cleanedData.card || '',
      status: cleanedData.status || '',
      manager: cleanedData.manager || '',
      bank: cleanedData.bank || '',
      extra: cleanedData.extra || '',
      turnover: parseTurnover(cleanedData.turnover) || 0,
    }
    saveData([...rows, newLK])
    addLog('Добавление ЛК', `#${newLK.id}`, '')
    return newLK.id
  }

  // Удаление ЛК
  const deleteLK = (id) => {
    const updated = rows.filter((r) => r.id !== id)
    saveData(updated)
    addLog('Удаление ЛК', `#${id}`, '')
  }

  // Массовое удаление
  const bulkDelete = (ids) => {
    const idSet = new Set(ids)
    const updated = rows.filter((r) => !idSet.has(r.id))
    saveData(updated)
    addLog('Массовое удаление ЛК', `${ids.length} записей`, '')
  }

  // Массовое изменение статуса
  const bulkUpdateStatus = (ids, newStatus, changedBy = 'user') => {
    ids.forEach((id) => updateStatus(id, newStatus, changedBy))
  }

  const isRestStatus = (s) => {
    const lower = (s || '').toLowerCase()
    return lower === 'отдых' || lower === 'на отдыхе'
  }

  // Банкир: запрос на поднятие с отдыха (один раз; повторно — только после одобрения админа)
  const requestActivateFromRest = (id, bankerName) => {
    const prevRaised = raisedFromRest[id]
    if (prevRaised) {
      return {
        success: false,
        needsAdminApproval: true,
        previousRaisedDate: prevRaised,
      }
    }
    const existing = bankerRequests[id]
    if (existing?.status === 'pending' || existing?.status === 're_raise_pending') {
      return { success: false, error: 'Запрос уже отправлен' }
    }
    const newRequests = {
      ...bankerRequests,
      [id]: {
        type: 'activate_from_rest',
        banker: bankerName,
        date: new Date().toISOString(),
        status: 'pending',
        rejectionReason: null,
      },
    }
    saveRequests(newRequests)
    const lk = rows.find((r) => r.id === id)
    const info = lk ? `${lk.name || lk.card || 'ЛК'} #${id}` : `ЛК #${id}`
    sendTelegramNotification(`🔔 Банкир ${bankerName} запросил поднять реквизит с отдыха: ${info}`)
    addLog('Запрос поднятия с отдыха', info, bankerName)
    return { success: true }
  }

  // Админ: одобрить повторный запрос банкира
  const approveReRaiseByAdmin = (id) => {
    const request = bankerRequests[id]
    if (request?.status === 're_raise_pending') {
      const newRequests = {
        ...bankerRequests,
        [id]: { ...request, status: 'pending' },
      }
      saveRequests(newRequests)
    }
  }

  // Банкир: запрос повторного поднятия (когда уже поднимали — создаёт re_raise_pending)
  const requestReRaiseFromRest = (id, bankerName) => {
    const prevRaised = raisedFromRest[id]
    if (!prevRaised) {
      return requestActivateFromRest(id, bankerName)
    }
    const existing = bankerRequests[id]
    if (existing?.status === 're_raise_pending') {
      return { success: false, error: 'Ожидает одобрения админа' }
    }
    if (existing?.status === 'pending') {
      return { success: false, error: 'Запрос уже отправлен пользователю' }
    }
    const newRequests = {
      ...bankerRequests,
      [id]: {
        type: 'activate_from_rest',
        banker: bankerName,
        date: new Date().toISOString(),
        status: 're_raise_pending',
        previousRaisedDate: prevRaised,
      },
    }
    saveRequests(newRequests)
    const lk = rows.find((r) => r.id === id)
    const info = lk ? `${lk.name || lk.card || 'ЛК'} #${id}` : `ЛК #${id}`
    sendTelegramNotification(`🔔 Банкир ${bankerName} повторно запросил поднять реквизит (ранее поднимали): ${info}`)
    addLog('Повторный запрос поднятия с отдыха', info, bankerName)
    return { success: true }
  }

  // Пользователь: подтверждение запроса банкира
  const approveBankerRequest = (id) => {
    const request = bankerRequests[id]
    if (request && request.status === 'pending') {
      updateStatus(id, 'актив', 'banker_approved')
      const newRaised = { ...raisedFromRest, [id]: new Date().toISOString() }
      saveRaised(newRaised)
      const newRequests = {
        ...bankerRequests,
        [id]: {
          ...request,
          status: 'approved',
          approvedDate: new Date().toISOString(),
        },
      }
      saveRequests(newRequests)
    }
  }

  // Пользователь: отклонение запроса банкира
  const rejectBankerRequest = (id, reason) => {
    const request = bankerRequests[id]
    if (request && request.status === 'pending') {
      const newRequests = {
        ...bankerRequests,
        [id]: {
          ...request,
          status: 'rejected',
          rejectionReason: reason,
          rejectedDate: new Date().toISOString(),
        },
      }
      saveRequests(newRequests)
    }
  }

  const getRaisedFromRestDate = (id) => raisedFromRest[id] || null

  // Получение истории для ЛК
  const getLKHistory = (id) => {
    return statusHistory[id] || []
  }

  // Получение запроса банкира для ЛК
  const getBankerRequest = (id) => {
    return bankerRequests[id] || null
  }

  const refreshFromJson = () => {
    // transformData уже обрабатывает все данные правильно
    const cleanedData = transformData(lkRegistryData)
    const oldCount = rows.length
    const newCount = cleanedData.length
    
    // Сохраняем изменения статусов из текущих данных (только если они были изменены пользователем)
    const statusChanges = new Map()
    rows.forEach(row => {
      if (row.id && row.status) {
        statusChanges.set(row.id, row.status)
      }
    })
    
    // Сохраняем turnover
    const turnoverMap = new Map()
    rows.forEach(row => {
      if (row.id && (row.turnover || 0) > 0) {
        turnoverMap.set(row.id, row.turnover)
      }
    })

    // Применяем сохраненные статусы и turnover к новым данным
    const mergedData = cleanedData.map(item => {
      const savedStatus = statusChanges.get(item.id)
      const savedTurnover = turnoverMap.get(item.id)
      return {
        ...item,
        status: savedStatus ?? item.status,
        turnover: savedTurnover ?? item.turnover ?? 0,
      }
    })
    
    saveData(mergedData)
    
    let message = `Загружено ${newCount} записей`
    if (newCount > oldCount) {
      message += ` (+${newCount - oldCount} новых)`
    }
    
    return { success: true, count: newCount, message }
  }

  const refreshFromSheets = async () => {
    const sheetId = '1frJ4DEvdmLSuIzdqXhewjQRXXsW4xavwnCUoS7WzBQM'
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&gid=0`
    try {
      const res = await fetch(url)
      const text = await res.text()
      const json = JSON.parse(text.replace(/^.*?\(/, '').slice(0, -2))
      const table = json.table
      if (!table || !table.rows) return { success: false, error: 'Нет данных' }
      
      const newRows = table.rows.map((row, i) => {
        const cells = row.c || []
        const get = (idx) => (cells[idx]?.v ?? '').toString().trim()
        return {
          id: i + 1,
          name: get(0),
          phone: get(1),
          card: get(2),
          status: get(3),
          manager: get(4),
          extra: get(5) || get(6) || get(7) || get(8) || get(9),
          bank: '',
        }
      }).filter(r => r.name || r.phone || r.card)
      
      saveData(newRows)
      return { success: true, count: newRows.length }
    } catch (e) {
      return { success: false, error: e.message || 'Ошибка загрузки' }
    }
  }

  // Синхронизация с бэкендом для бота (Railway): отправка и получение
  const syncTimeoutRef = useRef(null)
  useEffect(() => {
    if (rows.length === 0) return
    syncTimeoutRef.current && clearTimeout(syncTimeoutRef.current)
    syncTimeoutRef.current = setTimeout(() => {
      fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows,
          bankerRequests,
          raisedFromRest,
        }),
      }).catch(() => {})
    }, 1000)
    return () => {
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current)
    }
  }, [rows, bankerRequests, raisedFromRest])

  useEffect(() => {
    const t = setInterval(() => {
      fetch('/api/state')
        .then((res) => res.json())
        .then((data) => {
          if (data.rows && Array.isArray(data.rows) && data.rows.length > 0) {
            saveData(data.rows)
          }
          if (data.bankerRequests && typeof data.bankerRequests === 'object') {
            saveRequests(data.bankerRequests)
          }
          if (data.raisedFromRest && typeof data.raisedFromRest === 'object') {
            saveRaised(data.raisedFromRest)
          }
        })
        .catch(() => {})
    }, 5000)
    return () => clearInterval(t)
  }, [])

  const value = {
    rows,
    updateStatus,
    updateLK,
    updateTurnover,
    addLK,
    deleteLK,
    bulkDelete,
    bulkUpdateStatus,
    refreshFromSheets,
    refreshFromJson,
    saveData,
    statusOptions,
    getLKHistory,
    getBankerRequest,
    requestActivateFromRest,
    requestReRaiseFromRest,
    approveBankerRequest,
    approveReRaiseByAdmin,
    rejectBankerRequest,
    bankerRequests,
    getRaisedFromRestDate,
    isRestStatus,
    SOON_TO_REST_THRESHOLD,
  }

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export const useData = () => {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used within DataProvider')
  return ctx
}
