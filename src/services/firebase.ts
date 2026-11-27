import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  getDocFromServer,
  deleteDoc,
  collection,
  getDocs,
  onSnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import { getStorage, ref, uploadString, getDownloadURL } from 'firebase/storage';
import { AuditReportData, CheckpointEvidence } from '../types/audit';
import appletConfig from '../../firebase-applet-config.json';

export const firebaseConfig = {
  apiKey: appletConfig.apiKey || "AIzaSyAzG0942tsO4UD-oJyZ2R-fS06TPSXNtFA",
  authDomain: appletConfig.authDomain || "internal-technical-audit-3c4a2.firebaseapp.com",
  projectId: appletConfig.projectId || "internal-technical-audit-3c4a2",
  storageBucket: appletConfig.storageBucket || "internal-technical-audit-3c4a2.firebasestorage.app",
  messagingSenderId: appletConfig.messagingSenderId || "855910717408",
  appId: appletConfig.appId || "1:855910717408:web:a05acf320974968e93fd85",
  firestoreDatabaseId: appletConfig.firestoreDatabaseId || "ai-studio-qualitechqmsfact-c1a5ae65-4f9c-4993-82e8-9aec32b878f3"
};

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
}

export function logFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    operationType,
    path,
  };
  console.warn('Firestore Notice:', JSON.stringify(errInfo));
}

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

// Startup connection check
async function testConnection() {
  if (!db) return;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Firestore appears offline. Please check your Firebase configuration.');
    }
  }
}
if (typeof window !== 'undefined') {
  testConnection();
}

// Initialize Storage
let storageInstance: any = null;
try {
  storageInstance = getStorage(firebaseApp);
} catch (err) {
  console.warn('Firebase Storage initialization fallback', err);
}
export const storage = storageInstance;

const DRAFT_COLLECTION = 'active_drafts';
const DRAFT_PHOTOS_COLLECTION = 'draft_photos';
const DEFAULT_DRAFT_DOC_ID = 'global_active_draft';
const AUDITS_COLLECTION = 'audit_reports';
const USERS_COLLECTION = 'auditor_users';
const RESET_OTP_COLLECTION = 'password_reset_otps';

export const ADMIN_EMAIL = 'quality.bd.eng@gmail.com';
const CLOUD_PHOTO_PREFIX = 'cloud-photo:';

export function isAuditorAdmin(email?: string | null): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === ADMIN_EMAIL.toLowerCase();
}

export function getDraftDocId(userEmail?: string | null): string {
  if (!userEmail || !userEmail.trim()) return DEFAULT_DRAFT_DOC_ID;
  return `draft_${userEmail.trim().toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
}

// In-memory cache of already uploaded / fetched photo keys to avoid redundant network writes/reads
const syncedPhotoKeySet = new Set<string>();
const fetchedPhotoDataCache = new Map<string, string>();

/**
 * Uploads a single photo dataUrl to Firestore `draft_photos/{photoKey}` (well within 1MB doc limit)
 * so both Mobile and PC instantly receive every photo regardless of total audit photo count.
 * Returns a lightweight `cloud-photo:<photoKey>` reference.
 */
async function ensureCloudPhotoStored(
  scopePrefix: string,
  photoId: string,
  dataUrl: string,
  ownerEmail?: string | null
): Promise<string> {
  if (!db || !dataUrl || !dataUrl.startsWith('data:image/')) {
    return dataUrl;
  }

  // Build deterministic key using scope + photoId + length signature so replaced/edited photos get new key
  const safeId = `${scopePrefix}_${photoId}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
  const photoKey = `${safeId}_${dataUrl.length}`;

  fetchedPhotoDataCache.set(photoKey, dataUrl);

  if (syncedPhotoKeySet.has(photoKey)) {
    return `${CLOUD_PHOTO_PREFIX}${photoKey}`;
  }

  try {
    // Guard single photo size under 900KB
    if (dataUrl.length < 900000) {
      const photoRef = doc(db, DRAFT_PHOTOS_COLLECTION, photoKey);
      await setDoc(photoRef, {
        photoId: photoKey,
        ownerEmail: ownerEmail ? ownerEmail.trim().toLowerCase() : null,
        dataUrl,
        updatedAt: new Date().toISOString(),
      });
      syncedPhotoKeySet.add(photoKey);
      return `${CLOUD_PHOTO_PREFIX}${photoKey}`;
    }
  } catch (err) {
    logFirestoreError(err, OperationType.WRITE, `${DRAFT_PHOTOS_COLLECTION}/${photoKey}`);
  }

  // Optional Firebase Storage fallback if >900KB
  if (storage) {
    try {
      const url = await uploadPhotoToFirebaseStorage(photoKey, dataUrl);
      if (url.startsWith('http')) {
        syncedPhotoKeySet.add(photoKey);
        return url;
      }
    } catch {
      // ignore
    }
  }

  return dataUrl;
}

