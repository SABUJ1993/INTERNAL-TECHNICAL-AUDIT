import { jsPDF } from 'jspdf';
import { AuditReportData, SCORE_DEFINITIONS } from '../types/audit';
import { getScoreBandMeta } from './scoring';

export interface GeneratePdfOptions {
  includeCap?: boolean;
  selectedCapSectionIds?: string[];
}

export async function generateAuditPdf(
  report: AuditReportData,
  options?: GeneratePdfOptions
): Promise<void> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  const scoreBand = getScoreBandMeta(report.overallPercentage, report.totalCritical);

  const checkPageBreak = (neededHeight: number) => {
    if (y + neededHeight > pageHeight - 16) {
      doc.addPage();
      y = margin;
      drawHeaderFooter();
    }
  };

  const drawHeaderFooter = () => {
    // Header minimal bar
    doc.setFillColor(15, 23, 42); // slate-900
    doc.rect(0, 0, pageWidth, 4, 'F');

    // Footer - ONLY "Internal Technical Audit Report" (NO factory name like apex)
    const totalPages = (doc as any).internal.getNumberOfPages();
    const currentPage = (doc as any).internal.getCurrentPageInfo().pageNumber;
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(
      'Internal Technical Audit Report',
      margin,
      pageHeight - 8
    );
    doc.text(`Page ${currentPage} of ${totalPages}`, pageWidth - margin - 15, pageHeight - 8);
  };

  // --- COVER / HEADER ---
  doc.setFillColor(15, 23, 42);
  doc.roundedRect(margin, y, contentWidth, 28, 2, 2, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(255, 255, 255);
  doc.text('INTERNAL TECHNICAL AUDIT REPORT', margin + 6, y + 11);

  const auditorDisplayName = report.factoryInfo.auditorName || 'Lead Auditor';
  const auditorTitleName = (report.factoryInfo.auditorTitle || 'Lead QMS Auditor').replace(/\s*\(Admin\)/gi, '').trim();
  const auditor2DisplayName = report.factoryInfo.auditor2Name;
  const auditor2TitleName = (report.factoryInfo.auditor2Title || 'Technical Auditor').replace(/\s*\(Admin\)/gi, '').trim();
  const auditReportNo = report.factoryInfo.auditReportNo || report.factoryInfo.factoryRegistrationNo || 'N/A';

  const auditorHeaderString = auditor2DisplayName
    ? `Auditor-1: ${auditorDisplayName} (${auditorTitleName})  |  Auditor-2: ${auditor2DisplayName} (${auditor2TitleName})`
    : `Auditor-1: ${auditorDisplayName} (${auditorTitleName})`;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(203, 213, 225);
  doc.text(
    `Report No: ${auditReportNo}  |  Type: ${report.factoryInfo.auditType || 'Annual Audit'}  |  Date: ${report.factoryInfo.auditDate || new Date().toISOString().split('T')[0]}`,
    margin + 6,
    y + 19
  );
  doc.text(
    auditorHeaderString,
    margin + 6,
    y + 24
  );

  y += 33;

  // --- SCORECARD HERO CARD ---
  // Color coding requested:
  // < 50: Red Mark
  // 60 - 79.99: Amber Mark
  // >= 80: Deep Green Mark
  const [r, g, b] = scoreBand.rgb;
  const isRed = scoreBand.band === 'red';
  const isAmber = scoreBand.band === 'amber';

  const scoreCardBg = isRed ? [254, 242, 242] : isAmber ? [254, 252, 232] : [240, 253, 244];
  const scoreCardBorder = [r, g, b];

  doc.setFillColor(scoreCardBg[0], scoreCardBg[1], scoreCardBg[2]);
  doc.setDrawColor(scoreCardBorder[0], scoreCardBorder[1], scoreCardBorder[2]);
  doc.setLineWidth(0.8);
  doc.roundedRect(margin, y, contentWidth, 34, 3, 3, 'FD');

  // Left side: score percentage box with exact color coding
  doc.setFillColor(r, g, b);
  doc.roundedRect(margin + 4, y + 4, 38, 26, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(255, 255, 255);
  doc.text(`${report.overallPercentage}%`, margin + 23, y + 18, { align: 'center' });
  doc.setFontSize(7.5);
  doc.text('AUDIT SCORE', margin + 23, y + 25, { align: 'center' });

  // Center: Overall Grade & Status
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(r, g, b);
  doc.text(scoreBand.label, margin + 46, y + 12);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `Earned: ${report.totalScore} / ${report.maxPossibleScore} pts   |   Audited Checkpoints: ${report.sectionSummaries.reduce((acc, s) => acc + s.evaluatedCount, 0)}`,
    margin + 46,
    y + 19
  );

  // Issue Counts Badges
  const badgeX = margin + 46;
  const badgeY = y + 23.5;
  doc.setFontSize(8);

  // Not Accepted (0 pts)
  doc.setFillColor(239, 68, 68);
  doc.rect(badgeX, badgeY, 28, 5, 'F');
  doc.setTextColor(255, 255, 255);
  doc.text(`Not Accepted: ${report.totalCritical}`, badgeX + 2, badgeY + 3.8);

  // Below Expectation (3 pts)
  doc.setFillColor(234, 179, 8);
  doc.rect(badgeX + 30, badgeY, 26, 5, 'F');
  doc.setTextColor(15, 23, 42);
  doc.text(`Below Exp: ${report.totalMajor}`, badgeX + 32, badgeY + 3.8);

  // Acceptable (7 pts)
  doc.setFillColor(37, 99, 235);
  doc.rect(badgeX + 58, badgeY, 26, 5, 'F');
  doc.setTextColor(255, 255, 255);
  doc.text(`Acceptable: ${report.totalMinor}`, badgeX + 60, badgeY + 3.8);

  // Good (10 pts)
  doc.setFillColor(21, 128, 61); // deep green
  doc.rect(badgeX + 86, badgeY, 24, 5, 'F');
  doc.setTextColor(255, 255, 255);
  doc.text(`Good: ${report.totalNoIssue}`, badgeX + 88, badgeY + 3.8);

  y += 39;

  // --- FACTORY INFO & OPENING MEETING SECTION ---
  const profileBoxHeight = auditor2DisplayName ? 68 : 62;
  checkPageBreak(profileBoxHeight + 10);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);
  doc.text('1. FACTORY PROFILE & OPENING MEETING', margin, y);
  y += 4;

  const infoColWidth = report.factoryInfo.openingMeetingPhoto ? contentWidth * 0.65 : contentWidth;
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(margin, y, infoColWidth, profileBoxHeight, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);

  let infoY = y + 5.0;
  const printField = (label: string, value: string) => {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139);
    doc.text(`${label}:`, margin + 4, infoY);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(value || 'N/A', margin + 36, infoY);
    infoY += 4.3;
  };

  printField('Factory Name', report.factoryInfo.name || 'N/A');
  printField('Audit Report No', auditReportNo);
  printField('Audit Type', report.factoryInfo.auditType || 'Annual Audit');
  printField('Audit Date', report.factoryInfo.auditDate || new Date().toISOString().split('T')[0]);
  printField('Address', report.factoryInfo.address || 'N/A');
  if (report.factoryInfo.numberOfWorkers) {
    printField('No. of Workers', report.factoryInfo.numberOfWorkers);
  }
  if (report.factoryInfo.numberOfLines) {
    printField('No. of Lines', report.factoryInfo.numberOfLines);
  }
  if (report.factoryInfo.capacityPerMonth) {
    printField('Monthly Capacity', report.factoryInfo.capacityPerMonth);
  }
  printField('Contact Person', report.factoryInfo.contactPerson || 'N/A');
  if (report.factoryInfo.contactPhone) {
    printField('Contact Mobile', report.factoryInfo.contactPhone);
  }
  if (report.factoryInfo.contactEmail) {
    printField('Contact Email', report.factoryInfo.contactEmail);
  }
  printField('Buyer / Brand', report.factoryInfo.buyerBrand || 'N/A');

  // If opening meeting photo exists
  if (report.factoryInfo.openingMeetingPhoto) {
    const photoWidth = contentWidth * 0.32;
    const photoX = margin + infoColWidth + 3;
    try {
      doc.addImage(report.factoryInfo.openingMeetingPhoto, 'JPEG', photoX, y, photoWidth, profileBoxHeight - 6, undefined, 'FAST');
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text('Opening Meeting Photo', photoX + 2, y + profileBoxHeight - 2);
    } catch (e) {
      console.warn('Error adding opening meeting image to PDF', e);
    }
  }

  y += profileBoxHeight + 5;

  // --- FACTORY OUTLOOK / EXTERIOR MULTIPLE PHOTOS ---
  const outlookPhotos = report.factoryInfo.factoryOutlookPhotos || [];
  if (outlookPhotos.length > 0) {
    checkPageBreak(38);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text(`Factory Outlook & Exterior Photos (${outlookPhotos.length}):`, margin, y);
    y += 4;

    const photoWidth = 36;
    const photoHeight = 24;
    const photoSpacing = 4;
    const photosPerRow = 4;

    outlookPhotos.forEach((photo, idx) => {
      const col = idx % photosPerRow;
      const row = Math.floor(idx / photosPerRow);
      if (col === 0 && row > 0) {
        checkPageBreak(photoHeight + 6);
      }
      const pX = margin + col * (photoWidth + photoSpacing);
      const pY = y + row * (photoHeight + 5);

      try {
        doc.addImage(photo.dataUrl, 'JPEG', pX, pY, photoWidth, photoHeight, undefined, 'FAST');
        doc.setFontSize(6);
        doc.setTextColor(100, 116, 139);
        doc.text(`Outlook #${idx + 1}`, pX + 1, pY + photoHeight + 3);
      } catch (e) {
        console.warn(`Failed embedding factory outlook photo ${idx + 1}`, e);
      }
    });

    const totalRows = Math.ceil(outlookPhotos.length / photosPerRow);
    y += totalRows * (photoHeight + 5) + 3;
  }

  // --- FACTORY CERTIFICATIONS & FACILITIES ---
  checkPageBreak(30);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text('Factory Facilities & Certifications:', margin, y);
  y += 4;

  const activeFacilities = report.factoryInfo.facilities || [];
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);
  const facilityStr = activeFacilities.length > 0 ? activeFacilities.join('  •  ') : 'All departments assessed';
  const splitFacilities = doc.splitTextToSize(`Facilities: ${facilityStr}`, contentWidth);
  doc.text(splitFacilities, margin, y);
  y += splitFacilities.length * 4 + 2;

  const activeCerts = (report.factoryInfo.certifications || []).filter((c) => c.selected);
  if (activeCerts.length > 0) {
    const certStr = activeCerts.map((c) => c.name).join('  |  ');
    const splitCerts = doc.splitTextToSize(`Certifications: ${certStr}`, contentWidth);
    doc.text(splitCerts, margin, y);
    y += splitCerts.length * 4 + 3;

    const certsWithPhoto = activeCerts.filter((c) => c.photo);
    if (certsWithPhoto.length > 0) {
      checkPageBreak(36);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(`Certification Documents Photo Evidence (${certsWithPhoto.length}):`, margin, y);
      y += 3.5;

      const cPhotoWidth = 36;
      const cPhotoHeight = 24;
      const cPhotoSpacing = 4;
      const cPhotosPerRow = 4;

      certsWithPhoto.forEach((c, idx) => {
        const col = idx % cPhotosPerRow;
        const row = Math.floor(idx / cPhotosPerRow);
        if (col === 0 && row > 0) {
          checkPageBreak(cPhotoHeight + 6);
        }
        const pX = margin + col * (cPhotoWidth + cPhotoSpacing);
        const pY = y + row * (cPhotoHeight + 5);

        try {
          if (c.photo) {
            doc.addImage(c.photo, 'JPEG', pX, pY, cPhotoWidth, cPhotoHeight);
            doc.setFontSize(6);
            doc.setTextColor(100, 116, 139);
            const shortName = c.name.length > 20 ? c.name.substring(0, 18) + '...' : c.name;
            doc.text(shortName, pX + 1, pY + cPhotoHeight + 3);
          }
        } catch (e) {
          console.warn(`Failed embedding certification photo for ${c.name}`, e);
        }
      });

      const totalCRows = Math.ceil(certsWithPhoto.length / cPhotosPerRow);
      y += totalCRows * (cPhotoHeight + 5) + 3;
    }
  } else {
    y += 2;
  }

  // --- SECTION BREAKDOWN TABLE ---
  checkPageBreak(50);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);
  doc.text('2. SUMMARY', margin, y);
  y += 5;

  // Table Header
  doc.setFillColor(241, 245, 249);
  doc.rect(margin, y, contentWidth, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);
  doc.text('Department / Section', margin + 3, y + 4.8);
  doc.text('Points', margin + 68, y + 4.8);
  doc.text('Max', margin + 86, y + 4.8);
  doc.text('Score %', margin + 104, y + 4.8);
  doc.text('Critical', margin + 125, y + 4.8);
  doc.text('Major', margin + 142, y + 4.8);
  doc.text('Minor', margin + 158, y + 4.8);
  doc.text('Trend', margin + 175, y + 4.8);

  y += 8;

  report.sectionSummaries.forEach((s) => {
    checkPageBreak(8);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);

    doc.text(s.sectionName, margin + 3, y + 4);
    doc.text(`${s.earnedPoints}`, margin + 68, y + 4);
    doc.text(`${s.maxPoints}`, margin + 86, y + 4);

    // Color code per requested rule
    if (s.percentage >= 80) {
      doc.setTextColor(21, 128, 61); // deep green
    } else if (s.percentage >= 60) {
      doc.setTextColor(217, 119, 6); // amber
    } else {
      doc.setTextColor(220, 38, 38); // red
    }

    doc.setFont('helvetica', 'bold');
    doc.text(`${s.percentage}%`, margin + 104, y + 4);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(s.criticalCount > 0 ? 220 : 100, s.criticalCount > 0 ? 38 : 116, s.criticalCount > 0 ? 38 : 139);
    doc.text(`${s.criticalCount}`, margin + 128, y + 4);

    doc.setTextColor(s.majorCount > 0 ? 202 : 100, s.majorCount > 0 ? 138 : 116, s.majorCount > 0 ? 4 : 139);
    doc.text(`${s.majorCount}`, margin + 145, y + 4);

    doc.setTextColor(s.minorCount > 0 ? 217 : 100, s.minorCount > 0 ? 119 : 116, s.minorCount > 0 ? 6 : 139);
    doc.text(`${s.minorCount}`, margin + 161, y + 4);

    // Visual color trend bar (-----) without text like "amber mark"
    if (s.percentage >= 80) {
      doc.setFillColor(21, 128, 61); // deep green
    } else if (s.percentage >= 60) {
      doc.setFillColor(217, 119, 6); // amber
    } else {
      doc.setFillColor(220, 38, 38); // red
    }
    doc.roundedRect(margin + 175, y + 2, 16, 2.5, 1, 1, 'F');

    // Underline
    doc.setDrawColor(241, 245, 249);
    doc.line(margin, y + 6, margin + contentWidth, y + 6);
    y += 7;
  });

  y += 5;

  // --- EXECUTIVE SUMMARY ---
  if (report.executiveSummary) {
    checkPageBreak(28);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text('Executive Summary & Observations:', margin, y);
    y += 4;

    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    const splitSummary = doc.splitTextToSize(report.executiveSummary, contentWidth - 8);
    const summaryHeight = splitSummary.length * 4.5 + 8;
    doc.roundedRect(margin, y, contentWidth, summaryHeight, 2, 2, 'FD');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(51, 65, 85);
    doc.text(splitSummary, margin + 4, y + 5);
    y += summaryHeight + 6;
  }

  // --- DETAILED NON-CONFORMANCES & MULTIPLE PHOTO EVIDENCE SECTION ---
  checkPageBreak(40);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);
  doc.text('3. NON-CONFORMANCE LOG & MULTI-PHOTO EVIDENCE', margin, y);
  y += 6;

  let nonConformanceCount = 0;

  for (const section of report.sections) {
    const issues = section.checkpoints.filter(
      (cp) =>
        cp.score === 'critical' ||
        cp.score === 'major' ||
        cp.score === 'minor' ||
        (cp.images && cp.images.length > 0) ||
        (cp.notes && cp.notes.trim().length > 0)
    );

    if (issues.length === 0) continue;

    checkPageBreak(18);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(30, 41, 59);
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(margin, y, contentWidth, 6, 1, 1, 'F');
    doc.text(`${section.name} (${section.code})`, margin + 3, y + 4.2);
    y += 9;

    for (const cp of issues) {
      nonConformanceCount++;
      const scoreMeta = cp.score ? SCORE_DEFINITIONS[cp.score] : null;
      const imagesCount = cp.images?.length || 0;

      // Calculate dynamic height based on number of attached photos
      // Images rendered in rows of up to 3 photos each
      const imageRows = Math.ceil(imagesCount / 3);
      const photoRowHeight = 32;
      const photosTotalHeight = imageRows > 0 ? imageRows * photoRowHeight + 4 : 0;
      const neededHeight = Math.max(22, 18 + photosTotalHeight);

      checkPageBreak(neededHeight + 4);

      // Card box
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(margin, y, contentWidth, neededHeight, 1.5, 1.5, 'FD');

      // Checkpoint Code & Title
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42);
      doc.text(`[${cp.code}] ${cp.title}`, margin + 3, y + 5);

      // Score Pill
      if (scoreMeta) {
        if (cp.score === 'critical') doc.setFillColor(239, 68, 68);
        else if (cp.score === 'major') doc.setFillColor(234, 179, 8);
        else if (cp.score === 'minor') doc.setFillColor(217, 119, 6);
        else doc.setFillColor(21, 128, 61);

        doc.rect(margin + contentWidth - 40, y + 2, 38, 4.5, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(cp.score === 'major' ? 15 : 255, cp.score === 'major' ? 23 : 255, cp.score === 'major' ? 42 : 255);
        doc.text(`${scoreMeta.label} (${scoreMeta.points} pts)`, margin + contentWidth - 38, y + 5.2);
      }

      // Checkpoint Notes & Observation
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(71, 85, 105);
      const notesText = cp.notes ? `Observation: ${cp.notes}` : `Requirement: ${cp.description}`;
      const splitNotes = doc.splitTextToSize(notesText, contentWidth - 8);
      doc.text(splitNotes, margin + 3, y + 10);

      // Render ALL multiple photos in a clean grid
      if (imagesCount > 0) {
        let currentPhotoY = y + 14 + (splitNotes.length > 1 ? 4 : 0);
        const photoWidth = 42;
        const photoHeight = 28;
        const photoSpacing = 4;

        cp.images.forEach((img, imgIdx) => {
          const col = imgIdx % 3;
          const row = Math.floor(imgIdx / 3);
          const imgX = margin + 3 + col * (photoWidth + photoSpacing);
          const imgY = currentPhotoY + row * (photoHeight + 4);

          try {
            doc.addImage(img.dataUrl, 'JPEG', imgX, imgY, photoWidth, photoHeight, undefined, 'FAST');
            doc.setFontSize(6);
            doc.setTextColor(148, 163, 184);
            doc.text(`Photo ${imgIdx + 1}`, imgX + 1, imgY + photoHeight + 3);
          } catch (e) {
            console.warn(`Failed embedding photo ${imgIdx + 1}`, e);
          }
        });
      }

      y += neededHeight + 3;
    }
  }

  if (nonConformanceCount === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(21, 128, 61);
    doc.text('No non-conformances identified during this technical audit.', margin + 3, y + 4);
    y += 10;
  }

  // --- OPTIONAL CAP (CUSTOM SECTION SELECTION OR LOW SCORES) ---
  if (options?.includeCap) {
    const targetSections = report.sectionSummaries.filter((s) => {
      if (options.selectedCapSectionIds && options.selectedCapSectionIds.length > 0) {
        return options.selectedCapSectionIds.includes(s.sectionId);
      }
      return s.percentage < 70 || s.criticalCount > 0;
    });

    if (targetSections.length > 0) {
      checkPageBreak(45);
      y += 6;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(15, 23, 42);
      doc.text('4. CORRECTIVE ACTION PLAN (CAP) PROTOCOL', margin, y);
      y += 6;

      targetSections.forEach((sec) => {
        checkPageBreak(26);
        doc.setFillColor(254, 242, 242);
        doc.setDrawColor(252, 165, 165);
        doc.roundedRect(margin, y, contentWidth, 20, 2, 2, 'FD');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(153, 27, 27);
        doc.text(`${sec.sectionName} — Score: ${sec.percentage}% (${sec.criticalCount} Critical, ${sec.majorCount} Below Expectation)`, margin + 4, y + 6);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(71, 85, 105);
        doc.text('Action Required: Formal Root Cause Analysis (RCA) and preventive action plan submission within 14 working days.', margin + 4, y + 11);
        doc.text('Verification: On-site follow-up audit required before buyer production approval.', margin + 4, y + 16);

        y += 24;
      });
    }
  }

  // Apply clean Header & Footer across ALL pages
  const totalPages = (doc as any).internal.getNumberOfPages();
  const auditedFactoryName = report.factoryInfo.name || 'Factory';
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    // Header bar
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, pageWidth, 3, 'F');

    // Footer: Left = Audited Factory Name; Right = Auditor(s) + Page No
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(71, 85, 105);
    doc.text(`Factory: ${auditedFactoryName}`, margin, pageHeight - 5);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    const footerAuditor = auditor2DisplayName
      ? `Auditors: ${auditorDisplayName} & ${auditor2DisplayName}`
      : `Auditor: ${auditorDisplayName}`;
    doc.text(`${footerAuditor}  |  Page ${i} of ${totalPages}`, pageWidth - margin, pageHeight - 5, { align: 'right' });
  }

  // Trigger download with clean filename
  const sanitizedName = (report.factoryInfo.name || 'Factory').replace(/[^a-zA-Z0-9_-]/g, '_');
  const reportCode = (report.factoryInfo.auditReportNo || report.id || 'Audit').replace(/[^a-zA-Z0-9_-]/g, '_');
  doc.save(`Internal_Technical_Audit_${sanitizedName}_${reportCode}.pdf`);
}
