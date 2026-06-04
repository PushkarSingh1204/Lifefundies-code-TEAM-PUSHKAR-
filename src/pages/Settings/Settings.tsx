import { useState } from 'react'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useAuthStore } from '../../stores'
import { LIFE_DOMAINS, type DomainId } from '../../types'
import { Check, Mail, MessageSquare, Bell } from 'lucide-react'
import './Settings.css'

export default function SettingsPage() {
  const { user, setUser } = useAuthStore()
  const [activeTab, setActiveTab] = useState<'profile' | 'domains' | 'notifications'>('profile')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')

  const [formData, setFormData] = useState({
    displayName: user?.displayName || '',
    phone: user?.phone || '',
    city: user?.city || '',
    profession: user?.profession || '',
    ageGroup: user?.ageGroup || '',
    domains: user?.domains || [] as DomainId[],
    bio: (user as any)?.bio || '',
    photoURL: user?.photoURL || '',
    emailNotif: (user as any)?.emailNotif !== false,
    smsNotif: (user as any)?.smsNotif === true,
    browserNotif: (user as any)?.browserNotif !== false,
    whatsappNotificationsEnabled: (user as any)?.whatsappNotificationsEnabled !== false,
  })

  if (!user) {
    return (
      <div className="container" style={{ padding: 'var(--sp-20) 0', textAlign: 'center' }}>
        <p className="body-lg text-muted">Please sign in to view settings.</p>
      </div>
    )
  }

  const handleFieldChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const toggleDomain = (id: DomainId) => {
    const existing = formData.domains
    if (existing.includes(id)) {
      handleFieldChange('domains', existing.filter(d => d !== id))
    } else if (existing.length < 3) {
      handleFieldChange('domains', [...existing, id])
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')

    try {
      const userRef = doc(db, 'users', user.uid)
      const updateData = {
        displayName: formData.displayName,
        phone: formData.phone,
        city: formData.city,
        profession: formData.profession,
        ageGroup: formData.ageGroup,
        domains: formData.domains,
        bio: formData.bio,
        photoURL: formData.photoURL,
        emailNotif: formData.emailNotif,
        smsNotif: formData.smsNotif,
        browserNotif: formData.browserNotif,
        whatsappNotificationsEnabled: formData.whatsappNotificationsEnabled,
        phoneNumber: formData.phone || '',
      }

      await updateDoc(userRef, updateData)
      
      // Update store
      setUser({
        ...user,
        ...updateData,
      })

      setSuccess('Settings updated successfully!')
      setTimeout(() => setSuccess(''), 3000)
    } catch (err: any) {
      console.error('Failed to update settings:', err)
      setError(err.message || 'Failed to update settings. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleResetOnboarding = async () => {
    if (!window.confirm('Are you sure you want to reset your onboarding progress? This will clear your domains and profile setups.')) {
      return
    }
    setLoading(true)
    setError('')
    setSuccess('')

    try {
      const userRef = doc(db, 'users', user.uid)
      const resetData = {
        city: '',
        profession: '',
        ageGroup: '',
        domains: [],
        onboardingComplete: false,
      }

      await updateDoc(userRef, resetData)
      setUser({
        ...user,
        ...resetData,
      })
      setSuccess('Onboarding reset successfully! Redirecting...')
      window.location.href = '/onboarding'
    } catch (err: any) {
      console.error('Failed to reset onboarding:', err)
      setError(err.message || 'Failed to reset. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="page-wrapper">
      <div className="settings-page">
        <div className="container">
          <div className="settings-page__header animate-fadeInUp">
            <h1 className="display-2">Account <span className="text-gradient">Settings</span></h1>
            <p className="text-muted">Manage your profile, life domains, and preferences</p>
          </div>

          <div className="settings-page__layout animate-fadeInUp delay-100">
            {/* Sidebar navigation */}
            <aside className="settings-page__sidebar">
              <button 
                type="button"
                className={`settings-page__tab-btn ${activeTab === 'profile' ? 'settings-page__tab-btn--active' : ''}`}
                onClick={() => setActiveTab('profile')}
              >
                Profile Details
              </button>
              <button 
                type="button"
                className={`settings-page__tab-btn ${activeTab === 'domains' ? 'settings-page__tab-btn--active' : ''}`}
                onClick={() => setActiveTab('domains')}
              >
                Life Domains
              </button>
              <button 
                type="button"
                className={`settings-page__tab-btn ${activeTab === 'notifications' ? 'settings-page__tab-btn--active' : ''}`}
                onClick={() => setActiveTab('notifications')}
              >
                Preferences & Safety
              </button>
            </aside>

            {/* Content panel */}
            <main className="settings-page__content">
              {success && <div className="settings-page__alert settings-page__alert--success">{success}</div>}
              {error && <div className="settings-page__alert settings-page__alert--danger">{error}</div>}

              <form onSubmit={handleSave} className="settings-page__form">
                {activeTab === 'profile' && (
                  <div className="settings-page__panel animate-fadeIn">
                    <h3 className="heading-3" style={{ marginBottom: 'var(--sp-4)' }}>Profile Details</h3>
                    
                    <div className="form-group">
                      <label className="form-label" htmlFor="settings-name">Full Name</label>
                      <input 
                        id="settings-name"
                        type="text" 
                        className="form-input" 
                        value={formData.displayName} 
                        onChange={e => handleFieldChange('displayName', e.target.value)} 
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="settings-photo">Profile Photo URL</label>
                      <input 
                        id="settings-photo"
                        type="text" 
                        className="form-input" 
                        value={formData.photoURL} 
                        onChange={e => handleFieldChange('photoURL', e.target.value)} 
                        placeholder="https://example.com/photo.jpg"
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">Email Address</label>
                      <input 
                        type="email" 
                        className="form-input" 
                        value={user.email} 
                        disabled 
                        style={{ opacity: 0.7, cursor: 'not-allowed', backgroundColor: 'var(--clr-bg-alt)' }}
                      />
                      <span className="body-sm text-muted">Email address cannot be changed.</span>
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="settings-phone">Phone Number</label>
                      <input 
                        id="settings-phone"
                        type="tel" 
                        className="form-input" 
                        value={formData.phone} 
                        onChange={e => handleFieldChange('phone', e.target.value)} 
                        placeholder="Enter phone number"
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="settings-bio">Bio</label>
                      <textarea 
                        id="settings-bio"
                        className="form-input" 
                        rows={3}
                        value={formData.bio} 
                        onChange={e => handleFieldChange('bio', e.target.value)} 
                        placeholder="Tell us about yourself..."
                        style={{ resize: 'vertical' }}
                      />
                    </div>

                    <div className="settings-grid-2">
                      <div className="form-group">
                        <label className="form-label" htmlFor="settings-city">City</label>
                        <input 
                          id="settings-city"
                          type="text" 
                          className="form-input" 
                          value={formData.city} 
                          onChange={e => handleFieldChange('city', e.target.value)} 
                          placeholder="e.g. Bangalore"
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label" htmlFor="settings-profession">Profession / Role</label>
                        <input 
                          id="settings-profession"
                          type="text" 
                          className="form-input" 
                          value={formData.profession} 
                          onChange={e => handleFieldChange('profession', e.target.value)} 
                          placeholder="e.g. Student, SDE"
                        />
                      </div>
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="settings-age">Age Group</label>
                      <select 
                        id="settings-age"
                        className="form-input" 
                        value={formData.ageGroup} 
                        onChange={e => handleFieldChange('ageGroup', e.target.value)}
                      >
                        <option value="">Select age group</option>
                        <option value="under-18">Under 18</option>
                        <option value="18-24">18–24 years</option>
                        <option value="25-34">25–34 years</option>
                        <option value="35-plus">35+ years</option>
                      </select>
                    </div>
                  </div>
                )}

                {activeTab === 'domains' && (
                  <div className="settings-page__panel animate-fadeIn">
                    <div style={{ marginBottom: 'var(--sp-4)' }}>
                      <h3 className="heading-3">Life Domains Focus</h3>
                      <p className="body-sm text-muted">Select up to 3 domains you want to prioritize. These customize your dashboard recommendation cards.</p>
                    </div>

                    <div className="settings-domains__grid">
                      {LIFE_DOMAINS.map(domain => {
                        const isSelected = formData.domains.includes(domain.id)
                        return (
                          <button
                            key={domain.id}
                            type="button"
                            className={`ob-chip ${isSelected ? 'ob-chip--active' : ''}`}
                            onClick={() => toggleDomain(domain.id)}
                            style={{ margin: 0 }}
                          >
                            <span className="ob-chip__icon">{domain.icon}</span>
                            <span className="ob-chip__label">{domain.label}</span>
                            {isSelected && <Check size={12} style={{ marginLeft: 'var(--sp-1)' }} />}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {activeTab === 'notifications' && (
                  <div className="settings-page__panel animate-fadeIn">
                    <div style={{ marginBottom: 'var(--sp-6)' }}>
                      <h3 className="heading-3">Notification Preferences</h3>
                      <p className="body-sm text-muted">Choose how you wish to receive booking summaries, reminders, and community replies.</p>
                    </div>

                    <div className="settings-notif__options">
                      {[
                        { id: 'emailNotif', label: 'Email Notifications', desc: 'Receive booking updates and receipts', icon: Mail },
                        { id: 'whatsappNotificationsEnabled', label: 'WhatsApp Alerts', desc: 'Receive session confirmations, reminders, and updates on WhatsApp', icon: MessageSquare },
                        { id: 'browserNotif', label: 'Browser Notifications', desc: 'Receive desktop and mobile notifications when active', icon: Bell },
                      ].map(opt => {
                        const val = (formData as any)[opt.id]
                        return (
                          <div key={opt.id} className="settings-notif__item">
                            <div className="settings-notif__icon">
                              <opt.icon size={18} />
                            </div>
                            <div className="settings-notif__text">
                              <p className="font-semibold body-sm" style={{ color: 'var(--clr-text)' }}>{opt.label}</p>
                              <p className="body-sm text-muted">{opt.desc}</p>
                            </div>
                            <button
                              type="button"
                              className={`ob-toggle ${val ? 'ob-toggle--on' : ''}`}
                              onClick={() => handleFieldChange(opt.id, !val)}
                              style={{ marginLeft: 'auto' }}
                            >
                              <div className="ob-toggle__thumb" />
                            </button>
                          </div>
                        )
                      })}
                    </div>

                    <div className="settings-danger-zone" style={{ marginTop: 'var(--sp-10)', paddingTop: 'var(--sp-6)', borderTop: '1px solid var(--clr-border)' }}>
                      <h4 className="heading-3" style={{ marginBottom: 'var(--sp-2)', color: 'var(--clr-accent-dark)' }}>Danger Zone</h4>
                      <p className="body-sm text-muted" style={{ marginBottom: 'var(--sp-4)' }}>Reset your profile answers to redo onboarding matches.</p>
                      <button 
                        type="button" 
                        className="btn btn-outline" 
                        style={{ borderColor: 'var(--clr-accent-dark)', color: 'var(--clr-accent-dark)' }}
                        onClick={handleResetOnboarding}
                      >
                        Reset Onboarding Details
                      </button>
                    </div>
                  </div>
                )}

                {/* Footer Save Button */}
                <div className="settings-page__footer" style={{ marginTop: 'var(--sp-8)', paddingTop: 'var(--sp-4)', borderTop: '1px solid var(--clr-border)' }}>
                  <button 
                    type="submit" 
                    className="btn btn-primary"
                    disabled={loading}
                    style={{ minWidth: '150px' }}
                  >
                    {loading ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </main>
          </div>
        </div>
      </div>
    </div>
  )
}
