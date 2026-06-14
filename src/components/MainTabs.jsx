import React, { useState, useMemo } from 'react'
import DataTable from './DataTable'
import SoonToRestTab from './SoonToRestTab'
import RaiseRequestsTab from './RaiseRequestsTab'
import OperatorRequestsTab from './OperatorRequestsTab'
import MyOperatorRequestsTab from './MyOperatorRequestsTab'
import BlockReasonRequestsTab from './BlockReasonRequestsTab'
import SectionSelector from './SectionSelector'
import StatusSettingsModal from './StatusSettingsModal'
import InfoLKModal from './InfoLKModal'
import { useData } from '../contexts/DataContext'
import { useAuth } from '../contexts/AuthContext'
import './MainTabs.css'

const MainTabs = ({ showRefresh = true, showStatusSettings = true, showSectionManage = false }) => {
  const { user, canBanker, canOperator, canEditSection } = useAuth()
  const { rows, bankerRequests, operatorRequests, blockReasonRequests, SOON_TO_REST_THRESHOLD, statusOptions, activeSectionId } = useData()
  const canEditCurrent = canEditSection(activeSectionId)

  const operatorUsername = user?.username || ''
  const [activeTab, setActiveTab] = useState('lk')
  const [statusSubTab, setStatusSubTab] = useState('')
  const [showStatusModal, setShowStatusModal] = useState(false)
  const [infoLK, setInfoLK] = useState(null)

  const counts = useMemo(() => {
    const total = rows.length
    const soonCount = rows.filter((r) => (r.turnover || 0) >= SOON_TO_REST_THRESHOLD).length
    const raiseCount = Object.values(bankerRequests).filter(
      (r) => r?.status === 'pending' || r?.status === 're_raise_pending'
    ).length
    const operatorCount = Object.values(operatorRequests || {}).filter((r) => r?.status === 'pending').length
    const blockReasonCount = Object.values(blockReasonRequests || {}).filter((r) => r?.status === 'pending').length
    const myOperatorCount = Object.values(operatorRequests || {}).filter(
      (r) => r?.status === 'pending' && r?.operator === operatorUsername
    ).length
    const stopCount = rows.filter((r) => r.onStop).length
    const waitCount = rows.filter((r) => r.inWaitlist).length
    const byStatus = {}
    statusOptions.forEach((s) => {
      byStatus[s] = rows.filter((r) => (r.status || '').toLowerCase() === s.toLowerCase()).length
    })
    return { total, soonCount, raiseCount, operatorCount, myOperatorCount, stopCount, waitCount, blockReasonCount, byStatus }
  }, [rows, bankerRequests, operatorRequests, blockReasonRequests, SOON_TO_REST_THRESHOLD, statusOptions, operatorUsername])

  return (
    <div className="main-tabs">
      <SectionSelector showManage={showSectionManage} />
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
          {canOperator && !canBanker && (
            <button
              className={`tab-btn ${activeTab === 'my-requests' ? 'active' : ''}`}
              onClick={() => setActiveTab('my-requests')}
            >
              Мои запросы <span className="tab-count">({counts.myOperatorCount})</span>
            </button>
          )}
          {canBanker && (
            <button
              className={`tab-btn ${activeTab === 'operator' ? 'active' : ''}`}
              onClick={() => setActiveTab('operator')}
            >
              Запросы операторов <span className="tab-count">({counts.operatorCount})</span>
            </button>
          )}
          {canBanker && (
            <button
              className={`tab-btn ${activeTab === 'blocks' ? 'active' : ''}`}
              onClick={() => setActiveTab('blocks')}
            >
              Блок/Заява <span className="tab-count">({counts.blockReasonCount})</span>
            </button>
          )}
          {canBanker && (
            <button
              className={`tab-btn ${activeTab === 'stop' ? 'active' : ''}`}
              onClick={() => setActiveTab('stop')}
            >
              На стопе <span className="tab-count">({counts.stopCount})</span>
            </button>
          )}
          {canBanker && (
            <button
              className={`tab-btn ${activeTab === 'wait' ? 'active' : ''}`}
              onClick={() => setActiveTab('wait')}
            >
              В вайте <span className="tab-count">({counts.waitCount})</span>
            </button>
          )}
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
            showRefresh={showRefresh}
            initialStatusFilter={statusSubTab}
            onRowClick={setInfoLK}
            canEdit={canEditCurrent}
          />
        </div>
      )}
      {activeTab === 'soon' && (
        <div className="tab-panel">
          <SoonToRestTab showRefresh={showRefresh} />
        </div>
      )}
      {activeTab === 'raise' && (
        <div className="tab-panel">
          <RaiseRequestsTab />
        </div>
      )}
      {activeTab === 'my-requests' && canOperator && !canBanker && (
        <div className="tab-panel">
          <MyOperatorRequestsTab />
        </div>
      )}
      {activeTab === 'operator' && canBanker && (
        <div className="tab-panel">
          <OperatorRequestsTab />
        </div>
      )}
      {activeTab === 'blocks' && canBanker && (
        <div className="tab-panel">
          <BlockReasonRequestsTab />
        </div>
      )}
      {activeTab === 'stop' && canBanker && (
        <div className="tab-panel">
          <DataTable showRefresh={showRefresh} rowsOverride={rows.filter((r) => r.onStop)} canEdit={canEditCurrent} />
        </div>
      )}
      {activeTab === 'wait' && canBanker && (
        <div className="tab-panel">
          <DataTable showRefresh={showRefresh} rowsOverride={rows.filter((r) => r.inWaitlist)} canEdit={canEditCurrent} />
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
