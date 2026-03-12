import express from 'express'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()
const PORT = process.env.PORT || 3000

app.use(express.json({ limit: '2mb' }))

// ========== In-memory state (для Railway; в проде использовать БД) ==========
let state = {
  rows: [],
  bankerRequests: {},
  raisedFromRest: {},
}

// Простая модель пользователей (общее для всех устройств на одном бэкенде)
let users = [
  {
    id: 1,
    username: 'admin',
    password: '7895142358!@',
    role: 'admin',
  },
]

const THRESHOLD = 4_000_000

// ========== API: данные ЛК / бот ==========
app.get('/api/state', (req, res) => {
  res.json(state)
})

app.post('/api/sync', (req, res) => {
  const { rows, bankerRequests, raisedFromRest } = req.body || {}
  if (Array.isArray(rows)) state.rows = rows
  if (bankerRequests && typeof bankerRequests === 'object') state.bankerRequests = bankerRequests
  if (raisedFromRest && typeof raisedFromRest === 'object') state.raisedFromRest = raisedFromRest
  res.json({ ok: true })
})

app.get('/api/soon-to-rest', (req, res) => {
  const list = state.rows.filter((r) => (r.turnover || 0) >= THRESHOLD)
  res.json({ list, count: list.length })
})

app.get('/api/raise-requests', (req, res) => {
  const pending = Object.entries(state.bankerRequests)
    .filter(([, r]) => r?.status === 'pending' || r?.status === 're_raise_pending')
    .map(([id, r]) => {
      const row = state.rows.find((x) => x.id === parseInt(id, 10))
      return {
        id: parseInt(id, 10),
        lk: row ? `${row.name || row.card || '—'} (${row.phone || '—'})` : `#${id}`,
        banker: r.banker,
        date: r.date,
        status: r.status,
      }
    })
  res.json({ list: pending, count: pending.length })
})

app.get('/api/rows_by_status', (req, res) => {
  const status = (req.query.status || '').trim().toLowerCase()
  let list = state.rows
  if (status) {
    list = list.filter((r) => (r.status || '').toLowerCase() === status)
  }
  res.json({ list, count: list.length })
})

// ========== API: пользователи / авторизация ==========

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
  if (!found) {
    return res.status(401).json({ success: false, error: 'Неверный логин или пароль' })
  }
  const user = { id: found.id, username: found.username, role: found.role }
  res.json({ success: true, user })
})

app.get('/api/users', (req, res) => {
  res.json({ users })
})

app.post('/api/users', (req, res) => {
  const { username, password, role } = req.body || {}
  const name = String(username || '').trim()
  const pass = String(password || '').trim()
  const r = (role || 'user').trim() || 'user'

  if (!name || !pass) {
    return res.status(400).json({ success: false, error: 'Укажите логин и пароль' })
  }

  const exists = users.some((u) => u.username.toLowerCase() === name.toLowerCase())
  if (exists) {
    return res.status(409).json({ success: false, error: 'Пользователь с таким логином уже есть' })
  }

  const maxId = users.reduce((m, u) => (u.id > m ? u.id : m), 0)
  const newUser = {
    id: maxId + 1,
    username: name,
    password: pass,
    role: r,
  }
  users = [...users, newUser]
  res.status(201).json({ success: true })
})

app.delete('/api/users/:id', (req, res) => {
  const id = parseInt(req.params.id, 10)
  if (!id) return res.status(400).json({ success: false, error: 'Некорректный ID' })

  const exists = users.find((u) => u.id === id)
  if (!exists) return res.status(404).json({ success: false, error: 'Пользователь не найден' })

  users = users.filter((u) => u.id !== id)
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
  res.json({ success: true })
})

app.post('/api/update_status', (req, res) => {
  const { id, status } = req.body || {}
  const numId = parseInt(id, 10)
  if (!numId || !state.rows.find((r) => r.id === numId)) {
    return res.status(400).json({ ok: false, error: 'ЛК не найден' })
  }
  state.rows = state.rows.map((r) => (r.id === numId ? { ...r, status: status || '' } : r))
  res.json({ ok: true })
})

// ========== Telegram Bot — отключен (добавим позже) ==========

// Заглушка для уведомлений, чтобы фронт не падал
app.post('/api/notify', async (req, res) => {
  const { text } = req.body || {}
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ success: false, error: 'Нет текста сообщения' })
  }
  // Просто подтверждаем приём, без отправки в Telegram
  return res.json({ success: true, disabled: true })
})

// ========== Static (Vite build) ==========
app.use(express.static(join(__dirname, '../dist')))

app.get('*', (req, res) => {
  res.sendFile(join(__dirname, '../dist/index.html'))
})

app.listen(PORT, '0.0.0.0', () => {
  console.log('Server on port', PORT)
})
