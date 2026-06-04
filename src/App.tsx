import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Navbar from './components/layout/Navbar'
import Footer from './components/layout/Footer'
import LandingPage from './pages/Landing/Landing'
import { LoginPage, RegisterPage, ForgotPasswordPage, MentorRegisterPage } from './pages/Auth/Auth'
import OnboardingPage from './pages/Onboarding/Onboarding'
import MentorOnboardingPage from './pages/MentorOnboarding/MentorOnboarding'
import DashboardPage from './pages/Dashboard/Dashboard'
import MentorsPage from './pages/Mentors/Mentors'
import CommunityPage from './pages/Community/Community'
import SessionsPage from './pages/Sessions/Sessions'
import SettingsPage from './pages/Settings/Settings'
import MentorPortalPage from './pages/MentorPortal/MentorPortal'
import AdminPage from './pages/Admin/Admin'
import { useAuthStore, useAppStore } from './stores'
import AuthModal from './components/AuthModal'
import FAQPage from './pages/FAQ/FAQ'
import { onAuthStateChange } from './lib/authService'
import { subscribeToUserNotifications } from './lib/notificationRepository'
import Preloader from './components/Preloader'
import ContactPage from './pages/Contact/Contact'
import ScrollToHash from './components/layout/ScrollToHash'

// Protected route wrapper
function ProtectedRoute({ children, requireRole }: { children: React.ReactNode; requireRole?: string }) {
  const { user, loading } = useAuthStore()
  
  if (loading) return <Preloader />
  if (!user) return <Navigate to="/login" replace />
  
  // Prevent anonymous users from accessing routes that require a specific role (like 'mentor' or 'admin')
  if (user.isAnonymous && requireRole) {
    return <Navigate to="/dashboard" replace />
  }
  
  if (requireRole && user.role !== requireRole && user.role !== 'admin') {
    return <Navigate to="/dashboard" replace />
  }

  // Prevent mentors from accessing seeker pages (routes without a requireRole parameter)
  if (!requireRole && user.role === 'mentor') {
    return <Navigate to="/mentor-portal" replace />
  }
  
  return <>{children}</>
}

// Pages that show navbar + footer
function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar />
      {children}
      <Footer />
    </>
  )
}

// Pages that only show navbar (no footer)
function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar />
      {children}
    </>
  )
}

export default function App() {
  const { user, setUser, setLoading, loading } = useAuthStore()
  const { setNotificationsList } = useAppStore()

  useEffect(() => {
    // Set up auth state listener
    const unsubscribe = onAuthStateChange((user) => {
      setUser(user)
      setLoading(false)
    })

    return () => unsubscribe()
  }, [setUser, setLoading])

  useEffect(() => {
    let unsubscribeNotifs: (() => void) | null = null

    if (user?.uid) {
      unsubscribeNotifs = subscribeToUserNotifications(user.uid, (data: any) => {
        const formatted = data.map((n: any) => ({
          id: n.id,
          text: `${n.title || 'Notification'}${n.body ? `: ${n.body}` : ''}`,
          isRead: n.read === true,
          actionUrl: n.actionUrl || (user.role === 'mentor' ? '/mentor-portal' : '/dashboard'),
          type: n.type || 'notification'
        }))
        setNotificationsList(formatted)
      })
    } else {
      setNotificationsList([])
    }

    return () => {
      if (unsubscribeNotifs) {
        unsubscribeNotifs()
      }
    }
  }, [user?.uid, user?.role, setNotificationsList])

  if (loading) {
    return <Preloader />
  }

  return (
    <BrowserRouter>
      <ScrollToHash />
      <AuthModal />
      <Routes>
        {/* Public */}
        <Route path="/" element={<PublicLayout><LandingPage /></PublicLayout>} />
        <Route path="/mentors" element={<PublicLayout><MentorsPage /></PublicLayout>} />
        <Route path="/mentors/:id" element={<PublicLayout><MentorsPage /></PublicLayout>} />
        <Route path="/community" element={<PublicLayout><CommunityPage /></PublicLayout>} />
        <Route path="/faq" element={<PublicLayout><FAQPage /></PublicLayout>} />
        <Route path="/contact" element={<PublicLayout><ContactPage /></PublicLayout>} />

        {/* Auth */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/mentor-register" element={<MentorRegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />

        {/* Protected — User */}
        <Route path="/onboarding" element={
          <ProtectedRoute><OnboardingPage /></ProtectedRoute>
        } />
        <Route path="/dashboard" element={
          <ProtectedRoute><AppLayout><DashboardPage /></AppLayout></ProtectedRoute>
        } />
        <Route path="/sessions" element={
          <ProtectedRoute><AppLayout><SessionsPage /></AppLayout></ProtectedRoute>
        } />
        <Route path="/settings" element={
          <ProtectedRoute><AppLayout><SettingsPage /></AppLayout></ProtectedRoute>
        } />

        {/* Protected — Mentor */}
        <Route path="/mentor-onboarding" element={
          <ProtectedRoute requireRole="mentor"><MentorOnboardingPage /></ProtectedRoute>
        } />
        <Route path="/mentor-portal" element={
          <ProtectedRoute requireRole="mentor"><AppLayout><MentorPortalPage /></AppLayout></ProtectedRoute>
        } />

        {/* Protected — Admin */}
        <Route path="/admin" element={
          <ProtectedRoute requireRole="admin"><AppLayout><AdminPage /></AppLayout></ProtectedRoute>
        } />

        {/* 404 */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  )
}

function NotFoundPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: '1.5rem', textAlign: 'center', padding: '2rem' }}>
      <span style={{ fontSize: '5rem' }}>🌿</span>
      <h1 className="display-2">Page Not Found</h1>
      <p className="text-muted body-lg">The page you're looking for doesn't exist.</p>
      <a href="/" className="btn btn-primary btn-lg">Go Home</a>
    </div>
  )
}
