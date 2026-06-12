import React, { createContext, useState, useContext, useMemo, useEffect, useRef, useCallback } from 'react'
import { INITIAL_DATA, DATA_VERSION } from '../data/tableData.js'
import { useAdmin } from './AdminContext'

const DataContext = createContext(null)

const STORAGE_KEY = 'lk_table_data'
const VERSION_KEY = 'lk_data_version'
const HISTORY_KEY = 'lk_status_history'
const REQUESTS_KEY = 'lk_banker_requests'
const RAISED_KEY = 'lk_raised_from_rest'
const OPERATOR_REQUESTS_KEY = 'lk_operator_requests'
const SOON_TO_REST_THRESHOLD = 4_000_000

const parseTurnover = (v) => {
  if (v == null || v === '') return 0
  const n = parseFloat(String(v).replace(/\s/g, '').replace(',', '.'))
  return isNaN(n) ? 0 : n
}

const normalizeRow = (item, index) => ({
  id: item.id || index + 1,
  name: item.name || '',
  phone: item.phone || '',
  card: item.card || '',
  status: item.status || '',
  manager: item.manager || '',
  extra: item.extra || '',
  bank: item.bank || 'Мбанк',
  turnover: item.turnover || 0,
  onStop: !!item.onStop,
  inWaitlist: !!item.inWaitlist,
})

const transformData = (sourceData) => {
  if (!Array.isArray(sourceData)) return []
  return sourceData.map((item, index) => normalizeRow(item, index))
}

