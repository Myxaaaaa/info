import express from 'express'
import { readFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __envPath = join(dirname(fileURLToPath(import.meta.url)), '../.env')
if (existsSync(__envPath)) {
  readFileSync(__envPath, 'utf8').split('\n').forEach((line) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) return
    const eq = trimmed.indexOf('=')
    if (eq === -1) return
    const key = trimmed.slice(0, eq).trim()
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
    if (key && process.env[key] === undefined) process.env[key] = val
  })
}
import { INITIAL_DATA } from '../src/data/tableData.js'
import { loadState, saveState, loadUsers, saveUsers, loadSettings, saveSettings, DATA_DIR } from './persistence.js'
import {
  migrateState,
  getSectionData,
  findRowInSection,
  resolveSectionId,
  isBlockStatus,
  emptySectionData,
} from './stateUtils.js'
import {
  initTelegram,
  sendTelegram,
  setDefaultChatId,
  getDefaultChatId,
  isTelegramEnabled,
  getTelegramStatus,
  formatLK,
  fetchTelegramChats,
  formatOperatorRequestMessage,
  formatOperatorApprovedMessage,
  formatTelegramResult,
} from './telegram.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()
const devMode = process.argv.includes('--dev')
const PORT = devMode ? 3001 : (process.env.PORT || 3000)

app.use(express.json({ limit: '4mb' }))

const THRESHOLD = 4_000_000
const MAX_LOGS = 500

const defaultRows = INITIAL_DATA.map((r) => ({
  ...r,
  turnover: r.turnover || 0,
  bank: r.bank || 'Мбанк',
  onStop: false,
  inWaitlist: false,
}))

const defaultState = migrateState(
  {
    rows: defaultRows,
    bankerRequests: {},
    raisedFromRest: {},
    operatorRequests: {},
    blockReasonRequests: {},
    statusHistory: {},
    logs: [],
    updatedAt: Date.now(),
  },
  defaultRows
)

let state = migrateState(loadState(defaultState), defaultRows)
if (!state.updatedAt) state.updatedAt = Date.now()
saveState(state)

let users = loadUsers([
  { id: 1, username: 'admin', password: '7895142358!@', role: 'admin', sectionAccess: {} },
  { id: 2, username: 'banker', password: 'banker123', role: 'banker', sectionAccess: {} },
  { id: 3, username: 'operator', password: 'operator123', role: 'user', sectionAccess: {} },
])

users = users.map((u) => ({ sectionAccess: {}, ...u, sectionAccess: u.sectionAccess || {} }))

let settings = loadSettings({ telegramChatId: process.env.TELEGRAM_CHAT_ID || '' })

function bootstrapTelegramSettings() {
  const envChat = (process.env.TELEGRAM_CHAT_ID || '').trim()
  if (envChat) {
    settings.telegramChatId = envChat
    saveSettings(settings)
  }
  setDefaultChatId(settings.telegramChatId || envChat)
}

bootstrapTelegramSettings()

const hasTelegramChat = !!(settings.telegramChatId || process.env.TELEGRAM_CHAT_ID)

initTelegram(async (chatId, title) => {
  settings.telegramChatId = chatId
  persistSettings()
  addServerLog('Telegram подключён', `${title} (${chatId})`, 'bot')
  console.log(`Telegram: чат подключён — ${title} (${chatId})`)
}, { enablePolling: !hasTelegramChat }).then((tg) => {
  const st = getTelegramStatus()
  console.log('Telegram boot:', {
    hasToken: st.hasToken,
    tokenValid: st.tokenValid,
    bot: st.botUsername || '—',
    chatId: st.chatId || 'НЕ ЗАДАН',
    canSend: st.canSend,
    dataDir: process.env.DATA_DIR || 'server/data',
  })
  if (tg && st.canSend) console.log('Telegram: ready')
  else if (tg && !st.canSend) console.log('Telegram: задай TELEGRAM_CHAT_ID на Railway или /connect в группе')
  else console.log('Telegram: disabled — проверь BOT_TOKEN на Railway')
})

function persistState() {
  state.updatedAt = Date.now()
  saveState(state)
}

function persistUsers() {
  saveUsers(users)
}

function persistSettings() {
  saveSettings(settings)
  setDefaultChatId(settings.telegramChatId)
}

