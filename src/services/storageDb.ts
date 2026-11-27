/**
 * High-Capacity IndexedDB storage engine for QualiTech Technical Audit.
 * Designed to support 500-1000+ inspection photos (hundreds of MBs/GBs)
 * without hitting the strict 5MB browser localStorage quota.
 */

import { AuditReportData } from '../types/audit';

const DB_NAME = 'QualiTechAuditDB_v1';
const DB_VERSION = 1;
const DRAFT_STORE = 'active_draft_store';
const AUDITS_STORE = 'saved_audits_store';

function isIndexedDBAvailable(): boolean {
  return typeof window !== 'undefined' && 'indexedDB' in window;
}

let cachedDbPromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (cachedDbPromise) {
    return cachedDbPromise;
  }

  cachedDbPromise = new Promise((resolve, reject) => {
    if (!isIndexedDBAvailable()) {
      reject(new Error('IndexedDB not supported in this browser'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(DRAFT_STORE)) {
        db.createObjectStore(DRAFT_STORE);
      }
      if (!db.objectStoreNames.contains(AUDITS_STORE)) {
        db.createObjectStore(AUDITS_STORE, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      db.onclose = () => {
        cachedDbPromise = null;
      };
      db.onerror = () => {
        cachedDbPromise = null;
      };
      resolve(db);
    };

    request.onerror = () => {
      cachedDbPromise = null;
      reject(request.error || new Error('Failed to open IndexedDB'));
    };
  });

  return cachedDbPromise;
}

/**
 * Persists the entire active audit draft (including 500+ photos) safely in IndexedDB
 */
export async function saveDraftToIndexedDB(draft: any): Promise<void> {
  if (!isIndexedDBAvailable()) return;
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DRAFT_STORE, 'readwrite');
      const store = tx.objectStore(DRAFT_STORE);
      const req = store.put(draft, 'current_active_draft');

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Error saving draft to IndexedDB:', err);
  }
}

/**
 * Loads the active draft from IndexedDB
 */
export async function loadDraftFromIndexedDB(): Promise<any | null> {
  if (!isIndexedDBAvailable()) return null;
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DRAFT_STORE, 'readonly');
      const store = tx.objectStore(DRAFT_STORE);
      const req = store.get('current_active_draft');

      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Error reading draft from IndexedDB:', err);
    return null;
  }
}

/**
 * Completely clears the active draft from IndexedDB
 */
export async function clearDraftFromIndexedDB(): Promise<void> {
  if (!isIndexedDBAvailable()) return;
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DRAFT_STORE, 'readwrite');
      const store = tx.objectStore(DRAFT_STORE);
      const req = store.delete('current_active_draft');

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Error clearing draft from IndexedDB:', err);
  }
}

/**
 * Saves a completed audit report to IndexedDB
 */
export async function saveAuditToIndexedDB(report: AuditReportData): Promise<void> {
  if (!isIndexedDBAvailable()) return;
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(AUDITS_STORE, 'readwrite');
      const store = tx.objectStore(AUDITS_STORE);
      const req = store.put(report);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Error saving audit report to IndexedDB:', err);
  }
}

/**
 * Loads all saved audits from IndexedDB
 */
export async function loadAuditsFromIndexedDB(): Promise<AuditReportData[]> {
  if (!isIndexedDBAvailable()) return [];
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(AUDITS_STORE, 'readonly');
      const store = tx.objectStore(AUDITS_STORE);
      const req = store.getAll();

      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Error loading audits from IndexedDB:', err);
    return [];
  }
}

/**
 * Deletes an audit from IndexedDB
 */
export async function deleteAuditFromIndexedDB(id: string): Promise<void> {
  if (!isIndexedDBAvailable()) return;
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(AUDITS_STORE, 'readwrite');
      const store = tx.objectStore(AUDITS_STORE);
      const req = store.delete(id);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Error deleting audit from IndexedDB:', err);
  }
}
