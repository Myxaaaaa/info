import { KASPI_DATA } from '../src/data/kaspiSectionData.js'

export function isBlockStatus(status) {
  const lower = (status || '').toLowerCase().trim()
  return lower === 'блок' || lower === 'заява'
}

export function emptySectionData() {
  return {
    rows: [],
    operatorRequests: {},
    blockReasonRequests: {},
    statusHistory: {},
    raisedFromRest: {},
    bankerRequests: {},
  }
}

export function loadKaspiSeedRows() {
  return Array.isArray(KASPI_DATA) ? KASPI_DATA.map((r) => ({ ...r, onStop: false, inWaitlist: false })) : []
}

export function migrateState(raw, defaultRows = []) {
  if (raw?.sectionData && raw?.sections?.length) {
    return ensureKaspiSection(raw, defaultRows)
  }

  const legacyRows = raw?.rows?.length ? raw.rows : defaultRows
  const migrated = {
    sections: [
      { id: 'mbank', name: 'Мбанк', bank: 'Мбанк', sheetGid: '0' },
    ],
    sectionData: {
      mbank: {
        rows: legacyRows.map((r) => ({ ...r, bank: r.bank || 'Мбанк' })),
        operatorRequests: raw?.operatorRequests || {},
        blockReasonRequests: raw?.blockReasonRequests || {},
        statusHistory: raw?.statusHistory || {},
        raisedFromRest: raw?.raisedFromRest || {},
        bankerRequests: raw?.bankerRequests || {},
      },
    },
    logs: raw?.logs || [],
    updatedAt: raw?.updatedAt || Date.now(),
  }
  return ensureKaspiSection(migrated, defaultRows)
}

function ensureKaspiSection(state, defaultRows) {
  const hasKaspi = state.sections.some((s) => s.id === 'kaspi')
  if (hasKaspi) return state

  const kaspiRows = loadKaspiSeedRows()
  if (!kaspiRows.length) return state

  return {
    ...state,
    sections: [
      ...state.sections,
      { id: 'kaspi', name: 'Kaspi банк', bank: 'Kaspi', sheetGid: '138973280' },
    ],
    sectionData: {
      ...state.sectionData,
      kaspi: {
        ...emptySectionData(),
        rows: kaspiRows,
      },
    },
  }
}

export function getSectionIds(state) {
  return (state.sections || []).map((s) => s.id)
}

export function getSectionData(state, sectionId) {
  if (!state.sectionData?.[sectionId]) {
    state.sectionData = state.sectionData || {}
    state.sectionData[sectionId] = emptySectionData()
  }
  return state.sectionData[sectionId]
}

export function findRowInSection(state, sectionId, id) {
  const data = getSectionData(state, sectionId)
  return data.rows.find((r) => r.id === parseInt(id, 10))
}

export function resolveSectionId(state, sectionId) {
  const id = String(sectionId || 'mbank').trim() || 'mbank'
  if (!state.sections?.some((s) => s.id === id)) return 'mbank'
  return id
}