function addServerLog(action, details = '', userId = '') {
  const entry = {
    id: Date.now(),
    date: new Date().toISOString(),
    action,
    details,
    userId,
  }
  state.logs = [entry, ...(state.logs || [])].slice(0, MAX_LOGS)
  persistState()
}

async function notifyTelegram(text, chatId) {
  const target =
    chatId ||
    settings.telegramChatId ||
    process.env.TELEGRAM_CHAT_ID ||
    getDefaultChatId()
  const result = await sendTelegram(text, target)
  if (!result.success) {
    console.error('Telegram notify failed:', result.error, '| chat:', target || '(пусто)')
  }
  return result
}

function sectionFromReq(req) {
  return resolveSectionId(state, req.body?.sectionId || req.query?.sectionId)
}

function findRow(id, sectionId = 'mbank') {
  return findRowInSection(state, sectionId, id)
}

function userPayload(u) {
  return {
    id: u.id,
    username: u.username,
    role: u.role,
    sectionAccess: u.sectionAccess || {},
    createdBy: u.createdBy || null,
  }
}

// ========== API: state ==========

app.get('/api/state', (req, res) => {
  res.json({
    ...state,
    updatedAt: state.updatedAt || Date.now(),
    settings: { telegramChatId: settings.telegramChatId, telegramEnabled: isTelegramEnabled() },
  })
})

app.post('/api/sync', (req, res) => {
  const { sectionId, rows, raisedFromRest, statusHistory, logs } = req.body || {}
  const sid = sectionFromReq(req)
  const section = getSectionData(state, sid)
  if (Array.isArray(rows)) section.rows = rows
  if (raisedFromRest && typeof raisedFromRest === 'object') section.raisedFromRest = raisedFromRest
  if (statusHistory && typeof statusHistory === 'object') section.statusHistory = statusHistory
  if (Array.isArray(logs)) state.logs = logs.slice(0, MAX_LOGS)
  state.sectionData[sid] = section
  persistState()
  res.json({ ok: true, updatedAt: state.updatedAt, sectionId: sid })
})

app.get('/api/soon-to-rest', (req, res) => {
  const sid = sectionFromReq(req)
  const section = getSectionData(state, sid)
  const list = section.rows.filter((r) => (r.turnover || 0) >= THRESHOLD)
  res.json({ list, count: list.length, sectionId: sid })
})

app.get('/api/raise-requests', (req, res) => {
  const sid = sectionFromReq(req)
  const section = getSectionData(state, sid)
  const list = Object.entries(section.bankerRequests || {})
    .filter(([, r]) => r?.status === 'pending' || r?.status === 're_raise_pending')
    .map(([id, r]) => {
      const row = findRow(id, sid)
      return {
        id: parseInt(id, 10),
        lk: formatLK(row),
        banker: r.banker,
        date: r.date,
        status: r.status,
        sectionId: sid,
      }
    })
  res.json({ list, count: list.length, sectionId: sid })
})

app.get('/api/operator-requests', (req, res) => {
  const sid = sectionFromReq(req)
  const section = getSectionData(state, sid)
  const list = Object.entries(section.operatorRequests || {})
    .filter(([, r]) => r?.status === 'pending')
    .map(([id, r]) => {
      const row = findRow(id, sid)
      return {
        id: parseInt(id, 10),
        lk: formatLK(row),
        operator: r.operator,
        date: r.date,
        needsUnblock: r.needsUnblock,
        needsFace: r.needsFace,
        needsBlock: r.needsBlock,
        needsWaitlist: r.needsWaitlist,
        stuckAmount: r.stuckAmount,
        note: r.note,
        sectionId: sid,
      }
    })
  res.json({ list, count: list.length, sectionId: sid })
})

app.get('/api/block-reason-requests', (req, res) => {
  const sid = sectionFromReq(req)
  const section = getSectionData(state, sid)
  const list = Object.entries(section.blockReasonRequests || {})
    .filter(([, r]) => r?.status === 'pending')
    .map(([id, r]) => {
      const row = findRow(id, sid)
      return {
        id: parseInt(id, 10),
        lk: formatLK(row),
        blockStatus: r.blockStatus,
        changedBy: r.changedBy,
        date: r.date,
        sectionId: sid,
      }
    })
  res.json({ list, count: list.length, sectionId: sid })
})

