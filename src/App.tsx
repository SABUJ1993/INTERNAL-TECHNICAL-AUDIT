/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  AuditReportData,
  AuditSection,
  AuditorUser,
  FactoryInfo,
  AppTab,
  ViewMode,
  CheckpointEvidence,
  CapItem,
  ScoreOption,
} from './types/audit';
import { DEFAULT_CERTIFICATIONS } from './data/defaultCertifications';
import { DEFAULT_AUDIT_SECTIONS } from './data/defaultCheckpoints';
import { calculateAuditReport } from './utils/scoring';
import { buildCapItemsFromReport } from './utils/capHelpers';
import { generateAuditPdfBlob } from './utils/pdfGenerator';
import {
  getCurrentUser,
  logoutAuditor,
  fetchAllAudits,
  saveAuditReport,
  deleteAuditReport,
  saveActiveDraft,
  saveActiveDraftImmediate,
  loadActiveDraft,
  loadActiveDraftAsync,
  fetchServerActiveDraft,
  subscribeToLiveDraftStream,
  getClientDeviceId,
  mergeDraftPreservingPhotos,
  fetchDraftFromFirestore,
  fetchAllActiveDraftsForAdmin,
  hydratePayloadPhotos,
  saveDraftToIndexedDB,
  clearDraftFromIndexedDB,
  isAuditorAdmin,
} from './services/api';
import { subscribeToFirestoreDraft, clearFirestoreDraft } from './services/firebase';

import { LoginScreen } from './components/LoginScreen';
import { Header } from './components/Header';
import { PreAuditForm } from './components/PreAuditForm';
import { AuditSectionView } from './components/AuditSectionView';
import { ReportView } from './components/ReportView';
import { CapView } from './components/CapView';
import { SavedAuditsView } from './components/SavedAuditsView';
import { ImagePreviewModal } from './components/ImagePreviewModal';
import { DeviceSimulatorWrapper } from './components/DeviceSimulatorWrapper';
import { ShareAppModal } from './components/ShareAppModal';
import { PhotoActionModal, PhotoLocation } from './components/PhotoActionModal';
import { EmailDispatchModal } from './components/EmailDispatchModal';
import { useAppUpdate } from './hooks/useAppUpdate';
import { UpdateNotificationToast } from './components/UpdateNotificationToast';

const DEFAULT_FACTORY_DATA: FactoryInfo = {
  name: '',
  address: '',
  numberOfWorkers: '',
  numberOfLines: '',
  capacityPerMonth: '',
  contactPerson: '',
  contactPhone: '',
  contactEmail: '',
  contactEmails: [],
  auditDate: new Date().toISOString().split('T')[0],
  auditDuration: '',
  auditorName: '',
  auditorTitle: '',
  auditor2Name: '',
  auditor2Title: '',
  auditType: 'Annual Audit',
  buyerBrand: '',
  auditReportNo: '',
  factoryRegistrationNo: '',
  facilities: [],
  certifications: DEFAULT_CERTIFICATIONS.map((c) => ({ ...c, selected: false, photo: undefined })),
  factoryOutlookPhotos: [],
};

