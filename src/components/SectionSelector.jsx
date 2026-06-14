import React from 'react'
import { useData } from '../contexts/DataContext'
import { useAuth } from '../contexts/AuthContext'
import './SectionSelector.css'

const SectionSelector = ({ showManage = false }) => {
  const { sections, activeSectionId, setActiveSection, createSection, deleteSection } = useData()
  const { accessibleSections, isAdmin } = useAuth()
  const [newName, setNewName] = React.useState('')
  const [msg, setMsg] = React.useState('')

  const visibleSections = accessibleSections(sections)

  if (!visibleSections.length) {
    return (
      <div className="section-selector section-selector-empty">
        <p>Нет доступных секций. Обратитесь к администратору.</p>
      </div>
    )
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!newName.trim()) return
    const result = await createSection(newName.trim())
    if (result.success) {
      setNewName('')
      setActiveSection(result.section.id)
      setMsg('Секция создана')
    } else {
      setMsg(result.error || 'Ошибка')
    }
    setTimeout(() => setMsg(''), 3000)
  }

  return (
    <div className="section-selector">
      <div className="section-tabs">
        {visibleSections.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`section-tab ${activeSectionId === s.id ? 'active' : ''}`}
            onClick={() => setActiveSection(s.id)}
          >
            {s.name}
          </button>
        ))}
      </div>
      {showManage && isAdmin && (
        <div className="section-manage">
          <form onSubmit={handleCreate} className="section-create-form">
            <input
              type="text"
              placeholder="Новая секция (банк)..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <button type="submit">+ Создать лист</button>
          </form>
          {activeSectionId !== 'mbank' && activeSectionId !== 'kaspi' && (
            <button
              type="button"
              className="section-delete-btn"
              onClick={async () => {
                if (!confirm('Удалить секцию?')) return
                const result = await deleteSection(activeSectionId)
                setMsg(result.success ? 'Удалено' : result.error)
                setTimeout(() => setMsg(''), 3000)
              }}
            >
              Удалить текущую
            </button>
          )}
          {msg && <span className="section-msg">{msg}</span>}
        </div>
      )}
    </div>
  )
}

export default SectionSelector