app.get('/api/rows_by_status', (req, res) => {
  const sid = sectionFromReq(req)
  const section = getSectionData(state, sid)
  const status = (req.query.status || '').trim().toLowerCase()
  let list = section.rows
  if (status) list = list.filter((r) => (r.status || '').toLowerCase() === status)
  res.json({ list, count: list.length, sectionId: sid })
})

// ========== Settings ==========

app.get('/api/settings', (req, res) => {
  const tg = getTelegramStatus()
  res.json({
    telegramChatId: settings.telegramChatId || process.env.TELEGRAM_CHAT_ID || '',
    telegramEnabled: tg.enabled,
    telegramCanSend: tg.canSend,
    telegramBotUsername: tg.botUsername,
    telegramTokenValid: tg.tokenValid,
    telegramHasToken: tg.hasToken,
  })
})

app.get('/api/telegram/diagnostics', (req, res) => {
  const tg = getTelegramStatus()
  res.json({
    ...tg,
    dataDir: DATA_DIR,
    hint: !tg.hasToken
      ? 'Задай BOT_TOKEN в Railway → Variables'
      : !tg.canSend
        ? 'Задай TELEGRAM_CHAT_ID=-1003849378994 в Railway → Variables'
        : 'OK — уведомления должны работать',
  })
})

app.post('/api/settings', (req, res) => {
  const { telegramChatId } = req.body || {}
  if (telegramChatId !== undefined) {
    settings.telegramChatId = String(telegramChatId || '').trim()
    persistSettings()
  }
  res.json({ success: true, settings: { telegramChatId: settings.telegramChatId, telegramEnabled: isTelegramEnabled() } })
})

// ========== Logs ==========

app.get('/api/logs', (req, res) => {
  res.json({ logs: state.logs || [] })
})

app.post('/api/logs', (req, res) => {
  const { action, details, userId } = req.body || {}
  if (!action) return res.status(400).json({ success: false, error: 'Нет действия' })
  addServerLog(action, details || '', userId || '')
  res.json({ success: true })
})

// ========== Auth / users ==========

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {}
  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'Введите логин и пароль' })
  }
  const found = users.find(
    (u) =>
      u.username.toLowerCase() === String(username).toLowerCase() &&
      u.password === String(password)
  )
  if (!found) return res.status(401).json({ success: false, error: 'Неверный логин или пароль' })
  res.json({ success: true, user: userPayload(found) })
})

app.get('/api/session', (req, res) => {
  const userId = parseInt(req.query.userId, 10)
  if (!userId) return res.json({ valid: false })
  const found = users.find((u) => u.id === userId)
  if (!found) return res.json({ valid: false })
  res.json({
    valid: true,
    user: userPayload(found),
  })
})

app.get('/api/users', (req, res) => {
  res.json({ users })
})

app.post('/api/users', (req, res) => {
  const { username, password, role, createdByAdminId } = req.body || {}
  const name = String(username || '').trim()
  const pass = String(password || '').trim()
  const r = (role || 'user').trim() || 'user'
  if (!name || !pass) return res.status(400).json({ success: false, error: 'Укажите логин и пароль' })
  if (users.some((u) => u.username.toLowerCase() === name.toLowerCase())) {
    return res.status(409).json({ success: false, error: 'Пользователь с таким логином уже есть' })
  }
  const maxId = users.reduce((m, u) => (u.id > m ? u.id : m), 0)
  const newUser = {
    id: maxId + 1,
    username: name,
    password: pass,
    role: r,
    sectionAccess: {},
    createdBy: createdByAdminId ? parseInt(createdByAdminId, 10) : null,
  }
  users = [...users, newUser]
  persistUsers()
  addServerLog('Добавление пользователя', name, r)
  res.status(201).json({ success: true, user: userPayload(newUser) })
})

app.put('/api/users/:id/access', (req, res) => {
  const id = parseInt(req.params.id, 10)
  const { sectionAccess } = req.body || {}
  const user = users.find((u) => u.id === id)
  if (!user) return res.status(404).json({ success: false, error: 'Пользователь не найден' })
  if (!sectionAccess || typeof sectionAccess !== 'object') {
    return res.status(400).json({ success: false, error: 'Укажите sectionAccess' })
  }
  user.sectionAccess = sectionAccess
  persistUsers()
  addServerLog('Обновление доступа', user.username, JSON.stringify(sectionAccess))
  res.json({ success: true, user: userPayload(user) })
})

