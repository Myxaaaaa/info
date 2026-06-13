import TelegramBot from 'node-telegram-bot-api'

let bot = null
let defaultChatId = process.env.TELEGRAM_CHAT_ID || ''
let botUsername = ''
let tokenValid = false

const CMD_RE = /^\/(connect|start|link|status)(@[\w_]+)?(\s|$)/i

async function reply(chatId, text) {
  if (!bot) return
  await bot.sendMessage(chatId, text, { parse_mode: 'HTML' })
}

function wireCommands(onConnect) {
  bot.on('message', async (msg) => {
    const text = (msg.text || '').trim()
    if (!text.startsWith('/')) return

    const m = text.match(CMD_RE)
    if (!m) return

    const cmd = m[1].toLowerCase()
    const chatId = String(msg.chat.id)
    const title = msg.chat.title || msg.from?.first_name || msg.from?.username || 'чат'

    if (cmd === 'status') {
      const linked = defaultChatId
        ? `✅ Активный чат: <code>${defaultChatId}</code>`
        : '⚠️ Чат не привязан — напиши /connect'
      await reply(
        msg.chat.id,
        `🤖 <b>MBank ЛК</b>\n${linked}\nЭтот чат: <code>${chatId}</code>\nБот: @${botUsername || '—'}`
      )
      return
    }

    // connect / start / link
    if (onConnect) {
      try {
        await onConnect(chatId, title)
        setDefaultChatId(chatId)
      } catch (e) {
        console.error('Telegram connect error:', e.message)
      }
    }
    const isGroup = msg.chat.type === 'group' || msg.chat.type === 'supergroup'
    const hint = isGroup
      ? 'Группа подключена — уведомления о запросах будут приходить сюда.'
      : 'Чат подключен — уведомления будут приходить сюда.'
    await reply(
      msg.chat.id,
      `✅ <b>MBank ЛК подключён</b>\n\n${hint}\n\nChat ID: <code>${chatId}</code>\n\n/connect — привязать этот чат\n/status — проверить связь`
    )
  })

  bot.on('polling_error', (err) => {
    const msg = err?.message || String(err)
    if (msg.includes('401')) {
      tokenValid = false
      console.error('Telegram: токен неверный (401). Обнови BOT_TOKEN в .env и перезапусти сервер.')
    } else {
      console.error('Telegram polling error:', msg)
    }
  })
}

export async function initTelegram(onConnect, options = {}) {
  const token = (process.env.BOT_TOKEN || '').trim()
  if (!token) {
    console.log('Telegram: BOT_TOKEN не задан — задай переменную на Railway или в .env')
    return null
  }

  const enablePolling = options.enablePolling !== false && options.enablePolling !== true
    ? !defaultChatId
    : !!options.enablePolling

  try {
    const probe = new TelegramBot(token, { polling: false })
    const me = await probe.getMe()
    botUsername = me.username || ''
    tokenValid = true
    console.log(`Telegram: токен OK — @${botUsername}`)

    await probe.deleteWebHook({ drop_pending_updates: true })

    bot = new TelegramBot(token, { polling: false })

    if (enablePolling) {
      await bot.startPolling({ interval: 1000, params: { timeout: 10 } })
      wireCommands(onConnect)
      console.log('Telegram: polling вкл — /connect в группе для привязки')
    } else {
      console.log(`Telegram: только отправка → chat ${defaultChatId || '(не задан!)'}`)
    }

    return bot
  } catch (e) {
    tokenValid = false
    const msg = e.message || String(e)
    if (msg.includes('401') || /unauthorized/i.test(msg)) {
      console.error('Telegram: BOT_TOKEN неверный (401). Получи новый у @BotFather → /mybots → API Token → Revoke')
    } else {
      console.error('Telegram init error:', msg)
    }
    bot = null
    return null
  }
}

export function setDefaultChatId(chatId) {
  defaultChatId = chatId || ''
}

export function getDefaultChatId() {
  return defaultChatId
}

export function isTelegramEnabled() {
  return !!bot && tokenValid
}

