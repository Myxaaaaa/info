import React, { useState, useEffect } from 'react'

const UserAccessModal = ({ user: targetUser, sections, onClose, onSave }) => {
  const [access, setAccess] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setAccess({ ...(targetUser?.sectionAccess || {}) })
  }, [targetUser])

  if (!targetUser) return null

  const toggleAccess = (sectionId, level) => {
    setAccess((prev) => {
      const next = { ...prev }
      if (prev[sectionId] === level) {
        delete next[sectionId]
      } else {
        next[sectionId] = level
      }
      return next
    })
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
    const result = await onSave(targetUser.id, access)
    setSaving(false)
    if (result.success) onClose()
    else setError(result.error || 'Ошибка')
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Доступ: {targetUser.username}</h2>
          <button type="button" className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="admin-form" style={{ padding: '1rem' }}>
          <p className="admin-hint">
            Выдайте доступ к секциям (листам). Банкиры и операторы с ролью «Банкир» видят всё автоматически.
          </p>
          {sections.map((s) => (
            <div key={s.id} className="access-row" style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '0.75rem' }}>
              <span style={{ minWidth: '120px', fontWeight: 500 }}>{s.name}</span>
              <label>
                <input
                  type="radio"
                  name={`access-${s.id}`}
                  checked={!access[s.id]}
                  onChange={() => setAccess((prev) => { const n = { ...prev }; delete n[s.id]; return n })}
                />
                {' '}Нет
              </label>
              <label>
                <input
                  type="radio"
                  name={`access-${s.id}`}
                  checked={access[s.id] === 'view'}
                  onChange={() => toggleAccess(s.id, 'view')}
                />
                {' '}Просмотр
              </label>
              <label>
                <input
                  type="radio"
                  name={`access-${s.id}`}
                  checked={access[s.id] === 'edit'}
                  onChange={() => toggleAccess(s.id, 'edit')}
                />
                {' '}Редактирование
              </label>
            </div>
          ))}
          {error && <p className="form-error">{error}</p>}
          <div className="form-actions">
            <button type="button" onClick={onClose}>Отмена</button>
            <button type="button" onClick={handleSave} disabled={saving}>
              {saving ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default UserAccessModal
