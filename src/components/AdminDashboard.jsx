import React, { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useAdmin } from '../contexts/AdminContext'
import { useData } from '../contexts/DataContext'
import MainTabs from './MainTabs'
import DashboardHeader from './DashboardHeader'
import UserAccessModal from './UserAccessModal'
import './AdminDashboard.css'
import './Dashboard.css'

const AdminDashboard = () => {
  const { user, users, logout, addUser, deleteUser, changeOwnPassword, updateUserAccess } = useAuth()
  const { logs, telegramChatId, setTelegramChatId, telegramEnabled } = useAdmin()
  const { rows, bankerRequests, approveReRaiseByAdmin, sections } = useData()
  const [adminTab, setAdminTab] = useState('lk')
  const [showAddUser, setShowAddUser] = useState(false)
  const [accessUser, setAccessUser] = useState(null)
  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState('user')
  const [addError, setAddError] = useState('')
  const [passCurrent, setPassCurrent] = useState('')
  const [passNew, setPassNew] = useState('')
  const [passMsg, setPassMsg] = useState('')
  const [tgTestMsg, setTgTestMsg] = useState('')
  const [tgChats, setTgChats] = useState([])
  const [tgChatsLoading, setTgChatsLoading] = useState(false)

  const handleAddUser = async (e) => {
    e.preventDefault()
    setAddError('')
    const result = await addUser(newUsername, newPassword, newRole)
    if (result.success) {
      setShowAddUser(false)
      setNewUsername('')
      setNewPassword('')
      setNewRole('user')
    } else {
      setAddError(result.error || 'Ошибка')
    }
  }

  const handleDeleteUser = async (id) => {
    const result = await deleteUser(id)
    if (!result.success) alert(result.error)
  }

  const handleChangePassword = async (e) => {
    e.preventDefault()
    setPassMsg('')
    const result = await changeOwnPassword(passCurrent, passNew)
    if (result.success) {
      setPassCurrent('')
      setPassNew('')
      setPassMsg('Пароль изменён')
    } else {
      setPassMsg(result.error || 'Ошибка')
    }
  }

  const formatDate = (d) => {
    return new Date(d).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const roleLabel = (r) => ({ admin: 'Админ', banker: 'Банкир', user: 'Пользователь' }[r] || r)

  return (
    <div className="dashboard admin-dashboard">
      <DashboardHeader title="Администрирование" user={user} role="admin" onLogout={logout}>
        <div className="admin-main-tabs">
          <button
            type="button"
            className={`admin-tab-btn ${adminTab === 'lk' ? 'active' : ''}`}
            onClick={() => setAdminTab('lk')}
          >
            ЛК
          </button>
          <button
            type="button"
            className={`admin-tab-btn ${adminTab === 'admin' ? 'active' : ''}`}
            onClick={() => setAdminTab('admin')}
          >
            Настройки
          </button>
        </div>
      </DashboardHeader>

      <main className="dashboard-content admin-content">
        {adminTab === 'lk' && (
          <MainTabs showRefresh showStatusSettings showSectionManage />
        )}

        {adminTab === 'admin' && (
          <>
            {/* Сменить пароль */}
            <section className="admin-section">
              <h2>Сменить свой пароль</h2>
              <form onSubmit={handleChangePassword} className="admin-form">
                <div className="form-group">
                  <label>Текущий пароль</label>
                  <input
                    type="password"
                    value={passCurrent}
                    onChange={(e) => setPassCurrent(e.target.value)}
                    required
                    placeholder="Текущий пароль"
                  />
                </div>
                <div className="form-group">
                  <label>Новый пароль</label>
                  <input
                    type="password"
                    value={passNew}
                    onChange={(e) => setPassNew(e.target.value)}
                    required
                    placeholder="Новый пароль"
                  />
                </div>
                {passMsg && <p className={passMsg === 'Пароль изменён' ? 'form-success' : 'form-error'}>{passMsg}</p>}
                <button type="submit">Сменить пароль</button>
              </form>
            </section>

            {/* Пользователи */}
            <section className="admin-section">
              <div className="admin-section-header">
                <h2>Пользователи</h2>
                <button className="btn-add" onClick={() => setShowAddUser(true)}>+ Добавить</button>
              </div>
              <div className="users-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Логин</th>
                      <th>Пароль</th>
                      <th>Роль</th>
                      <th>Доступ</th>
                      <th>Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id}>
                        <td>{u.username}</td>
                        <td><code>{u.password}</code></td>
                        <td><span className={`role-badge role-${u.role}`}>{roleLabel(u.role)}</span></td>
                        <td>
                          {u.role === 'user' ? (
                            <button
                              type="button"
                              className="btn-access-sm"
                              onClick={() => setAccessUser(u)}
                            >
                              Настроить
                            </button>
                          ) : (
                            <span className="admin-hint">Все секции</span>
                          )}
                        </td>
                        <td>
                          {u.id !== user?.id && (
                            <button
                              className="btn-delete-sm"
                              onClick={() => handleDeleteUser(u.id)}
                              title="Удалить"
                            >
                              Удалить
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Запросы на повторное поднятие */}
            {(() => {
              const reRaiseIds = Object.entries(bankerRequests)
                .filter(([, r]) => r?.status === 're_raise_pending')
                .map(([id]) => parseInt(id))
              if (reRaiseIds.length === 0) return null
              return (
                <section className="admin-section">
                  <h2>Запросы на повторное поднятие с отдыха</h2>
                  <p className="admin-hint">Банкиры запросили повторно поднять реквизиты. Одобрите — пользователь получит запрос.</p>
                  <div className="re-raise-list">
                    {reRaiseIds.map((id) => {
                      const lk = rows.find((r) => r.id === id)
                      const req = bankerRequests[id]
                      return (
                        <div key={id} className="re-raise-item">
                          <span>#{id} {lk?.name || lk?.card || '—'}</span>
                          <span className="re-raise-banker">Банкир: {req?.banker}</span>
                          <span className="re-raise-date">
                            Ранее: {req?.previousRaisedDate ? new Date(req.previousRaisedDate).toLocaleString('ru-RU') : '—'}
                          </span>
                          <button className="btn-approve-sm" onClick={() => approveReRaiseByAdmin(id)}>
                            Одобрить
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </section>
              )
            })()}

            {/* Telegram */}
            <section className="admin-section">
              <h2>Telegram — уведомления</h2>
              <p className="admin-hint">
                <strong>Подключение через бота:</strong> добавь бота в группу → напиши <code>/connect</code> → готово.
                Chat ID вводить вручную не обязательно.
              </p>
              <p className="admin-hint">
                Команды бота: <code>/connect</code> — привязать группу, <code>/status</code> — проверить связь.
                Нужен рабочий <code>BOT_TOKEN</code> в <code>.env</code>.
              </p>
              <p className={`admin-hint ${telegramEnabled ? 'form-success' : 'form-error'}`}>
                Статус бота: {telegramEnabled ? '✅ работает (polling)' : '❌ не работает — обнови BOT_TOKEN в .env и перезапусти сервер'}
              </p>
              <p className="admin-hint">
                В группе: добавь бота → напиши <code>/connect</code> или <code>/connect@имя_бота</code>
              </p>
              <div className="admin-form-row">
                <div className="form-group">
                  <label>ID чата/группы</label>
                  <input
                    type="text"
                    className="admin-input"
                    placeholder="-1001234567890"
                    value={telegramChatId}
                    onChange={(e) => setTelegramChatId(e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  className="btn-add"
                  disabled={!telegramEnabled || tgChatsLoading}
                  onClick={async () => {
                    setTgChatsLoading(true)
                    setTgTestMsg('')
                    try {
                      const res = await fetch('/api/telegram/chats')
                      const data = await res.json()
                      if (data.success && data.chats?.length) {
                        setTgChats(data.chats)
                        setTgTestMsg('Выбери chat ID из списка ниже (после /start боту или сообщения в группе)')
                      } else {
                        setTgChats([])
                        setTgTestMsg(
                          data.error ||
                            'Чаты не найдены. Напиши боту /start в личке или добавь в группу и отправь любое сообщение.'
                        )
                      }
                    } catch {
                      setTgTestMsg('❌ Сервер недоступен')
                    }
                    setTgChatsLoading(false)
                  }}
                >
                  {tgChatsLoading ? 'Поиск...' : 'Найти chat ID'}
                </button>
                <button
                  type="button"
                  className="btn-add"
                  disabled={!telegramEnabled || !telegramChatId?.trim()}
                  onClick={async () => {
                    setTgTestMsg('')
                    try {
                      const res = await fetch('/api/telegram/test', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ chatId: telegramChatId.trim() }),
                      })
                      const data = await res.json()
                      setTgTestMsg(data.success ? '✅ Сообщение отправлено' : `❌ ${data.error || 'Ошибка'}`)
                    } catch {
                      setTgTestMsg('❌ Сервер недоступен')
                    }
                  }}
                >
                  Тест в Telegram
                </button>
              </div>
              {tgChats.length > 0 && (
                <ul className="tg-chats-list">
                  {tgChats.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        className="tg-chat-pick"
                        onClick={() => {
                          setTelegramChatId(c.id)
                          setTgTestMsg(`Выбран: ${c.title} (${c.id})`)
                        }}
                      >
                        {c.title} — <code>{c.id}</code> ({c.type})
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {tgTestMsg && <p className={`admin-hint ${tgTestMsg.startsWith('✅') ? 'form-success' : 'form-error'}`}>{tgTestMsg}</p>}
            </section>

            {/* Логи */}
            <section className="admin-section">
              <h2>Логи действий</h2>
              <div className="logs-list">
                {logs.length === 0 ? (
                  <p className="logs-empty">Логов пока нет</p>
                ) : (
                  logs.map((log) => (
                    <div key={log.id} className="log-item">
                      <span className="log-date">{formatDate(log.date)}</span>
                      <span className="log-action">{log.action}</span>
                      {log.details && <span className="log-details">{log.details}</span>}
                      {log.userId && <span className="log-user">({log.userId})</span>}
                    </div>
                  ))
                )}
              </div>
            </section>
          </>
        )}
      </main>

      {accessUser && (
        <UserAccessModal
          user={accessUser}
          sections={sections}
          onClose={() => setAccessUser(null)}
          onSave={updateUserAccess}
        />
      )}

      {/* Модалка добавления пользователя */}
      {showAddUser && (
        <div className="modal-overlay" onClick={() => setShowAddUser(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Добавить пользователя</h2>
              <button className="modal-close" onClick={() => setShowAddUser(false)}>×</button>
            </div>
            <form onSubmit={handleAddUser} className="admin-form">
              <div className="form-group">
                <label>Логин</label>
                <input
                  type="text"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  required
                  placeholder="Придумайте логин"
                />
              </div>
              <div className="form-group">
                <label>Пароль</label>
                <input
                  type="text"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  placeholder="Придумайте пароль"
                />
              </div>
              <div className="form-group">
                <label>Роль</label>
                <select value={newRole} onChange={(e) => setNewRole(e.target.value)}>
                  <option value="user">Пользователь</option>
                  <option value="banker">Банкир</option>
                  <option value="admin">Админ</option>
                </select>
              </div>
              {addError && <p className="form-error">{addError}</p>}
              <div className="form-actions">
                <button type="button" onClick={() => setShowAddUser(false)}>Отмена</button>
                <button type="submit">Добавить</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminDashboard
