import React, { useState } from 'react'
import { useData } from '../contexts/DataContext'
import { useAuth } from '../contexts/AuthContext'
import { useStatusSettings } from '../contexts/StatusSettingsContext'
import ReRaiseModal from './ReRaiseModal'
import './InfoLKModal.css'

const InfoLKModal = ({ lk, isOpen, onClose }) => {
  const { getLKHistory, getBankerRequest, requestActivateFromRest, requestReRaiseFromRest, approveBankerRequest, rejectBankerRequest, getRaisedFromRestDate, isRestStatus } = useData()
  const { user, isBanker } = useAuth()
  const { getStatusStyle, getStatusLabel } = useStatusSettings()
  const [showRejectForm, setShowRejectForm] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [showReRaiseModal, setShowReRaiseModal] = useState(false)

  if (!isOpen || !lk) return null

  const history = getLKHistory(lk.id)
  const request = getBankerRequest(lk.id)
  const raisedDate = getRaisedFromRestDate(lk.id)
  const canRequestRest = isBanker && isRestStatus(lk.status)

  const formatDate = (dateString) => {
    const date = new Date(dateString)
    return date.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const handleRequestActivate = () => {
    if (raisedDate) {
      setShowReRaiseModal(true)
      return
    }
    const result = requestActivateFromRest(lk.id, user?.username || 'banker')
    if (result.success) {
      onClose()
    } else if (result.error) {
      alert(result.error)
    }
  }

  const handleReRaiseRequest = () => {
    const result = requestReRaiseFromRest(lk.id, user?.username || 'banker')
    setShowReRaiseModal(false)
    if (result.success) {
      alert('Запрос отправлен. Админ одобрит — пользователь получит уведомление.')
      onClose()
    } else {
      alert(result.error || 'Ошибка')
    }
  }

  const handleApprove = () => {
    approveBankerRequest(lk.id)
    alert('Статус изменен на "актив"')
    onClose()
  }

  const handleReject = () => {
    if (!rejectReason.trim()) {
      alert('Укажите причину отклонения')
      return
    }
    rejectBankerRequest(lk.id, rejectReason)
    setShowRejectForm(false)
    setRejectReason('')
    alert('Запрос отклонен, банкир получит уведомление')
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content info-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Информация о ЛК</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="info-content">
          <div className="info-section">
            <h3>Основная информация</h3>
            <div className="info-grid">
              <div className="info-item">
                <span className="info-label">ФИО:</span>
                <span className="info-value">{lk.name || '—'}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Телефон:</span>
                <span className="info-value">{lk.phone || '—'}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Карта:</span>
                <span className="info-value">{lk.card || '—'}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Статус:</span>
                <span className="info-value status-badge" style={getStatusStyle(lk.status)}>
                  {getStatusLabel(lk.status)}
                </span>
              </div>
              <div className="info-item">
                <span className="info-label">от кого:</span>
                <span className="info-value">{lk.manager || '—'}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Банк:</span>
                <span className="info-value">{lk.bank || '—'}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Оборот за квартал:</span>
                <span className="info-value">
                  {lk.turnover ? new Intl.NumberFormat('ru-RU').format(lk.turnover) : '—'}
                </span>
              </div>
              {lk.extra && (
                <div className="info-item full-width">
                  <span className="info-label">Примечания:</span>
                  <span className="info-value">{lk.extra}</span>
                </div>
              )}
            </div>
          </div>

          {/* Запрос банкира */}
          {request && (
            <div className="info-section">
              <h3>Запрос банкира</h3>
              {request.status === 'pending' && !isBanker && (
                <div className="banker-request-pending">
                  <p className="request-message">
                    Банкир <strong>{request.banker}</strong> запросил поднять реквизит с отдыха
                  </p>
                  <p className="request-date">Дата запроса: {formatDate(request.date)}</p>
                  <div className="request-actions">
                    <button className="btn-approve" onClick={handleApprove}>
                      Подтвердить (статус → актив)
                    </button>
                    <button className="btn-reject" onClick={() => setShowRejectForm(true)}>
                      Отклонить
                    </button>
                  </div>
                  {showRejectForm && (
                    <div className="reject-form">
                      <textarea
                        placeholder="Укажите причину отклонения..."
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        rows="3"
                      />
                      <div className="reject-form-actions">
                        <button onClick={() => setShowRejectForm(false)}>Отмена</button>
                        <button onClick={handleReject} className="btn-confirm-reject">
                          Отправить
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {request.status === 'approved' && (
                <div className="banker-request-approved">
                  <p>✓ Запрос подтвержден</p>
                  <p className="request-date">Дата: {formatDate(request.approvedDate)}</p>
                </div>
              )}
              {request.status === 'rejected' && (
                <div className="banker-request-rejected">
                  <p>✗ Запрос отклонен</p>
                  <p className="request-date">Дата: {formatDate(request.rejectedDate)}</p>
                  {request.rejectionReason && (
                    <div className="rejection-reason">
                      <strong>Причина отклонения:</strong> {request.rejectionReason}
                    </div>
                  )}
                </div>
              )}
              {isBanker && request.status === 'pending' && (
                <div className="banker-request-info">
                  <p>⏳ Ожидает подтверждения пользователя</p>
                  <p className="request-date">Дата запроса: {formatDate(request.date)}</p>
                </div>
              )}
            </div>
          )}

          {/* Кнопка банкира */}
          {canRequestRest && !request && (
            <div className="info-section">
              <button className="btn-banker-request" onClick={handleRequestActivate}>
                Поднять реквизит с отдыха
              </button>
            </div>
          )}
          {canRequestRest && request?.status === 're_raise_pending' && (
            <div className="info-section">
              <div className="banker-request-info">
                <p>⏳ Ожидает одобрения админа для повторного запроса</p>
                <p className="request-date">Ранее поднимали: {formatDate(request.previousRaisedDate)}</p>
              </div>
            </div>
          )}

          {/* История изменений статусов */}
          {history.length > 0 && (
            <div className="info-section">
              <h3>История изменений статусов</h3>
              <div className="history-list">
                {history.map((entry, idx) => (
                  <div key={idx} className="history-item">
                    <div className="history-status-change">
                      <span className="history-from" style={getStatusStyle(entry.from)}>
                        {getStatusLabel(entry.from) || '—'}
                      </span>
                      <span className="history-arrow">→</span>
                      <span className="history-to" style={getStatusStyle(entry.to)}>
                        {getStatusLabel(entry.to)}
                      </span>
                    </div>
                    <div className="history-meta">
                      <span className="history-date">{formatDate(entry.date)}</span>
                      <span className="history-author">
                        {entry.changedBy === 'banker' ? 'Банкир' : 
                         entry.changedBy === 'banker_approved' ? 'Банкир (подтверждено)' :
                         'Пользователь'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {showReRaiseModal && (
        <ReRaiseModal
          isOpen={showReRaiseModal}
          onClose={() => setShowReRaiseModal(false)}
          previousRaisedDate={raisedDate}
          onRequest={handleReRaiseRequest}
        />
      )}
    </div>
  )
}

export default InfoLKModal
