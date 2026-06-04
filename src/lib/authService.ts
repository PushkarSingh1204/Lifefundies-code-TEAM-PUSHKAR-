import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  GoogleAuthProvider,
  signInAnonymously as firebaseSignInAnonymously,
  signInWithPopup,
  updateProfile,
  sendPasswordResetEmail,
  onAuthStateChanged,
  linkWithCredential,
  linkWithPopup,
  EmailAuthProvider,
} from 'firebase/auth'
import { auth } from './firebase'
import type { User as UserType } from '../types'
import { createUserDoc, getUserDoc, subscribeToUserDoc } from './userRepository'
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  writeBatch, 
  doc, 
  getDoc, 
  updateDoc,
  serverTimestamp 
} from 'firebase/firestore'
import { db } from './firebase'

// ── Anonymous Account Data Migration Helper ──────────────────
export const migrateAnonymousData = async (anonymousUid: string, permanentUid: string) => {
  if (!anonymousUid || !permanentUid || anonymousUid === permanentUid) return

  try {
    const batch = writeBatch(db)

    // 1. Migrate bookings
    const bookingsRef = collection(db, 'bookings')
    const bookingsQuery = query(bookingsRef, where('userId', '==', anonymousUid))
    const bookingsSnap = await getDocs(bookingsQuery)
    bookingsSnap.forEach(bookingDoc => {
      batch.update(bookingDoc.ref, { userId: permanentUid, updatedAt: serverTimestamp() })
    })

    // 2. Migrate sessions
    const sessionsRef = collection(db, 'sessions')
    const sessionsQuery = query(sessionsRef, where('userId', '==', anonymousUid))
    const sessionsSnap = await getDocs(sessionsQuery)
    sessionsSnap.forEach(sessionDoc => {
      batch.update(sessionDoc.ref, { userId: permanentUid, updatedAt: serverTimestamp() })
    })

    // 3. Migrate notifications
    const notificationsRef = collection(db, 'notifications')
    const notificationsQuery = query(notificationsRef, where('userId', '==', anonymousUid))
    const notificationsSnap = await getDocs(notificationsQuery)
    notificationsSnap.forEach(notifDoc => {
      batch.update(notifDoc.ref, { userId: permanentUid })
    })

    // 4. Merge user document data
    const anonUserRef = doc(db, 'users', anonymousUid)
    const permUserRef = doc(db, 'users', permanentUid)

    const [anonSnap, permSnap] = await Promise.all([
      getDoc(anonUserRef),
      getDoc(permUserRef)
    ])

    if (anonSnap.exists()) {
      const anonData = anonSnap.data()
      const permData = permSnap.exists() ? permSnap.data() : {}

      // Merge domains, phone, onboarding preferences, etc.
      const mergedData = {
        ...permData,
        domains: Array.from(new Set([...(anonData.domains || []), ...(permData.domains || [])])),
        phone: permData.phone || anonData.phone || '',
        phoneNumber: permData.phoneNumber || anonData.phoneNumber || '',
        whatsappNotificationsEnabled: permData.whatsappNotificationsEnabled !== undefined 
          ? permData.whatsappNotificationsEnabled 
          : (anonData.whatsappNotificationsEnabled !== undefined ? anonData.whatsappNotificationsEnabled : true),
        onboardingComplete: permData.onboardingComplete || anonData.onboardingComplete || false,
        ageGroup: permData.ageGroup || anonData.ageGroup || '',
        city: permData.city || anonData.city || '',
        profession: permData.profession || anonData.profession || '',
        challenge: permData.challenge || anonData.challenge || '',
        updatedAt: serverTimestamp()
      }

      batch.set(permUserRef, mergedData, { merge: true })
      batch.delete(anonUserRef)
    }

    await batch.commit()
    console.log(`[Data Migration] Successfully migrated data from anonymous user ${anonymousUid} to authenticated user ${permanentUid}`)
  } catch (err) {
    console.error('[Data Migration] Error migrating anonymous data:', err)
  }
}

