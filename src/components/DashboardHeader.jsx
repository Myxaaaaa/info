import './Dashboard.css'

const ROLE_LABELS = {
  admin: 'Админ',
  banker: 'Банкир',
  user: 'Оператор',
}

const DashboardHeader = ({ title, user, role, onLogout, children }) => (
  <header className="dashboard-header">
    <div className="header-brand">
      <div className="brand-logo brand-logo-sm">M</div>
      <div className="header-titles">
        <h1>{title}</h1>
        <span className="header-subtitle">ЛК · MBank Кыргызстан</span>
      </div>
    </div>
    <div className="user-info">
      {children}
      <div className="user-chip">
        <span className="user-role-badge">{ROLE_LABELS[role] || role}</span>
        <strong>{user?.username}</strong>
      </div>
      <button type="button" onClick={onLogout} className="logout-button">
        Выйти
      </button>
    </div>
  </header>
)

export default DashboardHeader
