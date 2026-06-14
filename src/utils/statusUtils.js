/** Статусы, которые считаются блокировкой (заява = блок) */
export function isBlockStatus(status) {
  const lower = (status || '').toLowerCase().trim()
  return lower === 'блок' || lower === 'заява'
}

export function normalizeBlockStatus(status) {
  const lower = (status || '').toLowerCase().trim()
  if (lower === 'заява') return 'заява'
  if (lower === 'блок') return 'блок'
  return status
}
