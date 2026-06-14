import React, { createContext, useState, useContext, useMemo, useEffect, useRef, useCallback } from 'react'
import { INITIAL_DATA, DATA_VERSION } from '../data/tableData.js'
import { useAdmin } from './AdminContext'
import { isBlockStatus } from '../utils/statusUtils.js'

const DataContext = createContext(null)

const ACTIVE_SECTION_KEY = 'lk_active_section'
const VERSION_KEY = 'lk_data_version'
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

const emptySectionSlice = () => ({
  rows: [],
  operatorRequests: {},
  blockReasonRequests: {},
  statusHistory: {},
  raisedFromRest: {},
  bankerRequests: {},
})

const extractStatusesFromData = (data) => {
  const statuses = new Set()
  data.forEach((item) => {
    if (item.status && item.status.trim()) statuses.add(item.status.trim())
  })
  return Array.from(statuses).sort()
}

export const DataProvider = ({ children }) => {
  const { addLog, sendTelegramNotification } = useAdmin()
  const [sections, setSections] = useState([{ id: 'mbank', name: 'Мбанк', bank: 'Мбанк' }])
  const [activeSectionId, setActiveSectionIdState] = useState(
    () => localStorage.getItem(ACTIVE_SECTION_KEY) || 'mbank'
  )
  const [sectionData, setSectionData] = useState(() => ({
    mbank: { ...emptySectionSlice(), rows: transformData(INITIAL_DATA) },
  }))

  const setActiveSection = useCallback((id) => {
    setActiveSectionIdState(id)
    localStorage.setItem(ACTIVE_SECTION_KEY, id)
  }, [])

  const currentSlice = sectionData[activeSectionId] || emptySectionSlice()
  const rows = currentSlice.rows || []
  const statusHistory = currentSlice.statusHistory || {}
  const bankerRequests = currentSlice.bankerRequests || {}
  const operatorRequests = currentSlice.operatorRequests || {}
  const blockReasonRequests = currentSlice.blockReasonRequests || {}
  const raisedFromRest = currentSlice.raisedFromRest || {}

  const updateSectionSlice = useCallback((sectionId, updater) => {
    setSectionData((prev) => {
      const slice = prev[sectionId] || emptySectionSlice()
      const nextSlice = typeof updater === 'function' ? updater(slice) : { ...slice, ...updater }
      return { ...prev, [sectionId]: nextSlice }
    })
  }, [])

  const statusOptions = useMemo(() => {
    const extracted = extractStatusesFromData(rows)
    const baseStatuses = ['актив', 'отдых', 'блок', 'вылет', 'заява', 'вернули дропу', 'потеряли']
    return Array.from(new Set([...baseStatuses, ...extracted])).sort()
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
          sectionId: snap.activeSectionId,
          rows: snap.rows,
          raisedFromRest: snap.raisedFromRest,
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

  const saveData = useCallback((newRows) => {
    updateSectionSlice(activeSectionId, (slice) => ({ ...slice, rows: newRows }))
    scheduleServerPush()
  }, [activeSectionId, updateSectionSlice, scheduleServerPush])

  const saveHistory = useCallback((newHistory) => {
    updateSectionSlice(activeSectionId, (slice) => ({ ...slice, statusHistory: newHistory }))
    scheduleServerPush()
  }, [activeSectionId, updateSectionSlice, scheduleServerPush])

  const saveRaised = useCallback((data) => {
    updateSectionSlice(activeSectionId, (slice) => ({ ...slice, raisedFromRest: data }))
    scheduleServerPush()
  }, [activeSectionId, updateSectionSlice, scheduleServerPush])

  const saveRequests = useCallback((newRequests) => {
    updateSectionSlice(activeSectionId, (slice) => ({ ...slice, bankerRequests: newRequests }))
  }, [activeSectionId, updateSectionSlice])

  const applyServerState = useCallback((data) => {
    if (data.sections?.length) setSections(data.sections)
    if (data.sectionData) {
      setSectionData(data.sectionData)
      if (!data.sectionData[activeSectionId] && data.sections?.length) {
        setActiveSection(data.sections[0].id)
      }
    } else if (data.rows?.length) {
      setSectionData((prev) => ({
        ...prev,
        mbank: { ...(prev.mbank || emptySectionSlice()), rows: data.rows, operatorRequests: data.operatorRequests || {} },
      }))
    }

    if (hasUnsyncedChangesRef.current) return
    const serverTs = data.updatedAt || 0
    if (serverTs && serverTs <= lastServerUpdatedAt.current) return
    lastServerUpdatedAt.current = serverTs || Date.now()
  }, [activeSectionId, setActiveSection])

  const pullStateFromServer = useCallback(async () => {
    try {
      const res = await fetch('/api/state')
      const data = await res.json()
      if (data.updatedAt) lastServerUpdatedAt.current = data.updatedAt
      applyServerState(data)
      return { success: true }
    } catch {
      return { success: false }
    }
  }, [applyServerState])

  const updateStatus = async (id, newStatus, changedBy = 'user') => {
    const row = rows.find((r) => r.id === id)
    const prevStatus = row?.status || ''
    const history = statusHistory[id] || []
    const newHistory = {
      ...statusHistory,
      [id]: [...history, { from: prevStatus, to: newStatus, date: new Date().toISOString(), changedBy }],
    }

    const updated = rows.map((r) => (r.id === id ? { ...r, status: newStatus } : r))
    updateSectionSlice(activeSectionId, (slice) => ({ ...slice, rows: updated, statusHistory: newHistory }))

    if (isBlockStatus(newStatus) && !isBlockStatus(prevStatus)) {
      try {
        const res = await fetch(`/api/lk/${id}/status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus, changedBy, sectionId: activeSectionId }),
        })
        const data = await res.json()
        if (data.updatedAt) lastServerUpdatedAt.current = data.updatedAt
        await pullStateFromServer()
        addLog(`Статус → ${newStatus}`, `#${id}`, changedBy)
      } catch {
        scheduleServerPush()
      }
      return
    }

    scheduleServerPush()
  }

  const cleanLKData = (data) => {
    const cleaned = { ...data }
    const managers = ['махабат', 'бэн', 'Бэн', 'mayson', 'Mayson', 'эрл', 'Эрл', 'алекс', 'адам',
      'адам-ади', 'аман', 'Аман', 'узб', 'Uzb', 'UZB', 'док', 'изи', 'мырза', 'майкл', 'баха',
      'кана', 'эдиль', 'мэйсон', 'Умар', 'умар', 'мелис', 'oss uzb', 'Oss uzb']
    const statusMapping = {
      'на отдыхе': 'отдых', 'в работе': 'актив', 'заблокирован': 'блок', 'Вылет': 'вылет',
      'Заява': 'заява', 'у дропа': 'вернули дропу', 'потерялся': 'потеряли', 'запас': 'актив', 'Запас': 'актив',
    }
    if (cleaned.status) {
      cleaned.status = statusMapping[cleaned.status] || cleaned.status
      if (cleaned.status.toLowerCase() === 'запас' || cleaned.status === 'Запас') cleaned.status = 'актив'
    }
    const cardLower = (cleaned.card || '').toLowerCase().trim()
    if (managers.some((m) => cardLower === m.toLowerCase())) {
      if (!cleaned.manager) cleaned.manager = cleaned.card
      cleaned.card = ''
    }
    const statusKeywords = ['актив', 'отдых', 'блок', 'вылет', 'заява', 'вернули дропу', 'потеряли',
      'заблокирован', 'на отдыхе', 'в работе', 'Вылет', 'Заява', 'потерялся', 'у дропа', 'запас', 'Запас']
    if (statusKeywords.some((keyword) => cardLower === keyword.toLowerCase())) {
      if (!cleaned.status) cleaned.status = cleaned.card
      cleaned.card = ''
    }
    return cleaned
  }

  const updateLK = (id, updates) => {
    const cleanedUpdates = cleanLKData(updates)
    if (cleanedUpdates.turnover != null) cleanedUpdates.turnover = parseTurnover(cleanedUpdates.turnover)
    saveData(rows.map((r) => (r.id === id ? { ...r, ...cleanedUpdates } : r)))
    addLog('Обновление ЛК', `#${id}`, '')
  }

  const updateTurnover = (id, value) => {
    const prev = rows.find((r) => r.id === id)
    const prevVal = prev?.turnover || 0
    const num = parseTurnover(value)
    const updated = rows.map((r) => (r.id === id ? { ...r, turnover: num } : r))
    saveData(updated)
    if (prevVal < SOON_TO_REST_THRESHOLD && num >= SOON_TO_REST_THRESHOLD) {
      const lk = updated.find((r) => r.id === id)
      const info = lk ? `${lk.name || lk.card || 'ЛК'} #${id}` : `ЛК #${id}`
      sendTelegramNotification(`⚠️ Оборот > 4 млн — скоро на отдых: ${info} — ${new Intl.NumberFormat('ru-RU').format(num)}`)
    }
  }

  const addLK = (data) => {
    const cleanedData = cleanLKData(data)
    const maxId = rows.length > 0 ? Math.max(...rows.map((r) => r.id)) : 0
    const section = sections.find((s) => s.id === activeSectionId)
    const newLK = {
      id: maxId + 1,
      name: cleanedData.name || '',
      phone: cleanedData.phone || '',
      card: cleanedData.card || '',
      status: cleanedData.status || '',
      manager: cleanedData.manager || '',
      bank: cleanedData.bank || section?.bank || '',
      extra: cleanedData.extra || '',
      turnover: parseTurnover(cleanedData.turnover) || 0,
      onStop: false,
      inWaitlist: false,
    }
    saveData([...rows, newLK])
    addLog('Добавление ЛК', `#${newLK.id}`, '')
    return newLK.id
  }

  const deleteLK = (id) => {
    saveData(rows.filter((r) => r.id !== id))
    addLog('Удаление ЛК', `#${id}`, '')
  }

  const bulkDelete = (ids) => {
    const idSet = new Set(ids)
    saveData(rows.filter((r) => !idSet.has(r.id)))
    addLog('Массовое удаление ЛК', `${ids.length} записей`, '')
  }

  const bulkUpdateStatus = (ids, newStatus, changedBy = 'user') => {
    ids.forEach((id) => updateStatus(id, newStatus, changedBy))
  }

  const isRestStatus = (s) => {
    const lower = (s || '').toLowerCase()
    return lower === 'отдых' || lower === 'на отдыхе'
  }

  const requestActivateFromRest = (id, bankerName) => {
    const prevRaised = raisedFromRest[id]
    if (prevRaised) return { success: false, needsAdminApproval: true, previousRaisedDate: prevRaised }
    const existing = bankerRequests[id]
    if (existing?.status === 'pending' || existing?.status === 're_raise_pending') {
      return { success: false, error: 'Запрос уже отправлен' }
    }
    saveRequests({
      ...bankerRequests,
      [id]: { type: 'activate_from_rest', banker: bankerName, date: new Date().toISOString(), status: 'pending', rejectionReason: null },
    })
    const lk = rows.find((r) => r.id === id)
    const info = lk ? `${lk.name || lk.card || 'ЛК'} #${id}` : `ЛК #${id}`
    sendTelegramNotification(`🔔 Банкир ${bankerName} запросил поднять реквизит с отдыха: ${info}`)
    addLog('Запрос поднятия с отдыха', info, bankerName)
    return { success: true }
  }

  const approveReRaiseByAdmin = (id) => {
    const request = bankerRequests[id]
    if (request?.status === 're_raise_pending') {
      saveRequests({ ...bankerRequests, [id]: { ...request, status: 'pending' } })
    }
  }

  const requestReRaiseFromRest = (id, bankerName) => {
    const prevRaised = raisedFromRest[id]
    if (!prevRaised) return requestActivateFromRest(id, bankerName)
    const existing = bankerRequests[id]
    if (existing?.status === 're_raise_pending') return { success: false, error: 'Ожидает одобрения админа' }
    if (existing?.status === 'pending') return { success: false, error: 'Запрос уже отправлен пользователю' }
    saveRequests({
      ...bankerRequests,
      [id]: { type: 'activate_from_rest', banker: bankerName, date: new Date().toISOString(), status: 're_raise_pending', previousRaisedDate: prevRaised },
    })
    const lk = rows.find((r) => r.id === id)
    const info = lk ? `${lk.name || lk.card || 'ЛК'} #${id}` : `ЛК #${id}`
    sendTelegramNotification(`🔔 Банкир ${bankerName} повторно запросил поднять реквизит (ранее поднимали): ${info}`)
    addLog('Повторный запрос поднятия с отдыха', info, bankerName)
    return { success: true }
  }

  const approveBankerRequest = (id) => {
    const request = bankerRequests[id]
    if (request && request.status === 'pending') {
      updateStatus(id, 'актив', 'banker_approved')
      saveRaised({ ...raisedFromRest, [id]: new Date().toISOString() })
      saveRequests({
        ...bankerRequests,
        [id]: { ...request, status: 'approved', approvedDate: new Date().toISOString() },
      })
    }
  }

  const rejectBankerRequest = (id, reason) => {
    const request = bankerRequests[id]
    if (request && request.status === 'pending') {
      saveRequests({
        ...bankerRequests,
        [id]: { ...request, status: 'rejected', rejectionReason: reason, rejectedDate: new Date().toISOString() },
      })
    }
  }

  const getRaisedFromRestDate = (id) => raisedFromRest[id] || null
  const getLKHistory = (id) => statusHistory[id] || []
  const getBankerRequest = (id) => bankerRequests[id] || null
  const getOperatorRequest = (id) => operatorRequests[id] || null
  const getBlockReasonRequest = (id) => blockReasonRequests[id] || null

  const apiSectionBody = () => ({ sectionId: activeSectionId })

  const setLKStop = async (id, onStop, bankerName) => {
    try {
      const res = await fetch(`/api/lk/${id}/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ onStop, banker: bankerName, ...apiSectionBody() }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) return { success: false, error: data.error || 'Ошибка' }
      saveData(rows.map((r) => (r.id === id ? { ...r, onStop: !!onStop } : r)))
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
        body: JSON.stringify({ inWaitlist, banker: bankerName, ...apiSectionBody() }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) return { success: false, error: data.error || 'Ошибка' }
      saveData(rows.map((r) => (r.id === id ? { ...r, inWaitlist: !!inWaitlist } : r)))
      addLog(inWaitlist ? 'В вайте' : 'Не в вайте', `#${id}`, bankerName)
      return { success: true }
    } catch {
      return { success: false, error: 'Сервер недоступен' }
    }
  }

  const requestOperatorAction = async (id, operatorName, payload) => {
    const { needsWaitlist, needsUnblock, needsFace, stuckAmount, note } = payload || {}
    if (!needsWaitlist && !needsUnblock && !needsFace) {
      return { success: false, error: 'Выберите хотя бы один тип запроса' }
    }
    if (operatorRequests[id]?.status === 'pending') {
      return { success: false, error: 'Запрос уже отправлен' }
    }
    try {
      const res = await fetch(`/api/lk/${id}/operator-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operator: operatorName, needsWaitlist, needsUnblock, needsFace, stuckAmount, note, ...apiSectionBody() }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) return { success: false, error: data.error || 'Ошибка' }
      if (data.updatedAt) lastServerUpdatedAt.current = data.updatedAt
      await pullStateFromServer()
      addLog('Запрос оператора', `#${id}`, operatorName)
      return { success: true }
    } catch {
      return { success: false, error: 'Сервер недоступен' }
    }
  }

  const bulkRequestOperatorAction = async (ids, operatorName, action) => {
    if (!ids?.length) return { success: false, error: 'Выберите реквизиты' }
    try {
      const res = await fetch('/api/operator-request/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operator: operatorName, action, ids, ...apiSectionBody() }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) return { success: false, error: data.error || 'Ошибка' }
      if (data.updatedAt) lastServerUpdatedAt.current = data.updatedAt
      await pullStateFromServer()
      addLog(`Массовый запрос: ${action}`, `${data.count} шт.`, operatorName)
      return { success: true, count: data.count, skipped: data.skipped }
    } catch {
      return { success: false, error: 'Сервер недоступен' }
    }
  }

  const respondOperatorRequest = async (id, bankerName, payload) => {
    const request = operatorRequests[id]
    if (!request || request.status !== 'pending') {
      return { success: false, error: 'Нет активного запроса' }
    }
    try {
      const res = await fetch(`/api/lk/${id}/operator-response`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ banker: bankerName, ...payload, ...apiSectionBody() }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) return { success: false, error: data.error || 'Ошибка' }
      if (data.updatedAt) lastServerUpdatedAt.current = data.updatedAt
      await pullStateFromServer()
      addLog('Ответ на запрос оператора', `#${id}`, bankerName)
      return { success: true }
    } catch {
      return { success: false, error: 'Сервер недоступен' }
    }
  }

  const respondBlockReasonRequest = async (id, bankerName, payload) => {
    const request = blockReasonRequests[id]
    if (!request || request.status !== 'pending') {
      return { success: false, error: 'Нет активного запроса' }
    }
    try {
      const res = await fetch(`/api/lk/${id}/block-reason-response`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ banker: bankerName, ...payload, ...apiSectionBody() }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) return { success: false, error: data.error || 'Ошибка' }
      if (data.updatedAt) lastServerUpdatedAt.current = data.updatedAt
      await pullStateFromServer()
      addLog('Ответ банкира: блок', `#${id}`, bankerName)
      return { success: true }
    } catch {
      return { success: false, error: 'Сервер недоступен' }
    }
  }

  const createSection = async (name, bank) => {
    try {
      const res = await fetch('/api/sections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, bank: bank || name }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) return { success: false, error: data.error || 'Ошибка' }
      await pullStateFromServer()
      return { success: true, section: data.section }
    } catch {
      return { success: false, error: 'Сервер недоступен' }
    }
  }

  const deleteSection = async (sectionId) => {
    try {
      const res = await fetch(`/api/sections/${sectionId}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok || !data.success) return { success: false, error: data.error || 'Ошибка' }
      if (activeSectionId === sectionId) setActiveSection('mbank')
      await pullStateFromServer()
      return { success: true }
    } catch {
      return { success: false, error: 'Сервер недоступен' }
    }
  }

  const refreshFromJson = () => {
    if (activeSectionId !== 'mbank') {
      return { success: false, error: 'Обновление из JSON доступно только для секции Мбанк' }
    }
    const cleanedData = transformData(INITIAL_DATA)
    const statusChanges = new Map(rows.filter((r) => r.status).map((r) => [r.id, r.status]))
    const turnoverMap = new Map(rows.filter((r) => (r.turnover || 0) > 0).map((r) => [r.id, r.turnover]))
    const mergedData = cleanedData.map((item) => ({
      ...item,
      status: statusChanges.get(item.id) ?? item.status,
      turnover: turnoverMap.get(item.id) ?? item.turnover ?? 0,
    }))
    saveData(mergedData)
    return { success: true, count: mergedData.length, message: `Загружено ${mergedData.length} записей` }
  }

  const refreshFromSheets = async () => {
    return { success: false, error: 'Используйте npm run sync:sheets на сервере' }
  }

  useEffect(() => {
    stateSnapshotRef.current = { activeSectionId, rows, raisedFromRest, statusHistory }
  }, [activeSectionId, rows, raisedFromRest, statusHistory])

  useEffect(() => {
    let cancelled = false
    const pullState = () =>
      fetch('/api/state')
        .then((res) => res.json())
        .then((data) => { if (!cancelled) applyServerState(data) })
        .catch(() => {})
    pullState().finally(() => { if (!cancelled) hydratedRef.current = true })
    const t = setInterval(pullState, 2000)
    return () => {
      cancelled = true
      clearInterval(t)
      if (pushTimerRef.current) clearTimeout(pushTimerRef.current)
    }
  }, [applyServerState])

  const value = {
    rows,
    sections,
    activeSectionId,
    setActiveSection,
    sectionData,
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
    getOperatorRequest,
    getBlockReasonRequest,
    blockReasonRequests,
    requestActivateFromRest,
    requestReRaiseFromRest,
    approveBankerRequest,
    approveReRaiseByAdmin,
    rejectBankerRequest,
    bankerRequests,
    operatorRequests,
    getRaisedFromRestDate,
    setLKStop,
    setLKWaitlist,
    requestOperatorAction,
    bulkRequestOperatorAction,
    requestOperatorUnblock: requestOperatorAction,
    respondOperatorRequest,
    respondBlockReasonRequest,
    createSection,
    deleteSection,
    isRestStatus,
    isBlockStatus,
    SOON_TO_REST_THRESHOLD,
  }

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export const useData = () => {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used within DataProvider')
  return ctx
}
