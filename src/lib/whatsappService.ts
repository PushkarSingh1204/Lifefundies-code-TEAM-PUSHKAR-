import { 
  collection, 
  addDoc, 
  getDocs, 
  query, 
  where, 
  doc, 
  getDoc, 
  serverTimestamp 
} from 'firebase/firestore'
import { db } from './firebase'

// Read company number and normalize by removing spaces, plus, hyphens and prefixing 91 if 10 digits
const rawCompanyNo = import.meta.env.VITE_COMPANY_WHATSAPP_NUMBER || ''
const cleanCompanyNo = rawCompanyNo.replace(/[\s+-]/g, '')
export const COMPANY_WHATSAPP_NUMBER = cleanCompanyNo.length === 10 ? '91' + cleanCompanyNo : cleanCompanyNo

export type WhatsAppMessageType = 
  | 'booking' 
  | 'acceptance' 
  | 'rejection' 
  | 'reschedule' 
  | 'cancellation' 
  | 'reminder' 
  | 'reminder10' 
  | 'update'

interface WhatsAppTemplateData {
  recipientId: string
  recipientPhone: string
  recipientName: string
  mentorName: string
  studentName?: string
  date: string
  time: string
  duration: number
  sessionLink: string
  sessionId: string
}

/**
 * Checks if a WhatsApp log already exists for this session and message type
 * to prevent duplicate message delivery.
 */
export const checkDuplicateWhatsApp = async (
  recipientPhone: string,
  sessionId: string,
  messageType: WhatsAppMessageType
): Promise<boolean> => {
  try {
    const logsRef = collection(db, 'whatsapp_logs')
    const q = query(
      logsRef,
      where('recipient', '==', recipientPhone),
      where('sessionId', '==', sessionId),
      where('messageType', '==', messageType),
      where('status', '==', 'sent')
    )
    const snapshot = await getDocs(q)
    return !snapshot.empty
  } catch (error) {
    console.error('Error checking duplicate WhatsApp logs:', error)
    return false
  }
}

/**
 * Checks the user's settings to see if SMS/WhatsApp Alerts are enabled.
 */
export const checkUserNotificationPreference = async (userId: string): Promise<boolean> => {
  try {
    const userRef = doc(db, 'users', userId)
    const userSnap = await getDoc(userRef)
    if (!userSnap.exists()) return false
    const data = userSnap.data()
    const isMentor = data.role === 'mentor'
    if (isMentor) {
      // Mentors: Enabled by default (opt-out model)
      return data.whatsappNotificationsEnabled !== false
    } else {
      // Seekers / Anonymous Seekers: Disabled by default (opt-in model)
      return data.whatsappNotificationsEnabled === true
    }
  } catch (error) {
    console.error('Error reading user notification preferences:', error)
    return false
  }
}

/**
 * Centralized WhatsApp message sender.
 * Respects preferences, formats the template, checks duplicates, and records logs.
 */
