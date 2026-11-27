import { AuditReportData, AuditorUser } from '../types/audit';
import {
  saveDraftToIndexedDB,
  loadDraftFromIndexedDB,
  clearDraftFromIndexedDB,
  saveAuditToIndexedDB,
  loadAuditsFromIndexedDB,
  deleteAuditFromIndexedDB,
} from './storageDb';
import {
  syncDraftToFirestore,
  clearFirestoreDraft,
  fetchDraftFromFirestore,
  fetchAllActiveDraftsForAdmin,
  subscribeToAllActiveDraftsForAdmin,
  hydratePayloadPhotos,
  saveAuditToFirestore,
  fetchAuditsFromFirestore,
  subscribeToAuditsForUser,
  deleteAuditFromFirestore,
  subscribeToFirestoreDraft,
  firestoreRegisterUser,
  firestoreLoginUser,
  firestoreRequestPasswordReset,
  firestoreResetUserPassword,
  ADMIN_EMAIL,
  isAuditorAdmin,
} from './firebase';

const LOCAL_STORAGE_KEY = 'qualitech_audits_v1';
const CURRENT_AUDIT_KEY = 'qualitech_active_audit_v1';
const USER_KEY = 'qualitech_current_user';
const SESSION_PERSISTENCE_KEY = 'active_auditor_session';
const REGISTERED_USERS_KEY = 'qualitech_registered_auditors_v1';

// Cache whether an Express backend server (/api/*) exists (false on static Firebase Hosting / web.app)
let cachedBackendAvailable: boolean | null = null;
let backendCheckPromise: Promise<boolean> | null = null;

export function isStaticHostingDomain(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname.toLowerCase();
  return (
    host.endsWith('.web.app') ||
    host.endsWith('.firebaseapp.com') ||
    host.endsWith('.netlify.app') ||
    host.endsWith('.github.io') ||
    window.location.protocol === 'file:'
  );
}

export async function isBackendServerAvailable(): Promise<boolean> {
  if (cachedBackendAvailable !== null) return cachedBackendAvailable;
  if (isStaticHostingDomain()) {
    cachedBackendAvailable = false;
    return false;
  }
  if (!backendCheckPromise) {
    backendCheckPromise = (async () => {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 1500);
        const res = await fetch('/api/health', {
          method: 'GET',
          signal: controller.signal,
          cache: 'no-store',
        });
        clearTimeout(timer);
        const ct = res.headers.get('content-type') || '';
        cachedBackendAvailable = res.ok && ct.includes('application/json');
      } catch {
        cachedBackendAvailable = false;
      }
      return cachedBackendAvailable;
    })();
  }
  return backendCheckPromise;
}

