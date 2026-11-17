import { initializeApp, getApps, getApp } from 'firebase/app'
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  updateProfile,
} from 'firebase/auth'
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  onSnapshot,
  deleteDoc,
} from 'firebase/firestore'
import { getStorage, ref, uploadString, getDownloadURL } from 'firebase/storage'

const CONFIG_STORAGE_KEY = 'sitepunch_firebase_config'

// Default template or loaded custom config
export function getFirebaseConfig() {
  try {
    const custom = localStorage.getItem(CONFIG_STORAGE_KEY)
    if (custom) {
      const parsed = JSON.parse(custom)
      if (parsed && parsed.apiKey && parsed.projectId) {
        return parsed
      }
    }
  } catch {}

  // Check Vite environment variables
  if (import.meta.env.VITE_FIREBASE_API_KEY && import.meta.env.VITE_FIREBASE_PROJECT_ID) {
    return {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || `${import.meta.env.VITE_FIREBASE_PROJECT_ID}.firebaseapp.com`,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || `${import.meta.env.VITE_FIREBASE_PROJECT_ID}.appspot.com`,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
      appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
    }
  }

  return null
}

export function saveFirebaseConfig(configObj) {
  if (!configObj) {
    localStorage.removeItem(CONFIG_STORAGE_KEY)
    return
  }
  localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(configObj))
}

export function isFirebaseConfigured() {
  return Boolean(getFirebaseConfig())
}

let appInstance = null
let authInstance = null
let firestoreInstance = null
let storageInstance = null

export function initFirebase() {
  if (appInstance) {
    return { app: appInstance, auth: authInstance, db: firestoreInstance, storage: storageInstance }
  }

  const config = getFirebaseConfig()
  if (!config) {
    return { app: null, auth: null, db: null, storage: null }
  }

  try {
    appInstance = getApps().length > 0 ? getApp() : initializeApp(config)
    authInstance = getAuth(appInstance)

    // Enable multi-tab offline IndexedDB persistent cache
    try {
      firestoreInstance = initializeFirestore(appInstance, {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
      })
    } catch {
      // Fallback if already initialized in another context
      firestoreInstance = initializeFirestore(appInstance, {})
    }

    storageInstance = getStorage(appInstance)

    return {
      app: appInstance,
      auth: authInstance,
      db: firestoreInstance,
      storage: storageInstance,
    }
  } catch (err) {
    console.warn('Firebase initialization notice:', err)
    return { app: null, auth: null, db: null, storage: null }
  }
}

// ── Auth Helpers ─────────────────────────────────────────────────────────────

export async function signUpWithFirebase({ email, password, name, organization }) {
  const { auth, db } = initFirebase()
  if (!auth) throw new Error('Firebase is not configured. Please enter your Firebase configuration keys in Settings.')

  const userCredential = await createUserWithEmailAndPassword(auth, email, password)
  const user = userCredential.user

  if (name && auth.currentUser) {
    try {
      await updateProfile(auth.currentUser, { displayName: name })
    } catch {}
  }

  // Persist user record in Firestore
  if (db) {
    try {
      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        email: user.email,
        displayName: name || '',
        organization: organization || '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }, { merge: true })
    } catch (err) {
      console.warn('Could not save user profile to Firestore:', err)
    }
  }

  return {
    uid: user.uid,
    email: user.email,
    name: name || user.displayName || '',
    organization: organization || '',
  }
}

export async function signInWithFirebase({ email, password }) {
  const { auth, db } = initFirebase()
  if (!auth) throw new Error('Firebase is not configured. Please enter your Firebase configuration keys in Settings.')

  const userCredential = await signInWithEmailAndPassword(auth, email, password)
  const user = userCredential.user

  let organization = ''
  let name = user.displayName || ''

  if (db) {
    try {
      const snap = await getDoc(doc(db, 'users', user.uid))
      if (snap.exists()) {
        const d = snap.data()
        organization = d.organization || ''
        if (d.displayName) name = d.displayName
      }
    } catch {}
  }

  return {
    uid: user.uid,
    email: user.email,
    name,
    organization,
  }
}

