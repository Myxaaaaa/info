import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = process.env.DATA_DIR || join(__dirname, 'data')

const FILES = {
  state: 'state.json',
  users: 'users.json',
  settings: 'settings.json',
}

function ensureDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
}

function readJson(name, fallback) {
  ensureDir()
  const path = join(DATA_DIR, FILES[name])
  if (!existsSync(path)) return fallback
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return fallback
  }
}

function writeJson(name, data) {
  ensureDir()
  writeFileSync(join(DATA_DIR, FILES[name]), JSON.stringify(data, null, 2), 'utf8')
}

export function loadState(fallback) {
  return readJson('state', fallback)
}

export function saveState(state) {
  writeJson('state', state)
}

export function loadUsers(fallback) {
  return readJson('users', fallback)
}

export function saveUsers(users) {
  writeJson('users', users)
}

export function loadSettings(fallback) {
  return readJson('settings', fallback)
}

export function saveSettings(settings) {
  writeJson('settings', settings)
}

export { DATA_DIR }
