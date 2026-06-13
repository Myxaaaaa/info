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
import { loadState, saveState, loadUsers, saveUsers, loadSettings, saveSettings } from './persistence.js'
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

const defaultState = {
  rows: defaultRows,
  bankerRequests: {},
  raisedFromRest: {},
  operatorRequests: {},
  statusHistory: {},
  logs: [],
  updatedAt: Date.now(),
}

let state = loadState(defaultState)
if (!state.updatedAt) state.updatedAt = Date.now()
let users = loadUsers([
  { id: 1, username: 'admin', password: '7895142358!@', role: 'admin' },
  { id: 2, username: 'banker', password: 'banker123', role: 'banker' },
  { id: 3, username: 'operator', password: 'operator123', role: 'user' },
])

let settings = loadSettings({ telegramChatId: process.env.TELEGRAM_CHAT_ID || '' })
setDefaultChatId(settings.telegramChatId)

initTelegram(async (chatId, title) => {
  settings.telegramChatId = chatId
  persistSettings()
  addServerLog('Telegram подключён', `${title} (${chatId})`, 'bot')
  console.log(`Telegram: чат подключён — ${title} (${chatId})`)
}).then((tg) => {
  if (tg) console.log('Telegram: enabled')
  else console.log('Telegram: disabled (проверь BOT_TOKEN в .env)')
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
  const target = chatId || settings.telegramChatId || getDefaultChatId()
  const result = await sendTelegram(text, target)
  if (!result.success) {
    console.error('Telegram notify failed:', result.error, '| chat:', target)
  }
  return result
}

function findRow(id) {
  return state.rows.find((r) => r.id === parseInt(id, 10))
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
  const { rows, raisedFromRest, statusHistory, logs } = req.body || {}
  if (Array.isArray(rows)) state.rows = rows
  if (raisedFromRest && typeof raisedFromRest === 'object') state.raisedFromRest = raisedFromRest
  if (statusHistory && typeof statusHistory === 'object') state.statusHistory = statusHistory
  if (Array.isArray(logs)) state.logs = logs.slice(0, MAX_LOGS)
  persistState()
  res.json({ ok: true, updatedAt: state.updatedAt })
})

app.get('/api/soon-to-rest', (req, res) => {
  const list = state.rows.filter((r) => (r.turnover || 0) >= THRESHOLD)
  res.json({ list, count: list.length })
})

app.get('/api/raise-requests', (req, res) => {
  const list = Object.entries(state.bankerRequests)
    .filter(([, r]) => r?.status === 'pending' || r?.status === 're_raise_pending')
    .map(([id, r]) => {
      const row = findRow(id)
      return {
        id: parseInt(id, 10),
        lk: formatLK(row),
        banker: r.banker,
        date: r.date,
        status: r.status,
      }
    })
  res.json({ list, count: list.length })
})

app.get('/api/operator-requests', (req, res) => {
  const list = Object.entries(state.operatorRequests || {})
    .filter(([, r]) => r?.status === 'pending')
    .map(([id, r]) => {
      const row = findRow(id)
      return {
        id: parseInt(id, 10),
        lk: formatLK(row),
        operator: r.operator,
        date: r.date,
        needsUnblock: r.needsUnblock,
        needsFace: r.needsFace,
        stuckAmount: r.stuckAmount,
        note: r.note,
      }
    })
  res.json({ list, count: list.length })
})

app.get('/api/rows_by_status', (req, res) => {
  const status = (req.query.status || '').trim().toLowerCase()
  let list = state.rows
  if (status) list = list.filter((r) => (r.status || '').toLowerCase() === status)
  res.json({ list, count: list.length })
})

// ========== Settings ==========