const resetLocalCaches = () => {
  localStorage.removeItem(STORAGE_KEY)
  localStorage.removeItem(HISTORY_KEY)
  localStorage.removeItem(REQUESTS_KEY)
  localStorage.removeItem(RAISED_KEY)
  localStorage.removeItem(OPERATOR_REQUESTS_KEY)
  localStorage.setItem(VERSION_KEY, String(DATA_VERSION))
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
  const transformed = transformData(INITIAL_DATA)
  const savedVersion = localStorage.getItem(VERSION_KEY)

  if (String(DATA_VERSION) !== savedVersion) {
    resetLocalCaches()
    return transformed
  }

  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const savedData = JSON.parse(saved)
      if (Array.isArray(savedData) && savedData.length > 0) {
        const savedMap = new Map(savedData.map((item) => [item.id, item]))
        return transformed.map((item) => {
          const savedRow = savedMap.get(item.id)
          return savedRow ? { ...item, ...savedRow } : item
        })
      }
    }
  } catch {
    resetLocalCaches()
  }

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

  const hydratedRef = useRef(false)
  const lastServerUpdatedAt = useRef(0)
  const pushTimerRef = useRef(null)
  const hasUnsyncedChangesRef = useRef(false)
  const stateSnapshotRef = useRef({})

  const scheduleServerPush = useCallback(() => {
    if (!hydratedRef.current) return
    hasUnsyncedChangesRef.current = true
    if (pushTimerRef.current) clearTimeout(pushTimerRef.current)
    pushTimerRef.current = setTimeout(() => {
      const snap = stateSnapshotRef.current
      fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: snap.rows,
          bankerRequests: snap.bankerRequests,
          raisedFromRest: snap.raisedFromRest,
          operatorRequests: snap.operatorRequests,
          statusHistory: snap.statusHistory,
        }),
      })
        .then((res) => res.json())
        .then((data) => {
          hasUnsyncedChangesRef.current = false
          if (data.updatedAt) lastServerUpdatedAt.current = data.updatedAt
        })
        .catch(() => {})
    }, 400)
  }, [])

  const saveData = (newRows) => {
    setRows(newRows)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newRows))
    scheduleServerPush()
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

  const loadOperatorRequests = () => {
    try {
      const saved = localStorage.getItem(OPERATOR_REQUESTS_KEY)
      if (saved) return JSON.parse(saved)
    } catch (_) {}
    return {}
  }
  const [operatorRequests, setOperatorRequests] = useState(loadOperatorRequests)

  const applyOperatorRequests = (data) => {
    setOperatorRequests(data)
    localStorage.setItem(OPERATOR_REQUESTS_KEY, JSON.stringify(data))
  }

  const saveOperatorRequests = (data) => {
    applyOperatorRequests(data)
    scheduleServerPush()
  }

  const applyRaised = (data) => {
    setRaisedFromRest(data)
    localStorage.setItem(RAISED_KEY, JSON.stringify(data))
  }

  const saveRaised = (data) => {
    applyRaised(data)
    scheduleServerPush()
  }

  const applyHistory = (newHistory) => {
    setStatusHistory(newHistory)
    localStorage.setItem(HISTORY_KEY, JSON.stringify(newHistory))
  }

  const saveHistory = (newHistory) => {
    applyHistory(newHistory)
    scheduleServerPush()
  }

  const applyRequests = (newRequests) => {
    setBankerRequests(newRequests)
    localStorage.setItem(REQUESTS_KEY, JSON.stringify(newRequests))
  }

  const saveRequests = (newRequests) => {
    applyRequests(newRequests)
    scheduleServerPush()
  }

  const applyRows = (newRows) => {
    setRows(newRows)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newRows))
  }

  const applyServerState = useCallback((data) => {
    if (hasUnsyncedChangesRef.current) return
    const serverTs = data.updatedAt || 0
    if (serverTs && serverTs <= lastServerUpdatedAt.current) return
    lastServerUpdatedAt.current = serverTs || Date.now()
    if (data.rows?.length) applyRows(data.rows)
    if (data.bankerRequests) applyRequests(data.bankerRequests)
    if (data.raisedFromRest) applyRaised(data.raisedFromRest)
    if (data.operatorRequests) applyOperatorRequests(data.operatorRequests)
    if (data.statusHistory) applyHistory(data.statusHistory)
  }, [])

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
      onStop: false,
      inWaitlist: false,
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

  const getOperatorRequest = (id) => operatorRequests[id] || null

  const setLKStop = async (id, onStop, bankerName) => {
    try {
      const res = await fetch(`/api/lk/${id}/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ onStop, banker: bankerName }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) return { success: false, error: data.error || 'Ошибка' }
      const updated = rows.map((r) => (r.id === id ? { ...r, onStop: !!onStop } : r))
      saveData(updated)
      addLog(onStop ? 'Стоп реквизит' : 'Снят со стопа', `#${id}`, bankerName)
      return { success: true }
    } catch {
      return { success: false, error: 'Сервер недоступен' }
    }
  }

  const setLKWaitlist = async (id, inWaitlist, bankerName) => {
    try {
      const res = await fetch(`/api/lk/${id}/waitlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inWaitlist, banker: bankerName }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) return { success: false, error: data.error || 'Ошибка' }
      const updated = rows.map((r) => (r.id === id ? { ...r, inWaitlist: !!inWaitlist } : r))
      saveData(updated)
      addLog(inWaitlist ? 'В вайте' : 'Не в вайте', `#${id}`, bankerName)
      return { success: true }
    } catch {
      return { success: false, error: 'Сервер недоступен' }
    }
  }

  const requestOperatorAction = async (id, operatorName, payload) => {
    const {
      needsWaitlist,
      needsStop,
      needsBlock,
      needsUnblock,
      needsFace,
      stuckAmount,
      note,
    } = payload || {}
    const hasNeed = needsWaitlist || needsStop || needsBlock || needsUnblock || needsFace
    if (!hasNeed) {
      return { success: false, error: 'Выберите хотя бы один тип запроса' }
    }
    const existing = operatorRequests[id]
    if (existing?.status === 'pending') {
      return { success: false, error: 'Запрос уже отправлен' }
    }
    try {
      const res = await fetch(`/api/lk/${id}/operator-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operator: operatorName,
          needsWaitlist,
          needsStop,
          needsBlock,
          needsUnblock,
          needsFace,
          stuckAmount,
          note,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) return { success: false, error: data.error || 'Ошибка' }
      const newReq = {
        operator: operatorName,
        date: new Date().toISOString(),
        status: 'pending',
        needsWaitlist: !!needsWaitlist,
        needsStop: !!needsStop,
        needsBlock: !!needsBlock,
        needsUnblock: !!needsUnblock,
        needsFace: !!needsFace,
        stuckAmount: stuckAmount || '',
        note: note || '',
        waitlistApproved: null,
        stopApproved: null,
        blockApproved: null,
        unblockApproved: null,
        faceApproved: null,
        rejectionReason: '',
        banker: '',
        resolvedDate: null,
      }
      saveOperatorRequests({ ...operatorRequests, [id]: newReq })
      addLog('Запрос оператора', `#${id}`, operatorName)
      return { success: true }
    } catch {
      return { success: false, error: 'Сервер недоступен' }
    }
  }

  const respondOperatorRequest = async (id, bankerName, payload) => {
    const {
      waitlistApproved,
      stopApproved,
      blockApproved,
      unblockApproved,
      faceApproved,
      rejectionReason,
    } = payload || {}
    const request = operatorRequests[id]
    if (!request || request.status !== 'pending') {
      return { success: false, error: 'Нет активного запроса' }
    }
    try {
      const res = await fetch(`/api/lk/${id}/operator-response`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          banker: bankerName,
          waitlistApproved,
          stopApproved,
          blockApproved,
          unblockApproved,
          faceApproved,
          rejectionReason,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) return { success: false, error: data.error || 'Ошибка' }
      const updated = {
        ...request,
        status: 'resolved',
        banker: bankerName,
        waitlistApproved: request.needsWaitlist ? !!waitlistApproved : null,
        stopApproved: request.needsStop ? !!stopApproved : null,
        blockApproved: request.needsBlock ? !!blockApproved : null,
        unblockApproved: request.needsUnblock ? !!unblockApproved : null,
        faceApproved: request.needsFace ? !!faceApproved : null,
        rejectionReason: rejectionReason || '',
        resolvedDate: new Date().toISOString(),
      }
      saveOperatorRequests({ ...operatorRequests, [id]: updated })

      const row = rows.find((r) => r.id === id)
      if (row) {
        let next = { ...row }
        if (waitlistApproved && request.needsWaitlist) next = { ...next, inWaitlist: true }
        if (stopApproved && request.needsStop) next = { ...next, onStop: true }
        if (blockApproved && request.needsBlock) next = { ...next, status: 'блок' }
        if (unblockApproved && request.needsUnblock) next = { ...next, status: 'актив' }
        if (next.status !== row.status) {
          const history = statusHistory[id] || []
          saveHistory({
            ...statusHistory,
            [id]: [
              ...history,
              {
                from: row.status || '',
                to: next.status,
                date: new Date().toISOString(),
                changedBy: 'banker',
              },
            ],
          })
        }
        saveData(rows.map((r) => (r.id === id ? next : r)))
      }

      addLog('Ответ на запрос оператора', `#${id}`, bankerName)
      return { success: true }
    } catch {
      return { success: false, error: 'Сервер недоступен' }
    }
  }

  const refreshFromJson = () => {
    const cleanedData = transformData(INITIAL_DATA)
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
      const match = text.match(/setResponse\(([\s\S]+)\)\s*;?\s*$/)
      if (!match) return { success: false, error: 'Не удалось разобрать ответ Google Sheets' }
      const json = JSON.parse(match[1])
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

  useEffect(() => {
    stateSnapshotRef.current = { rows, bankerRequests, raisedFromRest, operatorRequests, statusHistory }
  }, [rows, bankerRequests, raisedFromRest, operatorRequests, statusHistory])

  // Синхронизация с сервером: сначала загрузка, затем опрос каждые 2 сек
  useEffect(() => {
    let cancelled = false

    const pullState = () =>
      fetch('/api/state')
        .then((res) => res.json())
        .then((data) => {
          if (!cancelled) applyServerState(data)
        })
        .catch(() => {})

    pullState().finally(() => {
      if (!cancelled) hydratedRef.current = true
    })

    const t = setInterval(pullState, 2000)
    return () => {
      cancelled = true
      clearInterval(t)
      if (pushTimerRef.current) clearTimeout(pushTimerRef.current)
    }
  }, [applyServerState])

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
    operatorRequests,
    getRaisedFromRestDate,
    getOperatorRequest,
    setLKStop,
    setLKWaitlist,
    requestOperatorAction,
    requestOperatorUnblock: requestOperatorAction,
    respondOperatorRequest,
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
