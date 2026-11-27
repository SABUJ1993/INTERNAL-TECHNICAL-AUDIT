import { jsPDF } from 'jspdf';
import {
  AuditReportData,
  CapItem,
  CheckpointEvidence,
  SCORE_DEFINITIONS,
  SectionScoreSummary,
} from '../types/audit';
import { getScoreBandMeta } from './scoring';

export interface GeneratePdfOptions {
  includeCap?: boolean;
  selectedCapSectionIds?: string[];
}

interface BuiltPdfResult {
  doc: jsPDF;
  fileName: string;
}

function getSafeImageFormat(dataUrl: string): 'JPEG' | 'PNG' {
  if (dataUrl.startsWith('data:image/png')) return 'PNG';
  return 'JPEG';
}

function drawSegmentedBar(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  height: number,
  counts: { critical: number; major: number; minor: number; none: number; na: number }
) {
  const total = counts.critical + counts.major + counts.minor + counts.none + counts.na;
  if (total <= 0) {
    doc.setFillColor(15, 23, 42);
    doc.rect(x, y, width, height, 'F');
    return;
  }

  const segments: Array<{ count: number; rgb: [number, number, number] }> = [
    { count: counts.critical, rgb: [220, 38, 38] }, // Red
    { count: counts.major, rgb: [245, 158, 11] }, // Amber
    { count: counts.minor, rgb: [59, 130, 246] }, // Blue
    { count: counts.none, rgb: [77, 155, 88] }, // Green
    { count: counts.na, rgb: [156, 163, 175] }, // Gray
  ];

  let curX = x;
  segments.forEach((seg, idx) => {
    if (seg.count <= 0) return;
    const segW = idx === segments.length - 1 ? x + width - curX : (seg.count / total) * width;
    if (segW > 0.2) {
      doc.setFillColor(seg.rgb[0], seg.rgb[1], seg.rgb[2]);
      doc.rect(curX, y, segW, height, 'F');
      curX += segW;
    }
  });
}

function drawWrappedPillBadges(
  doc: jsPDF,
  items: string[],
  startX: number,
  startY: number,
  maxWidth: number
): number {
  if (!items || items.length === 0) return 5.5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);

  let curX = startX;
  let curY = startY;
  const pillH = 4.2;
  const gapX = 1.5;
  const gapY = 1.5;

  items.forEach((raw) => {
    const label = String(raw || '').trim();
    if (!label) return;
    const textW = doc.getTextWidth(label);
    const pillW = Math.min(textW + 4, maxWidth);
    if (curX + pillW > startX + maxWidth && curX > startX) {
      curX = startX;
      curY += pillH + gapY;
    }
    doc.setFillColor(71, 85, 105);
    doc.roundedRect(curX, curY, pillW, pillH, 0.8, 0.8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text(label, curX + 2, curY + 3, { maxWidth: pillW - 3 });
    curX += pillW + gapX;
  });

  return curY - startY + pillH + 1.5;
}

function drawPhotoGrid4Col(
  doc: jsPDF,
  photos: Array<{ dataUrl: string; label?: string }>,
  margin: number,
  contentWidth: number,
  y: number,
  checkPageBreak: (needed: number) => void
): number {
  const validPhotos = photos.filter(
    (p) => p.dataUrl && (p.dataUrl.startsWith('data:image/') || p.dataUrl.startsWith('http'))
  );
  if (validPhotos.length === 0) return y;

  const cols = 4;
  const gap = 3;
  const cellW = (contentWidth - gap * (cols - 1)) / cols;
  const cellH = 29;
  const rowStep = cellH + 5.5;

  let curY = y;
  for (let i = 0; i < validPhotos.length; i += cols) {
    checkPageBreak(rowStep + 2);
    // Re-read current y after potential page break by reading closure? We handle via return value below.
    break;
  }

  for (let i = 0; i < validPhotos.length; i++) {
    const col = i % cols;
    if (col === 0) {
      if (curY + rowStep > doc.internal.pageSize.getHeight() - 16) {
        doc.addPage();
        curY = margin;
      }
    }
    const px = margin + col * (cellW + gap);
    const photo = validPhotos[i];

    // Subtle crisp frame
    doc.setDrawColor(203, 213, 225);
    doc.setFillColor(248, 250, 252);
    doc.setLineWidth(0.2);
    doc.rect(px, curY, cellW, cellH, 'FD');

    try {
      doc.addImage(
        photo.dataUrl,
        getSafeImageFormat(photo.dataUrl),
        px + 0.4,
        curY + 0.4,
        cellW - 0.8,
        cellH - 0.8,
        undefined,
        'FAST'
      );
    } catch (e) {
      console.warn('Could not add image to PDF grid', e);
    }

    if (photo.label) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      doc.setTextColor(71, 85, 105);
      const trimmedLabel = photo.label.length > 26 ? `${photo.label.slice(0, 24)}..` : photo.label;
      doc.text(trimmedLabel, px + 0.5, curY + cellH + 3.2);
    }

    if (col === cols - 1 || i === validPhotos.length - 1) {
      curY += rowStep;
    }
  }

  return curY;
}