app.get('/api/settings', (req, res) => {
  const tg = getTelegramStatus()
  res.json({
    telegramChatId: settings.telegramChatId,
    telegramEnabled: tg.enabled,
    telegramBotUsername: tg.botUsername,
    telegramTokenValid: tg.tokenValid,
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
  res.json({ success: true, user: { id: found.id, username: found.username, role: found.role } })
})

app.get('/api/session', (req, res) => {
  const userId = parseInt(req.query.userId, 10)
  if (!userId) return res.json({ valid: false })
  const found = users.find((u) => u.id === userId)
  if (!found) return res.json({ valid: false })
  res.json({
    valid: true,
    user: { id: found.id, username: found.username, role: found.role },
  })
})

app.get('/api/users', (req, res) => {
  res.json({ users })
})

app.post('/api/users', (req, res) => {
  const { username, password, role } = req.body || {}
  const name = String(username || '').trim()
  const pass = String(password || '').trim()
  const r = (role || 'user').trim() || 'user'
  if (!name || !pass) return res.status(400).json({ success: false, error: 'Укажите логин и пароль' })
  if (users.some((u) => u.username.toLowerCase() === name.toLowerCase())) {
    return res.status(409).json({ success: false, error: 'Пользователь с таким логином уже есть' })
  }
  const maxId = users.reduce((m, u) => (u.id > m ? u.id : m), 0)
  users = [...users, { id: maxId + 1, username: name, password: pass, role: r }]
  persistUsers()
  addServerLog('Добавление пользователя', name, r)
  res.status(201).json({ success: true })
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
  const { id, status } = req.body || {}
  const numId = parseInt(id, 10)
  if (!numId || !findRow(numId)) return res.status(400).json({ ok: false, error: 'ЛК не найден' })
  state.rows = state.rows.map((r) => (r.id === numId ? { ...r, status: status || '' } : r))
  persistState()
  res.json({ ok: true })
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
  const { onStop, banker } = req.body || {}
  const row = findRow(id)
  if (!row) return res.status(404).json({ success: false, error: 'ЛК не найден' })

  state.rows = state.rows.map((r) => (r.id === id ? { ...r, onStop: !!onStop } : r))
  persistState()
  addServerLog(onStop ? 'Стоп реквизит' : 'Снят со стопа', formatLK(row), banker || '')

  const action = onStop ? 'на стопе' : 'снят со стопа'
  await notifyTelegram(formatTelegramResult(row, action))
  res.json({ success: true })
})

app.post('/api/lk/:id/waitlist', async (req, res) => {
  const id = parseInt(req.params.id, 10)
  const { inWaitlist, banker } = req.body || {}
  const row = findRow(id)
  if (!row) return res.status(404).json({ success: false, error: 'ЛК не найден' })

  state.rows = state.rows.map((r) => (r.id === id ? { ...r, inWaitlist: !!inWaitlist } : r))
  persistState()
  addServerLog(inWaitlist ? 'В вайте' : 'Не в вайте', formatLK(row), banker || '')

  const status = inWaitlist ? 'в вайте' : 'убран из вайта'
  await notifyTelegram(formatTelegramResult(row, status))
  res.json({ success: true })
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
  } = req.body || {}
  const row = findRow(id)
  if (!row) return res.status(404).json({ success: false, error: 'ЛК не найден' })
  if (!hasOperatorNeeds(req.body || {})) {
    return res.status(400).json({ success: false, error: 'Выберите хотя бы один тип запроса' })
  }

  const existing = state.operatorRequests?.[id]
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

  state.operatorRequests = { ...state.operatorRequests, [id]: newReq }
  persistState()
  addServerLog('Запрос оператора', formatLK(row), operator || '')

  const parts = operatorRequestParts(newReq)
  const actionLabel = parts.length === 1
    ? (newReq.needsWaitlist ? 'в вайт' : newReq.needsUnblock ? 'на разблок' : newReq.needsFace ? 'снять Face ID' : parts[0])
    : parts.join(' + ')

  await notifyTelegram(formatOperatorRequestMessage(actionLabel, row))
  res.json({ success: true, updatedAt: state.updatedAt })
})

app.post('/api/operator-request/bulk', async (req, res) => {
  const { operator, action, ids } = req.body || {}
  const idList = Array.isArray(ids) ? ids.map((x) => parseInt(x, 10)).filter(Boolean) : []
  if (!idList.length) return res.status(400).json({ success: false, error: 'Выберите реквизиты' })
  if (!['waitlist', 'unblock'].includes(action)) {
    return res.status(400).json({ success: false, error: 'Действие: waitlist или unblock' })
  }

  const created = []
  const skipped = []

  for (const id of idList) {
    const row = findRow(id)
    if (!row) { skipped.push(id); continue }
    if (state.operatorRequests?.[id]?.status === 'pending') { skipped.push(id); continue }
    if (action === 'waitlist' && row.inWaitlist) { skipped.push(id); continue }
    if (action === 'unblock' && (row.status || '').toLowerCase() !== 'блок') { skipped.push(id); continue }

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
    state.operatorRequests = { ...state.operatorRequests, [id]: newReq }
    created.push(row)
  }

  if (!created.length) {
    return res.status(400).json({ success: false, error: 'Нет подходящих реквизитов для запроса' })
  }

  persistState()
  addServerLog(`Массовый запрос: ${action}`, `${created.length} шт.`, operator || '')

  const label = action === 'waitlist' ? 'в вайт' : 'на разблок'
  await notifyTelegram(formatOperatorRequestMessage(label, created))

  res.json({ success: true, count: created.length, skipped: skipped.length, updatedAt: state.updatedAt })
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
  } = req.body || {}
  const row = findRow(id)
  const request = state.operatorRequests?.[id]
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
  state.operatorRequests = { ...state.operatorRequests, [id]: updated }

  let rowUpdates = { ...row }
  if (waitlistApproved && request.needsWaitlist) rowUpdates.inWaitlist = true
  if (stopApproved && request.needsStop) rowUpdates.onStop = true
  if (blockApproved && request.needsBlock) rowUpdates.status = 'блок'
  if (unblockApproved && request.needsUnblock) rowUpdates.status = 'актив'

  state.rows = state.rows.map((r) => (r.id === id ? rowUpdates : r))
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

  res.json({ success: true, updatedAt: state.updatedAt })
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
