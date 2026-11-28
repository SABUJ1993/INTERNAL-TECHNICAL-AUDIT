import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  initializeFirestore,
  disableNetwork,
  enableNetwork,
  terminate,
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
  apiKey: appletConfig.apiKey,
  authDomain: appletConfig.authDomain,
  projectId: appletConfig.projectId,
  storageBucket: appletConfig.storageBucket,
  messagingSenderId: appletConfig.messagingSenderId,
  appId: appletConfig.appId,
  firestoreDatabaseId: appletConfig.firestoreDatabaseId,
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

// Initialize Firestore with ignoreUndefinedProperties & auto-detect long polling (mobile/proxy friendly)
let firestoreInstance: any = null;
try {
  const firestoreSettings = {
    ignoreUndefinedProperties: true,
    experimentalAutoDetectLongPolling: true,
  };
  firestoreInstance = firebaseConfig.firestoreDatabaseId
    ? initializeFirestore(firebaseApp, firestoreSettings, firebaseConfig.firestoreDatabaseId)
    : initializeFirestore(firebaseApp, firestoreSettings);
} catch (e) {
  try {
    firestoreInstance = firebaseConfig.firestoreDatabaseId
      ? getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId)
      : getFirestore(firebaseApp);
  } catch (err) {
    console.warn('Firestore initialization fallback', err);
  }
}
export let db = firestoreInstance;

/**
 * Recursively strips `undefined` properties from objects before Firestore writes
 * so Firestore `setDoc` never rejects documents with `invalid-argument`.
 */
export function sanitizeForFirestore<T>(value: T): T {
  if (value === undefined) return null as unknown as T;
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.map((item) => (item === undefined ? null : sanitizeForFirestore(item))) as unknown as T;
  }
  const cleanObj: Record<string, any> = {};
  for (const [k, v] of Object.entries(value as Record<string, any>)) {
    if (v !== undefined) {
      cleanObj[k] = sanitizeForFirestore(v);
    }
  }
  return cleanObj as T;
}

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

// In-memory + localStorage cache of already uploaded / fetched photo keys to avoid redundant network writes/reads
const SYNCED_PHOTO_KEYS_STORAGE = 'ita_synced_photo_keys_v1';
const syncedPhotoKeySet = new Set<string>((() => {
  try {
    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem(SYNCED_PHOTO_KEYS_STORAGE);
      if (raw) return JSON.parse(raw);
    }
  } catch {}
  return [];
})());
const fetchedPhotoDataCache = new Map<string, string>();

function markPhotoKeySynced(photoKey: string) {
  syncedPhotoKeySet.add(photoKey);
  try {
    if (typeof window !== 'undefined') {
      const arr = Array.from(syncedPhotoKeySet).slice(-500);
      localStorage.setItem(SYNCED_PHOTO_KEYS_STORAGE, JSON.stringify(arr));
    }
  } catch {}
}

const WRITE_PAUSE_STORAGE_KEY = 'ita_firestore_write_pause_until_v1';
const LAST_SYNC_SIG_STORAGE_KEY = 'ita_firestore_last_sync_sig_v1';

let firestoreWriteBackoffUntil = (() => {
  try {
    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem(WRITE_PAUSE_STORAGE_KEY);
      if (raw) {
        const parsed = Number(raw);
        if (Number.isFinite(parsed)) return parsed;
      }
    }
  } catch {}
  return 0;
})();

let storageBucketAvailable = true;
let firestoreNetworkPausedForQuota = false;

const lastSyncedSigMap = new Map<string, string>((() => {
  try {
    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem(LAST_SYNC_SIG_STORAGE_KEY);
      if (raw) return Object.entries(JSON.parse(raw));
    }
  } catch {}
  return [];
})());

function saveLastSyncedSig(docId: string, sig: string) {
  lastSyncedSigMap.set(docId, sig);
  try {
    if (typeof window !== 'undefined') {
      const obj = Object.fromEntries(Array.from(lastSyncedSigMap.entries()).slice(-10));
      localStorage.setItem(LAST_SYNC_SIG_STORAGE_KEY, JSON.stringify(obj));
    }
  } catch {}
}

function computeDraftContentSignature(draft: any): string {
  if (!draft) return 'NULL';
  try {
    const f = draft.factoryInfo || {};
    const secs = Array.isArray(draft.sections) ? draft.sections : [];
    const lightSecs = secs.map((s: any) => ({
      id: s.id,
      cp: Array.isArray(s.checkpoints)
        ? s.checkpoints.map((c: any) => ({
            id: c.id,
            sc: c.score ?? null,
            nt: c.notes || '',
            rq: c.requirement || '',
            up: !!c.isUpdated,
            im: Array.isArray(c.images)
              ? c.images.map((i: any) => `${i.id}:${i.dataUrl?.length || 0}`)
              : [],
          }))
        : [],
    }));
    const lightFactory = {
      ...f,
      openingMeetingPhoto: f.openingMeetingPhoto ? f.openingMeetingPhoto.length : 0,
      factoryOutlookPhotos: Array.isArray(f.factoryOutlookPhotos)
        ? f.factoryOutlookPhotos.map((p: any) => `${p.id}:${p.dataUrl?.length || 0}`)
        : [],
      certifications: Array.isArray(f.certifications)
        ? f.certifications.map((c: any) => `${c.id}:${!!c.selected}:${c.photo?.length || 0}`)
        : [],
    };
    return JSON.stringify({ f: lightFactory, s: lightSecs });
  } catch {
    return `${Date.now()}`;
  }
}

let quotaHydrationPromise: Promise<void> | null = null;

function initQuotaStatusFromServer(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (!quotaHydrationPromise) {
    quotaHydrationPromise = fetch('/api/firestore-quota-status', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const serverPausedUntil = Number(data?.pausedUntil || 0);
        if (Number.isFinite(serverPausedUntil) && serverPausedUntil > firestoreWriteBackoffUntil) {
          firestoreWriteBackoffUntil = serverPausedUntil;
          try {
            localStorage.setItem(WRITE_PAUSE_STORAGE_KEY, String(serverPausedUntil));
          } catch {}
        }
      })
      .catch(() => {});
  }
  return quotaHydrationPromise;
}

if (typeof window !== 'undefined') {
  initQuotaStatusFromServer();
}

async function ensureQuotaStatusHydrated(): Promise<void> {
  try {
    await Promise.race([
      initQuotaStatusFromServer(),
      new Promise<void>((resolve) => setTimeout(resolve, 400)),
    ]);
  } catch {}
}

export function isFirestoreWritePaused(): boolean {
  return Date.now() < firestoreWriteBackoffUntil;
}

export function pauseFirestoreWrites(durationMs: number, terminateActiveStream = false): void {
  const until = Date.now() + durationMs;
  if (until > firestoreWriteBackoffUntil) {
    firestoreWriteBackoffUntil = until;
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(WRITE_PAUSE_STORAGE_KEY, String(until));
        fetch('/api/firestore-quota-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pausedUntil: until }),
        }).catch(() => {});
      }
    } catch {}
  }
  if (terminateActiveStream && db && !firestoreNetworkPausedForQuota) {
    firestoreNetworkPausedForQuota = true;
    const activeDb = db;
    // Clear db reference and terminate instance so Firestore SDK WriteStream cannot log 60s retry errors
    db = null;
    disableNetwork(activeDb)
      .catch(() => {})
      .finally(() => {
        terminate(activeDb).catch(() => {});
      });
  }
}

export async function resetFirestoreWritePause(): Promise<void> {
  firestoreWriteBackoffUntil = 0;
  try {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(WRITE_PAUSE_STORAGE_KEY);
    }
  } catch {}
  if (db && firestoreNetworkPausedForQuota) {
    firestoreNetworkPausedForQuota = false;
    try {
      await enableNetwork(db);
    } catch {}
  }
}

function isQuotaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err || '');
  return (
    msg.includes('resource-exhausted') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('Quota limit exceeded')
  );
}

function isWriteTimeoutError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err || '');
  return msg.toLowerCase().includes('timeout');
}