export function getClientDeviceId(): string {
  let id = sessionStorage.getItem('ita_client_device_id');
  if (!id) {
    id = `dev_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    sessionStorage.setItem('ita_client_device_id', id);
  }
  return id;
}

export interface RegisterAuditorParams {
  name: string;
  email: string;
  password: string;
  role?: string;
  username?: string;
  verificationCode?: string;
}

export async function sendGmailVerificationCode(email: string): Promise<{ success: boolean; message: string; code?: string }> {
  const trimmed = email.trim().toLowerCase();
  const isGmail = /^[a-zA-Z0-9._%+-]+@gmail\.com$/i.test(trimmed);
  if (!isGmail) {
    throw new Error('Please enter a valid Gmail address ending in @gmail.com');
  }

  if (await isBackendServerAvailable()) {
    try {
      const res = await fetch('/api/auth/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed }),
      });

      if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
        return await res.json();
      } else {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData?.error || 'Failed to dispatch verification code');
      }
    } catch (err: any) {
      if (err?.message && err.message.includes('Failed to dispatch')) {
        // fallback below if network failed
      }
    }
  }

  // Direct / Firebase Hosting fallback code generation so app works seamlessly on web.app
  const fallbackCode = Math.floor(100000 + Math.random() * 900000).toString();
  try {
    sessionStorage.setItem(`ita_otp_${trimmed}`, fallbackCode);
  } catch {}
  return {
    success: true,
    message: `Verification code generated for ${trimmed}`,
    code: fallbackCode,
  };
}

/**
 * Request OTP code for Forgot Password
 */
export async function requestForgotPasswordOtp(email: string): Promise<{ success: boolean; message: string; code: string }> {
  const trimmed = email.trim().toLowerCase();
  const isGmail = /^[a-zA-Z0-9._%+-]+@gmail\.com$/i.test(trimmed);
  if (!isGmail) {
    throw new Error('Please enter a valid Gmail address ending in @gmail.com');
  }

  // 1. Try server request only when backend API exists
  if (await isBackendServerAvailable()) {
    try {
      const res = await fetch('/api/auth/forgot-password/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed }),
      });
      if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
        const data = await res.json();
        try {
          await firestoreRequestPasswordReset(trimmed);
        } catch {}
        return data;
      }
    } catch (err) {
      console.warn('Server forgot password request failed, trying Firestore', err);
    }
  }

  // 2. Direct Firestore OTP generation (works on Firebase Hosting web.app)
  const firestoreCode = await firestoreRequestPasswordReset(trimmed);
  return {
    success: true,
    message: `Password reset OTP generated for ${trimmed}`,
    code: firestoreCode,
  };
}

/**
 * Reset Auditor Password using verified OTP code
 */
export async function resetAuditorPassword(
  email: string,
  code: string,
  newPassword: string
): Promise<{ success: boolean; message: string }> {
  const trimmedEmail = email.trim().toLowerCase();
  const trimmedCode = code.trim();
  const trimmedPass = newPassword.trim();

  if (trimmedPass.length < 4) {
    throw new Error('New password must be at least 4 characters long.');
  }

  let serverSuccess = false;
  if (await isBackendServerAvailable()) {
    try {
      const res = await fetch('/api/auth/forgot-password/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: trimmedEmail,
          code: trimmedCode,
          newPassword: trimmedPass,
        }),
      });
      if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
        serverSuccess = true;
      }
    } catch (err) {
      console.warn('Server password reset failed, using Firestore', err);
    }
  }

  // Sync / update in Firestore for cross-device persistence
  try {
    await firestoreResetUserPassword(trimmedEmail, trimmedCode, trimmedPass);
  } catch (err: any) {
    if (!serverSuccess) {
      throw err;
    }
  }

  // Also update in local storage cache
  try {
    const users = getRegisteredUsers();
    const idx = users.findIndex((u) => u.email?.toLowerCase() === trimmedEmail);
    if (idx >= 0) {
      users[idx].password = trimmedPass;
      localStorage.setItem(REGISTERED_USERS_KEY, JSON.stringify(users));
    }
  } catch {}

  return {
    success: true,
    message: 'Password reset successfully! You can now log in with your new password.',
  };
}

export function getRegisteredUsers(): Array<AuditorUser & { password?: string }> {
  try {
    const raw = localStorage.getItem(REGISTERED_USERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function registerAuditor(params: RegisterAuditorParams): Promise<AuditorUser> {
  const trimmedEmail = params.email.trim().toLowerCase();
  const trimmedPass = params.password.trim();
  const trimmedName = params.name.trim();

  if (!trimmedEmail || !trimmedPass || !trimmedName) {
    throw new Error('Full name, Gmail address, and password are required.');
  }

  const isGmail = /^[a-zA-Z0-9._%+-]+@gmail\.com$/i.test(trimmedEmail);
  if (!isGmail) {
    throw new Error('Registration requires a valid Gmail address (@gmail.com).');
  }

  // 1. Sync to Firestore (enables instant login on any other device)
  try {
    await firestoreRegisterUser({
      name: trimmedName,
      email: trimmedEmail,
      password: trimmedPass,
      role: params.role?.trim() || 'Lead QMS Auditor',
    });
  } catch (err: any) {
    if (err?.message && err.message.includes('already registered')) {
      throw err;
    }
    console.warn('Firestore user registration notice', err);
  }

  // 2. Try server registration only if backend API is active
  if (await isBackendServerAvailable()) {
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmedName,
          email: trimmedEmail,
          username: trimmedEmail,
          password: trimmedPass,
          role: params.role?.trim() || 'Lead QMS Auditor',
          verificationCode: params.verificationCode,
        }),
      });

      if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
        const newUser: AuditorUser = await res.json();
        sessionStorage.setItem(USER_KEY, JSON.stringify(newUser));
        localStorage.setItem(USER_KEY, JSON.stringify(newUser));
        localStorage.setItem(SESSION_PERSISTENCE_KEY, JSON.stringify(newUser));
        return newUser;
      } else {
        const errData = await res.json().catch(() => ({}));
        if (errData?.error && !errData.error.includes('already registered')) {
          throw new Error(errData.error);
        }
      }
    } catch (err: any) {
      if (err?.message && (err.message.includes('Verification') || err.message.includes('valid Gmail'))) {
        throw err;
      }
      console.warn('Server registration offline, using local + Firestore copy', err);
    }
  }

  // 3. Fallback to localStorage
  const users = getRegisteredUsers();
  const existing = users.find(
    (u) => u.email?.toLowerCase() === trimmedEmail || u.username.toLowerCase() === trimmedEmail
  );
  if (!existing) {
    const newUser: AuditorUser & { password?: string } = {
      id: `aud-${Date.now()}`,
      username: trimmedEmail,
      name: trimmedName,
      role: params.role?.trim() || 'Lead QMS Auditor',
      email: trimmedEmail,
      token: `token_${Date.now()}`,
      password: trimmedPass,
    };
    users.push(newUser);
    localStorage.setItem(REGISTERED_USERS_KEY, JSON.stringify(users));
  }

  const sessionUser: AuditorUser = {
    id: `aud-${Date.now()}`,
    username: trimmedEmail,
    name: trimmedName,
    role: params.role?.trim() || 'Lead QMS Auditor',
    email: trimmedEmail,
    token: `token_${Date.now()}`,
  };

  sessionStorage.setItem(USER_KEY, JSON.stringify(sessionUser));
  localStorage.setItem(USER_KEY, JSON.stringify(sessionUser));
  localStorage.setItem(SESSION_PERSISTENCE_KEY, JSON.stringify(sessionUser));
  return sessionUser;
}

export async function loginAuditor(identifier: string, password: string): Promise<AuditorUser> {
  const trimmed = identifier.trim().toLowerCase();
  const trimmedPass = password.trim();

  if (!trimmed || !trimmedPass) {
    throw new Error('Please enter both Gmail address and password.');
  }

  // 1. FAST-PATH (< 5ms): Instant local verification if user registered on this device
  const localUsers = getRegisteredUsers();
  const localMatched = localUsers.find(
    (u) =>
      (u.email?.toLowerCase() === trimmed || u.username?.toLowerCase() === trimmed) &&
      u.password === trimmedPass
  );

  if (localMatched) {
    const sessionUser: AuditorUser = {
      id: localMatched.id,
      username: localMatched.username || trimmed,
      name: localMatched.name || trimmed.split('@')[0],
      role: localMatched.role || 'Lead QMS Auditor',
      email: localMatched.email || trimmed,
      token: localMatched.token || `token_${Date.now()}`,
    };
    sessionStorage.setItem(USER_KEY, JSON.stringify(sessionUser));
    localStorage.setItem(USER_KEY, JSON.stringify(sessionUser));
    localStorage.setItem(SESSION_PERSISTENCE_KEY, JSON.stringify(sessionUser));
    return sessionUser;
  }

  // Built-in Admin fallback: If quality.bd.eng@gmail.com logs in with 1234
  if (trimmed === 'quality.bd.eng@gmail.com' && (trimmedPass === '1234' || trimmedPass === 'admin' || trimmedPass === 'Admin')) {
    const adminUser: AuditorUser = {
      id: 'aud-admin-master',
      username: 'quality.bd.eng@gmail.com',
      name: 'Sabuj Mahmud',
      role: 'Lead QMS Auditor',
      email: 'quality.bd.eng@gmail.com',
      token: `token_admin_${Date.now()}`,
    };
    // Cache for subsequent instant logins
    const allUsers = getRegisteredUsers();
    const idx = allUsers.findIndex(u => u.email?.toLowerCase() === trimmed);
    if (idx >= 0) allUsers[idx] = { ...adminUser, password: trimmedPass };
    else allUsers.push({ ...adminUser, password: trimmedPass });
    localStorage.setItem(REGISTERED_USERS_KEY, JSON.stringify(allUsers));
    sessionStorage.setItem(USER_KEY, JSON.stringify(adminUser));
    localStorage.setItem(USER_KEY, JSON.stringify(adminUser));
    localStorage.setItem(SESSION_PERSISTENCE_KEY, JSON.stringify(adminUser));
    return adminUser;
  }

  // 2. PARALLEL REMOTE CHECK: Fast race between server (if available) and Firestore (max 2.5s)
  const serverLoginPromise = (async (): Promise<AuditorUser | null> => {
    if (!(await isBackendServerAvailable())) return null;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2500);
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: trimmed, password: trimmedPass }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
        const data = await res.json();
        return {
          id: data.user.id || `aud-${Date.now()}`,
          username: data.user.username || trimmed,
          name: data.user.name || trimmed,
          role: data.user.role || 'Lead QMS Auditor',
          email: data.user.email || trimmed,
          token: data.token,
        };
      }
    } catch {
      // ignore
    }
    return null;
  })();

  const firestoreLoginPromise = (async (): Promise<AuditorUser | null> => {
    try {
      return await firestoreLoginUser(trimmed, trimmedPass);
    } catch {
      return null;
    }
  })();

  const [serverUser, firestoreUser] = await Promise.all([serverLoginPromise, firestoreLoginPromise]);
  const verifiedUser = serverUser || firestoreUser;

  if (verifiedUser) {
    // Cache credentials in local store so future logins are instant and never fail
    const allUsers = getRegisteredUsers();
    const idx = allUsers.findIndex((u) => u.email?.toLowerCase() === trimmed);
    const updatedRecord = { ...verifiedUser, password: trimmedPass };
    if (idx >= 0) {
      allUsers[idx] = updatedRecord;
    } else {
      allUsers.push(updatedRecord);
    }
    localStorage.setItem(REGISTERED_USERS_KEY, JSON.stringify(allUsers));
    sessionStorage.setItem(USER_KEY, JSON.stringify(verifiedUser));
    localStorage.setItem(USER_KEY, JSON.stringify(verifiedUser));
    localStorage.setItem(SESSION_PERSISTENCE_KEY, JSON.stringify(verifiedUser));
    return verifiedUser;
  }

  throw new Error('Invalid Gmail address or password. Please verify your credentials or register an account first.');
}

export function getCurrentUser(): AuditorUser | null {
  try {
    const raw =
      localStorage.getItem(SESSION_PERSISTENCE_KEY) ||
      sessionStorage.getItem(USER_KEY) ||
      localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function logoutAuditor(): void {
  try {
    sessionStorage.removeItem(USER_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(SESSION_PERSISTENCE_KEY);
  } catch {
    // ignore
  }
}

// Local cache + server sync for audits:
// - Admin (quality.bd.eng@gmail.com) sees all reports
// - Regular auditors strictly see ONLY their own submitted audits (for CAP management)
export async function fetchAllAudits(requesterEmail?: string): Promise<AuditReportData[]> {
  const effectiveEmail = (requesterEmail || getCurrentUser()?.email || '').trim().toLowerCase();
  if (!effectiveEmail) {
    return [];
  }
  const adminAccess = isAuditorAdmin(effectiveEmail);

  let serverAudits: AuditReportData[] = [];
  if (await isBackendServerAvailable()) {
    try {
      const res = await fetch('/api/audits', {
        headers: {
          'x-auditor-email': effectiveEmail,
        },
      });
      if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
        serverAudits = await res.json();
      }
    } catch (e) {
      console.warn('Could not fetch audits from server, loading local/Firestore cache', e);
    }
  }

  // Load from Firestore (cloud database)
  let firestoreAudits: AuditReportData[] = [];
  try {
    firestoreAudits = await fetchAuditsFromFirestore(effectiveEmail);
  } catch (err) {
    console.warn('Error reading audits from Firestore', err);
  }

  // Load from IndexedDB (handles 500+ photos without localStorage quota limit)
  let idbAudits: AuditReportData[] = [];
  try {
    idbAudits = await loadAuditsFromIndexedDB();
  } catch (err) {
    console.warn('Error reading audits from IndexedDB', err);
  }

  // Merge with localStorage
  let localAudits: AuditReportData[] = [];
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      const list: AuditReportData[] = JSON.parse(raw);
      localAudits = list.filter(
        (a) =>
          a.factoryInfo?.name !== 'Northern Fashions Ltd.' &&
          a.factoryInfo?.name !== 'Apex Textile Mills Ltd.'
      );
    }
  } catch (e) {
    console.warn('Error reading local audits', e);
  }

  const map = new Map<string, AuditReportData>();
  const addFiltered = (list: AuditReportData[]) => {
    list.forEach((a) => {
      if (!a || !a.id) return;
      if (adminAccess || (a.auditorEmail && a.auditorEmail.trim().toLowerCase() === effectiveEmail)) {
        const prev = map.get(a.id);
        if (!prev || new Date(a.updatedAt || a.createdAt).getTime() >= new Date(prev.updatedAt || prev.createdAt).getTime()) {
          map.set(a.id, a);
        }
      }
    });
  };

  addFiltered(localAudits);
  addFiltered(idbAudits);
  addFiltered(firestoreAudits);
  addFiltered(serverAudits);

  const merged = Array.from(map.values()).sort(
    (a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime()
  );

  return merged;
}

export async function saveAuditReport(rawReport: AuditReportData): Promise<AuditReportData> {
  const currentEmail = getCurrentUser()?.email?.trim().toLowerCase();
  const report: AuditReportData = {
    ...rawReport,
    auditorEmail: (rawReport.auditorEmail || currentEmail || '').trim().toLowerCase(),
    updatedAt: new Date().toISOString(),
  };

  // 1. Save to high-capacity IndexedDB (handles 500+ photos)
  try {
    await saveAuditToIndexedDB(report);
  } catch (err) {
    console.warn('IndexedDB save audit failed', err);
  }

  // 2. Save to Firestore cloud database
  try {
    await saveAuditToFirestore(report);
  } catch (err) {
    console.warn('Firestore save audit failed', err);
  }

  // 3. Save to local storage for resilience (if quota allows)
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    const list: AuditReportData[] = raw ? JSON.parse(raw) : [];
    const idx = list.findIndex((a) => a.id === report.id);
    if (idx >= 0) {
      list[idx] = report;
    } else {
      list.unshift(report);
    }
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Quota exceeded is safely caught; IndexedDB & Firestore already have the full report
  }

  // 4. Also save to server if backend API is active
  if (await isBackendServerAvailable()) {
    try {
      const res = await fetch('/api/audits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(report),
      });
      if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
        return await res.json();
      }
    } catch (e) {
      console.warn('Server save failed, using Firestore/local copy', e);
    }
  }

  return report;
}

export async function deleteAuditReport(id: string, requesterEmail?: string): Promise<void> {
  const adminEmail = requesterEmail || getCurrentUser()?.email;
  if (!isAuditorAdmin(adminEmail)) {
    throw new Error('Permission denied: Only Admin (quality.bd.eng@gmail.com) can delete saved audit archives.');
  }

  try {
    await deleteAuditFromIndexedDB(id);
  } catch (err) {
    console.warn('IndexedDB delete failed', err);
  }

  try {
    await deleteAuditFromFirestore(id, adminEmail);
  } catch (err) {
    console.warn('Firestore delete failed', err);
  }

  if (await isBackendServerAvailable()) {
    try {
      await fetch(`/api/audits/${id}`, {
        method: 'DELETE',
        headers: {
          'x-auditor-email': adminEmail || '',
        },
      });
    } catch (e) {
      console.warn('Server delete failed', e);
    }
  }

  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      const list: AuditReportData[] = JSON.parse(raw);
      const filtered = list.filter((a) => a.id !== id);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(filtered));
    }
  } catch (e) {
    console.warn('Local delete failed', e);
  }
}

// ==========================================
// REAL-TIME CLOUD DRAFT SYNCHRONIZATION
// ==========================================

let cloudSyncTimer: any = null;

export function getLocalDraftStorageKey(userEmail?: string | null): string {
  const email = userEmail?.trim().toLowerCase();
  if (email) {
    return `${CURRENT_AUDIT_KEY}_${email.replace(/[^a-z0-9]/g, '_')}`;
  }
  return CURRENT_AUDIT_KEY;
}

function writeLightLocalDraft(draft: any, userEmail?: string | null): void {
  try {
    const currentEmail = (userEmail || getCurrentUser()?.email || draft?.ownerEmail || '').trim().toLowerCase();
    const storageKey = getLocalDraftStorageKey(currentEmail);
    if (!draft) {
      localStorage.removeItem(storageKey);
      return;
    }
    const lightDraft = {
      ownerEmail: currentEmail,
      currentTab: draft.currentTab,
      activeSectionId: draft.activeSectionId,
      updatedAt: draft.updatedAt || new Date().toISOString(),
      factoryInfo: {
        ...draft.factoryInfo,
        openingMeetingPhoto: draft.factoryInfo?.openingMeetingPhoto ? 'attached' : undefined,
        factoryOutlookPhotos: [],
        certifications: draft.factoryInfo?.certifications?.map((c: any) => ({
          ...c,
          photo: c.photo ? 'attached' : undefined,
        })),
      },
      sections: draft.sections?.map((s: any) => ({
        ...s,
        checkpoints: s.checkpoints?.map((c: any) => ({
          id: c.id,
          code: c.code,
          title: c.title,
          description: c.description,
          guidelines: c.guidelines,
          isCustom: c.isCustom,
          score: c.score,
          notes: c.notes,
          isUpdated: c.isUpdated,
          lastSyncedAt: c.lastSyncedAt,
        })),
      })),
    };
    localStorage.setItem(storageKey, JSON.stringify(lightDraft));
  } catch {}
}

export function isValidPhotoUrl(url?: string | null): boolean {
  if (!url || typeof url !== 'string') return false;
  return url.startsWith('data:image/') || url.startsWith('http://') || url.startsWith('https://');
}

/**
 * Merges a remote or light draft into current local state WITHOUT ever wiping out
 * real image dataUrls with 'image-attached' or 'attached' placeholders.
 * When `isAuthoritativeRemote` is true (Firestore / SSE), photo additions AND deletions
 * from the other device are honored accurately.
 */
export function mergeDraftPreservingPhotos(
  currentFactory: any,
  currentSections: any[],
  incomingDraft: any,
  isAuthoritativeRemote = true
): { factoryInfo: any; sections: any[] } {
  if (!incomingDraft) {
    return { factoryInfo: currentFactory, sections: currentSections };
  }

  let mergedFactory = currentFactory;
  if (incomingDraft.factoryInfo) {
    const incF = incomingDraft.factoryInfo;
    const prevOpening = isValidPhotoUrl(currentFactory?.openingMeetingPhoto)
      ? currentFactory.openingMeetingPhoto
      : undefined;
    const rawOpening = incF.openingMeetingPhoto;
    const isOpeningPlaceholder = rawOpening === 'attached' || rawOpening === 'image-attached';
    let finalOpening = prevOpening;
    if (isValidPhotoUrl(rawOpening)) {
      finalOpening = rawOpening;
    } else if (isOpeningPlaceholder) {
      finalOpening = prevOpening;
    } else if (isAuthoritativeRemote && 'openingMeetingPhoto' in incF && !rawOpening) {
      finalOpening = undefined;
    }

    const prevOutlook: any[] = Array.isArray(currentFactory?.factoryOutlookPhotos)
      ? currentFactory.factoryOutlookPhotos
      : [];
    const hasIncOutlookArray = Array.isArray(incF.factoryOutlookPhotos);
    const incOutlook: any[] = hasIncOutlookArray ? incF.factoryOutlookPhotos : [];

    let finalOutlook = prevOutlook;
    if (incOutlook.length > 0) {
      finalOutlook = incOutlook
        .map((item: any) => {
          if (isValidPhotoUrl(item.dataUrl)) return item;
          const matchedPrev = prevOutlook.find((p) => p.id === item.id);
          return matchedPrev && isValidPhotoUrl(matchedPrev.dataUrl)
            ? { ...matchedPrev, ...item, dataUrl: matchedPrev.dataUrl }
            : null;
        })
        .filter(Boolean);
    } else if (isAuthoritativeRemote && hasIncOutlookArray) {
      // Authoritative remote explicitly cleared/deleted all outlook photos
      finalOutlook = [];
    }

    const prevCerts: any[] = Array.isArray(currentFactory?.certifications)
      ? currentFactory.certifications
      : [];
    const incCerts: any[] = Array.isArray(incF.certifications) ? incF.certifications : [];
    const finalCerts =
      incCerts.length > 0
        ? incCerts.map((c: any) => {
            if (isValidPhotoUrl(c.photo)) return c;
            const isCertPlaceholder = c.photo === 'attached' || c.photo === 'image-attached';
            const prevC = prevCerts.find((pc) => pc.id === c.id);
            if ((isCertPlaceholder || !isAuthoritativeRemote) && prevC && isValidPhotoUrl(prevC.photo)) {
              return { ...c, photo: prevC.photo };
            }
            return { ...c, photo: undefined };
          })
        : prevCerts;

    mergedFactory = {
      ...currentFactory,
      ...incF,
      openingMeetingPhoto: finalOpening,
      factoryOutlookPhotos: finalOutlook,
      certifications: finalCerts,
    };
  }

  let mergedSections = currentSections;
  if (Array.isArray(incomingDraft.sections) && incomingDraft.sections.length > 0) {
    mergedSections = incomingDraft.sections.map((incSec: any) => {
      const prevSec = currentSections?.find((s: any) => s.id === incSec.id);
      const mergedCheckpoints = (incSec.checkpoints || []).map((incCp: any) => {
        const prevCp = prevSec?.checkpoints?.find((c: any) => c.id === incCp.id);
        const prevImgs: any[] = Array.isArray(prevCp?.images) ? prevCp.images : [];
        const hasIncImgsArray = Array.isArray(incCp?.images);
        const incImgs: any[] = hasIncImgsArray ? incCp.images : [];

        let finalImages = prevImgs;
        if (incImgs.length > 0) {
          finalImages = incImgs
            .map((img: any) => {
              if (isValidPhotoUrl(img.dataUrl)) return img;
              const matched = prevImgs.find((p) => p.id === img.id);
              return matched && isValidPhotoUrl(matched.dataUrl)
                ? { ...matched, ...img, dataUrl: matched.dataUrl }
                : null;
            })
            .filter(Boolean);
        } else if (isAuthoritativeRemote && hasIncImgsArray) {
          // Authoritative remote explicitly has 0 images for this checkpoint
          finalImages = [];
        }

        return {
          ...(prevCp || {}),
          ...incCp,
          images: finalImages,
        };
      });
      return {
        ...(prevSec || {}),
        ...incSec,
        checkpoints: mergedCheckpoints,
      };
    });
  }

  return { factoryInfo: mergedFactory, sections: mergedSections };
}

export async function saveActiveDraftImmediate(
  draft: any
): Promise<{ ok: boolean; updatedAt?: string; error?: string }> {
  const currentEmail = getCurrentUser()?.email?.trim().toLowerCase() || '';
  const updatedAt = new Date().toISOString();
  const stampedDraft = draft
    ? {
        ...draft,
        ownerEmail: currentEmail || draft.ownerEmail || '',
        updatedAt,
      }
    : null;

  if (cloudSyncTimer) {
    clearTimeout(cloudSyncTimer);
    cloudSyncTimer = null;
  }

  writeLightLocalDraft(stampedDraft, currentEmail);
  if (stampedDraft) {
    saveDraftToIndexedDB(stampedDraft, currentEmail).catch(() => {});
    const clientId = getClientDeviceId();

    if (await isBackendServerAvailable()) {
      fetch('/api/active-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...stampedDraft,
          clientId,
          ownerEmail: currentEmail || stampedDraft.ownerEmail || '',
          lastUpdatedBy: stampedDraft?.factoryInfo?.auditorName || 'Auditor',
        }),
      }).catch(() => {});
    }

    return await syncDraftToFirestore(stampedDraft, clientId, currentEmail);
  } else {
    clearDraftFromIndexedDB(currentEmail).catch(() => {});
    return { ok: true, updatedAt };
  }
}

export function saveActiveDraft(draft: any, isExplicitDelete = false): void {
  const currentEmail = getCurrentUser()?.email?.trim().toLowerCase() || '';
  const stampedDraft = draft
    ? {
        ...draft,
        ownerEmail: currentEmail || draft.ownerEmail || '',
        updatedAt: new Date().toISOString(),
      }
    : null;

  // 1. High-capacity IndexedDB local backup (isolated per user email)
  if (stampedDraft) {
    saveDraftToIndexedDB(stampedDraft, currentEmail).catch(() => {});
  } else {
    clearDraftFromIndexedDB(currentEmail).catch(() => {});
  }

  // 2. Ultra-light LocalStorage backup (isolated per user email, <10KB)
  writeLightLocalDraft(stampedDraft, currentEmail);

  // 3. Debounced Cloud Network Sync (Firestore + Server SSE) - fast 250ms sync across Mobile & PC
  if (cloudSyncTimer) clearTimeout(cloudSyncTimer);

  const delay = isExplicitDelete ? 50 : 250;
  cloudSyncTimer = setTimeout(async () => {
    // A. Direct Firestore Real-Time Sync across Mobile & PC Browser
    try {
      const clientId = getClientDeviceId();
      syncDraftToFirestore(stampedDraft, clientId, currentEmail).catch(() => {});
    } catch (err) {
      console.warn('Failed triggering Firestore draft sync', err);
    }

    // B. Background server sync (only when Express backend is running)
    if (await isBackendServerAvailable()) {
      try {
        const clientId = getClientDeviceId();
        const payload = {
          ...stampedDraft,
          clientId,
          ownerEmail: currentEmail || stampedDraft?.ownerEmail || '',
          isExplicitDelete,
          lastUpdatedBy: stampedDraft?.factoryInfo?.auditorName || 'Auditor',
        };

        fetch('/api/active-draft', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }).catch((err) => {
          console.warn('Background draft cloud sync failed', err);
        });
      } catch (e) {
        console.warn('Failed triggering cloud draft sync', e);
      }
    }
  }, delay);
}

export {
  subscribeToFirestoreDraft,
  clearFirestoreDraft,
  fetchDraftFromFirestore,
  fetchAllActiveDraftsForAdmin,
  subscribeToAllActiveDraftsForAdmin,
  subscribeToAuditsForUser,
  hydratePayloadPhotos,
  saveDraftToIndexedDB,
  clearDraftFromIndexedDB,
  ADMIN_EMAIL,
  isAuditorAdmin,
};

export async function loadActiveDraftAsync(userEmail?: string | null): Promise<any | null> {
  const effectiveEmail = (userEmail || getCurrentUser()?.email || '').trim().toLowerCase();
  if (!effectiveEmail) return null;
  try {
    const dbDraft = await loadDraftFromIndexedDB(effectiveEmail);
    if (dbDraft && (dbDraft.factoryInfo || dbDraft.sections)) {
      if (!dbDraft.ownerEmail || dbDraft.ownerEmail.trim().toLowerCase() === effectiveEmail) {
        return dbDraft;
      }
    }
  } catch {
    // fallback
  }
  return loadActiveDraft(effectiveEmail);
}

export function loadActiveDraft(userEmail?: string | null): any | null {
  try {
    const effectiveEmail = (userEmail || getCurrentUser()?.email || '').trim().toLowerCase();
    if (!effectiveEmail) return null;
    const storageKey = getLocalDraftStorageKey(effectiveEmail);
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.ownerEmail && parsed.ownerEmail.trim().toLowerCase() !== effectiveEmail) {
      return null;
    }
    if (
      parsed?.factoryInfo?.name === 'Northern Fashions Ltd.' ||
      parsed?.factoryInfo?.name === 'Apex Textile Mills Ltd.'
    ) {
      localStorage.removeItem(storageKey);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function fetchServerActiveDraft(userEmail?: string | null): Promise<any | null> {
  if (!(await isBackendServerAvailable())) return null;
  const effectiveEmail = (userEmail || getCurrentUser()?.email || '').trim().toLowerCase();
  if (!effectiveEmail) return null;
  try {
    const res = await fetch(`/api/active-draft?email=${encodeURIComponent(effectiveEmail)}`);
    if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
      const data = await res.json();
      if (data && (data.factoryInfo || data.sections)) {
        return data;
      }
    }
  } catch (e) {
    console.warn('Could not fetch cloud draft', e);
  }
  return null;
}

/**
 * Subscribes to real-time Server-Sent Events stream (/api/active-draft/stream)
 * scoped to the signed-in user's email.
 */
export function subscribeToLiveDraftStream(
  onRemoteUpdate: (draft: any) => void,
  onConnectionChange?: (connected: boolean) => void,
  userEmail?: string | null
): () => void {
  if (typeof window === 'undefined' || !window.EventSource) {
    return () => {};
  }

  const effectiveEmail = (userEmail || getCurrentUser()?.email || '').trim().toLowerCase();
  let eventSource: EventSource | null = null;
  let retryTimer: any = null;
  let isClosed = false;

  async function connect() {
    if (isClosed) return;

    const hasServer = await isBackendServerAvailable();
    if (!hasServer) {
      // Running on Firebase Hosting (web.app) — Firestore handles real-time sync directly
      onConnectionChange?.(true);
      return;
    }

    try {
      const streamUrl = effectiveEmail
        ? `/api/active-draft/stream?email=${encodeURIComponent(effectiveEmail)}`
        : '/api/active-draft/stream';
      eventSource = new EventSource(streamUrl);

      eventSource.onopen = () => {
        onConnectionChange?.(true);
      };

      eventSource.addEventListener('initial_state', (e: MessageEvent) => {
        if (!e.data || e.data === 'null') return;
        try {
          const draft = JSON.parse(e.data);
          if (draft?.ownerEmail && effectiveEmail && draft.ownerEmail.trim().toLowerCase() !== effectiveEmail) {
            return;
          }
          if (draft && (draft.factoryInfo || draft.sections)) {
            onRemoteUpdate(draft);
          }
        } catch (err) {
          console.warn('Error parsing initial draft stream', err);
        }
      });

      eventSource.addEventListener('draft_update', (e: MessageEvent) => {
        if (!e.data) return;
        try {
          const draft = JSON.parse(e.data);
          const currentDeviceId = getClientDeviceId();

          // Only apply updates that came from another device/browser of this same email
          if (draft.senderClientId && draft.senderClientId === currentDeviceId) {
            return;
          }
          if (draft?.ownerEmail && effectiveEmail && draft.ownerEmail.trim().toLowerCase() !== effectiveEmail) {
            return;
          }

          if (draft && (draft.factoryInfo || draft.sections)) {
            onRemoteUpdate(draft);
          }
        } catch (err) {
          console.warn('Error parsing live draft update', err);
        }
      });

      eventSource.onerror = () => {
        onConnectionChange?.(false);
        if (eventSource) {
          eventSource.close();
          eventSource = null;
        }
        if (!isClosed) {
          retryTimer = setTimeout(connect, 3000);
        }
      };
    } catch (err) {
      console.warn('Could not open SSE connection', err);
      if (!isClosed) {
        retryTimer = setTimeout(connect, 5000);
      }
    }
  }

  connect();

  return () => {
    isClosed = true;
    if (retryTimer) clearTimeout(retryTimer);
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
  };
}
