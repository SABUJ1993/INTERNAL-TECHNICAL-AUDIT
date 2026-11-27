import React, { useState } from 'react';
import {
  Mail,
  X,
  Download,
  Share2,
  CheckCircle2,
  Send,
  Copy,
  Check,
  FileText,
} from 'lucide-react';
import { AuditReportData } from '../types/audit';
import { generateAuditPdfBlob } from '../utils/pdfGenerator';

interface Props {
  isOpen: boolean;
  report: AuditReportData | null;
  pdfBlob: Blob | null;
  pdfFileName: string;
  autoDownloaded?: boolean;
  onClose: () => void;
}

export const EmailDispatchModal: React.FC<Props> = ({
  isOpen,
  report,
  pdfBlob,
  pdfFileName,
  autoDownloaded = false,
  onClose,
}) => {
  const [copiedEmails, setCopiedEmails] = useState(false);
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);

  if (!isOpen || !report) return null;

  const recipients: string[] = Array.from(
    new Set(
      [
        ...(report.factoryInfo.contactEmails || []),
        ...(report.factoryInfo.contactEmail
          ? report.factoryInfo.contactEmail.split(/[,;\s]+/)
          : []),
      ]
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean)
    )
  );

  const factoryName = report.factoryInfo.name || 'Factory';
  const auditDate = report.factoryInfo.auditDate || new Date().toISOString().split('T')[0];
  const reportNo = report.factoryInfo.auditReportNo || report.id;

  const emailSubject = `Technical Audit Report - ${factoryName} (${reportNo}) - Score: ${report.overallPercentage}%`;
  const emailBody = [
    `Dear Factory Management / Compliance Team,`,
    ``,
    `Please find the Internal Technical Audit Report for ${factoryName}.`,
    ``,
    `Audit Summary:`,
    `- Report No: ${reportNo}`,
    `- Audit Type: ${report.factoryInfo.auditType || 'Annual Audit'}`,
    `- Audit Date: ${auditDate}`,
    `- Auditor: ${report.factoryInfo.auditorName || 'Lead Auditor'}`,
    `- Overall Score: ${report.overallPercentage}% (${report.overallGrade})`,
    `- Findings: ${report.totalCritical} Not Accepted | ${report.totalMajor} Below Expectation | ${report.totalMinor} Acceptable | ${report.totalNoIssue} Good`,
    ``,
    `${report.executiveSummary || ''}`,
    ``,
    `Note: The PDF Audit Report (${pdfFileName || 'Audit_Report.pdf'}) has been generated and downloaded on the auditor's device. Please attach it if sending from desktop mail client.`,
    ``,
    `Best regards,`,
    `${report.factoryInfo.auditorName || 'Internal Technical Audit Team'}`,
  ].join('\n');

  const handleDownloadPdfAgain = async () => {
    try {
      setRegenerating(true);
      let activeBlob = pdfBlob;
      let activeName = pdfFileName;
      if (!activeBlob) {
        const res = await generateAuditPdfBlob(report);
        activeBlob = res.blob;
        activeName = res.fileName;
      }
      const url = URL.createObjectURL(activeBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = activeName || `Audit_Report_${reportNo}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } finally {
      setRegenerating(false);
    }
  };

  const handleSharePdfWithAttachment = async () => {
    try {
      let activeBlob = pdfBlob;
      let activeName = pdfFileName || `Audit_Report_${reportNo}.pdf`;
      if (!activeBlob) {
        setRegenerating(true);
        const res = await generateAuditPdfBlob(report);
        activeBlob = res.blob;
        activeName = res.fileName;
        setRegenerating(false);
      }

      const file = new File([activeBlob], activeName, { type: 'application/pdf' });
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: emailSubject,
          text: `Recipients: ${recipients.join(', ')}\n\n${emailBody}`,
          files: [file],
        });
        setShareStatus('PDF shared successfully!');
        return;
      }
      // Fallback to mailto
      handleOpenMailClient();
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        handleOpenMailClient();
      }
    }
  };

  const handleOpenMailClient = () => {
    const to = recipients.join(',');
    const mailtoUrl = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(
      emailSubject
    )}&body=${encodeURIComponent(emailBody)}`;
    window.location.href = mailtoUrl;
    setShareStatus('Opened mail app with pre-filled recipients & summary. Attach the downloaded PDF.');
  };

  const handleCopyRecipients = () => {
    if (recipients.length === 0) return;
    navigator.clipboard?.writeText(recipients.join(', ')).then(() => {
      setCopiedEmails(true);
      setTimeout(() => setCopiedEmails(false), 2000);
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/65 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-700 to-indigo-700 px-5 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-white/15">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black leading-tight">
                Audit Submitted &amp; PDF Report Ready
              </h2>
              <p className="text-xs text-blue-100">
                Dispatch PDF report to factory contact email(s)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/20 text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {autoDownloaded && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-start gap-2.5 text-xs text-emerald-900">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <strong className="block">Audit Saved &amp; PDF Downloaded!</strong>
                <span className="text-emerald-700">
                  File saved as <span className="font-mono font-semibold">{pdfFileName}</span>
                </span>
              </div>
            </div>
          )}

          {/* Recipients */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700">
                Contact Email Recipients ({recipients.length})
              </span>
              {recipients.length > 0 && (
                <button
                  type="button"
                  onClick={handleCopyRecipients}
                  className="text-[11px] font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer"
                >
                  {copiedEmails ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedEmails ? 'Copied!' : 'Copy All'}</span>
                </button>
              )}
            </div>

            {recipients.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                {recipients.map((email) => (
                  <span
                    key={email}
                    className="px-2.5 py-1 rounded-lg bg-white border border-blue-200 text-blue-900 text-xs font-semibold flex items-center gap-1"
                  >
                    <Mail className="w-3 h-3 text-blue-600" />
                    <span>{email}</span>
                  </span>
                ))}
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
                No contact emails were added in Pre-Audit. You can still download or share the PDF below.
              </div>
            )}
          </div>

          {/* Dispatch Action Buttons */}
          <div className="space-y-2 pt-1">
            <button
              type="button"
              onClick={handleSharePdfWithAttachment}
              disabled={regenerating}
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs sm:text-sm shadow-md flex items-center justify-center gap-2 cursor-pointer"
            >
              <Share2 className="w-4 h-4" />
              <span>Send / Share PDF File to Email or Apps</span>
            </button>

            {recipients.length > 0 && (
              <button
                type="button"
                onClick={handleOpenMailClient}
                className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer"
              >
                <Send className="w-4 h-4" />
                <span>Open Mail App (Pre-filled to {recipients.length} Recipient{recipients.length > 1 ? 's' : ''})</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleDownloadPdfAgain}
              disabled={regenerating}
              className="w-full py-2 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{regenerating ? 'Preparing PDF...' : 'Download Audit PDF Again'}</span>
            </button>
          </div>

          {shareStatus && (
            <p className="text-[11px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg p-2.5">
              {shareStatus}
            </p>
          )}
        </div>

        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <span className="text-[11px] text-slate-500 flex items-center gap-1">
            <FileText className="w-3.5 h-3.5 text-slate-400" />
            <span>Score: {report.overallPercentage}%</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
