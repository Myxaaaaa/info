import { writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SHEET_ID = '1frJ4DEvdmLSuIzdqXhewjQRXXsW4xavwnCUoS7WzBQM'
const KASPI_GID = '138973280'

const STATUS_KEYWORDS = new Set([
  'актив', 'отдых', 'блок', 'вылет', 'заява', 'у дропа', 'звонок в банк', 'опер', 'брюс', 'ума', 'эдил',
])

function looksLikePhone(v) {
  return /\d{3,}/.test(String(v || '').replace(/\s/g, ''))
}

function looksLikeCard(v) {
  return /\d{4}/.test(String(v || ''))
}

function parseKaspiRow(cells, index) {
  const get = (idx) => (cells[idx]?.v ?? '').toString().trim()
  const raw = [get(0), get(1), get(2), get(3), get(4), get(5)]

  if (!raw[0] || raw[0].toLowerCase() === 'имя') return null
  if (raw[0].toLowerCase() === 'актив' && !raw[1] && !raw[2]) return null

  let name = raw[0]
  let phone = ''
  let card = ''
  let manager = ''
  let status = ''
  let extra = ''

  if (raw[4] && (STATUS_KEYWORDS.has(raw[4].toLowerCase()) || raw[4].toLowerCase().includes('блок'))) {
    phone = looksLikePhone(raw[1]) ? raw[1] : ''
    card = raw[2] || (looksLikeCard(raw[1]) && !phone ? raw[1] : '')
    manager = raw[3] || ''
    status = raw[4]
    extra = raw[5] || ''
  } else {
    phone = looksLikePhone(raw[1]) ? raw[1] : ''
    card = raw[2] || ''
    status = raw[3] || raw[1] || ''
    extra = [raw[4], raw[5]].filter(Boolean).join(' | ')
    if (!phone && looksLikePhone(raw[2])) {
      phone = raw[2]
      card = ''
    }
    if (STATUS_KEYWORDS.has((status || '').toLowerCase()) && !card && looksLikeCard(raw[2])) {
      card = raw[2]
    }
  }

  if (!name) return null

  return {
    id: index + 1,
    name,
    phone,
    card,
    status,
    manager,
    extra,
    bank: 'Kaspi',
    turnover: 0,
  }
}

async function fetchKaspiRows() {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&gid=${KASPI_GID}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Sheets HTTP ${res.status}`)
  const text = await res.text()
  const match = text.match(/setResponse\(([\s\S]+)\)\s*;?\s*$/)
  if (!match) throw new Error('Не удалось разобрать ответ Google Sheets')
  const json = JSON.parse(match[1])
  const table = json.table
  if (!table?.rows) throw new Error('Нет данных в таблице')

  return table.rows
    .map((row, i) => parseKaspiRow(row.c || [], i))
    .filter(Boolean)
    .map((row, index) => ({ ...row, id: index + 1 }))
}

function toModule(rows) {
  const lines = rows.map((r) => {
    const fields = [
      `id: ${r.id}`,
      `name: ${JSON.stringify(r.name)}`,
      `phone: ${JSON.stringify(r.phone)}`,
      `card: ${JSON.stringify(r.card)}`,
      `status: ${JSON.stringify(r.status)}`,
      `manager: ${JSON.stringify(r.manager)}`,
      `bank: ${JSON.stringify(r.bank)}`,
    ]
    if (r.extra) fields.push(`extra: ${JSON.stringify(r.extra)}`)
    return `  { ${fields.join(', ')} },`
  })

  return `// Данные Kaspi банк (Google Sheets gid=${KASPI_GID})
// Обновляется: npm run sync:kaspi
export const KASPI_DATA_VERSION = ${Date.now()}

export const KASPI_DATA = [
${lines.join('\n')}
]
`
}

const rows = await fetchKaspiRows()
writeFileSync(join(__dirname, '../src/data/kaspiSectionData.js'), toModule(rows), 'utf8')
console.log(`Synced ${rows.length} Kaspi rows from Google Sheets`)
