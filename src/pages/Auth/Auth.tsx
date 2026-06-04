import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Mail, Lock, User, Phone, ArrowRight, Shield } from 'lucide-react'
import { useAuthStore } from '../../stores'
import { signInWithEmail, signUpWithEmail, signInWithGoogle, signInAnonymously, resetPassword } from '../../lib/authService'
import { doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import './Auth.css'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'seeker' | 'mentor'>('seeker')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { user, setUser } = useAuthStore()
  const navigate = useNavigate()

  useEffect(() => {
    if (user) {
      if (user.role === 'mentor') {
        const onboardingCompleted = (user as any).onboardingCompleted === true
        const bio = (user as any).bio || ''
        const qual = (user as any).qualification || (user as any).education || ''
        const exp = (user as any).experience || (user as any).yearsOfExperience || ''
        const hasProfile = bio.trim() !== '' && qual.trim() !== '' && String(exp).trim() !== ''

        if (onboardingCompleted || hasProfile) {
          navigate('/mentor-portal', { replace: true })
        } else {
          navigate('/mentor-onboarding', { replace: true })
        }
      } else {
        if (user.onboardingComplete) {
          navigate('/dashboard', { replace: true })
        } else {
          navigate('/onboarding', { replace: true })
        }
      }
    }
  }, [user, navigate])

  const handleGoogleLogin = async () => {
    setLoading(true)
    setError('')
    try {
      const loggedInUser = await signInWithGoogle(role)
      setUser(loggedInUser)
      if (loggedInUser.role === 'mentor') {
        if ((loggedInUser as any).onboardingCompleted === true) {
          navigate('/mentor-portal')
        } else {
          navigate('/mentor-onboarding')
        }
      } else if (loggedInUser.onboardingComplete) {
        navigate('/dashboard')
      } else {
        navigate('/onboarding')
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
      if (loggedInUser.role === 'mentor') {
        if ((loggedInUser as any).onboardingCompleted === true) {
          navigate('/mentor-portal')
        } else {
          navigate('/mentor-onboarding')
        }
      } else if (loggedInUser.onboardingComplete) {
        navigate('/dashboard')
      } else {
        navigate('/onboarding')
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
    const loggedInUser = await signInWithEmail(email, password, role)
      
      setUser(loggedInUser)
      if (loggedInUser.role === 'mentor') {
        if ((loggedInUser as any).onboardingCompleted === true) {
          navigate('/mentor-portal')
        } else {
          navigate('/mentor-onboarding')
        }
      } else if (loggedInUser.onboardingComplete) {
        navigate('/dashboard')
      } else {
        navigate('/onboarding')
      }
    } catch (err: any) {
      console.error(err)
      setError(err.message || 'Failed to sign in')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card animate-scaleIn">
        <div className="auth-card__header">
          <div className="auth-logo">
            <img src="/logo.png" alt="LifeFundies Logo" style={{ height: '60px', objectFit: 'contain', margin: '0 auto', display: 'block' }} />
          </div>
          <h1 className="heading-1">Welcome back</h1>
          <p className="body-sm text-muted">Sign in to continue your journey</p>
        </div>

        {/* Role selector */}
        <div className="role-selector" style={{ marginBottom: 'var(--sp-4)' }}>
          <button
            type="button"
            className={`role-btn ${role === 'seeker' ? 'role-btn--active' : ''}`}
            id="login-role-user"
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
            id="login-role-mentor"
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
          <button className="auth-social-btn" id="google-login" type="button" onClick={handleGoogleLogin} disabled={loading}>
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" width="18" />
            Continue with Google
          </button>
          {role === 'seeker' && (
            <button className="auth-social-btn" id="anonymous-login" type="button" onClick={handleAnonymousLogin} disabled={loading} style={{ background: 'var(--clr-bg-card)', borderColor: 'var(--clr-border-strong)' }}>
              <span style={{ fontSize: '1.1rem' }}>🎭</span>
              Continue Anonymously
            </button>
          )}
        </div>

        <div className="auth-divider"><span>or sign in with email</span></div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {error && <div className="auth-error">{error}</div>}

          <div className="form-group">
            <label className="form-label" htmlFor="login-email">Email address</label>
            <div className="input-wrapper">
              <Mail size={16} className="input-icon" />
              <input
                id="login-email"
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
              <label className="form-label" htmlFor="login-password">Password</label>
              <Link to="/forgot-password" className="auth-forgot">Forgot password?</Link>
            </div>
            <div className="input-wrapper">
              <Lock size={16} className="input-icon" />
              <input
                id="login-password"
                type={showPass ? 'text' : 'password'}
                className="form-input input-with-icon input-with-icon-right"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
              <button type="button" className="input-toggle" onClick={() => setShowPass(!showPass)} aria-label="Toggle password visibility">
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button type="submit" className="btn btn-primary" id="login-submit" disabled={loading} style={{ width: '100%', padding: '0.875rem' }}>
            {loading ? <span className="spinner" style={{ width: 20, height: 20, borderWidth: 2 }} /> : <>Sign In <ArrowRight size={16} /></>}
          </button>
        </form>

        <p className="auth-switch body-sm">
          Don't have an account? <Link to="/register" className="auth-switch__link">Create one free</Link>
        </p>

        <div className="auth-trust">
          <Shield size={12} /> <span className="body-sm text-muted">Your sessions are 100% confidential & secure</span>
        </div>
      </div>
    </div>
  )
}

export function RegisterPage() {
  const [step, setStep] = useState(1)
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', role: 'seeker' as 'seeker' | 'mentor' })
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { user, setUser } = useAuthStore()
  const navigate = useNavigate()

  useEffect(() => {
    if (user) {
      if (user.role === 'mentor') {
        const onboardingCompleted = (user as any).onboardingCompleted === true
        const bio = (user as any).bio || ''
        const qual = (user as any).qualification || (user as any).education || ''
        const exp = (user as any).experience || (user as any).yearsOfExperience || ''
        const hasProfile = bio.trim() !== '' && qual.trim() !== '' && String(exp).trim() !== ''

        if (onboardingCompleted || hasProfile) {
          navigate('/mentor-portal', { replace: true })
        } else {
          navigate('/mentor-onboarding', { replace: true })
        }
      } else {
        if (user.onboardingComplete) {
          navigate('/dashboard', { replace: true })
        } else {
          navigate('/onboarding', { replace: true })
        }
      }
    }
  }, [user, navigate])

  const update = (field: string, value: string) => setForm(f => ({ ...f, [field]: value }))

  const handleGoogleLogin = async () => {
    setLoading(true)
    try {
      const loggedInUser = await signInWithGoogle('seeker')
      setUser(loggedInUser)
      if (loggedInUser.onboardingComplete) {
        navigate('/dashboard')
      } else {
        navigate('/onboarding')
      }
    } catch (err: any) {
      console.error(err)
      alert(err.message || 'Google sign in failed')
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
      if (loggedInUser.onboardingComplete) {
        navigate('/dashboard')
      } else {
        navigate('/onboarding')
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
    try {
    const newUser = await signUpWithEmail(form.email, form.password, form.name, form.phone, 'seeker')
      
      setUser(newUser)
      navigate('/onboarding')
    } catch (err: any) {
      console.error(err)
      alert(err.message || 'Failed to create account')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card auth-card--wide animate-scaleIn">
        <div className="auth-card__header">
          <div className="auth-logo">
            <img src="/logo.png" alt="LifeFundies Logo" style={{ height: '60px', objectFit: 'contain', margin: '0 auto', display: 'block' }} />
          </div>
          <h1 className="heading-1">Join LifeFundies</h1>
          <p className="body-sm text-muted">Start your journey to life clarity today</p>
        </div>

        {/* Role selector */}
        <div className="role-selector">
          <button
            type="button"
            className={`role-btn ${form.role === 'seeker' ? 'role-btn--active' : ''}`}
            id="role-user"
            onClick={() => update('role', 'seeker')}
          >
            <span className="role-btn__icon">🙋</span>
            <div>
              <p className="role-btn__label">Seeker</p>
              <p className="body-sm text-muted">I want guidance & support</p>
            </div>
          </button>
          <button
            type="button"
            className="role-btn"
            id="role-mentor"
            onClick={() => navigate('/mentor-register')}
          >
            <span className="role-btn__icon">👨‍💼</span>
            <div>
              <p className="role-btn__label">Mentor</p>
              <p className="body-sm text-muted">Apply for mentor approval</p>
            </div>
          </button>
        </div>

        <div className="auth-social" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
          <button className="auth-social-btn" id="google-register" type="button" onClick={handleGoogleLogin} disabled={loading}>
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" width="18" />
            Continue with Google
          </button>
          <button className="auth-social-btn" id="anonymous-register" type="button" onClick={handleAnonymousLogin} disabled={loading} style={{ background: 'var(--clr-bg-card)', borderColor: 'var(--clr-border-strong)' }}>
            <span style={{ fontSize: '1.1rem' }}>🎭</span>
            Continue Anonymously
          </button>
        </div>

        <div className="auth-divider"><span>or register with email</span></div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {error && <div className="auth-error">{error}</div>}
          <div className="auth-form-grid">
            <div className="form-group">
              <label className="form-label" htmlFor="reg-name">Full Name</label>
              <div className="input-wrapper">
                <User size={16} className="input-icon" />
                <input id="reg-name" type="text" className="form-input input-with-icon" placeholder="Asmit Sharma" value={form.name} onChange={e => update('name', e.target.value)} required />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="reg-phone">Phone Number</label>
              <div className="input-wrapper">
                <Phone size={16} className="input-icon" />
                <input id="reg-phone" type="tel" className="form-input input-with-icon" placeholder="+91 98765 43210" value={form.phone} onChange={e => update('phone', e.target.value)} />
              </div>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="reg-email">Email address</label>
            <div className="input-wrapper">
              <Mail size={16} className="input-icon" />
              <input id="reg-email" type="email" className="form-input input-with-icon" placeholder="you@example.com" value={form.email} onChange={e => update('email', e.target.value)} required />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="reg-password">Password</label>
            <div className="input-wrapper">
              <Lock size={16} className="input-icon" />
              <input
                id="reg-password"
                type={showPass ? 'text' : 'password'}
                className="form-input input-with-icon input-with-icon-right"
                placeholder="Min. 8 characters"
                value={form.password}
                onChange={e => update('password', e.target.value)}
                minLength={8}
                required
              />
              <button type="button" className="input-toggle" onClick={() => setShowPass(!showPass)} aria-label="Toggle password">
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button type="submit" className="btn btn-primary" id="register-submit" disabled={loading} style={{ width: '100%', padding: '0.875rem' }}>
            {loading ? <span className="spinner" style={{ width: 20, height: 20, borderWidth: 2 }} /> : <>Create Account <ArrowRight size={16} /></>}
          </button>

          <p className="body-sm text-muted" style={{ textAlign: 'center' }}>
            By registering you agree to our{' '}
            <Link to="/terms" style={{ color: 'var(--clr-primary-light)' }}>Terms</Link> &{' '}
            <Link to="/privacy" style={{ color: 'var(--clr-primary-light)' }}>Privacy Policy</Link>
          </p>
        </form>

        <p className="auth-switch body-sm">
          Already have an account? <Link to="/login" className="auth-switch__link">Sign in</Link>
        </p>
      </div>
    </div>
  )
}

export function MentorRegisterPage() {
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    qualification: '',
    experience: '',
    expertise: '',
    languages: '',
    bio: '',
  })
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { user, setUser } = useAuthStore()
  const navigate = useNavigate()

  useEffect(() => {
    if (user && user.role === 'mentor') {
      const onboardingCompleted = (user as any).onboardingCompleted === true
      const bio = (user as any).bio || ''
      const qual = (user as any).qualification || (user as any).education || ''
      const exp = (user as any).experience || (user as any).yearsOfExperience || ''
      const hasProfile = bio.trim() !== '' && qual.trim() !== '' && String(exp).trim() !== ''

      if (onboardingCompleted || hasProfile) {
        navigate('/mentor-portal', { replace: true })
      } else {
        navigate('/mentor-onboarding', { replace: true })
      }
    }
  }, [user, navigate])

  const update = (field: string, value: string) => setForm(f => ({ ...f, [field]: value }))

  const submitApplication = async (uid: string) => {
    const payload = {
      mentorApplicationStatus: 'pending',
      mentorApplication: {
        fullName: form.name,
        phone: form.phone,
        qualification: form.qualification,
        experience: form.experience,
        expertise: form.expertise.split(',').map(item => item.trim()).filter(Boolean),
        languages: form.languages.split(',').map(item => item.trim()).filter(Boolean),
        bio: form.bio,
        submittedAt: serverTimestamp(),
      },
      updatedAt: serverTimestamp(),
    }
    await updateDoc(doc(db, 'users', uid), payload)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      let activeUser = user
      if (!activeUser || activeUser.isAnonymous) {
        activeUser = await signUpWithEmail(form.email, form.password, form.name, form.phone, 'seeker')
        setUser(activeUser)
      }
      await submitApplication(activeUser.uid)
      navigate('/dashboard')
    } catch (err: any) {
      console.error(err)
      setError(err.message || 'Failed to submit mentor application')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card auth-card--wide animate-scaleIn">
        <div className="auth-card__header">
          <div className="auth-logo">
            <img src="/logo.png" alt="LifeFundies Logo" style={{ height: '60px', objectFit: 'contain', margin: '0 auto', display: 'block' }} />
          </div>
          <h1 className="heading-1">Mentor Application</h1>
          <p className="body-sm text-muted">Applications create a seeker account first. Mentor access starts after manual approval.</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {error && <div className="auth-error">{error}</div>}
          {(!user || user.isAnonymous) && (
            <>
              <div className="auth-form-grid">
                <div className="form-group">
                  <label className="form-label" htmlFor="mentor-name">Full Name</label>
                  <input id="mentor-name" className="form-input" value={form.name} onChange={e => update('name', e.target.value)} required />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="mentor-phone">Phone Number</label>
                  <input id="mentor-phone" className="form-input" value={form.phone} onChange={e => update('phone', e.target.value)} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="mentor-email">Email address</label>
                <input id="mentor-email" type="email" className="form-input" value={form.email} onChange={e => update('email', e.target.value)} required />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="mentor-password">Password</label>
                <div className="input-wrapper">
                  <input id="mentor-password" type={showPass ? 'text' : 'password'} className="form-input input-with-icon-right" value={form.password} onChange={e => update('password', e.target.value)} minLength={8} required />
                  <button type="button" className="input-toggle" onClick={() => setShowPass(!showPass)} aria-label="Toggle password">
                    {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            </>
          )}
          <div className="auth-form-grid">
            <div className="form-group">
              <label className="form-label" htmlFor="mentor-qualification">Qualification</label>
              <input id="mentor-qualification" className="form-input" value={form.qualification} onChange={e => update('qualification', e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="mentor-experience">Experience</label>
              <input id="mentor-experience" className="form-input" value={form.experience} onChange={e => update('experience', e.target.value)} required />
            </div>
          </div>
          <div className="auth-form-grid">
            <div className="form-group">
              <label className="form-label" htmlFor="mentor-expertise">Expertise Domains</label>
              <input id="mentor-expertise" className="form-input" placeholder="Career, Confidence" value={form.expertise} onChange={e => update('expertise', e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="mentor-languages">Languages Known</label>
              <input id="mentor-languages" className="form-input" placeholder="Hindi, English" value={form.languages} onChange={e => update('languages', e.target.value)} required />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="mentor-bio">Bio / About Me</label>
            <textarea id="mentor-bio" className="form-input" rows={4} value={form.bio} onChange={e => update('bio', e.target.value)} required />
          </div>
          <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%', padding: '0.875rem' }}>
            {loading ? <span className="spinner" style={{ width: 20, height: 20, borderWidth: 2 }} /> : <>Submit Application <ArrowRight size={16} /></>}
          </button>
          <p className="auth-switch body-sm">
            Already approved? <Link to="/login" className="auth-switch__link">Sign in as mentor</Link>
          </p>
        </form>
      </div>
    </div>
  )
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setMessage('')
    try {
      await resetPassword(email)
      setMessage('Password reset email sent! Check your inbox for instructions.')
    } catch (err: any) {
      console.error(err)
      setError(err.message || 'Failed to send reset email')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card animate-scaleIn">
        <div className="auth-card__header">
          <div className="auth-logo">
            <img src="/logo.png" alt="LifeFundies Logo" style={{ height: '60px', objectFit: 'contain', margin: '0 auto', display: 'block' }} />
          </div>
          <h1 className="heading-1">Reset Password</h1>
          <p className="body-sm text-muted">Enter your email to receive a password reset link</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {error && <div className="auth-error">{error}</div>}
          {message && (
            <div 
              className="auth-success" 
              style={{ 
                color: '#10b981', 
                backgroundColor: 'rgba(16, 185, 129, 0.1)', 
                padding: '0.75rem', 
                borderRadius: '0.375rem', 
                marginBottom: '1rem', 
                fontSize: '0.875rem', 
                textAlign: 'center',
                border: '1px solid rgba(16, 185, 129, 0.2)'
              }}
            >
              {message}
            </div>
          )}

          <div className="form-group">
            <label className="form-label" htmlFor="reset-email">Email address</label>
            <div className="input-wrapper">
              <Mail size={16} className="input-icon" />
              <input
                id="reset-email"
                type="email"
                className="form-input input-with-icon"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          <button type="submit" className="btn btn-primary" id="reset-submit" disabled={loading} style={{ width: '100%', padding: '0.875rem' }}>
            {loading ? <span className="spinner" style={{ width: 20, height: 20, borderWidth: 2 }} /> : <>Send Reset Link <ArrowRight size={16} /></>}
          </button>
        </form>

        <p className="auth-switch body-sm">
          Remember your password? <Link to="/login" className="auth-switch__link">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
