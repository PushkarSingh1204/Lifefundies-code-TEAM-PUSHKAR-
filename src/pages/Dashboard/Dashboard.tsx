import { useState, useEffect } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Calendar, Clock, Star, TrendingUp, Users, ArrowRight, Bell, BookOpen, Heart, X } from 'lucide-react'
import { 
  subscribeToUserBookings, 
  markBookingReminderSent, 
  markBooking10MinReminderSent, 
  rescheduleBooking, 
  triggerWhatsAppForBooking 
} from '../../lib/bookingRepository'
import { markNotificationAsRead, markAllNotificationsAsRead } from '../../lib/notificationRepository'
import SlotSelection from '../../components/SlotSelection'
import { getUserPosts } from '../../lib/communityRepository'
import { subscribeToMentors } from '../../lib/userRepository'
import { useAuthStore, useAppStore } from '../../stores'
import { LIFE_DOMAINS } from '../../types'
import { MOCK_MENTORS, formatCurrency, getInitials } from '../../utils'
import VideoRoom from '../../components/VideoRoom'
import './Dashboard.css'

const SessionSkeleton = () => (
  <div className="session-card skeleton" style={{ pointerEvents: 'none', height: '72px' }} />
)

export default function DashboardPage() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const userDomains = user?.domains?.map(id => LIFE_DOMAINS.find(d => d.id === id)).filter(Boolean) || []
  
  const [showNotifications, setShowNotifications] = useState(false)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [sessionMentorName, setSessionMentorName] = useState('Priya Sharma')
  const [bookings, setBookings] = useState<any[]>([])
  const [loadingBookings, setLoadingBookings] = useState(false)
  const [userPostsCount, setUserPostsCount] = useState(0)
  const [recommendedMentors, setRecommendedMentors] = useState<any[]>(MOCK_MENTORS.slice(0, 3))
  const [historyTab, setHistoryTab] = useState<'completed' | 'cancelled'>('completed')
  const [reschedulingSession, setReschedulingSession] = useState<any | null>(null)
  const [selectedRescheduleSlot, setSelectedRescheduleSlot] = useState<any | null>(null)
  const [rescheduleLoading, setRescheduleLoading] = useState(false)
  const [rescheduleError, setRescheduleError] = useState('')

  const { 
    notificationsList, 
    markAllNotificationsRead, 
    markNotificationRead 
  } = useAppStore()



  // Bookings fetch (real-time listener)
  useEffect(() => {
    if (!user?.uid) return

    setLoadingBookings(true)
    const unsubscribe = subscribeToUserBookings(user.uid, (data: any) => {
      if (Array.isArray(data)) {
        setBookings(data)
      }
      setLoadingBookings(false)
    })

    return () => unsubscribe()
  }, [user?.uid])

  // Automated background pre-session WhatsApp reminder check
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
          console.log(`[Dashboard Automated Reminder] Triggering 30-min WhatsApp reminder for booking: ${booking.id}`)
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
          console.log(`[Dashboard Automated Reminder] Triggering 10-min WhatsApp reminder for booking: ${booking.id}`)
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


  const handleConfirmReschedule = async () => {
    if (!reschedulingSession || !selectedRescheduleSlot || !user?.uid) return
    setRescheduleLoading(true)
    setRescheduleError('')
    try {
      await rescheduleBooking(reschedulingSession.id, selectedRescheduleSlot.id, user.uid)
      setReschedulingSession(null)
      setSelectedRescheduleSlot(null)
    } catch (err: any) {
      console.error(err)
      setRescheduleError(err.message || 'Rescheduling failed. Please try again.')
    } finally {
      setRescheduleLoading(false)
    }
  }

  // Community posts count fetch
  useEffect(() => {
    if (user?.uid) {
      getUserPosts(user.uid)
        .then((posts: any[]) => {
          setUserPostsCount(posts.length)
        })
        .catch((err: any) => {
          console.error('Failed to fetch user posts:', err)
        })
    }
  }, [user?.uid])

  // Mentors list subscription for recommendations
  useEffect(() => {
    const unsubscribe = subscribeToMentors((allMentors) => {
      if (allMentors.length > 0) {
        const userD = user?.domains || []
        const sorted = [...allMentors].sort((a, b) => {
          const aMatch = (a.domains || []).filter(d => userD.includes(d)).length
          const bMatch = (b.domains || []).filter(d => userD.includes(d)).length
          return bMatch - aMatch
        })
        setRecommendedMentors(sorted.slice(0, 3))
      }
    })
    return () => unsubscribe()
  }, [user?.domains])

  const unreadCount = notificationsList.filter(n => !n.isRead).length

  const handleJoinSession = (mentorName: string, id: string) => {
    setSessionMentorName(mentorName)
    setActiveSessionId(id)
  }

  const handleMarkAllRead = async () => {
    if (!user?.uid) return
    markAllNotificationsRead()
    try {
      await markAllNotificationsAsRead(user.uid)
    } catch (err) {
      console.error(err)
    }
  }

  const handleMarkRead = async (id: string | number, actionUrl?: string) => {
    markNotificationRead(id)
    try {
      await markNotificationAsRead(String(id))
    } catch (err) {
      console.error(err)
    }
    if (actionUrl) {
      navigate(actionUrl)
    }
  }

  const greeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  }

  const currentDateStr = (() => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  })();

  const getMinutesToSession = (sessionDate: string, sessionTime: string) => {
    if (!sessionDate || !sessionTime) return Infinity;
    const sessionDateTime = new Date(`${sessionDate}T${sessionTime}`);
    const diffMs = sessionDateTime.getTime() - Date.now();
    return diffMs / (1000 * 60);
  };

  const handleSendReminder = async (booking: any) => {
    const mentorName = booking.mentor || 'Mentor';
    const phone = booking.mentorPhone;
    if (!phone) {
      alert('Mentor phone number is not available to send WhatsApp reminder.');
      return;
    }
    const sessionLink = window.location.origin + '/dashboard';
    const text = `Hi ${mentorName}, this is a reminder that my session with you starts in 30 minutes. Join here: ${sessionLink}`;
    
    let formattedPhone = phone.trim();
    if (formattedPhone.length === 10) {
      formattedPhone = '91' + formattedPhone;
    }

    try {
      await markBookingReminderSent(booking.id);
      window.open(`https://api.whatsapp.com/send?phone=${formattedPhone}&text=${encodeURIComponent(text)}`, '_blank');
    } catch (err) {
      console.error(err);
    }
  };

  // Filter bookings to upcoming sessions format: confirmed or pending, AND date >= current date
  const upcomingSessions = bookings
    .filter(b => {
      const isStatusMatch = b.status === 'confirmed' || b.status === 'pending';
      const isUpcomingDate = b.sessionDate >= currentDateStr;
      return isStatusMatch && isUpcomingDate;
    })
    .map(b => {
      const mentor = MOCK_MENTORS.find(m => m.uid === b.guideId)
      return {
        id: b.id || b.bookingId,
        sessionId: b.sessionId || null,
        mentor: b.mentorName || mentor?.displayName || 'LifeFundies Mentor',
        mentorPhotoURL: b.mentorPhotoURL || mentor?.photoURL || '',
        domain: b.domain,
        date: b.sessionDate,
        time: b.sessionTime,
        duration: b.sessionDuration || 60,
        status: b.status,
        mentorPhone: b.mentorPhone || '',
        reminderSent: b.reminderSent === true,
        reminder10Sent: b.reminder10Sent === true,
        guideId: b.guideId,
        category: b.category,
        price: b.price || b.finalAmount || 0,
      }
    })

  const completedSessions = bookings
    .filter(b => b.status === 'completed')
    .map(b => {
      const mentor = MOCK_MENTORS.find(m => m.uid === b.guideId)
      return {
        id: b.id || b.bookingId,
        mentor: b.mentorName || mentor?.displayName || 'LifeFundies Mentor',
        mentorPhotoURL: b.mentorPhotoURL || mentor?.photoURL || '',
        category: b.category || 'peer-buddy',
        domain: b.domain,
        date: b.sessionDate,
        time: b.sessionTime,
        duration: b.sessionDuration || 60,
        status: b.status,
        userNotes: b.userNotes || '',
      }
    })

  const cancelledSessions = bookings
    .filter(b => b.status === 'cancelled')
    .map(b => {
      const mentor = MOCK_MENTORS.find(m => m.uid === b.guideId)
      return {
        id: b.id || b.bookingId,
        mentor: b.mentorName || mentor?.displayName || 'LifeFundies Mentor',
        mentorPhotoURL: b.mentorPhotoURL || mentor?.photoURL || '',
        category: b.category || 'peer-buddy',
        domain: b.domain,
        date: b.sessionDate,
        time: b.sessionTime,
        duration: b.sessionDuration || 60,
        status: b.status,
        userNotes: b.userNotes || '',
      }
    })

  // Dynamic progress tracker calculations
  const profileCompleteness = (() => {
    if (!user) return 0;
    let stepsCompleted = 0;
    
    // 1. profile photo uploaded
    if (user.photoURL && user.photoURL.trim() !== '') {
      stepsCompleted += 1;
    }
    
    // 2. bio added
    if ((user as any).bio && (user as any).bio.trim() !== '') {
      stepsCompleted += 1;
    }
    
    // 3. domains selected
    if (user.domains && user.domains.length > 0) {
      stepsCompleted += 1;
    }
    
    // 4. phone/email verified (present/completed)
    const hasEmail = user.email && user.email.trim() !== '';
    const hasPhone = user.phone && user.phone.trim() !== '';
    if (hasEmail && hasPhone) {
      stepsCompleted += 1;
    }
    
    // 5. onboarding questions completed
    if (user.onboardingComplete) {
      stepsCompleted += 1;
    }
    
    // 6. at least one mentor interest selected
    const interests = (user as any).mentorInterests || [];
    if (interests.length > 0) {
      stepsCompleted += 1;
    }
    
    return Math.round((stepsCompleted / 6) * 100);
  })();

  const onboardingProgress = (() => {
    if (!user) return 0;
    if (user.onboardingComplete) return 100;
    
    let stepsCompleted = 0;
    if ((user as any).selectedWelcomeOption) stepsCompleted += 1;
    if (user.city || user.profession || user.ageGroup) stepsCompleted += 1;
    if (user.domains && user.domains.length > 0) stepsCompleted += 1;
    if ((user as any).challenge) stepsCompleted += 1;
    if ((user as any).sessionPreference) stepsCompleted += 1;
    
    return Math.round((stepsCompleted / 5) * 100);
  })();

  const activeBookings = bookings.filter(b => b.status !== 'cancelled')
  const completedBookings = activeBookings.filter(b => b.status === 'completed')
  const sessionsProgress = activeBookings.length > 0
    ? Math.round((completedBookings.length / activeBookings.length) * 100)
    : 0

  const completedSessionsCount = completedBookings.length.toString()

  const averageRating = (() => {
    const ratedBookings = bookings.filter(b => b.status === 'completed' && b.rating)
    if (ratedBookings.length === 0) return '—'
    const total = ratedBookings.reduce((sum, b) => sum + b.rating, 0)
    return (total / ratedBookings.length).toFixed(1)
  })()

  return (
    <div className="page-wrapper">
      <div className="dashboard">
        <div className="container">
          {/* Header */}
          <div className="dashboard__header animate-fadeInUp">
            <div>
              <p className="text-muted body-sm">{greeting()},</p>
              <h1 className="display-2">
                <span className="dashboard__name">{user?.displayName || 'Explorer'}</span> 👋
              </h1>
              <p className="text-muted">Continue your journey to life clarity.</p>
            </div>
            <div className="dashboard__header-actions" style={{ position: 'relative' }}>
              <button 
                className="btn btn-outline" 
                id="notification-btn" 
                aria-label="Notifications"
                onClick={() => setShowNotifications(!showNotifications)}
              >
                <Bell size={16} />
                {unreadCount > 0 && (
                  <span className="badge badge-accent" style={{ padding: '0.1rem 0.4rem' }}>
                    {unreadCount}
                  </span>
                )}
              </button>

              {showNotifications && (
                <div className="dashboard__notifications-dropdown animate-fadeIn">
                  <div className="flex-between" style={{ padding: 'var(--sp-3) var(--sp-4)', borderBottom: '1px solid var(--clr-border)' }}>
                    <span className="body-sm font-semibold">Notifications</span>
                    {unreadCount > 0 && (
                      <button className="btn btn-ghost btn-sm" style={{ padding: 0, fontSize: '0.75rem' }} onClick={handleMarkAllRead}>
                        Mark all read
                      </button>
                    )}
                  </div>
                  <div className="dashboard__notifications-list">
                    {notificationsList.length > 0 ? (
                      notificationsList.map(n => (
                        <div 
                          key={n.id} 
                          className={`dashboard__notification-item ${!n.isRead ? 'dashboard__notification-item--unread' : ''}`}
                          onClick={() => handleMarkRead(n.id, n.actionUrl)}
                          style={{ cursor: 'pointer' }}
                        >
                          {n.text}
                        </div>
                      ))
                    ) : (
                      <div className="dashboard__notification-item text-center text-muted" style={{ padding: 'var(--sp-4)' }}>
                        No notifications
                      </div>
                    )}
                  </div>
                </div>
              )}

              <Link to="/mentors" className="btn btn-primary" id="book-session-btn">
                Book a Session <ArrowRight size={16} />
              </Link>
            </div>
          </div>

          <div className="dashboard__grid">
            {/* Left column */}
            <div className="dashboard__main">
              {/* Stats row */}
              <div className="dashboard__stats animate-fadeInUp delay-100">
                {[
                  { icon: Calendar, label: 'Sessions Done', value: completedSessionsCount, color: 'var(--clr-primary)' },
                  { icon: Star, label: 'Avg Rating Given', value: averageRating, color: 'var(--clr-secondary)' },
                  { icon: TrendingUp, label: 'Domains Explored', value: userDomains.length.toString(), color: 'var(--clr-accent)' },
                  { icon: Heart, label: 'Community Posts', value: userPostsCount.toString(), color: 'var(--clr-purple)' },
                ].map((stat, i) => (
                  <div key={i} className="dashboard__stat-card">
                    <div className="dashboard__stat-icon" style={{ background: `${stat.color}20`, color: stat.color }}>
                      <stat.icon size={20} />
                    </div>
                    <div>
                      <p className="dashboard__stat-value">{stat.value}</p>
                      <p className="body-sm text-muted">{stat.label}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Upcoming Sessions */}
              <div className="dashboard__section animate-fadeInUp delay-200">
                <div className="flex-between" style={{ marginBottom: 'var(--sp-4)' }}>
                  <h2 className="heading-2">Upcoming Sessions</h2>
                  <Link to="/sessions" className="btn btn-ghost btn-sm">View all</Link>
                </div>
                {loadingBookings ? (
                  <div className="flex-col gap-3">
                    <SessionSkeleton />
                    <SessionSkeleton />
                  </div>
                ) : upcomingSessions.length > 0 ? (
                  <div className="flex-col gap-3">
                    {upcomingSessions.map(session => {
                      const isJoinable = session.status === 'confirmed' && !!session.sessionId;
                      const mToSession = getMinutesToSession(session.date, session.time);
                      return (
                        <div key={session.id} className="session-card" id={`session-${session.id}`}>
                          <div className="avatar avatar-md" style={{ overflow: 'hidden', border: '1px solid var(--clr-border)' }}>
                            {session.mentorPhotoURL ? (
                              <img src={session.mentorPhotoURL} alt={session.mentor} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                              getInitials(session.mentor)
                            )}
                          </div>
                          <div className="session-card__info">
                            <p className="session-card__mentor">{session.mentor}</p>
                            <div className="flex gap-3">
                              <span className="body-sm text-muted flex gap-1"><Calendar size={13} /> {session.date}</span>
                              <span className="body-sm text-muted flex gap-1"><Clock size={13} /> {session.time}</span>
                              <span className="body-sm text-muted flex gap-1"><BookOpen size={13} /> {session.domain}</span>
                            </div>
                          </div>
                          <div className="session-card__actions">
                            <span className={`badge ${session.status === 'confirmed' ? 'badge-primary' : 'badge-secondary'}`}>
                              {session.status}
                            </span>
                            {mToSession <= 30 && mToSession >= -60 && !session.reminderSent && (
                              <button
                                className="btn btn-accent btn-sm"
                                onClick={() => handleSendReminder(session)}
                              >
                                WhatsApp
                              </button>
                            )}
                            <button 
                              className="btn btn-outline btn-sm"
                              onClick={() => handleJoinSession(session.mentor, session.sessionId || session.id)}
                              disabled={!isJoinable}
                            >
                              Join
                            </button>
                            {session.status === 'confirmed' && mToSession > 0 && (
                              <button 
                                className="btn btn-outline btn-sm"
                                onClick={() => {
                                  setReschedulingSession(session)
                                  setSelectedRescheduleSlot(null)
                                  setRescheduleError('')
                                }}
                              >
                                Reschedule
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="dashboard__empty">
                    <Calendar size={32} />
                    <p style={{ fontWeight: 600, color: 'var(--clr-text)' }}>No upcoming sessions yet</p>
                    <p className="body-sm text-muted" style={{ marginBottom: 'var(--sp-2)' }}>
                      Book your first mentorship session to get started.
                    </p>
                    <Link to="/mentors" className="btn btn-primary btn-sm">Book a Session</Link>
                  </div>
                )}
              </div>

              {/* Session History */}
              <div className="dashboard__section animate-fadeInUp delay-250">
                <div className="flex-between" style={{ marginBottom: 'var(--sp-4)' }}>
                  <h2 className="heading-2">Session History</h2>
                  <div className="flex gap-2" style={{ background: 'var(--clr-bg-alt)', padding: '4px', borderRadius: 'var(--radius-md)' }}>
                    <button 
                      type="button"
                      className={`btn btn-sm ${historyTab === 'completed' ? 'btn-primary' : 'btn-ghost'}`}
                      onClick={() => setHistoryTab('completed')}
                      style={{ padding: '0.25rem 0.75rem', fontSize: '0.75rem', height: '28px' }}
                    >
                      Completed ({completedSessions.length})
                    </button>
                    <button 
                      type="button"
                      className={`btn btn-sm ${historyTab === 'cancelled' ? 'btn-primary' : 'btn-ghost'}`}
                      onClick={() => setHistoryTab('cancelled')}
                      style={{ padding: '0.25rem 0.75rem', fontSize: '0.75rem', height: '28px' }}
                    >
                      Cancelled ({cancelledSessions.length})
                    </button>
                  </div>
                </div>

                {historyTab === 'completed' ? (
                  completedSessions.length > 0 ? (
                    <div className="flex-col gap-3">
                      {completedSessions.map(session => (
                        <div key={session.id} className="session-card" style={{ padding: '1rem' }}>
                          <div className="avatar avatar-md" style={{ overflow: 'hidden', border: '1px solid var(--clr-border)' }}>
                            {session.mentorPhotoURL ? (
                              <img src={session.mentorPhotoURL} alt={session.mentor} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                              getInitials(session.mentor)
                            )}
                          </div>
                          <div className="session-card__info" style={{ flex: 1 }}>
                            <p className="session-card__mentor">
                              {session.mentor}
                              <span className="badge badge-secondary" style={{ marginLeft: 'var(--sp-2)', fontSize: '0.65rem', textTransform: 'capitalize', padding: '2px 6px' }}>
                                {session.category.replace('-', ' ')}
                              </span>
                            </p>
                            <div className="flex gap-3" style={{ marginTop: '2px' }}>
                              <span className="body-sm text-muted flex gap-1"><Calendar size={13} /> {session.date}</span>
                              <span className="body-sm text-muted flex gap-1"><Clock size={13} /> {session.duration}m</span>
                              <span className="body-sm text-muted flex gap-1"><BookOpen size={13} /> {session.domain}</span>
                            </div>
                            {session.userNotes && session.userNotes !== 'Not specified' && (
                              <p className="body-sm text-muted" style={{ marginTop: '6px', fontStyle: 'italic', fontSize: '0.75rem', paddingLeft: '8px', borderLeft: '2px solid var(--clr-border)' }}>
                                "{session.userNotes}"
                              </p>
                            )}
                          </div>
                          <div className="session-card__actions">
                            <span className="badge badge-secondary" style={{ padding: '4px 8px' }}>
                              Completed
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="dashboard__empty" style={{ padding: '2rem 1rem' }}>
                      <p className="body-sm text-muted">No completed sessions yet.</p>
                    </div>
                  )
                ) : (
                  cancelledSessions.length > 0 ? (
                    <div className="flex-col gap-3">
                      {cancelledSessions.map(session => (
                        <div key={session.id} className="session-card" style={{ padding: '1rem', opacity: 0.85 }}>
                          <div className="avatar avatar-md" style={{ overflow: 'hidden', border: '1px solid var(--clr-border)', filter: 'grayscale(100%)' }}>
                            {session.mentorPhotoURL ? (
                              <img src={session.mentorPhotoURL} alt={session.mentor} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                              getInitials(session.mentor)
                            )}
                          </div>
                          <div className="session-card__info" style={{ flex: 1 }}>
                            <p className="session-card__mentor" style={{ color: 'var(--clr-text-muted)' }}>
                              {session.mentor}
                              <span className="badge badge-outline" style={{ marginLeft: 'var(--sp-2)', fontSize: '0.65rem', textTransform: 'capitalize', padding: '2px 6px' }}>
                                {session.category.replace('-', ' ')}
                              </span>
                            </p>
                            <div className="flex gap-3" style={{ marginTop: '2px' }}>
                              <span className="body-sm text-muted flex gap-1"><Calendar size={13} /> {session.date}</span>
                              <span className="body-sm text-muted flex gap-1"><Clock size={13} /> {session.duration}m</span>
                              <span className="body-sm text-muted flex gap-1"><BookOpen size={13} /> {session.domain}</span>
                            </div>
                          </div>
                          <div className="session-card__actions">
                            <span className="badge badge-accent" style={{ padding: '4px 8px' }}>
                              Cancelled
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="dashboard__empty" style={{ padding: '2rem 1rem' }}>
                      <p className="body-sm text-muted">No cancelled sessions.</p>
                    </div>
                  )
                )}
              </div>

               {/* Recommended Mentors */}
              <div className="dashboard__section animate-fadeInUp delay-300">
                <div className="flex-between" style={{ marginBottom: 'var(--sp-4)' }}>
                  <h2 className="heading-2">Recommended for You</h2>
                  <Link to="/mentors" className="btn btn-ghost btn-sm">See all</Link>
                </div>
                <div className="dashboard__mentor-list">
                  {recommendedMentors.map((mentor, i) => (
                    <div key={mentor.uid} className="dashboard__mentor-card" id={`rec-mentor-${mentor.uid}`}>
                      <div className="avatar avatar-lg" style={{ background: `hsl(${i * 80 + 40}, 60%, 40%)`, overflow: 'hidden' }}>
                        {mentor.photoURL ? (
                          <img src={mentor.photoURL} alt={mentor.displayName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          getInitials(mentor.displayName)
                        )}
                      </div>
                      <div className="dashboard__mentor-info">
                        <p className="dashboard__mentor-name">{mentor.displayName}</p>
                        <div className="flex gap-2">
                          {mentor.domains.slice(0, 2).map((d: any) => {
                            const domain = LIFE_DOMAINS.find(x => x.id === d)
                            return domain ? <span key={d} className="badge badge-primary" style={{ fontSize: '0.7rem' }}>{domain.icon} {domain.label}</span> : null
                          })}
                        </div>
                        <div className="flex gap-3" style={{ marginTop: 'var(--sp-1)' }}>
                          <span className="body-sm text-muted"><Star size={12} style={{ display: 'inline' }} /> {mentor.rating}</span>
                          <span className="body-sm text-muted"><Users size={12} style={{ display: 'inline' }} /> {mentor.totalSessions} sessions</span>
                        </div>
                      </div>
                      <div className="dashboard__mentor-cta">
                        <p className="mentor-card__price">{formatCurrency(mentor.sessionPrice)}</p>
                        <Link to={`/mentors/${mentor.uid}`} className="btn btn-outline btn-sm">Book</Link>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right sidebar */}
            <div className="dashboard__sidebar">
              {/* My Domains */}
              <div className="dashboard__widget animate-fadeInUp delay-200" id="my-domains-widget">
                <h3 className="heading-3">My Domains</h3>
                {userDomains.length > 0 ? (
                  <div className="flex-col gap-3" style={{ marginTop: 'var(--sp-4)' }}>
                    {userDomains.map(domain => domain && (
                      <Link key={domain.id} to={`/mentors?domain=${domain.id}`} className="domain-pill">
                        <span>{domain.icon}</span>
                        <span>{domain.label}</span>
                        <ArrowRight size={14} style={{ marginLeft: 'auto', color: 'var(--clr-text-subtle)' }} />
                      </Link>
                    ))}
                    <Link to="/settings" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }}>Edit domains</Link>
                  </div>
                ) : (
                  <div className="dashboard__empty">
                    <p className="body-sm text-muted">No domains selected yet</p>
                    <Link to="/onboarding" className="btn btn-primary btn-sm">Set up</Link>
                  </div>
                )}
              </div>

              {/* Progress Tracker */}
              <div className="dashboard__widget animate-fadeInUp delay-300" id="progress-widget">
                <h3 className="heading-3">Your Progress</h3>
                <div className="flex-col gap-4" style={{ marginTop: 'var(--sp-4)' }}>
                  {[
                    { label: 'Profile complete', value: profileCompleteness },
                    { label: 'Onboarding done', value: onboardingProgress },
                    { label: 'Sessions attended', value: sessionsProgress },
                  ].map((item, i) => (
                    <div key={i}>
                      <div className="flex-between" style={{ marginBottom: 'var(--sp-2)' }}>
                        <span className="body-sm">{item.label}</span>
                        <span className="body-sm text-muted">{item.value}%</span>
                      </div>
                      <div className="progress-bar">
                        <div className="progress-fill" style={{ width: `${item.value}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Community Teaser */}
              <div className="dashboard__widget dashboard__widget--accent animate-fadeInUp delay-400" id="community-widget">
                <div className="widget-accent__icon">💬</div>
                <h3 className="heading-3">Join the Community</h3>
                <p className="body-sm text-muted">Connect with peers who are on the same journey. Share, learn, and grow together.</p>
                <Link to="/community" className="btn btn-accent btn-sm" style={{ marginTop: 'var(--sp-4)', width: '100%' }}>
                  Explore Community
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {activeSessionId && (
        <div className="video-modal-overlay">
          <div className="video-modal-card animate-fadeInUp">
            <div className="video-modal-header">
              <span className="video-modal-title">Live Video Room — {sessionMentorName}</span>
              <button 
                type="button"
                className="btn btn-ghost btn-sm video-modal-close-btn" 
                onClick={() => setActiveSessionId(null)}
                aria-label="Close video room"
              >
                <X size={20} />
              </button>
            </div>
            <VideoRoom 
              sessionId={activeSessionId}
              userName={user?.displayName || 'Client'}
              guideName={sessionMentorName}
              onLeave={() => setActiveSessionId(null)}
            />
          </div>
        </div>
      )}

      {reschedulingSession && (
        <div className="video-modal-overlay">
          <div className="video-modal-card animate-fadeInUp" style={{ maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="video-modal-header">
              <span className="video-modal-title">Reschedule Session</span>
              <button 
                type="button"
                className="btn btn-ghost btn-sm video-modal-close-btn" 
                onClick={() => setReschedulingSession(null)}
                aria-label="Close reschedule modal"
              >
                <X size={20} />
              </button>
            </div>
            <div style={{ padding: 'var(--sp-6)' }}>
              {rescheduleError && (
                <div className="booking-modal-error" style={{ marginBottom: 'var(--sp-4)', color: 'var(--clr-accent)', background: 'rgba(239, 68, 68, 0.1)', padding: 'var(--sp-3)', borderRadius: 'var(--radius-md)', fontSize: '0.875rem' }}>
                  {rescheduleError}
                </div>
              )}
              <p className="body-sm text-muted" style={{ marginBottom: 'var(--sp-4)' }}>
                Rescheduling your session with <strong>{reschedulingSession.mentor}</strong>. You are currently scheduled for {reschedulingSession.date} at {reschedulingSession.time}.
              </p>
              
              <SlotSelection
                guideId={reschedulingSession.guideId}
                guidePrice={reschedulingSession.price}
                selectedCategory={reschedulingSession.category}
                selectedDuration={reschedulingSession.duration}
                onSlotSelect={(slot) => setSelectedRescheduleSlot(slot)}
              />

              <div className="flex gap-3" style={{ marginTop: 'var(--sp-6)', borderTop: '1px solid var(--clr-border)', paddingTop: 'var(--sp-4)' }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setReschedulingSession(null)}
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleConfirmReschedule}
                  disabled={rescheduleLoading || !selectedRescheduleSlot}
                  style={{ flex: 1 }}
                >
                  {rescheduleLoading ? 'Rescheduling...' : 'Confirm Reschedule'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