export async function signInWithGoogleFirebase() {
  const { auth, db } = initFirebase()
  if (!auth) throw new Error('Firebase is not configured. Please enter your Firebase configuration keys in Settings.')

  const provider = new GoogleAuthProvider()
  const userCredential = await signInWithPopup(auth, provider)
  const user = userCredential.user

  let organization = ''
  let name = user.displayName || ''

  if (db) {
    try {
      const snap = await getDoc(doc(db, 'users', user.uid))
      if (snap.exists()) {
        const d = snap.data()
        organization = d.organization || ''
      } else {
        await setDoc(doc(db, 'users', user.uid), {
          uid: user.uid,
          email: user.email,
          displayName: name,
          organization: '',
          createdAt: Date.now(),
        })
      }
    } catch {}
  }

  return {
    uid: user.uid,
    email: user.email,
    name,
    organization,
  }
}

export async function signOutFirebase() {
  const { auth } = initFirebase()
  if (auth) {
    await firebaseSignOut(auth)
  }
}

export function subscribeToAuthChanges(callback) {
  const { auth } = initFirebase()
  if (!auth) return () => {}
  return onAuthStateChanged(auth, callback)
}

// ── Realtime Two-Way Sync Engine ─────────────────────────────────────────────

/**
 * Syncs a complete project and its nested records (phases, floor plans, punch items)
 * to Firestore under users/{uid}/projects/{projectUuid}.
 */
export async function syncProjectToCloud(projectData, subCollections = {}) {
  const { auth, db } = initFirebase()
  if (!auth?.currentUser || !db) return false

  const uid = auth.currentUser.uid
  const projRef = doc(db, 'users', uid, 'projects', projectData.uuid)

  await setDoc(projRef, {
    ...projectData,
    _syncedAt: Date.now(),
    _syncedBy: uid,
  }, { merge: true })

  // Sync sub-collections if provided
  if (subCollections.phases && Array.isArray(subCollections.phases)) {
    for (const ph of subCollections.phases) {
      const phRef = doc(db, 'users', uid, 'projects', projectData.uuid, 'phases', ph.uuid)
      await setDoc(phRef, ph, { merge: true })
    }
  }

  if (subCollections.floorPlans && Array.isArray(subCollections.floorPlans)) {
    for (const fp of subCollections.floorPlans) {
      const fpRef = doc(db, 'users', uid, 'projects', projectData.uuid, 'floorPlans', fp.uuid)
      await setDoc(fpRef, fp, { merge: true })
    }
  }

  if (subCollections.punchItems && Array.isArray(subCollections.punchItems)) {
    for (const it of subCollections.punchItems) {
      const itRef = doc(db, 'users', uid, 'projects', projectData.uuid, 'punchItems', it.uuid)
      await setDoc(itRef, it, { merge: true })
    }
  }

  return true
}

/**
 * Listens to cloud projects for the logged in user in real-time.
 * Automatically notifies callback when remote changes arrive from other devices.
 */
export function listenToCloudProjects(callback) {
  const { auth, db } = initFirebase()
  if (!auth?.currentUser || !db) return () => {}

  const uid = auth.currentUser.uid
  const colRef = collection(db, 'users', uid, 'projects')

  return onSnapshot(colRef, (snapshot) => {
    const projects = []
    snapshot.forEach(docSnap => {
      projects.push(docSnap.data())
    })
    callback(projects)
  }, (err) => {
    console.warn('Cloud projects snapshot notice:', err)
  })
}

/**
 * Uploads a base64 or data URL site photo to Firebase Storage and returns download URL.
 */
export async function uploadSitePhotoToCloud(dataUrl, fileName) {
  const { auth, storage } = initFirebase()
  if (!auth?.currentUser || !storage) return null

  try {
    const uid = auth.currentUser.uid
    const storageRef = ref(storage, `users/${uid}/photos/${fileName}`)
    await uploadString(storageRef, dataUrl, 'data_url')
    const downloadUrl = await getDownloadURL(storageRef)
    return downloadUrl
  } catch (err) {
    console.warn('Photo cloud upload failed, using local copy:', err)
    return null
  }
}