app.delete('/api/users/:id', (req, res) => {
  const id = parseInt(req.params.id, 10)
  const exists = users.find((u) => u.id === id)
  if (!exists) return res.status(404).json({ success: false, error: 'Пользователь не найден' })
  users = users.filter((u) => u.id !== id)
  persistUsers()
  addServerLog('Удаление пользователя', exists.username)
  res.json({ success: true })
})

app.post('/api/users/:id/change_password', (req, res) => {
  const id = parseInt(req.params.id, 10)
  const { currentPassword, newPassword } = req.body || {}
  const user = users.find((u) => u.id === id)
  if (!user) return res.status(404).json({ success: false, error: 'Пользователь не найден' })
  if (user.password !== String(currentPassword || '')) {
    return res.status(400).json({ success: false, error: 'Неверный текущий пароль' })
  }
  const trimmed = String(newPassword || '').trim()
  if (!trimmed) return res.status(400).json({ success: false, error: 'Введите новый пароль' })
  user.password = trimmed
  persistUsers()
  res.json({ success: true })
})

app.post('/api/update_status', (req, res) => {
  const { id, status, sectionId } = req.body || {}
  const sid = resolveSectionId(state, sectionId)
  const numId = parseInt(id, 10)
  const section = getSectionData(state, sid)
  if (!numId || !findRow(numId, sid)) return res.status(400).json({ ok: false, error: 'ЛК не найден' })
  section.rows = section.rows.map((r) => (r.id === numId ? { ...r, status: status || '' } : r))
  state.sectionData[sid] = section
  persistState()
  res.json({ ok: true, sectionId: sid })
})

// Смена статуса с уведомлением бота при блок/заява
app.post('/api/lk/:id/status', async (req, res) => {
  const id = parseInt(req.params.id, 10)
  const { status, changedBy, sectionId } = req.body || {}
  const sid = resolveSectionId(state, sectionId)
  const section = getSectionData(state, sid)
  const row = findRow(id, sid)
  if (!row) return res.status(404).json({ success: false, error: 'ЛК не найден' })

  const prevStatus = row.status || ''
  const newStatus = status || ''
  const history = section.statusHistory[id] || []
  section.statusHistory = {
    ...section.statusHistory,
    [id]: [
      ...history,
      {
        from: prevStatus,
        to: newStatus,
        date: new Date().toISOString(),
        changedBy: changedBy || 'user',
      },
    ],
  }
  section.rows = section.rows.map((r) => (r.id === id ? { ...r, status: newStatus } : r))
  state.sectionData[sid] = section

  const becameBlock = isBlockStatus(newStatus) && !isBlockStatus(prevStatus)
  if (becameBlock) {
    section.blockReasonRequests = {
      ...(section.blockReasonRequests || {}),
      [id]: {
        status: 'pending',
        blockStatus: newStatus,
        changedBy: changedBy || 'user',
        date: new Date().toISOString(),
        banker: '',
        action: null,
        reason: '',
        resolvedDate: null,
      },
    }
    state.sectionData[sid] = section
    persistState()
    addServerLog(`Статус → ${newStatus}`, formatLK(row), changedBy || '')
    const label = newStatus.toLowerCase() === 'заява' ? 'заява — уточнить причину' : 'блок — уточнить причину'
    await notifyTelegram(formatTelegramResult({ ...row, status: newStatus }, label))
    return res.json({ success: true, blockRequestCreated: true, updatedAt: state.updatedAt, sectionId: sid })
  }

  persistState()
  res.json({ success: true, updatedAt: state.updatedAt, sectionId: sid })
})

