import TelegramBot from 'node-telegram-bot-api'

let bot = null
let defaultChatId = process.env.TELEGRAM_CHAT_ID || ''

export function initTelegram() {
  const token = process.env.BOT_TOKEN
  if (!token) {
    console.log('Telegram: BOT_TOKEN не задан — бот отключён')
    return null
  }
  try {
    bot = new TelegramBot(token, { polling: false })
    console.log('Telegram: бот подключён')
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
    return '401 — неверный BOT_TOKEN. Создай новый токен в @BotFather и пропиши в .env (или на Railway), затем перезапусти сервер.'
  }
  if (msg.includes('403') || /forbidden/i.test(msg)) {
    return '403 — бот не может писать в этот чат. Добавь бота в группу, напиши ему /start в личке или проверь chat ID (для группы начинается с -100...).'
  }
  if (msg.includes('400') && /chat not found/i.test(msg)) {
    return 'Чат не найден — неверный chat ID. Нажми «Найти chat ID» после сообщения боту.'
  }
  if (msg.includes('chat_id')) {
    return 'Неверный chat ID. Для группы нужен формат -1001234567890, не 401 и не 403.'
  }
  return msg || 'Неизвестная ошибка Telegram'
}

export async function sendTelegram(text, chatId) {
  if (!bot) return { success: false, error: 'Бот не настроен — задай BOT_TOKEN в .env и перезапусти сервер' }
  const target = String(chatId || defaultChatId || '').trim()
  if (!target) return { success: false, error: 'Не указан chat ID' }
  if (target === '401' || target === '403') {
    return {
      success: false,
      error: '401 и 403 — это коды ошибок, не chat ID. Укажи ID чата, например -1001234567890',
    }
  }
  try {
    await bot.sendMessage(target, text, { parse_mode: 'HTML' })
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