// ── Email/Password Auth ──────────────────────────────────────
export const signUpWithEmail = async (email: string, password: string, displayName: string, phone: string = '', role: 'seeker' | 'mentor' = 'seeker') => {
  try {
    const safeRole = role === 'mentor' ? 'seeker' : role
    const anonymousUser = auth.currentUser && auth.currentUser.isAnonymous ? auth.currentUser : null

    if (anonymousUser) {
      try {
        const credential = EmailAuthProvider.credential(email, password)
        const userCredential = await linkWithCredential(anonymousUser, credential)
        const firebaseUser = userCredential.user

        await updateProfile(firebaseUser, { displayName })

        const existingDoc = await getUserDoc(firebaseUser.uid)
        const updatedUser: UserType = {
          uid: firebaseUser.uid,
          displayName,
          email,
          phone: phone || (existingDoc?.phone || ''),
          role: existingDoc?.role || safeRole,
          domains: existingDoc?.domains || [],
          isAnonymous: false,
          onboardingComplete: existingDoc?.onboardingComplete || false,
          createdAt: existingDoc?.createdAt || new Date(),
        }

        await createUserDoc(updatedUser)
        return updatedUser
      } catch (linkErr: any) {
        if (linkErr.code === 'auth/email-already-in-use' || linkErr.code === 'auth/credential-already-in-use') {
          console.log('[Auth] Email already in use during linking, signing in instead to migrate anonymous data...')
          return await signInWithEmail(email, password, safeRole)
        } else {
          throw linkErr
        }
      }
    } else {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password)
      const firebaseUser = userCredential.user

      await updateProfile(firebaseUser, { displayName })

      const newUser: UserType = {
        uid: firebaseUser.uid,
        displayName,
        email,
        phone,
        role: safeRole,
        domains: [],
        isAnonymous: false,
        onboardingComplete: false,
        createdAt: new Date(),
      }

      await createUserDoc(newUser)
      return newUser
    }
  } catch (error: any) {
    console.error('Sign up error:', error)
    throw new Error(error.message || 'Failed to sign up')
  }
}

export const signInWithEmail = async (email: string, password: string, selectedRole?: 'seeker' | 'mentor') => {
  try {
    const anonymousUser = auth.currentUser && auth.currentUser.isAnonymous ? auth.currentUser : null

    const userCredential = await signInWithEmailAndPassword(auth, email, password)
    const firebaseUser = userCredential.user

    if (anonymousUser && anonymousUser.uid !== firebaseUser.uid) {
      await migrateAnonymousData(anonymousUser.uid, firebaseUser.uid)
    }

    let userData = await getUserDoc(firebaseUser.uid)

    if (!userData) {
      const newUser: UserType = {
        uid: firebaseUser.uid,
        displayName: firebaseUser.displayName || 'User',
        email: firebaseUser.email || email,
        phone: firebaseUser.phoneNumber || '',
        role: 'seeker',
        domains: [],
        isAnonymous: false,
        onboardingComplete: false,
        createdAt: new Date(),
      }
      await createUserDoc(newUser)
      userData = newUser
    } else {
      if (selectedRole === 'mentor' && userData.role !== 'mentor' && userData.role !== 'admin') {
        throw new Error('This account is not approved as a mentor yet. Please use seeker login or submit a mentor application.')
      }
    }

    const loggedInUser: UserType = {
      ...userData,
      uid: firebaseUser.uid,
      displayName: firebaseUser.displayName || userData.displayName || 'User',
      email: firebaseUser.email || email,
      phone: userData.phone || firebaseUser.phoneNumber || '',
      role: userData.role || 'seeker',
      domains: userData.domains || [],
      isAnonymous: userData.isAnonymous || false,
      onboardingComplete: userData.onboardingComplete || false,
      createdAt: userData.createdAt || new Date(),
    }

    return loggedInUser
  } catch (error: any) {
    console.error('Sign in error:', error)
    throw new Error(error.message || 'Failed to sign in')
  }
}

