import express from 'express'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import TelegramBot from 'node-telegram-bot-api'

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

// ========== Telegram Bot ==========
const token = process.env.BOT_TOKEN
if (token) {
  const bot = new TelegramBot(token, { polling: true })

  const statusList = () => {
    const statuses = [...new Set(state.rows.map((r) => (r.status || '').toLowerCase()).filter(Boolean))]
    return statuses.length ? statuses.sort() : ['актив', 'отдых', 'блок', 'вылет', 'заява']
  }

  bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id
    bot.sendMessage(
      chatId,
      'Привет! Я бот ЛК.\n\n' +
        'По вкладкам (как на сайте):\n' +
        '/list — все ЛК\n' +
        '/list статус — ЛК по статусу (актив, отдых, блок, вылет, заява...)\n' +
        '/soon — скоро на отдых (оборот ≥ 4 млн)\n' +
        '/raise — кого поднять с отдыха\n\n' +
        'Изменить:\n' +
        '/set_status id статус — сменить статус ЛК\n' +
        '/send_rest id — отправить на отдых (статус → отдых)'
    )
  })

  bot.onText(/\/list(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id
    const status = (match[1] || '').trim().toLowerCase()
    try {
      let list = state.rows
      if (status) {
        list = list.filter((r) => (r.status || '').toLowerCase() === status)
      }
      if (list.length === 0) {
        return bot.sendMessage(chatId, status ? `Нет ЛК со статусом «${status}»` : 'Нет ЛК.')
      }
      const lines = list.slice(0, 40).map((r, i) => {
        const name = r.name || r.card || '—'
        const st = r.status ? ` [${r.status}]` : ''
        return `${i + 1}. #${r.id} ${name}${st}`
      })
      const title = status ? `Статус «${status}» (${list.length})` : `Все ЛК (${list.length})`
      await bot.sendMessage(chatId, `${title}:\n\n${lines.join('\n')}` + (list.length > 40 ? '\n\n... и ещё ' + (list.length - 40) : ''))
    } catch (e) {
      await bot.sendMessage(chatId, 'Ошибка: ' + (e.message || 'нет данных'))
    }
  })

  bot.onText(/\/soon/, async (msg) => {
    const chatId = msg.chat.id
    try {
      const list = state.rows.filter((r) => (r.turnover || 0) >= THRESHOLD)
      if (list.length === 0) {
        return bot.sendMessage(chatId, 'Нет ЛК с оборотом ≥ 4 млн.')
      }
      const lines = list.slice(0, 50).map((r, i) => {
        const name = r.name || r.card || '—'
        const turnover = r.turnover ? new Intl.NumberFormat('ru-RU').format(r.turnover) : '—'
        return `${i + 1}. ${name} — ${turnover}`
      })
      const text = `Скоро на отдых (${list.length}):\n\n${lines.join('\n')}` + (list.length > 50 ? '\n\n... и ещё ' + (list.length - 50) : '')
      await bot.sendMessage(chatId, text)
    } catch (e) {
      await bot.sendMessage(chatId, 'Ошибка: ' + (e.message || 'нет данных'))
    }
  })

  bot.onText(/\/raise/, async (msg) => {
    const chatId = msg.chat.id
    try {
      const pending = Object.entries(state.bankerRequests)
        .filter(([, r]) => r?.status === 'pending' || r?.status === 're_raise_pending')
      if (pending.length === 0) {
        return bot.sendMessage(chatId, 'Нет активных запросов на поднятие с отдыха.')
      }
      const lines = pending.map(([id, r]) => {
        const row = state.rows.find((x) => x.id === parseInt(id, 10))
        const lk = row ? row.name || row.card || `#${id}` : `#${id}`
        return `• #${id} ${lk} — банкир ${r.banker}`
      })
      const text = `Поднять с отдыха (${pending.length}):\n\n${lines.join('\n')}\n\nИспользуй /set_status ${pending[0][0]} актив — чтобы подтвердить.`
      await bot.sendMessage(chatId, text)
    } catch (e) {
      await bot.sendMessage(chatId, 'Ошибка: ' + (e.message || 'нет данных'))
    }
  })

  bot.onText(/\/set_status\s+(\d+)\s+(.+)/, async (msg, match) => {
    const chatId = msg.chat.id
    const id = parseInt(match[1], 10)
    const status = (match[2] || '').trim()
    try {
      const row = state.rows.find((r) => r.id === id)
      if (!row) return bot.sendMessage(chatId, `ЛК #${id} не найден.`)
      state.rows = state.rows.map((r) => (r.id === id ? { ...r, status } : r))
      await bot.sendMessage(chatId, `Статус ЛК #${id} (${row.name || row.card || '—'}) изменён на «${status}».`)
    } catch (e) {
      await bot.sendMessage(chatId, 'Ошибка: ' + (e.message || ''))
    }
  })

  bot.onText(/\/send_rest\s+(\d+)/, async (msg, match) => {
    const chatId = msg.chat.id
    const id = parseInt(match[1], 10)
    try {
      const row = state.rows.find((r) => r.id === id)
      if (!row) return bot.sendMessage(chatId, `ЛК #${id} не найден.`)
      state.rows = state.rows.map((r) => (r.id === id ? { ...r, status: 'отдых' } : r))
      await bot.sendMessage(chatId, `ЛК #${id} (${row.name || row.card || '—'}) отправлен на отдых.`)
    } catch (e) {
      await bot.sendMessage(chatId, 'Ошибка: ' + (e.message || ''))
    }
  })

  console.log('Telegram bot started')
} else {
  console.log('BOT_TOKEN not set — bot disabled')
}

// ========== Static (Vite build) ==========
app.use(express.static(join(__dirname, '../dist')))

app.get('*', (req, res) => {
  res.sendFile(join(__dirname, '../dist/index.html'))
})

app.listen(PORT, '0.0.0.0', () => {
  console.log('Server on port', PORT)
})