function withTimeout<T>(promise: Promise<T>, ms: number, label = 'Operation timed out'): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(label)), ms)),
  ]);
}

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

  if (isFirestoreWritePaused()) {
    return dataUrl;
  }

  try {
    // Guard single photo size under 900KB
    if (dataUrl.length < 900000) {
      const photoRef = doc(db, DRAFT_PHOTOS_COLLECTION, photoKey);
      await withTimeout(
        setDoc(
          photoRef,
          sanitizeForFirestore({
            photoId: photoKey,
            ownerEmail: ownerEmail ? ownerEmail.trim().toLowerCase() : null,
            dataUrl,
            updatedAt: new Date().toISOString(),
          })
        ),
        3500,
        'Cloud photo write timeout'
      );
      markPhotoKeySynced(photoKey);
      return `${CLOUD_PHOTO_PREFIX}${photoKey}`;
    }
  } catch (err) {
    if (isQuotaError(err)) {
      pauseFirestoreWrites(4 * 60 * 60 * 1000, true);
    } else if (isWriteTimeoutError(err) && (typeof navigator === 'undefined' || navigator.onLine !== false)) {
      // Firestore SDK stalls queued writes indefinitely when daily quota is exhausted; pause & halt SDK write stream
      pauseFirestoreWrites(4 * 60 * 60 * 1000, true);
    }
    logFirestoreError(err, OperationType.WRITE, `${DRAFT_PHOTOS_COLLECTION}/${photoKey}`);
  }

  // Optional Firebase Storage fallback if >900KB (skip once 404 is detected)
  if (storage && storageBucketAvailable) {
    try {
      const url = await withTimeout(
        uploadPhotoToFirebaseStorage(photoKey, dataUrl),
        3000,
        'Storage upload timeout'
      );
      if (url.startsWith('http')) {
        markPhotoKeySynced(photoKey);
        return url;
      }
    } catch {
      storageBucketAvailable = false;
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
    const snap = await withTimeout(getDoc(photoRef), 3500, 'Photo fetch timeout');
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
  if (!storage || !storageBucketAvailable || !dataUrl.startsWith('data:')) {
    return dataUrl;
  }
  try {
    const photoRef = ref(storage, `audit_photos/${photoId}.jpg`);
    await uploadString(photoRef, dataUrl, 'data_url');
    const downloadUrl = await getDownloadURL(photoRef);
    return downloadUrl;
  } catch (err: any) {
    if (err?.status_ === 404 || err?.code === 'storage/unknown') {
      storageBucketAvailable = false;
    }
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
  userEmail?: string | null,
  forceWrite = false
): Promise<{ ok: boolean; updatedAt?: string; error?: string; quotaPaused?: boolean }> {
  await ensureQuotaStatusHydrated();
  if (!db) return { ok: false, error: 'Firestore not initialized' };
  const normalizedEmail = (userEmail || draft?.ownerEmail || '').trim().toLowerCase();
  if (!normalizedEmail) return { ok: false, error: 'Missing auditor email for cloud sync' };
  if (isFirestoreWritePaused()) {
    return {
      ok: false,
      error: 'Firestore daily write quota paused; saved locally',
      quotaPaused: true,
    };
  }
  const docId = getDraftDocId(normalizedEmail);
  const path = `${DRAFT_COLLECTION}/${docId}`;
  const updatedAt = new Date().toISOString();

  // Skip identical content writes to protect daily Firestore write quota
  const contentSig = computeDraftContentSignature(draft);
  if (!forceWrite && draft && lastSyncedSigMap.get(docId) === contentSig) {
    return { ok: true, updatedAt: draft.updatedAt || updatedAt };
  }

  try {
    const docRef = doc(db, DRAFT_COLLECTION, docId);
    if (!draft) {
      await withTimeout(
        setDoc(
          docRef,
          sanitizeForFirestore({
            clearedAt: updatedAt,
            ownerEmail: normalizedEmail,
            senderClientId: clientId || null,
            factoryInfo: null,
            sections: null,
            updatedAt,
          })
        ),
        3500,
        'Draft clear write timeout'
      );
      lastSyncedSigMap.delete(docId);
      return { ok: true, updatedAt };
    }

    const baseDraft = {
      ...draft,
      ownerEmail: normalizedEmail,
      senderClientId: clientId || null,
      updatedAt: draft.updatedAt || updatedAt,
      clearedAt: null,
    };

    const offloadedDraft = await withTimeout(
      offloadPayloadPhotos(docId, baseDraft, normalizedEmail),
      4500,
      'Photo offload timeout'
    );
    if (isFirestoreWritePaused()) {
      return {
        ok: false,
        error: 'Firestore daily write quota paused; saved locally',
        quotaPaused: true,
      };
    }
    const cleanDraft = sanitizeForFirestore(offloadedDraft);
    const serializedLen = JSON.stringify(cleanDraft).length;
    if (serializedLen > 950000) {
      return { ok: false, error: 'Draft stored locally (cloud quota/size guard)' };
    }
    await withTimeout(setDoc(docRef, cleanDraft, { merge: false }), 3500, 'Draft write timeout');
    saveLastSyncedSig(docId, contentSig);
    return { ok: true, updatedAt: cleanDraft.updatedAt || updatedAt };
  } catch (err) {
    const quotaHit = isQuotaError(err);
    const timeoutOnline =
      isWriteTimeoutError(err) && (typeof navigator === 'undefined' || navigator.onLine !== false);
    if (quotaHit) {
      pauseFirestoreWrites(4 * 60 * 60 * 1000, true);
    } else if (timeoutOnline) {
      pauseFirestoreWrites(4 * 60 * 60 * 1000, true);
    }
    logFirestoreError(err, OperationType.WRITE, path);
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      quotaPaused: quotaHit || timeoutOnline,
    };
  }
}

/**
 * Fetches and hydrates the current user's active draft directly from Firestore server
 * (falls back to cache if offline) so Mobile <-> PC wake-up & startup are always up to date.
 */
export async function fetchDraftFromFirestore(userEmail?: string | null): Promise<any | null> {
  if (!db || !userEmail) return null;
  const docId = getDraftDocId(userEmail);
  const path = `${DRAFT_COLLECTION}/${docId}`;
  try {
    const docRef = doc(db, DRAFT_COLLECTION, docId);
    let snap;
    try {
      snap = await getDocFromServer(docRef);
    } catch {
      snap = await getDoc(docRef);
    }
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
 * Subscribes to real-time Firestore updates across Mobile and PC Browser for this auditor
 * and hydrates any synced cloud photos automatically with out-of-order guard.
 */
export function subscribeToFirestoreDraft(
  onUpdate: (draft: any) => void,
  currentClientId?: string,
  userEmail?: string | null
): Unsubscribe {
  if (!db || !userEmail || !userEmail.trim()) return () => {};
  const normalizedTargetEmail = userEmail.trim().toLowerCase();
  const docId = getDraftDocId(normalizedTargetEmail);
  const path = `${DRAFT_COLLECTION}/${docId}`;
  let latestSnapshotSeq = 0;
  try {
    const docRef = doc(db, DRAFT_COLLECTION, docId);
    return onSnapshot(
      docRef,
      async (snapshot) => {
        if (!snapshot.exists()) return;
        const data = snapshot.data();
        if (!data) return;

        // Strictly verify ownerEmail matches the subscribed auditor email
        if (data.ownerEmail && String(data.ownerEmail).trim().toLowerCase() !== normalizedTargetEmail) {
          return;
        }

        // Ignore updates originated from this exact client to prevent cursor jump/feedback loop
        if (currentClientId && data.senderClientId === currentClientId) {
          return;
        }

        const seq = ++latestSnapshotSeq;

        if (data.clearedAt && !data.factoryInfo && !data.sections) {
          onUpdate({
            clearedAt: data.clearedAt,
            updatedAt: data.updatedAt,
            ownerEmail: normalizedTargetEmail,
            senderClientId: data.senderClientId,
          });
          return;
        }

        if (data.factoryInfo || data.sections) {
          const hydrated = await hydratePayloadPhotos(data);
          if (seq !== latestSnapshotSeq) return;
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
 * Strictly Admin-only: Real-time subscription to ALL auditors' live in-progress drafts.
 * Regular auditors get an instant no-op unsubscribe and never see any other user's draft.
 */
export function subscribeToAllActiveDraftsForAdmin(
  requesterEmail: string | null | undefined,
  onUpdate: (drafts: any[]) => void
): Unsubscribe {
  if (!db || !isAuditorAdmin(requesterEmail)) return () => {};
  try {
    const colRef = collection(db, DRAFT_COLLECTION);
    return onSnapshot(
      colRef,
      (snap) => {
        const list: any[] = [];
        snap.forEach((d) => {
          const data = d.data();
          if (data && !data.clearedAt && (data.factoryInfo || data.sections)) {
            list.push({ id: d.id, ...data });
          }
        });
        list.sort(
          (a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime()
        );
        onUpdate(list);
      },
      (error) => {
        logFirestoreError(error, OperationType.LIST, DRAFT_COLLECTION);
      }
    );
  } catch (err) {
    logFirestoreError(err, OperationType.LIST, DRAFT_COLLECTION);
    return () => {};
  }
}

/**
 * Clears the active draft in Firestore (notifies other signed-in devices of same email)
 */
export async function clearFirestoreDraft(
  userEmail?: string | null,
  clientId?: string
): Promise<void> {
  if (!db || !userEmail || !userEmail.trim() || isFirestoreWritePaused()) return;
  const normalizedEmail = userEmail.trim().toLowerCase();
  const docId = getDraftDocId(normalizedEmail);
  const path = `${DRAFT_COLLECTION}/${docId}`;
  try {
    const docRef = doc(db, DRAFT_COLLECTION, docId);
    await withTimeout(
      setDoc(
        docRef,
        sanitizeForFirestore({
          clearedAt: new Date().toISOString(),
          ownerEmail: normalizedEmail,
          senderClientId: clientId || null,
          factoryInfo: null,
          sections: null,
          updatedAt: new Date().toISOString(),
        })
      ),
      3500,
      'Clear draft write timeout'
    );
    lastSyncedSigMap.delete(docId);
  } catch (err) {
    if (isQuotaError(err)) {
      pauseFirestoreWrites(4 * 60 * 60 * 1000, true);
    } else if (isWriteTimeoutError(err) && (typeof navigator === 'undefined' || navigator.onLine !== false)) {
      pauseFirestoreWrites(4 * 60 * 60 * 1000, true);
    }
    logFirestoreError(err, OperationType.WRITE, path);
  }
}

/**
 * Saves a completed audit report to Firestore (offloading photos if > 200KB so large reports always save)
 */
export async function saveAuditToFirestore(report: AuditReportData): Promise<void> {
  await ensureQuotaStatusHydrated();
  if (!db || isFirestoreWritePaused()) return;
  const path = `${AUDITS_COLLECTION}/${report.id}`;
  try {
    const docRef = doc(db, AUDITS_COLLECTION, report.id);
    const approxSize = JSON.stringify(report).length;
    const payloadToSave =
      approxSize > 200000
        ? await offloadPayloadPhotos(`rep_${report.id}`, report, report.auditorEmail)
        : report;
    if (isFirestoreWritePaused() || !db) return;
    await withTimeout(setDoc(docRef, sanitizeForFirestore(payloadToSave)), 4500, 'Save audit write timeout');
  } catch (err) {
    if (isQuotaError(err)) {
      pauseFirestoreWrites(4 * 60 * 60 * 1000, true);
    } else if (isWriteTimeoutError(err) && (typeof navigator === 'undefined' || navigator.onLine !== false)) {
      pauseFirestoreWrites(4 * 60 * 60 * 1000, true);
    }
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
 * Real-time subscription to submitted audit reports & CAP updates:
 * - Admin (quality.bd.eng@gmail.com) receives ALL auditors' reports live
 * - Regular auditors strictly receive ONLY their own submitted reports live
 */
export function subscribeToAuditsForUser(
  requesterEmail: string | null | undefined,
  onUpdate: (audits: AuditReportData[]) => void
): Unsubscribe {
  if (!db || !requesterEmail) return () => {};
  const normalizedRequester = requesterEmail.trim().toLowerCase();
  const adminAccess = isAuditorAdmin(normalizedRequester);
  let latestSeq = 0;

  try {
    const colRef = collection(db, AUDITS_COLLECTION);
    return onSnapshot(
      colRef,
      async (snap) => {
        const seq = ++latestSeq;
        const rawAudits: AuditReportData[] = [];
        snap.forEach((d) => {
          const data = d.data() as AuditReportData;
          if (!data || !data.id) return;
          if (adminAccess) {
            rawAudits.push(data);
          } else if (data.auditorEmail && data.auditorEmail.trim().toLowerCase() === normalizedRequester) {
            rawAudits.push(data);
          }
        });
        const hydrated = await Promise.all(rawAudits.map((a) => hydratePayloadPhotos(a)));
        if (seq !== latestSeq) return;
        hydrated.sort(
          (a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime()
        );
        onUpdate(hydrated);
      },
      (error) => {
        logFirestoreError(error, OperationType.LIST, AUDITS_COLLECTION);
      }
    );
  } catch (err) {
    logFirestoreError(err, OperationType.LIST, AUDITS_COLLECTION);
    return () => {};
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

  await setDoc(userRef, sanitizeForFirestore(userData));
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
      await setDoc(
        resetRef,
        sanitizeForFirestore({
          email: normalizedEmail,
          code,
          expiresAt: Date.now() + 15 * 60 * 1000, // 15 mins
          createdAt: new Date().toISOString(),
        })
      );
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
    await setDoc(userRef, sanitizeForFirestore({ password: trimmedNewPass }), { merge: true });
  } else {
    await setDoc(
      userRef,
      sanitizeForFirestore({
        id: `aud-${Date.now()}`,
        name: normalizedEmail.split('@')[0],
        email: normalizedEmail,
        username: normalizedEmail,
        password: trimmedNewPass,
        role: 'Lead QMS Auditor',
        updatedAt: new Date().toISOString(),
        isVerified: true,
      })
    );
  }

  await deleteDoc(resetRef);
  return true;
}