export const sendWhatsAppNotification = async (
  messageType: WhatsAppMessageType,
  data: WhatsAppTemplateData
): Promise<boolean> => {
  try {
    const isEnabled = await checkUserNotificationPreference(data.recipientId)
    if (!isEnabled) {
      console.log(`[WhatsApp Service] Skipping message. WhatsApp notifications are disabled for user: ${data.recipientId}`)
      return false
    }

    if (!data.recipientPhone) {
      console.warn(`[WhatsApp Service] Skipping message. No recipient phone number provided for user: ${data.recipientId}`)
      return false
    }

    const cleanPhone = data.recipientPhone.replace(/[\s+-]/g, '')
    const formattedRecipient = cleanPhone.length === 10 ? '91' + cleanPhone : cleanPhone

    const isDuplicate = await checkDuplicateWhatsApp(formattedRecipient, data.sessionId, messageType)
    if (isDuplicate) {
      console.log(`[WhatsApp Service] Skipping duplicate message of type "${messageType}" for session: ${data.sessionId}`)
      return false
    }

    // Compose message based on type
    const isRecipientMentor = data.recipientName === data.mentorName;
    const targetPartner = isRecipientMentor ? (data.studentName || 'Student') : data.mentorName;
    const student = data.studentName || 'Student';
    const mentor = data.mentorName || 'Mentor';

    let messageText = ''
    switch (messageType) {
      case 'booking':
        if (isRecipientMentor) {
          messageText = `Hi ${data.recipientName}, you have a new session booking request from ${targetPartner}. Details: ${data.date} at ${data.time} (${data.duration} mins). Link: ${data.sessionLink}`
        } else {
          messageText = `Hi ${data.recipientName}, your session booking request with ${data.mentorName} has been received. Details: ${data.date} at ${data.time} (${data.duration} mins). Link: ${data.sessionLink}`
        }
        break
      case 'acceptance':
        messageText = `Hi ${data.recipientName},\n\nYour session request has been accepted by ${data.mentorName}.\n\nSession Details:\n* Mentor: ${data.mentorName}\n* Date: ${data.date}\n* Time: ${data.time}\n* Duration: ${data.duration} mins\n\nJoin Link:\n${data.sessionLink}\n\nLooking forward to speaking with you.\n\nThanks,\n${data.mentorName}\nvia LifeFundies`
        break
      case 'rejection':
        messageText = `Hi ${data.recipientName}, your session booking request with ${data.mentorName} on ${data.date} at ${data.time} has been declined. Link: ${data.sessionLink}`
        break
      case 'reschedule':
        messageText = `Hi ${data.recipientName}, your session with ${targetPartner} has been rescheduled. New Details: ${data.date} at ${data.time} (${data.duration} mins). Join link: ${data.sessionLink}`
        break
      case 'cancellation':
        messageText = `Hi ${data.recipientName}, your session with ${targetPartner} on ${data.date} at ${data.time} has been cancelled. Details: ${data.sessionLink}`
        break
      case 'reminder':
        messageText = `Hi ${data.recipientName},\n\nThis is a 30-minute reminder for your upcoming LifeFundies session.\n\nSession Details:\n* Student: ${student}\n* Mentor: ${mentor}\n* Date: ${data.date}\n* Time: ${data.time}\n\nJoin Link:\n${data.sessionLink}`
        break
      case 'reminder10':
        messageText = `Hi ${data.recipientName},\n\nThis is a 10-minute prior reminder for your upcoming LifeFundies session.\n\nSession Details:\n* Student: ${student}\n* Mentor: ${mentor}\n* Date: ${data.date}\n* Time: ${data.time}\n\nJoin Link:\n${data.sessionLink}`
        break
      case 'update':
        messageText = `Hi ${data.recipientName}, your session details with ${targetPartner} have been updated. Details: ${data.date} at ${data.time} (${data.duration} mins). Join link: ${data.sessionLink}`
        break
    }

    // Determine WhatsApp Cloud API variables from VITE env configurations
    const accessToken = import.meta.env.VITE_WHATSAPP_ACCESS_TOKEN || ''
    const phoneNumberId = import.meta.env.VITE_WHATSAPP_PHONE_NUMBER_ID || ''

    let status: 'sent' | 'failed' = 'sent'
    let errorMessage = ''

    // Add logging to verify the number being used during notification delivery
    console.log(`[WhatsApp Service] Delivering WhatsApp notification using sender number: ${COMPANY_WHATSAPP_NUMBER || '(not configured)'}`)

    if (accessToken && phoneNumberId) {
      console.log(`[WhatsApp Service] Integrating with WhatsApp Cloud API using Phone Number ID: ${phoneNumberId} to send to ${formattedRecipient}`)
      try {
        const response = await fetch(`https://graph.facebook.com/v17.0/${phoneNumberId}/messages`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: formattedRecipient,
            type: 'text',
            text: {
              body: messageText
            }
          })
        })

        const responseData = await response.json()
        if (!response.ok) {
          status = 'failed'
          errorMessage = responseData?.error?.message || responseData?.error || `HTTP ${response.status}`
          console.error('[WhatsApp Service] Cloud API delivery failed:', responseData)
        } else {
          console.log('[WhatsApp Service] Cloud API delivery successful:', responseData)
        }
      } catch (apiErr: any) {
        status = 'failed'
        errorMessage = apiErr?.message || String(apiErr)
        console.error('[WhatsApp Service] Cloud API request exception:', apiErr)
      }
    } else {
      console.log('[WhatsApp Service] Environment credentials not configured. Running in detailed Simulation mode.')
      console.group(`[WhatsApp Notification SIMULATOR via ${COMPANY_WHATSAPP_NUMBER}]`)
      console.log(`Recipient: ${formattedRecipient} (${data.recipientName})`)
      console.log(`Message Type: ${messageType}`)
      console.log(`Message Body: "${messageText}"`)
      console.groupEnd()
    }

    // Write log history document to Firebase (satisfies requirements)
    const logsRef = collection(db, 'whatsapp_logs')
    const logDoc: any = {
      type: 'whatsapp',
      recipient: formattedRecipient,
      sessionId: data.sessionId,
      messageType,
      status,
      createdAt: serverTimestamp()
    }

    if (status === 'failed') {
      logDoc.error = errorMessage
    }

    await addDoc(logsRef, logDoc)

    return status === 'sent'
  } catch (error: any) {
    console.error('[WhatsApp Service] Failed to deliver notification gracefully:', error)
    // Always log failure to Firebase logs
    try {
      const logsRef = collection(db, 'whatsapp_logs')
      await addDoc(logsRef, {
        type: 'whatsapp',
        recipient: data.recipientPhone || 'unknown',
        sessionId: data.sessionId || 'unknown',
        messageType,
        status: 'failed',
        error: error?.message || String(error),
        createdAt: serverTimestamp()
      })
    } catch (dbErr) {
      console.error('[WhatsApp Service] Failed to log exception to Firestore:', dbErr)
    }
    // Always return false to prevent blocking normal application flow
    return false
  }
}

