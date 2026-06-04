import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Mail, Lock, User, Phone, ArrowRight, Shield, X, Loader } from 'lucide-react'
import { useAuthStore } from '../stores'
import type { User as UserType } from '../types'
import { signInWithEmail, signUpWithEmail, signInWithGoogle, signInAnonymously } from '../lib/authService'
import '../pages/Auth/Auth.css'

export default function AuthModal() {
  const { authModalOpen, setAuthModalOpen, setUser } = useAuthStore()
  const navigate = useNavigate()
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState<'seeker' | 'mentor'>('seeker')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  if (!authModalOpen) return null

  const handleGoogleLogin = async () => {
    setLoading(true)
    setError('')
    try {
      const loggedInUser = await signInWithGoogle(role)
      setUser(loggedInUser)
      setAuthModalOpen(false)
      if (loggedInUser.role === 'mentor') {
        navigate('/mentor-portal')
      } else if (!loggedInUser.onboardingComplete) {
        navigate('/onboarding')
      } else {
        navigate('/dashboard')
      }
    } catch (err: any) {
      console.error(err)
      setError(err.message || 'Google sign in failed')
    } finally {
      setLoading(false)
    }
  }

  const handleAnonymousLogin = async () => {
    setLoading(true)
    setError('')
    try {
      const loggedInUser = await signInAnonymously()
      setUser(loggedInUser)
      setAuthModalOpen(false)
      if (loggedInUser.role === 'mentor') {
        navigate('/mentor-portal')
      } else if (!loggedInUser.onboardingComplete) {
        navigate('/onboarding')
      } else {
        navigate('/dashboard')
      }
    } catch (err: any) {
      console.error(err)
      setError(err.message || 'Anonymous sign in failed')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      let loggedInUser: UserType
      
      if (isLogin) {
        loggedInUser = await signInWithEmail(email, password, role)
      } else {
        loggedInUser = await signUpWithEmail(email, password, name, phone, role)
      }
      
      setUser(loggedInUser)
      setAuthModalOpen(false)
      if (loggedInUser.role === 'mentor') {
        navigate('/mentor-portal')
      } else if (!loggedInUser.onboardingComplete) {
        navigate('/onboarding')
      } else {
        navigate('/dashboard')
      }
    } catch (err: any) {
      console.error(err)
      setError(err.message || `Failed to ${isLogin ? 'sign in' : 'create account'}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div 
      className="auth-modal-overlay" 
      onClick={() => setAuthModalOpen(false)}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
        padding: '1rem',
        overflowY: 'auto'
      }}
    >
      <div 
        className="auth-page" 
        onClick={e => e.stopPropagation()}
        style={{ 
          minHeight: 'auto', 
          background: 'transparent', 
          padding: 0,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          width: '100%',
          maxWidth: isLogin ? '440px' : '560px'
        }}
      >
        <div className="auth-card" style={{ width: '100%', maxWidth: '100%', position: 'relative' }}>
          <button 
            type="button" 
            className="auth-modal-close" 
            onClick={() => setAuthModalOpen(false)}
            aria-label="Close authentication modal"
            style={{
              position: 'absolute',
              top: '1.25rem',
              right: '1.25rem',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--clr-text-subtle)',
              transition: 'color var(--duration-fast)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              zIndex: 10
            }}
          >
            <X size={20} />
          </button>

          <div className="auth-card__header">
            <div className="auth-logo">
              <img src="/logo.png" alt="LifeFundies Logo" style={{ height: '50px', objectFit: 'contain', margin: '0 auto', display: 'block' }} />
            </div>
            <h1 className="heading-1">{isLogin ? 'Welcome back' : 'Join LifeFundies'}</h1>
            <p className="body-sm text-muted">
              {isLogin ? 'Sign in to continue your journey' : 'Start your journey to life clarity today'}
            </p>
          </div>

          <div className="role-selector">
            <button
              type="button"
              className={`role-btn ${role === 'seeker' ? 'role-btn--active' : ''}`}
              id="modal-role-user"
              onClick={() => setRole('seeker')}
            >
              <span className="role-btn__icon">🙋</span>
              <div>
                <p className="role-btn__label">Seeker</p>
                <p className="body-sm text-muted">I want guidance</p>
              </div>
            </button>
            <button
              type="button"
              className={`role-btn ${role === 'mentor' ? 'role-btn--active' : ''}`}
              id="modal-role-mentor"
              onClick={() => setRole('mentor')}
            >
              <span className="role-btn__icon">👨‍💼</span>
              <div>
                <p className="role-btn__label">Mentor</p>
                <p className="body-sm text-muted">I want to guide</p>
              </div>
            </button>
          </div>

          <div className="auth-social" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
            <button className="auth-social-btn" id="modal-google-login" type="button" onClick={handleGoogleLogin} disabled={loading}>
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" width="18" />
              Continue with Google
            </button>
            {role === 'seeker' && (
              <button className="auth-social-btn" id="modal-anonymous-login" type="button" onClick={handleAnonymousLogin} disabled={loading} style={{ background: 'var(--clr-bg-card)', borderColor: 'var(--clr-border-strong)' }}>
                <span style={{ fontSize: '1.1rem' }}>🎭</span>
                Continue Anonymously
              </button>
            )}
          </div>

          <div className="auth-divider">
            <span>or continue with email</span>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            {error && <div className="auth-error">{error}</div>}

            {!isLogin && (
              <div className="auth-form-grid">
                <div className="form-group">
                  <label className="form-label" htmlFor="modal-reg-name">Full Name</label>
                  <div className="input-wrapper">
                    <User size={16} className="input-icon" />
                    <input 
                      id="modal-reg-name" 
                      type="text" 
                      className="form-input input-with-icon" 
                      placeholder="Asmit Sharma" 
                      value={name} 
                      onChange={e => setName(e.target.value)} 
                      required 
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="modal-reg-phone">Phone Number</label>
                  <div className="input-wrapper">
                    <Phone size={16} className="input-icon" />
                    <input 
                      id="modal-reg-phone" 
                      type="tel" 
                      className="form-input input-with-icon" 
                      placeholder="+91 98765 43210" 
                      value={phone} 
                      onChange={e => setPhone(e.target.value)} 
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="form-group">
              <label className="form-label" htmlFor="modal-auth-email">Email address</label>
              <div className="input-wrapper">
                <Mail size={16} className="input-icon" />
                <input
                  id="modal-auth-email"
                  type="email"
                  className="form-input input-with-icon"
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <div className="flex-between">
                <label className="form-label" htmlFor="modal-auth-password">Password</label>
                {isLogin && (
                  <button 
                    type="button"
                    onClick={() => {
                      setAuthModalOpen(false)
                      navigate('/forgot-password')
                    }}
                    className="auth-forgot"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="input-wrapper">
                <Lock size={16} className="input-icon" />
                <input
                  id="modal-auth-password"
                  type={showPass ? 'text' : 'password'}
                  className="form-input input-with-icon input-with-icon-right"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  minLength={isLogin ? undefined : 8}
                  required
                />
                <button type="button" className="input-toggle" onClick={() => setShowPass(!showPass)} aria-label="Toggle password visibility">
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button type="submit" className="btn btn-primary" id="modal-auth-submit" disabled={loading} style={{ width: '100%', padding: '0.875rem' }}>
              {loading ? (
                <span className="spinner" style={{ width: 20, height: 20, borderWidth: 2 }} />
              ) : (
                <>
                  {isLogin ? 'Sign In' : 'Create Account'} <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          <p className="auth-switch body-sm">
            {isLogin ? (
              <>
                Don't have an account?{' '}
                <button 
                  type="button" 
                  onClick={() => setIsLogin(false)} 
                  className="auth-switch__link"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  Create one free
                </button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button 
                  type="button" 
                  onClick={() => setIsLogin(true)} 
                  className="auth-switch__link"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  Sign in
                </button>
              </>
            )}
          </p>

          <div className="auth-trust">
            <Shield size={12} /> <span className="body-sm text-muted">Your sessions are 100% confidential & secure</span>
          </div>
        </div>
      </div>
    </div>
  )
}
