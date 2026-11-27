import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  deleteDoc,
  collection,
  getDocs,
  onSnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import { getStorage, ref, uploadString, getDownloadURL } from 'firebase/storage';
import { AuditReportData } from '../types/audit';

export const firebaseConfig = {
  apiKey: "AIzaSyAzG0942tsO4UD-oJyZ2R-fS06TPSXNtFA",
  authDomain: "internal-technical-audit-3c4a2.firebaseapp.com",
  projectId: "internal-technical-audit-3c4a2",
  storageBucket: "internal-technical-audit-3c4a2.firebasestorage.app",
  messagingSenderId: "855910717408",
  appId: "1:855910717408:web:b035549ca07f535993fd85",
  firestoreDatabaseId: "ai-studio-qualitechqmsfact-c1a5ae65-4f9c-4993-82e8-9aec32b878f3"
};

// Initialize Firebase App
export const firebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize Firestore
let firestoreInstance: any = null;
try {
  firestoreInstance = firebaseConfig.firestoreDatabaseId
    ? getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId)
    : getFirestore(firebaseApp);
} catch (e) {
  try {
    firestoreInstance = getFirestore(firebaseApp);
  } catch (err) {
    console.warn('Firestore initialization fallback', err);
  }
}
export const db = firestoreInstance;

// Initialize Storage
let storageInstance: any = null;
try {
  storageInstance = getStorage(firebaseApp);
} catch (err) {
  console.warn('Firebase Storage initialization fallback', err);
}
export const storage = storageInstance;

const DRAFT_COLLECTION = 'active_drafts';
const DEFAULT_DRAFT_DOC_ID = 'global_active_draft';
const AUDITS_COLLECTION = 'audit_reports';
const USERS_COLLECTION = 'auditor_users';
const RESET_OTP_COLLECTION = 'password_reset_otps';

export const ADMIN_EMAIL = 'quality.bd.eng@gmail.com';

export function isAuditorAdmin(email?: string | null): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === ADMIN_EMAIL.toLowerCase();
}

