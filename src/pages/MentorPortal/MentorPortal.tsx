import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Calendar as CalendarIcon, Clock, Users, Star, XCircle, Edit3, Trash2, Video, Save } from 'lucide-react'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useAuthStore } from '../../stores'
import { getInitials } from '../../utils'
import { 
  acceptBookingRequest, 
  declineBookingRequest, 
  createGuideSlot, 
  deleteGuideSlot, 
  completeBookingSession, 
  subscribeToGuideBookings,
  subscribeToGuideSlots,
  subscribeToSessionsForGuide,
  markBookingReminderSent,
  markBooking10MinReminderSent,
  triggerWhatsAppForBooking
} from '../../lib/bookingRepository'
import { updateMentorProfile } from '../../lib/userRepository'
import { MENTOR_CATEGORIES, getCategoryPrices, getSessionPrice, normalizeMentorCategories } from '../../lib/pricing'
import VideoRoom from '../../components/VideoRoom'
import './MentorPortal.css'

export default function MentorPortalPage() {
  const { user, setUser } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  
  useEffect(() => {
    if (user && (user as any).role === 'mentor') {
      const onboardingCompleted = (user as any).onboardingCompleted === true

      if (!onboardingCompleted) {
        const bio = (user as any).bio || ''
        const qual = (user as any).qualification || (user as any).education || ''
        const exp = (user as any).experience || (user as any).yearsOfExperience || ''
        const hasExistingProfile = bio.trim() !== '' && qual.trim() !== '' && String(exp).trim() !== ''

        if (hasExistingProfile) {
          console.log('Healing mentor onboardingCompleted flag in database...')
          updateDoc(doc(db, 'users', user.uid), {
            onboardingCompleted: true,
            mentorOnboardingComplete: true,
            onboardingComplete: true
          }).then(() => {
            setUser({
              ...user,
              onboardingCompleted: true,
              mentorOnboardingComplete: true,
              onboardingComplete: true
            } as any)
          }).catch(err => console.error('Failed to heal onboarding flag:', err))
        } else {
          navigate('/mentor-onboarding', { replace: true })
        }
      }
    }
  }, [user, navigate, setUser])

  const [activeTab, setActiveTab] = useState<'overview' | 'requests' | 'calendar' | 'earnings' | 'profile'>('overview')

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const tab = params.get('tab')
    if (tab && ['overview', 'requests', 'calendar', 'earnings', 'profile'].includes(tab)) {
      setActiveTab(tab as any)
    }
  }, [location.search])

  const [bookings, setBookings] = useState<any[]>([])
  const [slots, setSlots] = useState<any[]>([])
  const [sessions, setSessions] = useState<any[]>([])
  
  const [loadingBookings, setLoadingBookings] = useState(true)
  const [loadingSlots, setLoadingSlots] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  
  // Slot management form state
  const [newSlotDate, setNewSlotDate] = useState('')
  const [newSlotTime, setNewSlotTime] = useState('10:00')
  const [newSlotDuration, setNewSlotDuration] = useState(30)
  const [newSlotCategory, setNewSlotCategory] = useState('peer-buddy')

  // Auto-init slot category to the first offered category for this mentor
  useEffect(() => {
    if (user) {
      const allowedCats = normalizeMentorCategories((user as any).categories)
      if (allowedCats.length > 0) {
        setNewSlotCategory(allowedCats[0])
        setNewSlotDuration(getCategoryPrices(allowedCats[0])[0].duration)
      }
    }
  }, [user])
  const [creatingSlot, setCreatingSlot] = useState(false)
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileForm, setProfileForm] = useState({
    photoURL: '',
    fullName: '',
    displayName: '',
    bio: '',
    qualification: '',
    experience: '',
    languages: '',
    expertise: '',
    certifications: '',
    categories: ['peer-buddy'] as string[],
  })
  
  // Video room state
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    setProfileForm({
      photoURL: (user as any).photoURL || '',
      fullName: (user as any).fullName || user.displayName || '',
      displayName: user.displayName || '',
      bio: (user as any).bio || '',
      qualification: (user as any).qualification || (user as any).education || '',
      experience: String((user as any).experience || (user as any).yearsOfExperience || ''),
      languages: ((user as any).languages || (user as any).languagesKnown || []).join(', '),
      expertise: ((user as any).expertise || (user as any).expertiseDomains || []).join(', '),
      certifications: ((user as any).certifications || []).join(', '),
      categories: normalizeMentorCategories((user as any).categories),
    })
  }, [user])

 
  const fetchPortalData = async () => {
    // Under real-time subscriptions, updates are handled automatically by Firestore snapshots.
  }

  useEffect(() => {
    if (!user?.uid) return

    setLoadingBookings(true)
    setLoadingSlots(true)

    const unsubscribeBookings = subscribeToGuideBookings(user.uid, (data) => {
      setBookings(data)
      setLoadingBookings(false)
    })

    const unsubscribeSlots = subscribeToGuideSlots(user.uid, (data) => {
      setSlots(data)
      setLoadingSlots(false)
    })

    const unsubscribeSessions = subscribeToSessionsForGuide(user.uid, (data) => {
      setSessions(data)
    })

    return () => {
      unsubscribeBookings()
      unsubscribeSlots()
      unsubscribeSessions()
    }
  }, [user?.uid])

  // Automated background pre-session WhatsApp reminder check for mentors
  useEffect(() => {
    if (!bookings || bookings.length === 0) return

    const checkReminders = () => {
      const now = Date.now()
      bookings.forEach(async (booking) => {
        if (booking.status !== 'confirmed') return

        // Calculate time to session in minutes
        if (!booking.sessionDate || !booking.sessionTime) return
        const sessionDateTime = new Date(`${booking.sessionDate}T${booking.sessionTime}`)
        const diffMs = sessionDateTime.getTime() - now
        const mToSession = diffMs / (1000 * 60)

        // 1. Trigger 30-min reminder if session starts in <= 30 minutes, is > 10 minutes, and reminderSent is not true
        if (mToSession <= 30 && mToSession > 10 && booking.reminderSent !== true) {
          console.log(`[Mentor Portal Automated Reminder] Triggering 30-min WhatsApp reminder for booking: ${booking.id}`)
          try {
            // Immediately mark as sent locally and in db to prevent double triggers
            await markBookingReminderSent(booking.id)
            // Trigger notifications
            triggerWhatsAppForBooking(booking.id, 'reminder')
          } catch (err) {
            console.error('Failed to trigger automated 30-min WhatsApp reminder:', err)
          }
        }

        // 2. Trigger 10-min reminder if session starts in <= 10 minutes, is >= -5 minutes, and reminder10Sent is not true
        if (mToSession <= 10 && mToSession >= -5 && booking.reminder10Sent !== true) {
          console.log(`[Mentor Portal Automated Reminder] Triggering 10-min WhatsApp reminder for booking: ${booking.id}`)
          try {
            // Immediately mark as sent locally and in db to prevent double triggers
            await markBooking10MinReminderSent(booking.id)
            // Trigger notifications
            triggerWhatsAppForBooking(booking.id, 'reminder10')
          } catch (err) {
            console.error('Failed to trigger automated 10-min WhatsApp reminder:', err)
          }
        }
      })
    }

    // Run check immediately, then schedule every 30 seconds
    checkReminders()
    const interval = setInterval(checkReminders, 30000)
    return () => clearInterval(interval)
  }, [bookings])



  
  const handleAcceptRequest = async (bookingId: string) => {
    if (!user?.uid) return
    setActionLoading(bookingId)
    try {
      await acceptBookingRequest(bookingId, user.uid)
      await fetchPortalData()
    } catch (err) {
      console.error('Failed to accept request:', err)
      alert('Failed to accept booking request.')
    } finally {
      setActionLoading(null)
    }
  }

  const handleDeclineRequest = async (bookingId: string) => {
    if (!user?.uid) return
    setActionLoading(bookingId)
    try {
      await declineBookingRequest(bookingId, user.uid)
      await fetchPortalData()
    } catch (err) {
      console.error('Failed to decline request:', err)
      alert('Failed to decline booking request.')
    } finally {
      setActionLoading(null)
    }
  }

  const getMinutesToSession = (sessionDate: string, sessionTime: string) => {
    if (!sessionDate || !sessionTime) return Infinity
    const sessionDateTime = new Date(`${sessionDate}T${sessionTime}`)
    const diffMs = sessionDateTime.getTime() - Date.now()
    return diffMs / (1000 * 60)
  }

  const handleSendReminder = async (booking: any) => {
    const mentorName = user?.displayName || 'Mentor'
    const clientName = booking.clientName || 'Client'
    const phone = booking.clientPhone
    if (!phone) {
      alert('Client phone number is not available to send WhatsApp reminder.')
      return
    }
    const sessionLink = window.location.origin + '/mentor-portal'
    const text = `Hi ${clientName}, this is a reminder that your session with ${mentorName} starts in 30 minutes. Join here: ${sessionLink}`
    
    let formattedPhone = phone.trim()
    if (formattedPhone.length === 10) {
      formattedPhone = '91' + formattedPhone
    }

    try {
      await markBookingReminderSent(booking.id)
      window.open(`https://api.whatsapp.com/send?phone=${formattedPhone}&text=${encodeURIComponent(text)}`, '_blank')
    } catch (err) {
      console.error(err)
    }
  }

  const handleDirectWhatsAppMessage = (phone: string, clientName: string) => {
    if (!phone) {
      alert('Seeker phone number is not available to send WhatsApp message.')
      return
    }
    let formattedPhone = phone.trim().replace(/[\s+-]/g, '')
    if (formattedPhone.length === 10) {
      formattedPhone = '91' + formattedPhone
    }
    const text = `Hi ${clientName}, this is your mentor from LifeFundies.`
    window.open(`https://wa.me/${formattedPhone}?text=${encodeURIComponent(text)}`, '_blank')
  }

  const handleCompleteSession = async (bookingId: string, sessionId: string) => {
    setActionLoading(bookingId)
    try {
      await completeBookingSession(bookingId, sessionId)
      alert('Session marked as completed successfully!')
      await fetchPortalData()
    } catch (err) {
      console.error('Failed to complete session:', err)
      alert('Failed to complete session.')
    } finally {
      setActionLoading(null)
    }
  }

  const handleCreateSlot = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user?.uid) return
    setCreatingSlot(true)
    try {
      await createGuideSlot({
        guideId: user.uid,
        date: newSlotDate,
        time: newSlotTime,
        duration: newSlotDuration,
        category: newSlotCategory,
        price: getSessionPrice(newSlotCategory, newSlotDuration)
      })
      // Reset form
      setNewSlotDate('')
      setNewSlotTime('10:00')
      await fetchPortalData()
    } catch (err) {
      console.error('Failed to create slot:', err)
      alert('Failed to add availability slot.')
    } finally {
      setCreatingSlot(false)
    }
  }

  const toggleProfileCategory = (categoryId: string) => {
    setProfileForm(prev => {
      const exists = prev.categories.includes(categoryId)
      const categories = exists ? prev.categories.filter(id => id !== categoryId) : [...prev.categories, categoryId]
      return { ...prev, categories }
    })
  }

  const handleSaveProfile = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!user?.uid) return
    if (profileForm.categories.length === 0) {
      alert('Select at least one mentor category.')
      return
    }

    setSavingProfile(true)
    try {
      await updateMentorProfile(user.uid, profileForm)
      alert('Mentor profile updated.')
    } catch (error) {
      console.error('Failed to save mentor profile:', error)
      alert('Failed to save mentor profile.')
    } finally {
      setSavingProfile(false)
    }
  }

  const handleDeleteSlot = async (slotId: string) => {
    if (!window.confirm('Are you sure you want to delete this availability slot?')) return
    try {
      await deleteGuideSlot(slotId)
      await fetchPortalData()
    } catch (err: any) {
      console.error('Failed to delete slot:', err)
      alert(err.message || 'Failed to delete slot.')
    }
  }

  // ── Stats Calculations ───────────────────────────────
  
  const activeBookings = bookings.filter(b => b.status === 'confirmed' || b.status === 'paid' || b.status === 'completed')
  
  const totalSessionsThisMonth = activeBookings.length
  
  const uniqueClientsCount = new Set(bookings.map(b => b.userId)).size
  
  const ratedSessions = sessions.filter(s => s.userRating != null)
  const avgRating = ratedSessions.length > 0
    ? (ratedSessions.reduce((acc, s) => acc + s.userRating, 0) / ratedSessions.length).toFixed(1)
    : '4.9'

  const pendingRequests = bookings.filter(b => b.status === 'pending')
  const upcomingSessions = bookings.filter(b => b.status === 'confirmed' || b.status === 'paid')
  const completedSessions = bookings.filter(b => b.status === 'completed')

  const stats = [
    { icon: CalendarIcon, label: 'Sessions Confirmed/Completed', value: String(totalSessionsThisMonth), color: 'var(--clr-primary)', change: 'Live' },
    { icon: Users, label: 'Total Clients', value: String(uniqueClientsCount), color: 'var(--clr-accent)', change: 'Live' },
    { icon: Star, label: 'Avg Rating', value: avgRating, color: 'var(--clr-secondary)', change: ratedSessions.length > 0 ? `${ratedSessions.length} ratings` : 'Default' },
  ]

  return (
    <div className="page-wrapper">
      <div className="mentor-portal">
        <div className="container">
          <div className="mentor-portal__header animate-scaleIn">
            <div>
              <div className="badge badge-primary" style={{ marginBottom: 'var(--sp-2)' }}>Mentor Dashboard</div>
              <h1 className="display-2">Welcome back, <span className="text-gradient">{user?.displayName || 'Mentor'}</span> 👋</h1>
              <p className="text-muted">You have <strong>{pendingRequests.length} pending requests</strong> awaiting your response.</p>
            </div>
            <button className="btn btn-outline" id="edit-profile-btn" onClick={() => setActiveTab('profile')}>
              <Edit3 size={16} /> Manage Profile
            </button>
          </div>

          {/* Tabs */}
          <div className="mentor-portal__tabs animate-fadeInUp">
            {(['overview', 'requests', 'calendar', 'earnings', 'profile'] as const).map(tab => (
              <button
                key={tab}
                className={`community__tab ${activeTab === tab ? 'community__tab--active' : ''}`}
                onClick={() => setActiveTab(tab)}
                id={`portal-tab-${tab}`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          {/* OVERVIEW TAB */}
          {activeTab === 'overview' && (
            <div className="mentor-portal__content">
              {/* Stats Cards */}
              <div className="mentor-portal__stats animate-scaleIn">
                {stats.map((stat, i) => (
                  <div key={i} className="mentor-stat-card" id={`mentor-stat-${i}`}>
                    <div className="mentor-stat-card__icon" style={{ background: `${stat.color}20`, color: stat.color }}>
                      <stat.icon size={20} />
                    </div>
                    <div>
                      <p className="mentor-stat-card__value">{stat.value}</p>
                      <p className="body-sm text-muted">{stat.label}</p>
                    </div>
                    <span className="mentor-stat-card__change">{stat.change}</span>
                  </div>
                ))}
              </div>

              <div className="mentor-portal__grid">
                {/* Pending Requests */}
                <div className="portal-section animate-fadeInUp">
                  <h2 className="heading-2">Pending Requests</h2>
                  <div className="flex-col gap-3" style={{ marginTop: 'var(--sp-4)' }}>
                    {loadingBookings ? (
                      <p className="text-muted">Loading requests...</p>
                    ) : pendingRequests.length > 0 ? (
                      pendingRequests.map(req => (
                        <div key={req.id} className="request-card" id={`request-${req.id}`}>
                          <div className="avatar avatar-md" style={{ overflow: 'hidden', border: '1px solid var(--clr-border)' }}>
                            {req.clientPhotoURL ? (
                              <img src={req.clientPhotoURL} alt={req.clientName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                              getInitials(req.clientName || 'Client')
                            )}
                          </div>
                          <div className="request-card__info">
                            <p className="request-card__user">{req.clientName || `Client (${req.userId.substring(0, 6)})`}</p>
                            <div className="flex gap-3">
                              <span className="body-sm text-muted">{req.domain}</span>
                              <span className="body-sm text-muted"><Clock size={12} style={{ display: 'inline' }} /> {req.sessionDate}, {req.sessionTime}</span>
                            </div>
                            {req.issueSummary && (
                              <p className="body-sm text-muted" style={{ marginTop: '4px', fontStyle: 'italic' }}>
                                "{req.issueSummary}"
                              </p>
                            )}
                          </div>
                          <div className="request-card__actions">
                            <button 
                              className="btn btn-primary btn-sm" 
                              onClick={() => handleAcceptRequest(req.id)} 
                              id={`accept-${req.id}`}
                              disabled={actionLoading === req.id}
                            >
                              Accept
                            </button>
                            <button 
                              className="btn btn-ghost btn-sm" 
                              onClick={() => handleDeclineRequest(req.id)} 
                              id={`decline-${req.id}`}
                              disabled={actionLoading === req.id}
                            >
                              Decline
                            </button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-center text-muted" style={{ padding: '2rem 0' }}>No pending requests.</p>
                    )}
                  </div>
                </div>

                {/* Upcoming Sessions */}
                <div className="portal-section animate-fadeInUp">
                  <h2 className="heading-2">Upcoming Sessions</h2>
                  <div className="flex-col gap-3" style={{ marginTop: 'var(--sp-4)' }}>
                    {loadingBookings ? (
                      <p className="text-muted">Loading sessions...</p>
                    ) : upcomingSessions.length > 0 ? (
                      upcomingSessions.map(session => (
                        <div key={session.id} className="request-card" id={`upcoming-${session.id}`}>
                          <div className="avatar avatar-md" style={{ overflow: 'hidden', border: '1px solid var(--clr-border)' }}>
                            {session.clientPhotoURL ? (
                              <img src={session.clientPhotoURL} alt={session.clientName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                              getInitials(session.clientName || 'Client')
                            )}
                          </div>
                          <div className="request-card__info">
                            <p className="request-card__user">{session.clientName || `Client (${session.userId.substring(0, 6)})`}</p>
                            <div className="flex gap-3">
                              <span className="body-sm text-muted">{session.domain}</span>
                              <span className="body-sm text-muted"><Clock size={12} style={{ display: 'inline' }} /> {session.sessionDate}, {session.sessionTime}</span>
                            </div>
                          </div>
                          <div className="request-card__actions" style={{ flexDirection: 'column', gap: '4px' }}>
                            <button 
                              className="btn btn-primary btn-sm" 
                              onClick={() => setActiveSessionId(session.sessionId)} 
                              style={{ display: 'flex', alignItems: 'center', gap: '4px', width: '100%' }}
                            >
                              <Video size={14} /> Start Call
                            </button>
                            <button 
                              type="button"
                              className="btn btn-outline btn-sm" 
                              onClick={() => handleDirectWhatsAppMessage(session.clientPhone, session.clientName)}
                              style={{ fontSize: '0.75rem', height: '28px', width: '100%' }}
                            >
                              Message Seeker
                            </button>
                            {(() => {
                              const mToSession = getMinutesToSession(session.sessionDate, session.sessionTime)
                              if (mToSession <= 30 && mToSession >= -60 && !session.reminderSent) {
                                return (
                                  <button 
                                    className="btn btn-accent btn-sm" 
                                    onClick={() => handleSendReminder(session)}
                                    style={{ fontSize: '0.75rem', height: '28px', width: '100%' }}
                                  >
                                    WhatsApp Seeker
                                  </button>
                                )
                              }
                              return null
                            })()}
                            <button 
                              className="btn btn-outline btn-sm" 
                              onClick={() => handleCompleteSession(session.id, session.sessionId)}
                              disabled={actionLoading === session.id}
                              style={{ fontSize: '0.75rem', height: '28px', width: '100%' }}
                            >
                              Complete
                            </button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-center text-muted" style={{ padding: '2rem 0' }}>No upcoming sessions.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* REQUESTS TAB */}
          {activeTab === 'requests' && (
            <div className="portal-section animate-fadeInUp" style={{ marginTop: 'var(--sp-6)' }}>
              <h2 className="heading-2">All Booking Logs & Requests</h2>
              <div className="flex-col gap-3" style={{ marginTop: 'var(--sp-4)' }}>
                {loadingBookings ? (
                  <p className="text-muted">Loading log...</p>
                ) : bookings.length > 0 ? (
                  bookings.map(req => (
                    <div key={req.id} className="request-card" id={`req-all-${req.id}`}>
                      <div className="avatar avatar-md" style={{ overflow: 'hidden', border: '1px solid var(--clr-border)' }}>
                        {req.clientPhotoURL ? (
                          <img src={req.clientPhotoURL} alt={req.clientName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          getInitials(req.clientName || 'Client')
                        )}
                      </div>
                      <div className="request-card__info">
                        <p className="request-card__user">{req.clientName || `Client (${req.userId.substring(0, 6)})`}</p>
                        <div className="flex gap-3">
                          <span className="body-sm text-muted">{req.domain}</span>
                          <span className="body-sm text-muted">{req.sessionDate}, {req.sessionTime}</span>
                        </div>
                      </div>
                      <span className={`badge ${req.status === 'confirmed' || req.status === 'paid' ? 'badge-primary' : req.status === 'cancelled' ? 'badge-accent' : req.status === 'completed' ? 'badge-secondary' : 'badge-secondary'}`}>
                        {req.status}
                      </span>
                      {req.status === 'pending' && (
                        <div className="request-card__actions">
                          <button className="btn btn-primary btn-sm" onClick={() => handleAcceptRequest(req.id)} disabled={actionLoading === req.id}>Accept</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => handleDeclineRequest(req.id)} disabled={actionLoading === req.id}>Decline</button>
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-center text-muted" style={{ padding: '2rem 0' }}>No bookings or requests found.</p>
                )}
              </div>
            </div>
          )}

          {/* CALENDAR TAB */}
          {activeTab === 'calendar' && (
            <div className="portal-section animate-fadeInUp" style={{ marginTop: 'var(--sp-6)' }}>
              <div className="flex-between" style={{ marginBottom: 'var(--sp-4)' }}>
                <h2 className="heading-2">Manage Availability Slots</h2>
              </div>
              
              {/* Slot Creation Form */}
              <form onSubmit={handleCreateSlot} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--sp-4)', marginBottom: 'var(--sp-6)', background: 'var(--clr-bg-alt)', padding: 'var(--sp-4)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--clr-border)' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Date</label>
                  <input type="date" className="form-input" value={newSlotDate} onChange={e => setNewSlotDate(e.target.value)} required />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Time</label>
                  <input type="time" className="form-input" value={newSlotTime} onChange={e => setNewSlotTime(e.target.value)} required />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Category</label>
                  <select
                    className="form-input"
                    value={newSlotCategory}
                    onChange={e => {
                      const categoryId = e.target.value
                      setNewSlotCategory(categoryId)
                      setNewSlotDuration(getCategoryPrices(categoryId)[0].duration)
                    }}
                  >
                    {normalizeMentorCategories((user as any)?.categories).map(categoryId => {
                      const category = MENTOR_CATEGORIES.find(item => item.id === categoryId)
                      return category ? <option key={category.id} value={category.id}>{category.label}</option> : null
                    })}
                  </select>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Duration (mins)</label>
                  <select className="form-input" value={newSlotDuration} onChange={e => setNewSlotDuration(Number(e.target.value))}>
                    {getCategoryPrices(newSlotCategory).map(option => (
                      <option key={option.duration} value={option.duration}>{option.duration} mins - Rs {option.price}</option>
                    ))}
                  </select>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <button type="submit" className="btn btn-primary" style={{ width: '100%', height: '42px' }} disabled={creatingSlot}>
                    {creatingSlot ? 'Adding...' : 'Add Slot'}
                  </button>
                </div>
              </form>

              {/* Slots List */}
              <div className="flex-col gap-3">
                {loadingSlots ? (
                  <p className="text-muted">Loading slots...</p>
                ) : slots.length > 0 ? (
                  slots.map(slot => (
                    <div key={slot.id} className="request-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', gap: 'var(--sp-4)', alignItems: 'center' }}>
                        <span style={{ fontSize: '1.25rem' }}>📅</span>
                        <div>
                          <p style={{ fontWeight: 600 }}>{slot.date}</p>
                          <p className="body-sm text-muted">Time: {slot.time} ({slot.duration} mins)</p>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 'var(--sp-3)', alignItems: 'center' }}>
                        <span className={`badge ${slot.isBooked ? 'badge-primary' : 'badge-secondary'}`}>
                          {slot.isBooked ? 'Booked' : 'Available'}
                        </span>
                        {!slot.isBooked && (
                          <button 
                            type="button" 
                            className="btn btn-ghost btn-sm" 
                            onClick={() => handleDeleteSlot(slot.id)} 
                            style={{ color: 'var(--clr-accent)', borderColor: 'var(--clr-accent)', display: 'flex', alignItems: 'center', gap: '4px' }}
                          >
                            <Trash2 size={14} /> Delete
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-center text-muted" style={{ padding: '2rem 0' }}>No availability slots defined. Use the form above to add your first slot!</p>
                )}
              </div>
            </div>
          )}

          {/* EARNINGS TAB */}
          {activeTab === 'earnings' && (
            <div className="portal-section animate-fadeInUp" style={{ marginTop: 'var(--sp-6)' }}>
              <div className="flex-between" style={{ marginBottom: 'var(--sp-4)' }}>
                <h2 className="heading-2">Session Records</h2>
              </div>

              <div className="earnings-summary" style={{ marginBottom: 'var(--sp-6)' }}>
                <div className="earnings-summary__item">
                  <p className="body-sm text-muted">Completed Sessions</p>
                  <p className="earnings-summary__value">{completedSessions.length}</p>
                </div>
                <div className="earnings-summary__item">
                  <p className="body-sm text-muted">Upcoming Sessions</p>
                  <p className="earnings-summary__value text-gradient">{upcomingSessions.length}</p>
                </div>
                <div className="earnings-summary__item">
                  <p className="body-sm text-muted">Confirmed Sessions</p>
                  <p className="earnings-summary__value">{activeBookings.length}</p>
                </div>
                <div className="earnings-summary__item">
                  <p className="body-sm text-muted">Pending Requests</p>
                  <p className="earnings-summary__value" style={{ color: 'var(--clr-secondary)' }}>
                    {pendingRequests.length}
                  </p>
                </div>
              </div>

              <h3 className="heading-3" style={{ marginBottom: 'var(--sp-3)' }}>Session History</h3>
              <div className="flex-col gap-3">
                {activeBookings.length > 0 ? (
                  activeBookings.map(b => (
                    <div key={b.id} className="request-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <p style={{ fontWeight: 600 }}>{b.domain}</p>
                        <p className="body-sm text-muted">Client: {b.clientName || `ID ${b.userId.substring(0, 6)}`} · Date: {b.sessionDate}</p>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span className={`badge ${b.status === 'completed' ? 'badge-primary' : 'badge-secondary'}`} style={{ fontSize: '0.75rem', padding: '2px 6px' }}>
                          {b.status}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-center text-muted" style={{ padding: '2rem 0' }}>No payment transactions found.</p>
                )}
              </div>
            </div>
          )}

          {activeTab === 'profile' && (
            <div className="portal-section animate-fadeInUp" style={{ marginTop: 'var(--sp-6)' }}>
              <div className="flex-between" style={{ marginBottom: 'var(--sp-4)' }}>
                <h2 className="heading-2">Manage Profile</h2>
                <span className="badge badge-primary">Real-time Firebase profile</span>
              </div>
              <form onSubmit={handleSaveProfile} className="flex-col gap-4">
                <div className="auth-form-grid">
                  <div className="form-group">
                    <label className="form-label" htmlFor="profile-photo">Profile Photo URL</label>
                    <input id="profile-photo" className="form-input" value={profileForm.photoURL} onChange={e => setProfileForm(prev => ({ ...prev, photoURL: e.target.value }))} placeholder={(user as any)?.photoURL || 'Google profile image is used by default'} />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="profile-full-name">Full Name</label>
                    <input id="profile-full-name" className="form-input" value={profileForm.fullName} onChange={e => setProfileForm(prev => ({ ...prev, fullName: e.target.value }))} required />
                  </div>
                </div>
                <div className="auth-form-grid">
                  <div className="form-group">
                    <label className="form-label" htmlFor="profile-display-name">Display Name</label>
                    <input id="profile-display-name" className="form-input" value={profileForm.displayName} onChange={e => setProfileForm(prev => ({ ...prev, displayName: e.target.value }))} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="profile-qualification">Qualification</label>
                    <input id="profile-qualification" className="form-input" value={profileForm.qualification} onChange={e => setProfileForm(prev => ({ ...prev, qualification: e.target.value }))} required />
                  </div>
                </div>
                <div className="auth-form-grid">
                  <div className="form-group">
                    <label className="form-label" htmlFor="profile-experience">Experience (years)</label>
                    <input id="profile-experience" type="number" min="0" className="form-input" value={profileForm.experience} onChange={e => setProfileForm(prev => ({ ...prev, experience: e.target.value }))} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="profile-languages">Languages Known</label>
                    <input id="profile-languages" className="form-input" value={profileForm.languages} onChange={e => setProfileForm(prev => ({ ...prev, languages: e.target.value }))} placeholder="Hindi, English" required />
                  </div>
                </div>
                <div className="auth-form-grid">
                  <div className="form-group">
                    <label className="form-label" htmlFor="profile-expertise">Expertise Domains</label>
                    <input id="profile-expertise" className="form-input" value={profileForm.expertise} onChange={e => setProfileForm(prev => ({ ...prev, expertise: e.target.value }))} placeholder="Career, Confidence" required />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="profile-certifications">Certifications</label>
                    <input id="profile-certifications" className="form-input" value={profileForm.certifications} onChange={e => setProfileForm(prev => ({ ...prev, certifications: e.target.value }))} placeholder="Certification names, separated by commas" />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="profile-bio">Bio / About Me</label>
                  <textarea id="profile-bio" className="form-input" rows={4} value={profileForm.bio} onChange={e => setProfileForm(prev => ({ ...prev, bio: e.target.value }))} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Mentor Categories</label>
                  <div className="mentors-filters__chips">
                    {MENTOR_CATEGORIES.map(category => (
                      <button type="button" key={category.id} className={`ob-chip ${profileForm.categories.includes(category.id) ? 'ob-chip--active' : ''}`} onClick={() => toggleProfileCategory(category.id)}>
                        {category.label}
                      </button>
                    ))}
                  </div>
                  <p className="body-sm text-muted">Select at least one category. These categories control booking prices and available slot durations.</p>
                </div>
                <button type="submit" className="btn btn-primary" disabled={savingProfile} style={{ alignSelf: 'flex-start' }}>
                  <Save size={16} /> {savingProfile ? 'Saving...' : 'Save Profile'}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>

      {/* Video Call Modal */}
      {activeSessionId && (
        <div className="video-modal-overlay">
          <div className="video-modal-card animate-fadeInUp">
            <div className="video-modal-header">
              <span className="video-modal-title">Live Video Room — Session Call</span>
              <button 
                type="button"
                className="btn btn-ghost btn-sm video-modal-close-btn" 
                onClick={() => setActiveSessionId(null)}
                aria-label="Close video room"
              >
                <XCircle size={20} />
              </button>
            </div>
            <VideoRoom 
              sessionId={activeSessionId}
              userName={user?.displayName || 'Mentor'}
              guideName="Client"
              onLeave={() => setActiveSessionId(null)}
            />
          </div>
        </div>
      )}
    </div>
  )
}
