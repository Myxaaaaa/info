import React, { useState } from 'react'
import { useData } from '../contexts/DataContext'
import { useAuth } from '../contexts/AuthContext'
import { useStatusSettings } from '../contexts/StatusSettingsContext'
import { isBlockStatus } from '../utils/statusUtils.js'
import ReRaiseModal from './ReRaiseModal'
import './InfoLKModal.css'

const InfoLKModal = ({ lk, isOpen, onClose }) => {
  const {
    getLKHistory,
    getBankerRequest,
    getOperatorRequest,
    requestActivateFromRest,
    requestReRaiseFromRest,
    approveBankerRequest,
    rejectBankerRequest,
    getRaisedFromRestDate,
    isRestStatus,
    setLKStop,
    setLKWaitlist,
    requestOperatorAction,
    respondOperatorRequest,
    getBlockReasonRequest,
    respondBlockReasonRequest,
  } = useData()
  const { user, canBanker, canOperator } = useAuth()
  const { getStatusStyle, getStatusLabel } = useStatusSettings()
  const [showRejectForm, setShowRejectForm] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [showReRaiseModal, setShowReRaiseModal] = useState(false)
  const [opNeedsWaitlist, setOpNeedsWaitlist] = useState(false)
  const [opNeedsUnblock, setOpNeedsUnblock] = useState(false)
  const [opNeedsFace, setOpNeedsFace] = useState(false)
  const [opStuckAmount, setOpStuckAmount] = useState('')
  const [opNote, setOpNote] = useState('')
  const [bankerRejectReason, setBankerRejectReason] = useState('')
  const [bankerWaitlistYes, setBankerWaitlistYes] = useState(true)
  const [bankerUnblockYes, setBankerUnblockYes] = useState(true)
  const [bankerFaceYes, setBankerFaceYes] = useState(true)
  const [blockReason, setBlockReason] = useState('')
  const [loading, setLoading] = useState(false)

  if (!isOpen || !lk) return null

  const history = getLKHistory(lk.id)
  const request = getBankerRequest(lk.id)
  const opRequest = getOperatorRequest(lk.id)
  const blockRequest = getBlockReasonRequest(lk.id)
  const raisedDate = getRaisedFromRestDate(lk.id)
  const canRequestRest = canBanker && isRestStatus(lk.status)
  const isBlocked = isBlockStatus(lk.status)
  const showOperatorForm = canOperator && !canBanker && (!opRequest || opRequest.status !== 'pending')

  const formatDate = (dateString) => {
    const date = new Date(dateString)
    return date.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const bankerName = user?.username || 'banker'
  const operatorName = user?.username || 'operator'

  const handleRequestActivate = () => {
    if (raisedDate) {
      setShowReRaiseModal(true)
      return
    }
    const result = requestActivateFromRest(lk.id, bankerName)
    if (result.success) onClose()
    else if (result.error) alert(result.error)
  }

  const handleReRaiseRequest = () => {
    const result = requestReRaiseFromRest(lk.id, bankerName)
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
    onClose()
  }

  const handleToggleStop = async () => {
    setLoading(true)
    const result = await setLKStop(lk.id, !lk.onStop, bankerName)
    setLoading(false)
    if (!result.success) alert(result.error)
  }

  const handleToggleWaitlist = async () => {
    setLoading(true)
    const result = await setLKWaitlist(lk.id, !lk.inWaitlist, bankerName)
    setLoading(false)
    if (!result.success) alert(result.error)
  }

  const handleOperatorRequest = async () => {
    setLoading(true)
    const result = await requestOperatorAction(lk.id, operatorName, {
      needsWaitlist: opNeedsWaitlist,
      needsUnblock: opNeedsUnblock,
      needsFace: opNeedsFace,
      stuckAmount: opStuckAmount,
      note: opNote,
    })
    setLoading(false)
    if (result.success) {
      alert('Запрос отправлен банкиру')
      onClose()
    } else {
      alert(result.error || 'Ошибка')
    }
  }

  const handleBankerRespond = async () => {
    const denied =
      (opRequest?.needsWaitlist && !bankerWaitlistYes) ||
      (opRequest?.needsUnblock && !bankerUnblockYes) ||
      (opRequest?.needsFace && !bankerFaceYes)
    if (denied && !bankerRejectReason.trim()) {
      alert('Укажите причину отказа')
      return
    }
    setLoading(true)
    const result = await respondOperatorRequest(lk.id, bankerName, {
      waitlistApproved: bankerWaitlistYes,
      unblockApproved: bankerUnblockYes,
      faceApproved: bankerFaceYes,
      rejectionReason: bankerRejectReason,
    })
    setLoading(false)
    if (result.success) {
      alert('Ответ отправлен')
      onClose()
    } else {
      alert(result.error || 'Ошибка')
    }
  }

  const handleBlockReasonClarify = async () => {
    if (!blockReason.trim()) {
      alert('Укажите причину блока')
      return
    }
    setLoading(true)
    const result = await respondBlockReasonRequest(lk.id, bankerName, {
      action: 'clarify',
      reason: blockReason,
    })
    setLoading(false)
    if (result.success) {
      alert('Причина отправлена в Telegram')
      onClose()
    } else {
      alert(result.error || 'Ошибка')
    }
  }

  const handleBlockUnblock = async () => {
    setLoading(true)
    const result = await respondBlockReasonRequest(lk.id, bankerName, { action: 'unblock' })
    setLoading(false)
    if (result.success) {
      alert('Разблокировано, уведомление отправлено')
      onClose()
    } else {
      alert(result.error || 'Ошибка')
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content info-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>
            Информация о ЛК
            {lk.name && <span className="modal-subtitle">&nbsp;· {lk.name}</span>}
          </h2>
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
              {(lk.onStop || lk.inWaitlist) && (
                <div className="info-item full-width">
                  <span className="info-label">Метки:</span>
                  <span className="info-value">
                    {lk.onStop && <span className="lk-flag lk-flag-stop">🛑 СТОП</span>}
                    {lk.inWaitlist && <span className="lk-flag lk-flag-wait">📋 В ВАЙТЕ</span>}
                    {!lk.inWaitlist && canBanker && <span className="lk-flag lk-flag-nowait">❌ Не в вайте</span>}
                  </span>
                </div>
              )}
              {lk.extra && (
                <div className="info-item full-width">
                  <span className="info-label">Примечания:</span>
                  <span className="info-value">{lk.extra}</span>
                </div>
              )}
            </div>
          </div>

          {/* Банкир: стоп и вайт */}
          {canBanker && (
            <div className="info-section banker-actions-section">
              <h3>Действия банкира</h3>
              <div className="banker-toggle-row">
                <button
                  type="button"
                  className={`btn-banker-toggle ${lk.onStop ? 'active-stop' : ''}`}
                  onClick={handleToggleStop}
                  disabled={loading}
                >
                  {lk.onStop ? '🛑 На стопе — снять' : '🛑 Поставить на стоп'}
                </button>
                <button
                  type="button"
                  className={`btn-banker-toggle ${lk.inWaitlist ? 'active-wait' : ''}`}
                  onClick={handleToggleWaitlist}
                  disabled={loading}
                >
                  {lk.inWaitlist ? '📋 В вайте — убрать' : '📋 Отметить в вайте'}
                </button>
              </div>
            </div>
          )}

          {/* Оператор: запрос банкиру */}
          {showOperatorForm && (
            <div className="info-section">
              <h3>Запрос банкиру</h3>
              <p className="section-hint">Вайт или разблок — банкир подтвердит, в Telegram придёт сразу</p>
              <div className="operator-checkboxes">
                {!lk.inWaitlist && (
                  <label>
                    <input type="checkbox" checked={opNeedsWaitlist} onChange={(e) => setOpNeedsWaitlist(e.target.checked)} />
                    📋 В вайт
                  </label>
                )}
                {isBlocked && (
                  <label>
                    <input type="checkbox" checked={opNeedsUnblock} onChange={(e) => setOpNeedsUnblock(e.target.checked)} />
                    🔓 На разблок
                  </label>
                )}
                <label>
                  <input type="checkbox" checked={opNeedsFace} onChange={(e) => setOpNeedsFace(e.target.checked)} />
                  👤 Снять Face ID
                </label>
              </div>
              <div className="form-group">
                <label>Сумма застряла</label>
                <input
                  type="text"
                  value={opStuckAmount}
                  onChange={(e) => setOpStuckAmount(e.target.value)}
                  placeholder="Например: 15000"
                />
              </div>
              <div className="form-group">
                <label>Комментарий</label>
                <textarea
                  value={opNote}
                  onChange={(e) => setOpNote(e.target.value)}
                  rows={2}
                  placeholder="Доп. информация..."
                />
              </div>
              <button className="btn-banker-request" onClick={handleOperatorRequest} disabled={loading}>
                Отправить запрос банкиру
              </button>
            </div>
          )}

          {/* Банкир: уточнение причины блок/заява */}
          {canBanker && blockRequest?.status === 'pending' && (
            <div className="info-section operator-response-section">
              <h3>Блок / Заява — уточнить</h3>
              <p className="request-message">
                Статус <strong>{blockRequest.blockStatus}</strong> поставил <strong>{blockRequest.changedBy}</strong>
              </p>
              <p className="request-date">{formatDate(blockRequest.date)}</p>
              <div className="form-group">
                <label>Причина блока</label>
                <textarea
                  value={blockReason}
                  onChange={(e) => setBlockReason(e.target.value)}
                  rows={3}
                  placeholder="Укажите причину — уйдёт в Telegram..."
                />
              </div>
              <div className="request-actions">
                <button className="btn-approve" onClick={handleBlockReasonClarify} disabled={loading}>
                  Отправить причину
                </button>
                <button className="btn-banker-request" onClick={handleBlockUnblock} disabled={loading}>
                  🔓 Сразу разблокировать
                </button>
              </div>
            </div>
          )}

          {blockRequest?.status === 'resolved' && (
            <div className="info-section">
              <h3>Блок / Заява — решено</h3>
              <p>Банкир: {blockRequest.banker || '—'}</p>
              <p>{blockRequest.action === 'unblocked' ? '✅ Разблокирован' : `Причина: ${blockRequest.reason || '—'}`}</p>
              <p className="request-date">{formatDate(blockRequest.resolvedDate)}</p>
            </div>
          )}

          {/* Банкир: ответ на запрос оператора */}
          {canBanker && opRequest?.status === 'pending' && (
            <div className="info-section operator-response-section">
              <h3>Запрос оператора</h3>
              <p className="request-message">
                Оператор <strong>{opRequest.operator}</strong> запросил:
                {opRequest.needsWaitlist && ' 📋 Вайт'}
                {opRequest.needsUnblock && ' 🔓 Разблок'}
                {opRequest.needsFace && ' 👤 Face ID'}
              </p>
              {opRequest.stuckAmount && <p>💰 Застряло: <strong>{opRequest.stuckAmount}</strong></p>}
              {opRequest.note && <p>📝 {opRequest.note}</p>}
              <p className="request-date">{formatDate(opRequest.date)}</p>

              {opRequest.needsWaitlist && (
                <div className="banker-response-row">
                  <span>В вайт:</span>
                  <label><input type="radio" checked={bankerWaitlistYes} onChange={() => setBankerWaitlistYes(true)} /> Да</label>
                  <label><input type="radio" checked={!bankerWaitlistYes} onChange={() => setBankerWaitlistYes(false)} /> Нет</label>
                </div>
              )}
              {opRequest.needsUnblock && (
                <div className="banker-response-row">
                  <span>Разблок:</span>
                  <label><input type="radio" checked={bankerUnblockYes} onChange={() => setBankerUnblockYes(true)} /> Да</label>
                  <label><input type="radio" checked={!bankerUnblockYes} onChange={() => setBankerUnblockYes(false)} /> Нет</label>
                </div>
              )}
              {opRequest.needsFace && (
                <div className="banker-response-row">
                  <span>Face ID:</span>
                  <label><input type="radio" checked={bankerFaceYes} onChange={() => setBankerFaceYes(true)} /> Снять</label>
                  <label><input type="radio" checked={!bankerFaceYes} onChange={() => setBankerFaceYes(false)} /> Нет</label>
                </div>
              )}
              <div className="form-group">
                <label>Причина отказа (если отказ)</label>
                <textarea
                  value={bankerRejectReason}
                  onChange={(e) => setBankerRejectReason(e.target.value)}
                  rows={2}
                  placeholder="Укажите причину..."
                />
              </div>
              <button className="btn-approve" onClick={handleBankerRespond} disabled={loading}>
                Отправить ответ
              </button>
            </div>
          )}

          {/* Статус запроса оператора */}
          {opRequest?.status === 'resolved' && (
            <div className="info-section">
              <h3>Запрос оператора — решён</h3>
              <p>Банкир: {opRequest.banker || '—'}</p>
              {opRequest.needsWaitlist && <p>Вайт: {opRequest.waitlistApproved ? '✅ Да' : '❌ Нет'}</p>}
              {opRequest.needsUnblock && <p>Разблок: {opRequest.unblockApproved ? '✅ Да' : '❌ Нет'}</p>}
              {opRequest.needsFace && <p>Face ID: {opRequest.faceApproved ? '✅ Снят' : '❌ Нет'}</p>}
              {opRequest.rejectionReason && <p>Причина: {opRequest.rejectionReason}</p>}
              <p className="request-date">{formatDate(opRequest.resolvedDate)}</p>
            </div>
          )}

          {opRequest?.status === 'pending' && canOperator && !canBanker && (
            <div className="info-section">
              <div className="banker-request-info">
                <p>⏳ Ожидает ответа банкира</p>
              </div>
            </div>
          )}

          {/* Запрос банкира (поднять с отдыха) */}
          {request && (
            <div className="info-section">
              <h3>Запрос банкира</h3>
              {request.status === 'pending' && canOperator && (
                <div className="banker-request-pending">
                  <p className="request-message">
                    Банкир <strong>{request.banker}</strong> запросил поднять реквизит с отдыха
                  </p>
                  <p className="request-date">Дата запроса: {formatDate(request.date)}</p>
                  <div className="request-actions">
                    <button className="btn-approve" onClick={handleApprove}>Подтвердить (статус → актив)</button>
                    <button className="btn-reject" onClick={() => setShowRejectForm(true)}>Отклонить</button>
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
                        <button onClick={handleReject} className="btn-confirm-reject">Отправить</button>
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
                  {request.rejectionReason && <p><strong>Причина:</strong> {request.rejectionReason}</p>}
                </div>
              )}
              {canBanker && !canOperator && request.status === 'pending' && (
                <div className="banker-request-info">
                  <p>⏳ Ожидает подтверждения оператора</p>
                </div>
              )}
            </div>
          )}

          {canRequestRest && !request && (
            <div className="info-section">
              <button className="btn-banker-request" onClick={handleRequestActivate}>
                Поднять реквизит с отдыха
              </button>
            </div>
          )}

          {history.length > 0 && (
            <div className="info-section">
              <h3>История изменений статусов</h3>
              <div className="history-list">
                {history.map((entry, idx) => (
                  <div key={idx} className="history-item">
                    <div className="history-status-change">
                      <span className="history-from" style={getStatusStyle(entry.from)}>{getStatusLabel(entry.from) || '—'}</span>
                      <span className="history-arrow">→</span>
                      <span className="history-to" style={getStatusStyle(entry.to)}>{getStatusLabel(entry.to)}</span>
                    </div>
                    <div className="history-meta">
                      <span className="history-date">{formatDate(entry.date)}</span>
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
