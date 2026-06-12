import React from 'react'
import { useAuth } from '../contexts/AuthContext'
import DashboardHeader from './DashboardHeader'
import MainTabs from './MainTabs'
import './Dashboard.css'

const UserDashboard = () => {
  const { user, logout } = useAuth()

  return (
    <div className="dashboard">
      <DashboardHeader title="Панель оператора" user={user} role="user" onLogout={logout} />

      <main className="dashboard-content">
        <div className="welcome-section">
          <h2>Работа с ЛК</h2>
          <p>Редактирование, статусы, запросы на разблок и Face ID.</p>
        </div>
        <MainTabs showRefresh showStatusSettings />
      </main>
    </div>
  )
}

export default UserDashboard