export function getTelegramStatus() {
  return {
    enabled: isTelegramEnabled(),
    tokenValid,
    botUsername,
    chatId: defaultChatId || process.env.TELEGRAM_CHAT_ID || '',
    hasToken: !!(process.env.BOT_TOKEN || '').trim(),
    canSend: isTelegramEnabled() && !!(defaultChatId || process.env.TELEGRAM_CHAT_ID),
  }
}

export function explainTelegramError(message = '') {
  const msg = String(message)
  if (msg.includes('401') || /unauthorized/i.test(msg)) {
    return '401 — неверный BOT_TOKEN. Создай новый токен в @BotFather и пропиши в .env, затем перезапусти сервер.'
  }
  if (msg.includes('403') || /forbidden/i.test(msg)) {
    return '403 — бот не может писать в чат. Добавь бота в группу и напиши /connect'
  }
  if (msg.includes('400') && /chat not found/i.test(msg)) {
    return 'Чат не найден. Добавь бота в группу и напиши /connect'
  }
  if (msg.includes('chat_id')) {
    return 'Чат не подключён. В группе напиши /connect'
  }
  return msg || 'Неизвестная ошибка Telegram'
}

/** ФИО + таб + телефон */
export function formatLKLine(row) {
  if (!row) return '—\t—'
  const name = (row.name || '—').trim()
  const phone = (row.phone || '—').trim()
  return `${name}\t${phone}`
}

/** Запрос оператора: заголовок сверху, реквизиты ниже */
export function formatOperatorRequestMessage(action, rows) {
  const list = Array.isArray(rows) ? rows : [rows]
  const lines = list.map((r) => formatLKLine(r))
  return `${action}\n${lines.join('\n')}`
}

/** Результат: ФИО + телефон, статус снизу */
export function formatTelegramResult(rows, statusLine) {
  const list = Array.isArray(rows) ? rows : [rows]
  const body = list.map((r) => formatLKLine(r)).join('\n')
  return `${body}\n\n${statusLine}`
}

export function formatOperatorApprovedMessage(action, rows) {
  return formatTelegramResult(rows, action)
}

export function formatOperatorDeniedMessage(action, rows, reason = '') {
  const line = reason ? `отказано — ${action}\n${reason}` : `отказано — ${action}`
  return formatTelegramResult(rows, line)
}

export async function sendTelegram(text, chatId) {
  if (!isTelegramEnabled()) {
    return {
      success: false,
      error: tokenValid
        ? 'Бот не запущен'
        : 'BOT_TOKEN неверный — обнови в .env и перезапусти сервер',
    }
  }
  const target = String(chatId || defaultChatId || process.env.TELEGRAM_CHAT_ID || '').trim()
  if (!target) {
    return { success: false, error: 'Чат не подключён. В группе напиши боту /connect' }
  }
  try {
    await bot.sendMessage(target, text)
    return { success: true }
  } catch (e) {
    const explained = explainTelegramError(e.message)
    console.error('Telegram send error:', e.message)
    return { success: false, error: explained, raw: e.message }
  }
}

export async function fetchTelegramChats() {
  if (!isTelegramEnabled()) {
    return { success: false, error: 'Бот не настроен или токен неверный' }
  }
  try {
    const updates = await bot.getUpdates({ limit: 50 })
    const seen = new Map()
    for (const u of updates || []) {
      const chat = u.message?.chat || u.my_chat_member?.chat || u.channel_post?.chat
      if (!chat?.id) continue
      seen.set(String(chat.id), {
        id: String(chat.id),
        title: chat.title || [chat.first_name, chat.last_name].filter(Boolean).join(' ') || chat.username || '—',
        type: chat.type,
      })
    }
    return { success: true, chats: Array.from(seen.values()) }
  } catch (e) {
    return { success: false, error: explainTelegramError(e.message), raw: e.message }
  }
}

export function formatLK(row) {
  if (!row) return '—'
  const parts = [row.name, row.phone].filter(Boolean)
  return parts.length ? parts.join(' · ') : `ЛК #${row.id}`
}
