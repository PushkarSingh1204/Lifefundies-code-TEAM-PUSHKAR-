import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, ArrowRight, ArrowLeft, Shield, Sparkles, Calendar, Clock, BookOpen, AlertCircle, Trash, Plus, UserCheck } from 'lucide-react'
import { useAuthStore } from '../../stores'
import { createGuideSlot } from '../../lib/bookingRepository'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { MENTOR_CATEGORIES, getSessionPrice } from '../../lib/pricing'
import { getInitials } from '../../utils'
import './MentorOnboarding.css'

const STEPS = ['Guidelines', 'Your Fees', 'First Slots', 'Bio & Profile']

export default function MentorOnboardingPage() {
  const { user, setUser } = useAuthStore()
  const navigate = useNavigate()

  useEffect(() => {
    if (user) {
      if ((user as any).role !== 'mentor') {
        navigate('/dashboard', { replace: true })
      } else {
        const onboardingCompleted = (user as any).onboardingCompleted === true
        const bio = (user as any).bio || ''
        const qual = (user as any).qualification || (user as any).education || ''
        const exp = (user as any).experience || (user as any).yearsOfExperience || ''
        const hasProfile = bio.trim() !== '' && qual.trim() !== '' && String(exp).trim() !== ''

        if (onboardingCompleted || hasProfile) {
          navigate('/mentor-portal', { replace: true })
        }
      }
    }
  }, [user, navigate])
  
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  
  // Onboarding Form States
  const [agreedToGuidelines, setAgreedToGuidelines] = useState(false)
  const [selectedCategories, setSelectedCategories] = useState<string[]>(['peer-buddy'])
  
  // Availability Slots States
  const [slotsList, setSlotsList] = useState<Array<{ date: string; time: string; duration: number; category: string }>>([])
  const [newSlotDate, setNewSlotDate] = useState('')
  const [newSlotTime, setNewSlotTime] = useState('10:00')
  const [newSlotDuration, setNewSlotDuration] = useState(30)
  const [newSlotCategory, setNewSlotCategory] = useState('peer-buddy')
  
  // Profile Information States
  const [fullName, setFullName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [photoURL, setPhotoURL] = useState('')
  const [bio, setBio] = useState('')
  const [qualification, setQualification] = useState('')
  const [experience, setExperience] = useState('')
  const [languages, setLanguages] = useState('')
  const [expertise, setExpertise] = useState('')
  
  // Load initial data from user profile
  useEffect(() => {
    if (user) {
      setFullName((user as any).fullName || user.displayName || '')
      setDisplayName(user.displayName || '')
      setPhotoURL((user as any).photoURL || '')
      setBio((user as any).bio || '')
      setQualification((user as any).qualification || (user as any).education || '')
      setExperience(String((user as any).experience || (user as any).yearsOfExperience || ''))
      setLanguages(((user as any).languages || (user as any).languagesKnown || []).join(', '))
      setExpertise(((user as any).expertise || (user as any).expertiseDomains || []).join(', '))
      
      const userCategories = (user as any).categories || []
      if (userCategories.length > 0) {
        setSelectedCategories(userCategories)
      }
    }
  }, [user])

  // Category change handler
  const handleCategoryToggle = (categoryId: string) => {
    setSelectedCategories(prev => {
      const exists = prev.includes(categoryId)
      if (exists) {
        if (prev.length === 1) return prev // Must have at least one category
        return prev.filter(id => id !== categoryId)
      } else {
        return [...prev, categoryId]
      }
    })
  }

  // Add temp slot
  const handleAddSlot = () => {
    if (!newSlotDate) {
      setError('Please select a date for the slot.')
      return
    }
    setError('')
    
    // Check if slot already added
    const isDup = slotsList.some(s => s.date === newSlotDate && s.time === newSlotTime)
    if (isDup) {
      setError('This time slot is already added.')
      return
    }

    setSlotsList(prev => [...prev, {
      date: newSlotDate,
      time: newSlotTime,
      duration: newSlotDuration,
      category: newSlotCategory
    }])
  }

  // Remove temp slot
  const handleRemoveSlot = (index: number) => {
    setSlotsList(prev => prev.filter((_, i) => i !== index))
  }

  // Handle step continue
  const handleNextStep = () => {
    if (step === 0 && !agreedToGuidelines) {
      setError('You must accept the Code of Conduct & Guidelines to continue.')
      return
    }
    if (step === 1 && selectedCategories.length === 0) {
      setError('Please select at least one consulting fee category.')
      return
    }
    if (step === 2 && slotsList.length < 2) {
      setError('We recommend creating at least 2 initial availability slots so clients can book sessions.')
      return
    }
    if (step === 3) {
      if (!fullName.trim() || !bio.trim() || !qualification.trim() || !experience.trim() || !expertise.trim() || !languages.trim()) {
        setError('Please fill in all the required profile information.')
        return
      }
    }

    setError('')
    setStep(prev => prev + 1)
  }

  const handleBackStep = () => {
    setError('')
    setStep(prev => prev - 1)
  }

  // Finish onboarding
  const handleFinish = async () => {
    if (!user) return
    setLoading(true)
    setError('')
    
    try {
      // 1. Create first availability slots in Firestore
      for (const slot of slotsList) {
        await createGuideSlot({
          guideId: user.uid,
          date: slot.date,
          time: slot.time,
          duration: slot.duration,
          category: slot.category,
          price: getSessionPrice(slot.category, slot.duration)
        })
      }

      // 2. Process profile details
      const languagesArray = languages.split(',').map(item => item.trim()).filter(Boolean)
      const expertiseArray = expertise.split(',').map(item => item.trim()).filter(Boolean)
      const yearsExp = Number(experience) || 0

      const updatePayload = {
        photoURL,
        fullName: fullName.trim(),
        displayName: displayName.trim() || fullName.trim(),
        bio: bio.trim(),
        qualification: qualification.trim(),
        education: qualification.trim(),
        experience: yearsExp,
        yearsOfExperience: yearsExp,
        languages: languagesArray,
        languagesKnown: languagesArray,
        expertise: expertiseArray,
        expertiseDomains: expertiseArray,
        categories: selectedCategories,
        onboardingCompleted: true,
        mentorOnboardingComplete: true,
        onboardingComplete: true,
        updatedAt: new Date(),
      }

      // 3. Update User Document in Firestore
      await updateDoc(doc(db, 'users', user.uid), updatePayload)
      
      // 4. Update local Auth Store user
      setUser({
        ...user,
        ...updatePayload,
      } as any)
      
      navigate('/mentor-portal')
    } catch (err: any) {
      console.error('Failed to complete onboarding:', err)
      setError(err.message || 'Failed to complete mentor onboarding. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const progress = ((step + 1) / STEPS.length) * 100

  return (
    <div className="mentor-ob-page">
      <div className="mentor-ob-container">
        {/* Step Indicator Header */}
        <div className="mentor-ob-progress animate-fadeInUp">
          <div className="mentor-ob-steps">
            {STEPS.map((s, i) => (
              <div key={i} className={`mentor-ob-step ${i <= step ? 'mentor-ob-step--done' : ''} ${i === step ? 'mentor-ob-step--active' : ''}`}>
                <div className="mentor-ob-step-dot">
                  {i < step ? <Check size={12} /> : i + 1}
                </div>
                <span className="mentor-ob-step-label hide-mobile">{s}</span>
              </div>
            ))}
          </div>
          <div className="progress-bar" style={{ marginTop: 'var(--sp-4)' }}>
            <div className="progress-fill animate-progress" style={{ width: `${progress}%` }} />
          </div>
        </div>

        {/* Content Box */}
        <div className="mentor-ob-card animate-scaleIn">
          {error && (
            <div className="mentor-ob-error">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {/* STEP 0: Guidelines */}
          {step === 0 && (
            <div className="mentor-ob-step-content animate-fadeInUp">
              <div className="ob-header-icon">🛡️</div>
              <h2 className="heading-1 text-center">Mentor Code of Conduct</h2>
              <p className="body-lg text-muted text-center" style={{ marginBottom: 'var(--sp-6)' }}>
                LifeFundies is a high-trust, safe space. As an approved guide, you represent our platform principles.
              </p>

              <div className="guidelines-list">
                <div className="guideline-card">
                  <div className="guideline-num">1</div>
                  <div>
                    <h4 className="heading-3">100% Confidentiality & Anonymity</h4>
                    <p className="body-sm text-muted">
                      Seeker IDs, chats, and calls are highly private. Do not record, screen-capture, or disclose session information outside the private channel.
                    </p>
                  </div>
                </div>

                <div className="guideline-card">
                  <div className="guideline-num">2</div>
                  <div>
                    <h4 className="heading-3">Judgment-Free Active Listening</h4>
                    <p className="body-sm text-muted">
                      Every seeker comes to you with their vulnerabilities. Ensure your advice is neutral, empathetic, constructive, and free of judgment or biases.
                    </p>
                  </div>
                </div>

                <div className="guideline-card">
                  <div className="guideline-num">3</div>
                  <div>
                    <h4 className="heading-3">Safe Boundaries (Non-Therapeutic)</h4>
                    <p className="body-sm text-muted">
                      We offer guidance & personal development — not clinical therapy. If a seeker exhibits clinical depression or self-harm issues, report it to support immediately.
                    </p>
                  </div>
                </div>
              </div>

              <div className="agreements-checkbox-wrapper">
                <input
                  type="checkbox"
                  id="agreed-guidelines"
                  checked={agreedToGuidelines}
                  onChange={e => setAgreedToGuidelines(e.target.checked)}
                />
                <label htmlFor="agreed-guidelines" className="body-sm">
                  I accept the Code of Conduct and commit to maintaining professional boundaries with all seekers.
                </label>
              </div>
            </div>
          )}

          {/* STEP 1: Categories & Pricing */}
          {step === 1 && (
            <div className="mentor-ob-step-content animate-fadeInUp">
              <div className="ob-header-icon">💰</div>
              <h2 className="heading-1 text-center">Your Consulting Rates</h2>
              <p className="body-lg text-muted text-center" style={{ marginBottom: 'var(--sp-6)' }}>
                Select which service tiers you are qualified and willing to consult under. 
              </p>

              <div className="pricing-selector-grid">
                {MENTOR_CATEGORIES.map(category => {
                  const isSelected = selectedCategories.includes(category.id)
                  return (
                    <div 
                      key={category.id} 
                      className={`pricing-option-card ${isSelected ? 'pricing-option-card--active' : ''}`}
                      onClick={() => handleCategoryToggle(category.id)}
                    >
                      <div className="pricing-option-header">
                        <div className="checkbox-ring">
                          {isSelected && <Check size={12} />}
                        </div>
                        <h4 className="heading-3">{category.label}</h4>
                      </div>
                      <div className="pricing-option-details">
                        {category.prices.map((opt, i) => (
                          <div key={i} className="pricing-option-row">
                            <span className="body-sm text-muted">{opt.duration} mins</span>
                            <span className="pricing-option-price">₹{opt.price}</span>
                          </div>
                        ))}
                      </div>
                      <p className="body-sm text-muted" style={{ marginTop: 'var(--sp-3)', fontSize: '0.8rem' }}>
                        {category.id === 'peer-buddy' && 'Recommended for peer discussions, college support, and general friendly chats.'}
                        {category.id === 'young-mentor' && 'Recommended for career mapping, workplace advice, and specialized domain mentoring.'}
                        {category.id === 'senior-advisory-group' && 'Reserved for advanced consultations and certified/professional advisory.'}
                      </p>
                    </div>
                  )
                })}
              </div>
              <p className="body-sm text-muted text-center" style={{ marginTop: 'var(--sp-4)' }}>
                Charges are standardized across the platform. You will receive payouts based on your completed sessions.
              </p>
            </div>
          )}

          {/* STEP 2: First Slots */}
          {step === 2 && (
            <div className="mentor-ob-step-content animate-fadeInUp">
              <div className="ob-header-icon">📅</div>
              <h2 className="heading-1 text-center">Create Your Availability</h2>
              <p className="body-lg text-muted text-center" style={{ marginBottom: 'var(--sp-4)' }}>
                Set at least 2 time slots for this week so seekers can start booking you.
              </p>

              <div className="slots-onboarding-layout">
                {/* Form */}
                <div className="slot-creator-box">
                  <h4 className="heading-3" style={{ marginBottom: 'var(--sp-3)' }}>Add Availability Slot</h4>
                  <div className="form-group">
                    <label className="form-label">Date</label>
                    <input 
                      type="date" 
                      className="form-input" 
                      value={newSlotDate} 
                      min={new Date().toISOString().split('T')[0]}
                      onChange={e => setNewSlotDate(e.target.value)} 
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Start Time</label>
                    <input 
                      type="time" 
                      className="form-input" 
                      value={newSlotTime} 
                      onChange={e => setNewSlotTime(e.target.value)} 
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Consulting Tier</label>
                    <select 
                      className="form-input" 
                      value={newSlotCategory} 
                      onChange={e => {
                        const cat = e.target.value
                        setNewSlotCategory(cat)
                        setNewSlotDuration(MENTOR_CATEGORIES.find(c => c.id === cat)?.prices[0].duration || 30)
                      }}
                    >
                      {selectedCategories.map(catId => (
                        <option key={catId} value={catId}>
                          {MENTOR_CATEGORIES.find(c => c.id === catId)?.label || catId}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Duration & Pricing</label>
                    <select 
                      className="form-input" 
                      value={newSlotDuration} 
                      onChange={e => setNewSlotDuration(Number(e.target.value))}
                    >
                      {(MENTOR_CATEGORIES.find(c => c.id === newSlotCategory)?.prices || []).map(priceOption => (
                        <option key={priceOption.duration} value={priceOption.duration}>
                          {priceOption.duration} mins (₹{priceOption.price})
                        </option>
                      ))}
                    </select>
                  </div>
                  <button 
                    type="button" 
                    className="btn btn-outline" 
                    style={{ width: '100%', marginTop: 'var(--sp-2)' }}
                    onClick={handleAddSlot}
                  >
                    <Plus size={16} /> Add Availability Slot
                  </button>
                </div>

                {/* List */}
                <div className="slots-list-box">
                  <h4 className="heading-3" style={{ marginBottom: 'var(--sp-3)' }}>Added Slots ({slotsList.length})</h4>
                  <div className="slots-list-onboarding">
                    {slotsList.length > 0 ? (
                      slotsList.map((slot, index) => (
                        <div key={index} className="slot-badge-onboarding">
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span className="body-sm font-semibold">{slot.date}</span>
                            <span className="body-xs text-muted">
                              {slot.time} ({slot.duration} mins) · {MENTOR_CATEGORIES.find(c => c.id === slot.category)?.label}
                            </span>
                          </div>
                          <button 
                            type="button" 
                            className="remove-slot-btn" 
                            onClick={() => handleRemoveSlot(index)}
                            aria-label="Remove slot"
                          >
                            <Trash size={14} />
                          </button>
                        </div>
                      ))
                    ) : (
                      <div className="empty-slots-state">
                        <Clock size={32} style={{ color: 'var(--clr-text-subtle)', marginBottom: 'var(--sp-2)' }} />
                        <p className="body-sm text-muted">No slots added yet.</p>
                        <p className="body-xs text-muted" style={{ textAlign: 'center' }}>Define slot date/time in the left panel to populate.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Biography & Profile */}
          {step === 3 && (
            <div className="mentor-ob-step-content animate-fadeInUp">
              <div className="ob-header-icon">👤</div>
              <h2 className="heading-1 text-center">Mentor Public Profile</h2>
              <p className="body-lg text-muted text-center" style={{ marginBottom: 'var(--sp-5)' }}>
                Confirm the details seekers will see when browsing your profile.
              </p>

              <div className="mentor-ob-profile-form">
                <div className="profile-photo-onboarding">
                  <div className="avatar avatar-xl" style={{ overflow: 'hidden', border: '2px solid var(--clr-primary)', marginBottom: 'var(--sp-2)' }}>
                    {photoURL ? (
                      <img src={photoURL} alt="Avatar Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      getInitials(fullName || 'Mentor')
                    )}
                  </div>
                  <div className="form-group" style={{ margin: 0, width: '100%', maxWidth: '350px' }}>
                    <label className="form-label">Profile Photo URL</label>
                    <input 
                      type="url" 
                      className="form-input" 
                      placeholder="https://example.com/avatar.jpg" 
                      value={photoURL} 
                      onChange={e => setPhotoURL(e.target.value)} 
                    />
                  </div>
                </div>

                <div className="auth-form-grid">
                  <div className="form-group">
                    <label className="form-label">Full Name *</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      value={fullName} 
                      onChange={e => setFullName(e.target.value)} 
                      required 
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Display Name *</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      value={displayName} 
                      onChange={e => setDisplayName(e.target.value)} 
                      required 
                    />
                  </div>
                </div>

                <div className="auth-form-grid">
                  <div className="form-group">
                    <label className="form-label">Qualification / Education *</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      placeholder="e.g. B.Tech Engineering, MBA, Certified Coach" 
                      value={qualification} 
                      onChange={e => setQualification(e.target.value)} 
                      required 
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Years of Experience *</label>
                    <input 
                      type="number" 
                      min="0"
                      className="form-input" 
                      placeholder="e.g. 3" 
                      value={experience} 
                      onChange={e => setExperience(e.target.value)} 
                      required 
                    />
                  </div>
                </div>

                <div className="auth-form-grid">
                  <div className="form-group">
                    <label className="form-label">Expertise domains (comma-separated) *</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      placeholder="Career, Resume, Stress Management" 
                      value={expertise} 
                      onChange={e => setExpertise(e.target.value)} 
                      required 
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Languages Known (comma-separated) *</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      placeholder="English, Hindi" 
                      value={languages} 
                      onChange={e => setLanguages(e.target.value)} 
                      required 
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">About Me / Biography *</label>
                  <textarea 
                    className="form-input" 
                    rows={4} 
                    placeholder="Provide a brief summary of your background, coaching style, and how you help seekers achieve their goals..."
                    value={bio} 
                    onChange={e => setBio(e.target.value)} 
                    style={{ resize: 'vertical' }}
                    required 
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: Success Screen */}
          {step === 4 && (
            <div className="mentor-ob-step-content animate-fadeInUp text-center" style={{ padding: 'var(--sp-6) 0' }}>
              <div className="success-check-circle animate-scaleIn">
                <UserCheck size={48} />
              </div>
              <h2 className="heading-1" style={{ marginTop: 'var(--sp-4)' }}>Onboarding Complete!</h2>
              <p className="body-lg text-muted" style={{ maxWidth: '500px', margin: 'var(--sp-2) auto var(--sp-6)' }}>
                Congratulations, you are now officially active on the LifeFundies mentor dashboard! Your initial time slots are open for seekers to book.
              </p>

              <div className="onboarding-completion-summary">
                <div className="completion-item">
                  <div className="completion-item-icon">💰</div>
                  <div>
                    <h5 className="font-semibold text-left" style={{ margin: 0 }}>Consulting fee tiers ready</h5>
                    <p className="body-sm text-muted text-left" style={{ margin: 0 }}>{selectedCategories.map(cat => MENTOR_CATEGORIES.find(c => c.id === cat)?.label).join(', ')}</p>
                  </div>
                </div>
                <div className="completion-item" style={{ marginTop: 'var(--sp-4)' }}>
                  <div className="completion-item-icon">📅</div>
                  <div>
                    <h5 className="font-semibold text-left" style={{ margin: 0 }}>Availability slots active</h5>
                    <p className="body-sm text-muted text-left" style={{ margin: 0 }}>{slotsList.length} time slots published immediately</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Navigation Bar */}
          <div className="mentor-ob-nav">
            {step > 0 && step < 4 && (
              <button type="button" className="btn btn-ghost" onClick={handleBackStep} disabled={loading}>
                <ArrowLeft size={16} /> Back
              </button>
            )}
            <div style={{ flex: 1 }} />
            {step < STEPS.length - 1 ? (
              <button 
                type="button" 
                className="btn btn-primary" 
                onClick={handleNextStep}
                disabled={
                  (step === 0 && !agreedToGuidelines) ||
                  (step === 1 && selectedCategories.length === 0)
                }
              >
                Continue <ArrowRight size={16} />
              </button>
            ) : step === STEPS.length - 1 ? (
              <button 
                type="button" 
                className="btn btn-primary btn-lg" 
                onClick={handleFinish} 
                disabled={loading}
              >
                {loading ? <span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /> : <>Publish Profile & Enter Portal <Sparkles size={16} style={{ marginLeft: '4px' }} /></>}
              </button>
            ) : (
              <button 
                type="button" 
                className="btn btn-primary btn-lg" 
                style={{ width: '100%' }}
                onClick={() => navigate('/mentor-portal')}
              >
                Go to Mentor Portal <ArrowRight size={16} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
