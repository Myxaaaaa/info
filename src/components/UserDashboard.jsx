import React from 'react'
import { useAuth } from '../contexts/AuthContext'
import MainTabs from './MainTabs'
import './Dashboard.css'

const UserDashboard = () => {
  const { user, logout } = useAuth()

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>Панель пользователя</h1>
        <div className="user-info">
          <span>Пользователь: <strong>{user?.username}</strong></span>
          <button onClick={logout} className="logout-button">Выйти</button>
        </div>
      </header>

      <main className="dashboard-content">
        <div className="welcome-section">
          <h2>ЛК и оборот</h2>
          <p>Добавление, редактирование, смена статусов.</p>
        </div>
        <MainTabs canEdit showRefresh={false} showStatusSettings />
      </main>
    </div>
  )
}

export default UserDashboard
