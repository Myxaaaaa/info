import React, { useState } from 'react'
import { useStatusSettings } from '../contexts/StatusSettingsContext'
import './StatusSettingsModal.css'

const StatusSettingsModal = ({ isOpen, onClose }) => {
  const { settings, addStatus, updateStatus, deleteStatus } = useStatusSettings()
  const [newStatusName, setNewStatusName] = useState('')
  const [newStatusBgColor, setNewStatusBgColor] = useState('#e5e7eb')
  const [newStatusTextColor, setNewStatusTextColor] = useState('#374151')
  const [newStatusLabel, setNewStatusLabel] = useState('')
  const [editingStatus, setEditingStatus] = useState(null)

  if (!isOpen) return null

  const handleAddStatus = () => {
    if (!newStatusName.trim()) {
      alert('Введите название статуса')
      return
    }
    addStatus(newStatusName.trim(), newStatusBgColor, newStatusTextColor, newStatusLabel || newStatusName)
    setNewStatusName('')
    setNewStatusBgColor('#e5e7eb')
    setNewStatusTextColor('#374151')
    setNewStatusLabel('')
  }

  const handleUpdateStatus = (statusName) => {
    const status = settings[statusName]
    if (!status) return
    
    updateStatus(statusName, {
      bgColor: editingStatus.bgColor,
      textColor: editingStatus.textColor,
      label: editingStatus.label
    })
    setEditingStatus(null)
  }

  const handleDeleteStatus = (statusName) => {
    if (confirm(`Удалить статус "${statusName}"?`)) {
      deleteStatus(statusName)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content status-settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Настройки статусов</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="status-settings-content">
          {/* Добавление нового статуса */}
          <div className="add-status-section">
            <h3>Добавить новый статус</h3>
            <div className="add-status-form">
              <div className="form-group">
                <label>Название статуса:</label>
                <input
                  type="text"
                  value={newStatusName}
                  onChange={(e) => setNewStatusName(e.target.value)}
                  placeholder="например: запас"
                />
              </div>
              <div className="form-group">
                <label>Отображаемое название:</label>
                <input
                  type="text"
                  value={newStatusLabel}
                  onChange={(e) => setNewStatusLabel(e.target.value)}
                  placeholder="например: Запас"
                />
              </div>
              <div className="color-group">
                <div className="form-group">
                  <label>Цвет фона:</label>
                  <input
                    type="color"
                    value={newStatusBgColor}
                    onChange={(e) => setNewStatusBgColor(e.target.value)}
                  />
                  <input
                    type="text"
                    value={newStatusBgColor}
                    onChange={(e) => setNewStatusBgColor(e.target.value)}
                    className="color-input"
                  />
                </div>
                <div className="form-group">
                  <label>Цвет текста:</label>
                  <input
                    type="color"
                    value={newStatusTextColor}
                    onChange={(e) => setNewStatusTextColor(e.target.value)}
                  />
                  <input
                    type="text"
                    value={newStatusTextColor}
                    onChange={(e) => setNewStatusTextColor(e.target.value)}
                    className="color-input"
                  />
                </div>
              </div>
              <div className="preview-status" style={{ backgroundColor: newStatusBgColor, color: newStatusTextColor }}>
                {newStatusLabel || newStatusName || 'Предпросмотр'}
              </div>
              <button onClick={handleAddStatus} className="btn-add-status">
                Добавить статус
              </button>
            </div>
          </div>

          {/* Список существующих статусов */}
          <div className="existing-statuses-section">
            <h3>Существующие статусы</h3>
            <div className="statuses-list">
              {Object.entries(settings).map(([statusName, config]) => (
                <div key={statusName} className="status-item">
                  {editingStatus?.name === statusName ? (
                    <div className="status-edit-form">
                      <div className="form-group">
                        <label>Отображаемое название:</label>
                        <input
                          type="text"
                          value={editingStatus.label}
                          onChange={(e) => setEditingStatus({ ...editingStatus, label: e.target.value })}
                        />
                      </div>
                      <div className="color-group">
                        <div className="form-group">
                          <label>Цвет фона:</label>
                          <input
                            type="color"
                            value={editingStatus.bgColor}
                            onChange={(e) => setEditingStatus({ ...editingStatus, bgColor: e.target.value })}
                          />
                          <input
                            type="text"
                            value={editingStatus.bgColor}
                            onChange={(e) => setEditingStatus({ ...editingStatus, bgColor: e.target.value })}
                            className="color-input"
                          />
                        </div>
                        <div className="form-group">
                          <label>Цвет текста:</label>
                          <input
                            type="color"
                            value={editingStatus.textColor}
                            onChange={(e) => setEditingStatus({ ...editingStatus, textColor: e.target.value })}
                          />
                          <input
                            type="text"
                            value={editingStatus.textColor}
                            onChange={(e) => setEditingStatus({ ...editingStatus, textColor: e.target.value })}
                            className="color-input"
                          />
                        </div>
                      </div>
                      <div className="status-actions">
                        <button onClick={() => handleUpdateStatus(statusName)} className="btn-save">
                          Сохранить
                        </button>
                        <button onClick={() => setEditingStatus(null)} className="btn-cancel">
                          Отмена
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="status-info">
                        <div className="status-preview" style={{ backgroundColor: config.bgColor, color: config.textColor }}>
                          {config.label || statusName}
                        </div>
                        <div className="status-name">{statusName}</div>
                      </div>
                      <div className="status-actions">
                        <button onClick={() => setEditingStatus({ name: statusName, ...config })} className="btn-edit">
                          Редактировать
                        </button>
                        <button onClick={() => handleDeleteStatus(statusName)} className="btn-delete">
                          Удалить
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default StatusSettingsModal
