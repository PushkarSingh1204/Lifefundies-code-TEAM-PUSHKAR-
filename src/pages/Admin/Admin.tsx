import { useState } from 'react'
import { Users, BookOpen, CreditCard, TrendingUp, AlertTriangle, CheckCircle, MoreVertical, Search } from 'lucide-react'
import { MOCK_MENTORS, getInitials } from '../../utils'
import './Admin.css'

const MOCK_USERS = [
  { id: 'u1', name: 'Shreya Agarwal', email: 'shreya@example.com', role: 'user', sessions: 3, joinDate: 'May 10', status: 'active' },
  { id: 'u2', name: 'Vikram Nair', email: 'vikram@example.com', role: 'user', sessions: 7, joinDate: 'May 8', status: 'active' },
  { id: 'u3', name: 'Anonymous User', email: 'anon@example.com', role: 'user', sessions: 1, joinDate: 'May 22', status: 'active' },
  { id: 'u4', name: 'Tanvi Joshi', email: 'tanvi@example.com', role: 'user', sessions: 5, joinDate: 'Apr 28', status: 'inactive' },
]

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'mentors' | 'sessions' | 'payments'>('overview')
  const [searchQuery, setSearchQuery] = useState('')

  const stats = [
    { icon: Users, label: 'Total Users', value: '2,184', change: '+127 this week', color: 'var(--clr-primary)' },
    { icon: BookOpen, label: 'Sessions Done', value: '4,891', change: '+245 this week', color: 'var(--clr-accent)' },
    { icon: CreditCard, label: 'Revenue (May)', value: '₹1,72,400', change: '+38% MoM', color: 'var(--clr-secondary)' },
    { icon: TrendingUp, label: 'Active Mentors', value: '51', change: '+8 this month', color: 'var(--clr-purple)' },
  ]

  return (
    <div className="page-wrapper">
      <div className="admin-page">
        <div className="container">
          <div className="admin-page__header animate-fadeInUp">
            <div>
              <div className="badge badge-accent" style={{ marginBottom: 'var(--sp-2)' }}>Admin Panel</div>
              <h1 className="display-2">LifeFundies <span className="text-gradient">Admin</span></h1>
              <p className="text-muted">Platform management and analytics dashboard</p>
            </div>
            <div className="flex gap-3">
              <span className="badge badge-secondary">System: Healthy</span>
              <button className="btn btn-outline btn-sm" id="export-data-btn">Export Data</button>
            </div>
          </div>

          {/* Tabs */}
          <div className="admin-tabs animate-fadeInUp delay-100">
            {(['overview', 'users', 'mentors', 'sessions', 'payments'] as const).map(tab => (
              <button
                key={tab}
                className={`community__tab ${activeTab === tab ? 'community__tab--active' : ''}`}
                onClick={() => setActiveTab(tab)}
                id={`admin-tab-${tab}`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          {activeTab === 'overview' && (
            <div className="admin-content">
              {/* Stats */}
              <div className="admin-stats animate-fadeInUp delay-200">
                {stats.map((stat, i) => (
                  <div key={i} className="admin-stat-card" id={`admin-stat-${i}`}>
                    <div className="admin-stat-card__icon" style={{ background: `${stat.color}20`, color: stat.color }}>
                      <stat.icon size={22} />
                    </div>
                    <div>
                      <p className="admin-stat-card__value">{stat.value}</p>
                      <p className="body-sm text-muted">{stat.label}</p>
                      <p className="admin-stat-card__change">{stat.change}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Quick alerts */}
              <div className="admin-alerts animate-fadeInUp delay-300">
                <div className="admin-alert admin-alert--warning">
                  <AlertTriangle size={16} />
                  <span>3 mentor applications pending review</span>
                  <button className="btn btn-sm btn-ghost">Review</button>
                </div>
                <div className="admin-alert admin-alert--success">
                  <CheckCircle size={16} />
                  <span>All systems operational — no incidents</span>
                </div>
              </div>

              {/* Recent users and mentors */}
              <div className="admin-grid animate-fadeInUp delay-400">
                <div className="admin-section">
                  <h2 className="heading-2">Recent Users</h2>
                  <div className="admin-table">
                    <div className="admin-table__header">
                      <span>User</span><span>Sessions</span><span>Joined</span><span>Status</span>
                    </div>
                    {MOCK_USERS.slice(0, 4).map(user => (
                      <div key={user.id} className="admin-table__row" id={`admin-user-${user.id}`}>
                        <div className="flex gap-3 items-center">
                          <div className="avatar avatar-sm" style={{ background: 'var(--clr-primary)' }}>{getInitials(user.name)}</div>
                          <div>
                            <p style={{ fontWeight: 500, fontSize: '0.875rem' }}>{user.name}</p>
                            <p className="body-sm text-muted">{user.email}</p>
                          </div>
                        </div>
                        <span className="body-sm">{user.sessions}</span>
                        <span className="body-sm text-muted">{user.joinDate}</span>
                        <span className={`badge ${user.status === 'active' ? 'badge-primary' : 'badge-secondary'}`}>{user.status}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="admin-section">
                  <h2 className="heading-2">Top Mentors</h2>
                  <div className="flex-col gap-3" style={{ marginTop: 'var(--sp-4)' }}>
                    {MOCK_MENTORS.map((mentor, i) => (
                      <div key={mentor.uid} className="admin-mentor-row" id={`admin-mentor-${mentor.uid}`}>
                        <div className="avatar avatar-sm" style={{ background: `hsl(${i * 80}, 60%, 40%)` }}>
                          {getInitials(mentor.displayName)}
                        </div>
                        <div style={{ flex: 1 }}>
                          <p style={{ fontWeight: 500, fontSize: '0.875rem' }}>{mentor.displayName}</p>
                          <p className="body-sm text-muted">{mentor.totalSessions} sessions · ★ {mentor.rating}</p>
                        </div>
                        <span className="badge badge-primary">Verified</span>
                        <button className="btn btn-ghost btn-sm"><MoreVertical size={14} /></button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'users' && (
            <div className="admin-content">
              <div className="admin-section animate-fadeInUp">
                <div className="flex-between" style={{ marginBottom: 'var(--sp-4)' }}>
                  <h2 className="heading-2">All Users ({MOCK_USERS.length})</h2>
                  <div className="admin-search">
                    <Search size={14} />
                    <input
                      id="admin-user-search"
                      type="search"
                      className="form-input input-with-icon"
                      placeholder="Search users..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                    />
                  </div>
                </div>
                <div className="admin-table">
                  <div className="admin-table__header">
                    <span>User</span><span>Role</span><span>Sessions</span><span>Joined</span><span>Status</span><span>Actions</span>
                  </div>
                  {MOCK_USERS.filter(u =>
                    !searchQuery || u.name.toLowerCase().includes(searchQuery.toLowerCase()) || u.email.toLowerCase().includes(searchQuery.toLowerCase())
                  ).map(user => (
                    <div key={user.id} className="admin-table__row" id={`admin-users-${user.id}`}>
                      <div className="flex gap-3" style={{ alignItems: 'center' }}>
                        <div className="avatar avatar-sm" style={{ background: 'var(--clr-primary)' }}>{getInitials(user.name)}</div>
                        <div>
                          <p style={{ fontWeight: 500, fontSize: '0.875rem' }}>{user.name}</p>
                          <p className="body-sm text-muted">{user.email}</p>
                        </div>
                      </div>
                      <span className={`badge ${user.role === 'seeker' || user.role === 'user' ? 'badge-secondary' : 'badge-primary'}`}>{user.role}</span>
                      <span className="body-sm">{user.sessions}</span>
                      <span className="body-sm text-muted">{user.joinDate}</span>
                      <span className={`badge ${user.status === 'active' ? 'badge-primary' : 'badge-secondary'}`}>{user.status}</span>
                      <button className="btn btn-ghost btn-sm" id={`admin-user-action-${user.id}`}><MoreVertical size={14} /></button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {(activeTab === 'mentors' || activeTab === 'sessions' || activeTab === 'payments') && (
            <div className="admin-content">
              <div className="portal-coming-soon animate-fadeIn">
                <span style={{ fontSize: '3rem' }}>🔧</span>
                <h3 className="heading-2">{activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} Management</h3>
                <p className="text-muted">This section is under active development.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
