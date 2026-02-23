import React, { useState, useMemo } from 'react'
import { useData } from '../contexts/DataContext'
import { useAuth } from '../contexts/AuthContext'
import { useStatusSettings } from '../contexts/StatusSettingsContext'
import EditLKModal from './EditLKModal'
import InfoLKModal from './InfoLKModal'
import './DataTable.css'

const DataTable = ({ canEdit = false, showRefresh = false, rowsOverride = null, blinkYellow = false, showSendToRestButton = false, onRowClick = null, initialStatusFilter = null }) => {
  const { rows: contextRows, updateStatus, updateTurnover, bulkDelete, bulkUpdateStatus, refreshFromJson, statusOptions, getBankerRequest, requestActivateFromRest, requestReRaiseFromRest, getRaisedFromRestDate, isRestStatus } = useData()
  const rows = rowsOverride ?? contextRows
  const { user, isBanker } = useAuth()
  const { getStatusStyle, getStatusLabel } = useStatusSettings()
  const [filter, setFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const effectiveStatusFilter = initialStatusFilter !== undefined && initialStatusFilter !== null ? initialStatusFilter : statusFilter
  const [loading, setLoading] = useState(false)
  const [refreshMsg, setRefreshMsg] = useState(null)
  const [editingLK, setEditingLK] = useState(null)
  const [infoLK, setInfoLK] = useState(null)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [bulkStatus, setBulkStatus] = useState('')
  const [showBulkStatusModal, setShowBulkStatusModal] = useState(false)

  const filteredRows = useMemo(() => {
    let list = rows
    if (filter.trim()) {
      const q = filter.toLowerCase()
      list = list.filter(
        (r) =>
          (r.name || '').toLowerCase().includes(q) ||
          (r.phone || '').toLowerCase().includes(q) ||
          (r.card || '').toLowerCase().includes(q) ||
          (r.manager || '').toLowerCase().includes(q) ||
          (r.extra || '').toLowerCase().includes(q)
      )
    }
    if (effectiveStatusFilter) {
      list = list.filter((r) => (r.status || '').toLowerCase() === effectiveStatusFilter.toLowerCase())
    }
    return list
  }, [rows, filter, effectiveStatusFilter])

  const handleRefresh = async () => {
    setLoading(true)
    setRefreshMsg(null)
    
    // Обновляем из JSON файла
    const jsonResult = refreshFromJson()
    setLoading(false)
    
    if (jsonResult.success) {
      setRefreshMsg(jsonResult.message || `Загружено ${jsonResult.count} записей из JSON`)
    } else {
      setRefreshMsg(jsonResult.error || 'Ошибка загрузки из JSON')
    }
    
    setTimeout(() => setRefreshMsg(null), 5000)
  }

  const uniqueStatuses = statusOptions
  const selectedArr = Array.from(selectedIds)

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredRows.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredRows.map((r) => r.id)))
    }
  }

  const handleBulkDelete = () => {
    if (!selectedArr.length) return
    if (confirm(`Удалить ${selectedArr.length} записей?`)) {
      bulkDelete(selectedArr)
      setSelectedIds(new Set())
    }
  }

  const handleBulkStatus = () => {
    if (!bulkStatus || !selectedArr.length) return
    bulkUpdateStatus(selectedArr, bulkStatus, user?.username || 'user')
    setShowBulkStatusModal(false)
    setBulkStatus('')
    setSelectedIds(new Set())
  }

  const handleBulkRaiseFromRest = () => {
    const restRows = selectedArr.filter((id) => {
      const row = rows.find((r) => r.id === id)
      return row && isRestStatus(row.status)
    })
    if (!restRows.length) {
      alert('Среди выбранных нет ЛК со статусом «отдых»')
      return
    }
    const bankerName = user?.username || 'banker'
    restRows.forEach((id) => {
      const raised = getRaisedFromRestDate(id)
      if (raised) {
        requestReRaiseFromRest(id, bankerName)
      } else {
        requestActivateFromRest(id, bankerName)
      }
    })
    setSelectedIds(new Set())
    alert(`Запросы отправлены для ${restRows.length} реквизитов`)
  }

  return (
    <div className={`data-table-wrapper ${blinkYellow ? 'blink-yellow' : ''}`}>
      <div className="data-table-controls">
        <input
          type="text"
          placeholder="Поиск по имени, телефону, карте..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="table-search"
        />
        {initialStatusFilter === undefined && (
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="table-status-filter"
          >
            <option value="">Все статусы</option>
            {uniqueStatuses.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        )}
        {canEdit && (
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="table-add-btn"
          >
            + Добавить ЛК
          </button>
        )}
        {showRefresh && (
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="table-refresh-btn"
          >
            {loading ? 'Загрузка...' : 'Обновить из JSON'}
          </button>
        )}
        {refreshMsg && <span className="refresh-msg">{refreshMsg}</span>}
      </div>

      {/* Bulk actions */}
      {selectedArr.length > 0 && canEdit && (
        <div className="bulk-actions">
          <span className="bulk-count">Выбрано: {selectedArr.length}</span>
          <button className="bulk-btn bulk-delete" onClick={handleBulkDelete}>Удалить</button>
          <button className="bulk-btn bulk-status" onClick={() => setShowBulkStatusModal(true)}>Поменять статус</button>
          {isBanker && (
            <button className="bulk-btn bulk-raise" onClick={handleBulkRaiseFromRest}>Поднять с отдыха</button>
          )}
          <button className="bulk-btn bulk-clear" onClick={() => setSelectedIds(new Set())}>Снять выбор</button>
        </div>
      )}

      {/* Bulk status modal */}
      {showBulkStatusModal && (
        <div className="modal-overlay" onClick={() => setShowBulkStatusModal(false)}>
          <div className="modal-content bulk-status-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Поменять статус ({selectedArr.length} записей)</h2>
              <button className="modal-close" onClick={() => setShowBulkStatusModal(false)}>×</button>
            </div>
            <div className="bulk-status-form">
              <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)}>
                <option value="">— Выберите статус —</option>
                {uniqueStatuses.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <div className="bulk-status-actions">
                <button onClick={() => setShowBulkStatusModal(false)}>Отмена</button>
                <button className="btn-primary" onClick={handleBulkStatus} disabled={!bulkStatus}>Применить</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Desktop/Tablet: table view */}
      <div className="table-scroll table-view">
        <table className="data-table">
          <thead>
            <tr>
              {canEdit && (
                <th className="col-checkbox">
                  <input
                    type="checkbox"
                    checked={filteredRows.length > 0 && selectedIds.size === filteredRows.length}
                    onChange={toggleSelectAll}
                    title="Выбрать все"
                  />
                </th>
              )}
              <th>#</th>
              <th>ФИО</th>
              <th>Телефон</th>
              <th>Карта</th>
              <th>Статус</th>
              <th>От кого</th>
              <th>Банк</th>
              <th>Оборот за квартал</th>
              <th>Остаток д/c</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row, idx) => (
              <tr
                key={row.id}
                className={row.status ? `status-${row.status.replace(/\s/g, '-')}` : ''}
                onClick={(e) => {
                  if (onRowClick && !e.target.closest('button, select, input')) onRowClick(row)
                }}
                role={onRowClick ? 'button' : undefined}
                style={onRowClick ? { cursor: 'pointer' } : undefined}
              >
                {canEdit && (
                  <td className="col-checkbox">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(row.id)}
                      onChange={() => toggleSelect(row.id)}
                    />
                  </td>
                )}
                <td>{idx + 1}</td>
                <td className="col-name">{row.name || '—'}</td>
                <td>{row.phone || '—'}</td>
                <td>{row.card || '—'}</td>
                <td>
                  {canEdit ? (
                    <select
                      value={row.status || ''}
                      onChange={(e) => updateStatus(row.id, e.target.value)}
                      className="status-select"
                    >
                      <option value="">—</option>
                      {uniqueStatuses.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="status-badge" style={getStatusStyle(row.status)}>
                      {getStatusLabel(row.status)}
                    </span>
                  )}
                </td>
                <td>{row.manager || '—'}</td>
                <td>{row.bank || '—'}</td>
                <td className="col-turnover">
                  <input
                    type="text"
                    className="turnover-input-inline"
                    placeholder="0"
                    value={row.turnover ? String(row.turnover) : ''}
                    onChange={(e) => updateTurnover(row.id, e.target.value)}
                  />
                </td>
                <td className="col-extra">{row.extra || '—'}</td>
                <td className="col-actions" onClick={(e) => e.stopPropagation()}>
                  <div className="action-buttons">
                    {showSendToRestButton && (
                      <button
                        type="button"
                        className="btn-send-rest"
                        onClick={() => updateStatus(row.id, 'отдых')}
                        title="Отправили на отдых"
                      >
                        На отдых
                      </button>
                    )}
                    <button
                      className="btn-info"
                      onClick={() => setInfoLK(row)}
                      title="Информация"
                    >
                      ℹ
                    </button>
                    {canEdit && (
                      <button
                        className="btn-edit"
                        onClick={() => setEditingLK(row)}
                        title="Редактировать"
                      >
                        ✏
                      </button>
                    )}
                    {getBankerRequest(row.id)?.status === 'pending' && !isBanker && (
                      <span className="request-badge" title="Есть запрос от банкира">
                        🔔
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: card view */}
      <div className="table-cards card-view">
        {filteredRows.map((row, idx) => (
          <div
            key={row.id}
            className="data-card"
            onClick={() => onRowClick && onRowClick(row)}
            role={onRowClick ? 'button' : undefined}
            style={onRowClick ? { cursor: 'pointer' } : undefined}
          >
            <div className="data-card-header" onClick={(e) => e.stopPropagation()}>
              {canEdit && (
                <input
                  type="checkbox"
                  checked={selectedIds.has(row.id)}
                  onChange={() => toggleSelect(row.id)}
                  className="card-checkbox"
                />
              )}
              <span className="data-card-num">{idx + 1}</span>
              <span className="data-card-name">{row.name || '—'}</span>
              <div className="data-card-status">
                {canEdit ? (
                  <select
                    value={row.status || ''}
                    onChange={(e) => updateStatus(row.id, e.target.value)}
                    className="status-select"
                  >
                    <option value="">—</option>
                    {uniqueStatuses.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="status-badge" style={getStatusStyle(row.status)}>
                    {getStatusLabel(row.status)}
                  </span>
                )}
              </div>
            </div>
            <div className="data-card-body">
              <div className="data-card-row">
                <span className="data-card-label">Телефон</span>
                <span className="data-card-value">{row.phone || '—'}</span>
              </div>
              <div className="data-card-row">
                <span className="data-card-label">Карта</span>
                <span className="data-card-value">{row.card || '—'}</span>
              </div>
              <div className="data-card-row">
                <span className="data-card-label">От кого</span>
                <span className="data-card-value">{row.manager || '—'}</span>
              </div>
              <div className="data-card-row">
                <span className="data-card-label">Банк</span>
                <span className="data-card-value">{row.bank || '—'}</span>
              </div>
              <div className="data-card-row">
                <span className="data-card-label">Оборот за квартал</span>
                <input
                  type="text"
                  className="turnover-input-inline"
                  placeholder="0"
                  value={row.turnover ? String(row.turnover) : ''}
                  onChange={(e) => updateTurnover(row.id, e.target.value)}
                />
              </div>
              {row.extra && (
                <div className="data-card-row">
                  <span className="data-card-label">Остаток</span>
                  <span className="data-card-value">{row.extra}</span>
                </div>
              )}
            </div>
            <div className="data-card-actions" onClick={(e) => e.stopPropagation()}>
              {showSendToRestButton && (
                <button
                  type="button"
                  className="btn-send-rest"
                  onClick={() => updateStatus(row.id, 'отдых')}
                >
                  На отдых
                </button>
              )}
              <button
                className="btn-info"
                onClick={() => setInfoLK(row)}
                title="Информация"
              >
                ℹ Инфо
              </button>
              {canEdit && (
                <button
                  className="btn-edit"
                  onClick={() => setEditingLK(row)}
                  title="Редактировать"
                >
                  ✏ Изменить
                </button>
              )}
              {getBankerRequest(row.id)?.status === 'pending' && !isBanker && (
                <span className="request-badge" title="Есть запрос от банкира">
                  🔔
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="table-footer">
        Показано {filteredRows.length} из {rows.length}
      </div>

      {editingLK && (
        <EditLKModal
          lk={editingLK}
          isOpen={!!editingLK}
          onClose={() => setEditingLK(null)}
        />
      )}

      {isAddModalOpen && (
        <EditLKModal
          lk={null}
          isOpen={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
        />
      )}

      {infoLK && (
        <InfoLKModal
          lk={infoLK}
          isOpen={!!infoLK}
          onClose={() => setInfoLK(null)}
        />
      )}
    </div>
  )
}

export default DataTable