function normalizeAuditSections(rawSections: AuditSection[]): AuditSection[] {
  if (!Array.isArray(rawSections) || rawSections.length === 0) {
    return DEFAULT_AUDIT_SECTIONS;
  }
  return rawSections.map((sec: AuditSection, secIdx: number) => {
    if (sec.id === 'ironing' || sec.code === 'IRN' || sec.code === 'IRN/FIN' || secIdx === 5) {
      return {
        ...sec,
        name: 'Ironing / Pressing / Finishing',
        code: 'FIN',
        checkpoints: sec.checkpoints.map((cp, idx: number) => ({
          ...cp,
          code: `FIN-6.${idx + 1}`,
        })),
      };
    }
    return sec;
  });
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<AuditorUser | null>(() => getCurrentUser());
  const [currentTab, setCurrentTab] = useState<AppTab>(() => {
    const draft = loadActiveDraft();
    const savedTab = draft?.currentTab;
    if (savedTab === 'pre-audit' || savedTab === 'audit' || savedTab === 'report' || savedTab === 'cap') {
      return savedTab;
    }
    return 'pre-audit';
  });
  const [viewMode, setViewMode] = useState<ViewMode>('auto');
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);

  const {
    updateAvailable,
    newVersion,
    isUpdating,
    applyUpdate,
    dismissUpdate,
  } = useAppUpdate();

  const [factoryInfo, setFactoryInfo] = useState<FactoryInfo>(() => {
    const draft = loadActiveDraft();
    if (
      draft?.factoryInfo &&
      draft.factoryInfo.name !== 'Northern Fashions Ltd.' &&
      draft.factoryInfo.name !== 'Apex Textile Mills Ltd.'
    ) {
      return {
        ...DEFAULT_FACTORY_DATA,
        ...draft.factoryInfo,
        openingMeetingPhoto:
          draft.factoryInfo.openingMeetingPhoto && draft.factoryInfo.openingMeetingPhoto !== 'attached'
            ? draft.factoryInfo.openingMeetingPhoto
            : undefined,
        auditType: draft.factoryInfo.auditType || 'Annual Audit',
        contactEmails: Array.isArray(draft.factoryInfo.contactEmails)
          ? draft.factoryInfo.contactEmails
          : draft.factoryInfo.contactEmail
          ? draft.factoryInfo.contactEmail.split(/[,;\s]+/).map((e: string) => e.trim()).filter(Boolean)
          : [],
        factoryOutlookPhotos: draft.factoryInfo.factoryOutlookPhotos || [],
      };
    }

    return {
      ...DEFAULT_FACTORY_DATA,
      auditorName: currentUser?.name || '',
      auditorTitle: currentUser?.role || '',
    };
  });

  const [sections, setSections] = useState<AuditSection[]>(() => {
    const draft = loadActiveDraft();
    if (
      draft?.sections &&
      Array.isArray(draft.sections) &&
      draft?.factoryInfo?.name !== 'Northern Fashions Ltd.' &&
      draft?.factoryInfo?.name !== 'Apex Textile Mills Ltd.'
    ) {
      return normalizeAuditSections(draft.sections);
    }
    return DEFAULT_AUDIT_SECTIONS;
  });

  const [savedAudits, setSavedAudits] = useState<AuditReportData[]>([]);
  const [adminLiveDrafts, setAdminLiveDrafts] = useState<any[]>([]);
  const [currentReport, setCurrentReport] = useState<AuditReportData | null>(null);
  const [editingReportId, setEditingReportId] = useState<string | null>(null);
  const [customExecutiveSummary, setCustomExecutiveSummary] = useState<string | null>(null);
  const [activePreviewImage, setActivePreviewImage] = useState<CheckpointEvidence | null>(null);
  const [isSaved, setIsSaved] = useState(true);
  const [isLiveConnected, setIsLiveConnected] = useState(true);
  const [syncMessage, setSyncMessage] = useState<string>('Live Synced');
  const [syncingCheckpointId, setSyncingCheckpointId] = useState<string | null>(null);
  const [activeSectionId, setActiveSectionId] = useState<string>(() => {
    const draft = loadActiveDraft();
    return draft?.activeSectionId || sections[0]?.id || 'warehouse';
  });

  const [photoActionState, setPhotoActionState] = useState<{
    isOpen: boolean;
    evidence: CheckpointEvidence | null;
    sourceLocation: PhotoLocation | null;
  }>({
    isOpen: false,
    evidence: null,
    sourceLocation: null,
  });

  const [emailModalState, setEmailModalState] = useState<{
    isOpen: boolean;
    report: AuditReportData | null;
    pdfBlob: Blob | null;
    pdfFileName: string;
    autoDownloaded: boolean;
  }>({
    isOpen: false,
    report: null,
    pdfBlob: null,
    pdfFileName: '',
    autoDownloaded: false,
  });

  const isRemoteUpdateRef = useRef(false);
  const isInitializedRef = useRef(false);
  const syncTimeoutRef = useRef<any>(null);
  const editingReportIdRef = useRef<string | null>(null);
  editingReportIdRef.current = editingReportId;
  const lastLocalEditTsRef = useRef<number>(0);
  const lastWakeFetchTsRef = useRef<number>(0);

  // Refs holding latest state so mobile minimize / visibilitychange flush always saves fresh data & photos
  const latestDraftRef = useRef({
    factoryInfo,
    sections,
    currentTab,
    activeSectionId,
  });
  useEffect(() => {
    latestDraftRef.current = {
      factoryInfo,
      sections,
      currentTab,
      activeSectionId,
    };
  }, [factoryInfo, sections, currentTab, activeSectionId]);

  // Sync auditor name into factory info on login
  useEffect(() => {
    if (currentUser?.name && !factoryInfo.auditorName) {
      setFactoryInfo((prev) => ({ ...prev, auditorName: currentUser.name }));
    }
  }, [currentUser]);

  // Load saved audits & (for Admin only) live drafts across all auditors
  useEffect(() => {
    if (currentUser?.email) {
      fetchAllAudits(currentUser.email).then((list) => setSavedAudits(list));
      if (isAuditorAdmin(currentUser.email)) {
        fetchAllActiveDraftsForAdmin(currentUser.email).then((list) => setAdminLiveDrafts(list));
      } else {
        setAdminLiveDrafts([]);
      }
    } else {
      setSavedAudits([]);
      setAdminLiveDrafts([]);
    }
  }, [currentUser]);

  // Refresh Admin live drafts whenever opening Saved Records tab
  useEffect(() => {
    if (currentUser?.email && currentTab === 'saved-audits') {
      fetchAllAudits(currentUser.email).then((list) => setSavedAudits(list));
      if (isAuditorAdmin(currentUser.email)) {
        fetchAllActiveDraftsForAdmin(currentUser.email).then((list) => setAdminLiveDrafts(list));
      }
    }
  }, [currentTab, currentUser]);

  const applyAuthoritativeDraft = (
    draftPayload: any,
    options?: { isAuthoritative?: boolean; persistToIdb?: boolean }
  ) => {
    if (!draftPayload) return;
    const isAuth = options?.isAuthoritative ?? true;
    const merged = mergeDraftPreservingPhotos(
      latestDraftRef.current.factoryInfo,
      latestDraftRef.current.sections,
      draftPayload,
      isAuth
    );
    const nextFactory = {
      ...DEFAULT_FACTORY_DATA,
      ...merged.factoryInfo,
    };
    const nextSections = normalizeAuditSections(merged.sections);
    isRemoteUpdateRef.current = true;
    const remoteTs = new Date(draftPayload.updatedAt || Date.now()).getTime();
    if (remoteTs > lastLocalEditTsRef.current) {
      lastLocalEditTsRef.current = remoteTs;
    }
    setFactoryInfo(nextFactory);
    setSections(nextSections);
    if (draftPayload.activeSectionId) {
      setActiveSectionId(draftPayload.activeSectionId);
    }
    if (options?.persistToIdb) {
      saveDraftToIndexedDB({
        ...draftPayload,
        factoryInfo: nextFactory,
        sections: nextSections,
        updatedAt: draftPayload.updatedAt || new Date().toISOString(),
      }).catch(() => {});
    }
    setTimeout(() => {
      isRemoteUpdateRef.current = false;
    }, 500);
  };

  // Initial local IndexedDB + Firestore + Server draft reconciliation (newest timestamp wins, all photos hydrated!)
  useEffect(() => {
    if (!currentUser) return;
    const normalizedEmail = currentUser.email.trim().toLowerCase();
    isInitializedRef.current = false;

    Promise.all([
      loadActiveDraftAsync().catch(() => null),
      fetchDraftFromFirestore(normalizedEmail).catch(() => null),
      fetchServerActiveDraft().catch(() => null),
    ])
      .then(([localDbDraft, firestoreDraft, serverDraft]) => {
        const candidates: Array<{ source: string; draft: any; ts: number; authoritative: boolean }> = [];

        const isDemoFactory = (d: any) =>
          d?.factoryInfo?.name === 'Northern Fashions Ltd.' ||
          d?.factoryInfo?.name === 'Apex Textile Mills Ltd.';

        if (localDbDraft && (localDbDraft.factoryInfo || localDbDraft.sections) && !isDemoFactory(localDbDraft)) {
          const ownerMatch =
            !localDbDraft.ownerEmail || localDbDraft.ownerEmail.trim().toLowerCase() === normalizedEmail;
          if (ownerMatch) {
            candidates.push({
              source: 'indexeddb',
              draft: localDbDraft,
              ts: new Date(localDbDraft.updatedAt || 0).getTime(),
              authoritative: false,
            });
          }
        }

        if (firestoreDraft && (firestoreDraft.factoryInfo || firestoreDraft.sections) && !isDemoFactory(firestoreDraft)) {
          candidates.push({
            source: 'firestore',
            draft: firestoreDraft,
            ts: new Date(firestoreDraft.updatedAt || 0).getTime(),
            authoritative: true,
          });
        }

        if (serverDraft && (serverDraft.factoryInfo || serverDraft.sections) && !isDemoFactory(serverDraft)) {
          const ownerMatch =
            !serverDraft.ownerEmail || serverDraft.ownerEmail.trim().toLowerCase() === normalizedEmail;
          if (ownerMatch) {
            candidates.push({
              source: 'server',
              draft: serverDraft,
              ts: new Date(serverDraft.updatedAt || 0).getTime(),
              authoritative: true,
            });
          }
        }

        if (candidates.length > 0 && !editingReportIdRef.current) {
          // Sort oldest to newest so newest wins cleanly while preserving local photos if needed
          candidates.sort((a, b) => a.ts - b.ts);
          const newest = candidates[candidates.length - 1];
          applyAuthoritativeDraft(newest.draft, {
            isAuthoritative: newest.authoritative,
            persistToIdb: newest.source !== 'indexeddb',
          });
        }
      })
      .finally(() => {
        isInitializedRef.current = true;
      });
  }, [currentUser]);

  // Real-time Server-Sent Events stream (when Express backend runs)
  useEffect(() => {
    if (!currentUser) return;
    const normalizedEmail = currentUser.email.trim().toLowerCase();

    const unsubscribe = subscribeToLiveDraftStream(
      (remoteDraft) => {
        if (editingReportIdRef.current) return;
        if (remoteDraft.ownerEmail && remoteDraft.ownerEmail.trim().toLowerCase() !== normalizedEmail) {
          return;
        }
        applyAuthoritativeDraft(remoteDraft, { isAuthoritative: true, persistToIdb: true });

        const sender = remoteDraft.lastUpdatedBy || 'Mobile Device';
        setSyncMessage(`Live update from ${sender}`);
        if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
        syncTimeoutRef.current = setTimeout(() => {
          setSyncMessage('Live Synced');
        }, 3000);
      },
      (connected) => {
        setIsLiveConnected(connected);
      }
    );

    return () => {
      unsubscribe();
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    };
  }, [currentUser]);

  // Real-time Firestore Cloud Sync scoped to current user email (with full photo hydration + clear propagation)
  useEffect(() => {
    if (!currentUser) return;

    const clientId = getClientDeviceId();
    const unsubscribeFirestore = subscribeToFirestoreDraft(
      (remoteDraft) => {
        if (editingReportIdRef.current) return;

        // If the other device cleared/started a new audit, mirror reset cleanly
        if (remoteDraft?.clearedAt && !remoteDraft.factoryInfo && !remoteDraft.sections) {
          isRemoteUpdateRef.current = true;
          setFactoryInfo({
            ...DEFAULT_FACTORY_DATA,
            auditorName: currentUser.name || '',
            auditorTitle: currentUser.role || '',
            auditDate: new Date().toISOString().split('T')[0],
            certifications: DEFAULT_CERTIFICATIONS.map((c) => ({ ...c, selected: false, photo: undefined })),
            factoryOutlookPhotos: [],
            contactEmails: [],
          });
          setSections(
            DEFAULT_AUDIT_SECTIONS.map((sec) => ({
              ...sec,
              checkpoints: sec.checkpoints.map((cp) => ({ ...cp, score: null, notes: '', images: [] })),
            }))
          );
          clearDraftFromIndexedDB().catch(() => {});
          try {
            localStorage.removeItem('qualitech_active_audit_v1');
          } catch {}
          setTimeout(() => {
            isRemoteUpdateRef.current = false;
          }, 500);
          return;
        }

        applyAuthoritativeDraft(remoteDraft, { isAuthoritative: true, persistToIdb: true });

        setSyncMessage('Live Mobile/PC Synced');
        if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
        syncTimeoutRef.current = setTimeout(() => {
          setSyncMessage('Live Synced');
        }, 3000);
      },
      clientId,
      currentUser.email
    );

    return () => {
      unsubscribeFirestore();
    };
  }, [currentUser]);

  // Auto-save live draft on changes ONLY when working in own live audit workspace (not when editing a saved report)
  useEffect(() => {
    if (!currentUser || !isInitializedRef.current || isRemoteUpdateRef.current || editingReportId) {
      return;
    }

    lastLocalEditTsRef.current = Date.now();
    setIsSaved(false);
    const timer = setTimeout(() => {
      saveActiveDraft({
        factoryInfo,
        sections,
        currentTab,
        activeSectionId,
      });
      setIsSaved(true);
    }, 300);
    return () => clearTimeout(timer);
  }, [factoryInfo, sections, currentTab, activeSectionId, currentUser, editingReportId]);

  // Instant flush on mobile minimize + foreground wake-up cloud re-sync on visibility/focus/online
  useEffect(() => {
    if (!currentUser) return;
    const flushNow = () => {
      if (!isInitializedRef.current || editingReportIdRef.current) return;
      saveActiveDraftImmediate(latestDraftRef.current).catch(() => {});
    };

    const pullLatestOnWake = async () => {
      if (!isInitializedRef.current || editingReportIdRef.current || !currentUser?.email) return;
      const now = Date.now();
      if (now - lastWakeFetchTsRef.current < 1500) return;
      lastWakeFetchTsRef.current = now;
      try {
        const [firestoreDraft, serverDraft] = await Promise.all([
          fetchDraftFromFirestore(currentUser.email).catch(() => null),
          fetchServerActiveDraft().catch(() => null),
        ]);
        const remoteDraft =
          firestoreDraft && serverDraft
            ? new Date(firestoreDraft.updatedAt || 0).getTime() >= new Date(serverDraft.updatedAt || 0).getTime()
              ? firestoreDraft
              : serverDraft
            : firestoreDraft || serverDraft;

        if (remoteDraft && !editingReportIdRef.current) {
          const remoteTs = new Date(remoteDraft.updatedAt || 0).getTime();
          if (remoteTs > lastLocalEditTsRef.current) {
            applyAuthoritativeDraft(remoteDraft, { isAuthoritative: true, persistToIdb: true });
            setSyncMessage('Live Mobile/PC Synced');
            if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
            syncTimeoutRef.current = setTimeout(() => {
              setSyncMessage('Live Synced');
            }, 2500);
          }
        }
      } catch {
        // ignore transient network errors on wake
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        flushNow();
      } else if (document.visibilityState === 'visible') {
        pullLatestOnWake();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', pullLatestOnWake);
    window.addEventListener('online', pullLatestOnWake);
    window.addEventListener('pagehide', flushNow);
    window.addEventListener('beforeunload', flushNow);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', pullLatestOnWake);
      window.removeEventListener('online', pullLatestOnWake);
      window.removeEventListener('pagehide', flushNow);
      window.removeEventListener('beforeunload', flushNow);
    };
  }, [currentUser]);

  const handleSyncCheckpoint = async (checkpointId: string, updatedSections: AuditSection[]) => {
    setSyncingCheckpointId(checkpointId);
    lastLocalEditTsRef.current = Date.now();
    setSyncMessage('Saving Draft & Syncing Live...');
    if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);

    try {
      if (!editingReportIdRef.current) {
        const res = await saveActiveDraftImmediate({
          factoryInfo: latestDraftRef.current.factoryInfo,
          sections: updatedSections,
          currentTab: latestDraftRef.current.currentTab,
          activeSectionId: latestDraftRef.current.activeSectionId,
        });
        setIsSaved(true);
        setSyncMessage(res.ok ? 'Draft Saved & Live Synced' : 'Saved Locally (Retrying Cloud)');
      } else if (!editingReportIdRef.current.startsWith('LIVE-')) {
        const recalculated = calculateAuditReport(
          latestDraftRef.current.factoryInfo,
          updatedSections,
          currentReport?.id,
          currentReport?.createdAt
        );
        await handleSaveReportDirect({
          ...recalculated,
          executiveSummary: customExecutiveSummary ?? recalculated.executiveSummary,
          auditorEmail: currentReport?.auditorEmail || currentUser?.email?.toLowerCase(),
          submittedAt: currentReport?.submittedAt,
          capItems: currentReport?.capItems,
          capUpdatedAt: currentReport?.capUpdatedAt,
          dismissedCapIds: currentReport?.dismissedCapIds,
        });
      }
    } catch {
      setSyncMessage('Saved Locally');
    } finally {
      setSyncingCheckpointId(null);
      syncTimeoutRef.current = setTimeout(() => {
        setSyncMessage('Live Synced');
      }, 3000);
    }
  };

  const handleOpenPhotoAction = (
    evidence: CheckpointEvidence,
    sourceLocation: PhotoLocation
  ) => {
    setPhotoActionState({
      isOpen: true,
      evidence,
      sourceLocation,
    });
  };

  const handleExecutePhotoAction = (
    action: 'move' | 'copy',
    source: PhotoLocation,
    target: PhotoLocation,
    evidence: CheckpointEvidence
  ) => {
    const newEvidence: CheckpointEvidence = {
      ...evidence,
      id: action === 'copy' ? `photo-${Date.now()}-${Math.random().toString(36).substring(5)}` : evidence.id,
      timestamp: new Date().toISOString(),
    };

    let updatedFactory = { ...factoryInfo };
    let updatedSections = [...sections];

    if (target.type === 'outlook') {
      const current = updatedFactory.factoryOutlookPhotos || [];
      updatedFactory.factoryOutlookPhotos = [...current, newEvidence];
    } else if (target.type === 'opening') {
      updatedFactory.openingMeetingPhoto = newEvidence.dataUrl;
      updatedFactory.openingMeetingPhotoTimestamp = newEvidence.timestamp;
    } else if (target.type === 'checkpoint') {
      updatedSections = updatedSections.map((sec) => ({
        ...sec,
        checkpoints: sec.checkpoints.map((cp) => {
          if (cp.id === target.id) {
            return {
              ...cp,
              images: [...cp.images, newEvidence],
            };
          }
          return cp;
        }),
      }));
    }

    if (action === 'move') {
      if (source.type === 'outlook') {
        updatedFactory.factoryOutlookPhotos = (updatedFactory.factoryOutlookPhotos || []).filter(
          (p) => p.id !== evidence.id
        );
      } else if (source.type === 'opening') {
        updatedFactory.openingMeetingPhoto = undefined;
        updatedFactory.openingMeetingPhotoTimestamp = undefined;
      } else if (source.type === 'checkpoint') {
        updatedSections = updatedSections.map((sec) => ({
          ...sec,
          checkpoints: sec.checkpoints.map((cp) => {
            if (cp.id === source.id) {
              return {
                ...cp,
                images: cp.images.filter((img) => img.id !== evidence.id),
              };
            }
            return cp;
          }),
        }));
      }
    }

    setFactoryInfo(updatedFactory);
    setSections(updatedSections);
    if (!editingReportId) {
      saveActiveDraftImmediate({
        factoryInfo: updatedFactory,
        sections: updatedSections,
        currentTab,
        activeSectionId,
      });
    }
    setSyncMessage(`Photo ${action === 'copy' ? 'Copied' : 'Transferred'}`);
    setTimeout(() => setSyncMessage('Live Synced'), 2500);
  };

  const handleManualSync = async () => {
    setSyncMessage('Checking cloud updates...');
    try {
      const [firestoreDraft, serverDraft, refreshedAudits] = await Promise.all([
        currentUser?.email ? fetchDraftFromFirestore(currentUser.email).catch(() => null) : Promise.resolve(null),
        fetchServerActiveDraft().catch(() => null),
        currentUser?.email ? fetchAllAudits(currentUser.email).catch(() => null) : Promise.resolve(null),
      ]);

      if (refreshedAudits) {
        setSavedAudits(refreshedAudits);
      }
      if (currentUser?.email && isAuditorAdmin(currentUser.email)) {
        fetchAllActiveDraftsForAdmin(currentUser.email)
          .then((list) => setAdminLiveDrafts(list))
          .catch(() => {});
      }

      const remoteDraft =
        firestoreDraft && serverDraft
          ? new Date(firestoreDraft.updatedAt || 0).getTime() >= new Date(serverDraft.updatedAt || 0).getTime()
            ? firestoreDraft
            : serverDraft
          : firestoreDraft || serverDraft;

      if (remoteDraft && !editingReportIdRef.current) {
        applyAuthoritativeDraft(remoteDraft, { isAuthoritative: true, persistToIdb: true });
        setSyncMessage('Cloud Data & Photos Synced');
      } else {
        setSyncMessage('Cloud is up to date');
      }
    } catch {
      setSyncMessage('Sync check completed');
    }
    setTimeout(() => setSyncMessage('Live Synced'), 2500);
  };

  // Live Score & Completion calculations
  const { totalCheckpoints, evaluatedCount, currentPercentage, hasCritical } = useMemo(() => {
    let totalCp = 0;
    let evalCp = 0;
    let earnedPoints = 0;
    let maxPoints = 0;
    let criticalCount = 0;

    sections.forEach((sec) => {
      sec.checkpoints.forEach((cp) => {
        totalCp++;
        if (cp.score && cp.score !== 'na') {
          evalCp++;
          if (cp.score === 'critical') {
            criticalCount++;
          } else if (cp.score === 'major') {
            earnedPoints += 3;
          } else if (cp.score === 'minor') {
            earnedPoints += 7;
          } else if (cp.score === 'none') {
            earnedPoints += 10;
          }
          maxPoints += 10;
        } else if (cp.score === 'na') {
          evalCp++;
        }
      });
    });

    const percent = maxPoints > 0 ? Math.round((earnedPoints / maxPoints) * 1000) / 10 : 0;
    return {
      totalCheckpoints: totalCp,
      evaluatedCount: evalCp,
      currentPercentage: percent,
      hasCritical: criticalCount > 0,
    };
  }, [sections]);

  // Active Report object
  const activeReportData: AuditReportData = useMemo(() => {
    const computed = calculateAuditReport(
      factoryInfo,
      sections,
      currentReport?.id,
      currentReport?.createdAt
    );
    return {
      ...computed,
      executiveSummary: customExecutiveSummary ?? computed.executiveSummary,
      auditorEmail: currentReport?.auditorEmail || currentUser?.email?.toLowerCase(),
      submittedAt: currentReport?.submittedAt,
      capItems: currentReport?.capItems,
      capUpdatedAt: currentReport?.capUpdatedAt,
      dismissedCapIds: currentReport?.dismissedCapIds,
    };
  }, [factoryInfo, sections, currentReport, currentUser, customExecutiveSummary]);

  const activeCapItems = useMemo(() => buildCapItemsFromReport(activeReportData), [activeReportData]);
  const openCapCount = useMemo(
    () => activeCapItems.filter((c) => c.status !== 'closed').length,
    [activeCapItems]
  );

  const handleLoginSuccess = (user: AuditorUser) => {
    setCurrentUser(user);
    setEditingReportId(null);
    setCurrentReport(null);
    setCustomExecutiveSummary(null);
    setFactoryInfo((prev) => ({
      ...prev,
      auditorName: user.name || prev.auditorName || '',
      auditorTitle: (user.role || prev.auditorTitle || '').replace(/\s*\(Admin\)/gi, '').trim(),
    }));
  };

  const handleLogout = () => {
    if (!editingReportId) {
      saveActiveDraftImmediate(latestDraftRef.current);
    }
    logoutAuditor();
    setEditingReportId(null);
    setCurrentReport(null);
    setCustomExecutiveSummary(null);
    setCurrentUser(null);
  };

  const triggerOpenEmailModal = async (reportToSend: AuditReportData, autoDownload: boolean) => {
    try {
      const { blob, fileName } = await generateAuditPdfBlob(reportToSend);
      if (autoDownload) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      setEmailModalState({
        isOpen: true,
        report: reportToSend,
        pdfBlob: blob,
        pdfFileName: fileName,
        autoDownloaded: autoDownload,
      });
    } catch (err) {
      console.error('Error preparing PDF for dispatch', err);
      setEmailModalState({
        isOpen: true,
        report: reportToSend,
        pdfBlob: null,
        pdfFileName: '',
        autoDownloaded: false,
      });
    }
  };

  const handleSubmitAndGenerateReport = async () => {
    const baseReport = calculateAuditReport(
      factoryInfo,
      sections,
      currentReport?.id,
      currentReport?.createdAt
    );
    const derivedCaps = buildCapItemsFromReport({
      ...baseReport,
      capItems: currentReport?.capItems,
      dismissedCapIds: currentReport?.dismissedCapIds,
    });

    const submittedReport: AuditReportData = {
      ...baseReport,
      executiveSummary: customExecutiveSummary ?? baseReport.executiveSummary,
      auditorEmail: currentReport?.auditorEmail || currentUser?.email?.trim().toLowerCase() || '',
      submittedAt: currentReport?.submittedAt || new Date().toISOString(),
      capItems: derivedCaps,
      capUpdatedAt: currentReport?.capUpdatedAt || new Date().toISOString(),
      dismissedCapIds: currentReport?.dismissedCapIds,
    };

    setCurrentReport(submittedReport);
    setEditingReportId(submittedReport.id);
    setCurrentTab('report');
    window.scrollTo({ top: 0, behavior: 'smooth' });

    const saved = await saveAuditReport(submittedReport);
    setSavedAudits((prev) => {
      const idx = prev.findIndex((a) => a.id === saved.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = saved;
        return copy;
      }
      return [saved, ...prev];
    });

    // Check if contact emails exist -> auto-generate & download PDF and open dispatch dialog
    const hasContactEmails =
      (factoryInfo.contactEmails && factoryInfo.contactEmails.length > 0) ||
      Boolean(factoryInfo.contactEmail && factoryInfo.contactEmail.trim());

    if (hasContactEmails) {
      await triggerOpenEmailModal(saved, true);
    }
  };

  const handleSaveReportDirect = async (report: AuditReportData) => {
    const reportWithOwner: AuditReportData = {
      ...report,
      auditorEmail: report.auditorEmail || currentUser?.email?.trim().toLowerCase() || '',
    };
    const saved = await saveAuditReport(reportWithOwner);
    setCurrentReport(saved);
    setEditingReportId(saved.id);
    setSavedAudits((prev) => {
      const idx = prev.findIndex((a) => a.id === saved.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = saved;
        return copy;
      }
      return [saved, ...prev];
    });
    setSyncMessage('Report Updated & Synced');
    setTimeout(() => setSyncMessage('Live Synced'), 2500);
  };

  const handleUpdateReportFields = async (updatedReport: AuditReportData) => {
    if (updatedReport.executiveSummary !== undefined) {
      setCustomExecutiveSummary(updatedReport.executiveSummary);
    }
    await handleSaveReportDirect(updatedReport);
  };

  const handleAddFindingToReport = async (payload: {
    sectionId: string;
    title: string;
    score: Exclude<ScoreOption, null>;
    notes: string;
  }) => {
    const updatedSections = sections.map((sec) => {
      if (sec.id !== payload.sectionId) return sec;
      const newCp = {
        id: `cp-admin-${Date.now()}`,
        code: `${sec.code || 'ADM'}-${sec.checkpoints.length + 1}`,
        title: payload.title,
        description: payload.notes || 'Added during technical review.',
        score: payload.score,
        notes: payload.notes,
        images: [],
        isCustom: true,
      };
      return {
        ...sec,
        checkpoints: [...sec.checkpoints, newCp],
      };
    });

    setSections(updatedSections);
    const recalculated = calculateAuditReport(
      factoryInfo,
      updatedSections,
      currentReport?.id,
      currentReport?.createdAt
    );
    const nextReport: AuditReportData = {
      ...recalculated,
      executiveSummary: customExecutiveSummary ?? recalculated.executiveSummary,
      auditorEmail: currentReport?.auditorEmail || currentUser?.email?.toLowerCase(),
      submittedAt: currentReport?.submittedAt,
      dismissedCapIds: currentReport?.dismissedCapIds,
      capItems: buildCapItemsFromReport({
        ...recalculated,
        capItems: currentReport?.capItems,
        dismissedCapIds: currentReport?.dismissedCapIds,
      }),
      capUpdatedAt: new Date().toISOString(),
    };
    await handleSaveReportDirect(nextReport);
  };

  const handleRemoveCheckpointFromReport = async (sectionId: string, checkpointId: string) => {
    const updatedSections = sections.map((sec) => {
      if (sec.id !== sectionId) return sec;
      return {
        ...sec,
        checkpoints: sec.checkpoints
          .map((cp) => {
            if (cp.id !== checkpointId) return cp;
            if (cp.isCustom) return null;
            return {
              ...cp,
              score: null,
              notes: '',
              images: [],
            };
          })
          .filter(Boolean) as AuditSection['checkpoints'],
      };
    });

    setSections(updatedSections);
    const recalculated = calculateAuditReport(
      factoryInfo,
      updatedSections,
      currentReport?.id,
      currentReport?.createdAt
    );
    const nextDismissed = Array.from(
      new Set([...(currentReport?.dismissedCapIds || []), checkpointId, `cap-${checkpointId}`])
    );
    const nextReport: AuditReportData = {
      ...recalculated,
      executiveSummary: customExecutiveSummary ?? recalculated.executiveSummary,
      auditorEmail: currentReport?.auditorEmail || currentUser?.email?.toLowerCase(),
      submittedAt: currentReport?.submittedAt,
      dismissedCapIds: nextDismissed,
      capItems: buildCapItemsFromReport({
        ...recalculated,
        capItems: (currentReport?.capItems || []).filter(
          (c) => c.checkpointId !== checkpointId && c.id !== checkpointId
        ),
        dismissedCapIds: nextDismissed,
      }),
      capUpdatedAt: new Date().toISOString(),
    };
    await handleSaveReportDirect(nextReport);
  };

  const handleUpdateCapItems = async (updatedCapItems: CapItem[], dismissedCapIds?: string[]) => {
    const updatedReport: AuditReportData = {
      ...activeReportData,
      auditorEmail: activeReportData.auditorEmail || currentUser?.email?.trim().toLowerCase() || '',
      capItems: updatedCapItems,
      dismissedCapIds: dismissedCapIds ?? activeReportData.dismissedCapIds,
      capUpdatedAt: new Date().toISOString(),
    };
    setCurrentReport(updatedReport);
    const saved = await saveAuditReport(updatedReport);
    setSavedAudits((prev) => {
      const idx = prev.findIndex((a) => a.id === saved.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = saved;
        return copy;
      }
      return [saved, ...prev];
    });
  };

  const handleDeleteAudit = async (id: string) => {
    await deleteAuditReport(id, currentUser?.email);
    setSavedAudits((prev) => prev.filter((a) => a.id !== id));
    if (editingReportId === id) {
      setEditingReportId(null);
      setCurrentReport(null);
      setCustomExecutiveSummary(null);
    }
  };

  const handleLoadAudit = (audit: AuditReportData) => {
    setEditingReportId(audit.id);
    setCurrentReport(audit);
    setCustomExecutiveSummary(audit.executiveSummary || null);
    setFactoryInfo(audit.factoryInfo);
    setSections(normalizeAuditSections(audit.sections));
    setCurrentTab('report');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleEditAudit = (audit: AuditReportData) => {
    setEditingReportId(audit.id);
    setCurrentReport(audit);
    setCustomExecutiveSummary(audit.executiveSummary || null);
    setFactoryInfo(audit.factoryInfo);
    setSections(normalizeAuditSections(audit.sections));
    setCurrentTab('audit');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenCapForAudit = (audit: AuditReportData) => {
    setEditingReportId(audit.id);
    setCurrentReport(audit);
    setCustomExecutiveSummary(audit.executiveSummary || null);
    setFactoryInfo(audit.factoryInfo);
    setSections(normalizeAuditSections(audit.sections));
    setCurrentTab('cap');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleInspectLiveDraft = async (draft: any) => {
    const hydrated = await hydratePayloadPhotos(draft);
    const draftSections = normalizeAuditSections(hydrated.sections || DEFAULT_AUDIT_SECTIONS);
    const draftFactory = {
      ...DEFAULT_FACTORY_DATA,
      ...(hydrated.factoryInfo || {}),
    };
    const syntheticId = `LIVE-${(hydrated.ownerEmail || 'AUDITOR').replace(/[^a-zA-Z0-9]/g, '_').toUpperCase()}`;
    const liveReport = calculateAuditReport(draftFactory, draftSections, syntheticId, hydrated.updatedAt);
    liveReport.auditorEmail = hydrated.ownerEmail || '';
    setEditingReportId(syntheticId);
    setCurrentReport(liveReport);
    setCustomExecutiveSummary(null);
    setFactoryInfo(draftFactory);
    setSections(draftSections);
    setCurrentTab('report');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleExitSavedReportWorkspace = async () => {
    setEditingReportId(null);
    setCurrentReport(null);
    setCustomExecutiveSummary(null);
    setCurrentTab('pre-audit');

    if (currentUser?.email) {
      const normalized = currentUser.email.trim().toLowerCase();
      const [cloudDraft, idbDraft] = await Promise.all([
        fetchDraftFromFirestore(normalized).catch(() => null),
        loadActiveDraftAsync().catch(() => null),
      ]);
      const chosen =
        cloudDraft && idbDraft
          ? new Date(cloudDraft.updatedAt || 0).getTime() >= new Date(idbDraft.updatedAt || 0).getTime()
            ? cloudDraft
            : idbDraft
          : cloudDraft || idbDraft;
      if (chosen && (chosen.factoryInfo || chosen.sections)) {
        isRemoteUpdateRef.current = true;
        setFactoryInfo({
          ...DEFAULT_FACTORY_DATA,
          ...(chosen.factoryInfo || {}),
        });
        setSections(normalizeAuditSections(chosen.sections || DEFAULT_AUDIT_SECTIONS));
        setTimeout(() => {
          isRemoteUpdateRef.current = false;
        }, 400);
        return;
      }
    }

    setFactoryInfo({
      ...DEFAULT_FACTORY_DATA,
      auditorName: currentUser?.name || '',
      auditorTitle: currentUser?.role || '',
      auditDate: new Date().toISOString().split('T')[0],
      certifications: DEFAULT_CERTIFICATIONS.map((c) => ({ ...c, selected: false, photo: undefined })),
      factoryOutlookPhotos: [],
      contactEmails: [],
    });
    setSections(
      DEFAULT_AUDIT_SECTIONS.map((sec) => ({
        ...sec,
        checkpoints: sec.checkpoints.map((cp) => ({ ...cp, score: null, notes: '', images: [] })),
      }))
    );
  };

  const handleStartNewAudit = () => {
    const freshFactory: FactoryInfo = {
      ...DEFAULT_FACTORY_DATA,
      auditorName: currentUser?.name || '',
      auditorTitle: currentUser?.role || '',
      auditDate: new Date().toISOString().split('T')[0],
      auditReportNo: '',
      factoryRegistrationNo: '',
      facilities: [],
      certifications: DEFAULT_CERTIFICATIONS.map((c) => ({ ...c, selected: false, photo: undefined })),
      factoryOutlookPhotos: [],
      contactEmails: [],
    };
    const freshSections = DEFAULT_AUDIT_SECTIONS.map((sec) => ({
      ...sec,
      checkpoints: sec.checkpoints.map((cp) => ({
        ...cp,
        score: null,
        notes: '',
        images: [],
      })),
    }));

    setEditingReportId(null);
    setCustomExecutiveSummary(null);
    setFactoryInfo(freshFactory);
    setSections(freshSections);
    setCurrentReport(null);
    setCurrentTab('pre-audit');
    saveActiveDraft(null, true);
    clearFirestoreDraft(currentUser?.email, getClientDeviceId()).catch(() => {});
    setSyncMessage('New Audit Initialized');
    setTimeout(() => setSyncMessage('Live Synced'), 2000);
  };

  const handleClearAllData = async () => {
    const cleanFactory: FactoryInfo = {
      ...DEFAULT_FACTORY_DATA,
      auditorName: currentUser?.name || '',
      auditorTitle: currentUser?.role || '',
      auditDate: new Date().toISOString().split('T')[0],
      auditReportNo: '',
      factoryRegistrationNo: '',
      facilities: [],
      certifications: DEFAULT_CERTIFICATIONS.map((c) => ({ ...c, selected: false, photo: undefined })),
      factoryOutlookPhotos: [],
      contactEmails: [],
    };

    const cleanSections = DEFAULT_AUDIT_SECTIONS.map((sec) => ({
      ...sec,
      checkpoints: sec.checkpoints.map((cp) => ({
        ...cp,
        score: null,
        notes: '',
        images: [],
      })),
    }));

    setEditingReportId(null);
    setCustomExecutiveSummary(null);
    setFactoryInfo(cleanFactory);
    setSections(cleanSections);
    setCurrentReport(null);
    setCurrentTab('pre-audit');

    try {
      localStorage.removeItem('qualitech_active_audit_v1');
    } catch {}

    try {
      await clearDraftFromIndexedDB();
    } catch {}

    try {
      await fetch('/api/active-draft', { method: 'DELETE' });
    } catch {}

    try {
      await clearFirestoreDraft(currentUser?.email, getClientDeviceId());
    } catch {}

    setSyncMessage('All Data Cleared & Reset');
    setTimeout(() => setSyncMessage('Live Synced'), 2500);
  };

  // If not authenticated, render Login Screen with Update Toast
  if (!currentUser) {
    return (
      <>
        <LoginScreen onLoginSuccess={handleLoginSuccess} />
        <UpdateNotificationToast
          updateAvailable={updateAvailable}
          newVersion={newVersion}
          isUpdating={isUpdating}
          onApplyUpdate={applyUpdate}
          onDismiss={dismissUpdate}
        />
      </>
    );
  }

  const handleDeletePreviewImage = (imageId: string) => {
    const updatedSections = sections.map((sec) => ({
      ...sec,
      checkpoints: sec.checkpoints.map((cp) => ({
        ...cp,
        images: cp.images.filter(
          (img) => img.id !== imageId && (!activePreviewImage || img.dataUrl !== activePreviewImage.dataUrl)
        ),
      })),
    }));

    const isOpening =
      imageId === 'opening' ||
      Boolean(activePreviewImage && factoryInfo.openingMeetingPhoto === activePreviewImage.dataUrl);

    const updatedFactory: FactoryInfo = {
      ...factoryInfo,
      openingMeetingPhoto: isOpening ? undefined : factoryInfo.openingMeetingPhoto,
      openingMeetingPhotoTimestamp: isOpening ? undefined : factoryInfo.openingMeetingPhotoTimestamp,
      openingMeetingPhotoConfirmed: isOpening ? undefined : factoryInfo.openingMeetingPhotoConfirmed,
      openingMeetingPhotoAspectRatio: isOpening ? undefined : factoryInfo.openingMeetingPhotoAspectRatio,
      factoryOutlookPhotos: factoryInfo.factoryOutlookPhotos?.filter(
        (p) => p.id !== imageId && (!activePreviewImage || p.dataUrl !== activePreviewImage.dataUrl)
      ),
      certifications: factoryInfo.certifications.map((c) =>
        c.photo && activePreviewImage && c.photo === activePreviewImage.dataUrl
          ? { ...c, photo: undefined, photoTimestamp: undefined }
          : c
      ),
    };

    setSections(updatedSections);
    setFactoryInfo(updatedFactory);
    setActivePreviewImage(null);
    if (!editingReportId) {
      saveActiveDraftImmediate({
        factoryInfo: updatedFactory,
        sections: updatedSections,
        currentTab,
        activeSectionId,
      });
    }
    setSyncMessage('Photo Deleted');
    setTimeout(() => setSyncMessage('Live Synced'), 2500);
  };

  return (
    <DeviceSimulatorWrapper viewMode={viewMode} onViewModeChange={setViewMode}>
      {/* Universal Top Header */}
      <Header
        currentTab={currentTab}
        onTabChange={setCurrentTab}
        user={currentUser}
        onLogout={handleLogout}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        evaluatedCount={evaluatedCount}
        totalCheckpoints={totalCheckpoints}
        currentPercentage={currentPercentage}
        hasCritical={hasCritical}
        isSaved={isSaved}
        onOpenShareModal={() => setIsShareModalOpen(true)}
        sections={sections}
        activeSectionId={activeSectionId}
        onSelectSection={setActiveSectionId}
        isLiveConnected={isLiveConnected}
        syncMessage={syncMessage}
        onManualSync={handleManualSync}
        updateAvailable={updateAvailable}
        onApplyUpdate={applyUpdate}
        openCapCount={openCapCount}
        totalCapCount={activeCapItems.length}
      />

      {/* Main Tab Content */}
      <main className="flex-1 w-full max-w-[1720px] mx-auto px-3 sm:px-6 lg:px-8 xl:px-10 py-4 sm:py-6">
        {editingReportId && currentTab !== 'saved-audits' && (
          <div className="mb-4 bg-indigo-900 text-white rounded-2xl px-4 py-2.5 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-indigo-700 font-mono font-bold text-[10px] uppercase">
                {editingReportId.startsWith('LIVE-') ? 'Live Draft Preview' : 'Saved Report Mode'}
              </span>
              <span className="font-bold">
                {factoryInfo.name || 'Factory Report'}
              </span>
              {currentReport?.auditorEmail && (
                <span className="text-indigo-200">
                  (Auditor: {currentReport.auditorEmail})
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {!editingReportId.startsWith('LIVE-') && (
                <button
                  type="button"
                  onClick={() => handleSaveReportDirect(activeReportData)}
                  className="px-3 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-extrabold cursor-pointer transition-colors"
                >
                  Save Changes to Cloud
                </button>
              )}
              <button
                type="button"
                onClick={handleExitSavedReportWorkspace}
                className="px-3 py-1 rounded-lg bg-white/15 hover:bg-white/25 text-white font-bold cursor-pointer transition-colors"
              >
                Return to My Workspace
              </button>
            </div>
          </div>
        )}

        {currentTab === 'pre-audit' && (
          <PreAuditForm
            factoryInfo={factoryInfo}
            onChange={setFactoryInfo}
            onProceedToAudit={() => setCurrentTab('audit')}
            onOpenPreviewImage={(evidence) => setActivePreviewImage(evidence)}
            onOpenPhotoAction={handleOpenPhotoAction}
            onClearAllData={handleClearAllData}
            onStartNewAudit={handleStartNewAudit}
          />
        )}

        {currentTab === 'audit' && (
          <AuditSectionView
            sections={sections}
            onUpdateSections={setSections}
            onSubmitAndGenerateReport={handleSubmitAndGenerateReport}
            onOpenPreviewImage={setActivePreviewImage}
            onOpenPhotoAction={handleOpenPhotoAction}
            onSyncCheckpoint={handleSyncCheckpoint}
            syncingCheckpointId={syncingCheckpointId}
            activeSectionId={activeSectionId}
            onSelectSection={setActiveSectionId}
          />
        )}

        {currentTab === 'report' && (
          <ReportView
            report={activeReportData}
            currentUser={currentUser}
            onEditSection={(sectionId) => {
              setActiveSectionId(sectionId);
              setCurrentTab('audit');
            }}
            onEditPreAudit={() => setCurrentTab('pre-audit')}
            onSaveReport={handleSaveReportDirect}
            onUpdateReportFields={handleUpdateReportFields}
            onAddFindingToReport={handleAddFindingToReport}
            onRemoveCheckpointFromReport={handleRemoveCheckpointFromReport}
            onOpenPreviewImage={setActivePreviewImage}
            onOpenShareModal={() => setIsShareModalOpen(true)}
            onOpenCap={() => setCurrentTab('cap')}
            onEmailReport={() => triggerOpenEmailModal(activeReportData, true)}
          />
        )}

        {currentTab === 'cap' && (
          <CapView
            report={activeReportData}
            currentUser={currentUser}
            onUpdateCapItems={handleUpdateCapItems}
            onBackToReport={() => setCurrentTab('report')}
            onOpenPreviewImage={setActivePreviewImage}
          />
        )}

        {currentTab === 'saved-audits' && (
          <SavedAuditsView
            audits={savedAudits}
            liveDrafts={adminLiveDrafts}
            onLoadAudit={handleLoadAudit}
            onEditAudit={handleEditAudit}
            onOpenCap={handleOpenCapForAudit}
            onInspectLiveDraft={handleInspectLiveDraft}
            onDeleteAudit={handleDeleteAudit}
            onStartNewAudit={handleStartNewAudit}
            currentUser={currentUser}
          />
        )}
      </main>

      {/* Image Preview Lightbox */}
      <ImagePreviewModal
        image={activePreviewImage}
        onClose={() => setActivePreviewImage(null)}
        onDelete={handleDeletePreviewImage}
        onMove={(img) =>
          handleOpenPhotoAction(img, {
            type: 'outlook',
            id: img.id,
            title: img.caption || 'Photo Evidence',
          })
        }
        onCopy={(img) =>
          handleOpenPhotoAction(img, {
            type: 'outlook',
            id: img.id,
            title: img.caption || 'Photo Evidence',
          })
        }
      />

      {/* Universal Photo Action Modal */}
      <PhotoActionModal
        isOpen={photoActionState.isOpen}
        evidence={photoActionState.evidence}
        sourceLocation={photoActionState.sourceLocation}
        sections={sections}
        onConfirmAction={handleExecutePhotoAction}
        onClose={() =>
          setPhotoActionState({
            isOpen: false,
            evidence: null,
            sourceLocation: null,
          })
        }
      />

      {/* Email PDF Dispatch Modal */}
      <EmailDispatchModal
        isOpen={emailModalState.isOpen}
        report={emailModalState.report}
        pdfBlob={emailModalState.pdfBlob}
        pdfFileName={emailModalState.pdfFileName}
        autoDownloaded={emailModalState.autoDownloaded}
        onClose={() =>
          setEmailModalState((prev) => ({
            ...prev,
            isOpen: false,
          }))
        }
      />

      {/* Share & Download PWA Modal */}
      <ShareAppModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
      />

      {/* Floating In-App Live Update Notification Toast */}
      <UpdateNotificationToast
        updateAvailable={updateAvailable}
        newVersion={newVersion}
        isUpdating={isUpdating}
        onApplyUpdate={applyUpdate}
        onDismiss={dismissUpdate}
      />
    </DeviceSimulatorWrapper>
  );
}
