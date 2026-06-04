import { 
  doc, 
  setDoc, 
  getDoc, 
  updateDoc, 
  collection, 
  query, 
  where, 
  onSnapshot, 
  serverTimestamp,
  Timestamp 
} from 'firebase/firestore'
import { db } from './firebase'
import type { User as UserType, Mentor } from '../types'
import { normalizeMentorCategories, getLowestCategoryPrice } from './pricing'

/**
 * UserRepository
 * Encapsulates Firestore database access for Seeker and Mentor user profiles.
 * Paths: users/{userId} (for both Seekers and Mentors)
 */

export const getUserDoc = async (uid: string): Promise<UserType | null> => {
  try {
    const userDocRef = doc(db, 'users', uid)
    const docSnap = await getDoc(userDocRef)
    if (!docSnap.exists()) return null
    
    const data = docSnap.data()
    return {
      uid,
      displayName: data.displayName || 'User',
      email: data.email || '',
      phone: data.phone || '',
      role: data.role === 'user' ? 'seeker' : (data.role || 'seeker'),
      domains: data.domains || [],
      isAnonymous: data.isAnonymous || false,
      onboardingComplete: data.onboardingComplete || false,
      photoURL: data.photoURL || '',
      bio: data.bio || '',
      city: data.city || '',
      profession: data.profession || '',
      ageGroup: data.ageGroup || '',
      mentorInterests: data.mentorInterests || [],
      onboardingStep: data.onboardingStep,
      ...data,
      createdAt: data.createdAt?.toDate?.() || data.createdAt || new Date(),
    }
  } catch (error) {
    console.error('Error in getUserDoc:', error)
    throw error
  }
}

export const subscribeToUserDoc = (uid: string, callback: (user: UserType | null) => void) => {
  const userDocRef = doc(db, 'users', uid)
  return onSnapshot(userDocRef, (docSnap) => {
    if (docSnap.exists()) {
      const data = docSnap.data()
      const user: UserType = {
        uid,
        displayName: data.displayName || 'User',
        email: data.email || '',
        phone: data.phone || '',
        role: data.role === 'user' ? 'seeker' : (data.role || 'seeker'),
        domains: data.domains || [],
        isAnonymous: data.isAnonymous || false,
        onboardingComplete: data.onboardingComplete || false,
        photoURL: data.photoURL || '',
        bio: data.bio || '',
        city: data.city || '',
        profession: data.profession || '',
        ageGroup: data.ageGroup || '',
        mentorInterests: data.mentorInterests || [],
        onboardingStep: data.onboardingStep,
        ...data,
        createdAt: data.createdAt?.toDate?.() || data.createdAt || new Date(),
      }
      callback(user)
    } else {
      callback(null)
    }
  }, (error) => {
    console.error('Error subscribing to user doc:', error)
    callback(null)
  })
}

export const createUserDoc = async (user: UserType): Promise<void> => {
  try {
    const userDocRef = doc(db, 'users', user.uid)
    await setDoc(userDocRef, {
      ...user,
      createdAt: Timestamp.fromDate(user.createdAt || new Date()),
      updatedAt: serverTimestamp(),
    })
  } catch (error) {
    console.error('Error creating user doc:', error)
    throw error
  }
}

export const updateUserProfile = async (uid: string, updateData: Partial<UserType>): Promise<void> => {
  try {
    const userDocRef = doc(db, 'users', uid)
    const cleanData = { ...updateData, updatedAt: serverTimestamp() }
    await updateDoc(userDocRef, cleanData)
  } catch (error) {
    console.error('Error updating user profile:', error)
    throw error
  }
}