function getDraftDocId(userEmail?: string | null): string {
  if (!userEmail || !userEmail.trim()) return DEFAULT_DRAFT_DOC_ID;
  return `draft_${userEmail.trim().toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
}

/**
 * Uploads a photo to Firebase Storage and returns its public URL
 */
export async function uploadPhotoToFirebaseStorage(
  photoId: string,
  dataUrl: string
): Promise<string> {
  if (!storage || !dataUrl.startsWith('data:')) {
    return dataUrl;
  }
  try {
    const photoRef = ref(storage, `audit_photos/${photoId}.jpg`);
    await uploadString(photoRef, dataUrl, 'data_url');
    const downloadUrl = await getDownloadURL(photoRef);
    return downloadUrl;
  } catch (err) {
    console.warn('Storage upload fallback to dataUrl', err);
    return dataUrl;
  }
}

/**
 * Real-time Firestore sync for active audit draft (scoped per user email)
 */
export async function syncDraftToFirestore(
  draft: any,
  clientId?: string,
  userEmail?: string | null
): Promise<void> {
  if (!db) return;
  try {
    const docRef = doc(db, DRAFT_COLLECTION, getDraftDocId(userEmail));
    if (!draft) {
      await deleteDoc(docRef);
      return;
    }

    let cleanDraft = {
      ...draft,
      ownerEmail: userEmail ? userEmail.trim().toLowerCase() : draft.ownerEmail || null,
      senderClientId: clientId || null,
      updatedAt: new Date().toISOString(),
    };

    // Protect against Firestore 1MB document limit: if images push size > 750KB, keep photo metadata
    try {
      const approxSize = JSON.stringify(cleanDraft).length;
      if (approxSize > 750000) {
        cleanDraft = {
          ...cleanDraft,
          factoryInfo: {
            ...cleanDraft.factoryInfo,
            openingMeetingPhoto: cleanDraft.factoryInfo?.openingMeetingPhoto?.startsWith('http')
              ? cleanDraft.factoryInfo.openingMeetingPhoto
              : (cleanDraft.factoryInfo?.openingMeetingPhoto ? 'image-attached' : undefined),
            factoryOutlookPhotos: cleanDraft.factoryInfo?.factoryOutlookPhotos?.map((img: any) => ({
              id: img.id,
              caption: img.caption,
              timestamp: img.timestamp,
              isConfirmed: img.isConfirmed,
              aspectRatio: img.aspectRatio,
              dataUrl: img.dataUrl?.startsWith('http') ? img.dataUrl : (img.dataUrl ? 'image-attached' : ''),
            })),
          },
          sections: cleanDraft.sections?.map((sec: any) => ({
            ...sec,
            checkpoints: sec.checkpoints?.map((cp: any) => ({
              ...cp,
              images: cp.images?.map((img: any) => ({
                id: img.id,
                caption: img.caption,
                timestamp: img.timestamp,
                isConfirmed: img.isConfirmed,
                aspectRatio: img.aspectRatio,
                dataUrl: img.dataUrl?.startsWith('http') ? img.dataUrl : (img.dataUrl ? 'image-attached' : ''),
              })),
            })),
          })),
        };
      }
    } catch {}

    await setDoc(docRef, cleanDraft, { merge: false });
  } catch (err) {
    console.warn('Firestore draft sync error', err);
  }
}

/**
 * Subscribes to real-time Firestore updates across Mobile APK and PC Browser for this auditor
 */
export function subscribeToFirestoreDraft(
  onUpdate: (draft: any) => void,
  currentClientId?: string,
  userEmail?: string | null
): Unsubscribe {
  if (!db) return () => {};
  try {
    const docRef = doc(db, DRAFT_COLLECTION, getDraftDocId(userEmail));
    return onSnapshot(
      docRef,
      (snapshot) => {
        if (!snapshot.exists()) return;
        const data = snapshot.data();
        if (!data) return;

        // Ignore updates originated from this exact client to prevent cursor jump/feedback loop
        if (currentClientId && data.senderClientId === currentClientId) {
          return;
        }

        if (data.factoryInfo || data.sections) {
          onUpdate(data);
        }
      },
      (error) => {
        console.warn('Firestore onSnapshot listener error', error);
      }
    );
  } catch (err) {
    console.warn('Failed subscribing to Firestore draft', err);
    return () => {};
  }
}

/**
 * Clears the active draft in Firestore
 */
export async function clearFirestoreDraft(userEmail?: string | null): Promise<void> {
  if (!db) return;
  try {
    const docRef = doc(db, DRAFT_COLLECTION, getDraftDocId(userEmail));
    await deleteDoc(docRef);
  } catch (err) {
    console.warn('Firestore clear draft error', err);
  }
}

/**
 * Saves a completed audit report to Firestore
 */
export async function saveAuditToFirestore(report: AuditReportData): Promise<void> {
  if (!db) return;
  try {
    const docRef = doc(db, AUDITS_COLLECTION, report.id);
    await setDoc(docRef, report);
  } catch (err) {
    console.warn('Firestore save audit error', err);
  }
}

/**
 * Loads saved audits from Firestore:
 * - Admin (quality.bd.eng@gmail.com) sees all reports
 * - Other signed-in auditors ONLY see their own submitted reports (for CAP open/close)
 */
export async function fetchAuditsFromFirestore(requesterEmail?: string): Promise<AuditReportData[]> {
  if (!db || !requesterEmail) return [];
  const normalizedRequester = requesterEmail.trim().toLowerCase();
  const adminAccess = isAuditorAdmin(normalizedRequester);

  try {
    const colRef = collection(db, AUDITS_COLLECTION);
    const snap = await getDocs(colRef);
    const audits: AuditReportData[] = [];
    snap.forEach((d) => {
      const data = d.data() as AuditReportData;
      if (adminAccess) {
        audits.push(data);
      } else if (data.auditorEmail && data.auditorEmail.trim().toLowerCase() === normalizedRequester) {
        audits.push(data);
      }
    });
    return audits;
  } catch (err) {
    console.warn('Firestore fetch audits error', err);
    return [];
  }
}

/**
 * Deletes an audit record from Firestore
 * Strictly restricted to Admin: quality.bd.eng@gmail.com
 */
export async function deleteAuditFromFirestore(id: string, requesterEmail?: string): Promise<boolean> {
  if (!db) return false;
  // Security guard: Only Admin can delete saved records
  if (requesterEmail && !isAuditorAdmin(requesterEmail)) {
    throw new Error('Permission denied: Only the Admin (quality.bd.eng@gmail.com) can delete saved audits.');
  }
  try {
    const docRef = doc(db, AUDITS_COLLECTION, id);
    await deleteDoc(docRef);
    return true;
  } catch (err) {
    console.warn('Firestore delete audit error', err);
    return false;
  }
}

/**
 * Cloud Registration in Firestore (Syncs across all mobile & desktop devices)
 */
export async function firestoreRegisterUser(params: {
  name: string;
  email: string;
  password: string;
  role?: string;
}): Promise<any> {
  if (!db) return null;
  const normalizedEmail = params.email.trim().toLowerCase();
  const docId = normalizedEmail.replace(/[^a-z0-9]/g, '_');
  const userRef = doc(db, USERS_COLLECTION, docId);

  const existingSnap = await getDoc(userRef);
  if (existingSnap.exists()) {
    throw new Error('This Gmail address is already registered on another device. Please sign in.');
  }

  const userData = {
    id: `aud-${Date.now()}`,
    name: params.name.trim(),
    email: normalizedEmail,
    username: normalizedEmail,
    password: params.password.trim(),
    role: params.role?.trim() || 'QMS Specialist (Auditor)',
    createdAt: new Date().toISOString(),
    isVerified: true,
  };

  await setDoc(userRef, userData);
  return userData;
}

/**
 * Cloud Login in Firestore (Verifies credentials registered from ANY device)
 */
export async function firestoreLoginUser(email: string, password: string): Promise<any | null> {
  if (!db) return null;
  try {
    const normalizedEmail = email.trim().toLowerCase();
    const docId = normalizedEmail.replace(/[^a-z0-9]/g, '_');
    const userRef = doc(db, USERS_COLLECTION, docId);
    const snap = await getDoc(userRef);

    if (!snap.exists()) {
      return null;
    }

    const userData = snap.data();
    if (userData && userData.password === password.trim()) {
      return {
        id: userData.id || `aud-${Date.now()}`,
        name: userData.name,
        email: userData.email,
        username: userData.username || userData.email,
        role: userData.role || 'QMS Specialist (Auditor)',
        token: `token_${Date.now()}`,
        organization: 'Internal Technical Audit Team',
      };
    }
    return null;
  } catch (err) {
    console.warn('Firestore login lookup failed', err);
    return null;
  }
}

/**
 * Creates/Dispatches a Forgot Password OTP in Firestore
 */
export async function firestoreRequestPasswordReset(email: string): Promise<string> {
  const normalizedEmail = email.trim().toLowerCase();
  const code = Math.floor(100000 + Math.random() * 900000).toString();

  if (db) {
    try {
      const docId = normalizedEmail.replace(/[^a-z0-9]/g, '_');
      const resetRef = doc(db, RESET_OTP_COLLECTION, docId);
      await setDoc(resetRef, {
        email: normalizedEmail,
        code,
        expiresAt: Date.now() + 15 * 60 * 1000, // 15 mins
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      console.warn('Firestore reset OTP store failed', err);
    }
  }

  return code;
}

/**
 * Verifies OTP and updates user's password in Firestore
 */
export async function firestoreResetUserPassword(
  email: string,
  otpCode: string,
  newPassword: string
): Promise<boolean> {
  const normalizedEmail = email.trim().toLowerCase();
  const trimmedOtp = otpCode.trim();
  const trimmedNewPass = newPassword.trim();

  if (trimmedNewPass.length < 4) {
    throw new Error('New password must be at least 4 characters long.');
  }

  if (!db) {
    return false;
  }

  const docId = normalizedEmail.replace(/[^a-z0-9]/g, '_');
  const resetRef = doc(db, RESET_OTP_COLLECTION, docId);
  const resetSnap = await getDoc(resetRef);

  if (!resetSnap.exists()) {
    throw new Error('No password reset request found for this email. Please request a new OTP code.');
  }

  const resetData = resetSnap.data();
  if (resetData.code !== trimmedOtp) {
    throw new Error('Invalid OTP code. Please enter the correct 6-digit code.');
  }

  if (Date.now() > (resetData.expiresAt || 0)) {
    await deleteDoc(resetRef);
    throw new Error('OTP code has expired. Please request a new OTP code.');
  }

  // Update password in users collection
  const userRef = doc(db, USERS_COLLECTION, docId);
  const userSnap = await getDoc(userRef);

  if (userSnap.exists()) {
    await setDoc(userRef, { password: trimmedNewPass }, { merge: true });
  } else {
    // If user record wasn't synced yet, create it with this email
    await setDoc(userRef, {
      id: `aud-${Date.now()}`,
      name: normalizedEmail.split('@')[0],
      email: normalizedEmail,
      username: normalizedEmail,
      password: trimmedNewPass,
      role: 'Lead QMS Auditor',
      updatedAt: new Date().toISOString(),
      isVerified: true,
    });
  }

  // Delete used OTP
  await deleteDoc(resetRef);
  return true;
}
