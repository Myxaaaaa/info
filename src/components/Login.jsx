import React, { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import './Login.css'

const Login = () => {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const { login, isLoading } = useAuth()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    
    if (!username || !password) {
      setError('Введите логин и пароль')
      return
    }

    const result = await login(username, password)
    
    if (!result.success) {
      setError(result.error || 'Ошибка входа')
    }
  }

  return (
    <div className="login-container">
      <div className="login-box">
        <h2>Вход в систему</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="username">Логин:</label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Введите логин"
              disabled={isLoading}
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="password">Пароль:</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Введите пароль"
              disabled={isLoading}
            />
          </div>

          {error && <div className="error-message">{error}</div>}

          <button type="submit" disabled={isLoading} className="login-button">
            {isLoading ? 'Вход...' : 'Войти'}
          </button>
        </form>

        <div className="login-hint">
          <p>Введите свой логин и пароль, выданные администратором.</p>
        </div>
      </div>
    </div>
  )
}

export default Login