// ── Google Auth ──────────────────────────────────────
export const signInWithGoogle = async (role: 'seeker' | 'mentor' = 'seeker') => {
  try {
    const provider = new GoogleAuthProvider()
    const anonymousUser = auth.currentUser && auth.currentUser.isAnonymous ? auth.currentUser : null

    if (anonymousUser) {
      try {
        const userCredential = await linkWithPopup(anonymousUser, provider)
        const firebaseUser = userCredential.user

        let loggedInUser = await getUserDoc(firebaseUser.uid)
        if (!loggedInUser) {
          loggedInUser = {
            uid: firebaseUser.uid,
            displayName: firebaseUser.displayName || 'Google User',
            email: firebaseUser.email || '',
            phone: firebaseUser.phoneNumber || '',
            role: 'seeker',
            domains: [],
            isAnonymous: false,
            onboardingComplete: false,
            createdAt: new Date(),
          }
          await createUserDoc(loggedInUser)
        } else {
          await updateDoc(doc(db, 'users', firebaseUser.uid), {
            isAnonymous: false,
            updatedAt: serverTimestamp()
          })
          loggedInUser.isAnonymous = false
        }
        return loggedInUser
      } catch (linkErr: any) {
        if (linkErr.code === 'auth/credential-already-in-use') {
          const userCredential = await signInWithPopup(auth, provider)
          const firebaseUser = userCredential.user

          await migrateAnonymousData(anonymousUser.uid, firebaseUser.uid)

          const loggedInUser = await getUserDoc(firebaseUser.uid)
          if (!loggedInUser) throw new Error('Failed to load user document after migration')
          return loggedInUser
        } else {
          throw linkErr
        }
      }
    } else {
      const userCredential = await signInWithPopup(auth, provider)
      const firebaseUser = userCredential.user

      let loggedInUser = await getUserDoc(firebaseUser.uid)

      if (!loggedInUser) {
        const newUser: UserType = {
          uid: firebaseUser.uid,
          displayName: firebaseUser.displayName || 'Google User',
          email: firebaseUser.email || '',
          phone: firebaseUser.phoneNumber || '',
          role: 'seeker',
          domains: [],
          isAnonymous: false,
          onboardingComplete: false,
          createdAt: new Date(),
        }

        await createUserDoc(newUser)
        loggedInUser = newUser
      } else {
        if (role === 'mentor' && loggedInUser.role !== 'mentor' && loggedInUser.role !== 'admin') {
          throw new Error('This account is not approved as a mentor yet. Please use seeker login or submit a mentor application.')
        }
      }

      return loggedInUser
    }
  } catch (error: any) {
    console.error('Google sign in error:', error)
    throw new Error(error.message || 'Failed to sign in with Google')
  }
}

export const signInAnonymously = async () => {
  try {
    const userCredential = await firebaseSignInAnonymously(auth)
    const firebaseUser = userCredential.user
    
    let anonymousUser = await getUserDoc(firebaseUser.uid)

    if (anonymousUser) {
      return anonymousUser
    }

    const newUser: UserType = {
      uid: firebaseUser.uid,
      displayName: 'Anonymous User',
      email: '',
      role: 'seeker',
      domains: [],
      isAnonymous: true,
      onboardingComplete: false,
      createdAt: new Date(),
    }

    await createUserDoc(newUser)
    return newUser
  } catch (error: any) {
    console.error('Anonymous sign in error:', error)
    throw new Error(error.message || 'Failed to continue anonymously')
  }
}

// ── Logout ──────────────────────────────────────
export const logout = async () => {
  try {
    await signOut(auth)
  } catch (error: any) {
    console.error('Sign out error:', error)
    throw new Error(error.message || 'Failed to sign out')
  }
}

// ── Password Reset ──────────────────────────────────────
export const resetPassword = async (email: string) => {
  try {
    await sendPasswordResetEmail(auth, email)
  } catch (error: any) {
    console.error('Password reset error:', error)
    throw new Error(error.message || 'Failed to send password reset email')
  }
}

// ── Auth State Listener (Real-time, multi-tab safe) ──────────────────────────
export const onAuthStateChange = (callback: (user: UserType | null) => void) => {
  let unsubscribeUserDoc: (() => void) | null = null

  const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
    // Clean up previous user document listener when auth state changes
    if (unsubscribeUserDoc) {
      unsubscribeUserDoc()
      unsubscribeUserDoc = null
    }

    if (firebaseUser) {
      try {
        let userData = await getUserDoc(firebaseUser.uid)

        if (!userData) {
          // Create user doc if first login
          const newUser: UserType = {
            uid: firebaseUser.uid,
            displayName: firebaseUser.displayName || (firebaseUser.isAnonymous ? 'Anonymous User' : 'User'),
            email: firebaseUser.email || '',
            phone: firebaseUser.phoneNumber || '',
            role: 'seeker',
            domains: [],
            isAnonymous: firebaseUser.isAnonymous,
            onboardingComplete: false,
            createdAt: new Date(),
          }
          await createUserDoc(newUser)
        }

        // Subscribe to real-time user doc updates (role changes, profile edits)
        unsubscribeUserDoc = subscribeToUserDoc(firebaseUser.uid, (user) => {
          callback(user)
        })
      } catch (error) {
        console.error('Error fetching user data:', error)
        callback(null)
      }
    } else {
      // User signed out — callback(null) clears auth store
      callback(null)
    }
  })

  // Return cleanup function that unsubscribes both listeners
  return () => {
    unsubscribeAuth()
    if (unsubscribeUserDoc) {
      unsubscribeUserDoc()
    }
  }
}
