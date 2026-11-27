import { AuditSection, AuditReportData, FactoryInfo, SectionScoreSummary, SCORE_DEFINITIONS } from '../types/audit';

export interface ScoreBandMeta {
  band: 'red' | 'amber' | 'deep-green';
  label: string;
  colorHex: string;
  deepHex: string;
  rgb: [number, number, number];
  badgeClass: string;
  textClass: string;
  bgClass: string;
}

export function getScoreBandMeta(percentage: number, criticalCount: number = 0): ScoreBandMeta {
  if (percentage < 50 || criticalCount > 0) {
    return {
      band: 'red',
      label: 'Red Mark (Critical Non-Compliance)',
      colorHex: '#dc2626',
      deepHex: '#991b1b',
      rgb: [220, 38, 38],
      badgeClass: 'bg-red-100 text-red-800 border-red-300',
      textClass: 'text-red-600',
      bgClass: 'bg-red-600',
    };
  } else if (percentage < 60) {
    return {
      band: 'red',
      label: 'Red Mark (Below 60% Standard)',
      colorHex: '#dc2626',
      deepHex: '#991b1b',
      rgb: [220, 38, 38],
      badgeClass: 'bg-red-100 text-red-800 border-red-300',
      textClass: 'text-red-600',
      bgClass: 'bg-red-600',
    };
  } else if (percentage >= 60 && percentage <= 79.99) {
    return {
      band: 'amber',
      label: 'Amber Mark (Conditional Pass)',
      colorHex: '#d97706', // amber
      deepHex: '#b45309',
      rgb: [217, 119, 6],
      badgeClass: 'bg-amber-100 text-amber-900 border-amber-300',
      textClass: 'text-amber-600',
      bgClass: 'bg-amber-600',
    };
  } else {
    // 80 and above
    return {
      band: 'deep-green',
      label: 'Deep Green (Quality Compliant)',
      colorHex: '#15803d', // Deep Green
      deepHex: '#14532d',
      rgb: [21, 128, 61],
      badgeClass: 'bg-emerald-100 text-emerald-900 border-emerald-300',
      textClass: 'text-emerald-700',
      bgClass: 'bg-emerald-700',
    };
  }
}

export function calculateSectionSummary(section: AuditSection): SectionScoreSummary {
  let earnedPoints = 0;
  let evaluatedCount = 0;
  let criticalCount = 0;
  let majorCount = 0;
  let minorCount = 0;
  let noIssueCount = 0;
  let naCount = 0;

  section.checkpoints.forEach((cp) => {
    if (!cp.score) return;

    if (cp.score === 'na') {
      naCount++;
      return;
    }

    evaluatedCount++;
    const meta = SCORE_DEFINITIONS[cp.score];
    earnedPoints += meta.points;

    if (cp.score === 'critical') criticalCount++;
    else if (cp.score === 'major') majorCount++;
    else if (cp.score === 'minor') minorCount++;
    else if (cp.score === 'none') noIssueCount++;
  });

  const maxPoints = evaluatedCount * 10;
  const percentage = maxPoints > 0 ? Math.round((earnedPoints / maxPoints) * 1000) / 10 : 0;
  const band = getScoreBandMeta(percentage, criticalCount);

  let grade: SectionScoreSummary['grade'] = 'Deep Green';
  if (band.band === 'red') {
    grade = 'Red Mark';
  } else if (band.band === 'amber') {
    grade = 'Amber Mark';
  }

  return {
    sectionId: section.id,
    sectionName: section.name,
    earnedPoints,
    maxPoints,
    percentage,
    evaluatedCount,
    totalCheckpoints: section.checkpoints.length,
    criticalCount,
    majorCount,
    minorCount,
    noIssueCount,
    naCount,
    statusColor: band.colorHex,
    grade,
  };
}

export function calculateAuditReport(
  factoryInfo: FactoryInfo,
  sections: AuditSection[],
  existingId?: string,
  createdAt?: string
): AuditReportData {
  const sectionSummaries = sections.map(calculateSectionSummary);

  let totalEarned = 0;
  let totalMax = 0;
  let totalCritical = 0;
  let totalMajor = 0;
  let totalMinor = 0;
  let totalNoIssue = 0;

  sectionSummaries.forEach((s) => {
    totalEarned += s.earnedPoints;
    totalMax += s.maxPoints;
    totalCritical += s.criticalCount;
    totalMajor += s.majorCount;
    totalMinor += s.minorCount;
    totalNoIssue += s.noIssueCount;
  });

  const overallPercentage = totalMax > 0 ? Math.round((totalEarned / totalMax) * 1000) / 10 : 0;
  const bandMeta = getScoreBandMeta(overallPercentage, totalCritical);

  const passedAudit = bandMeta.band !== 'red';
  const overallGrade = bandMeta.label;
  const overallScoreColor = bandMeta.colorHex;

  const executiveSummary = generateExecutiveSummary(
    factoryInfo.name,
    overallPercentage,
    bandMeta.label,
    totalCritical,
    totalMajor,
    totalMinor,
    sectionSummaries
  );

  return {
    id: existingId || `AUD-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
    createdAt: createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'completed',
    factoryInfo,
    sections,
    totalScore: totalEarned,
    maxPossibleScore: totalMax,
    overallPercentage,
    overallGrade,
    overallScoreColor,
    passedAudit,
    sectionSummaries,
    totalCritical,
    totalMajor,
    totalMinor,
    totalNoIssue,
    executiveSummary,
  };
}

function generateExecutiveSummary(
  factoryName: string,
  percentage: number,
  grade: string,
  criticals: number,
  majors: number,
  minors: number,
  summaries: SectionScoreSummary[]
): string {
  const lowestSection = [...summaries].sort((a, b) => a.percentage - b.percentage)[0];
  const highestSection = [...summaries].sort((a, b) => b.percentage - a.percentage)[0];

  let summary = `Internal Technical Audit conducted for ${factoryName || 'Factory'} resulted in an overall score of ${percentage}% (${grade}). `;

  if (criticals > 0) {
    summary += `CRITICAL ALERT: ${criticals} critical issue(s) identified requiring immediate containment and corrective action plan (CAP). `;
  } else if (majors > 0) {
    summary += `${majors} major and ${minors} minor non-conformances identified requiring formal CAP submission within 14 working days. `;
  } else {
    summary += `The facility demonstrates robust quality management adherence across surveyed operational departments. `;
  }

  if (highestSection && highestSection.maxPoints > 0) {
    summary += `Strongest performance was observed in "${highestSection.sectionName}" (${highestSection.percentage}%). `;
  }
  if (lowestSection && lowestSection.maxPoints > 0 && lowestSection.sectionId !== highestSection?.sectionId) {
    summary += `Primary department requiring technical intervention is "${lowestSection.sectionName}" (${lowestSection.percentage}%).`;
  }

  return summary;
}
