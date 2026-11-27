import { AuditReportData, CapItem } from '../types/audit';

/**
 * Generates or synchronizes CAP items from an AuditReportData's non-conformances
 * while preserving any existing CAP root-cause, corrective actions, closure status, and closure photos.
 */
export function buildCapItemsFromReport(report: AuditReportData): CapItem[] {
  const dismissedSet = new Set<string>(report.dismissedCapIds || []);
  const existingMap = new Map<string, CapItem>();
  (report.capItems || []).forEach((item) => {
    existingMap.set(item.checkpointId || item.id, item);
  });

  const derived: CapItem[] = [];
  const seenIds = new Set<string>();

  report.sections.forEach((sec) => {
    sec.checkpoints.forEach((cp) => {
      if (cp.score === 'critical' || cp.score === 'major' || cp.score === 'minor') {
        if (dismissedSet.has(cp.id) || dismissedSet.has(`cap-${cp.id}`)) {
          return;
        }
        const existing = existingMap.get(cp.id);
        seenIds.add(cp.id);

        if (existing) {
          derived.push({
            ...existing,
            sectionId: sec.id,
            sectionName: sec.name,
            checkpointCode: cp.code,
            checkpointTitle: cp.title,
            originalScore: cp.score,
            originalNotes: cp.notes || existing.originalNotes || '',
            originalImages: cp.images && cp.images.length > 0 ? cp.images : existing.originalImages || [],
          });
        } else {
          const defaultDays = cp.score === 'critical' ? 2 : cp.score === 'major' ? 14 : 30;
          const targetDate = new Date(Date.now() + defaultDays * 86400000).toISOString().split('T')[0];
          derived.push({
            id: `cap-${cp.id}`,
            checkpointId: cp.id,
            sectionId: sec.id,
            sectionName: sec.name,
            checkpointCode: cp.code,
            checkpointTitle: cp.title,
            originalScore: cp.score,
            originalNotes: cp.notes || cp.description || '',
            originalImages: cp.images || [],
            rootCause: '',
            correctiveAction: '',
            responsiblePerson: report.factoryInfo.contactPerson || '',
            targetDate,
            status: 'open',
            closureNotes: '',
            closureImages: [],
          });
        }
      }
    });
  });

  // Also preserve any custom manually-opened / Admin-issued CAP items
  (report.capItems || []).forEach((item) => {
    const key = item.checkpointId || item.id;
    if (!seenIds.has(key) && !dismissedSet.has(key) && !dismissedSet.has(item.id) && item.id.startsWith('cap-custom-')) {
      derived.push(item);
    }
  });

  return derived;
}
