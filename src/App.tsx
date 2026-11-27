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
  const [currentReport, setCurrentReport] = useState<AuditReportData | null>(null);
  const [activePreviewImage, setActivePreviewImage] = useState<CheckpointEvidence | null>(null);
  const [isSaved, setIsSaved] = useState(true);
  const [isLiveConnected, setIsLiveConnected] = useState(true);
  const [syncMessage, setSyncMessage] = useState<string>('Live Synced');
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

  // Load saved audits on startup (Admin sees all; regular auditor sees only their own audits for CAP)
  useEffect(() => {
    if (currentUser?.email) {
      fetchAllAudits(currentUser.email).then((list) => setSavedAudits(list));
    } else {
      setSavedAudits([]);
    }
  }, [currentUser]);

  // Initial local IndexedDB + cloud draft retrieval on mount/login (preserving all photos!)
  useEffect(() => {
    if (!currentUser) return;
    const normalizedEmail = currentUser.email.trim().toLowerCase();

    // 1. Load high-capacity IndexedDB draft (500+ photos)
    loadActiveDraftAsync().then((localDbDraft) => {
      if (localDbDraft && (localDbDraft.factoryInfo || localDbDraft.sections)) {
        const ownerMatch =
          !localDbDraft.ownerEmail || localDbDraft.ownerEmail.trim().toLowerCase() === normalizedEmail;
        if (
          ownerMatch &&
          localDbDraft.factoryInfo?.name !== 'Northern Fashions Ltd.' &&
          localDbDraft.factoryInfo?.name !== 'Apex Textile Mills Ltd.'
        ) {
          setFactoryInfo((prev) => {
            const merged = mergeDraftPreservingPhotos(prev, sections, localDbDraft);
            return {
              ...DEFAULT_FACTORY_DATA,
              ...merged.factoryInfo,
            };
          });
          if (localDbDraft.sections && Array.isArray(localDbDraft.sections)) {
            setSections((prevSec) =>
              normalizeAuditSections(
                mergeDraftPreservingPhotos(factoryInfo, prevSec, localDbDraft).sections
              )
            );
          }
          if (localDbDraft.activeSectionId) {
            setActiveSectionId(localDbDraft.activeSectionId);
          }
        }
      }
    });

    // 2. Fetch server draft for live sync without clobbering IndexedDB photos
    fetchServerActiveDraft()
      .then((serverDraft) => {
        if (serverDraft) {
          if (
            serverDraft.factoryInfo?.name === 'Northern Fashions Ltd.' ||
            serverDraft.factoryInfo?.name === 'Apex Textile Mills Ltd.'
          ) {
            fetch('/api/active-draft', { method: 'DELETE' }).catch(() => {});
            return;
          }
          const ownerMatch =
            !serverDraft.ownerEmail || serverDraft.ownerEmail.trim().toLowerCase() === normalizedEmail;
          if (!ownerMatch) return;

          isRemoteUpdateRef.current = true;
          setFactoryInfo((prevFactory) => {
            const merged = mergeDraftPreservingPhotos(prevFactory, latestDraftRef.current.sections, serverDraft);
            return { ...DEFAULT_FACTORY_DATA, ...merged.factoryInfo };
          });
          setSections((prevSections) => {
            const merged = mergeDraftPreservingPhotos(latestDraftRef.current.factoryInfo, prevSections, serverDraft);
            return normalizeAuditSections(merged.sections);
          });
          setTimeout(() => {
            isRemoteUpdateRef.current = false;
          }, 500);
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
        if (remoteDraft.ownerEmail && remoteDraft.ownerEmail.trim().toLowerCase() !== normalizedEmail) {
          return;
        }
        isRemoteUpdateRef.current = true;
        setFactoryInfo((prevFactory) => {
          const merged = mergeDraftPreservingPhotos(prevFactory, latestDraftRef.current.sections, remoteDraft);
          return { ...DEFAULT_FACTORY_DATA, ...merged.factoryInfo };
        });
        setSections((prevSections) => {
          const merged = mergeDraftPreservingPhotos(latestDraftRef.current.factoryInfo, prevSections, remoteDraft);
          return normalizeAuditSections(merged.sections);
        });

        const sender = remoteDraft.lastUpdatedBy || 'Mobile Device';
        setSyncMessage(`Live update from ${sender}`);
        if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
        syncTimeoutRef.current = setTimeout(() => {
          setSyncMessage('Live Synced');
        }, 3000);

        setTimeout(() => {
          isRemoteUpdateRef.current = false;
        }, 500);
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

  // Real-time Firestore Cloud Sync scoped to current user email (never overwrites local photos with placeholders)
  useEffect(() => {
    if (!currentUser) return;

    const clientId = getClientDeviceId();
    const unsubscribeFirestore = subscribeToFirestoreDraft(
      (remoteDraft) => {
        isRemoteUpdateRef.current = true;
        setFactoryInfo((prevFactory) => {
          const merged = mergeDraftPreservingPhotos(prevFactory, latestDraftRef.current.sections, remoteDraft);
          return { ...DEFAULT_FACTORY_DATA, ...merged.factoryInfo };
        });
        setSections((prevSections) => {
          const merged = mergeDraftPreservingPhotos(latestDraftRef.current.factoryInfo, prevSections, remoteDraft);
          return normalizeAuditSections(merged.sections);
        });

        setSyncMessage('Firebase Cloud Synced');
        if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
        syncTimeoutRef.current = setTimeout(() => {
          setSyncMessage('Live Synced');
        }, 3000);

        setTimeout(() => {
          isRemoteUpdateRef.current = false;
        }, 500);
      },
      clientId,
      currentUser.email
    );

    return () => {
      unsubscribeFirestore();
    };
  }, [currentUser]);

  // Auto-save draft on changes (after initial load)
  useEffect(() => {
    if (!currentUser || !isInitializedRef.current || isRemoteUpdateRef.current) {
      return;
    }

    setIsSaved(false);
    const timer = setTimeout(() => {
      saveActiveDraft({
        factoryInfo,
        sections,
        currentTab,
        activeSectionId,
      });
      setIsSaved(true);
    }, 600);
    return () => clearTimeout(timer);
  }, [factoryInfo, sections, currentTab, activeSectionId, currentUser]);

  // Instant flush on mobile minimize / tab switch / pagehide so ZERO data or photos are ever lost
  useEffect(() => {
    if (!currentUser) return;
    const flushNow = () => {
      if (!isInitializedRef.current) return;
      saveActiveDraftImmediate(latestDraftRef.current);
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        flushNow();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pagehide', flushNow);
    window.addEventListener('beforeunload', flushNow);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pagehide', flushNow);
      window.removeEventListener('beforeunload', flushNow);
    };
  }, [currentUser]);

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
    saveActiveDraftImmediate({
      factoryInfo: updatedFactory,
      sections: updatedSections,
      currentTab,
      activeSectionId,
    });
    setSyncMessage(`Photo ${action === 'copy' ? 'Copied' : 'Transferred'}`);
    setTimeout(() => setSyncMessage('Live Synced'), 2500);
  };

  const handleManualSync = async () => {
    setSyncMessage('Checking cloud updates...');
    try {
      const serverDraft = await fetchServerActiveDraft();
      if (serverDraft) {
        isRemoteUpdateRef.current = true;
        setFactoryInfo((prev) => ({
          ...prev,
          ...mergeDraftPreservingPhotos(prev, latestDraftRef.current.sections, serverDraft).factoryInfo,
        }));
        setSections((prev) =>
          normalizeAuditSections(
            mergeDraftPreservingPhotos(latestDraftRef.current.factoryInfo, prev, serverDraft).sections
          )
        );
        setTimeout(() => {
          isRemoteUpdateRef.current = false;
        }, 400);
        setSyncMessage('Cloud Data Synced');
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
      auditorEmail: currentReport?.auditorEmail || currentUser?.email?.toLowerCase(),
      submittedAt: currentReport?.submittedAt,
      capItems: currentReport?.capItems,
      capUpdatedAt: currentReport?.capUpdatedAt,
    };
  }, [factoryInfo, sections, currentReport, currentUser]);

  const activeCapItems = useMemo(() => buildCapItemsFromReport(activeReportData), [activeReportData]);
  const openCapCount = useMemo(
    () => activeCapItems.filter((c) => c.status !== 'closed').length,
    [activeCapItems]
  );

  const handleLoginSuccess = (user: AuditorUser) => {
    setCurrentUser(user);
    setFactoryInfo((prev) => ({
      ...prev,
      auditorName: user.name || prev.auditorName || '',
      auditorTitle: (user.role || prev.auditorTitle || '').replace(/\s*\(Admin\)/gi, '').trim(),
    }));
  };

  const handleLogout = () => {
    saveActiveDraftImmediate(latestDraftRef.current);
    logoutAuditor();
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
    });

    const submittedReport: AuditReportData = {
      ...baseReport,
      auditorEmail: currentUser?.email?.trim().toLowerCase() || '',
      submittedAt: new Date().toISOString(),
      capItems: derivedCaps,
      capUpdatedAt: currentReport?.capUpdatedAt || new Date().toISOString(),
    };

    setCurrentReport(submittedReport);
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

  const handleUpdateCapItems = async (updatedCapItems: CapItem[]) => {
    const updatedReport: AuditReportData = {
      ...activeReportData,
      auditorEmail: activeReportData.auditorEmail || currentUser?.email?.trim().toLowerCase() || '',
      capItems: updatedCapItems,
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
  };

  const handleLoadAudit = (audit: AuditReportData) => {
    setCurrentReport(audit);
    setFactoryInfo(audit.factoryInfo);
    setSections(normalizeAuditSections(audit.sections));
    setCurrentTab('report');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenCapForAudit = (audit: AuditReportData) => {
    setCurrentReport(audit);
    setFactoryInfo(audit.factoryInfo);
    setSections(normalizeAuditSections(audit.sections));
    setCurrentTab('cap');
    window.scrollTo({ top: 0, behavior: 'smooth' });
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

    setFactoryInfo(freshFactory);
    setSections(freshSections);
    setCurrentReport(null);
    setCurrentTab('pre-audit');
    saveActiveDraft(null, true);
    clearFirestoreDraft(currentUser?.email).catch(() => {});
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

    setFactoryInfo(cleanFactory);
    setSections(cleanSections);
    setCurrentReport(null);
    setCurrentTab('pre-audit');

    try {
      localStorage.removeItem('qualitech_active_audit_v1');
    } catch {}

    try {
      await fetch('/api/active-draft', { method: 'DELETE' });
    } catch {}

    try {
      await clearFirestoreDraft(currentUser?.email);
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
    saveActiveDraftImmediate({
      factoryInfo: updatedFactory,
      sections: updatedSections,
      currentTab,
      activeSectionId,
    });
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
            activeSectionId={activeSectionId}
            onSelectSection={setActiveSectionId}
          />
        )}

        {currentTab === 'report' && (
          <ReportView
            report={activeReportData}
            onEditSection={(sectionId) => {
              setActiveSectionId(sectionId);
              setCurrentTab('audit');
            }}
            onSaveReport={handleSaveReportDirect}
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
            onLoadAudit={handleLoadAudit}
            onOpenCap={handleOpenCapForAudit}
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
