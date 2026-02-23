import React from 'react'
import { useAuth } from '../contexts/AuthContext'
import MainTabs from './MainTabs'
import './Dashboard.css'

const BankerDashboard = () => {
  const { user, logout } = useAuth()

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>Панель банкира</h1>
        <div className="user-info">
          <span>Банкир: <strong>{user?.username}</strong></span>
          <button onClick={logout} className="logout-button">Выйти</button>
        </div>
      </header>

      <main className="dashboard-content">
        <div className="welcome-section">
          <h2>ЛК и оборот</h2>
          <p>Обновление из JSON, поднятие с отдыха, управление статусами.</p>
        </div>
        <MainTabs canEdit showRefresh showStatusSettings />
      </main>
    </div>
  )
}

export default BankerDashboard