export const submitMentorApplication = async (
  uid: string,
  applicationData: {
    fullName: string
    phone: string
    qualification: string
    experience: string
    expertise: string[]
    languages: string[]
    bio: string
  }
): Promise<void> => {
  try {
    const userDocRef = doc(db, 'users', uid)
    await updateDoc(userDocRef, {
      mentorApplicationStatus: 'pending',
      mentorApplication: {
        ...applicationData,
        submittedAt: serverTimestamp(),
      },
      updatedAt: serverTimestamp(),
    })
  } catch (error) {
    console.error('Error submitting mentor application:', error)
    throw error
  }
}

export const updateMentorProfile = async (
  uid: string,
  profileForm: {
    fullName: string
    displayName: string
    photoURL: string
    bio: string
    qualification: string
    experience: string
    languages: string
    expertise: string
    certifications: string
    categories: string[]
  }
): Promise<void> => {
  try {
    const userDocRef = doc(db, 'users', uid)
    const languagesArray = profileForm.languages.split(',').map(item => item.trim()).filter(Boolean)
    const expertiseArray = profileForm.expertise.split(',').map(item => item.trim()).filter(Boolean)
    const certificationsArray = profileForm.certifications.split(',').map(item => item.trim()).filter(Boolean)
    const categoriesArray = profileForm.categories
    const yearsExp = Number(profileForm.experience) || 0

    const payload = {
      photoURL: profileForm.photoURL,
      fullName: profileForm.fullName.trim(),
      displayName: profileForm.displayName.trim() || profileForm.fullName.trim(),
      bio: profileForm.bio.trim(),
      qualification: profileForm.qualification.trim(),
      education: profileForm.qualification.trim(),
      experience: yearsExp,
      yearsOfExperience: yearsExp,
      languages: languagesArray,
      languagesKnown: languagesArray,
      expertise: expertiseArray,
      expertiseDomains: expertiseArray,
      certifications: certificationsArray,
      categories: categoriesArray,
      sessionPrice: Math.min(...categoriesArray.flatMap(categoryId => {
        // Fallback pricing structures check
        const categoryPrices = getLowestCategoryPrice([categoryId as any])
        return [categoryPrices || 299]
      })),
      updatedAt: serverTimestamp(),
    }
    await updateDoc(userDocRef, payload)
  } catch (error) {
    console.error('Error updating mentor profile:', error)
    throw error
  }
}

export const subscribeToMentors = (callback: (mentors: Mentor[]) => void) => {
  const usersRef = collection(db, 'users')
  const q = query(usersRef, where('role', '==', 'mentor'))
  
  return onSnapshot(q, (snapshot) => {
    const dbMentors = snapshot.docs.map(docSnap => {
      const data = docSnap.data()
      const categories = normalizeMentorCategories(data.categories)
      return {
        uid: docSnap.id,
        displayName: data.displayName || data.fullName || 'Mentor',
        email: data.email || '',
        photoURL: data.photoURL || '',
        bio: data.bio || data.about || '',
        domains: data.domains || [],
        expertise: data.expertise || data.expertiseDomains || [],
        categories,
        sessionPrice: data.sessionPrice || getLowestCategoryPrice(categories),
        rating: data.rating || 5.0,
        reviewCount: data.reviewCount || 0,
        totalSessions: data.totalSessions || 0,
        availability: data.availability || {},
        yearsOfExperience: Number(data.yearsOfExperience || data.experience || 0),
        education: data.education || data.qualification || '',
        qualification: data.qualification || data.education || '',
        languages: data.languages || data.languagesKnown || ['English', 'Hindi'],
        isVerified: data.isVerified !== undefined ? data.isVerified : true,
        certifications: data.certifications || [],
      } as Mentor
    })
    callback(dbMentors)
  }, (err) => {
    console.error('Failed to subscribe to mentors:', err)
  })
}

export const updateUserMentorInterests = async (uid: string, interests: string[]): Promise<void> => {
  try {
    const userDocRef = doc(db, 'users', uid)
    await updateDoc(userDocRef, {
      mentorInterests: interests,
      updatedAt: serverTimestamp(),
    })
  } catch (error) {
    console.error('Error updating mentor interests:', error)
    throw error
  }
}
