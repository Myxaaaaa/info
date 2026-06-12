import React from 'react'
import { useData } from '../contexts/DataContext'
import DataTable from './DataTable'
import './SoonToRestTab.css'

const SoonToRestTab = () => {
  const { rows, SOON_TO_REST_THRESHOLD } = useData()

  const soonToRestRows = rows.filter((r) => (r.turnover || 0) >= SOON_TO_REST_THRESHOLD)

  return (
    <div className="soon-to-rest-tab">
      <div className="soon-to-rest-header">
        <h3>Скоро на отдых</h3>
        <p>ЛК с оборотом за квартал ≥ {new Intl.NumberFormat('ru-RU').format(SOON_TO_REST_THRESHOLD)}</p>
      </div>
      <DataTable
        showRefresh={false}
        rowsOverride={soonToRestRows}
        blinkYellow
        showSendToRestButton
      />
    </div>
  )
}

export default SoonToRestTab
