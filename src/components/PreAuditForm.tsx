import React, { useRef, useState } from 'react';
import {
  Building2,
  Camera,
  Trash2,
  CheckCircle2,
  Award,
  Sparkles,
  Plus,
  ArrowRight,
  Upload,
  Calendar,
  Layers,
  Phone,
  Mail,
  User,
  MapPin,
  Check,
  Eye,
  Images,
  Compass,
  Clock,
  Play,
  Pause,
  RotateCcw,
  Users,
  UserCheck,
  Copy,
  ArrowRightLeft,
} from 'lucide-react';
import { FactoryInfo, FactoryCertification, AuditType, CheckpointEvidence } from '../types/audit';
import { FACTORY_FACILITIES } from '../data/facilities';
import { formatTimeClock, formatHumanDuration } from '../utils/durationTimer';
import { optimizeAuditImage, optimizeAuditImageWithMeta } from '../utils/imageCompressor';
import { PhotoLocation } from './PhotoActionModal';
import { EvidencePhotoThumbnail } from './EvidencePhotoThumbnail';

interface Props {
  factoryInfo: FactoryInfo;
  onChange: (updated: FactoryInfo) => void;
  onProceedToAudit: () => void;
  onOpenPreviewImage?: (evidence: CheckpointEvidence) => void;
  onOpenPhotoAction?: (evidence: CheckpointEvidence, sourceLocation: PhotoLocation) => void;
  onClearAllData?: () => void;
}

const AUDIT_TYPE_OPTIONS: AuditType[] = [
  'Annual Audit',
  'Initial Audit',
  '1st Follow-up Audit',
  '2nd Follow-up Audit',
  '3rd Follow-up Audit',
  'Re-Audit',
];

