import { useState } from 'react';
import { X, IndianRupee, Loader2, CheckCircle2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import SlotSelection from './SlotSelection';
import { useAuthStore } from '@/stores';
import { LIFE_DOMAINS, type DomainId, type Mentor } from '@/types';
import { MENTOR_CATEGORIES, getCategoryPrices, getSessionPrice, normalizeMentorCategories } from '@/lib/pricing';
import { initiateRazorpayPayment } from '@/lib/razorpay';
import { createBooking, confirmPayment } from '@/lib/bookingRepository';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import './BookingModal.css';

interface BookingModalProps {
  guide: any; // Can be Mentor (mock) or Guide (firestore)
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (bookingId: string) => void;
}

export default function BookingModal({ guide, isOpen, onClose, onSuccess }: BookingModalProps) {
  const { user, setAuthModalOpen } = useAuthStore();
  const navigate = useNavigate();
  const [step, setStep] = useState(1); // 1: Domain & Category, 2: Slot, 3: Confirm, 4: Success
  const [selectedDomain, setSelectedDomain] = useState<any>(null);
  const [selectedSlot, setSelectedSlot] = useState<any>(null);
  const mentorCategories = normalizeMentorCategories(guide.categories);
  const [selectedCategory, setSelectedCategory] = useState(mentorCategories[0]);
  const [selectedDuration, setSelectedDuration] = useState(getCategoryPrices(mentorCategories[0])[0].duration);
  const [issue, setIssue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [bookingId, setBookingId] = useState('');
  const [whatsappConsent, setWhatsappConsent] = useState(user ? (user as any).whatsappNotificationsEnabled !== false : true);
  const [whatsappPhone, setWhatsappPhone] = useState(user ? ((user as any).phone || (user as any).phoneNumber || '') : '');

  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);


  if (!isOpen || !guide) return null;

  // Adapt guide properties dynamically to support both Firestore schema and Mock schema
  const mentorId = guide.uid || guide.id;
  const mentorName = guide.displayName || guide.name || 'Mentor';
  const rawDomains = guide.domains || [];

  // Map domains to LIFE_DOMAINS objects
  const mappedDomains = rawDomains
    .map((d: any) => {
      const dId = typeof d === 'string' ? d : d?.id;
      return LIFE_DOMAINS.find(ld => ld.id === dId);
    })
    .filter(Boolean);

  const remainingDomains = LIFE_DOMAINS.filter(
    ld => !mappedDomains.some((md: any) => md.id === ld.id)
  );

  const activeCategory = MENTOR_CATEGORIES.find(category => category.id === selectedCategory) || MENTOR_CATEGORIES[0];
  const activeCategoryPriceOptions = getCategoryPrices(selectedCategory);
  const activeSessionPrice = getSessionPrice(selectedCategory, selectedDuration);


  const handleDomainSelect = (domain: any) => {
    setSelectedDomain(domain);
    setStep(2);
  };

  const handleSlotSelect = (slot: any) => {
    setSelectedSlot(slot);
  };

  const handlePayment = async () => {
    if (!user) {
      setError('Please sign in or register to book a session.');
      return;
    }

    if (!selectedSlot) {
      setError('Please select an available time slot.');
      return;
    }

    try {
      setLoading(true);
      setError('');

      // Save WhatsApp notifications consent preference to Firestore user doc
      try {
        const userRef = doc(db, 'users', user.uid);
        await updateDoc(userRef, {
          whatsappNotificationsEnabled: whatsappConsent,
          phone: whatsappPhone,
          phoneNumber: whatsappPhone
        });
        // Also update local store user data
        (user as any).whatsappNotificationsEnabled = whatsappConsent;
        (user as any).phone = whatsappPhone;
        (user as any).phoneNumber = whatsappPhone;
      } catch (prefErr) {
        console.error('Failed to save WhatsApp preferences to user document:', prefErr);
      }

      // 1. Create a pending booking in Firestore
      console.log('Creating booking draft...');
      const bookingResult = await createBooking({
        userId: user.uid,
        guideId: mentorId,
        slotId: selectedSlot.id,
        domain: selectedDomain?.label || selectedDomain?.name || 'General Life Guidance',
        price: activeSessionPrice,
        category: selectedCategory,
        duration: selectedDuration,
        selectedIssue: issue || 'Not specified',
        userNotes: issue || 'Not specified',
      });

      const currentBookingId = bookingResult.bookingId;
      setBookingId(currentBookingId);

      // 2. Launch Razorpay payment checkout in test mode
      console.log('Initiating Razorpay checkout...');
      await initiateRazorpayPayment({
        amount: activeSessionPrice,
        bookingId: currentBookingId,
        mentorName: mentorName,
        userDetails: {
          id: user.uid,
          name: user.displayName || 'LifeFundies Seeker',
          email: user.email || '',
          phone: user.phone || '',
        },
        onSuccess: async (paymentData) => {
          try {
            console.log('Razorpay success callback. Confirming payment in database...');
            // 3. Update database: mark booking as paid and create sessions
            await confirmPayment({
              bookingId: currentBookingId,
              paymentId: paymentData.razorpayPaymentId,
              razorpayOrderId: paymentData.razorpayOrderId || '',
              razorpayPaymentId: paymentData.razorpayPaymentId,
              razorpaySignature: paymentData.razorpaySignature || '',
            });

            console.log('Booking & Payment successfully completed!');
            setStep(4); // Move to Success screen
            onSuccess?.(currentBookingId);
          } catch (err: any) {
            console.error('Payment database confirmation failed:', err);
            setError('Payment succeeded but database confirmation failed. Please contact support with ID: ' + currentBookingId);
            setLoading(false);
          }
        },
        onFailure: (err: any) => {
          console.error('Razorpay payment failed:', err);
          setError(err.message || 'Payment transaction failed or cancelled.');
          setLoading(false);
        },
      });

    } catch (err: any) {
      console.error('Booking creation failed:', err);
      setError(err.message || 'Failed to create booking draft. Please try again.');
      setLoading(false);
    }
  };

  const handleClose = () => {
    // Reset state before closing
    setStep(1);
    setSelectedDomain(null);
    setSelectedSlot(null);
    setSelectedCategory(mentorCategories[0]);
    setSelectedDuration(getCategoryPrices(mentorCategories[0])[0].duration);
    setIssue('');
    setError('');
    setLoading(false);
    setAgreedToTerms(false);
    setShowTermsModal(false);
    onClose();
  };

  return (
    <div className="booking-modal-overlay">
      <div className="booking-modal-card animate-scaleIn">
        
        {/* Header */}
        <div className="booking-modal-header">
          <div>
            <h2 className="heading-2 booking-modal-title">
              {step === 4 ? 'Booking Confirmed!' : 'Book a Session'}
            </h2>
            {step < 4 && (
              <p className="body-sm text-muted">
                with <strong style={{ color: 'var(--clr-text)' }}>{mentorName}</strong>
              </p>
            )}
          </div>
          {step < 4 && (
            <button onClick={handleClose} className="booking-modal-close-btn" aria-label="Close modal">
              <X size={20} />
            </button>
          )}
        </div>

        {/* Step Indicators */}
        {step < 4 && (
          <div className="booking-modal-steps">
            {[1, 2, 3].map((s) => (
              <div key={s} className="booking-modal-step-item">
                <div className={`booking-modal-step-circle ${
                  step === s 
                    ? 'booking-modal-step-circle--active' 
                    : step > s 
                      ? 'booking-modal-step-circle--completed' 
                      : ''
                }`}>
                  {s}
                </div>
                {s < 3 && (
                  <div className={`booking-modal-step-line ${
                    step > s ? 'booking-modal-step-line--completed' : ''
                  }`} />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Modal Content */}
        <div className="booking-modal-body">
          {error && <div className="booking-modal-error">{error}</div>}

          {/* STEP 1: Domain & Category Selection */}
          {step === 1 && (
            <div className="booking-modal-flow">
              <div className="booking-modal-section">
                <h4 className="booking-modal-section-title">1. Select Booking Topic</h4>
                <div className="booking-domain-grid">
                  {mappedDomains.map((domain: any) => (
                    <button
                      key={domain.id}
                      onClick={() => handleDomainSelect(domain)}
                      type="button"
                      className="booking-domain-card"
                    >
                      <span className="booking-domain-card__icon">{domain.icon}</span>
                      <div className="booking-domain-card__info">
                        <p className="booking-domain-card__name">{domain.label}</p>
                        <p className="body-sm text-muted">{domain.description}</p>
                      </div>
                    </button>
                  ))}
                  
                  {remainingDomains.length > 0 && (
                    <div className="booking-domain-card" style={{ cursor: 'default' }}>
                      <span className="booking-domain-card__icon">🌐</span>
                      <div className="booking-domain-card__info" style={{ width: '100%' }}>
                        <p className="booking-domain-card__name">Other Focus Area</p>
                        <select 
                          className="form-input" 
                          style={{ 
                            marginTop: 'var(--sp-2)', 
                            paddingTop: '0.4rem', 
                            paddingBottom: '0.4rem',
                            fontSize: '0.875rem',
                            background: 'var(--clr-bg)'
                          }}
                          value={selectedDomain && remainingDomains.some(rd => rd.id === selectedDomain.id) ? selectedDomain.id : ""}
                          onChange={(e) => {
                            const selectedId = e.target.value;
                            if (selectedId) {
                              const domain = LIFE_DOMAINS.find(ld => ld.id === selectedId);
                              if (domain) {
                                handleDomainSelect(domain);
                              }
                            }
                          }}
                        >
                          <option value="" disabled>Select a topic...</option>
                          {remainingDomains.map(d => (
                            <option key={d.id} value={d.id}>
                              {d.icon} {d.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="booking-modal-section" style={{ marginTop: 'var(--sp-6)' }}>
                <h4 className="booking-modal-section-title">2. Select Session Category</h4>
                <div className="booking-mode-list">
                  {mentorCategories.map((categoryId) => {
                    const category = MENTOR_CATEGORIES.find(item => item.id === categoryId) || MENTOR_CATEGORIES[0]
                    return (
                    <button
                      key={category.id}
                      onClick={() => {
                        setSelectedCategory(category.id)
                        setSelectedDuration(category.prices[0].duration)
                      }}
                      type="button"
                      className={`booking-mode-card ${
                        selectedCategory === category.id ? 'booking-mode-card--active' : ''
                      }`}
                    >
                      <div className="booking-mode-card__left">
                        <span className="booking-mode-card__name">{category.label}</span>
                      </div>
                      <span className="booking-mode-card__price">
                        From <IndianRupee size={14} /> {Math.min(...category.prices.map(price => price.price))}
                      </span>
                    </button>
                  )})}
                </div>
              </div>

              <div className="booking-modal-section" style={{ marginTop: 'var(--sp-4)' }}>
                <h4 className="booking-modal-section-title">3. Select Duration</h4>
                <div className="booking-mode-list">
                  {activeCategoryPriceOptions.map(option => (
                    <button
                      key={option.duration}
                      onClick={() => setSelectedDuration(option.duration)}
                      type="button"
                      className={`booking-mode-card ${selectedDuration === option.duration ? 'booking-mode-card--active' : ''}`}
                    >
                      <span className="booking-mode-card__name">{option.duration} Minutes</span>
                      <span className="booking-mode-card__price"><IndianRupee size={14} /> {option.price}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="booking-modal-section" style={{ marginTop: 'var(--sp-6)' }}>
                <label className="form-label" htmlFor="booking-issue">
                  What would you like to discuss? (Optional)
                </label>
                <textarea
                  id="booking-issue"
                  className="form-input"
                  rows={3}
                  placeholder="Share a brief overview to help your mentor prepare..."
                  value={issue}
                  onChange={(e) => setIssue(e.target.value)}
                  style={{ resize: 'none', background: 'var(--clr-bg)' }}
                />
              </div>
            </div>
          )}

          {/* STEP 2: Time Slot Selection */}
          {step === 2 && (
            <div className="booking-modal-flow">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="booking-back-btn"
              >
                ← Back to Topic & Mode Selection
              </button>
              
              <SlotSelection
                guideId={mentorId}
                guidePrice={activeSessionPrice}
                selectedCategory={selectedCategory}
                selectedDuration={selectedDuration}
                onSlotSelect={handleSlotSelect}
              />
            </div>
          )}

          {/* STEP 3: Confirmation Summary & Checkout */}
          {step === 3 && (
            <div className="booking-modal-flow">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="booking-back-btn"
              >
                ← Back to Time Slots
              </button>

              <div className="booking-summary-box">
                <div className="booking-summary-row">
                  <span className="text-muted">Mentor</span>
                  <span className="booking-summary-val">{mentorName}</span>
                </div>
                <div className="booking-summary-row">
                  <span className="text-muted">Focus Topic</span>
                  <span className="booking-summary-val">{selectedDomain?.label || 'General Life Guidance'}</span>
                </div>
                <div className="booking-summary-row">
                  <span className="text-muted">Session Category</span>
                  <span className="booking-summary-val">{activeCategory.label}</span>
                </div>
                <div className="booking-summary-row">
                  <span className="text-muted">Duration</span>
                  <span className="booking-summary-val">{selectedDuration} Minutes</span>
                </div>
                <div className="booking-summary-row">
                  <span className="text-muted">Scheduled Time</span>
                  <span className="booking-summary-val">
                    {selectedSlot?.date} at {selectedSlot?.time}
                  </span>
                </div>
                <div className="booking-summary-row border-top">
                  <span className="heading-3" style={{ fontWeight: 600 }}>Total Fee</span>
                  <span className="booking-summary-total">
                    <IndianRupee size={20} />
                    {activeSessionPrice}
                  </span>
                </div>
              </div>

              <div className="booking-payment-note">
                <p className="body-sm text-muted">
                  🔒 Payments are secured by Razorpay. Your session is 100% confidential. You can reschedule up to 12 hours before the start.
                </p>
              </div>

              <div className="booking-terms-checkbox">
                <input
                  type="checkbox"
                  id="booking-terms-check"
                  checked={agreedToTerms}
                  onChange={(e) => setAgreedToTerms(e.target.checked)}
                />
                <label htmlFor="booking-terms-check">
                  I have read and agree to the website <button type="button" onClick={() => setShowTermsModal(true)} className="booking-terms-link">terms and conditions *</button>
                </label>
              </div>

              <div className="booking-terms-checkbox" style={{ marginTop: 'var(--sp-4)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)', alignItems: 'flex-start', width: '100%' }}>
                <p className="body-sm font-semibold" style={{ margin: 0 }}>WhatsApp Updates Consent</p>
                <p className="body-sm text-muted" style={{ margin: 0 }}>Would you like to receive session confirmations, reminders, and updates on WhatsApp?</p>
                <div className="flex gap-4" style={{ marginTop: 'var(--sp-1)' }}>
                  <label className="flex items-center gap-2 body-sm cursor-pointer" style={{ color: 'var(--clr-text)', fontWeight: 500 }}>
                    <input
                      type="radio"
                      name="booking-whatsapp-consent"
                      checked={whatsappConsent === true}
                      onChange={() => setWhatsappConsent(true)}
                      style={{ accentColor: 'var(--clr-primary)' }}
                    />
                    Yes, enable WhatsApp updates
                  </label>
                  <label className="flex items-center gap-2 body-sm cursor-pointer" style={{ color: 'var(--clr-text)', fontWeight: 500 }}>
                    <input
                      type="radio"
                      name="booking-whatsapp-consent"
                      checked={whatsappConsent === false}
                      onChange={() => setWhatsappConsent(false)}
                      style={{ accentColor: 'var(--clr-primary)' }}
                    />
                    No, use app notifications only
                  </label>
                </div>
                {whatsappConsent && (
                  <div className="form-group animate-fadeIn" style={{ marginTop: 'var(--sp-2)', width: '100%' }}>
                    <label className="form-label">WhatsApp Phone Number</label>
                    <input
                      type="tel"
                      className="form-input"
                      style={{ background: 'var(--clr-bg)' }}
                      placeholder="e.g. 8920463196"
                      value={whatsappPhone}
                      onChange={(e) => setWhatsappPhone(e.target.value)}
                      required={whatsappConsent}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 4: Success Message */}
          {step === 4 && (
            <div className="booking-success-screen">
              <div className="booking-success-icon">
                <CheckCircle2 size={64} />
              </div>
              <h3 className="heading-1">You are all set!</h3>
              <p className="body-lg text-muted">
                Your session with <strong>{mentorName}</strong> is confirmed.
              </p>

              <div className="booking-success-card">
                <p className="body-sm">
                  📅 <strong>Time:</strong> {selectedSlot?.date} at {selectedSlot?.time}
                </p>
                <p className="body-sm" style={{ marginTop: 'var(--sp-2)' }}>
                  🎯 <strong>Topic:</strong> {selectedDomain?.label || 'General Life Guidance'}
                </p>
                <p className="body-sm" style={{ marginTop: 'var(--sp-2)' }}>
                  Category: <strong>{activeCategory.label}</strong> ({selectedDuration} Minutes)
                </p>
                <p className="body-sm text-muted" style={{ marginTop: 'var(--sp-4)', fontSize: '0.8rem' }}>
                  Booking ID: {bookingId}
                </p>
              </div>

              <p className="body-sm text-muted" style={{ maxWidth: 400, textAlign: 'center', marginTop: 'var(--sp-4)' }}>
                A calendar invitation with joining details has been sent to your email. You can view and manage this in your portal.
              </p>
            </div>
          )}
        </div>

        {/* Modal Actions */}
        <div className="booking-modal-footer">
          {step === 1 && (
            <>
              <button onClick={handleClose} className="btn btn-outline" style={{ flex: 1 }}>
                Cancel
              </button>
              <button
                onClick={() => setStep(2)}
                disabled={!selectedDomain}
                className="btn btn-primary"
                style={{ flex: 1 }}
              >
                Choose Slot
              </button>
            </>
          )}

          {step === 2 && (
            <>
              <button onClick={() => setStep(1)} className="btn btn-outline" style={{ flex: 1 }}>
                Back
              </button>
              <button
                onClick={() => setStep(3)}
                disabled={!selectedSlot}
                className="btn btn-primary"
                style={{ flex: 1 }}
              >
                Review Booking
              </button>
            </>
          )}

          {step === 3 && (
            user ? (
              <button
                onClick={handlePayment}
                disabled={loading || !agreedToTerms}
                className="btn btn-primary"
                style={{ flex: 1, minWidth: 160 }}
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    Pay Now <IndianRupee size={14} />
                  </>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setAuthModalOpen(true)}
                className="btn btn-primary"
                style={{ flex: 1, minWidth: 160 }}
              >
                Sign In to Book
              </button>
            )
          )}

          {step === 4 && (
            <button
              onClick={() => {
                handleClose();
                navigate('/sessions');
              }}
              className="btn btn-primary"
              style={{ width: '100%' }}
            >
              Go to My Sessions
            </button>
          )}
        </div>

      </div>

      {/* Terms Overlay Modal */}
      {showTermsModal && (
        <div className="booking-terms-overlay">
          <div className="booking-terms-card animate-scaleIn">
            <div className="booking-terms-header">
              <h3 className="heading-3">Terms & Conditions</h3>
              <button type="button" onClick={() => setShowTermsModal(false)} className="booking-terms-close" aria-label="Close terms">
                <X size={18} />
              </button>
            </div>
            <div className="booking-terms-body">
              <h4 className="heading-2" style={{ fontSize: '1.25rem', marginBottom: 'var(--sp-2)' }}>LifeFundies – Terms & Conditions</h4>
              <p className="terms-date" style={{ fontSize: '0.8125rem', color: 'var(--clr-text-muted)', marginBottom: 'var(--sp-4)' }}>Last Updated: August 2025</p>
              <p style={{ marginBottom: 'var(--sp-4)' }}>Welcome to LifeFundies (“we”, “us”, “our”). By accessing or using our platform, you agree to these Terms & Conditions, which govern all sessions, conversations, communications, and services offered through LifeFundies.</p>
              
              <h5 style={{ fontWeight: 600, marginTop: 'var(--sp-4)', marginBottom: 'var(--sp-2)' }}>1. Acceptance of Terms</h5>
              <p style={{ marginBottom: 'var(--sp-2)' }}>By booking or participating in a LifeFundies session, you confirm that:</p>
              <ul style={{ listStyleType: 'disc', paddingLeft: 'var(--sp-5)', marginBottom: 'var(--sp-4)' }}>
                <li style={{ marginBottom: 'var(--sp-1)' }}>You are 13 years or older.</li>
                <li style={{ marginBottom: 'var(--sp-1)' }}>You have read and understood the terms mentioned here.</li>
                <li style={{ marginBottom: 'var(--sp-1)' }}>You agree to follow our session guidelines, data policy, and refund conditions.</li>
              </ul>

              <h5 style={{ fontWeight: 600, marginTop: 'var(--sp-4)', marginBottom: 'var(--sp-2)' }}>2. Nature of Service – Judgment-Free Guidance</h5>
              <p style={{ marginBottom: 'var(--sp-2)' }}>LifeFundies is not a therapy or medical counseling service. Instead, we are India’s first life-readiness and clarity platform, designed for people seeking:</p>
              <ul style={{ listStyleType: 'disc', paddingLeft: 'var(--sp-5)', marginBottom: 'var(--sp-4)' }}>
                <li style={{ marginBottom: 'var(--sp-1)' }}>Emotional clarity</li>
                <li style={{ marginBottom: 'var(--sp-1)' }}>Career guidance</li>
                <li style={{ marginBottom: 'var(--sp-1)' }}>Non-clinical life support conversations</li>
                <li style={{ marginBottom: 'var(--sp-1)' }}>Personal development chats</li>
                <li style={{ marginBottom: 'var(--sp-1)' }}>Peer mentoring with privacy and empathy</li>
              </ul>
              <p style={{ marginBottom: 'var(--sp-4)' }}>We provide a safe, non-judgmental space for structured guidance — not treatment, therapy, or diagnosis.</p>

              <h5 style={{ fontWeight: 600, marginTop: 'var(--sp-4)', marginBottom: 'var(--sp-2)' }}>3. Peer-Based Guide Model</h5>
              <p style={{ marginBottom: 'var(--sp-2)' }}>LifeFundies operates on a peer-guide framework. Here’s how it works:</p>
              <ul style={{ listStyleType: 'disc', paddingLeft: 'var(--sp-5)', marginBottom: 'var(--sp-4)' }}>
                <li style={{ marginBottom: 'var(--sp-1)' }}>All guides are in your age group or just a step ahead (e.g., college seniors, recent graduates, working professionals, trained mentees).</li>
                <li style={{ marginBottom: 'var(--sp-1)' }}>Every guide is personally trained under LifeFundies parameters, including: active listening, session privacy protocols, emotional neutrality, and structured response framework.</li>
                <li style={{ marginBottom: 'var(--sp-1)' }}>No guide offers medical, psychiatric, or therapeutic advice.</li>
              </ul>

              <h5 style={{ fontWeight: 600, marginTop: 'var(--sp-4)', marginBottom: 'var(--sp-2)' }}>4. Session Access & Payment</h5>
              <p style={{ marginBottom: 'var(--sp-2)' }}>Sessions can only be booked via Tally Form and confirmed after payment via Cashfree.</p>
              <p style={{ marginBottom: 'var(--sp-2)' }}>LF-ID (your anonymous identity) is generated only post-payment verification.</p>
              <p style={{ marginBottom: 'var(--sp-2)' }}>First-time users may access a subsidized trial (if mentioned).</p>
              <p style={{ marginBottom: 'var(--sp-4)' }}>Repeat users falsely claiming “first session” to bypass payment may be banned for 3 months.</p>

              <h5 style={{ fontWeight: 600, marginTop: 'var(--sp-4)', marginBottom: 'var(--sp-2)' }}>5. Session Flow & Confidentiality</h5>
              <p style={{ marginBottom: 'var(--sp-2)' }}>All sessions are held via WhatsApp, Zoom, or Chat, depending on user choice.</p>
              <p style={{ marginBottom: 'var(--sp-2)' }}>Your real name, number, or email is never revealed to the guide.</p>
              <p style={{ marginBottom: 'var(--sp-2)' }}>Guides receive only: LF-ID (semi-anonymous ID), Chosen topic (e.g., “Career Confusion”), and Session time slot.</p>
              <p style={{ marginBottom: 'var(--sp-4)' }}>LifeFundies will never sell or misuse your data.</p>

              <h5 style={{ fontWeight: 600, marginTop: 'var(--sp-4)', marginBottom: 'var(--sp-2)' }}>6. Refund Policy</h5>
              <p style={{ marginBottom: 'var(--sp-2)' }}>No refunds are issued post-session.</p>
              <p style={{ marginBottom: 'var(--sp-4)' }}>If technical errors or accidental payments occur, you may contact support@lifefundies.in within 48 hours.</p>

              <h5 style={{ fontWeight: 600, marginTop: 'var(--sp-4)', marginBottom: 'var(--sp-2)' }}>7. Misuse & Bans</h5>
              <p style={{ marginBottom: 'var(--sp-2)' }}>Submitting false info, misusing free services, or trolling guides will result in a ban for up to 3 months.</p>
              <p style={{ marginBottom: 'var(--sp-4)' }}>We reserve the right to suspend users without notice in case of policy violation.</p>

              <h5 style={{ fontWeight: 600, marginTop: 'var(--sp-4)', marginBottom: 'var(--sp-2)' }}>8. Intellectual Property</h5>
              <p style={{ marginBottom: 'var(--sp-2)' }}>All platform content, session formats, training materials, LF-ID systems, and brand names are property of LifeFundies.</p>
              <p style={{ marginBottom: 'var(--sp-4)' }}>Do not copy, replicate, record, or screenshot without written permission.</p>

              <h5 style={{ fontWeight: 600, marginTop: 'var(--sp-4)', marginBottom: 'var(--sp-2)' }}>9. Disclaimer</h5>
              <p style={{ marginBottom: 'var(--sp-2)' }}>LifeFundies does not replace professional therapy or clinical help.</p>
              <p style={{ marginBottom: 'var(--sp-2)' }}>For mental health emergencies, we recommend contacting certified professionals.</p>
              <p style={{ marginBottom: 'var(--sp-4)' }}>All guidance is offered as structured, non-expert peer conversations, not diagnosis.</p>

              <h5 style={{ fontWeight: 600, marginTop: 'var(--sp-4)', marginBottom: 'var(--sp-2)' }}>10. Modifications to Terms</h5>
              <p style={{ marginBottom: 'var(--sp-4)' }}>These Terms may be updated periodically. Continued use implies your acceptance of any new terms. Updates will be posted on lifefundies.in.</p>
            </div>
            <div className="booking-terms-footer">
              <button type="button" onClick={() => {
                setAgreedToTerms(true);
                setShowTermsModal(false);
              }} className="btn btn-primary" style={{ width: '100%' }}>
                I Agree
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
