import React from 'react'
import './App.css'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { AdminProvider } from './contexts/AdminContext'
import { DataProvider, useData } from './contexts/DataContext'
import { StatusSettingsProvider, useStatusSettings } from './contexts/StatusSettingsContext'
import Login from './components/Login'
import UserDashboard from './components/UserDashboard'
import BankerDashboard from './components/BankerDashboard'
import AdminDashboard from './components/AdminDashboard'

const AppContent = () => {
  const { isAuthenticated, isAdmin, isBanker } = useAuth()
  const { rows } = useData()
  const { ensureStatusExists } = useStatusSettings()

  React.useEffect(() => {
    rows.forEach((row) => {
      if (row.status) ensureStatusExists(row.status)
    })
  }, [rows, ensureStatusExists])

  if (!isAuthenticated) return <Login />

  if (isAdmin) return <AdminDashboard />
  if (isBanker) return <BankerDashboard />
  return <UserDashboard />
}

function App() {
  return (
    <AuthProvider>
      <AdminProvider>
        <StatusSettingsProvider>
          <DataProvider>
            <AppContent />
          </DataProvider>
        </StatusSettingsProvider>
      </AdminProvider>
    </AuthProvider>
  )
}

export default App
