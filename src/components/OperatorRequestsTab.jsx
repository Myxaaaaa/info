import React from 'react'
import { useData } from '../contexts/DataContext'
import InfoLKModal from './InfoLKModal'
import './RaiseRequestsTab.css'

const OperatorRequestsTab = () => {
  const { rows, operatorRequests } = useData()
  const [infoLK, setInfoLK] = React.useState(null)

  const pendingList = Object.entries(operatorRequests || {})
    .filter(([, r]) => r?.status === 'pending')
    .map(([id, r]) => {
      const row = rows.find((x) => x.id === parseInt(id, 10))
      return { id: parseInt(id, 10), row, request: r }
    })

  const formatDate = (d) => {
    if (!d) return '—'
    return new Date(d).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="raise-requests-tab">
      <div className="raise-requests-header">
        <h3>Запросы операторов</h3>
        <p>Вайт и разблок — ожидают ответа банкира</p>
      </div>
      {pendingList.length === 0 ? (
        <div className="raise-requests-empty">Нет активных запросов</div>
      ) : (
        <ul className="raise-requests-list">
          {pendingList.map(({ id, row, request }) => (
            <li key={id} className="raise-request-item">
              <div className="raise-request-main">
                <span className="raise-request-lk">
                  {row ? row.name || row.card || `#${id}` : `ЛК #${id}`}
                </span>
                <span className="raise-request-banker">Оператор: {request.operator}</span>
                <span className="raise-request-date">{formatDate(request.date)}</span>
                <span className="raise-request-badge">
                  {request.needsWaitlist && '📋 Вайт '}
                  {request.needsUnblock && '🔓 Разблок '}
                  {request.needsFace && '👤 Face '}
                  {request.stuckAmount && `💰 ${request.stuckAmount}`}
                </span>
              </div>
              <button
                type="button"
                className="raise-request-btn"
                onClick={() => row && setInfoLK(row)}
              >
                Ответить
              </button>
            </li>
          ))}
        </ul>
      )}

      {infoLK && (
        <InfoLKModal lk={infoLK} isOpen={!!infoLK} onClose={() => setInfoLK(null)} />
      )}
    </div>
  )
}

export default OperatorRequestsTab
