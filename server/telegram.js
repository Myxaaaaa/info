import TelegramBot from 'node-telegram-bot-api'

let bot = null
let defaultChatId = process.env.TELEGRAM_CHAT_ID || ''

export function initTelegram(onConnect) {
  const token = process.env.BOT_TOKEN
  if (!token) {
    console.log('Telegram: BOT_TOKEN не задан — бот отключён')
    return null
  }
  try {
    bot = new TelegramBot(token, { polling: true })
    console.log('Telegram: бот подключён (polling)')

    bot.onText(/\/(connect|start|link)(@\w+)?$/i, async (msg) => {
      const chatId = String(msg.chat.id)
      const title = msg.chat.title || msg.from?.first_name || msg.from?.username || 'чат'
      if (onConnect) {
        try {
          await onConnect(chatId, title)
        } catch (e) {
          console.error('Telegram connect error:', e.message)
        }
      }
      const isGroup = msg.chat.type === 'group' || msg.chat.type === 'supergroup'
      const hint = isGroup
        ? 'Группа подключена — уведомления о запросах будут приходить сюда.'
        : 'Личный чат подключен — уведомления будут приходить сюда.'
      await bot.sendMessage(
        msg.chat.id,
        `✅ <b>MBank ЛК подключён</b>\n\n${hint}\n\nChat ID: <code>${chatId}</code>\n\nКоманды:\n/connect — подключить этот чат\n/status — проверить связь`,
        { parse_mode: 'HTML' }
      )
    })

    bot.onText(/\/status(@\w+)?$/i, async (msg) => {
      const linked = defaultChatId ? `✅ Активный чат: <code>${defaultChatId}</code>` : '⚠️ Чат ещё не привязан — напиши /connect'
      await bot.sendMessage(
        msg.chat.id,
        `🤖 <b>MBank ЛК бот</b>\n${linked}\nТекущий чат: <code>${msg.chat.id}</code>`,
        { parse_mode: 'HTML' }
      )
    })

    return bot
  } catch (e) {
    console.error('Telegram init error:', e.message)
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
  return !!bot
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
    return 'Чат не подключён. В группе напиши боту /connect'
  }
  return msg || 'Неизвестная ошибка Telegram'
}

/** Формат: "в вайт\nИмя\tтелефон" */
export function formatLKLine(row) {
  if (!row) return '—\t—'
  const name = (row.name || '—').trim()
  const phone = (row.phone || '—').trim()
  return `${name}\t${phone}`
}

export function formatOperatorRequestMessage(action, rows) {
  const list = Array.isArray(rows) ? rows : [rows]
  const lines = list.map((r) => formatLKLine(r))
  return `${action}\n${lines.join('\n')}`
}

export function formatOperatorApprovedMessage(action, rows) {
  return formatOperatorRequestMessage(action, rows)
}

export async function sendTelegram(text, chatId) {
  if (!bot) return { success: false, error: 'Бот не настроен — задай BOT_TOKEN в .env и перезапусти сервер' }
  const target = String(chatId || defaultChatId || '').trim()
  if (!target) {
    return { success: false, error: 'Чат не подключён. Добавь бота в группу и напиши /connect' }
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
  if (!bot) return { success: false, error: 'Бот не настроен' }
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
