import React from 'react'
import './ReRaiseModal.css'

const ReRaiseModal = ({ isOpen, onClose, previousRaisedDate, onRequest }) => {
  if (!isOpen) return null

  const formatDate = (d) => {
    return new Date(d).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content re-raise-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Реквизит уже поднимали с отдыха</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="re-raise-content">
          <p><strong>Данный реквизит поднимали с отдыха:</strong></p>
          <p className="re-raise-date">{formatDate(previousRaisedDate)}</p>
          <p>Чтобы отправить запрос снова — админ должен одобрить это.</p>
          <p>Оставьте заявку, админ проверит и даст добро.</p>
          <div className="re-raise-actions">
            <button className="btn-cancel" onClick={onClose}>Отмена</button>
            <button className="btn-request" onClick={onRequest}>Отправить запрос админу</button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ReRaiseModal