app.post('/api/lk/:id/block-reason-response', async (req, res) => {
  const id = parseInt(req.params.id, 10)
  const { banker, action, reason, sectionId } = req.body || {}
  const sid = resolveSectionId(state, sectionId)
  const section = getSectionData(state, sid)
  const row = findRow(id, sid)
  const request = section.blockReasonRequests?.[id]
  if (!row || !request || request.status !== 'pending') {
    return res.status(400).json({ success: false, error: 'Нет активного запроса на уточнение блока' })
  }

  let rowUpdates = { ...row }
  let statusLine = ''

  if (action === 'unblock') {
    rowUpdates.status = 'актив'
    statusLine = 'разблокирован'
    section.rows = section.rows.map((r) => (r.id === id ? rowUpdates : r))
  } else {
    const reasonText = String(reason || '').trim()
    if (!reasonText) {
      return res.status(400).json({ success: false, error: 'Укажите причину блока' })
    }
    statusLine = `${request.blockStatus}\n${reasonText}`
    if (reasonText) {
      rowUpdates.extra = [row.extra, reasonText].filter(Boolean).join(' | ')
      section.rows = section.rows.map((r) => (r.id === id ? rowUpdates : r))
    }
  }

  section.blockReasonRequests = {
    ...section.blockReasonRequests,
    [id]: {
      ...request,
      status: 'resolved',
      banker: banker || '',
      action: action === 'unblock' ? 'unblocked' : 'clarified',
      reason: reason || '',
      resolvedDate: new Date().toISOString(),
    },
  }
  state.sectionData[sid] = section
  persistState()
  addServerLog('Ответ банкира: блок', formatLK(rowUpdates), banker || '')

  await notifyTelegram(formatTelegramResult(rowUpdates, statusLine))
  res.json({ success: true, updatedAt: state.updatedAt, sectionId: sid })
})

// Секции CRUD (админ)
app.get('/api/sections', (req, res) => {
  res.json({ sections: state.sections || [] })
})

app.post('/api/sections', (req, res) => {
  const { name, bank, sheetGid } = req.body || {}
  const title = String(name || '').trim()
  if (!title) return res.status(400).json({ success: false, error: 'Укажите название секции' })
  const id = `sec_${Date.now()}`
  state.sections = [
    ...(state.sections || []),
    { id, name: title, bank: bank || title, sheetGid: sheetGid || '' },
  ]
  state.sectionData = { ...state.sectionData, [id]: emptySectionData() }
  persistState()
  addServerLog('Создана секция', title)
  res.status(201).json({ success: true, section: state.sections[state.sections.length - 1] })
})

app.delete('/api/sections/:id', (req, res) => {
  const id = req.params.id
  if (id === 'mbank') return res.status(400).json({ success: false, error: 'Нельзя удалить основную секцию' })
  const exists = state.sections?.find((s) => s.id === id)
  if (!exists) return res.status(404).json({ success: false, error: 'Секция не найдена' })
  state.sections = state.sections.filter((s) => s.id !== id)
  const nextData = { ...state.sectionData }
  delete nextData[id]
  state.sectionData = nextData
  persistState()
  addServerLog('Удалена секция', exists.name)
  res.json({ success: true })
})

// ========== Telegram notify ==========

app.post('/api/notify', async (req, res) => {
  const { text, chatId } = req.body || {}
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ success: false, error: 'Нет текста сообщения' })
  }
  const result = await notifyTelegram(text, chatId)
  if (!result.success) return res.status(500).json(result)
  return res.json({ success: true })
})

// ========== Banker actions (server-side + telegram) ==========

app.post('/api/lk/:id/stop', async (req, res) => {
  const id = parseInt(req.params.id, 10)
  const { onStop, banker, sectionId } = req.body || {}
  const sid = resolveSectionId(state, sectionId)
  const section = getSectionData(state, sid)
  const row = findRow(id, sid)
  if (!row) return res.status(404).json({ success: false, error: 'ЛК не найден' })

  section.rows = section.rows.map((r) => (r.id === id ? { ...r, onStop: !!onStop } : r))
  state.sectionData[sid] = section
  persistState()
  addServerLog(onStop ? 'Стоп реквизит' : 'Снят со стопа', formatLK(row), banker || '')

  const action = onStop ? 'на стопе' : 'снят со стопа'
  await notifyTelegram(formatTelegramResult(row, action))
  res.json({ success: true, sectionId: sid })
})

app.post('/api/lk/:id/waitlist', async (req, res) => {
  const id = parseInt(req.params.id, 10)
  const { inWaitlist, banker, sectionId } = req.body || {}
  const sid = resolveSectionId(state, sectionId)
  const section = getSectionData(state, sid)
  const row = findRow(id, sid)
  if (!row) return res.status(404).json({ success: false, error: 'ЛК не найден' })

  section.rows = section.rows.map((r) => (r.id === id ? { ...r, inWaitlist: !!inWaitlist } : r))
  state.sectionData[sid] = section
  persistState()
  addServerLog(inWaitlist ? 'В вайте' : 'Не в вайте', formatLK(row), banker || '')

  const status = inWaitlist ? 'в вайте' : 'убран из вайта'
  await notifyTelegram(formatTelegramResult(row, status))
  res.json({ success: true, sectionId: sid })
})

