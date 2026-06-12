import React from 'react'
import { useData } from '../contexts/DataContext'
import { useAuth } from '../contexts/AuthContext'
import InfoLKModal from './InfoLKModal'
import './RaiseRequestsTab.css'

function requestBadges(request) {
  const parts = []
  if (request.needsWaitlist) parts.push('📋 Вайт')
  if (request.needsStop) parts.push('🛑 Стоп')
  if (request.needsBlock) parts.push('🔒 Блок')
  if (request.needsUnblock) parts.push('🔓 Разблок')
  if (request.needsFace) parts.push('👤 Face')
  return parts.join(' · ') || '—'
}

const MyOperatorRequestsTab = () => {
  const { rows, operatorRequests } = useData()
  const { user } = useAuth()
  const [infoLK, setInfoLK] = React.useState(null)
  const operatorName = user?.username || ''

  const myRequests = Object.entries(operatorRequests || {})
    .map(([id, r]) => {
      const row = rows.find((x) => x.id === parseInt(id, 10))
      return { id: parseInt(id, 10), row, request: r }
    })
    .filter(({ request }) => request?.operator === operatorName)
    .sort((a, b) => new Date(b.request.date) - new Date(a.request.date))

  const pending = myRequests.filter(({ request }) => request.status === 'pending')
  const resolved = myRequests.filter(({ request }) => request.status === 'resolved')

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

  const renderItem = ({ id, row, request }, showStatus) => (
    <li key={`${id}-${request.date}`} className="raise-request-item">
      <div className="raise-request-main">
        <span className="raise-request-lk">
          {row ? row.name || row.card || `#${id}` : `ЛК #${id}`}
        </span>
        <span className="raise-request-date">{formatDate(request.date)}</span>
        <span className="raise-request-badge">{requestBadges(request)}</span>
        {request.stuckAmount && <span className="raise-request-badge">💰 {request.stuckAmount}</span>}
        {showStatus === 'pending' && <span className="raise-request-badge">⏳ Ожидает</span>}
        {showStatus === 'resolved' && (
          <span className="raise-request-badge">
            {request.banker ? `Банкир: ${request.banker}` : 'Решён'}
          </span>
        )}
      </div>
      {row && (
        <button type="button" className="raise-request-btn" onClick={() => setInfoLK(row)}>
          Открыть ЛК
        </button>
      )}
    </li>
  )

  return (
    <div className="raise-requests-tab">
      <div className="raise-requests-header">
        <h3>Мои запросы</h3>
        <p>Вайт, стоп, блок, разблок, Face ID — статус ответа банкира</p>
      </div>

      <h4 className="raise-subheading">Ожидают ответа ({pending.length})</h4>
      {pending.length === 0 ? (
        <div className="raise-requests-empty">Нет активных запросов</div>
      ) : (
        <ul className="raise-requests-list">{pending.map((item) => renderItem(item, 'pending'))}</ul>
      )}

      <h4 className="raise-subheading">История ({resolved.length})</h4>
      {resolved.length === 0 ? (
        <div className="raise-requests-empty">Пока пусто</div>
      ) : (
        <ul className="raise-requests-list">{resolved.slice(0, 30).map((item) => renderItem(item, 'resolved'))}</ul>
      )}

      {infoLK && (
        <InfoLKModal lk={infoLK} isOpen={!!infoLK} onClose={() => setInfoLK(null)} />
      )}
    </div>
  )
}

export default MyOperatorRequestsTab
