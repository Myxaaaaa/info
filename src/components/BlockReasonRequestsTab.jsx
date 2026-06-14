import React, { useState } from 'react'
import { useData } from '../contexts/DataContext'
import InfoLKModal from './InfoLKModal'
import './BlockReasonRequestsTab.css'

const BlockReasonRequestsTab = () => {
  const { rows, blockReasonRequests } = useData()
  const [infoLK, setInfoLK] = useState(null)

  const pending = Object.entries(blockReasonRequests || {})
    .filter(([, r]) => r?.status === 'pending')
    .map(([id, r]) => ({ id: parseInt(id, 10), ...r }))

  const formatDate = (d) =>
    new Date(d).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })

  return (
    <div className="block-reason-tab">
      <div className="block-reason-header">
        <h2>Блок / Заява — уточнение причины</h2>
        <p>Ожидают ответа банкира: {pending.length}</p>
      </div>
      {pending.length === 0 ? (
        <p className="block-reason-empty">Нет активных запросов</p>
      ) : (
        <div className="block-reason-list">
          {pending.map((req) => {
            const lk = rows.find((r) => r.id === req.id)
            if (!lk) return null
            return (
              <button
                key={req.id}
                type="button"
                className="block-reason-item"
                onClick={() => setInfoLK(lk)}
              >
                <span className="block-reason-name">{lk.name || '—'}</span>
                <span className="block-reason-status">{req.blockStatus}</span>
                <span className="block-reason-meta">
                  {req.changedBy} · {formatDate(req.date)}
                </span>
              </button>
            )
          })}
        </div>
      )}
      {infoLK && (
        <InfoLKModal lk={infoLK} isOpen={!!infoLK} onClose={() => setInfoLK(null)} />
      )}
    </div>
  )
}

export default BlockReasonRequestsTab
