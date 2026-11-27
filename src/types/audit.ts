export type ScoreOption = 'critical' | 'major' | 'minor' | 'none' | 'na' | null;

export interface ScoreMeta {
  type: ScoreOption;
  label: string;
  points: number;
  colorClass: string;
  badgeBg: string;
  borderClass: string;
  textClass: string;
  hexColor: string;
  description: string;
}

export const SCORE_DEFINITIONS: Record<Exclude<ScoreOption, null>, ScoreMeta> = {
  critical: {
    type: 'critical',
    label: 'Not Accepted',
    points: 0,
    colorClass: 'bg-red-600 hover:bg-red-700 text-white',
    badgeBg: 'bg-red-100 text-red-800 border-red-300',
    borderClass: 'border-red-500',
    textClass: 'text-red-600',
    hexColor: '#dc2626',
    description: 'Not accepted - critical quality or safety non-compliance (0 pts)',
  },
  major: {
    type: 'major',
    label: 'Below Expectation',
    points: 3,
    colorClass: 'bg-amber-500 hover:bg-amber-600 text-slate-900',
    badgeBg: 'bg-amber-100 text-amber-900 border-amber-300',
    borderClass: 'border-amber-400',
    textClass: 'text-amber-600',
    hexColor: '#f59e0b',
    description: 'Below expectation - significant deviation requiring intervention (3 pts)',
  },
  minor: {
    type: 'minor',
    label: 'Acceptable',
    points: 7,
    colorClass: 'bg-blue-600 hover:bg-blue-700 text-white',
    badgeBg: 'bg-blue-100 text-blue-900 border-blue-300',
    borderClass: 'border-blue-500',
    textClass: 'text-blue-600',
    hexColor: '#2563eb',
    description: 'Acceptable - minor non-critical observation (7 pts)',
  },
  none: {
    type: 'none',
    label: 'Good',
    points: 10,
    colorClass: 'bg-emerald-600 hover:bg-emerald-700 text-white',
    badgeBg: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    borderClass: 'border-emerald-500',
    textClass: 'text-emerald-600',
    hexColor: '#16a34a',
    description: 'Good - full compliance with technical quality specifications (10 pts)',
  },
  na: {
    type: 'na',
    label: 'N/A',
    points: 0,
    colorClass: 'bg-slate-200 hover:bg-slate-300 text-slate-700',
    badgeBg: 'bg-slate-100 text-slate-600 border-slate-300',
    borderClass: 'border-slate-300',
    textClass: 'text-slate-500',
    hexColor: '#94a3b8',
    description: 'Not applicable to this manufacturing setup',
  },
};

export interface CheckpointEvidence {
  id: string;
  dataUrl: string;
  timestamp: string;
  caption?: string;
  isConfirmed?: boolean;
  aspectRatio?: number;
}

export interface CheckpointItem {
  id: string;
  code: string;
  title: string;
  description: string;
  guidelines?: string;
  score: ScoreOption;
  notes: string;
  images: CheckpointEvidence[];
  isCustom?: boolean;
}

export interface AuditSection {
  id: string;
  name: string;
  code: string;
  description: string;
  iconName: string;
  checkpoints: CheckpointItem[];
}

export interface FactoryCertification {
  id: string;
  name: string;
  selected: boolean;
  photo?: string;
  photoTimestamp?: string;
  certificateNo?: string;
  validUntil?: string;
  isCustom?: boolean;
}

export type AuditType =
  | 'Annual Audit'
  | 'Initial Audit'
  | '1st Follow-up Audit'
  | '2nd Follow-up Audit'
  | '3rd Follow-up Audit'
  | 'Re-Audit';

export interface FactoryInfo {
  name: string;
  address: string;
  numberOfWorkers?: string;
  numberOfLines?: string;
  capacityPerMonth?: string;
  contactPerson: string;
  contactPhone: string;
  contactEmail: string;
  auditDate: string;
  auditDuration?: string;
  auditDurationSeconds?: number;
  auditTimerRunning?: boolean;
  auditorName: string;
  auditorTitle: string;
  auditor2Name?: string;
  auditor2Title?: string;
  buyerBrand: string;
  auditReportNo?: string;
  factoryRegistrationNo?: string;
  auditType: AuditType;
  openingMeetingPhoto?: string;
  openingMeetingPhotoTimestamp?: string;
  openingMeetingPhotoConfirmed?: boolean;
  openingMeetingPhotoAspectRatio?: number;
  openingMeetingNotes?: string;
  factoryOutlookPhotos?: CheckpointEvidence[];
  facilities: string[];
  certifications: FactoryCertification[];
}

export interface SectionScoreSummary {
  sectionId: string;
  sectionName: string;
  earnedPoints: number;
  maxPoints: number;
  percentage: number;
  evaluatedCount: number;
  totalCheckpoints: number;
  criticalCount: number;
  majorCount: number;
  minorCount: number;
  noIssueCount: number;
  naCount: number;
  statusColor: string;
  grade: 'Deep Green' | 'Amber Mark' | 'Red Mark';
}

export interface AuditReportData {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: 'draft' | 'completed';
  factoryInfo: FactoryInfo;
  sections: AuditSection[];
  totalScore: number;
  maxPossibleScore: number;
  overallPercentage: number;
  overallGrade: string;
  overallScoreColor: string;
  passedAudit: boolean;
  sectionSummaries: SectionScoreSummary[];
  totalCritical: number;
  totalMajor: number;
  totalMinor: number;
  totalNoIssue: number;
  auditorSignature?: string;
  executiveSummary?: string;
}

export interface AuditorUser {
  id: string;
  username: string;
  name: string;
  role: string;
  email: string;
  token?: string;
}

export type ViewMode = 'auto' | 'android' | 'windows';
export type AppTab = 'pre-audit' | 'audit' | 'report' | 'saved-audits';
