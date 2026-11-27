import React, { useState } from 'react';
import {
  X,
  Share2,
  Copy,
  Check,
  QrCode,
  Download,
  Smartphone,
  Monitor,
  Globe,
  ExternalLink,
} from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  factoryName?: string;
  auditId?: string;
}

export const ShareAppModal: React.FC<Props> = ({
  isOpen,
  onClose,
  factoryName,
  auditId,
}) => {
  const [copied, setCopied] = useState(false);
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();

  if (!isOpen) return null;

  // Use the active runtime origin or canonical Firebase Hosting web.app URL
  const shareUrl = typeof window !== 'undefined'
    ? (window.location.origin.includes('localhost')
        ? 'https://internal-technical-audit-3c4a2.web.app'
        : window.location.origin)
    : 'https://internal-technical-audit-3c4a2.web.app';

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Internal Technical Audit Suite',
          text: `Access Internal Technical Audit App for ${factoryName || 'Factory Assessment'}`,
          url: shareUrl,
        });
      } catch (err) {
        console.warn('Share aborted or failed', err);
      }
    } else {
      handleCopy();
    }
  };

  // Generate QR Code via standard Google Charts API / SVG
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(
    shareUrl
  )}&bgcolor=ffffff&color=0f172a&margin=1`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 bg-white text-slate-900 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-50 text-blue-600 border border-blue-200">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-900">Browser &amp; Device Access</h3>
              <p className="text-xs text-slate-500">Use seamlessly on Android mobile &amp; PC desktop browsers</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* App Icon & Identity Card */}
        <div className="px-6 py-3.5 flex items-center gap-3.5 bg-slate-50 border-b border-slate-200/80">
          <img
            src="/app-icon.png"
            alt="Internal Technical Audit Icon"
            className="w-14 h-14 rounded-2xl shadow-md border border-slate-200 object-cover shrink-0"
          />
          <div>
            <h4 className="text-sm font-black text-slate-900 leading-tight">
              Internal Technical Audit
            </h4>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Garments Technical Audit & QMS Inspection Suite
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 overflow-y-auto max-h-[75vh]">
          {/* Method 1: Direct Web Link (For Any Browser) */}
          <div className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50/60 rounded-2xl border border-blue-200 space-y-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-blue-600 text-white">
                <Globe className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                  Option 1: Direct Web App Link (Android & PC)
                </h4>
                <p className="text-[11px] text-slate-600">
                  Compatible with Chrome, Edge, Safari, Firefox, and Samsung Internet
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={shareUrl}
                className="flex-1 bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono text-slate-700 select-all outline-none"
              />
              <button
                type="button"
                onClick={handleCopy}
                className={`px-3 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
                  copied
                    ? 'bg-emerald-600 text-white'
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied!' : 'Copy Link'}</span>
              </button>
            </div>

            <div className="text-[11px] text-slate-600 bg-white/90 p-2.5 rounded-xl border border-blue-100 space-y-1">
              <strong className="block text-slate-800">Browser Access Capabilities:</strong>
              <ul className="list-disc pl-4 space-y-0.5">
                <li>Capture factory outlook photos & audit evidence directly using mobile camera.</li>
                <li>Conduct fast checklist assessments with auto-saving local drafts on desktop PC.</li>
                <li>Generate and export multi-page executive PDF audit reports in one click.</li>
              </ul>
            </div>
          </div>

          {/* OPTION 2: Convert to Standalone Android APK File */}
          <div className="p-4 bg-gradient-to-br from-emerald-50 to-teal-50/60 rounded-2xl border border-emerald-200 space-y-2.5">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-emerald-700 text-white">
                <Smartphone className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                  Option 2: Generate Standalone Android .APK
                </h4>
                <p className="text-[11px] text-slate-600">
                  Convert the package to an installable Android APK file
                </p>
              </div>
            </div>

            <div className="text-[11px] text-slate-700 bg-white/80 p-2.5 rounded-xl border border-emerald-100 space-y-1.5">
              <p>
                To generate a direct <strong>.apk</strong> installer file for any Android phone:
              </p>
              <ul className="list-disc pl-4 space-y-1 text-slate-600">
                <li>
                  <strong>Method 1 (Instant 1-Click APK via AppsGeyser):</strong> Go to{' '}
                  <a
                    href="https://www.appsgeyser.com/create-url-app/"
                    target="_blank"
                    rel="noreferrer"
                    className="text-emerald-700 font-bold underline inline-flex items-center gap-0.5"
                  >
                    appsgeyser.com <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                  , paste your app URL, enter <em>Internal Technical Audit</em>, and click <strong>Create &amp; Download APK</strong>.
                </li>
                <li>
                  <strong>Method 2 (PWABuilder by Microsoft):</strong> Visit{' '}
                  <a
                    href="https://www.pwabuilder.com"
                    target="_blank"
                    rel="noreferrer"
                    className="text-emerald-700 font-bold underline inline-flex items-center gap-0.5"
                  >
                    pwabuilder.com <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                  , enter your live app URL, and click <strong>Package for Android (APK)</strong>.
                </li>
              </ul>
            </div>
          </div>

          {/* OPTION 3: Download Production Build Files (.zip) */}
          <div className="p-4 bg-gradient-to-br from-amber-50 to-orange-50/60 rounded-2xl border border-amber-200 space-y-2.5">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-amber-600 text-white">
                <Download className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                  Option 3: Download Production Build (.zip)
                </h4>
                <p className="text-[11px] text-slate-600">
                  Ready for Firebase Hosting / Offline execution
                </p>
              </div>
            </div>

            <p className="text-[11px] text-slate-600">
              Download the complete pre-compiled Vite package with HTML, JS, CSS, PWA Manifest, and icons.
            </p>

            <div className="flex flex-col sm:flex-row gap-2">
              <a
                href="/Internal_Technical_Audit_Production_Build.zip"
                download="Internal_Technical_Audit_Production_Build.zip"
                className="flex-1 py-2.5 px-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-md shadow-amber-600/20 flex items-center justify-center gap-2 transition-all cursor-pointer text-center"
              >
                <Download className="w-4 h-4" />
                <span>Direct ZIP Download</span>
              </a>
            </div>
          </div>

          {/* OPTION 4: Install PWA Directly on Current Device */}
          <div className="pt-2 border-t border-slate-100 space-y-3">
            <span className="text-xs font-bold text-slate-800 block">
              Option 4: Install App on this Device (PWA):
            </span>

            {isInstalled ? (
              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Application is already installed in Standalone mode on this device.</span>
              </div>
            ) : isInstallable ? (
              <button
                type="button"
                onClick={install}
                className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Install App on Android / Windows</span>
              </button>
            ) : isIOS ? (
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-700 space-y-1">
                <strong className="block text-slate-900 font-bold">Install on iPhone / iPad:</strong>
                <ol className="list-decimal pl-4 space-y-0.5 text-[11px] text-slate-600">
                  <li>Tap the <strong>Share</strong> icon in Safari toolbar.</li>
                  <li>Scroll down and select <strong>&quot;Add to Home Screen&quot;</strong>.</li>
                  <li>Tap <strong>Add</strong> to use like a native app.</li>
                </ol>
              </div>
            ) : (
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600">
                <span>To install on Chrome/Edge: Tap the 3 dots menu and click <strong>&quot;Install app&quot;</strong> or <strong>&quot;Add to Home screen&quot;</strong>.</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-600">
          <span className="font-medium text-slate-500">Internal Technical Audit System</span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
