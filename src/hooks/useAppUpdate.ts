import { useState, useEffect, useCallback, useRef } from 'react';
import { isBackendServerAvailable } from '../services/api';

export interface UpdateInfo {
  version: string;
  buildTime: number;
  buildDate?: string;
  appName?: string;
}

// Built-in bundle baseline version & timestamp
const CURRENT_APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '2.10.0';
const CURRENT_APP_BUILD_TIME =
  typeof __APP_BUILD_TIME__ !== 'undefined' ? Number(__APP_BUILD_TIME__) : 1793784180000;

export function useAppUpdate(onBeforeReload?: () => Promise<void> | void) {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [newVersion, setNewVersion] = useState<string>('Latest');
  const [isUpdating, setIsUpdating] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const checkInProgressRef = useRef(false);
  const onBeforeReloadRef = useRef(onBeforeReload);
  onBeforeReloadRef.current = onBeforeReload;

  // Store the version recorded when the app initially mounted
  const initialSessionVersionRef = useRef<string>(CURRENT_APP_VERSION);
  const initialSessionBuildTimeRef = useRef<number>(CURRENT_APP_BUILD_TIME);

  const checkForUpdate = useCallback(async (): Promise<boolean> => {
    if (checkInProgressRef.current) return false;
    checkInProgressRef.current = true;

    try {
      // 1. Fetch version.json with aggressive cache-busting (works on both root / and GitHub Pages subpath)
      const res = await fetch(`${import.meta.env.BASE_URL}version.json?_t=${Date.now()}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Pragma: 'no-cache',
        },
      });

      if (!res.ok) {
        return false;
      }

      const data: UpdateInfo = await res.json();
      if (data && (data.version || data.buildTime)) {
        const isVersionNewer =
          Boolean(data.version) && data.version !== initialSessionVersionRef.current;
        const isBuildNewer =
          typeof data.buildTime === 'number' &&
          data.buildTime > initialSessionBuildTimeRef.current + 2000;

        if (isVersionNewer || isBuildNewer) {
          setUpdateAvailable(true);
          setNewVersion(data.version || 'New Version');
          return true;
        }
      }
    } catch {
      // Offline / network fallback
    } finally {
      checkInProgressRef.current = false;
    }

    return false;
  }, []);

  // Apply update immediately: flush active draft & photos first, clear outdated SW caches (never IndexedDB/localStorage), then reload
  const applyUpdate = useCallback(async () => {
    try {
      setIsUpdating(true);

      // 0. Guarantee active draft + all photos are safely flushed to IndexedDB / Cloud before reload
      if (onBeforeReloadRef.current) {
        try {
          await Promise.race([
            Promise.resolve(onBeforeReloadRef.current()),
            new Promise((resolve) => setTimeout(resolve, 2500)),
          ]);
        } catch {
          // continue reload
        }
      }

      // 1. Clear Service Worker registrations and caches
      if ('serviceWorker' in navigator) {
        try {
          const regs = await navigator.serviceWorker.getRegistrations();
          for (const reg of regs) {
            if (reg.waiting) {
              reg.waiting.postMessage({ type: 'SKIP_WAITING' });
            }
            await reg.update();
          }
        } catch {
          // ignore
        }
      }

      if ('caches' in window) {
        try {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        } catch {
          // ignore
        }
      }

      // 2. Reload page with cache bypass
      window.location.reload();
    } catch {
      window.location.reload();
    }
  }, []);

  const dismissUpdate = useCallback(() => {
    setDismissed(true);
  }, []);

  useEffect(() => {
    // 1. Initial quick check after 2 seconds
    const initialTimer = setTimeout(() => {
      checkForUpdate();
    }, 2000);

    // 2. Periodic background check every 30 seconds
    const interval = setInterval(() => {
      checkForUpdate();
    }, 30000);

    // 3. Check whenever user switches tabs or returns to the window
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkForUpdate();
      }
    };

    window.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleVisibilityChange);

    // 4. SSE real-time broadcast listener (only when running with Node/Express backend)
    let eventSource: EventSource | null = null;
    let cancelled = false;

    const initSseIfAvailable = async () => {
      try {
        if (cancelled || !(await isBackendServerAvailable())) return;
        eventSource = new EventSource('/api/active-draft/stream');
        eventSource.addEventListener('app_update', (e: MessageEvent) => {
          try {
            const payload = JSON.parse(e.data);
            if (payload?.version) {
              setNewVersion(payload.version);
              setUpdateAvailable(true);
            }
          } catch {
            setUpdateAvailable(true);
          }
        });
      } catch {
        // SSE not supported or static hosting
      }
    };
    initSseIfAvailable();

    return () => {
      cancelled = true;
      clearTimeout(initialTimer);
      clearInterval(interval);
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleVisibilityChange);
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [checkForUpdate]);

  return {
    updateAvailable: updateAvailable && !dismissed,
    newVersion,
    isUpdating,
    checkForUpdate,
    applyUpdate,
    dismissUpdate,
  };
}
