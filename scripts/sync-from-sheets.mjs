import { writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SHEET_ID = '1frJ4DEvdmLSuIzdqXhewjQRXXsW4xavwnCUoS7WzBQM'

const SKIP_NAMES = new Set(['потерялся', 'ааа', 'ббб', 'айбек'])

function normalizePhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith('996')) return `+${digits}`
  return `+996${digits}`
}

function combineExtra(...parts) {
  return parts.map((p) => String(p || '').trim()).filter(Boolean).join(' | ')
}

async function fetchRows() {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&gid=0`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Sheets HTTP ${res.status}`)
  const text = await res.text()
  const match = text.match(/setResponse\(([\s\S]+)\)\s*;?\s*$/)
  if (!match) throw new Error('Не удалось разобрать ответ Google Sheets')
  const json = JSON.parse(match[1])
  const table = json.table
  if (!table?.rows) throw new Error('Нет данных в таблице')

  return table.rows
    .map((row, i) => {
      const cells = row.c || []
      const get = (idx) => (cells[idx]?.v ?? '').toString().trim()
      const name = get(0)
      const phone = get(1)
      const card = get(2)
      const status = get(3)
      const manager = get(4)
      const platform = get(5)
      const notes = combineExtra(get(6), get(7), get(8), get(9))
      const extra = combineExtra(platform, notes)

      return {
        id: i + 1,
        name,
        phone,
        card,
        status,
        manager,
        extra,
        bank: 'Мбанк',
        turnover: 0,
      }
    })
    .filter((r) => {
      if (!r.name && !r.phone && !r.card) return false
      if (SKIP_NAMES.has(r.name.toLowerCase().trim())) return false
      return true
    })
    .map((row, index) => ({ ...row, id: index + 1 }))
}

function toTableDataJs(rows) {
  const lines = rows.map((r) => {
    const fields = [
      `id: ${r.id}`,
      `name: ${JSON.stringify(r.name)}`,
      `phone: ${JSON.stringify(r.phone)}`,
      `card: ${JSON.stringify(r.card)}`,
      `status: ${JSON.stringify(r.status)}`,
      `manager: ${JSON.stringify(r.manager)}`,
    ]
    if (r.extra) fields.push(`extra: ${JSON.stringify(r.extra)}`)
    return `  { ${fields.join(', ')} },`
  })

  return `// Данные из таблицы ЛК (Google Sheets)
// Обновляется: npm run sync:sheets
export const DATA_VERSION = ${Date.now()}

export const STATUS_OPTIONS = [
  'отдых', 'Заява', 'блок', 'вылет', 'потерялся', 'у дропа', 'актив', 'без площадки',
  'мэйсон', 'изи', 'док', 'махабат', 'ждем ответа', 'ждем карту'
]

export const INITIAL_DATA = [
${lines.join('\n')}
]
`
}

function toRegistryJson(rows) {
  return rows.map((r) => ({
    id: String(r.id),
    bank: r.bank || 'Мбанк',
    full_name: r.name,
    phone: normalizePhone(r.phone),
    card: r.card,
    status: r.status,
    manager: r.manager,
    ...(r.extra ? { notes: r.extra } : {}),
  }))
}

const rows = await fetchRows()
writeFileSync(join(__dirname, '../src/data/tableData.js'), toTableDataJs(rows), 'utf8')
writeFileSync(
  join(__dirname, '../src/data/lk_registry.json'),
  JSON.stringify(toRegistryJson(rows), null, 2) + '\n',
  'utf8'
)
console.log(`Synced ${rows.length} rows from Google Sheets`)
