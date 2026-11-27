/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  AuditReportData,
  AuditSection,
  AuditorUser,
  FactoryInfo,
  AppTab,
  ViewMode,
  CheckpointEvidence,
} from './types/audit';
import { DEFAULT_CERTIFICATIONS } from './data/defaultCertifications';
import { DEFAULT_AUDIT_SECTIONS } from './data/defaultCheckpoints';
import { FACTORY_FACILITIES } from './data/facilities';
import { calculateAuditReport, calculateSectionSummary } from './utils/scoring';
import {
  getCurrentUser,
  logoutAuditor,
  fetchAllAudits,
  saveAuditReport,
  deleteAuditReport,
  saveActiveDraft,
  loadActiveDraft,
  loadActiveDraftAsync,
  fetchServerActiveDraft,
  subscribeToLiveDraftStream,
  getClientDeviceId,
} from './services/api';
import { subscribeToFirestoreDraft, clearFirestoreDraft, isAuditorAdmin } from './services/firebase';

import { LoginScreen } from './components/LoginScreen';
import { Header } from './components/Header';
import { PreAuditForm } from './components/PreAuditForm';
import { AuditSectionView } from './components/AuditSectionView';
import { ReportView } from './components/ReportView';
import { SavedAuditsView } from './components/SavedAuditsView';
import { ImagePreviewModal } from './components/ImagePreviewModal';
import { DeviceSimulatorWrapper } from './components/DeviceSimulatorWrapper';
import { ShareAppModal } from './components/ShareAppModal';
import { PhotoActionModal, PhotoLocation } from './components/PhotoActionModal';
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
  // Rehydrate authenticated session from localStorage (prevents auto-logout on mobile scroll/swipe refresh)
  const [currentUser, setCurrentUser] = useState<AuditorUser | null>(() => getCurrentUser());
  const [currentTab, setCurrentTab] = useState<AppTab>('pre-audit');
  const [viewMode, setViewMode] = useState<ViewMode>('auto');
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);

  // Automatic in-app update detector (checks for new GitHub/Netlify versions)
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
        auditDuration: '',
        auditType: draft.factoryInfo.auditType || 'Annual Audit',
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
  const [activeSectionId, setActiveSectionId] = useState<string>(() => sections[0]?.id || 'warehouse');

  const [photoActionState, setPhotoActionState] = useState<{
    isOpen: boolean;
    evidence: CheckpointEvidence | null;
    sourceLocation: PhotoLocation | null;
  }>({
    isOpen: false,
    evidence: null,
    sourceLocation: null,
  });

  const isRemoteUpdateRef = React.useRef(false);
  const isInitializedRef = React.useRef(false);
  const syncTimeoutRef = React.useRef<any>(null);

  // Sync auditor name into factory info on login
  useEffect(() => {
    if (currentUser?.name && !factoryInfo.auditorName) {
      setFactoryInfo((prev) => ({ ...prev, auditorName: currentUser.name }));
    }
  }, [currentUser]);

  // Load saved audits on startup (strictly for Admin)
  useEffect(() => {
    if (currentUser && isAuditorAdmin(currentUser.email)) {
      fetchAllAudits(currentUser.email).then((list) => setSavedAudits(list));
    } else {
      setSavedAudits([]);
    }
  }, [currentUser]);

  // Security guard: Ensure non-admins cannot stay in saved-audits tab
  useEffect(() => {
    if (currentTab === 'saved-audits' && !isAuditorAdmin(currentUser?.email)) {
      setCurrentTab('pre-audit');
    }
  }, [currentTab, currentUser]);

  // Initial local IndexedDB + cloud draft retrieval on mount/login
  useEffect(() => {
    if (!currentUser) return;

    // 1. First load high-capacity IndexedDB draft (so 500+ photos load immediately)
    loadActiveDraftAsync().then((localDbDraft) => {
      if (localDbDraft && (localDbDraft.factoryInfo || localDbDraft.sections)) {
        if (
          localDbDraft.factoryInfo?.name !== 'Northern Fashions Ltd.' &&
          localDbDraft.factoryInfo?.name !== 'Apex Textile Mills Ltd.'
        ) {
          if (localDbDraft.factoryInfo) {
            setFactoryInfo((prev) => ({
              ...prev,
              ...localDbDraft.factoryInfo,
              openingMeetingPhoto: localDbDraft.factoryInfo.openingMeetingPhoto || undefined,
              openingMeetingPhotoTimestamp: localDbDraft.factoryInfo.openingMeetingPhotoTimestamp || undefined,
              openingMeetingPhotoConfirmed: localDbDraft.factoryInfo.openingMeetingPhotoConfirmed || undefined,
              openingMeetingPhotoAspectRatio: localDbDraft.factoryInfo.openingMeetingPhotoAspectRatio || undefined,
              factoryOutlookPhotos: Array.isArray(localDbDraft.factoryInfo.factoryOutlookPhotos)
                ? localDbDraft.factoryInfo.factoryOutlookPhotos
                : [],
            }));
          }
          if (localDbDraft.sections && Array.isArray(localDbDraft.sections)) {
            setSections(normalizeAuditSections(localDbDraft.sections));
          }
        }
      }
    });

    // 2. Fetch server draft for live sync
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
          isRemoteUpdateRef.current = true;
          if (serverDraft.factoryInfo) {
            setFactoryInfo((prev) => ({
              ...prev,
              ...serverDraft.factoryInfo,
              openingMeetingPhoto: serverDraft.factoryInfo.openingMeetingPhoto || undefined,
              openingMeetingPhotoTimestamp: serverDraft.factoryInfo.openingMeetingPhotoTimestamp || undefined,
              openingMeetingPhotoConfirmed: serverDraft.factoryInfo.openingMeetingPhotoConfirmed || undefined,
              openingMeetingPhotoAspectRatio: serverDraft.factoryInfo.openingMeetingPhotoAspectRatio || undefined,
              factoryOutlookPhotos: Array.isArray(serverDraft.factoryInfo.factoryOutlookPhotos)
                ? serverDraft.factoryInfo.factoryOutlookPhotos
                : [],
            }));
          }
          if (serverDraft.sections && Array.isArray(serverDraft.sections)) {
            setSections(normalizeAuditSections(serverDraft.sections));
          }
          setTimeout(() => {
            isRemoteUpdateRef.current = false;
          }, 500);
        }
      })
      .finally(() => {
        isInitializedRef.current = true;
      });
  }, [currentUser]);

  // Real-time Server-Sent Events stream: instantly push updates from mobile to PC
  useEffect(() => {
    if (!currentUser) return;

    const unsubscribe = subscribeToLiveDraftStream(
      (remoteDraft) => {
        isRemoteUpdateRef.current = true;
        if (remoteDraft.factoryInfo) {
          setFactoryInfo((prev) => ({
            ...prev,
            ...remoteDraft.factoryInfo,
            openingMeetingPhoto: remoteDraft.factoryInfo.openingMeetingPhoto || undefined,
            openingMeetingPhotoTimestamp: remoteDraft.factoryInfo.openingMeetingPhotoTimestamp || undefined,
            openingMeetingPhotoConfirmed: remoteDraft.factoryInfo.openingMeetingPhotoConfirmed || undefined,
            openingMeetingPhotoAspectRatio: remoteDraft.factoryInfo.openingMeetingPhotoAspectRatio || undefined,
            factoryOutlookPhotos: Array.isArray(remoteDraft.factoryInfo.factoryOutlookPhotos)
              ? remoteDraft.factoryInfo.factoryOutlookPhotos
              : [],
          }));
        }
        if (remoteDraft.sections && Array.isArray(remoteDraft.sections)) {
          setSections(normalizeAuditSections(remoteDraft.sections));
        }

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

  // Real-time Firestore Cloud Sync (works directly across Mobile APK and PC Browser)
  useEffect(() => {
    if (!currentUser) return;

    const clientId = getClientDeviceId();
    const unsubscribeFirestore = subscribeToFirestoreDraft((remoteDraft) => {
      isRemoteUpdateRef.current = true;
      if (remoteDraft.factoryInfo) {
        setFactoryInfo((prev) => ({
          ...prev,
          ...remoteDraft.factoryInfo,
          openingMeetingPhoto: remoteDraft.factoryInfo.openingMeetingPhoto || undefined,
          openingMeetingPhotoTimestamp: remoteDraft.factoryInfo.openingMeetingPhotoTimestamp || undefined,
          openingMeetingPhotoConfirmed: remoteDraft.factoryInfo.openingMeetingPhotoConfirmed || undefined,
          openingMeetingPhotoAspectRatio: remoteDraft.factoryInfo.openingMeetingPhotoAspectRatio || undefined,
          factoryOutlookPhotos: Array.isArray(remoteDraft.factoryInfo.factoryOutlookPhotos)
            ? remoteDraft.factoryInfo.factoryOutlookPhotos
            : [],
        }));
      }
      if (remoteDraft.sections && Array.isArray(remoteDraft.sections)) {
        setSections(normalizeAuditSections(remoteDraft.sections));
      }

      setSyncMessage('Firebase Cloud Synced');
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
      syncTimeoutRef.current = setTimeout(() => {
        setSyncMessage('Live Synced');
      }, 3000);

      setTimeout(() => {
        isRemoteUpdateRef.current = false;
      }, 500);
    }, clientId);

    return () => {
      unsubscribeFirestore();
    };
  }, [currentUser]);

  // Auto-save draft on changes (Only fires AFTER server draft is safely initialized)
  useEffect(() => {
    if (!currentUser || !isInitializedRef.current || isRemoteUpdateRef.current) {
      return;
    }

    setIsSaved(false);
    const timer = setTimeout(() => {
      saveActiveDraft({ factoryInfo, sections });
      setIsSaved(true);
    }, 1000);
    return () => clearTimeout(timer);
  }, [factoryInfo, sections, currentUser]);

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

    // 1. Add to target
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

    // 2. If move, remove from source
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
    saveActiveDraft({ factoryInfo: updatedFactory, sections: updatedSections }, action === 'move');
    setSyncMessage(`Photo ${action === 'copy' ? 'Copied' : 'Transferred'}`);
    setTimeout(() => setSyncMessage('Live Synced'), 2500);
  };

  const handleManualSync = async () => {
    setSyncMessage('Checking cloud updates...');
    try {
      const serverDraft = await fetchServerActiveDraft();
      if (serverDraft) {
        isRemoteUpdateRef.current = true;
        if (serverDraft.factoryInfo) {
          setFactoryInfo((prev) => ({ ...prev, ...serverDraft.factoryInfo }));
        }
        if (serverDraft.sections) {
          setSections(normalizeAuditSections(serverDraft.sections));
        }
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

  const handleLoginSuccess = (user: AuditorUser) => {
    setCurrentUser(user);
    setFactoryInfo((prev) => ({
      ...prev,
      auditorName: user.name || prev.auditorName || '',
      auditorTitle: (user.role || prev.auditorTitle || '').replace(/\s*\(Admin\)/gi, '').trim(),
    }));
  };

  const handleLogout = () => {
    logoutAuditor();
    setCurrentUser(null);
  };

  const handleSubmitAndGenerateReport = () => {
    // Generate full report data
    const report = calculateAuditReport(factoryInfo, sections, currentReport?.id, currentReport?.createdAt);
    setCurrentReport(report);
    setCurrentTab('report');

    // Automatically save report to list
    saveAuditReport(report).then((saved) => {
      setSavedAudits((prev) => {
        const idx = prev.findIndex((a) => a.id === saved.id);
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = saved;
          return copy;
        }
        return [saved, ...prev];
      });
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSaveReportDirect = async (report: AuditReportData) => {
    const saved = await saveAuditReport(report);
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
    setSections(audit.sections);
    setCurrentTab('report');
  };

  const handleStartNewAudit = () => {
    setFactoryInfo({
      ...DEFAULT_FACTORY_DATA,
      auditorName: currentUser?.name || '',
      auditDate: new Date().toISOString().split('T')[0],
      auditReportNo: '',
      factoryRegistrationNo: '',
    });
    setSections(DEFAULT_AUDIT_SECTIONS);
    setCurrentReport(null);
    setCurrentTab('pre-audit');
    saveActiveDraft(null);
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
      await clearFirestoreDraft();
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
    saveActiveDraft({ factoryInfo: updatedFactory, sections: updatedSections }, true);
    setSyncMessage('Photo Deleted');
    setTimeout(() => setSyncMessage('Live Synced'), 2500);
  };

  // Active Report object: either existing completed report or computed live report
  const activeReportData =
    currentReport || calculateAuditReport(factoryInfo, sections);

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
      />

      {/* Main Tab Content - Full Responsive Width on Desktop, Fluid on Mobile */}
      <main className="flex-1 w-full max-w-[1720px] mx-auto px-3 sm:px-6 lg:px-8 xl:px-10 py-4 sm:py-6">
        {currentTab === 'pre-audit' && (
          <PreAuditForm
            factoryInfo={factoryInfo}
            onChange={setFactoryInfo}
            onProceedToAudit={() => setCurrentTab('audit')}
            onOpenPreviewImage={(evidence) => setActivePreviewImage(evidence)}
            onOpenPhotoAction={handleOpenPhotoAction}
            onClearAllData={handleClearAllData}
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
          />
        )}

        {currentTab === 'saved-audits' && (
          <SavedAuditsView
            audits={savedAudits}
            onLoadAudit={handleLoadAudit}
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

      {/* Universal Photo Action Modal (Move / Copy between any checkpoint or factory outlook) */}
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
