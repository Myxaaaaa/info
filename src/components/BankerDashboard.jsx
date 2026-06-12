import React from 'react'
import { useAuth } from '../contexts/AuthContext'
import DashboardHeader from './DashboardHeader'
import MainTabs from './MainTabs'
import './Dashboard.css'

const BankerDashboard = () => {
  const { user, logout } = useAuth()

  return (
    <div className="dashboard">
      <DashboardHeader title="Панель банкира" user={user} role="banker" onLogout={logout} />

      <main className="dashboard-content">
        <div className="welcome-section">
          <h2>Управление реквизитами</h2>
          <p>Стоп, вайт, ответы операторам, поднятие с отдыха.</p>
        </div>
        <MainTabs showRefresh showStatusSettings />
      </main>
    </div>
  )
}

export default BankerDashboard
