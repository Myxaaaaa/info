import React, { useState, useMemo } from 'react'
import DataTable from './DataTable'
import SoonToRestTab from './SoonToRestTab'
import RaiseRequestsTab from './RaiseRequestsTab'
import StatusSettingsModal from './StatusSettingsModal'
import InfoLKModal from './InfoLKModal'
import { useData } from '../contexts/DataContext'
import './MainTabs.css'

const MainTabs = ({ canEdit, showRefresh, showStatusSettings, isAdmin = false }) => {
  const [activeTab, setActiveTab] = useState('lk')
  const [statusSubTab, setStatusSubTab] = useState('')
  const [showStatusModal, setShowStatusModal] = useState(false)
  const [infoLK, setInfoLK] = useState(null)
  const { rows, bankerRequests, SOON_TO_REST_THRESHOLD, statusOptions } = useData()

  const counts = useMemo(() => {
    const total = rows.length
    const soonCount = rows.filter((r) => (r.turnover || 0) >= SOON_TO_REST_THRESHOLD).length
    const raiseCount = Object.values(bankerRequests).filter(
      (r) => r?.status === 'pending' || r?.status === 're_raise_pending'
    ).length
    const byStatus = {}
    statusOptions.forEach((s) => {
      byStatus[s] = rows.filter((r) => (r.status || '').toLowerCase() === s.toLowerCase()).length
    })
    return { total, soonCount, raiseCount, byStatus }
  }, [rows, bankerRequests, SOON_TO_REST_THRESHOLD, statusOptions])

  return (
    <div className="main-tabs">
      <div className="tabs-header">
        <div className="tabs-nav">
          <button
            className={`tab-btn ${activeTab === 'lk' ? 'active' : ''}`}
            onClick={() => setActiveTab('lk')}
          >
            Список ЛК <span className="tab-count">({counts.total})</span>
          </button>
          <button
            className={`tab-btn ${activeTab === 'soon' ? 'active' : ''}`}
            onClick={() => setActiveTab('soon')}
          >
            Скоро на отдых <span className="tab-count">({counts.soonCount})</span>
          </button>
          <button
            className={`tab-btn ${activeTab === 'raise' ? 'active' : ''}`}
            onClick={() => setActiveTab('raise')}
          >
            Поднять с отдыха <span className="tab-count">({counts.raiseCount})</span>
          </button>
        </div>
        {showStatusSettings && (
          <button className="settings-tab-btn" onClick={() => setShowStatusModal(true)}>
            ⚙ Настройки статусов
          </button>
        )}
      </div>

      {activeTab === 'lk' && (
        <div className="tab-panel">
          <div className="status-sub-tabs">
            <button
              className={`status-sub-btn ${statusSubTab === '' ? 'active' : ''}`}
              onClick={() => setStatusSubTab('')}
            >
              Все <span className="tab-count">({counts.total})</span>
            </button>
            {statusOptions.map((s) => (
              <button
                key={s}
                className={`status-sub-btn ${statusSubTab === s ? 'active' : ''}`}
                onClick={() => setStatusSubTab(s)}
              >
                {s} <span className="tab-count">({counts.byStatus[s] ?? 0})</span>
              </button>
            ))}
          </div>
          <DataTable
            canEdit={canEdit}
            showRefresh={showRefresh}
            initialStatusFilter={statusSubTab}
            onRowClick={isAdmin ? setInfoLK : undefined}
          />
        </div>
      )}
      {activeTab === 'soon' && (
        <div className="tab-panel">
          <SoonToRestTab canEdit={canEdit} showRefresh={showRefresh} />
        </div>
      )}
      {activeTab === 'raise' && (
        <div className="tab-panel">
          <RaiseRequestsTab />
        </div>
      )}

      {showStatusModal && (
        <StatusSettingsModal isOpen={showStatusModal} onClose={() => setShowStatusModal(false)} />
      )}

      {infoLK && (
        <InfoLKModal lk={infoLK} isOpen={!!infoLK} onClose={() => setInfoLK(null)} />
      )}
    </div>
  )
}

export default MainTabs