function applyPageFooters(doc: jsPDF, factoryName: string, auditDate: string, margin: number) {
  const totalPages = (doc as any).internal.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.line(margin, pageHeight - 11, pageWidth - margin, pageHeight - 11);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text('Internal Technical Audit Suite', margin, pageHeight - 6.5);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(51, 65, 85);
    doc.text(
      `Factory: ${factoryName || 'Factory'}   |   ${auditDate}   |   Page ${i} of ${totalPages}`,
      pageWidth - margin,
      pageHeight - 6.5,
      { align: 'right' }
    );
  }
}

async function buildAuditPdfDocument(
  report: AuditReportData,
  options?: GeneratePdfOptions
): Promise<BuiltPdfResult> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  const checkPageBreak = (neededHeight: number) => {
    if (y + neededHeight > pageHeight - 16) {
      doc.addPage();
      y = margin;
    }
  };

  const factoryName = report.factoryInfo.name || 'Factory';
  const auditDate = report.factoryInfo.auditDate || new Date().toISOString().split('T')[0];
  const auditType = report.factoryInfo.auditType || 'Annual Audit';
  const auditor1 = report.factoryInfo.auditorName || 'Lead Auditor';
  const auditor2 = report.factoryInfo.auditor2Name?.trim();
  const auditorDisplay = auditor2 ? `${auditor1} & ${auditor2}` : auditor1;
  const reportNo = report.factoryInfo.auditReportNo || report.factoryInfo.factoryRegistrationNo || report.id || 'N/A';
  const contactEmailsStr =
    report.factoryInfo.contactEmails && report.factoryInfo.contactEmails.length > 0
      ? report.factoryInfo.contactEmails.join(', ')
      : report.factoryInfo.contactEmail || 'N/A';

  const scoreBand = getScoreBandMeta(report.overallPercentage, report.totalCritical);

  // --- 1. QARMA-STYLE CLEAN HEADER ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);
  doc.text('Audit report', margin, y + 3);
  y += 6.5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.setTextColor(15, 23, 42);
  const titleLines = doc.splitTextToSize(factoryName.toUpperCase(), contentWidth);
  doc.text(titleLines, margin, y + 4);
  y += titleLines.length * 6.5 + 3;

  // --- 2. 4-COLUMN BORDERED METADATA GRID ---
  const c1 = 27;
  const c2 = 66;
  const c3 = 29;
  const c4 = contentWidth - c1 - c2 - c3;

  const metaRows: Array<[string, string, string, string]> = [
    ['Date', auditDate, 'Auditor', auditorDisplay],
    ['Audit type', auditType, 'Location', report.factoryInfo.address || 'N/A'],
    ['Checklist Name', 'Internal Technical Audit Checklist', 'Planned Date', auditDate],
    ['Supplier Name', factoryName, 'Report No.', reportNo],
    ['Buyer / Brand', report.factoryInfo.buyerBrand || 'N/A', 'Contact Emails', contactEmailsStr],
  ];

  doc.setLineWidth(0.2);
  doc.setDrawColor(100, 116, 139);

  metaRows.forEach(([l1, v1, l2, v2]) => {
    doc.setFontSize(7.5);
    const v1Lines = doc.splitTextToSize(v1, c2 - 3);
    const v2Lines = doc.splitTextToSize(v2, c4 - 3);
    const rowH = Math.max(5.5, Math.max(v1Lines.length, v2Lines.length) * 3.5 + 2.2);
    checkPageBreak(rowH + 2);

    // Draw 4 cells
    doc.setFillColor(248, 250, 252);
    doc.rect(margin, y, c1, rowH, 'FD');
    doc.setFillColor(255, 255, 255);
    doc.rect(margin + c1, y, c2, rowH, 'FD');
    doc.setFillColor(248, 250, 252);
    doc.rect(margin + c1 + c2, y, c3, rowH, 'FD');
    doc.setFillColor(255, 255, 255);
    doc.rect(margin + c1 + c2 + c3, y, c4, rowH, 'FD');

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(l1, margin + 2, y + 3.8);
    doc.text(l2, margin + c1 + c2 + 2, y + 3.8);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(v1Lines, margin + c1 + 2, y + 3.8);
    doc.text(v2Lines, margin + c1 + c2 + c3 + 2, y + 3.8);

    y += rowH;
  });

  y += 5;

  // --- 3. AUDITOR COMMENT & RIGHT-ALIGNED STATUS BAR ---
  const commentText =
    report.executiveSummary ||
    `Internal Technical Audit conducted at ${factoryName} on ${auditDate}. Overall score achieved: ${report.overallPercentage}%.`;
  const splitComment = doc.splitTextToSize(commentText, contentWidth);
  checkPageBreak(splitComment.length * 3.8 + 16);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text('Auditor Comment:', margin, y);
  y += 4;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.8);
  doc.setTextColor(30, 41, 59);
  doc.text(splitComment, margin, y);
  y += splitComment.length * 3.7 + 3;

  // Status Bar Row
  const barW = 86;
  const barX = margin + contentWidth - barW;
  const barH = 5.5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);
  doc.text('Status', barX - 11, y + 3.8);

  const statusRgb: [number, number, number] =
    scoreBand.band === 'deep-green'
      ? [77, 155, 88]
      : scoreBand.band === 'amber'
      ? [217, 119, 6]
      : [220, 38, 38];
  const statusLabel =
    scoreBand.band === 'deep-green'
      ? 'Compliant (Deep Green)'
      : scoreBand.band === 'amber'
      ? 'Conditional Pass (Amber)'
      : 'Action Required (Red)';

  doc.setFillColor(statusRgb[0], statusRgb[1], statusRgb[2]);
  doc.rect(barX, y, barW, barH, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(7.5);
  doc.text(statusLabel, barX + barW / 2, y + 3.8, { align: 'center' });
  y += 10;

  // --- 4. SUMMARY TABLE ---
  checkPageBreak(30);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('SUMMARY:', margin, y);
  y += 4;

  const leftColW = contentWidth * 0.68;
  const rightColW = contentWidth - leftColW;

  doc.setDrawColor(100, 116, 139);
  doc.setLineWidth(0.2);

  // Spacer Header Row
  doc.setFillColor(248, 250, 252);
  doc.rect(margin, y, leftColW, 4, 'FD');
  doc.rect(margin + leftColW, y, rightColW, 4, 'FD');
  y += 4;

  // Row 1: 1 FACTORY BASIC INFORMATION
  doc.setFillColor(255, 255, 255);
  doc.rect(margin, y, leftColW, 6, 'FD');
  doc.rect(margin + leftColW, y, rightColW, 6, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);
  doc.text('1  FACTORY BASIC INFORMATION', margin + 2, y + 4);
  drawSegmentedBar(doc, margin + leftColW + rightColW / 2 - 9, y + 1.5, 18, 3, {
    critical: 0,
    major: 0,
    minor: 0,
    none: report.factoryInfo.name ? 2 : 1,
    na: report.factoryInfo.openingMeetingPhoto ? 0 : 1,
  });
  y += 6;

  // Section summary rows + Critical (!) callout sub-rows
  report.sections.forEach((sec, idx) => {
    const sum: SectionScoreSummary = report.sectionSummaries[idx];
    const rowH = 6;
    checkPageBreak(rowH + 6);

    doc.setFillColor(255, 255, 255);
    doc.rect(margin, y, leftColW, rowH, 'FD');
    doc.rect(margin + leftColW, y, rightColW, rowH, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(15, 23, 42);
    const secLabel = `${idx + 2}  ${idx + 1}. ${sec.name.toUpperCase()}`;
    doc.text(secLabel.slice(0, 68), margin + 2, y + 4);

    // Score % + Segmented bar
    const barBoxX = margin + leftColW + rightColW / 2 - 4;
    if (sum.evaluatedCount > 0) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(15, 23, 42);
      doc.text(`${sum.percentage.toFixed(1)}%`, barBoxX - 2, y + 4, { align: 'right' });
    }
    drawSegmentedBar(doc, barBoxX, y + 1.6, 18, 2.8, {
      critical: sum.criticalCount,
      major: sum.majorCount,
      minor: sum.minorCount,
      none: sum.noIssueCount,
      na: sum.naCount,
    });

    y += rowH;

    // Critical (!) highlights inside Summary table
    const criticalCps = sec.checkpoints.filter((cp) => cp.score === 'critical');
    criticalCps.forEach((cp) => {
      const critText = `${idx + 2}.${sec.checkpoints.indexOf(cp) + 1}  ${cp.code} ${cp.title}`;
      const critLines = doc.splitTextToSize(critText, leftColW - 12);
      const critH = Math.max(6, critLines.length * 3.5 + 2.5);
      checkPageBreak(critH + 4);

      doc.setFillColor(255, 255, 255);
      doc.rect(margin, y, leftColW, critH, 'FD');
      doc.rect(margin + leftColW, y, rightColW, critH, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(30, 41, 59);
      doc.text(critLines, margin + 8, y + 4);

      // Red (!) circle icon in right column
      const cx = margin + leftColW + rightColW / 2;
      const cy = y + critH / 2;
      doc.setDrawColor(220, 38, 38);
      doc.setLineWidth(0.35);
      doc.circle(cx, cy, 2, 'S');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(220, 38, 38);
      doc.text('!', cx, cy + 1, { align: 'center' });
      doc.setDrawColor(100, 116, 139);
      doc.setLineWidth(0.2);

      y += critH;
    });
  });

  // Bottom Summary Score Row
  checkPageBreak(7);
  doc.setFillColor(248, 250, 252);
  doc.rect(margin, y, leftColW, 6.5, 'FD');
  doc.rect(margin + leftColW, y, rightColW, 6.5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text('Summary Score', margin + 2, y + 4.4);
  doc.text(`${report.overallPercentage.toFixed(1)}%`, margin + leftColW + rightColW / 2, y + 4.4, {
    align: 'center',
  });
  y += 11;

  // --- 5. CHECKPOINTS DETAIL SECTION ---
  const totalCheckpointsCount = report.sections.reduce((acc, s) => acc + s.checkpoints.length, 0);
  checkPageBreak(22);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text(`CHECKPOINTS: ${totalCheckpointsCount}`, margin, y);
  y += 4;

  // Section 1: FACTORY BASIC INFORMATION
  doc.setDrawColor(100, 116, 139);
  doc.setLineWidth(0.2);
  doc.setFillColor(248, 250, 252);
  doc.rect(margin, y, 12, 6.5, 'FD');
  doc.rect(margin + 12, y, leftColW - 12, 6.5, 'FD');
  doc.rect(margin + leftColW, y, rightColW, 6.5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text('1', margin + 6, y + 4.4, { align: 'center' });
  doc.text('FACTORY BASIC INFORMATION', margin + 14.5, y + 4.4);
  drawSegmentedBar(doc, margin + leftColW + rightColW / 2 - 9, y + 1.8, 18, 3, {
    critical: 0,
    major: 0,
    minor: 0,
    none: 2,
    na: 0,
  });
  y += 8.5;

  // 1.1 Factory basic information header
  checkPageBreak(14);
  doc.setFillColor(255, 255, 255);
  doc.rect(margin, y, 12, 6, 'FD');
  doc.rect(margin + 12, y, contentWidth - 12, 6, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);
  doc.text('1.1', margin + 6, y + 4, { align: 'center' });
  doc.text('Factory basic information', margin + 14.5, y + 4);
  y += 8.5;

  // Collect all Basic Information photos (Outlook + Opening Meeting + Certificates)
  const basicPhotos: Array<{ dataUrl: string; label?: string }> = [];
  (report.factoryInfo.factoryOutlookPhotos || []).forEach((p, i) => {
    basicPhotos.push({ dataUrl: p.dataUrl, label: p.caption || `Outlook #${i + 1}` });
  });
  if (report.factoryInfo.openingMeetingPhoto) {
    basicPhotos.push({
      dataUrl: report.factoryInfo.openingMeetingPhoto,
      label: 'Opening Meeting',
    });
  }
  (report.factoryInfo.certifications || [])
    .filter((c) => c.selected && c.photo)
    .forEach((c) => {
      if (c.photo) basicPhotos.push({ dataUrl: c.photo, label: c.name });
    });

  if (basicPhotos.length > 0) {
    y = drawPhotoGrid4Col(doc, basicPhotos, margin, contentWidth, y, checkPageBreak);
    y += 2;
  }

  // Production Unit Custom Field | Value table
  const fieldColW = 54;
  const valColW = contentWidth - fieldColW;
  const activeFacilities = report.factoryInfo.facilities || [];
  const activeCerts = (report.factoryInfo.certifications || []).filter((c) => c.selected).map((c) => c.name);
  const activeBrands = (report.factoryInfo.buyerBrand || '')
    .split(/[,;|]+/)
    .map((b) => b.trim())
    .filter(Boolean);

  checkPageBreak(14);
  doc.setFillColor(248, 250, 252);
  doc.rect(margin, y, fieldColW, 6, 'FD');
  doc.rect(margin + fieldColW, y, valColW, 6, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);
  doc.text('Production Unit Custom Field', margin + 2, y + 4);
  doc.text('Value', margin + fieldColW + 2, y + 4);
  y += 6;

  type CustomFieldRow =
    | { label: string; kind: 'text'; value: string }
    | { label: string; kind: 'pills'; items: string[] };

  const customRows: CustomFieldRow[] = [
    { label: 'Factory Address', kind: 'text', value: report.factoryInfo.address || 'N/A' },
    {
      label: 'Factory Facilities',
      kind: 'pills',
      items: activeFacilities.length > 0 ? activeFacilities : ['Standard Garment Facility'],
    },
    { label: 'Number of Workers', kind: 'text', value: report.factoryInfo.numberOfWorkers || 'N/A' },
    { label: 'Number of Lines', kind: 'text', value: report.factoryInfo.numberOfLines || 'N/A' },
    { label: 'Capacity (pcs per month)', kind: 'text', value: report.factoryInfo.capacityPerMonth || 'N/A' },
    { label: 'Contact Person', kind: 'text', value: report.factoryInfo.contactPerson || 'N/A' },
    { label: 'Contact Phone', kind: 'text', value: report.factoryInfo.contactPhone || 'N/A' },
    { label: 'Contact Emails', kind: 'text', value: contactEmailsStr },
    {
      label: 'Certifications',
      kind: 'pills',
      items: activeCerts.length > 0 ? activeCerts : ['None Specified'],
    },
    {
      label: 'Active Brands / Buyers',
      kind: 'pills',
      items: activeBrands.length > 0 ? activeBrands : ['General Export'],
    },
  ];

  customRows.forEach((row) => {
    if (row.kind === 'text') {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      const lines = doc.splitTextToSize(row.value, valColW - 4);
      const h = Math.max(5.8, lines.length * 3.5 + 2.3);
      checkPageBreak(h + 2);

      doc.setFillColor(255, 255, 255);
      doc.rect(margin, y, fieldColW, h, 'FD');
      doc.rect(margin + fieldColW, y, valColW, h, 'FD');
      doc.setTextColor(15, 23, 42);
      doc.text(row.label, margin + 2, y + 3.9);
      doc.setFont('helvetica', 'normal');
      doc.text(lines, margin + fieldColW + 2, y + 3.9);
      y += h;
    } else {
      // Measure pills height first by computing lines
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      let cx = 0;
      let rowsCount = 1;
      row.items.forEach((raw) => {
        const w = Math.min(doc.getTextWidth(String(raw).trim()) + 4, valColW - 5);
        if (cx + w > valColW - 5 && cx > 0) {
          cx = 0;
          rowsCount++;
        }
        cx += w + 1.5;
      });
      const h = Math.max(6.2, rowsCount * 5.7 + 2);
      checkPageBreak(h + 2);

      doc.setFillColor(255, 255, 255);
      doc.rect(margin, y, fieldColW, h, 'FD');
      doc.rect(margin + fieldColW, y, valColW, h, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(15, 23, 42);
      doc.text(row.label, margin + 2, y + 4);
      drawWrappedPillBadges(doc, row.items, margin + fieldColW + 2, y + 1.2, valColW - 4);
      y += h;
    }
  });

  y += 4;

  // 1.2 Opening Meeting Notes (if provided)
  if (report.factoryInfo.openingMeetingNotes?.trim()) {
    checkPageBreak(18);
    doc.setFillColor(255, 255, 255);
    doc.rect(margin, y, 12, 6, 'FD');
    doc.rect(margin + 12, y, contentWidth - 30, 6, 'FD');
    doc.rect(margin + contentWidth - 18, y, 18, 6, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(15, 23, 42);
    doc.text('1.2', margin + 6, y + 4, { align: 'center' });
    doc.text('Opening Meeting Notes & Attendees', margin + 14.5, y + 4);
    doc.text('OK', margin + contentWidth - 9, y + 4, { align: 'center' });
    y += 8;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(51, 65, 85);
    const notesLines = doc.splitTextToSize(report.factoryInfo.openingMeetingNotes, contentWidth - 16);
    doc.text(notesLines, margin + 14.5, y);
    y += notesLines.length * 3.8 + 4;
  }

  // --- 6. EACH AUDITED SECTION & CHECKPOINTS ---
  report.sections.forEach((sec, secIdx) => {
    const sum = report.sectionSummaries[secIdx];
    const itemsToRender = sec.checkpoints.filter(
      (cp) => cp.score !== null || (cp.notes && cp.notes.trim().length > 0) || (cp.images && cp.images.length > 0)
    );
    if (itemsToRender.length === 0) return;

    checkPageBreak(22);

    // Section Header Box
    doc.setDrawColor(100, 116, 139);
    doc.setLineWidth(0.2);
    doc.setFillColor(248, 250, 252);
    doc.rect(margin, y, 12, 6.5, 'FD');
    doc.rect(margin + 12, y, leftColW - 12, 6.5, 'FD');
    doc.rect(margin + leftColW, y, rightColW, 6.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    doc.text(`${secIdx + 2}`, margin + 6, y + 4.4, { align: 'center' });
    doc.text(`${secIdx + 1}. ${sec.name.toUpperCase()}`, margin + 14.5, y + 4.4);

    const barXPos = margin + leftColW + rightColW / 2 - 4;
    if (sum.evaluatedCount > 0) {
      doc.text(`${sum.percentage.toFixed(1)}%`, barXPos - 2, y + 4.4, { align: 'right' });
    }
    drawSegmentedBar(doc, barXPos, y + 1.8, 18, 3, {
      critical: sum.criticalCount,
      major: sum.majorCount,
      minor: sum.minorCount,
      none: sum.noIssueCount,
      na: sum.naCount,
    });
    y += 9;

    // Render each checkpoint in this section
    itemsToRender.forEach((cp) => {
      const cpNum = sec.checkpoints.indexOf(cp) + 1;
      const meta = cp.score ? SCORE_DEFINITIONS[cp.score] : null;
      const titleColW = contentWidth - 12 - 36;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      const cpTitleLines = doc.splitTextToSize(`${cp.code}  ${cp.title}`, titleColW - 4);
      const headerH = Math.max(6.2, cpTitleLines.length * 3.6 + 2.5);

      const noteBody = cp.notes?.trim()
        ? cp.notes.trim()
        : cp.description || 'Evaluated per technical audit criteria.';
      const bulletLines = doc.splitTextToSize(`o  ${noteBody}`, contentWidth - 18);
      const bulletH = bulletLines.length * 3.6 + 2;

      checkPageBreak(headerH + bulletH + (cp.images?.length ? 34 : 4));

      // Checkpoint Header Box
      doc.setDrawColor(100, 116, 139);
      doc.setFillColor(255, 255, 255);
      doc.rect(margin, y, 12, headerH, 'FD');
      doc.rect(margin + 12, y, titleColW, headerH, 'FD');
      doc.rect(margin + 12 + titleColW, y, 36, headerH, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(15, 23, 42);
      doc.text(`${secIdx + 2}.${cpNum}`, margin + 6, y + 4.1, { align: 'center' });
      doc.text(cpTitleLines, margin + 14.5, y + 4.1);

      // Right status/score badge
      if (meta) {
        const badgeColor: [number, number, number] =
          cp.score === 'critical'
            ? [220, 38, 38]
            : cp.score === 'major'
            ? [245, 158, 11]
            : cp.score === 'minor'
            ? [59, 130, 246]
            : cp.score === 'none'
            ? [77, 155, 88]
            : [148, 163, 184];

        const pillX = margin + 12 + titleColW + 2;
        doc.setFillColor(badgeColor[0], badgeColor[1], badgeColor[2]);
        doc.roundedRect(pillX, y + 1.4, 32, headerH - 2.8, 0.8, 0.8, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);
        doc.setTextColor(cp.score === 'major' ? 15 : 255, cp.score === 'major' ? 23 : 255, cp.score === 'major' ? 42 : 255);
        const ptsText = cp.score === 'na' ? 'N/A' : `${meta.label} (${meta.points})`;
        doc.text(ptsText, pillX + 16, y + headerH / 2 + 1, { align: 'center' });
      }
      y += headerH + 2.5;

      // Bullet finding line(s)
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.3);
      doc.setTextColor(30, 41, 59);
      doc.text(bulletLines, margin + 14.5, y + 2);
      y += bulletH + 1;

      // Checkpoint photos in 4-col grid
      if (cp.images && cp.images.length > 0) {
        const cpPhotos = cp.images.map((img, i) => ({
          dataUrl: img.dataUrl,
          label: img.caption || `${cp.code} #${i + 1}`,
        }));
        y = drawPhotoGrid4Col(doc, cpPhotos, margin, contentWidth, y, checkPageBreak);
      }

      y += 2;
    });
  });

  // --- 7. OPTIONAL CAP SUMMARY IN MAIN AUDIT PDF ---
  if (options?.includeCap) {
    const targetSections = report.sectionSummaries.filter((s) => {
      if (options.selectedCapSectionIds && options.selectedCapSectionIds.length > 0) {
        return options.selectedCapSectionIds.includes(s.sectionId);
      }
      return s.percentage < 70 || s.criticalCount > 0;
    });

    if (targetSections.length > 0) {
      checkPageBreak(30);
      y += 4;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(15, 23, 42);
      doc.text('CORRECTIVE ACTION PLAN (CAP) PROTOCOL', margin, y);
      y += 5;

      targetSections.forEach((sec) => {
        checkPageBreak(18);
        doc.setDrawColor(220, 38, 38);
        doc.setFillColor(254, 242, 242);
        doc.rect(margin, y, contentWidth, 14, 'FD');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(153, 27, 27);
        doc.text(
          `${sec.sectionName} — Score: ${sec.percentage}% (${sec.criticalCount} Critical, ${sec.majorCount} Below Exp.)`,
          margin + 3,
          y + 5
        );
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.2);
        doc.setTextColor(71, 85, 105);
        doc.text(
          'Required: Root Cause Analysis (RCA), Corrective Action, Responsible Owner & Verification Evidence.',
          margin + 3,
          y + 10.5
        );
        y += 17;
      });
    }
  }

  applyPageFooters(doc, factoryName, auditDate, margin);

  const sanitizedName = factoryName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const reportCode = reportNo.replace(/[^a-zA-Z0-9_-]/g, '_');
  const fileName = `Internal_Technical_Audit_${sanitizedName}_${reportCode}.pdf`;

  return { doc, fileName };
}

export async function generateAuditPdfBlob(
  report: AuditReportData,
  options?: GeneratePdfOptions
): Promise<{ blob: Blob; fileName: string }> {
  const { doc, fileName } = await buildAuditPdfDocument(report, options);
  const blob = doc.output('blob');
  return { blob, fileName };
}

export async function generateAuditPdf(
  report: AuditReportData,
  options?: GeneratePdfOptions
): Promise<void> {
  const { doc, fileName } = await buildAuditPdfDocument(report, options);
  doc.save(fileName);
}

/**
 * Generates a dedicated Qarma-style Corrective Action Plan (CAP) PDF Report
 * including original findings, root cause, corrective actions, closure verification & after-fix photos.
 */
export async function generateCapPdf(report: AuditReportData, capItemsOverride?: CapItem[]): Promise<void> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  const checkPageBreak = (neededHeight: number) => {
    if (y + neededHeight > pageHeight - 16) {
      doc.addPage();
      y = margin;
    }
  };

  const factoryName = report.factoryInfo.name || 'Factory';
  const auditDate = report.factoryInfo.auditDate || new Date().toISOString().split('T')[0];
  const reportNo = report.factoryInfo.auditReportNo || report.factoryInfo.factoryRegistrationNo || report.id || 'N/A';
  const capList: CapItem[] = capItemsOverride || report.capItems || [];

  const openCount = capList.filter((c) => c.status === 'open').length;
  const inProgressCount = capList.filter((c) => c.status === 'in-progress').length;
  const closedCount = capList.filter((c) => c.status === 'closed').length;
  const closureRate = capList.length > 0 ? Math.round((closedCount / capList.length) * 100) : 100;

  // Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(29, 78, 216);
  doc.text('Corrective Action Plan (CAP) Report', margin, y + 3);
  y += 6.5;

  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42);
  doc.text(factoryName.toUpperCase(), margin, y + 4);
  y += 9;

  // Metadata Box
  const c1 = 28;
  const c2 = 65;
  const c3 = 30;
  const c4 = contentWidth - c1 - c2 - c3;
  doc.setDrawColor(100, 116, 139);
  doc.setLineWidth(0.2);

  const metaRows: Array<[string, string, string, string]> = [
    ['Audit Date', auditDate, 'Report No.', reportNo],
    ['Audit Type', report.factoryInfo.auditType || 'Annual Audit', 'Auditor', report.factoryInfo.auditorName || 'Lead Auditor'],
    ['CAP Updated', (report.capUpdatedAt || new Date().toISOString()).split('T')[0], 'Closure Rate', `${closedCount}/${capList.length} Closed (${closureRate}%)`],
  ];

  metaRows.forEach(([l1, v1, l2, v2]) => {
    doc.setFontSize(7.5);
    doc.setFillColor(248, 250, 252);
    doc.rect(margin, y, c1, 5.8, 'FD');
    doc.setFillColor(255, 255, 255);
    doc.rect(margin + c1, y, c2, 5.8, 'FD');
    doc.setFillColor(248, 250, 252);
    doc.rect(margin + c1 + c2, y, c3, 5.8, 'FD');
    doc.setFillColor(255, 255, 255);
    doc.rect(margin + c1 + c2 + c3, y, c4, 5.8, 'FD');

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(l1, margin + 2, y + 3.9);
    doc.text(l2, margin + c1 + c2 + 2, y + 3.9);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(v1, margin + c1 + 2, y + 3.9);
    doc.text(v2, margin + c1 + c2 + c3 + 2, y + 3.9);
    y += 5.8;
  });

  y += 5;

  // CAP Status Summary Cards Row
  const boxW = (contentWidth - 9) / 4;
  const statCards: Array<{ label: string; count: number; rgb: [number, number, number] }> = [
    { label: 'Total CAP Items', count: capList.length, rgb: [30, 58, 138] },
    { label: 'Open', count: openCount, rgb: [220, 38, 38] },
    { label: 'In Progress', count: inProgressCount, rgb: [217, 119, 6] },
    { label: 'Closed (Verified)', count: closedCount, rgb: [21, 128, 61] },
  ];

  statCards.forEach((card, idx) => {
    const bx = margin + idx * (boxW + 3);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(card.rgb[0], card.rgb[1], card.rgb[2]);
    doc.setLineWidth(0.35);
    doc.rect(bx, y, boxW, 13, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(card.rgb[0], card.rgb[1], card.rgb[2]);
    doc.text(card.label.toUpperCase(), bx + boxW / 2, y + 4.5, { align: 'center' });
    doc.setFontSize(12);
    doc.text(`${card.count}`, bx + boxW / 2, y + 10.5, { align: 'center' });
  });
  y += 18;

  if (capList.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(21, 128, 61);
    doc.text('No Corrective Action Plan (CAP) items found for this audit.', margin, y + 6);
  } else {
    capList.forEach((item, idx) => {
      checkPageBreak(42);
      const sevMeta = SCORE_DEFINITIONS[item.originalScore];
      const statusColor: [number, number, number] =
        item.status === 'closed'
          ? [21, 128, 61]
          : item.status === 'in-progress'
          ? [217, 119, 6]
          : [220, 38, 38];
      const statusText =
        item.status === 'closed' ? 'CLOSED (VERIFIED)' : item.status === 'in-progress' ? 'IN PROGRESS' : 'OPEN';

      // Item Header Box
      doc.setDrawColor(100, 116, 139);
      doc.setLineWidth(0.2);
      doc.setFillColor(248, 250, 252);
      const titleColW = contentWidth - 12 - 38;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      const titleLines = doc.splitTextToSize(`[${item.checkpointCode}] ${item.checkpointTitle}`, titleColW - 4);
      const h = Math.max(7, titleLines.length * 3.6 + 2.5);

      doc.rect(margin, y, 12, h, 'FD');
      doc.rect(margin + 12, y, titleColW, h, 'FD');
      doc.setFillColor(statusColor[0], statusColor[1], statusColor[2]);
      doc.rect(margin + 12 + titleColW, y, 38, h, 'FD');

      doc.setTextColor(15, 23, 42);
      doc.text(`#${idx + 1}`, margin + 6, y + 4.3, { align: 'center' });
      doc.text(titleLines, margin + 14, y + 4.3);

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(6.8);
      doc.text(statusText, margin + 12 + titleColW + 19, y + h / 2 + 1, { align: 'center' });
      y += h;

      // CAP Details Table
      const detailRows: Array<[string, string]> = [
        ['Section / Severity', `${item.sectionName}  •  ${sevMeta?.label || item.originalScore}`],
        ['Original Finding', item.originalNotes || 'Non-compliance observed during audit'],
        ['Root Cause', item.rootCause || 'Pending root cause analysis'],
        ['Corrective Action', item.correctiveAction || 'Pending corrective action plan'],
        [
          'Owner & Target Date',
          `Responsible: ${item.responsiblePerson || 'Not assigned'}   |   Target Date: ${item.targetDate || 'Not set'}`,
        ],
        [
          'Closure Verification',
          item.closureNotes || (item.status === 'closed' ? `Verified by ${item.verifiedBy || 'Auditor'}` : 'Pending verification'),
        ],
      ];

      detailRows.forEach(([label, val]) => {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.3);
        const vLines = doc.splitTextToSize(val, contentWidth - 42);
        const rh = Math.max(5.5, vLines.length * 3.5 + 2.2);
        checkPageBreak(rh + 2);

        doc.setFillColor(255, 255, 255);
        doc.rect(margin, y, 38, rh, 'FD');
        doc.rect(margin + 38, y, contentWidth - 38, rh, 'FD');

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(71, 85, 105);
        doc.text(label, margin + 2, y + 3.8);

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(15, 23, 42);
        doc.text(vLines, margin + 40, y + 3.8);
        y += rh;
      });

      y += 2;

      // Original Issue Photos + Closure Evidence Photos
      const beforePhotos = (item.originalImages || []).map((p: CheckpointEvidence, pIdx: number) => ({
        dataUrl: p.dataUrl,
        label: `Before Fix #${pIdx + 1}`,
      }));
      const afterPhotos = (item.closureImages || []).map((p: CheckpointEvidence, pIdx: number) => ({
        dataUrl: p.dataUrl,
        label: `After Fix (Closed) #${pIdx + 1}`,
      }));
      const allCapPhotos = [...beforePhotos, ...afterPhotos];
      if (allCapPhotos.length > 0) {
        y = drawPhotoGrid4Col(doc, allCapPhotos, margin, contentWidth, y, checkPageBreak);
      }

      y += 4;
    });
  }

  applyPageFooters(doc, factoryName, auditDate, margin);

  const sanitizedName = factoryName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const reportCode = reportNo.replace(/[^a-zA-Z0-9_-]/g, '_');
  doc.save(`CAP_Report_${sanitizedName}_${reportCode}.pdf`);
}