async function resolveCloudPhotoRef(url?: string): Promise<string | undefined> {
  if (!url || typeof url !== 'string') return url;
  if (!url.startsWith(CLOUD_PHOTO_PREFIX)) return url;

  const photoKey = url.slice(CLOUD_PHOTO_PREFIX.length);
  if (fetchedPhotoDataCache.has(photoKey)) {
    return fetchedPhotoDataCache.get(photoKey)!;
  }

  if (!db) return url;
  try {
    const photoRef = doc(db, DRAFT_PHOTOS_COLLECTION, photoKey);
    const snap = await getDoc(photoRef);
    if (snap.exists()) {
      const data = snap.data();
      if (data?.dataUrl && typeof data.dataUrl === 'string') {
        fetchedPhotoDataCache.set(photoKey, data.dataUrl);
        return data.dataUrl;
      }
    }
  } catch (err) {
    logFirestoreError(err, OperationType.GET, `${DRAFT_PHOTOS_COLLECTION}/${photoKey}`);
  }
  return url;
}

/**
 * Offloads all photos in a draft or report into individual Firestore `draft_photos` docs
 * and replaces inline base64 strings with `cloud-photo:<key>` references so the parent
 * document stays lightweight (<100KB) and syncs reliably across Mobile & PC.
 */
async function offloadPayloadPhotos(
  scopePrefix: string,
  payload: any,
  ownerEmail?: string | null
): Promise<any> {
  if (!payload) return payload;
  const clone = { ...payload };

  if (clone.factoryInfo) {
    const f = { ...clone.factoryInfo };
    if (f.openingMeetingPhoto && f.openingMeetingPhoto.startsWith('data:image/')) {
      f.openingMeetingPhoto = await ensureCloudPhotoStored(
        scopePrefix,
        'opening_meeting',
        f.openingMeetingPhoto,
        ownerEmail
      );
    }
    if (Array.isArray(f.factoryOutlookPhotos)) {
      f.factoryOutlookPhotos = await Promise.all(
        f.factoryOutlookPhotos.map(async (p: CheckpointEvidence) => ({
          ...p,
          dataUrl: p.dataUrl?.startsWith('data:image/')
            ? await ensureCloudPhotoStored(scopePrefix, `outlook_${p.id}`, p.dataUrl, ownerEmail)
            : p.dataUrl,
        }))
      );
    }
    if (Array.isArray(f.certifications)) {
      f.certifications = await Promise.all(
        f.certifications.map(async (c: any) => ({
          ...c,
          photo: c.photo?.startsWith('data:image/')
            ? await ensureCloudPhotoStored(scopePrefix, `cert_${c.id}`, c.photo, ownerEmail)
            : c.photo,
        }))
      );
    }
    clone.factoryInfo = f;
  }

  if (Array.isArray(clone.sections)) {
    clone.sections = await Promise.all(
      clone.sections.map(async (sec: any) => ({
        ...sec,
        checkpoints: Array.isArray(sec.checkpoints)
          ? await Promise.all(
              sec.checkpoints.map(async (cp: any) => ({
                ...cp,
                images: Array.isArray(cp.images)
                  ? await Promise.all(
                      cp.images.map(async (img: CheckpointEvidence) => ({
                        ...img,
                        dataUrl: img.dataUrl?.startsWith('data:image/')
                          ? await ensureCloudPhotoStored(
                              scopePrefix,
                              `cp_${cp.id}_${img.id}`,
                              img.dataUrl,
                              ownerEmail
                            )
                          : img.dataUrl,
                      }))
                    )
                  : [],
              }))
            )
          : [],
      }))
    );
  }

  if (Array.isArray(clone.capItems)) {
    clone.capItems = await Promise.all(
      clone.capItems.map(async (cap: any) => ({
        ...cap,
        originalImages: Array.isArray(cap.originalImages)
          ? await Promise.all(
              cap.originalImages.map(async (img: CheckpointEvidence) => ({
                ...img,
                dataUrl: img.dataUrl?.startsWith('data:image/')
                  ? await ensureCloudPhotoStored(
                      scopePrefix,
                      `cap_orig_${cap.id}_${img.id}`,
                      img.dataUrl,
                      ownerEmail
                    )
                  : img.dataUrl,
              }))
            )
          : [],
        closureImages: Array.isArray(cap.closureImages)
          ? await Promise.all(
              cap.closureImages.map(async (img: CheckpointEvidence) => ({
                ...img,
                dataUrl: img.dataUrl?.startsWith('data:image/')
                  ? await ensureCloudPhotoStored(
                      scopePrefix,
                      `cap_close_${cap.id}_${img.id}`,
                      img.dataUrl,
                      ownerEmail
                    )
                  : img.dataUrl,
              }))
            )
          : [],
      }))
    );
  }

  return clone;
}