function operatorRequestParts(req) {
  const parts = []
  if (req.needsWaitlist) parts.push('📋 В вайт')
  if (req.needsStop) parts.push('🛑 На стоп')
  if (req.needsBlock) parts.push('🔒 Блок')
  if (req.needsUnblock) parts.push('🔓 Разблок')
  if (req.needsFace) parts.push('👤 Снять Face ID')
  return parts
}

function hasOperatorNeeds(body) {
  return !!(body.needsWaitlist || body.needsStop || body.needsBlock || body.needsUnblock || body.needsFace)
}

app.post('/api/lk/:id/operator-request', async (req, res) => {
  const id = parseInt(req.params.id, 10)
  const {
    operator,
    needsWaitlist,
    needsStop,
    needsBlock,
    needsUnblock,
    needsFace,
    stuckAmount,
    note,
    sectionId,
  } = req.body || {}
  const sid = resolveSectionId(state, sectionId)
  const section = getSectionData(state, sid)
  const row = findRow(id, sid)
  if (!row) return res.status(404).json({ success: false, error: 'ЛК не найден' })
  if (!hasOperatorNeeds(req.body || {})) {
    return res.status(400).json({ success: false, error: 'Выберите хотя бы один тип запроса' })
  }

  const existing = section.operatorRequests?.[id]
  if (existing?.status === 'pending') {
    return res.status(409).json({ success: false, error: 'Запрос уже отправлен' })
  }

  const newReq = {
    operator: operator || 'operator',
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

  section.operatorRequests = { ...section.operatorRequests, [id]: newReq }
  state.sectionData[sid] = section
  persistState()
  addServerLog('Запрос оператора', formatLK(row), operator || '')

  const parts = operatorRequestParts(newReq)
  const actionLabel = parts.length === 1
    ? (newReq.needsWaitlist ? 'в вайт' : newReq.needsUnblock ? 'на разблок' : newReq.needsFace ? 'снять Face ID' : parts[0])
    : parts.join(' + ')

  await notifyTelegram(formatOperatorRequestMessage(actionLabel, row))
  res.json({ success: true, updatedAt: state.updatedAt, sectionId: sid })
})

app.post('/api/operator-request/bulk', async (req, res) => {
  const { operator, action, ids, sectionId } = req.body || {}
  const sid = resolveSectionId(state, sectionId)
  const section = getSectionData(state, sid)
  const idList = Array.isArray(ids) ? ids.map((x) => parseInt(x, 10)).filter(Boolean) : []
  if (!idList.length) return res.status(400).json({ success: false, error: 'Выберите реквизиты' })
  if (!['waitlist', 'unblock'].includes(action)) {
    return res.status(400).json({ success: false, error: 'Действие: waitlist или unblock' })
  }

  const created = []
  const skipped = []

  for (const id of idList) {
    const row = findRow(id, sid)
    if (!row) { skipped.push(id); continue }
    if (section.operatorRequests?.[id]?.status === 'pending') { skipped.push(id); continue }
    if (action === 'waitlist' && row.inWaitlist) { skipped.push(id); continue }
    if (action === 'unblock' && !isBlockStatus(row.status)) { skipped.push(id); continue }

    const newReq = {
      operator: operator || 'operator',
      date: new Date().toISOString(),
      status: 'pending',
      needsWaitlist: action === 'waitlist',
      needsStop: false,
      needsBlock: false,
      needsUnblock: action === 'unblock',
      needsFace: false,
      stuckAmount: '',
      note: '',
      waitlistApproved: null,
      stopApproved: null,
      blockApproved: null,
      unblockApproved: null,
      faceApproved: null,
      rejectionReason: '',
      banker: '',
      resolvedDate: null,
    }
    section.operatorRequests = { ...section.operatorRequests, [id]: newReq }
    created.push(row)
  }

  if (!created.length) {
    return res.status(400).json({ success: false, error: 'Нет подходящих реквизитов для запроса' })
  }

  state.sectionData[sid] = section
  persistState()
  addServerLog(`Массовый запрос: ${action}`, `${created.length} шт.`, operator || '')

  const label = action === 'waitlist' ? 'в вайт' : 'на разблок'
  await notifyTelegram(formatOperatorRequestMessage(label, created))

  res.json({ success: true, count: created.length, skipped: skipped.length, updatedAt: state.updatedAt, sectionId: sid })
})

app.post('/api/lk/:id/operator-response', async (req, res) => {
  const id = parseInt(req.params.id, 10)
  const {
    banker,
    waitlistApproved,
    stopApproved,
    blockApproved,
    unblockApproved,
    faceApproved,
    rejectionReason,
    sectionId,
  } = req.body || {}
  const sid = resolveSectionId(state, sectionId)
  const section = getSectionData(state, sid)
  const row = findRow(id, sid)
  const request = section.operatorRequests?.[id]
  if (!row || !request || request.status !== 'pending') {
    return res.status(400).json({ success: false, error: 'Нет активного запроса' })
  }

  const updated = {
    ...request,
    status: 'resolved',
    banker: banker || '',
    waitlistApproved: request.needsWaitlist ? !!waitlistApproved : null,
    stopApproved: request.needsStop ? !!stopApproved : null,
    blockApproved: request.needsBlock ? !!blockApproved : null,
    unblockApproved: request.needsUnblock ? !!unblockApproved : null,
    faceApproved: request.needsFace ? !!faceApproved : null,
    rejectionReason: rejectionReason || '',
    resolvedDate: new Date().toISOString(),
  }
  section.operatorRequests = { ...section.operatorRequests, [id]: updated }

  let rowUpdates = { ...row }
  if (waitlistApproved && request.needsWaitlist) rowUpdates.inWaitlist = true
  if (stopApproved && request.needsStop) rowUpdates.onStop = true
  if (blockApproved && request.needsBlock) rowUpdates.status = 'блок'
  if (unblockApproved && request.needsUnblock) rowUpdates.status = 'актив'

  section.rows = section.rows.map((r) => (r.id === id ? rowUpdates : r))
  state.sectionData[sid] = section
  persistState()
  addServerLog('Ответ банкира на запрос', formatLK(row), banker || '')

  const statusLines = []
  if (request.needsWaitlist) {
    statusLines.push(waitlistApproved ? 'в вайте' : 'отказано — вайт')
  }
  if (request.needsUnblock) {
    statusLines.push(unblockApproved ? 'разблокирован' : 'отказано — разблок')
  }
  if (request.needsFace) {
    statusLines.push(faceApproved ? 'снят Face ID' : 'отказано — Face ID')
  }
  if (request.needsStop) {
    statusLines.push(stopApproved ? 'на стопе' : 'отказано — стоп')
  }
  if (request.needsBlock) {
    statusLines.push(blockApproved ? 'заблокирован' : 'отказано — блок')
  }
  if (rejectionReason && statusLines.some((s) => s.startsWith('отказано'))) {
    statusLines.push(rejectionReason)
  }

  if (statusLines.length) {
    await notifyTelegram(formatTelegramResult(rowUpdates, statusLines.join('\n')))
  }

  res.json({ success: true, updatedAt: state.updatedAt, sectionId: sid })
})

app.post('/api/telegram/test', async (req, res) => {
  const { chatId } = req.body || {}
  const result = await notifyTelegram(
    formatTelegramResult(
      { name: 'Тест', phone: '000 000 000' },
      'тест — бот работает'
    ),
    chatId
  )
  if (!result.success) return res.status(500).json(result)
  res.json({ success: true, enabled: isTelegramEnabled() })
})

app.get('/api/telegram/chats', async (req, res) => {
  const result = await fetchTelegramChats()
  if (!result.success) return res.status(500).json(result)
  res.json(result)
})

// ========== Static ==========
if (!devMode) {
  app.use(express.static(join(__dirname, '../dist')))
  app.get('*', (req, res) => {
    res.sendFile(join(__dirname, '../dist/index.html'))
  })
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server on port ${PORT}${devMode ? ' (dev API)' : ''}`)
  console.log(`Persistence: ${process.env.DATA_DIR || 'server/data'}`)
  console.log(`Telegram: ${isTelegramEnabled() ? 'enabled' : 'disabled'}`)
})