export const PreAuditForm: React.FC<Props> = ({
  factoryInfo,
  onChange,
  onProceedToAudit,
  onOpenPreviewImage,
  onOpenPhotoAction,
  onClearAllData,
}) => {
  const openingMeetingInputRef = useRef<HTMLInputElement>(null);
  const factoryOutlookInputRef = useRef<HTMLInputElement>(null);
  const [newCertName, setNewCertName] = useState('');
  const [showAddCert, setShowAddCert] = useState(false);

  const handleFieldChange = (field: keyof FactoryInfo, value: any) => {
    onChange({
      ...factoryInfo,
      [field]: value,
    });
  };

  const handleFacilityToggle = (facilityName: string) => {
    const current = factoryInfo.facilities || [];
    const exists = current.includes(facilityName);
    const updated = exists
      ? current.filter((f) => f !== facilityName)
      : [...current, facilityName];
    handleFieldChange('facilities', updated);
  };

  const handleSelectAllFacilities = () => {
    handleFieldChange(
      'facilities',
      FACTORY_FACILITIES.map((f) => f.name)
    );
  };

  const handleDeselectAllFacilities = () => {
    handleFieldChange('facilities', []);
  };

  const handleCertToggle = (id: string) => {
    const updated = factoryInfo.certifications.map((c) =>
      c.id === id ? { ...c, selected: !c.selected } : c
    );
    handleFieldChange('certifications', updated);
  };

  const handleCertPhotoUpload = async (certId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const dataUrl = await optimizeAuditImage(file, 1400, 1000, 0.82);
      const updated = factoryInfo.certifications.map((c) =>
        c.id === certId
          ? {
              ...c,
              selected: true,
              photo: dataUrl,
              photoTimestamp: new Date().toISOString(),
            }
          : c
      );
      handleFieldChange('certifications', updated);
    } catch (err) {
      console.warn('Error optimizing certification photo', err);
    }
    e.target.value = '';
  };

  const handleRemoveCertPhoto = (certId: string) => {
    const updated = factoryInfo.certifications.map((c) =>
      c.id === certId
        ? {
            ...c,
            photo: undefined,
            photoTimestamp: undefined,
          }
        : c
    );
    handleFieldChange('certifications', updated);
  };

  const handleAddCustomCert = () => {
    if (!newCertName.trim()) return;
    const newCert: FactoryCertification = {
      id: `cert-${Date.now()}`,
      name: newCertName.trim(),
      selected: true,
      isCustom: true,
    };
    handleFieldChange('certifications', [...factoryInfo.certifications, newCert]);
    setNewCertName('');
    setShowAddCert(false);
  };

  // Opening Meeting Photo Upload
  const handleOpeningPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const meta = await optimizeAuditImageWithMeta(file, 1200, 0.72);
      onChange({
        ...factoryInfo,
        openingMeetingPhoto: meta.dataUrl,
        openingMeetingPhotoTimestamp: new Date().toISOString(),
        openingMeetingPhotoConfirmed: true,
        openingMeetingPhotoAspectRatio: meta.aspectRatio,
      });
    } catch (err) {
      console.warn('Error optimizing opening meeting photo', err);
    }
    e.target.value = '';
  };

  const handleToggleConfirmOpeningPhoto = () => {
    onChange({
      ...factoryInfo,
      openingMeetingPhotoConfirmed: !factoryInfo.openingMeetingPhotoConfirmed,
    });
  };

  const handleRemoveOpeningPhoto = () => {
    onChange({
      ...factoryInfo,
      openingMeetingPhoto: undefined,
      openingMeetingPhotoTimestamp: undefined,
      openingMeetingPhotoConfirmed: undefined,
      openingMeetingPhotoAspectRatio: undefined,
    });
  };

  // Factory Outlook Multiple Photos Upload
  const handleOutlookPhotosUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileList = Array.from(files);
    const newEvidences: CheckpointEvidence[] = [];

    for (let index = 0; index < fileList.length; index++) {
      const file = fileList[index];
      try {
        const meta = await optimizeAuditImageWithMeta(file, 1200, 0.72);
        newEvidences.push({
          id: `outlook-${Date.now()}-${index}-${Math.random().toString(36).substring(5)}`,
          dataUrl: meta.dataUrl,
          aspectRatio: meta.aspectRatio,
          isConfirmed: true, // Default to confirmed upon snap, auditor can toggle
          timestamp: new Date().toISOString(),
          caption: file.name || `Factory Outlook #${(factoryInfo.factoryOutlookPhotos?.length || 0) + index + 1}`,
        });
      } catch (err) {
        console.warn('Error optimizing outlook photo', err);
      }
    }

    if (newEvidences.length > 0) {
      const currentPhotos = factoryInfo.factoryOutlookPhotos || [];
      handleFieldChange('factoryOutlookPhotos', [...currentPhotos, ...newEvidences]);
    }
    e.target.value = '';
  };

  const handleToggleConfirmOutlookPhoto = (photoId: string) => {
    const current = factoryInfo.factoryOutlookPhotos || [];
    const updated = current.map((p) =>
      p.id === photoId ? { ...p, isConfirmed: !p.isConfirmed } : p
    );
    handleFieldChange('factoryOutlookPhotos', updated);
  };

  const handleConfirmAllOutlookPhotos = () => {
    const current = factoryInfo.factoryOutlookPhotos || [];
    const updated = current.map((p) => ({ ...p, isConfirmed: true }));
    handleFieldChange('factoryOutlookPhotos', updated);
  };

  const handleRemoveOutlookPhoto = (photoId: string) => {
    const current = factoryInfo.factoryOutlookPhotos || [];
    handleFieldChange(
      'factoryOutlookPhotos',
      current.filter((p) => p.id !== photoId)
    );
  };

  // Clear all form data and reset to fresh blank state
  const handleClearForm = () => {
    if (onClearAllData) {
      onClearAllData();
      return;
    }
    if (confirm('Are you sure you want to clear all form fields, uploaded photos, and entered data?')) {
      onChange({
        ...factoryInfo,
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
        auditType: 'Annual Audit',
        buyerBrand: '',
        auditReportNo: '',
        factoryRegistrationNo: '',
        facilities: [],
        certifications: factoryInfo.certifications.map((c) => ({ ...c, selected: false, photo: undefined })),
        factoryOutlookPhotos: [],
        openingMeetingPhoto: undefined,
        openingMeetingPhotoTimestamp: undefined,
        openingMeetingNotes: '',
      });
    }
  };

  return (
    <div className="w-full max-w-[1720px] mx-auto space-y-6 pb-12 animate-in fade-in duration-200">
      {/* Page Header */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-600 shrink-0"></span>
            <span className="text-xs uppercase font-bold tracking-wider text-blue-600">Step 1 of 3</span>
          </div>
          <h1 className="text-sm sm:text-base md:text-xl font-black text-slate-900 tracking-tight mt-1 whitespace-nowrap overflow-x-auto no-scrollbar">
            Pre Audit Factory Setup & Profile
          </h1>
          <p className="text-xs text-slate-500 mt-0.5 truncate">
            {factoryInfo.name || 'New Inspection Profile'} • Audit metadata, classification, exterior photos, and facilities.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleClearForm}
            className="px-3.5 py-2 text-xs font-bold rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition-colors flex items-center gap-1.5 cursor-pointer"
            title="Clear all fields, inputs and photos"
          >
            <RotateCcw className="w-3.5 h-3.5 text-rose-600" />
            <span>Clear All Data</span>
          </button>

          <button
            type="button"
            onClick={onProceedToAudit}
            className="px-4 py-2 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20 transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <span>Proceed to Checkpoints</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Factory Information */}
        <div className="lg:col-span-2 space-y-6">
          {/* 1. Factory Information */}
          <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
              <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">Factory Information</h2>
                <p className="text-xs text-slate-500">Legal entity name, location coordinates, and primary contacts</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Factory Name <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                  <input
                    type="text"
                    value={factoryInfo.name}
                    onChange={(e) => handleFieldChange('name', e.target.value)}
                    placeholder="e.g. Northern Fashions Ltd."
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 focus:outline-none font-semibold text-slate-900"
                    required
                  />
                </div>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Factory Address <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                  <input
                    type="text"
                    value={factoryInfo.address}
                    onChange={(e) => handleFieldChange('address', e.target.value)}
                    placeholder="e.g. Plot # 12-14, Block # B, Tongi Industrial Area, Gazipur, Bangladesh"
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 focus:outline-none"
                    required
                  />
                </div>
              </div>

              {/* 3 New Fields right after Factory Address */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Number of Workers
                </label>
                <div className="relative">
                  <Users className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                  <input
                    type="text"
                    value={factoryInfo.numberOfWorkers || ''}
                    onChange={(e) => handleFieldChange('numberOfWorkers', e.target.value)}
                    placeholder="e.g. 1,450 Workers"
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 focus:outline-none font-medium text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Number of Lines
                </label>
                <div className="relative">
                  <Layers className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                  <input
                    type="text"
                    value={factoryInfo.numberOfLines || ''}
                    onChange={(e) => handleFieldChange('numberOfLines', e.target.value)}
                    placeholder="e.g. 16 Sewing Lines"
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 focus:outline-none font-medium text-slate-900"
                  />
                </div>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Capacity (Per Month)
                </label>
                <div className="relative">
                  <Award className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                  <input
                    type="text"
                    value={factoryInfo.capacityPerMonth || ''}
                    onChange={(e) => handleFieldChange('capacityPerMonth', e.target.value)}
                    placeholder="e.g. 500,000 Pcs / Month"
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 focus:outline-none font-medium text-slate-900"
                  />
                </div>
              </div>

              {/* AUDIT TYPE SELECTOR (User specified: Initial, 1st Follow-up, 2nd Follow-up, 3rd Follow-up, Re-Audit) */}
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-800 mb-1.5 flex items-center gap-1.5">
                  <Compass className="w-4 h-4 text-blue-600" />
                  <span>Audit Classification / Type <span className="text-red-500">*</span></span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                  {AUDIT_TYPE_OPTIONS.map((type) => {
                    const isSelected = (factoryInfo.auditType || 'Annual Audit') === type;
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => handleFieldChange('auditType', type)}
                        className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all text-center cursor-pointer ${
                          isSelected
                            ? 'bg-blue-600 text-white border-blue-700 shadow-sm ring-2 ring-blue-300'
                            : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                        }`}
                      >
                        {type}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Contact Person
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                  <input
                    type="text"
                    value={factoryInfo.contactPerson}
                    onChange={(e) => handleFieldChange('contactPerson', e.target.value)}
                    placeholder="e.g. Engr. K. M. Rezaul Karim"
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Contact Phone</label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                  <input
                    type="text"
                    value={factoryInfo.contactPhone}
                    onChange={(e) => handleFieldChange('contactPhone', e.target.value)}
                    placeholder="e.g. +880 1713-456789"
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Contact Email</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                  <input
                    type="email"
                    value={factoryInfo.contactEmail}
                    onChange={(e) => handleFieldChange('contactEmail', e.target.value)}
                    placeholder="e.g. qms.compliance@northernfashions.com"
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Buyer / Brand</label>
                <input
                  type="text"
                  value={factoryInfo.buyerBrand}
                  onChange={(e) => handleFieldChange('buyerBrand', e.target.value)}
                  placeholder="e.g. Primark, Next, Bestseller, VF Corporation"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 focus:outline-none font-medium text-slate-900"
                />
              </div>

              {/* Audit Date & Report Number */}
              {/* Audit Date */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Audit Date <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                  <input
                    type="date"
                    value={factoryInfo.auditDate}
                    onChange={(e) => handleFieldChange('auditDate', e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 focus:outline-none font-semibold text-slate-900"
                  />
                </div>
              </div>

              {/* Audit Report No */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Audit Report No <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={factoryInfo.auditReportNo ?? ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    onChange({
                      ...factoryInfo,
                      auditReportNo: val,
                      factoryRegistrationNo: val,
                    });
                  }}
                  placeholder="e.g. ITA-SA-10001"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 focus:outline-none font-mono font-bold text-slate-900"
                />
              </div>
            </div>
          </div>

          {/* 2. Auditor Team Configuration (Separate Card) */}
          <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Auditor Team</h2>
                  <p className="text-xs text-slate-500">Assigned audit personnel credentials and designations</p>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800">
                {factoryInfo.auditor2Name?.trim() ? '2-Man Audit' : '1-Man Audit'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Column 1: Auditor-1 */}
              <div className="space-y-2 p-3 bg-slate-50/70 rounded-xl border border-slate-200 shadow-2xs">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                  <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Auditor-1</span>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                    Auditor Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={factoryInfo.auditorName || ''}
                    onChange={(e) => handleFieldChange('auditorName', e.target.value)}
                    placeholder="e.g. Lead Auditor Name"
                    className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none font-bold text-slate-900"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                    Designation / Role
                  </label>
                  <input
                    type="text"
                    value={factoryInfo.auditorTitle || ''}
                    onChange={(e) => handleFieldChange('auditorTitle', e.target.value)}
                    placeholder="e.g. Lead QMS Auditor"
                    className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none text-slate-800"
                  />
                </div>
              </div>

              {/* Column 2: Auditor-2 */}
              <div className="space-y-2 p-3 bg-slate-50/70 rounded-xl border border-slate-200 shadow-2xs">
                <div className="flex items-center justify-between gap-1 text-xs font-bold text-slate-800">
                  <div className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-blue-600" />
                    <span>Auditor-2</span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-normal">Optional</span>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                    Auditor 2 Name
                  </label>
                  <input
                    type="text"
                    value={factoryInfo.auditor2Name || ''}
                    onChange={(e) => handleFieldChange('auditor2Name', e.target.value)}
                    placeholder="e.g. Second Auditor Name"
                    className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none font-bold text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                    Designation / Role
                  </label>
                  <input
                    type="text"
                    value={factoryInfo.auditor2Title || ''}
                    onChange={(e) => handleFieldChange('auditor2Title', e.target.value)}
                    placeholder="e.g. Technical Auditor"
                    className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none text-slate-800"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 2. Factory Facilities Multi-checkbox */}
          <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Factory Facilities Assessed</h2>
                  <p className="text-xs text-slate-500">
                    Select all operational facilities present at this plant ({factoryInfo.facilities?.length || 0} selected)
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSelectAllFacilities}
                  className="text-xs text-blue-600 hover:text-blue-700 font-bold cursor-pointer"
                >
                  Select All
                </button>
                <span className="text-slate-300">|</span>
                <button
                  type="button"
                  onClick={handleDeselectAllFacilities}
                  className="text-xs text-slate-500 hover:text-slate-700 cursor-pointer"
                >
                  Clear All
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {FACTORY_FACILITIES.map((facility) => {
                const isChecked = factoryInfo.facilities?.includes(facility.name);
                return (
                  <label
                    key={facility.id}
                    className={`flex items-start gap-2.5 p-3 rounded-xl border transition-all cursor-pointer select-none ${
                      isChecked
                        ? 'bg-blue-50/70 border-blue-400 text-slate-900 shadow-xs'
                        : 'bg-slate-50/50 border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handleFacilityToggle(facility.name)}
                      className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <div className="leading-tight">
                      <div className="text-xs font-bold text-slate-900">{facility.name}</div>
                      <div className="text-[10px] text-slate-500 line-clamp-1 mt-0.5">
                        {facility.description}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Outlook Photos, Opening Meeting & Certifications */}
        <div className="space-y-6">
          {/* 3. NEW FEATURE: Factory Outlook / Exterior Multiple Photos */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-purple-50 text-purple-600">
                  <Images className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Factory Outlook Photos</h2>
                  <p className="text-xs text-slate-500">Exterior facade, gate, building view (9:16 or 16:9)</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {factoryInfo.factoryOutlookPhotos && factoryInfo.factoryOutlookPhotos.length > 0 && (
                  <>
                    {factoryInfo.factoryOutlookPhotos.every((p) => p.isConfirmed) ? (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black flex items-center gap-1 border border-emerald-300">
                        <Check className="w-3 h-3 text-emerald-700 stroke-[3]" />
                        <span>All Confirmed ({factoryInfo.factoryOutlookPhotos.length})</span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={handleConfirmAllOutlookPhotos}
                        className="px-2 py-0.5 rounded-full bg-amber-50 hover:bg-emerald-50 text-amber-800 hover:text-emerald-800 border border-amber-300 hover:border-emerald-300 text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
                        title="Confirm all outlook photos in 1 click"
                      >
                        <Check className="w-3 h-3 text-amber-600" />
                        <span>Confirm All ({factoryInfo.factoryOutlookPhotos.filter((p) => p.isConfirmed).length}/{factoryInfo.factoryOutlookPhotos.length})</span>
                      </button>
                    )}
                  </>
                )}

                <button
                  type="button"
                  onClick={() => factoryOutlookInputRef.current?.click()}
                  className="px-2.5 py-1 text-xs font-bold rounded-lg bg-purple-50 text-purple-700 hover:bg-purple-100 flex items-center gap-1 transition-colors cursor-pointer border border-purple-200 shadow-2xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Photos</span>
                </button>
              </div>
            </div>

            {/* Hidden multi-photo input */}
            <input
              type="file"
              multiple
              ref={factoryOutlookInputRef}
              accept="image/*"
              capture="environment"
              onChange={handleOutlookPhotosUpload}
              className="hidden"
            />

            {(factoryInfo.factoryOutlookPhotos && factoryInfo.factoryOutlookPhotos.length > 0) ? (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-3 max-h-96 overflow-y-auto p-2 bg-slate-50/70 rounded-xl border border-slate-200">
                  {factoryInfo.factoryOutlookPhotos.map((photo, idx) => (
                    <EvidencePhotoThumbnail
                      key={photo.id}
                      photo={photo}
                      index={idx}
                      total={factoryInfo.factoryOutlookPhotos?.length}
                      onPreview={(p) => onOpenPreviewImage?.(p)}
                      onToggleConfirm={handleToggleConfirmOutlookPhoto}
                      onMove={(p) =>
                        onOpenPhotoAction?.(p, {
                          type: 'outlook',
                          id: p.id,
                          title: `Factory Outlook #${idx + 1}`,
                        })
                      }
                      onCopy={(p) =>
                        onOpenPhotoAction?.(p, {
                          type: 'outlook',
                          id: p.id,
                          title: `Factory Outlook #${idx + 1}`,
                        })
                      }
                      onDelete={handleRemoveOutlookPhoto}
                    />
                  ))}
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                  <span>
                    {factoryInfo.factoryOutlookPhotos.length} photo(s) captured. Tap the checkmark to confirm & fix.
                  </span>
                  <span className="font-semibold text-emerald-700">
                    {factoryInfo.factoryOutlookPhotos.filter((p) => p.isConfirmed).length} Confirmed
                  </span>
                </div>
              </div>
            ) : (
              <div
                onClick={() => factoryOutlookInputRef.current?.click()}
                className="border-2 border-dashed border-purple-200 hover:border-purple-500 rounded-xl p-5 text-center bg-purple-50/30 hover:bg-purple-50/60 transition-all cursor-pointer group"
              >
                <div className="w-10 h-10 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center mx-auto mb-2 group-hover:scale-105 transition-transform">
                  <Images className="w-5 h-5" />
                </div>
                <div className="text-xs font-bold text-slate-800">Add Factory Outlook Photos</div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Snap or upload building facade, gate, perimeter in portrait (9:16) or landscape (16:9).
                </p>
              </div>
            )}
          </div>

          {/* 4. Opening Meeting Photo */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center gap-2.5 pb-2 border-b border-slate-100">
              <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
                <Camera className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">Opening Meeting Photo</h2>
                <p className="text-xs text-slate-500">Official proof of on-site kickoff</p>
              </div>
            </div>

            <input
              type="file"
              ref={openingMeetingInputRef}
              accept="image/*"
              capture="environment"
              onChange={handleOpeningPhotoUpload}
              className="hidden"
            />

            {factoryInfo.openingMeetingPhoto ? (
              <div className="space-y-3">
                <div className="relative aspect-[16/9] w-full rounded-xl overflow-hidden border border-slate-300 group bg-slate-950 shadow-xs flex items-center justify-center">
                  <img
                    src={factoryInfo.openingMeetingPhoto}
                    alt="Opening Meeting"
                    className="w-full h-full object-cover object-center cursor-pointer transition-transform duration-200 group-hover:scale-102"
                    onClick={() =>
                      onOpenPreviewImage?.({
                        id: 'opening',
                        dataUrl: factoryInfo.openingMeetingPhoto!,
                        timestamp: factoryInfo.openingMeetingPhotoTimestamp || '',
                        caption: 'Opening Meeting Photo',
                      })
                    }
                  />

                  {/* Top Badges */}
                  <div className="absolute top-2 left-2 bg-black/70 backdrop-blur-xs text-[10px] text-emerald-400 px-2 py-0.5 rounded font-bold flex items-center gap-1 z-10">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    <span>Meeting Attached</span>
                  </div>

                  {/* Controls Strip (View, Move, Copy, Retake, Delete) */}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/60 to-transparent p-2 flex items-center justify-between gap-1 z-10 opacity-95 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={() =>
                        onOpenPreviewImage?.({
                          id: 'opening',
                          dataUrl: factoryInfo.openingMeetingPhoto!,
                          timestamp: factoryInfo.openingMeetingPhotoTimestamp || '',
                          caption: 'Opening Meeting Photo',
                        })
                      }
                      className="p-1 rounded bg-black/60 hover:bg-black/90 text-white text-xs flex items-center gap-1 cursor-pointer transition-colors"
                      title="Enlarge Photo"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span className="text-[10px] font-semibold hidden xs:inline">View</span>
                    </button>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          onOpenPhotoAction?.(
                            {
                              id: 'opening',
                              dataUrl: factoryInfo.openingMeetingPhoto!,
                              timestamp: factoryInfo.openingMeetingPhotoTimestamp || '',
                              caption: 'Opening Meeting Photo',
                            },
                            { type: 'opening', id: 'opening', title: 'Opening Meeting Photo' }
                          )
                        }
                        className="p-1 rounded bg-blue-600/90 hover:bg-blue-600 text-white text-xs flex items-center gap-1 cursor-pointer transition-colors"
                        title="Move / Transfer Photo"
                      >
                        <ArrowRightLeft className="w-3.5 h-3.5" />
                        <span className="text-[10px] font-semibold">Move</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onOpenPhotoAction?.(
                            {
                              id: 'opening',
                              dataUrl: factoryInfo.openingMeetingPhoto!,
                              timestamp: factoryInfo.openingMeetingPhotoTimestamp || '',
                              caption: 'Opening Meeting Photo',
                            },
                            { type: 'opening', id: 'opening', title: 'Opening Meeting Photo' }
                          )
                        }
                        className="p-1 rounded bg-indigo-600/90 hover:bg-indigo-600 text-white text-xs flex items-center gap-1 cursor-pointer transition-colors"
                        title="Copy / Duplicate Photo"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span className="text-[10px] font-semibold">Copy</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => openingMeetingInputRef.current?.click()}
                        className="p-1 rounded bg-slate-700/90 hover:bg-slate-700 text-white text-xs flex items-center gap-1 cursor-pointer transition-colors"
                        title="Retake photo"
                      >
                        <Camera className="w-3.5 h-3.5" />
                        <span className="text-[10px] font-semibold">Retake</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleRemoveOpeningPhoto}
                        className="p-1 rounded bg-red-600/90 hover:bg-red-700 text-white text-xs flex items-center gap-1 cursor-pointer transition-colors"
                        title="Delete photo"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span className="text-[10px] font-semibold">Del</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Opening Meeting Notes / Attendees
                  </label>
                  <textarea
                    rows={2}
                    value={factoryInfo.openingMeetingNotes || ''}
                    onChange={(e) => handleFieldChange('openingMeetingNotes', e.target.value)}
                    placeholder="List attendees and opening remarks..."
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 focus:outline-none"
                  />
                </div>
              </div>
            ) : (
              <div
                onClick={() => openingMeetingInputRef.current?.click()}
                className="border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-xl p-5 text-center bg-slate-50/50 hover:bg-blue-50/30 transition-all cursor-pointer group"
              >
                <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mx-auto mb-2 group-hover:scale-105 transition-transform">
                  <Camera className="w-5 h-5" />
                </div>
                <div className="text-xs font-bold text-slate-800">Upload Opening Meeting Photo</div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Take photo with camera or choose from gallery.
                </p>
              </div>
            )}
          </div>

          {/* 5. Factory Certifications */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-50 text-amber-600">
                  <Award className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Factory Certifications</h2>
                  <p className="text-xs text-slate-500">ISO, WRAP, OEKO-TEX, BSCI, etc.</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowAddCert(!showAddCert)}
                className="text-xs text-blue-600 hover:text-blue-700 font-bold flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Cert</span>
              </button>
            </div>

            {showAddCert && (
              <div className="p-3 bg-blue-50 rounded-xl border border-blue-200 space-y-2">
                <label className="block text-xs font-bold text-blue-900">Certificate Name</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newCertName}
                    onChange={(e) => setNewCertName(e.target.value)}
                    placeholder="e.g. SLCP / Higg FEM / FairTrade"
                    className="flex-1 px-3 py-1.5 text-xs bg-white border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={handleAddCustomCert}
                    className="px-3 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer"
                  >
                    Add
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
              {factoryInfo.certifications.map((cert) => (
                <div
                  key={cert.id}
                  className={`p-3 rounded-xl border transition-all ${
                    cert.selected
                      ? 'bg-amber-50/40 border-amber-300 text-slate-900 shadow-xs'
                      : 'bg-slate-50/60 border-slate-200 text-slate-600'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <label className="flex items-center gap-2.5 cursor-pointer select-none flex-1 min-w-0">
                      <input
                        type="checkbox"
                        checked={cert.selected}
                        onChange={() => handleCertToggle(cert.id)}
                        className="rounded border-slate-300 text-amber-600 focus:ring-amber-500 shrink-0"
                      />
                      <span className="text-xs font-bold leading-snug">{cert.name}</span>
                    </label>

                    {!cert.photo && (
                      <label
                        className="cursor-pointer inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 shadow-xs transition-all shrink-0"
                        title="Capture or upload certificate photo"
                      >
                        <Camera className="w-3.5 h-3.5 text-amber-700" />
                        <span>Take Photo</span>
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="hidden"
                          onChange={(e) => handleCertPhotoUpload(cert.id, e)}
                        />
                      </label>
                    )}
                  </div>

                  {cert.photo && (
                    <div className="flex items-center gap-2.5 mt-2.5 pt-2 border-t border-amber-200/70">
                      <div
                        className="relative w-12 h-12 rounded-lg overflow-hidden border border-amber-300 shrink-0 cursor-pointer bg-slate-900 group shadow-xs"
                        onClick={() =>
                          onOpenPreviewImage?.({
                            id: `cert-${cert.id}`,
                            dataUrl: cert.photo!,
                            timestamp: cert.photoTimestamp || '',
                            caption: `${cert.name} Certificate Photo`,
                          })
                        }
                        title="Click to view full preview"
                      >
                        <img
                          src={cert.photo}
                          alt={cert.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <Eye className="w-3.5 h-3.5 text-white" />
                        </div>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1 text-[11px] font-bold text-emerald-700">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span>Photo Attached</span>
                        </div>
                        <p className="text-[10px] text-slate-500">
                          {cert.photoTimestamp ? new Date(cert.photoTimestamp).toLocaleDateString() : 'Photo attached'}
                        </p>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <label
                          className="p-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 cursor-pointer transition-colors"
                          title="Retake or change photo"
                        >
                          <Camera className="w-3.5 h-3.5" />
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            className="hidden"
                            onChange={(e) => handleCertPhotoUpload(cert.id, e)}
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => handleRemoveCertPhoto(cert.id)}
                          className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 cursor-pointer transition-colors"
                          title="Remove photo"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Action Bar */}
      <div className="bg-slate-900 rounded-2xl p-4 sm:p-5 text-white flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center font-bold text-white shrink-0">
            2/3
          </div>
          <div>
            <div className="text-sm font-bold">Ready to Start Technical Checkpoints?</div>
            <p className="text-xs text-slate-400">
              Factory: <strong className="text-white">{factoryInfo.name || 'Factory Not Specified'}</strong> | Type: <strong className="text-blue-400">{factoryInfo.auditType || 'Initial Audit'}</strong>
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onProceedToAudit}
          className="w-full sm:w-auto px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm shadow-lg shadow-blue-500/30 flex items-center justify-center gap-2 transition-all cursor-pointer group"
        >
          <span>Open Checkpoint Audit</span>
          <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
        </button>
      </div>
    </div>
  );
};