/**
 * Hydrates `cloud-photo:<key>` references back into full base64 dataUrls for display & PDF export.
 */
export async function hydratePayloadPhotos<T = any>(payload: T): Promise<T> {
  if (!payload || typeof payload !== 'object') return payload;
  const clone: any = { ...(payload as any) };

  if (clone.factoryInfo) {
    const f = { ...clone.factoryInfo };
    if (f.openingMeetingPhoto && typeof f.openingMeetingPhoto === 'string') {
      f.openingMeetingPhoto = await resolveCloudPhotoRef(f.openingMeetingPhoto);
    }
    if (Array.isArray(f.factoryOutlookPhotos)) {
      f.factoryOutlookPhotos = await Promise.all(
        f.factoryOutlookPhotos.map(async (p: CheckpointEvidence) => ({
          ...p,
          dataUrl: (await resolveCloudPhotoRef(p.dataUrl)) || p.dataUrl,
        }))
      );
    }
    if (Array.isArray(f.certifications)) {
      f.certifications = await Promise.all(
        f.certifications.map(async (c: any) => ({
          ...c,
          photo: c.photo ? await resolveCloudPhotoRef(c.photo) : c.photo,
        }))
      );
    }
    clone.factoryInfo = f;
  }

  if (Array.isArray(clone.sections)) {
    clone.sections = await Promise.all(
      clone.sections.map(async (sec: any) => ({
        ...sec,
        checkpoints: Array.isArray(sec.checkpoints)
          ? await Promise.all(
              sec.checkpoints.map(async (cp: any) => ({
                ...cp,
                images: Array.isArray(cp.images)
                  ? await Promise.all(
                      cp.images.map(async (img: CheckpointEvidence) => ({
                        ...img,
                        dataUrl: (await resolveCloudPhotoRef(img.dataUrl)) || img.dataUrl,
                      }))
                    )
                  : [],
              }))
            )
          : [],
      }))
    );
  }

  if (Array.isArray(clone.capItems)) {
    clone.capItems = await Promise.all(
      clone.capItems.map(async (cap: any) => ({
        ...cap,
        originalImages: Array.isArray(cap.originalImages)
          ? await Promise.all(
              cap.originalImages.map(async (img: CheckpointEvidence) => ({
                ...img,
                dataUrl: (await resolveCloudPhotoRef(img.dataUrl)) || img.dataUrl,
              }))
            )
          : [],
        closureImages: Array.isArray(cap.closureImages)
          ? await Promise.all(
              cap.closureImages.map(async (img: CheckpointEvidence) => ({
                ...img,
                dataUrl: (await resolveCloudPhotoRef(img.dataUrl)) || img.dataUrl,
              }))
            )
          : [],
      }))
    );
  }

  return clone as T;
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
 * Automatically offloads photos to individual `draft_photos` docs so Mobile <-> PC
 * stays 100% live with ALL photos intact.
 */
export async function syncDraftToFirestore(
  draft: any,
  clientId?: string,
  userEmail?: string | null
): Promise<void> {
  if (!db) return;
  const docId = getDraftDocId(userEmail);
  const path = `${DRAFT_COLLECTION}/${docId}`;
  try {
    const docRef = doc(db, DRAFT_COLLECTION, docId);
    if (!draft) {
      await setDoc(docRef, {
        clearedAt: new Date().toISOString(),
        ownerEmail: userEmail ? userEmail.trim().toLowerCase() : null,
        senderClientId: clientId || null,
        factoryInfo: null,
        sections: null,
        updatedAt: new Date().toISOString(),
      });
      return;
    }

    const baseDraft = {
      ...draft,
      ownerEmail: userEmail ? userEmail.trim().toLowerCase() : draft.ownerEmail || null,
      senderClientId: clientId || null,
      updatedAt: new Date().toISOString(),
      clearedAt: null,
    };

    const cleanDraft = await offloadPayloadPhotos(docId, baseDraft, userEmail);
    await setDoc(docRef, cleanDraft, { merge: false });
  } catch (err) {
    logFirestoreError(err, OperationType.WRITE, path);
  }
}

/**
 * Fetches and hydrates the current user's active draft directly from Firestore (Mobile <-> PC startup & manual refresh)
 */
export async function fetchDraftFromFirestore(userEmail?: string | null): Promise<any | null> {
  if (!db || !userEmail) return null;
  const docId = getDraftDocId(userEmail);
  const path = `${DRAFT_COLLECTION}/${docId}`;
  try {
    const docRef = doc(db, DRAFT_COLLECTION, docId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    const data = snap.data();
    if (!data || data.clearedAt) return null;
    if (data.factoryInfo || data.sections) {
      return await hydratePayloadPhotos(data);
    }
    return null;
  } catch (err) {
    logFirestoreError(err, OperationType.GET, path);
    return null;
  }
}

/**
 * Subscribes to real-time Firestore updates across Mobile APK and PC Browser for this auditor
 * and hydrates any synced cloud photos automatically.
 */
export function subscribeToFirestoreDraft(
  onUpdate: (draft: any) => void,
  currentClientId?: string,
  userEmail?: string | null
): Unsubscribe {
  if (!db) return () => {};
  const docId = getDraftDocId(userEmail);
  const path = `${DRAFT_COLLECTION}/${docId}`;
  try {
    const docRef = doc(db, DRAFT_COLLECTION, docId);
    return onSnapshot(
      docRef,
      async (snapshot) => {
        if (!snapshot.exists()) return;
        const data = snapshot.data();
        if (!data) return;

        // Ignore updates originated from this exact client to prevent cursor jump/feedback loop
        if (currentClientId && data.senderClientId === currentClientId) {
          return;
        }

        if (data.clearedAt && !data.factoryInfo && !data.sections) {
          onUpdate({ clearedAt: data.clearedAt, updatedAt: data.updatedAt });
          return;
        }

        if (data.factoryInfo || data.sections) {
          const hydrated = await hydratePayloadPhotos(data);
          onUpdate(hydrated);
        }
      },
      (error) => {
        logFirestoreError(error, OperationType.GET, path);
      }
    );
  } catch (err) {
    logFirestoreError(err, OperationType.GET, path);
    return () => {};
  }
}

/**
 * Strictly Admin-only: Fetches all auditors' active live in-progress drafts so Admin
 * (quality.bd.eng@gmail.com) can inspect ongoing audits across all users.
 */
export async function fetchAllActiveDraftsForAdmin(requesterEmail?: string | null): Promise<any[]> {
  if (!db || !isAuditorAdmin(requesterEmail)) return [];
  try {
    const colRef = collection(db, DRAFT_COLLECTION);
    const snap = await getDocs(colRef);
    const list: any[] = [];
    snap.forEach((d) => {
      const data = d.data();
      if (data && !data.clearedAt && (data.factoryInfo || data.sections)) {
        list.push({ id: d.id, ...data });
      }
    });
    return list.sort(
      (a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime()
    );
  } catch (err) {
    logFirestoreError(err, OperationType.LIST, DRAFT_COLLECTION);
    return [];
  }
}

/**
 * Clears the active draft in Firestore (notifies other signed-in devices of same email)
 */
export async function clearFirestoreDraft(
  userEmail?: string | null,
  clientId?: string
): Promise<void> {
  if (!db) return;
  const docId = getDraftDocId(userEmail);
  const path = `${DRAFT_COLLECTION}/${docId}`;
  try {
    const docRef = doc(db, DRAFT_COLLECTION, docId);
    await setDoc(docRef, {
      clearedAt: new Date().toISOString(),
      ownerEmail: userEmail ? userEmail.trim().toLowerCase() : null,
      senderClientId: clientId || null,
      factoryInfo: null,
      sections: null,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    logFirestoreError(err, OperationType.WRITE, path);
  }
}

/**
 * Saves a completed audit report to Firestore (offloading photos if > 700KB so large reports always save)
 */
export async function saveAuditToFirestore(report: AuditReportData): Promise<void> {
  if (!db) return;
  const path = `${AUDITS_COLLECTION}/${report.id}`;
  try {
    const docRef = doc(db, AUDITS_COLLECTION, report.id);
    const approxSize = JSON.stringify(report).length;
    const payloadToSave =
      approxSize > 700000
        ? await offloadPayloadPhotos(`rep_${report.id}`, report, report.auditorEmail)
        : report;
    await setDoc(docRef, payloadToSave);
  } catch (err) {
    logFirestoreError(err, OperationType.WRITE, path);
  }
}

/**
 * Loads saved audits from Firestore & hydrates any cloud-stored photos:
 * - Admin (quality.bd.eng@gmail.com) sees ALL auditors' reports
 * - Other signed-in auditors ONLY see their own submitted reports
 */
export async function fetchAuditsFromFirestore(requesterEmail?: string): Promise<AuditReportData[]> {
  if (!db || !requesterEmail) return [];
  const normalizedRequester = requesterEmail.trim().toLowerCase();
  const adminAccess = isAuditorAdmin(normalizedRequester);

  try {
    const colRef = collection(db, AUDITS_COLLECTION);
    const snap = await getDocs(colRef);
    const rawAudits: AuditReportData[] = [];
    snap.forEach((d) => {
      const data = d.data() as AuditReportData;
      if (adminAccess) {
        rawAudits.push(data);
      } else if (data.auditorEmail && data.auditorEmail.trim().toLowerCase() === normalizedRequester) {
        rawAudits.push(data);
      }
    });
    return await Promise.all(rawAudits.map((a) => hydratePayloadPhotos(a)));
  } catch (err) {
    logFirestoreError(err, OperationType.LIST, AUDITS_COLLECTION);
    return [];
  }
}

/**
 * Deletes an audit record from Firestore
 * Strictly restricted to Admin: quality.bd.eng@gmail.com
 */
export async function deleteAuditFromFirestore(id: string, requesterEmail?: string): Promise<boolean> {
  if (!db) return false;
  if (requesterEmail && !isAuditorAdmin(requesterEmail)) {
    throw new Error('Permission denied: Only the Admin (quality.bd.eng@gmail.com) can delete saved audits.');
  }
  const path = `${AUDITS_COLLECTION}/${id}`;
  try {
    const docRef = doc(db, AUDITS_COLLECTION, id);
    await deleteDoc(docRef);
    return true;
  } catch (err) {
    logFirestoreError(err, OperationType.DELETE, path);
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

  const userRef = doc(db, USERS_COLLECTION, docId);
  const userSnap = await getDoc(userRef);

  if (userSnap.exists()) {
    await setDoc(userRef, { password: trimmedNewPass }, { merge: true });
  } else {
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

  await deleteDoc(resetRef);
  return true;
}
