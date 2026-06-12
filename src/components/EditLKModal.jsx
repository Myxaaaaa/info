import React, { useState, useEffect } from 'react'
import { useData } from '../contexts/DataContext'
import './EditLKModal.css'

const EditLKModal = ({ lk, isOpen, onClose }) => {
  const { updateLK, addLK, deleteLK, statusOptions } = useData()
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    card: '',
    status: '',
    manager: '',
    bank: '',
    extra: '',
    turnover: ''
  })
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const isEditMode = !!lk

  useEffect(() => {
    if (lk) {
      setFormData({
        name: lk.name || '',
        phone: lk.phone || '',
        card: lk.card || '',
        status: lk.status || '',
        manager: lk.manager || '',
        bank: lk.bank || '',
        extra: lk.extra || '',
        turnover: lk.turnover ? String(lk.turnover) : ''
      })
    } else {
      setFormData({
        name: '',
        phone: '',
        card: '',
        status: '',
        manager: '',
        bank: '',
        extra: '',
        turnover: ''
      })
    }
  }, [lk])

  if (!isOpen) return null

  const handleSubmit = (e) => {
    e.preventDefault()
    if (isEditMode) {
      updateLK(lk.id, formData)
    } else {
      addLK(formData)
    }
    onClose()
  }

  const handleDelete = () => {
    deleteLK(lk.id)
    setShowDeleteConfirm(false)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{isEditMode ? 'Редактирование ЛК' : 'Новый ЛК'}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit} className="edit-form">
          <div className="form-row">
            <div className="form-group">
              <label>ФИО:</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Телефон:</label>
              <input
                type="text"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Карта:</label>
              <input
                type="text"
                value={formData.card}
                onChange={(e) => setFormData({ ...formData, card: e.target.value })}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Статус:</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="status-select"
              >
                <option value="">—</option>
                {statusOptions.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>От кого:</label>
              <input
                type="text"
                value={formData.manager}
                onChange={(e) => setFormData({ ...formData, manager: e.target.value })}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Банк:</label>
              <input
                type="text"
                value={formData.bank}
                onChange={(e) => setFormData({ ...formData, bank: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Оборот за квартал:</label>
              <input
                type="text"
                value={formData.turnover}
                onChange={(e) => setFormData({ ...formData, turnover: e.target.value })}
                placeholder="2 000 000"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group full-width">
              <label>Примечания:</label>
              <textarea
                value={formData.extra}
                onChange={(e) => setFormData({ ...formData, extra: e.target.value })}
                rows="3"
              />
            </div>
          </div>

          <div className="modal-actions">
            {isEditMode && (
              <button type="button" className="btn-delete" onClick={() => setShowDeleteConfirm(true)}>
                Удалить
              </button>
            )}
            <div className="btn-group" style={{ marginLeft: isEditMode ? 'auto' : 0 }}>
              <button type="button" className="btn-cancel" onClick={onClose}>
                Отмена
              </button>
              <button type="submit" className="btn-save">
                Сохранить
              </button>
            </div>
          </div>
        </form>

        {showDeleteConfirm && (
          <div className="delete-confirm">
            <p>Вы уверены, что хотите удалить этот ЛК?</p>
            <div className="delete-actions">
              <button onClick={() => setShowDeleteConfirm(false)}>Отмена</button>
              <button onClick={handleDelete} className="btn-confirm-delete">Удалить</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default EditLKModal
