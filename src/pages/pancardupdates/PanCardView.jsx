import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Swal from 'sweetalert2';
import { PDFDocument } from 'pdf-lib/dist/pdf-lib.esm.js';
import './PanCardView.css';
import Form93PdfTemplate, { generateForm49APdf } from './Form49APdfGenerator';
import FormPanCrPdfTemplate, { generatePanCrPdf } from './PanCrPdfGenerator';
import PanCorrectionForm from './PanCorrectionForm';
import StampSignatureMerger from './StampSignatureMerger';
import { Form49ADirectEditModal } from './Form49ADirectEditModal'; // eslint-disable-line no-unused-vars
import { ALL_INDIAN_STATES, INDIAN_STATES_DISTRICTS, ALL_INDIAN_DISTRICTS, PROOF_OF_IDENTITY_OPTIONS, PROOF_OF_ADDRESS_OPTIONS, PROOF_OF_DOB_OPTIONS } from '../../utils/indiaData';

import { AO_CODES_LIST, getAoCodesForDistrict } from '../../utils/aoCodeData';
import { API_URL, apiFetch } from '../../utils/apiClient';

const showCustomToast = (title, text = '', icon = 'success') => {
  const existingContainer = document.getElementById('custom-app-toast-container');
  if (existingContainer) existingContainer.remove();

  const toastContainer = document.createElement('div');
  toastContainer.id = 'custom-app-toast-container';
  toastContainer.style.cssText = `
    position: fixed;
    top: 24px;
    right: 24px;
    z-index: 999999;
    display: flex;
    align-items: center;
    gap: 12px;
    background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
    color: #ffffff;
    border: 1.5px solid ${icon === 'error' ? '#ef4444' : icon === 'warning' ? '#f59e0b' : '#10b981'};
    padding: 12px 18px;
    border-radius: 12px;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45), 0 0 16px ${icon === 'error' ? 'rgba(239, 68, 68, 0.25)' : 'rgba(16, 185, 129, 0.25)'};
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    cursor: pointer;
    transition: opacity 0.25s ease, transform 0.25s ease;
    opacity: 0;
    transform: translateY(-20px) scale(0.95);
    max-width: 420px;
    box-sizing: border-box;
  `;

  const iconBg = icon === 'error' ? '#ef4444' : icon === 'warning' ? '#f59e0b' : '#10b981';
  const iconSymbol = icon === 'error' ? '✕' : icon === 'warning' ? '⚠️' : '✓';

  toastContainer.innerHTML = `
    <div style="background: ${iconBg}; color: #ffffff; width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 13px; flex-shrink: 0; box-shadow: 0 2px 8px ${iconBg}66;">
      ${iconSymbol}
    </div>
    <div style="display: flex; flex-direction: column; gap: 2px;">
      <div style="font-size: 13px; font-weight: 800; color: #ffffff; letter-spacing: 0.2px;">${title || 'Notification'}</div>
      ${text ? `<div style="font-size: 11.5px; color: #94a3b8; font-weight: 500; line-height: 1.3;">${text}</div>` : ''}
    </div>
    <div style="margin-left: 8px; font-size: 14px; color: #64748b; font-weight: 700;" title="Close">✕</div>
  `;

  document.body.appendChild(toastContainer);

  requestAnimationFrame(() => {
    toastContainer.style.opacity = '1';
    toastContainer.style.transform = 'translateY(0) scale(1)';
  });

  let timer = null;
  const dismiss = () => {
    if (timer) clearTimeout(timer);
    toastContainer.style.opacity = '0';
    toastContainer.style.transform = 'translateY(-15px) scale(0.95)';
    setTimeout(() => {
      if (toastContainer.parentNode) {
        toastContainer.parentNode.removeChild(toastContainer);
      }
    }, 250);
  };

  toastContainer.onclick = dismiss;
  timer = setTimeout(dismiss, 1000);
};

const Toast = {
  fire: (opts = {}) => {
    const title = opts.title || opts.text || 'Notification';
    const text = (opts.title && opts.text) ? opts.text : '';
    const icon = opts.icon || 'success';
    showCustomToast(title, text, icon);
  }
};

const downloadReceiptToPc = (url) => {
  if (!url) return;
  try {
    window.open(url, '_blank');
  } catch (e) {
    console.warn('Error opening receipt window:', e);
  }
};

export const cleanApplicantTitle = (nameStr) => {
  if (!nameStr || typeof nameStr !== 'string') return nameStr || '—';
  const str = nameStr.trim();
  const cleaned = str.replace(/^(KUMARI|KUMAR|SHRI|SMT|MR|MRS|MS|DR|MISS)\.?\s+/i, '').trim();
  return cleaned || str;
};

export const getApplicantDisplayFullName = (app) => {
  if (!app) return '—';
  const d = app.details || {};
  const fName = (d.firstName || app.firstName || '').trim();
  const mName = (d.middleName || app.middleName || '').trim();
  const lName = (d.lastName || app.lastName || '').trim();

  if (fName || lName || mName) {
    const combined = [fName, mName, lName].filter(Boolean).join(' ');
    if (combined) return cleanApplicantTitle(combined);
  }

  if (d.entityName || app.entityName) {
    return (d.entityName || app.entityName).trim();
  }

  return cleanApplicantTitle(app.applicantName || '—');
};

const copyApplicationDetailsToClipboard = (app) => {
  if (!app) return;
  const d = app.details || {};
  const fullName = [d.firstName, d.middleName, d.lastName || app.applicantName].filter(Boolean).join(' ') || app.applicantName || '—';
  const fatherName = app.fatherName || `${d.fatherFirstName || ''} ${d.fatherMiddleName || ''} ${d.fatherLastName || ''}`.trim() || '—';
  const motherName = `${d.motherFirstName || ''} ${d.motherMiddleName || ''} ${d.motherLastName || ''}`.trim() || '—';
  const district = (d.district && d.district !== 'SELECT') ? d.district : (app.district || '—');
  const state = (d.state && d.state !== 'PLEASE SELECT') ? d.state : (app.state || 'MAHARASHTRA');

  const text = [
    `=== PAN APPLICATION DETAILS ===`,
    `Ack Number: ${app.ackNumber || 'N/A'}`,
    `Submitted By: ${app.userId || app.userMobile || 'Retailer'}`,
    `Status: ${(app.status || 'Submitted').toUpperCase()}`,
    `Service Type: ${app.applicationType || 'Manual New PAN'}`,
    `Date Submitted: ${app.createdAt ? new Date(app.createdAt).toLocaleString() : 'N/A'}`,
    app.nsdlReceiptNumber ? `NSDL Receipt / Remark: ${app.nsdlReceiptNumber}` : '',
    app.adminRemarks ? `Admin Remarks: ${app.adminRemarks}` : '',
    ``,
    `--- PERSONAL PARTICULARS ---`,
    `Title: ${d.title || app.title || 'SHRI'}`,
    `Applicant Name: ${fullName}`,
    `Gender: ${app.gender || d.gender || 'Male'}`,
    `Date of Birth: ${app.dob || d.dob || '—'}`,
    `Aadhaar Number: ${app.aadhaarNumber || d.aadhaarNumber || '—'}`,
    `Mobile Number: ${app.mobileNumber || '—'}`,
    `Email Address: ${app.email || '—'}`,
    ``,
    `--- PARENTS DETAILS ---`,
    `Father's Name: ${fatherName}`,
    `Mother's Name: ${motherName}`,
    ``,
    `--- RESIDENCE ADDRESS ---`,
    `Flat/Door/Block: ${d.flatNo || '—'}`,
    `Building/Premises: ${d.premises || '—'}`,
    `Road/Street: ${d.roadStreet || '—'}`,
    `Area/Taluka: ${d.areaTaluka || '—'}`,
    `District: ${district}`,
    `State: ${state}`,
    `Pincode: ${d.pincode || '—'}`,
    ``,
    `--- AO CODE DETAILS ---`,
    `Area Code: ${d.aoAreaCode || 'MUM'} | AO Type: ${d.aoType || 'C'} | Range Code: ${d.aoRangeCode || '11'} | AO No: ${d.aoNo || '1'} | City: ${d.aoCity || district || 'MUMBAI'}`,
    `===============================`
  ].filter(line => line !== false && line !== undefined).join('\n');

  const showToast = () => {
    showCustomToast('Details Copied!', 'All application details copied to clipboard.', 'success');
  };

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(showToast).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand('copy');
      ta.remove();
      showToast();
    });
  } else {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    document.execCommand('copy');
    ta.remove();
    showToast();
  }
};

// Interactive Drag & Drop File Upload Dropzone Component
const DropzoneBox = ({ label, fieldName, isRequired, currentValue, onFileSelect, accept, hint, icon }) => {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      processFile(file);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      processFile(file);
    }
  };

  const [isCompressing, setIsCompressing] = useState(false); // eslint-disable-line no-unused-vars

  // Compress image via canvas (resize + quality reduction)
  const compressImage = (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const img = new Image();
        img.onload = () => {
          const MAX_W = 1400;
          const MAX_H = 1400;
          let { width, height } = img;
          if (width > MAX_W || height > MAX_H) {
            const ratio = Math.min(MAX_W / width, MAX_H / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL('image/jpeg', 0.72);
          resolve({ dataUrl: compressed, originalSize: file.size, compressedSize: Math.round((compressed.length * 3) / 4) });
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  };

  // Re-save the PDF with object streams so the compressed bytes remain a valid PDF.
  const compressPdf = async (file) => {
    const originalDataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    try {
      const pdf = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: false });
      const compressedBytes = await pdf.save({ useObjectStreams: true, addDefaultPage: false });
      let binary = '';
      const chunkSize = 0x8000;
      for (let offset = 0; offset < compressedBytes.length; offset += chunkSize) {
        binary += String.fromCharCode(...compressedBytes.subarray(offset, offset + chunkSize));
      }
      const compressedDataUrl = `data:application/pdf;base64,${btoa(binary)}`;
      return {
        dataUrl: compressedDataUrl,
        originalSize: file.size,
        compressedSize: compressedBytes.length
      };
    } catch (error) {
      console.warn('PDF compression failed; using the original valid PDF:', error);
      return { dataUrl: originalDataUrl, originalSize: file.size, compressedSize: file.size };
    }
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const processFile = async (file) => {
    const isImage = file.type.startsWith('image/');
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isImage && !isPdf) {
      Toast.fire({ icon: 'error', title: 'Please select a valid image (JPG, PNG) or PDF document' });
      return;
    }

    setIsCompressing(true);
    try {
      if (isImage) {
        const { dataUrl, originalSize, compressedSize } = await compressImage(file);
        onFileSelect(dataUrl);
        const saved = originalSize - compressedSize;
        if (saved > 0) {
          Toast.fire({
            icon: 'success',
            title: `✅ Image compressed: ${formatSize(originalSize)} → ${formatSize(compressedSize)} (saved ${formatSize(saved)})`,
            timer: 1000
          });
        } else {
          Toast.fire({
            icon: 'success',
            title: `✅ Image ready (${formatSize(originalSize)})`,
            timer: 1000
          });
        }
      } else {
        const { dataUrl, originalSize, compressedSize } = await compressPdf(file);
        onFileSelect(dataUrl);
        const saved = originalSize - compressedSize;
        if (saved > 512) {
          Toast.fire({
            icon: 'success',
            title: `✅ PDF compressed: ${formatSize(originalSize)} → ~${formatSize(compressedSize)} (saved ${formatSize(saved)})`,
            timer: 1000
          });
        } else {
          Toast.fire({
            icon: 'success',
            title: `✅ PDF ready (${formatSize(originalSize)})`,
            timer: 1000
          });
        }
      }
      setTimeout(() => {
        if (Swal.isVisible() && Swal.getPopup()?.classList?.contains('swal2-toast')) {
          Swal.close();
        }
      }, 1100);
    } catch {
      Toast.fire({ icon: 'error', title: 'Error processing file. Please try again.', timer: 1000 });
    }
    setIsCompressing(false);
  };

  const handleRemove = (e) => {
    e.stopPropagation();
    onFileSelect('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const isPdf = currentValue && currentValue.startsWith('data:application/pdf');

  return (
    <div className="pan-dropzone-container">
      <label className="pan-dropzone-label">
        {label} {isRequired && <span className="req-star">*</span>}
      </label>
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current && fileInputRef.current.click()}
        className={`pan-dropzone-box ${isDragging ? 'is-dragging' : ''} ${currentValue ? 'has-value' : ''}`}
      >
        <input
          type="file"
          ref={fileInputRef}
          accept={accept}
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />

        {currentValue ? (
          <div className="pan-dropzone-content has-file">
            <div className="pan-dropzone-preview-wrap">
              {isPdf ? (
                <span className="pan-dropzone-pdf-icon">📑</span>
              ) : (
                <img
                  src={currentValue}
                  alt="Preview"
                  className="pan-dropzone-img-preview"
                />
              )}
              <span className="pan-dropzone-file-ready">
                ✅ {isPdf ? 'PDF Attached' : 'File Ready'}
              </span>
            </div>

            <button
              type="button"
              onClick={handleRemove}
              className="pan-dropzone-remove-btn"
            >
              ✕ Remove
            </button>
          </div>
        ) : (
          <div className="pan-dropzone-content is-empty">
            <div className="pan-dropzone-info-wrap">
              <span className="pan-dropzone-icon">{icon}</span>
              <div className="pan-dropzone-text-group">
                <span className="pan-dropzone-title">
                  {isDragging ? 'Drop File Now' : 'Click or Drag File'}
                </span>
                <span className="pan-dropzone-hint">
                  {hint}
                </span>
              </div>
            </div>
            <span className="pan-dropzone-browse-btn">
              Browse
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

const PanCardView = ({ currentUser, walletBalance = 0, onClose, theme: propTheme }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [tabs, setTabs] = useState([]);

  const [currentTheme, setCurrentTheme] = useState(() => propTheme || localStorage.getItem('appTheme') || 'light');
  const isLightTheme = currentTheme === 'light';

  useEffect(() => {
    if (propTheme) {
      setCurrentTheme(propTheme);
    }
  }, [propTheme]);

  useEffect(() => {
    const handleStorage = () => {
      const saved = localStorage.getItem('appTheme') || 'light';
      setCurrentTheme(saved);
    };
    window.addEventListener('storage', handleStorage);
    const interval = setInterval(handleStorage, 500);
    return () => {
      window.removeEventListener('storage', handleStorage);
      clearInterval(interval);
    };
  }, []);

  // Read initial active tab from URL search parameters if available
  const getInitialTab = () => {
    const params = new URLSearchParams(window.location.search);
    return params.get('tab') || 'new_app_landing';
  };

  const [activeTab, setActiveTab] = useState(getInitialTab);
  const [loadingTabs, setLoadingTabs] = useState(true); // eslint-disable-line no-unused-vars
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [historyList, setHistoryList] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyViewMode, setHistoryViewMode] = useState('user'); // 'all' (Admin View) or 'user' (My Applications)
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(10);
  const [selectedAppForModal, setSelectedAppForModal] = useState(null);
  const [selectedAppForStatusUpdate, setSelectedAppForStatusUpdate] = useState(null);
  const [statusUpdateVal, setStatusUpdateVal] = useState('Submitted');
  const [adminRemarksInput, setAdminRemarksInput] = useState('');
  const [receiptInputUrl, setReceiptInputUrl] = useState('');
  const [nsdlReceiptInput, setNsdlReceiptInput] = useState('');
  const [updatingStatusId, setUpdatingStatusId] = useState(null);
  const [selectedAppForDocument, setSelectedAppForDocument] = useState(null);
  const [documentToAdd, setDocumentToAdd] = useState('');
  const [documentName, setDocumentName] = useState('');
  const [isAddingDocument, setIsAddingDocument] = useState(false);
  const [selectedAppForEdit, setSelectedAppForEdit] = useState(null); // eslint-disable-line no-unused-vars

  const switchTab = (tabName) => {
    setActiveTab(tabName);
    navigate(`/pancard?tab=${tabName}`);
  };

  // Sync tab state when URL changes
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tabFromUrl = params.get('tab');
    if (tabFromUrl && tabFromUrl !== activeTab) {
      setActiveTab(tabFromUrl);
    }
  }, [location.search]); // eslint-disable-line react-hooks/exhaustive-deps

  // Form State initial defaults
  const INITIAL_FORM_DATA = {
    applicantName: '',
    fatherName: '',
    dob: '',
    gender: 'Male',
    mobileNumber: '',
    email: '',
    aadhaarNumber: '',
    panNumber: '',
    photoUrl: '',
    signatureUrl: '',
    remarks: ''
  };

  const INITIAL_MANUAL_DATA = {
    category: 'INDIVIDUAL',
    aadhaarNumber: '',
    proofOfDob: 'ABHA HEALTH GOVT ID CARD (CENTRAL GOVT)',
    title: 'SELECT',
    lastName: '',
    firstName: '',
    middleName: '',
    isSingleParent: 'NO',
    fatherLastName: '',
    fatherFirstName: '',
    fatherMiddleName: '',
    motherLastName: '',
    motherFirstName: '',
    motherMiddleName: '',
    nameAsPerAadhaar: '',
    gender: 'SELECT',
    dob: '',
    mobileNumber: '',
    email: '',
    flatNo: '',
    premises: '',
    roadStreet: '',
    areaTaluka: '',
    state: 'PLEASE SELECT',
    district: 'SELECT',
    pincode: '',
    proofOfIdentity: 'AADHAAR CARD ISSUED BY THE UNIQUE IDENTIFICATION AUTHORITY OF INDIA',
    proofOfAddress: 'AADHAAR CARD ISSUED BY THE UNIQUE IDENTIFICATION AUTHORITY OF INDIA',
    aoCity: 'SELECT CITY',
    aoAreaCode: '',
    aoType: '',
    aoRangeCode: '',
    aoNo: '',
    photoUrl: '',
    signatureUrl: '',
    proofOfIdentityUrl: '',
    proofOfAddressUrl: '',
    proofOfDobUrl: '',
    proofOfOtherUrl: '',
    entityName: '',
    dateOfIncorporation: '',
    registrationNumber: '',
    stdCode: '',
    landlineNumber: '',
    sameAsOfficeAddress: true,
    commFlatNo: '',
    commPremises: '',
    commRoadStreet: '',
    commAreaTaluka: '',
    commState: 'PLEASE SELECT',
    commDistrict: 'SELECT',
    commPincode: '',
    incomeSource: 'Income from Business/Profession',
    raTitle: 'SHRI',
    raFirstName: '',
    raMiddleName: '',
    raLastName: '',
    raPanNumber: '',
    raAadhaarNumber: '',
    raMobileNumber: '',
    raEmail: '',
    raFlatNo: '',
    raRoadStreet: '',
    raAreaTaluka: '',
    raDistrict: 'SELECT',
    raState: 'PLEASE SELECT',
    raPincode: '',
    proofOfIncorporation: 'CERTIFICATE OF INCORPORATION / REGISTRATION',
    verifierName: '',
    verifierCapacity: 'HIMSELF',
    verifierPlace: '',
    verifierDate: new Date().toISOString().split('T')[0]
  };

  const INITIAL_CORRECTION_DATA = {
    panNumber: '', aadhaarNumber: '', firstName: '', middleName: '', lastName: '', nameAsPerAadhaar: '', gender: '', dob: '', mobileNumber: '', email: '',
    verifierCapacity: 'HIMSELF',
    flatNo: '', premises: '', roadStreet: '', areaTaluka: '', state: '', district: '', pincode: '',
    fatherFirstName: '', fatherMiddleName: '', fatherLastName: '', motherFirstName: '', motherMiddleName: '', motherLastName: '', parentToPrint: 'Father',
    proofOfIdentity: '', proofOfAddress: '', proofOfDob: '', passportNumber: '', taxpayerId: '', landlineNumber: '', photoUrl: '', signatureUrl: ''
  };

  // Form State for E-KYC & Correction
  const [formData, setFormData] = useState(INITIAL_FORM_DATA);

  // Dedicated Form State for Manual New PAN (Individual & Non-Individual Entity)
  const [manualData, setManualData] = useState(INITIAL_MANUAL_DATA);
  const [correctionData, setCorrectionData] = useState(INITIAL_CORRECTION_DATA);

  // Fetch dynamic tabs from backend
  const fetchTabs = () => {
    apiFetch('/api/pancard/tabs')
      .then(res => {
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        return res.json();
      })
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setTabs(data);
        } else {
          setTabs(getFallbackTabs());
        }
        setLoadingTabs(false);
      })
      .catch(err => {
        console.error('Error fetching PAN tabs:', err);
        setTabs(getFallbackTabs());
        setLoadingTabs(false);
      });
  };

  useEffect(() => {
    fetchTabs();
    window.addEventListener('focus', fetchTabs);
    window.addEventListener('pan_tabs_updated', fetchTabs);
    return () => {
      window.removeEventListener('focus', fetchTabs);
      window.removeEventListener('pan_tabs_updated', fetchTabs);
    };
  }, []);

  const getFallbackTabs = () => [
    {
      id: 'ieil_scope1',
      label: '⚡ Instant e-KYC New PAN',
      icon: '⚡',
      fee: 107,
      scope: 1,
      mode: 'ONLINE',
      description: 'Paperless Instant e-KYC New PAN application via Aadhaar OTP / Biometric.'
    },
    {
      id: 'ieil_scope2',
      label: '📁 Physical Scan New PAN',
      icon: '📁',
      fee: 107,
      scope: 2,
      mode: 'ONLINE',
      description: 'Scanned Document New PAN application with Photo & Signature upload.'
    },
    {
      id: 'ieil_scope3',
      label: '✏️ Instant e-KYC PAN Correction',
      icon: '✏️',
      fee: 107,
      scope: 3,
      mode: 'ONLINE',
      description: 'Paperless Instant PAN Correction via Aadhaar e-KYC.'
    },
    {
      id: 'ieil_scope4',
      label: '📝 Physical Scan PAN Correction',
      icon: '📝',
      fee: 107,
      scope: 4,
      mode: 'ONLINE',
      description: 'Scanned Document PAN Correction with Supporting Document upload.'
    },
    {
      id: 'manual_new_pan',
      label: '📄 Offline Form 49A (New PAN)',
      icon: '📄',
      fee: 107,
      mode: 'OFFLINE',
      description: 'Offline Portal Form 49A with Photo/Signature Dropzone, PDF Generator & Admin Review.'
    },
    {
      id: 'manual_pan_correction',
      label: '📋 Offline PAN Correction',
      icon: '📋',
      fee: 107,
      mode: 'OFFLINE',
      description: 'Offline Portal PAN Correction Form with Pre-Filled PDF & Admin Manual Approval.'
    }
  ];

  // Fetch applications
  const fetchHistory = (forcedMode = null) => {
    setLoadingHistory(true);
    const userRole = (sessionStorage.getItem('userRole') || localStorage.getItem('userRole') || '').toLowerCase();
    const activeUser = (currentUser || sessionStorage.getItem('currentUser') || localStorage.getItem('currentUser') || '').trim();
    const isAdmin = forcedMode === 'all' || ((userRole === 'admin' || userRole === 'staff') && historyViewMode === 'all') || (!forcedMode && (activeUser.toLowerCase() === 'admin' || userRole === 'staff'));
    const url = isAdmin
      ? `${API_URL}/api/pancard/all`
      : `${API_URL}/api/pancard/applications/${encodeURIComponent(activeUser || 'guest')}`;

    fetch(url)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setHistoryList(data.applications || []);
        }
        setLoadingHistory(false);
      })
      .catch(err => {
        console.error('Error fetching PAN application history:', err);
        setLoadingHistory(false);
      });
  };

  const handleRetailerDeleteApplication = async (app) => {
    const status = (app.status || '').toLowerCase();
    if (status === 'approved' || status === 'completed') {
      return Swal.fire({
        icon: 'error',
        title: 'Action Restricted',
        text: 'This PAN application has already been approved by Admin and cannot be deleted.'
      });
    }

    const confirmRes = await Swal.fire({
      title: 'Delete Application?',
      text: `Are you sure you want to delete application ${app.ackNumber}? Fee ₹${app.feeAmount || 107} will be refunded to your wallet.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Yes, Delete & Refund Fee',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#64748b'
    });

    if (!confirmRes.isConfirmed) return;

    try {
      const res = await fetch(`${API_URL}/api/pancard/application/${app._id}?role=retailer&userId=${currentUser}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (res.ok && data.success) {
        Swal.fire({
          icon: 'success',
          title: 'Application Deleted',
          text: data.message || 'Application deleted successfully.'
        });
        fetchHistory();
      } else {
        Swal.fire({
          icon: 'error',
          title: 'Delete Failed',
          text: data.message || 'Unable to delete application.'
        });
      }
    } catch (err) {
      console.error('Delete PAN error:', err);
      Swal.fire({ icon: 'error', text: 'Error connecting to server.' });
    }
  };

  useEffect(() => {
    if (activeTab === 'history') {
      fetchHistory();
    }
  }, [activeTab, currentUser]); // eslint-disable-line react-hooks/exhaustive-deps

  const searchedList = historyList.filter(app => {
    const q = (searchQuery || '').toLowerCase().trim();
    const displayName = getApplicantDisplayFullName(app).toLowerCase();
    return !q ||
      (app.ackNumber && app.ackNumber.toLowerCase().includes(q)) ||
      (app.applicantName && app.applicantName.toLowerCase().includes(q)) ||
      displayName.includes(q) ||
      (app.mobileNumber && app.mobileNumber.toLowerCase().includes(q)) ||
      (app.userId && app.userId.toLowerCase().includes(q)) ||
      (app.aadhaarNumber && app.aadhaarNumber.toLowerCase().includes(q));
  });

  const sortedList = [...searchedList].sort((a, b) => {
    const statusA = (a.status || 'Submitted').toLowerCase();
    const statusB = (b.status || 'Submitted').toLowerCase();
    if (statusA === 'submitted' && statusB !== 'submitted') return -1;
    if (statusA !== 'submitted' && statusB === 'submitted') return 1;
    return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
  });

  const filteredList = sortedList.filter(app => {
    return statusFilter === 'ALL' || (app.status || 'Submitted').toLowerCase() === statusFilter.toLowerCase();
  });

  const totalPages = Math.ceil(filteredList.length / historyPageSize) || 1;
  const currentPage = Math.min(historyPage, totalPages);
  const startIndex = (currentPage - 1) * historyPageSize;
  const paginatedList = filteredList.slice(startIndex, startIndex + historyPageSize);

  const getStatusBadgeStyle = (st = 'Submitted') => {
    const s = st.toLowerCase();
    if (s === 'approved' || s === 'completed') {
      return { background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0' };
    }
    if (s === 'in progress') {
      return { background: '#fffbe6', color: '#d97706', border: '1px solid #fde68a' };
    }
    if (s === 'rejected') {
      return { background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5' };
    }
    return { background: '#fff7ed', color: '#ea580c', border: '1px solid #fdba74' };
  };

  const handleSaveStatus = async (appId) => {
    if (!statusUpdateVal) return;
    setUpdatingStatusId(appId);
    try {
      const response = await fetch(`${API_URL}/api/pancard/status/${appId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: statusUpdateVal,
          adminRemarks: adminRemarksInput,
          receiptUrl: receiptInputUrl,
          nsdlReceiptNumber: nsdlReceiptInput,
          actorRole: historyViewMode === 'user' ? 'retailer' : 'admin'
        })
      });
      const data = await response.json();
      setUpdatingStatusId(null);

      if (data.success) {
        Toast.fire({ icon: 'success', title: `Application status updated to '${statusUpdateVal}'!` });
        setSelectedAppForStatusUpdate(null);
        setReceiptInputUrl('');
        setNsdlReceiptInput('');
        fetchHistory();
      } else {
        Toast.fire({ icon: 'error', title: data.message || 'Failed to update status.' });
      }
    } catch (err) {
      setUpdatingStatusId(null);
      console.error('Error updating status:', err);
      Toast.fire({ icon: 'error', title: 'Server error updating status.' });
    }
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleManualChange = (e) => {
    const { name, value } = e.target;

    // When district changes, update district and clear auto-selected AO codes (No auto-selection)
    if (name === 'district') {
      setManualData(prev => ({
        ...prev,
        district: value,
        aoCity: value !== 'SELECT' ? value : prev.aoCity,
        aoAreaCode: '',
        aoType: '',
        aoRangeCode: '',
        aoNo: ''
      }));
      return;
    }

    // When aoCity changes, update aoCity and clear auto-selected AO codes (No auto-selection)
    if (name === 'aoCity') {
      setManualData(prev => ({
        ...prev,
        aoCity: value,
        aoAreaCode: '',
        aoType: '',
        aoRangeCode: '',
        aoNo: ''
      }));
      return;
    }

    // When isSingleParent changes, hide father fields and auto-set parentToPrint if YES
    if (name === 'isSingleParent') {
      setManualData(prev => ({
        ...prev,
        isSingleParent: value,
        fatherFirstName: value === 'YES' ? '' : prev.fatherFirstName,
        fatherMiddleName: value === 'YES' ? '' : prev.fatherMiddleName,
        fatherLastName: value === 'YES' ? '' : prev.fatherLastName,
        parentToPrint: value === 'YES' ? 'Mother' : prev.parentToPrint
      }));
      return;
    }

    // Auto-set verifier capacity (HIMSELF for male, HERSELF for female)
    if (name === 'gender') {
      const isIndiv = !manualData.category || manualData.category === 'INDIVIDUAL';
      setManualData(prev => ({
        ...prev,
        gender: value,
        verifierCapacity: isIndiv ? (value === 'FEMALE' ? 'HERSELF' : 'HIMSELF') : prev.verifierCapacity
      }));
      return;
    }

    if (name === 'title') {
      const isIndiv = !manualData.category || manualData.category === 'INDIVIDUAL';
      const isFem = ['SMT', 'KUMARI'].includes(value);
      setManualData(prev => ({
        ...prev,
        title: value,
        gender: isFem ? 'FEMALE' : (value === 'SHRI' ? 'MALE' : prev.gender),
        verifierCapacity: isIndiv ? (isFem ? 'HERSELF' : (value === 'SHRI' ? 'HIMSELF' : prev.verifierCapacity)) : prev.verifierCapacity
      }));
      return;
    }

    if (name === 'category') {
      const isIndiv = value === 'INDIVIDUAL';
      const isFem = manualData.gender === 'FEMALE' || ['SMT', 'KUMARI'].includes(manualData.title);
      setManualData(prev => ({
        ...prev,
        category: value,
        verifierCapacity: isIndiv ? (isFem ? 'HERSELF' : 'HIMSELF') : 'DIRECTOR'
      }));
      return;
    }

    setManualData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleAoSelect = (aoId) => {
    const cityToUse = manualData.aoCity !== 'SELECT CITY' ? manualData.aoCity : (manualData.district !== 'SELECT' ? manualData.district : '');
    const available = getAoCodesForDistrict(cityToUse);
    const selectedAo = available.find(item => String(item.id) === String(aoId)) || AO_CODES_LIST.find(item => String(item.id) === String(aoId));

    if (selectedAo) {
      setManualData(prev => ({
        ...prev,
        aoAreaCode: selectedAo.areaCode,
        aoType: selectedAo.aoType,
        aoRangeCode: selectedAo.rangeCode,
        aoNo: selectedAo.aoNo,
        aoCity: selectedAo.city
      }));
    }
  };

  // eslint-disable-next-line no-unused-vars
  const handleManualFileUpload = (e, fieldName) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setManualData(prev => ({
        ...prev,
        [fieldName]: reader.result
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleCorrectionChange = (e) => {
    const { name, value } = e.target;
    setCorrectionData(prev => {
      let extra = {};
      const isIndiv = !prev.category || prev.category === 'INDIVIDUAL';
      if (name === 'gender' && isIndiv) {
        extra.verifierCapacity = value === 'FEMALE' ? 'HERSELF' : 'HIMSELF';
      } else if (name === 'title' && isIndiv) {
        if (['SMT', 'KUMARI'].includes(value)) {
          extra.gender = 'FEMALE';
          extra.verifierCapacity = 'HERSELF';
        } else if (value === 'SHRI') {
          extra.gender = 'MALE';
          extra.verifierCapacity = 'HIMSELF';
        }
      } else if (name === 'category') {
        const nowIndiv = value === 'INDIVIDUAL';
        const isFem = prev.gender === 'FEMALE' || ['SMT', 'KUMARI'].includes(prev.title);
        extra.verifierCapacity = nowIndiv ? (isFem ? 'HERSELF' : 'HIMSELF') : 'DIRECTOR';
      }
      return { ...prev, [name]: value, ...extra };
    });
  };

  const handleCorrectionFileUpload = (e, fieldName) => {
    if (typeof e === 'string') {
      setCorrectionData(prev => ({ ...prev, [fieldName]: e }));
      return;
    }
    const file = e?.target?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => setCorrectionData(prev => ({ ...prev, [fieldName]: reader.result }));
    reader.readAsDataURL(file);
  };

  const handleCorrectionDownload = async () => {
    if (!correctionData.panNumber) {
      Toast.fire({ icon: 'warning', title: 'Please enter Existing PAN number before downloading.' });
      return;
    }
    Toast.fire({ icon: 'info', title: 'Generating PAN Correction PDF...' });
    const success = await generatePanCrPdf(correctionData);
    Toast.fire({ icon: success ? 'success' : 'error', title: success ? 'PAN CR PDF generated and downloaded!' : 'Could not generate PAN CR PDF. Please check your inputs.' });
  };

  const handleCorrectionSubmit = async (e) => {
    e.preventDefault();
    if (Swal.isVisible() && Swal.getPopup()?.classList?.contains('swal2-toast')) {
      Swal.close();
    }
    const correctionFee = tabs.find(t => t.id === 'manual_pan_correction' || t.id === 'epan_correction')?.fee ?? 107;

    if (!correctionData.panNumber) {
      Toast.fire({ icon: 'error', title: 'Please enter Existing PAN Number' });
      return;
    }

    const isIndiv = !correctionData.category || correctionData.category === 'INDIVIDUAL';
    if (isIndiv) {
      if (!correctionData.aadhaarNumber || (!correctionData.lastName && !correctionData.nameAsPerAadhaar) || !correctionData.mobileNumber || !correctionData.email) {
        Toast.fire({ icon: 'error', title: 'Please complete Aadhaar Number, Name, Mobile Number and Email.' });
        return;
      }
      if (!correctionData.photoUrl || !correctionData.signatureUrl) {
        Toast.fire({ icon: 'error', title: 'Please upload both Applicant Photo and Signature.' });
        return;
      }
    } else {
      const entityTitle = correctionData.entityName || correctionData.lastName;
      if (!entityTitle || !correctionData.mobileNumber || !correctionData.email) {
        Toast.fire({ icon: 'error', title: 'Please complete Entity Name, Mobile Number and Email.' });
        return;
      }
      if (!correctionData.signatureUrl) {
        Toast.fire({ icon: 'error', title: 'Please upload Authorized Signatory Signature / Stamp.' });
        return;
      }
    }

    if (walletBalance < correctionFee) {
      Toast.fire({ icon: 'warning', title: `Insufficient wallet balance for the ₹${correctionFee} fee.` });
      return;
    }

    const appDisplayName = isIndiv
      ? ([correctionData.firstName, correctionData.middleName, correctionData.lastName].filter(Boolean).join(' ') || correctionData.nameAsPerAadhaar || 'Individual Applicant')
      : (correctionData.entityName || correctionData.lastName || 'Non-Individual Entity');

    // Pre-open window synchronously to avoid browser pop-up blocker
    const pdfWin = window.open('about:blank', '_blank');

    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_URL}/api/pancard/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser,
          applicationType: 'PAN Correction',
          applicantName: appDisplayName,
          fatherName: isIndiv ? `${correctionData.fatherFirstName || ''} ${correctionData.fatherLastName || ''}`.trim() : (correctionData.verifierName || 'Authorized Signatory'),
          dob: isIndiv ? correctionData.dob : (correctionData.dateOfIncorporation || correctionData.dob),
          gender: correctionData.gender || 'N/A',
          mobileNumber: correctionData.mobileNumber,
          email: correctionData.email,
          aadhaarNumber: correctionData.aadhaarNumber || '',
          panNumber: correctionData.panNumber,
          photoUrl: correctionData.photoUrl || '',
          signatureUrl: correctionData.signatureUrl || '',
          details: correctionData,
          remarks: 'PAN correction request submitted'
        })
      });
      const result = await response.json();
      setIsSubmitting(false);

      if (!result.success) {
        if (pdfWin) pdfWin.close();
        throw new Error(result.message || 'Submission failed.');
      }

      await generatePanCrPdf(correctionData, 'pancr-pdf-container', pdfWin);
      setCorrectionData(INITIAL_CORRECTION_DATA);
      setHistoryViewMode('user');
      switchTab('history');
      fetchHistory('user');
      Toast.fire({ icon: 'success', title: 'PAN Correction Application Submitted Successfully!' });
    } catch (error) {
      if (pdfWin) pdfWin.close();
      setIsSubmitting(false);
      Toast.fire({ icon: 'error', title: error.message || 'Error submitting correction application.' });
    }
  };


  // eslint-disable-next-line no-unused-vars
  const handleDownloadAbha = () => {
    Swal.fire({
      title: 'Download ABHA Card',
      text: 'Redirecting to National Health Authority (ABHA) portal for instant card download...',
      icon: 'info',
      showCancelButton: true,
      confirmButtonText: 'Proceed to ABHA Portal',
      confirmButtonColor: '#0284c7'
    }).then(res => {
      if (res.isConfirmed) {
        window.open('https://abha.abdm.gov.in/abha/v3/register', '_blank');
      }
    });
  };

  const handleGetAoCode = () => {
    const cityToUse = manualData.aoCity && manualData.aoCity !== 'SELECT CITY' ? manualData.aoCity : (manualData.district !== 'SELECT' ? manualData.district : '');
    if (!cityToUse) {
      Toast.fire({ icon: 'warning', title: 'Please select a State / District or City for AO Code lookup' });
      return;
    }
    const availableAo = getAoCodesForDistrict(cityToUse);
    if (availableAo && availableAo.length > 0) {
      const selected = availableAo[0];
      setManualData(prev => ({
        ...prev,
        aoCity: selected.city,
        aoAreaCode: selected.areaCode,
        aoType: selected.aoType,
        aoRangeCode: selected.rangeCode,
        aoNo: selected.aoNo
      }));
    }
  };

  // Helper to check if a specific field is set to Display or Hide by Admin
  const isFieldVisible = (fieldName, defaultVal = true) => {
    if (manualData.isSingleParent === 'YES' && ['fatherFirstName', 'fatherMiddleName', 'fatherLastName'].includes(fieldName)) {
      return false;
    }
    const manualTab = tabs.find(t => t.id === 'manual_new_pan');
    if (manualTab && Array.isArray(manualTab.fields)) {
      const found = manualTab.fields.find(f => f.name === fieldName);
      if (found && (found.hidden !== undefined || found.visible !== undefined)) {
        if (found.hidden !== undefined) return !found.hidden;
        if (found.visible !== undefined) return found.visible;
      }
    }
    return defaultVal;
  };

  // Helper to check if a specific field is set as mandatory by Admin
  const isFieldReq = (fieldName, defaultVal = true) => {
    if (!isFieldVisible(fieldName, defaultVal)) return false;
    const manualTab = tabs.find(t => t.id === 'manual_new_pan');
    if (manualTab && Array.isArray(manualTab.fields)) {
      const found = manualTab.fields.find(f => f.name === fieldName);
      if (found && found.required !== undefined) {
        return found.required;
      }
    }
    return defaultVal;
  };

  // Helper to extract custom dynamic fields added via Admin Panel for Form 93 / Form 94
  const getCustomFieldsForCurrentForm = (targetTabId = 'manual_new_pan') => {
    const targetTab = tabs.find(t => t.id === targetTabId) || tabs.find(t => t.id === 'manual_new_pan');
    if (!targetTab || !Array.isArray(targetTab.fields)) return [];

    const isIndividual = targetTabId === 'epan_correction'
      ? (!correctionData.category || correctionData.category === 'INDIVIDUAL')
      : (manualData.category === 'INDIVIDUAL');
    const currentFormType = isIndividual ? 'Form 93' : 'Form 94';

    const STANDARD_F93 = new Set([
      'category', 'panNumber', 'aadhaarNumber', 'proofOfDob', 'title', 'firstName', 'middleName', 'lastName',
      'isSingleParent', 'fatherFirstName', 'fatherMiddleName', 'fatherLastName',
      'motherFirstName', 'motherMiddleName', 'motherLastName', 'nameAsPerAadhaar',
      'gender', 'dob', 'mobileNumber', 'email', 'flatNo', 'premises', 'roadStreet',
      'areaTaluka', 'state', 'district', 'pincode', 'proofOfIdentity', 'proofOfAddress',
      'photoUrl', 'signatureUrl', 'copyOfPan', 'passportNumber', 'tin', 'parentToPrint',
      'addressType', 'postOffice', 'country', 'nameCorrection', 'dobCorrection', 'genderCorrection',
      'addressCorrection', 'fatherCorrection', 'contactCorrection'
    ]);

    const STANDARD_F94 = new Set([
      'category', 'panNumber', 'entityName', 'dateOfIncorporation', 'registrationNumber',
      'mobileNumber', 'email', 'landlineNumber', 'stdCode', 'incomeSource', 'proofOfIncorporation',
      'commFlatNo', 'commPremises', 'commRoadStreet', 'commAreaTaluka', 'commState',
      'commDistrict', 'commPincode', 'raTitle', 'raFirstName', 'raMiddleName',
      'raLastName', 'raPanNumber', 'raAadhaarNumber', 'raMobileNumber', 'raEmail',
      'raFlatNo', 'raRoadStreet', 'raAreaTaluka', 'raDistrict', 'raState',
      'raPincode', 'verifierName', 'verifierCapacity', 'verifierPlace', 'verifierDate',
      'tin', 'flatNo', 'roadStreet', 'postOffice', 'areaTaluka', 'state', 'district', 'pincode', 'country',
      'proofOfIdentity', 'proofOfAddress', 'copyOfPan', 'designation'
    ]);

    const stdSet = isIndividual ? STANDARD_F93 : STANDARD_F94;

    return targetTab.fields.filter(f => {
      if (!f || f.hidden) return false;

      const fFormType = f.formType || 'Both';
      const isApplicable = fFormType === 'Both' ||
        fFormType === currentFormType ||
        (currentFormType === 'Form 93' && (fFormType === 'Form 93' || fFormType.includes('93'))) ||
        (currentFormType === 'Form 94' && (fFormType === 'Form 94' || fFormType.includes('94')));

      if (!isApplicable) return false;

      return !stdSet.has(f.name);
    });
  };

  // Helper to extract fields in the EXACT ORDER configured via Admin Panel Drag & Drop
  const getOrderedFieldsForCurrentForm = () => {
    const manualTab = tabs.find(t => t.id === 'manual_new_pan');
    const DEFAULT_FORM_FIELDS = [
      { name: 'category', label: 'CATEGORY OF APPLICANT', type: 'select', formType: 'Both', required: true },
      { name: 'aadhaarNumber', label: 'AADHAAR NO', type: 'text', formType: 'Form 93', required: true },
      { name: 'proofOfDob', label: 'PROOF OF DOB', type: 'select', formType: 'Form 93', required: true },
      { name: 'title', label: 'TITLE', type: 'select', formType: 'Form 93', required: true },
      { name: 'firstName', label: 'FIRST NAME', type: 'text', formType: 'Form 93', required: false },
      { name: 'middleName', label: 'MIDDLE NAME', type: 'text', formType: 'Form 93', required: false },
      { name: 'lastName', label: 'LAST NAME / SURNAME', type: 'text', formType: 'Form 93', required: true },
      { name: 'isSingleParent', label: 'WHETHER MOTHER/FATHER IS A SINGLE PARENT', type: 'select', formType: 'Form 93', required: true },
      { name: 'fatherFirstName', label: "FATHER'S FIRST NAME", type: 'text', formType: 'Form 93', required: false },
      { name: 'fatherMiddleName', label: "FATHER'S MIDDLE NAME", type: 'text', formType: 'Form 93', required: false },
      { name: 'fatherLastName', label: "FATHER'S LAST NAME", type: 'text', formType: 'Form 93', required: false },
      { name: 'motherFirstName', label: "MOTHER'S FIRST NAME", type: 'text', formType: 'Form 93', required: false },
      { name: 'motherMiddleName', label: "MOTHER'S MIDDLE NAME", type: 'text', formType: 'Form 93', required: false },
      { name: 'motherLastName', label: "MOTHER'S LAST NAME", type: 'text', formType: 'Form 93', required: false },
      { name: 'nameAsPerAadhaar', label: 'NAME AS PER AADHAAR', type: 'text', formType: 'Form 93', required: true },
      { name: 'gender', label: 'GENDER', type: 'select', formType: 'Form 93', required: true },
      { name: 'dob', label: 'DATE OF BIRTH', type: 'date', formType: 'Form 93', required: true },
      { name: 'mobileNumber', label: 'MOBILE NO.', type: 'tel', formType: 'Both', required: true },
      { name: 'email', label: 'EMAIL ID', type: 'email', formType: 'Both', required: true },
      { name: 'flatNo', label: 'FLAT/DOOR/BLOCK NO', type: 'text', formType: 'Form 93', required: true },
      { name: 'premises', label: 'PREMISES/BUILDING/VILLAGE', type: 'text', formType: 'Form 93', required: true },
      { name: 'roadStreet', label: 'ROAD/STREET/POST OFFICE', type: 'text', formType: 'Form 93', required: true },
      { name: 'areaTaluka', label: 'AREA/TALUKA/SUB DIVISION', type: 'text', formType: 'Form 93', required: true },
      { name: 'state', label: 'STATE', type: 'select', formType: 'Form 93', required: true },
      { name: 'district', label: 'TOWN/DISTRICT', type: 'select', formType: 'Form 93', required: true },
      { name: 'pincode', label: 'PINCODE', type: 'text', formType: 'Form 93', required: true },
      { name: 'proofOfIdentity', label: 'PROOF OF IDENTITY', type: 'select', formType: 'Form 93', required: true },
      { name: 'proofOfAddress', label: 'PROOF OF ADDRESS', type: 'select', formType: 'Form 93', required: true },
      { name: 'photoUrl', label: 'Upload Applicant Photo', type: 'file', formType: 'Form 93', required: false },
      { name: 'signatureUrl', label: 'Upload Applicant Signature', type: 'file', formType: 'Form 93', required: false }
    ];

    const fieldsList = (manualTab && Array.isArray(manualTab.fields) && manualTab.fields.length > 0)
      ? manualTab.fields
      : DEFAULT_FORM_FIELDS;

    const isIndividual = manualData.category === 'INDIVIDUAL';
    const isF94 = (f) => {
      if (!f) return false;
      if (f.formType === 'Form 94') return true;
      if (f.formType === 'Form 93' || f.formType === 'Both') return false;
      const name = f.name || '';
      return name.startsWith('comm') || name.startsWith('ra') || name.startsWith('verifier') || name === 'entityName' || name === 'dateOfIncorporation' || name === 'registrationNumber' || name === 'incomeSource' || name === 'proofOfIncorporation';
    };

    return fieldsList.filter(f => {
      if (!f || f.hidden === true || !isFieldVisible(f.name)) return false;
      if (isIndividual) {
        return !isF94(f);
      } else {
        return isF94(f) || f.name === 'category' || f.name === 'mobileNumber' || f.name === 'email';
      }
    });
  };

  const renderSingleField = (field) => {
    const fieldName = field.name;
    const fieldLabel = field.label || fieldName;
    const req = isFieldReq(fieldName, field.required !== false);
    const placeholder = field.placeholder || `Enter ${fieldLabel}`;

    // Determine grid column span out of 12
    let gridSpan = 'span 6';
    if (['category', 'aadhaarNumber', 'proofOfDob', 'isSingleParent', 'entityName', 'proofOfIncorporation', 'pincode', 'commPincode'].includes(fieldName)) {
      gridSpan = 'span 12';
    } else if (['title', 'firstName', 'middleName', 'lastName'].includes(fieldName)) {
      gridSpan = 'span 3';
    } else if (['fatherFirstName', 'fatherMiddleName', 'fatherLastName', 'motherFirstName', 'motherMiddleName', 'motherLastName'].includes(fieldName)) {
      gridSpan = 'span 4';
    } else if (field.type === 'file') {
      gridSpan = 'span 6';
    }

    if (fieldName === 'category') {
      return (
        <div key="category" style={{ gridColumn: gridSpan, marginBottom: '8px' }}>
          <label className="form-label-pro">
            {fieldLabel} {req && <span className="req-star">*</span>}
          </label>
          <select
            name="category"
            value={manualData.category}
            onChange={handleManualChange}
            className="form-select-pro"
            style={{ width: '100%' }}
          >
            <option value="INDIVIDUAL">INDIVIDUAL</option>
            <option value="FIRM">FIRM</option>
            <option value="BODY OF INDIVIDUALS">BODY OF INDIVIDUALS</option>
            <option value="TRUST">TRUST</option>
            <option value="ASSOCIATION OF PERSONS">ASSOCIATION OF PERSONS</option>
            <option value="LOCAL AUTHORITY">LOCAL AUTHORITY</option>
            <option value="COMPANY">COMPANY</option>
            <option value="HINDU UNDIVIDED FAMILY">HINDU UNDIVIDED FAMILY</option>
            <option value="LIMITED LIABILITY PARTNERSHIP">LIMITED LIABILITY PARTNERSHIP</option>
            <option value="ARTIFICIAL JURIDICAL PERSON">ARTIFICIAL JURIDICAL PERSON</option>
            <option value="GOVERNMENT">GOVERNMENT</option>
          </select>
        </div>
      );
    }

    if (fieldName === 'aadhaarNumber') {
      return (
        <div key="aadhaarNumber" style={{ gridColumn: gridSpan, marginBottom: '8px' }}>
          <label className="form-label-pro">
            {fieldLabel} {req && <span className="req-star">*</span>}
          </label>
          <input
            type="text"
            name="aadhaarNumber"
            value={manualData.aadhaarNumber}
            onChange={handleManualChange}
            placeholder={placeholder || '12 DIGITS UID NO'}
            maxLength={12}
            className="form-input-pro"
            style={{ width: '100%' }}
          />
        </div>
      );
    }

    if (fieldName === 'proofOfDob') {
      return (
        <div key="proofOfDob" style={{ gridColumn: gridSpan, marginBottom: '8px' }}>
          <div style={{ background: 'rgba(234, 88, 12, 0.08)', border: '1px solid rgba(234, 88, 12, 0.3)', borderRadius: '10px', padding: '10px 14px', marginBottom: '10px', color: '#fb923c', fontSize: '12.5px', fontWeight: '700' }}>
            📌 If any other DOB (Date of Birth) Proof is not available, choose PROOF OF DOB List or ABHA Card.
          </div>
          <label className="form-label-pro">
            {fieldLabel} {req && <span className="req-star">*</span>}
          </label>
          <select
            name="proofOfDob"
            value={manualData.proofOfDob}
            onChange={handleManualChange}
            className="form-select-pro"
            style={{ width: '100%' }}
          >
            <option value="">Please Select</option>
            {PROOF_OF_DOB_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>
      );
    }

    if (fieldName === 'title') {
      return (
        <div key="title" style={{ gridColumn: gridSpan, marginBottom: '8px' }}>
          <label className="form-label-pro">
            {fieldLabel} {req && <span className="req-star">*</span>}
          </label>
          <select name="title" value={manualData.title} onChange={handleManualChange} className="form-select-pro" style={{ width: '100%' }}>
            <option value="SELECT">SELECT</option>
            <option value="SHRI">SHRI</option>
            <option value="SMT">SMT</option>
            <option value="KUMARI">KUMARI</option>
          </select>
        </div>
      );
    }

    if (['firstName', 'middleName', 'lastName'].includes(fieldName)) {
      return (
        <div key={fieldName} style={{ gridColumn: gridSpan, marginBottom: '8px' }}>
          <label className="form-label-pro">
            {fieldLabel} {req && <span className="req-star">*</span>}
          </label>
          <input
            type="text"
            name={fieldName}
            value={manualData[fieldName] || ''}
            onChange={handleManualChange}
            placeholder={placeholder}
            className="form-input-pro uppercase-text"
            style={{ width: '100%' }}
          />
        </div>
      );
    }

    if (fieldName === 'isSingleParent') {
      return (
        <div key="isSingleParent" style={{ gridColumn: gridSpan, marginBottom: '8px' }}>
          <label className="form-label-pro">
            {fieldLabel} {req && <span className="req-star">*</span>}
          </label>
          <select name="isSingleParent" value={manualData.isSingleParent} onChange={handleManualChange} className="form-select-pro" style={{ width: '100%' }}>
            <option value="NO">NO</option>
            <option value="YES">YES</option>
          </select>
        </div>
      );
    }

    if (['fatherFirstName', 'fatherMiddleName', 'fatherLastName', 'motherFirstName', 'motherMiddleName', 'motherLastName'].includes(fieldName)) {
      return (
        <div key={fieldName} style={{ gridColumn: gridSpan, marginBottom: '8px' }}>
          <label className="form-label-pro">
            {fieldLabel} {req && <span className="req-star">*</span>}
          </label>
          <input
            type="text"
            name={fieldName}
            value={manualData[fieldName] || ''}
            onChange={handleManualChange}
            placeholder={placeholder}
            className="form-input-pro uppercase-text"
            style={{ width: '100%' }}
          />
        </div>
      );
    }

    if (fieldName === 'nameAsPerAadhaar') {
      return (
        <div key="nameAsPerAadhaar" style={{ gridColumn: gridSpan, marginBottom: '8px' }}>
          <label className="form-label-pro">
            {fieldLabel} {req && <span className="req-star">*</span>}
          </label>
          <input
            type="text"
            name="nameAsPerAadhaar"
            value={manualData.nameAsPerAadhaar}
            onChange={handleManualChange}
            placeholder={placeholder || 'NAME AS PER AADHAAR'}
            className="form-input-pro uppercase-text"
            style={{ width: '100%' }}
          />
        </div>
      );
    }

    if (fieldName === 'gender') {
      return (
        <div key="gender" style={{ gridColumn: gridSpan, marginBottom: '8px' }}>
          <label className="form-label-pro">
            {fieldLabel} {req && <span className="req-star">*</span>}
          </label>
          <select name="gender" value={manualData.gender} onChange={handleManualChange} className="form-select-pro" style={{ width: '100%' }}>
            <option value="SELECT">SELECT</option>
            <option value="MALE">MALE</option>
            <option value="FEMALE">FEMALE</option>
            <option value="TRANSGENDER">TRANSGENDER</option>
          </select>
        </div>
      );
    }

    if (fieldName === 'dob') {
      return (
        <div key="dob" style={{ gridColumn: isMinor ? 'span 12' : gridSpan, marginBottom: '8px' }}>
          <label className="form-label-pro">
            {fieldLabel} {req && <span className="req-star">*</span>}
          </label>
          <input type="date" name="dob" value={manualData.dob} onChange={handleManualChange} className="form-input-pro" style={{ width: '100%' }} />

          {isMinor && (
            <div style={{
              background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.08) 0%, rgba(234, 88, 12, 0.06) 100%)',
              border: '1.5px solid rgba(239, 68, 68, 0.35)',
              borderRadius: '14px',
              padding: '18px 20px',
              marginTop: '14px',
              marginBottom: '8px',
              boxShadow: '0 8px 25px rgba(239, 68, 68, 0.1)'
            }}>
              <div style={{ color: '#f87171', fontWeight: '800', fontSize: '14px', marginBottom: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(239, 68, 68, 0.2)', paddingBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>👶</span> <span>UNDERAGE MINOR APPLICANT DETAILS (Age &lt; 18 Years)</span>
                </div>
                <span style={{ background: '#ef4444', color: '#fff', fontSize: '10px', padding: '3px 8px', borderRadius: '12px', fontWeight: '800' }}>
                  MANDATORY FOR MINOR
                </span>
              </div>

              <p style={{ color: '#cbd5e1', fontSize: '12px', marginTop: 0, marginBottom: '14px', lineHeight: '1.4' }}>
                As per Income Tax Department & NSDL rules, since the applicant is under 18 years old, Representative Assessee (Parent / Guardian) details and Guardian Photo are required for Form 49A (PART E).
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <label className="form-label-pro">RA TITLE <span className="req-star">*</span></label>
                  <select name="raTitle" value={manualData.raTitle || 'SHRI'} onChange={handleManualChange} className="form-select-pro">
                    <option value="SHRI">SHRI</option>
                    <option value="SMT">SMT</option>
                    <option value="KUMARI">KUMARI</option>
                  </select>
                </div>
                <div>
                  <label className="form-label-pro">GUARDIAN FIRST NAME <span className="req-star">*</span></label>
                  <input type="text" name="raFirstName" value={manualData.raFirstName || ''} onChange={handleManualChange} placeholder="GUARDIAN FIRST NAME" className="form-input-pro uppercase-text" required={isMinor} />
                </div>
                <div>
                  <label className="form-label-pro">GUARDIAN MIDDLE NAME</label>
                  <input type="text" name="raMiddleName" value={manualData.raMiddleName || ''} onChange={handleManualChange} placeholder="MIDDLE NAME" className="form-input-pro uppercase-text" />
                </div>
                <div>
                  <label className="form-label-pro">GUARDIAN LAST NAME <span className="req-star">*</span></label>
                  <input type="text" name="raLastName" value={manualData.raLastName || ''} onChange={handleManualChange} placeholder="LAST NAME / SURNAME" className="form-input-pro uppercase-text" required={isMinor} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                <div>
                  <label className="form-label-pro">GUARDIAN AADHAAR NUMBER <span className="req-star">*</span></label>
                  <input type="text" name="raAadhaarNumber" value={manualData.raAadhaarNumber || ''} onChange={handleManualChange} placeholder="12-DIGIT AADHAAR NUMBER" maxLength={12} className="form-input-pro" required={isMinor} />
                </div>
                <div>
                  <label className="form-label-pro">GUARDIAN PAN NUMBER (IF ANY)</label>
                  <input type="text" name="raPanNumber" value={manualData.raPanNumber || ''} onChange={handleManualChange} placeholder="10-CHARACTER PAN (OPTIONAL)" maxLength={10} className="form-input-pro uppercase-text" />
                </div>
              </div>

              <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '12px', padding: '14px' }}>
                <label className="form-label-pro" style={{ color: '#fb923c', fontWeight: '800', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                  <span>📷</span> <span>UPLOAD GUARDIAN PHOTO (Parent / Representative Assessee Photo) <span className="req-star">*</span></span>
                </label>
                <DropzoneBox
                  label="Upload Parent / Guardian Photo (Minor Application)"
                  fieldName="raPhotoUrl"
                  isRequired={isMinor}
                  currentValue={manualData.raPhotoUrl || manualData.proofOfOtherUrl}
                  onFileSelect={(dataUrl) => setManualData(prev => ({ ...prev, raPhotoUrl: dataUrl, proofOfOtherUrl: dataUrl }))}
                  accept="image/*"
                  hint="Drag & drop Parent / Guardian passport photo here (JPG, PNG)."
                  icon="👨‍👦"
                />
              </div>
            </div>
          )}
        </div>
      );
    }

    if (fieldName === 'mobileNumber') {
      return (
        <div key="mobileNumber" style={{ gridColumn: gridSpan, marginBottom: '8px' }}>
          <label className="form-label-pro">
            {fieldLabel} {req && <span className="req-star">*</span>}
          </label>
          <input type="tel" name="mobileNumber" value={manualData.mobileNumber} onChange={handleManualChange} placeholder={placeholder || 'MOBILE NO.'} maxLength={10} className="form-input-pro" style={{ width: '100%' }} />
        </div>
      );
    }

    if (fieldName === 'email') {
      return (
        <div key="email" style={{ gridColumn: gridSpan, marginBottom: '8px' }}>
          <label className="form-label-pro">
            {fieldLabel} {req && <span className="req-star">*</span>}
          </label>
          <input type="email" name="email" value={manualData.email} onChange={handleManualChange} placeholder={placeholder || 'EMAIL ID'} className="form-input-pro" style={{ width: '100%' }} />
        </div>
      );
    }

    if (fieldName === 'state') {
      return (
        <div key="state" style={{ gridColumn: gridSpan, marginBottom: '8px' }}>
          <label className="form-label-pro">
            {fieldLabel} {req && <span className="req-star">*</span>}
          </label>
          <select name="state" value={manualData.state} onChange={handleManualChange} className="form-select-pro" style={{ width: '100%' }}>
            <option value="PLEASE SELECT">PLEASE SELECT</option>
            {ALL_INDIAN_STATES.map(st => (
              <option key={st} value={st}>{st}</option>
            ))}
          </select>
        </div>
      );
    }

    if (fieldName === 'district') {
      return (
        <div key="district" style={{ gridColumn: gridSpan, marginBottom: '8px' }}>
          <label className="form-label-pro">
            {fieldLabel} {req && <span className="req-star">*</span>}
          </label>
          <select name="district" value={manualData.district} onChange={handleManualChange} className="form-select-pro" style={{ width: '100%' }}>
            <option value="SELECT">SELECT</option>
            {((manualData.state && INDIAN_STATES_DISTRICTS[manualData.state])
              ? INDIAN_STATES_DISTRICTS[manualData.state]
              : ALL_INDIAN_DISTRICTS
            ).map(dist => (
              <option key={dist} value={dist}>{dist}</option>
            ))}
          </select>
        </div>
      );
    }

    if (['flatNo', 'premises', 'roadStreet', 'areaTaluka', 'pincode'].includes(fieldName)) {
      return (
        <div key={fieldName} style={{ gridColumn: gridSpan, marginBottom: '8px' }}>
          <label className="form-label-pro">
            {fieldLabel} {req && <span className="req-star">*</span>}
          </label>
          <input type="text" name={fieldName} value={manualData[fieldName] || ''} onChange={handleManualChange} placeholder={placeholder} maxLength={fieldName === 'pincode' ? 6 : undefined} className="form-input-pro uppercase-text" style={{ width: '100%' }} />
        </div>
      );
    }

    if (fieldName === 'proofOfIdentity') {
      return (
        <div key="proofOfIdentity" style={{ gridColumn: gridSpan, marginBottom: '8px' }}>
          <label className="form-label-pro">
            {fieldLabel} {req && <span className="req-star">*</span>}
          </label>
          <select name="proofOfIdentity" value={manualData.proofOfIdentity} onChange={handleManualChange} className="form-select-pro" style={{ width: '100%' }}>
            <option value="">Please Select</option>
            {PROOF_OF_IDENTITY_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>
      );
    }

    if (fieldName === 'proofOfAddress') {
      return (
        <div key="proofOfAddress" style={{ gridColumn: gridSpan, marginBottom: '8px' }}>
          <label className="form-label-pro">
            {fieldLabel} {req && <span className="req-star">*</span>}
          </label>
          <select name="proofOfAddress" value={manualData.proofOfAddress} onChange={handleManualChange} className="form-select-pro" style={{ width: '100%' }}>
            <option value="">Please Select</option>
            {PROOF_OF_ADDRESS_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>
      );
    }

    if (fieldName === 'photoUrl') {
      if (manualData.category !== 'INDIVIDUAL') return null;
      return (
        <div key="photoUrl" style={{ gridColumn: gridSpan, marginBottom: '8px' }}>
          <label className="form-label-pro" style={{ color: '#38bdf8', fontWeight: '800', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
            <span>📷</span> <span>{fieldLabel} {!isMinor && req && <span className="req-star">*</span>}</span>
          </label>
          <DropzoneBox
            label="Upload Applicant Photo"
            fieldName="photoUrl"
            isRequired={!isMinor && req}
            currentValue={manualData.photoUrl}
            onFileSelect={(dataUrl) => setManualData(prev => ({ ...prev, photoUrl: dataUrl }))}
            accept="image/*"
            hint="Drag & drop applicant photo here (JPG, PNG)."
            icon="👤"
          />
        </div>
      );
    }

    if (fieldName === 'signatureUrl') {
      return (
        <div key="signatureUrl" style={{ gridColumn: gridSpan, marginBottom: '8px' }}>
          <label className="form-label-pro" style={{ color: '#38bdf8', fontWeight: '800', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
            <span>✍️</span> <span>{fieldLabel} {req && <span className="req-star">*</span>}</span>
          </label>
          <DropzoneBox
            label="Upload Applicant Signature"
            fieldName="signatureUrl"
            isRequired={req}
            currentValue={manualData.signatureUrl}
            onFileSelect={(dataUrl) => setManualData(prev => ({ ...prev, signatureUrl: dataUrl }))}
            accept="image/*"
            hint="Drag & drop signature image here (JPG, PNG)."
            icon="✍️"
          />
        </div>
      );
    }

    if (['entityName', 'dateOfIncorporation', 'registrationNumber', 'incomeSource', 'proofOfIncorporation', 'commFlatNo', 'commPremises', 'commRoadStreet', 'commAreaTaluka', 'commState', 'commDistrict', 'commPincode', 'stdCode', 'landlineNumber', 'raTitle', 'raFirstName', 'raMiddleName', 'raLastName', 'raPanNumber', 'raAadhaarNumber', 'raMobileNumber', 'raEmail', 'raFlatNo', 'raRoadStreet', 'raAreaTaluka', 'raDistrict', 'raState', 'raPincode', 'verifierName', 'verifierCapacity', 'verifierPlace', 'verifierDate'].includes(fieldName)) {
      if (field.type === 'select') {
        let optionsList = field.options || [];
        if (fieldName === 'commState' || fieldName === 'raState') optionsList = ['PLEASE SELECT', ...ALL_INDIAN_STATES];
        if (fieldName === 'commDistrict' || fieldName === 'raDistrict') optionsList = ['SELECT', ...ALL_INDIAN_DISTRICTS];

        return (
          <div key={fieldName} style={{ gridColumn: gridSpan, marginBottom: '8px' }}>
            <label className="form-label-pro">
              {fieldLabel} {req && <span className="req-star">*</span>}
            </label>
            <select
              name={fieldName}
              value={manualData[fieldName] || ''}
              onChange={handleManualChange}
              className="form-select-pro"
              style={{ width: '100%' }}
            >
              <option value="">-- Select {fieldLabel} --</option>
              {optionsList.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>
        );
      }
      
      return (
        <div key={fieldName} style={{ gridColumn: gridSpan, marginBottom: '8px' }}>
          <label className="form-label-pro">
            {fieldLabel} {req && <span className="req-star">*</span>}
          </label>
          <input
            type={field.type || 'text'}
            name={fieldName}
            value={manualData[fieldName] || ''}
            onChange={handleManualChange}
            placeholder={placeholder}
            className="form-input-pro uppercase-text"
            style={{ width: '100%' }}
          />
        </div>
      );
    }

    return (
      <div key={fieldName} style={{ gridColumn: gridSpan, marginBottom: '8px' }}>
        <label className="form-label-pro">
          {field.icon ? `${field.icon} ` : ''}{fieldLabel} {req && <span className="req-star">*</span>}
        </label>
        {field.type === 'select' ? (
          <select
            name={fieldName}
            value={manualData[fieldName] || ''}
            onChange={handleManualChange}
            className="form-select-pro"
            style={{ width: '100%' }}
          >
            <option value="">-- Select {fieldLabel} --</option>
            {(field.options || []).map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        ) : field.type === 'file' ? (
          <input
            type="file"
            onChange={(e) => {
              const file = e.target.files[0];
              if (file) {
                const reader = new FileReader();
                reader.onloadend = () => {
                  setManualData(prev => ({ ...prev, [fieldName]: reader.result }));
                };
                reader.readAsDataURL(file);
              }
            }}
            className="form-input-pro"
            style={{ width: '100%' }}
          />
        ) : (
          <input
            type={field.type || 'text'}
            name={fieldName}
            value={manualData[fieldName] || ''}
            onChange={handleManualChange}
            placeholder={placeholder}
            className="form-input-pro"
            style={{ width: '100%' }}
          />
        )}
      </div>
    );
  };


  // Helper for Underage / Minor Applicant age calculation
  const getAgeFromDob = (dobString) => {
    if (!dobString || typeof dobString !== 'string') return null;
    const trimmed = dobString.trim();
    if (!trimmed) return null;

    const birthDate = new Date(trimmed);
    if (isNaN(birthDate.getTime())) return null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // If birthdate is today or in the future, it is not a past birthdate for minor logic
    if (birthDate >= today) {
      return null;
    }

    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  const applicantAge = getAgeFromDob(manualData.dob);
  const isMinor = applicantAge !== null && applicantAge >= 0 && applicantAge < 18;

  // Download Pre-Filled Form 49A PDF
  const handleDownloadPdf = async () => {
    if (!manualData.lastName && !manualData.nameAsPerAadhaar && !manualData.aadhaarNumber) {
      Toast.fire({ icon: 'warning', title: 'Please fill in basic application form details first' });
      return;
    }
    Toast.fire({ icon: 'info', title: 'Generating Form 49A PDF with Photo & Signature...' });
    const payload = {
      ...manualData,
      isMinor,
      applicantAge
    };
    const success = await generateForm49APdf(payload);
    if (success) {
      Toast.fire({ icon: 'success', title: 'Form 49A PDF generated and downloaded!' });
    } else {
      Toast.fire({ icon: 'error', title: 'Could not generate PDF. Please check your data.' });
    }
  };

  // eslint-disable-next-line no-unused-vars
  const handleAutoFillForm = () => {
    setManualData(prev => ({
      ...prev,
      category: 'INDIVIDUAL',
      aadhaarNumber: '987654321098',
      proofOfDob: 'AADHAAR CARD ISSUED BY UIDAI',
      title: 'SHRI',
      lastName: 'SHARMA',
      firstName: 'RAJESH',
      middleName: 'KUMAR',
      isSingleParent: 'NO',
      fatherLastName: 'SHARMA',
      fatherFirstName: 'RAMESH',
      fatherMiddleName: 'CHANDRA',
      nameAsPerAadhaar: 'RAJESH KUMAR SHARMA',
      gender: 'MALE',
      dob: '1995-08-15',
      mobileNumber: '9876543210',
      email: 'rajesh.sharma@gmail.com',
      flatNo: 'FLAT NO 402, SHANTI APARTMENTS',
      premises: 'SECTOR 15, NEAR MG ROAD',
      roadStreet: 'MAIN ROAD, SUBHASH NAGAR',
      areaTaluka: 'ANDHERI EAST',
      state: 'MAHARASHTRA',
      district: 'MUMBAI',
      pincode: '400069',
      proofOfIdentity: 'AADHAAR CARD ISSUED BY THE UNIQUE IDENTIFICATION AUTHORITY OF INDIA',
      proofOfAddress: 'AADHAAR CARD ISSUED BY THE UNIQUE IDENTIFICATION AUTHORITY OF INDIA'
    }));
    Toast.fire({ icon: 'success', title: '⚡ Form Auto-Filled! Form 49A PDF is ready to download.' });
  };

  const handleAddDocument = async () => {
    if (!selectedAppForDocument || !documentToAdd) {
      Toast.fire({ icon: 'warning', title: 'Please select a PDF or image document first.' });
      return;
    }

    setIsAddingDocument(true);
    try {
      const response = await fetch(`${API_URL}/api/pancard/${selectedAppForDocument._id}/documents`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser, name: documentName, document: documentToAdd })
      });
      const data = await response.json();
      if (!data.success) throw new Error(data.message || 'Unable to add document.');

      Toast.fire({ icon: 'success', title: 'Document added. It is now available to Admin.' });
      setSelectedAppForDocument(null);
      setDocumentToAdd('');
      setDocumentName('');
      fetchHistory('user');
    } catch (err) {
      Toast.fire({ icon: 'error', title: err.message || 'Unable to add document.' });
    } finally {
      setIsAddingDocument(false);
    }
  };

  // Submit PAN Application (Manual / E-KYC / Correction / Dynamic Tabs)
  const handleManualSubmit = async (e) => {
    e.preventDefault();
    if (Swal.isVisible() && Swal.getPopup()?.classList?.contains('swal2-toast')) {
      Swal.close();
    }

    if (activeTab !== 'manual_new_pan') {
      // Handle E-KYC, Correction, or Dynamic tab submission
      if (!formData.applicantName) {
        Toast.fire({ icon: 'error', title: 'Please enter Applicant Full Name' });
        return;
      }
      if (!formData.mobileNumber || formData.mobileNumber.length < 10) {
        Toast.fire({ icon: 'error', title: 'Please enter a valid 10-digit Mobile Number' });
        return;
      }
      if (!formData.email) {
        Toast.fire({ icon: 'error', title: 'Please enter Email Address' });
        return;
      }
      if (activeTab === 'epan_kyc' && (!formData.aadhaarNumber || formData.aadhaarNumber.length < 12)) {
        Toast.fire({ icon: 'error', title: 'Please enter a valid 12-digit Aadhaar Number' });
        return;
      }
      if (activeTab === 'epan_correction' && !formData.panNumber) {
        Toast.fire({ icon: 'error', title: 'Please enter existing PAN Number' });
        return;
      }

      const feeAmount = tabs.find(t => t.id === activeTab)?.fee ?? 107;
      if (walletBalance < feeAmount) {
        Swal.fire({
          icon: 'warning',
          title: 'Insufficient Wallet Balance',
          html: `Your wallet balance is <b>₹${parseFloat(walletBalance).toFixed(2)}</b>.<br/>PAN Application fee required: <b>₹${feeAmount}</b>.`,
          confirmButtonColor: '#ea580c'
        });
        return;
      }

      const appLabel = getApplicationTypeLabel();
      const confirmRes = await Swal.fire({
        title: `Submit ${appLabel} Application`,
        html: `
          <div style="text-align: left; font-size: 14px; line-height: 1.6; background: rgba(15, 23, 42, 0.6); padding: 16px; border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.1); margin-top: 10px;">
            <p style="margin: 0 0 6px 0;"><b>Applicant:</b> ${formData.applicantName}</p>
            <p style="margin: 0 0 6px 0;"><b>Mobile:</b> ${formData.mobileNumber}</p>
            <p style="margin: 0 0 6px 0;"><b>Email:</b> ${formData.email}</p>
            <p style="margin: 0;"><b>Fee Deducted:</b> <span style="color: #ea580c; font-weight: 800;">₹${feeAmount}</span></p>
          </div>
        `,
        showCancelButton: true,
        confirmButtonText: `Submit & Pay ₹${feeAmount}`,
        cancelButtonText: 'Cancel',
        confirmButtonColor: '#ea580c',
        cancelButtonColor: '#64748b'
      });

      if (!confirmRes.isConfirmed) return;

      setIsSubmitting(true);
      try {
        const response = await fetch(`${API_URL}/api/pancard/submit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: currentUser,
            applicationType: appLabel,
            applicantName: formData.applicantName,
            fatherName: formData.fatherName || '',
            dob: formData.dob || '',
            gender: formData.gender || 'Male',
            mobileNumber: formData.mobileNumber,
            email: formData.email,
            aadhaarNumber: formData.aadhaarNumber || '',
            panNumber: formData.panNumber || '',
            details: formData,
            remarks: `${appLabel} Form Submission`
          })
        });

        const data = await response.json();
        setIsSubmitting(false);

        if (data.success) {
          Swal.fire({
            icon: 'success',
            title: `${appLabel} Application Submitted!`,
            html: `
              <div style="text-align: center; line-height: 1.6;">
                <p style="font-size: 16px; color: #16a34a; font-weight: 700;">Ack No: ${data.ackNumber}</p>
                <p>Fee ₹${data.feeDeducted} deducted from your wallet balance.</p>
              </div>
            `,
            confirmButtonText: 'OK',
            confirmButtonColor: '#0284c7'
          }).then(() => {
            setHistoryViewMode('user');
            setActiveTab('history');
            fetchHistory('user');
            try {
              const url = new URL(window.location);
              url.searchParams.set('tab', 'history');
              window.history.replaceState({}, '', url);
            } catch (e) {}
          });
          setFormData(INITIAL_FORM_DATA);
          setHistoryViewMode('user');
          setActiveTab('history');
          fetchHistory('user');
          try {
            const url = new URL(window.location);
            url.searchParams.set('tab', 'history');
            window.history.replaceState({}, '', url);
          } catch (e) {}
        } else {
          Toast.fire({ icon: 'error', title: data.message || 'Submission failed.' });
        }
      } catch (err) {
        setIsSubmitting(false);
        console.error('Submit error:', err);
        Toast.fire({ icon: 'error', title: 'Error submitting application.' });
      }
      return;
    }

    if (manualData.category === 'INDIVIDUAL') {
      if (isFieldReq('aadhaarNumber') && (!manualData.aadhaarNumber || manualData.aadhaarNumber.length < 12)) {
        Toast.fire({ icon: 'error', title: 'Please enter a valid 12-digit Aadhaar Number' });
        return;
      }
      if (isFieldReq('lastName') && !manualData.lastName) {
        Toast.fire({ icon: 'error', title: 'Please enter Applicant Surname / Last Name' });
        return;
      }
      if (isFieldReq('firstName') && !manualData.firstName) {
        Toast.fire({ icon: 'error', title: 'Please enter Applicant First Name' });
        return;
      }
      if (isFieldReq('dob') && !manualData.dob) {
        Toast.fire({ icon: 'error', title: 'Please select Date of Birth' });
        return;
      }
      if (isFieldReq('mobileNumber') && (!manualData.mobileNumber || manualData.mobileNumber.length < 10)) {
        Toast.fire({ icon: 'error', title: 'Please enter a valid 10-digit Mobile Number' });
        return;
      }
      if (isFieldReq('email') && !manualData.email) {
        Toast.fire({ icon: 'error', title: 'Please enter Email Address' });
        return;
      }
      if (isFieldReq('photoUrl') && !manualData.photoUrl) {
        Toast.fire({ icon: 'error', title: 'Please upload Applicant Photo' });
        return;
      }
      if (isFieldReq('signatureUrl') && !manualData.signatureUrl) {
        Toast.fire({ icon: 'error', title: 'Please upload Applicant Signature' });
        return;
      }
    } else {
      // Non-Individual Entity Validations (FIRM, TRUST, COMPANY, BOI, AOP, etc.)
      const entityTitleName = manualData.entityName || manualData.lastName;
      if (!entityTitleName) {
        Toast.fire({ icon: 'error', title: 'Please enter Name of Firm / Company / Trust / Entity' });
        return;
      }
      const incDate = manualData.dateOfIncorporation || manualData.dob;
      if (!incDate) {
        Toast.fire({ icon: 'error', title: 'Please select Date of Incorporation / Agreement / Formation' });
        return;
      }
      if (!manualData.mobileNumber || manualData.mobileNumber.length < 10) {
        Toast.fire({ icon: 'error', title: 'Please enter a valid 10-digit Mobile Number' });
        return;
      }
      if (!manualData.email) {
        Toast.fire({ icon: 'error', title: 'Please enter Email Address' });
        return;
      }
    }

    // Custom Dynamic Fields Mandatory Check
    const activeCustomFields = getCustomFieldsForCurrentForm();
    for (const cf of activeCustomFields) {
      if (cf.required && !manualData[cf.name]) {
        Toast.fire({ icon: 'error', title: `Please enter ${cf.label}` });
        return;
      }
    }


    // MANDATORY CITY SELECTION CHECK
    const isDistrictPicked = manualData.district && manualData.district !== 'SELECT' && manualData.district !== 'PLEASE SELECT';
    const isAoCityPicked = manualData.aoCity && manualData.aoCity !== 'SELECT CITY';

    if (!isDistrictPicked && !isAoCityPicked) {
      Toast.fire({ icon: 'error', title: 'City Selection is mandatory. Please select your Town/District or AO City.' });
      return;
    }

    const feeAmount = tabs.find(t => t.id === 'manual_new_pan')?.fee ?? 107;
    if (walletBalance < feeAmount) {
      Swal.fire({
        icon: 'warning',
        title: 'Insufficient Wallet Balance',
        html: `Your wallet balance is <b>₹${parseFloat(walletBalance).toFixed(2)}</b>.<br/>PAN Application fee required: <b>₹${feeAmount}</b>.`,
        confirmButtonColor: '#ea580c'
      });
      return;
    }

    const applicantDisplayName = manualData.category === 'INDIVIDUAL'
      ? `${manualData.title !== 'SELECT' ? manualData.title : ''} ${manualData.firstName} ${manualData.lastName}`.trim() || manualData.lastName
      : (manualData.entityName || manualData.lastName);

    // Pre-open window synchronously for Form 93 PDF to prevent pop-up blocker
    const pdfWin = window.open('about:blank', '_blank');

    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_URL}/api/pancard/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser,
          applicationType: getApplicationTypeLabel(),
          applicantName: applicantDisplayName,
          fatherName: manualData.category === 'INDIVIDUAL' ? `${manualData.fatherFirstName} ${manualData.fatherLastName}`.trim() : (manualData.verifierName || 'Representative Assessee'),
          dob: manualData.category === 'INDIVIDUAL' ? manualData.dob : (manualData.dateOfIncorporation || manualData.dob),
          gender: manualData.gender !== 'SELECT' ? manualData.gender : 'N/A',
          mobileNumber: manualData.mobileNumber,
          email: manualData.email,
          aadhaarNumber: manualData.aadhaarNumber || manualData.raAadhaarNumber || '',
          panNumber: manualData.panNumber || '',
          photoUrl: manualData.photoUrl || '',
          signatureUrl: manualData.signatureUrl || '',
          details: {
            ...manualData,
            incomeSource: manualData.sourceofincome || manualData.sourceOfIncome || manualData.incomeSource || '',
            sourceOfIncome: manualData.sourceofincome || manualData.sourceOfIncome || manualData.incomeSource || '',
            sourceofincome: manualData.sourceofincome || manualData.sourceOfIncome || manualData.incomeSource || '',
            lastName: manualData.category === 'INDIVIDUAL' ? (manualData.lastName || '') : applicantDisplayName,
            dob: manualData.category === 'INDIVIDUAL' ? manualData.dob : (manualData.dateOfIncorporation || manualData.dob),
            applicantStatus: manualData.category
          },
          remarks: `Manual New PAN (${manualData.category}) Application Submitted`
        })
      });

      const data = await response.json();
      setIsSubmitting(false);

      if (data.success) {
        // Automatically convert application into official Form 93 document layout, download PDF & open in new tab
        await generateForm49APdf(manualData, 'form93-pdf-container', pdfWin);

        setManualData({
          ...INITIAL_MANUAL_DATA,
          verifierDate: new Date().toISOString().split('T')[0]
        });
        setHistoryViewMode('user');
        switchTab('history');
        fetchHistory('user');
      } else {
        if (pdfWin) pdfWin.close();
        Toast.fire({ icon: 'error', title: data.message || 'Submission failed.' });
      }
    } catch (err) {
      if (pdfWin) pdfWin.close();
      setIsSubmitting(false);
      console.error('Submit error:', err);
      Toast.fire({ icon: 'error', title: 'Error submitting application.' });
    }
  };

  const getApplicationTypeLabel = () => {
    if (activeTab === 'manual_new_pan') return 'Manual New PAN';
    if (activeTab === 'epan_kyc') return 'Aadhaar OTP New PAN';
    if (activeTab === 'epan_correction') return tabs.find(t => t.id === 'epan_correction' || t.id === 'manual_pan_correction')?.label || 'PAN Correction';
    return 'Manual New PAN';
  };

  const currentTabObj = tabs.find(t => t.id === activeTab) || tabs[0];

  return (
    <div className={`pancard-inline-container theme-${currentTheme}`}>
      <div className={`pancard-card theme-${currentTheme}`}>

        {/* Header Bar */}
        <div className="pancard-header">
          <div className="pancard-header-left">
            {activeTab !== 'services_landing' && (
              <div className="pancard-brand-row">
                <div className="pancard-title-badge">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="5" width="20" height="14" rx="3" />
                    <line x1="2" y1="10" x2="22" y2="10" />
                    <line x1="6" y1="15" x2="10" y2="15" />
                  </svg>
                </div>
                <div className="pancard-title-wrap">
                  <div className="pancard-title-with-tag">
                    <h3 className="pancard-title">PAN Card Services</h3>
                  </div>
                  <div className="pancard-subtitle">
                    Instant E-PAN Application, Form 49A Physical, Correction & Biometric e-KYC
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="pancard-header-right">
            {walletBalance !== undefined && (
              <div className="pancard-balance-badge">
                <span className="pancard-balance-coin">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 6v12M15 9.5a3.5 3.5 0 0 0-7 0c0 2 1.5 3 3.5 3.5s3.5 1.5 3.5 3.5a3.5 3.5 0 0 1-7 0" />
                  </svg>
                </span>
                <div className="pancard-balance-details">
                  <span className="balance-label">WALLET BALANCE</span>
                  <span className="balance-amount">₹{parseFloat(walletBalance).toFixed(2)}</span>
                </div>
              </div>
            )}
            {onClose && (
              <button
                type="button"
                className="pancard-back-btn"
                onClick={onClose}
                title="Back to Dashboard"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="19" y1="12" x2="5" y2="12"></line>
                  <polyline points="12 19 5 12 12 5"></polyline>
                </svg>
                <span>Back to Dashboard</span>
              </button>
            )}
          </div>
        </div>

        {/* Dynamic Sub-Tabs Bar (Clean Official Navigation) */}
        {activeTab !== 'services_landing' && (
          <div className="pancard-tabs-bar">
            <button
              type="button"
              className={`pancard-tab-btn ${(activeTab === 'new_app_landing' || activeTab === 'manual_new_pan' || activeTab === 'epan_kyc') ? 'active' : ''}`}
              onClick={() => switchTab('new_app_landing')}
            >
              <span className="tab-btn-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                </svg>
              </span>
              <span>New Application</span>
            </button>
            <button
              type="button"
              className={`pancard-tab-btn ${activeTab === 'epan_correction' ? 'active' : ''}`}
              onClick={() => switchTab('epan_correction')}
            >
              <span className="tab-btn-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </span>
              <span>{tabs.find(t => t.id === 'epan_correction' || t.id === 'manual_pan_correction')?.label || 'PAN Correction'}</span>
            </button>
            <button
              type="button"
              className={`pancard-tab-btn history-tab-btn ${activeTab === 'history' ? 'active' : ''}`}
              onClick={() => switchTab('history')}
            >
              <span className="tab-btn-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                </svg>
              </span>
              <span>Applications History</span>
            </button>
          </div>
        )}

        {/* MAIN CONTENT DISPLAY */}
        {activeTab === 'new_app_landing' ? (
          /* NEW APPLICATION LANDING PAGE (MODERN PORTAL DESIGN) */
          <div className="pan-landing-wrapper">

            {/* Portal Banner Header */}
            <div className="pan-portal-subhead">
              <div className="pan-portal-subhead-title">
                <div className="pan-portal-icon-glow">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 21h18M3 10h18M5 10v11M19 10v11M9 10v11M15 10v11M12 2l10 8H2l10-8z"/>
                  </svg>
                </div>
                <div>
                  <div className="pan-portal-title-row">
                    <h3 className="pan-portal-h3">NEW PAN APPLICATION PORTAL</h3>
                  </div>
                  <div className="pan-portal-desc">
                    Income Tax Department of India • NSDL / UTIITSL e-Governance Infrastructure
                  </div>
                </div>
              </div>
              <div className="pan-breadcrumb">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                </svg>
                <span>Home</span>
                <span className="breadcrumb-separator">›</span>
                <span className="pan-breadcrumb-active">New PAN Application</span>
              </div>
            </div>

            {/* Service Options Cards Grid */}
            {/* Service Options Cards Grid (Redesigned Small Cards) */}
            <div className="pan-services-grid">

              {/* Card 1: Manual New PAN */}
              <div className="pan-service-card manual-card small-card">
                <div className="pan-card-header-compact">
                  <div className="pan-card-title-row">
                    <div className="pan-card-icon-wrapper manual-icon-bg small-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                        <line x1="16" y1="13" x2="8" y2="13"/>
                        <line x1="16" y1="17" x2="8" y2="17"/>
                      </svg>
                    </div>
                    <div>
                      <h4 className="pan-card-title small-title">MANUAL NEW PAN</h4>
                    </div>
                  </div>
                </div>

                <div className="pan-features-list compact-features">
                  <div className="pan-feature-compact">
                    <span className="pan-check-sm manual-check">✓</span>
                    <span>Custom Photo & Signature Upload support</span>
                  </div>
                  <div className="pan-feature-compact">
                    <span className="pan-check-sm manual-check">✓</span>
                    <span>ABHA Card supported as DOB Proof</span>
                  </div>
                  <div className="pan-feature-compact">
                    <span className="pan-check-sm manual-check">✓</span>
                    <span>Physical PVC Card by post + Instant PDF</span>
                  </div>
                </div>

                <div className="pan-card-footer compact-footer">
                  <button
                    type="button"
                    className="pan-btn-manual small-btn"
                    onClick={() => switchTab('manual_new_pan')}
                  >
                    <span>Apply Manual New PAN</span>
                    <span className="btn-arrow">➔</span>
                  </button>
                  <div className="pan-card-footnote small-footnote">
                    <span>Includes India Post speed post delivery</span>
                  </div>
                </div>
              </div>

              {/* Card 2: Aadhaar OTP New PAN */}
              <div className="pan-service-card kyc-card small-card">

                <div className="pan-card-header-compact">
                  <div className="pan-card-title-row">
                    <div className="pan-card-icon-wrapper kyc-icon-bg small-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                      </svg>
                    </div>
                    <div>
                      <h4 className="pan-card-title small-title">AADHAAR OTP NEW PAN</h4>
                    </div>
                  </div>
                </div>

                <div className="pan-features-list compact-features">
                  <div className="pan-feature-compact">
                    <span className="pan-check-sm kyc-check">✓</span>
                    <span>100% Paperless UIDAI e-KYC process</span>
                  </div>
                  <div className="pan-feature-compact">
                    <span className="pan-check-sm kyc-check">✓</span>
                    <span>Instant Mobile OTP Verification</span>
                  </div>
                  <div className="pan-feature-compact">
                    <span className="pan-check-sm kyc-check">✓</span>
                    <span>Fast e-PAN Allocation within 2 Hours</span>
                  </div>
                </div>

                <div className="pan-card-footer compact-footer">
                  <button
                    type="button"
                    className="pan-btn-kyc small-btn"
                    onClick={() => switchTab('epan_kyc')}
                  >
                    <span>Apply Aadhaar OTP PAN</span>
                    <span className="btn-arrow">➔</span>
                  </button>
                  <div className="pan-card-footnote small-footnote">
                    <span>Aadhaar linked mobile number required</span>
                  </div>
                </div>
              </div>

            </div>

            {/* Official Note Banner */}
            <div className="pan-note-banner">
              <div className="pan-note-icon-wrap">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="16" x2="12" y2="12"></line>
                  <line x1="12" y1="8" x2="12.01" y2="8"></line>
                </svg>
              </div>
              <div className="pan-note-content">
                <span className="pan-note-tag">OFFICIAL GUIDELINE</span>
                <span className="pan-note-text">
                  If any other DOB (Date of Birth) Proof is not available, choose <strong>PROOF OF DOB List</strong> or <strong>ABHA Card</strong> for guaranteed compliance.
                </span>
              </div>
            </div>

          </div>
        ) : activeTab === 'history' ? (
          <div className="pancard-history-section" style={{ padding: '4px' }}>
                {/* Header & Controls Bar */}
                <div style={{ background: '#ffffff', border: '1px solid #fed7aa', borderRadius: '16px', padding: '16px 20px', marginBottom: '20px', boxShadow: '0 4px 15px rgba(234, 88, 12, 0.06)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px', marginBottom: '14px' }}>
                    <div>
                      <h4 style={{ margin: 0, color: '#ea580c', fontSize: '18px', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>📑</span> <span>Submitted PAN Application Requests</span>
                      </h4>
                      <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '12px' }}>
                        View all submitted Form 49A applications, inspect full form data, download PDFs, and update processing status.
                      </p>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <button
                        type="button"
                        onClick={() => fetchHistory()}
                        style={{
                          background: '#fff7ed',
                          color: '#ea580c',
                          border: '1px solid #fdba74',
                          padding: '7px 14px',
                          borderRadius: '10px',
                          fontSize: '12px',
                          fontWeight: '700',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          boxShadow: '0 2px 6px rgba(234, 88, 12, 0.08)'
                        }}
                      >
                        <span>🔄</span> <span>Refresh</span>
                      </button>
                    </div>
                  </div>

                  {/* Summary Statistics Cards Bar (Accurate matching counts per retailer / search query) */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', marginBottom: '16px' }}>
                    {/* Total Applications Sent */}
                    <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '12px', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '12px', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }}>
                      <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(2, 132, 199, 0.12)', color: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: 'bold' }}>
                        🪪
                      </div>
                      <div>
                        <div style={{ fontSize: '10.5px', color: '#64748b', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.4px' }}>TOTAL SENT TO ADMIN</div>
                        <div style={{ fontSize: '19px', color: '#0f172a', fontWeight: '800' }}>{searchedList.length}</div>
                      </div>
                    </div>

                    {/* Approved Applications */}
                    <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '12px', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }}>
                      <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: 'bold' }}>
                        ✅
                      </div>
                      <div>
                        <div style={{ fontSize: '10.5px', color: '#15803d', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.4px' }}>APPROVED APPLICATIONS</div>
                        <div style={{ fontSize: '19px', color: '#166534', fontWeight: '800' }}>
                          {searchedList.filter(a => (a.status || '').toLowerCase() === 'approved').length}
                        </div>
                      </div>
                    </div>

                    {/* Completed Applications */}
                    <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '12px', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '12px', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }}>
                      <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(14, 165, 233, 0.15)', color: '#0ea5e9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: 'bold' }}>
                        🎯
                      </div>
                      <div>
                        <div style={{ fontSize: '10.5px', color: '#0369a1', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.4px' }}>COMPLETED APPLICATIONS</div>
                        <div style={{ fontSize: '19px', color: '#075985', fontWeight: '800' }}>
                          {searchedList.filter(a => (a.status || '').toLowerCase() === 'completed').length}
                        </div>
                      </div>
                    </div>

                    {/* In Progress / Pending */}
                    <div style={{ background: '#fffbe6', border: '1px solid #fde68a', borderRadius: '12px', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '12px', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }}>
                      <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(245, 158, 11, 0.15)', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: 'bold' }}>
                        ⌛
                      </div>
                      <div>
                        <div style={{ fontSize: '10.5px', color: '#b45309', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.4px' }}>PENDING / IN PROGRESS</div>
                        <div style={{ fontSize: '19px', color: '#92400e', fontWeight: '800' }}>
                          {searchedList.filter(a => (a.status || '').toLowerCase() === 'submitted' || (a.status || '').toLowerCase() === 'in progress').length}
                        </div>
                      </div>
                    </div>

                    {/* Rejected / Correction */}
                    <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '12px', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '12px', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }}>
                      <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: 'bold' }}>
                        ❌
                      </div>
                      <div>
                        <div style={{ fontSize: '10.5px', color: '#b91c1c', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.4px' }}>REJECTED / CORRECTION</div>
                        <div style={{ fontSize: '19px', color: '#991b1b', fontWeight: '800' }}>
                          {searchedList.filter(a => (a.status || '').toLowerCase() === 'rejected').length}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Filters Bar */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px 170px', gap: '12px', alignItems: 'center' }}>
                    <input
                      type="text"
                      placeholder="🔍 Search by Ack No, Applicant Name, Mobile or User ID..."
                      value={searchQuery}
                      onChange={e => { setSearchQuery(e.target.value); setHistoryPage(1); }}
                      style={{
                        background: '#ffffff',
                        border: '1px solid #fdba74',
                        borderRadius: '10px',
                        padding: '9px 14px',
                        color: '#1e293b',
                        fontSize: '13px',
                        outline: 'none'
                      }}
                    />

                    <select
                      value={statusFilter}
                      onChange={e => { setStatusFilter(e.target.value); setHistoryPage(1); }}
                      style={{
                        background: '#ffffff',
                        border: '1px solid #fdba74',
                        borderRadius: '10px',
                        padding: '9px 12px',
                        color: '#1e293b',
                        fontSize: '13px',
                        outline: 'none',
                        fontWeight: '600'
                      }}
                    >
                      <option value="ALL">All Statuses</option>
                      <option value="Submitted">Submitted</option>
                      <option value="In Progress">In Progress</option>
                      <option value="Approved">Approved</option>
                      <option value="Completed">Completed</option>
                      <option value="Rejected">Rejected</option>
                    </select>

                    <select
                      value={historyPageSize}
                      onChange={e => { setHistoryPageSize(Number(e.target.value)); setHistoryPage(1); }}
                      style={{
                        background: '#ffffff',
                        border: '1px solid #fdba74',
                        borderRadius: '10px',
                        padding: '9px 12px',
                        color: '#1e293b',
                        fontSize: '13px',
                        outline: 'none',
                        fontWeight: '600'
                      }}
                    >
                      <option value={10}>10 per page</option>
                      <option value={25}>25 per page</option>
                      <option value={50}>50 per page</option>
                      <option value={100}>100 per page</option>
                    </select>
                  </div>
                </div>

                {/* Applications Data Table */}
                {loadingHistory ? (
                  <div className="pancard-loading-state" style={{ padding: '40px', textAlign: 'center', background: '#ffffff', borderRadius: '16px', border: '1px solid #fed7aa' }}>
                    <div className="spinner"></div>
                    <p style={{ marginTop: '12px', color: '#ea580c', fontWeight: '600' }}>Loading PAN application requests...</p>
                  </div>
                ) : filteredList.length === 0 ? (
                  <div className="pancard-empty-history" style={{ padding: '50px 20px', textAlign: 'center', background: '#fff7ed', borderRadius: '16px', border: '1px dashed #fdba74' }}>
                    <span style={{ fontSize: '36px', display: 'block', marginBottom: '10px' }}>📂</span>
                    <p style={{ color: '#ea580c', margin: 0, fontSize: '14px', fontWeight: '600' }}>
                      No PAN application requests found matching your filter.
                    </p>
                  </div>
                ) : (
                  <div>
                  <div className="history-table-wrapper" style={{ width: '100%', overflowX: 'auto' }}>
                    <table className="pancard-history-table" style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 6px', tableLayout: 'auto' }}>
                      <thead>
                        <tr style={{ background: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)', borderBottom: '2px solid #fed7aa' }}>
                          <th style={{ padding: '9px 6px', borderRadius: '8px 0 0 8px', color: '#c2410c', fontWeight: '800', fontSize: '10.5px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>ACK NO</th>
                          <th style={{ padding: '9px 4px', color: '#c2410c', fontWeight: '800', fontSize: '10.5px', textTransform: 'uppercase', textAlign: 'center', whiteSpace: 'nowrap' }}>CATEGORY</th>
                          <th style={{ padding: '9px 5px', color: '#c2410c', fontWeight: '800', fontSize: '10.5px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>TYPE</th>
                          <th style={{ padding: '9px 6px', color: '#c2410c', fontWeight: '800', fontSize: '10.5px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>APPLICANT NAME</th>
                          <th style={{ padding: '9px 6px', color: '#c2410c', fontWeight: '800', fontSize: '10.5px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>MOBILE / EMAIL</th>
                          <th style={{ padding: '9px 6px', color: '#c2410c', fontWeight: '800', fontSize: '10.5px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>SUBMITTED DATE</th>
                          <th style={{ padding: '9px 4px', color: '#c2410c', fontWeight: '800', fontSize: '10.5px', textTransform: 'uppercase', textAlign: 'center', whiteSpace: 'nowrap' }}>STATUS</th>
                          <th style={{ padding: '9px 4px', color: '#c2410c', fontWeight: '800', fontSize: '10.5px', textTransform: 'uppercase', textAlign: 'center', whiteSpace: 'nowrap' }}>NSDL RECEIPT</th>
                          <th style={{ padding: '9px 6px', textAlign: 'center', borderRadius: '0 8px 8px 0', color: '#c2410c', fontWeight: '800', fontSize: '10.5px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>ADMIN ACTIONS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedList.map((app) => {
                          const statusStyle = getStatusBadgeStyle(app.status || 'Submitted');
                          const hasReceipt = Boolean(app.receiptUrl || app.nsdlReceiptNumber || (app.status || '').toLowerCase() === 'approved');

                          return (
                            <tr
                              key={app._id}
                              style={{
                                background: '#ffffff',
                                border: '1px solid #fed7aa',
                                boxShadow: '0 1px 6px rgba(234, 88, 12, 0.04)'
                              }}
                            >
                              {/* ACK NO */}
                              <td className="col-ack" style={{ padding: '8px 6px', borderRadius: '8px 0 0 8px', whiteSpace: 'nowrap' }}>
                                <span style={{ background: '#fff7ed', color: '#ea580c', border: '1px solid #fdba74', padding: '2px 6px', borderRadius: '5px', fontSize: '11px', fontWeight: '800', fontFamily: 'monospace' }}>
                                  {app.ackNumber}
                                </span>
                              </td>

                              {/* CATEGORY */}
                              <td style={{ padding: '8px 4px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                <span style={{ background: '#f8fafc', color: '#475569', border: '1px solid #cbd5e1', padding: '2px 5px', borderRadius: '5px', fontSize: '9.5px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                                  {app.category || app.details?.category || 'INDIVIDUAL'}
                                </span>
                              </td>

                              {/* TYPE */}
                              <td style={{ padding: '8px 5px', fontSize: '11px', color: '#475569', fontWeight: '600', whiteSpace: 'nowrap' }}>
                                {app.applicationType}
                              </td>

                              {/* APPLICANT NAME */}
                              <td style={{ padding: '8px 6px', fontSize: '11.5px', fontWeight: '800', color: '#0f172a' }}>
                                {getApplicantDisplayFullName(app)}
                              </td>

                              {/* MOBILE / EMAIL */}
                              <td style={{ padding: '8px 6px', fontSize: '11px', color: '#334155' }}>
                                <div style={{ fontWeight: '700', whiteSpace: 'nowrap' }}>📞 {app.mobileNumber}</div>
                                <div style={{ fontSize: '10px', color: '#64748b', maxWidth: '130px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={app.email}>✉️ {app.email}</div>
                              </td>

                              {/* SUBMITTED DATE */}
                              <td style={{ padding: '8px 6px', color: '#475569' }}>
                                <div style={{ fontWeight: '700', fontSize: '11px', whiteSpace: 'nowrap' }}>{new Date(app.createdAt).toLocaleDateString()}</div>
                                <div style={{ fontSize: '10px', color: '#64748b', whiteSpace: 'nowrap' }}>{new Date(app.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                              </td>

                              {/* STATUS */}
                              <td style={{ padding: '8px 4px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                <span style={{ ...statusStyle, padding: '3px 7px', borderRadius: '16px', fontSize: '10px', fontWeight: '800', display: 'inline-block', textTransform: 'capitalize' }}>
                                  ● {app.status || 'Submitted'}
                                </span>
                              </td>

                              {/* NSDL RECEIPT */}
                              <td style={{ padding: '8px 4px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                {hasReceipt ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (app.receiptUrl) {
                                        downloadReceiptToPc(app.receiptUrl, app.ackNumber || app.nsdlReceiptNumber || 'PAN');
                                      } else {
                                        Toast.fire({
                                          icon: 'info',
                                          title: `NSDL Receipt No: ${app.nsdlReceiptNumber || app.ackNumber}`
                                        });
                                      }
                                    }}
                                    title={app.receiptUrl ? "Click to view / download approved NSDL receipt" : `NSDL Receipt: ${app.nsdlReceiptNumber || app.ackNumber}`}
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '3px',
                                      background: '#f0f9ff',
                                      color: '#0284c7',
                                      border: '1px solid #7dd3fc',
                                      padding: '3px 7px',
                                      borderRadius: '6px',
                                      fontSize: '10px',
                                      fontWeight: '800',
                                      fontFamily: 'monospace',
                                      cursor: app.receiptUrl ? 'pointer' : 'default',
                                      textDecoration: 'none',
                                      boxShadow: '0 1px 3px rgba(2, 132, 199, 0.08)',
                                      transition: 'all 0.15s ease'
                                    }}
                                  >
                                    <span style={{ fontSize: '10.5px' }}>🗎</span>
                                    <span style={{ textDecoration: app.receiptUrl ? 'underline' : 'none' }}>
                                      {app.nsdlReceiptNumber || app.ackNumber}
                                    </span>
                                  </button>
                                ) : (
                                  <span style={{ color: '#94a3b8', fontSize: '13px', fontWeight: '600' }}>—</span>
                                )}
                              </td>

                              {/* ADMIN ACTIONS */}
                              <td style={{ padding: '8px 6px', textAlign: 'center', borderRadius: '0 8px 8px 0', whiteSpace: 'nowrap' }}>
                                <div style={{ display: 'inline-flex', gap: '4px', justifyContent: 'center', alignItems: 'center', whiteSpace: 'nowrap' }}>
                                  {/* View Full Form Details */}
                                  <button
                                    type="button"
                                    onClick={() => setSelectedAppForModal(app)}
                                    style={{
                                      background: '#f0f9ff',
                                      color: '#0284c7',
                                      border: '1px solid #bae6fd',
                                      padding: '4px 7px',
                                      borderRadius: '6px',
                                      fontSize: '10.5px',
                                      fontWeight: '700',
                                      cursor: 'pointer',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '3px',
                                      transition: 'all 0.15s ease',
                                      whiteSpace: 'nowrap'
                                    }}
                                    title="View complete submitted form details"
                                  >
                                    <span>👁️</span> <span>Details</span>
                                  </button>

                                  {/* Add Documents */}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedAppForDocument(app);
                                      setDocumentToAdd('');
                                      setDocumentName('');
                                    }}
                                    style={{
                                      background: '#fff7ed',
                                      color: '#ea580c',
                                      border: '1px solid #fdba74',
                                      padding: '4px 7px',
                                      borderRadius: '6px',
                                      fontSize: '10.5px',
                                      fontWeight: '700',
                                      cursor: 'pointer',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '3px',
                                      transition: 'all 0.15s ease',
                                      whiteSpace: 'nowrap'
                                    }}
                                    title="Add a supporting document to this application"
                                  >
                                    <span>📁</span> <span>Docs</span>
                                  </button>

                                  {/* Download Pre-Filled PDF */}
                                  <button
                                    type="button"
                                    onClick={() => generateForm49APdf(app.details || app)}
                                    style={{
                                      background: '#ecfdf5',
                                      color: '#059669',
                                      border: '1px solid #a7f3d0',
                                      padding: '4px 7px',
                                      borderRadius: '6px',
                                      fontSize: '10.5px',
                                      fontWeight: '700',
                                      cursor: 'pointer',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '3px',
                                      transition: 'all 0.15s ease',
                                      whiteSpace: 'nowrap'
                                    }}
                                    title="Download pre-filled official Form 49A PDF"
                                  >
                                    <span>📥</span> <span>PDF</span>
                                  </button>

                                  {/* Delete Submission (Locked if Approved or Completed) */}
                                  {((app.status || '').toLowerCase() === 'approved' || (app.status || '').toLowerCase() === 'completed') ? (
                                    <span
                                      style={{
                                        background: '#f1f5f9',
                                        color: '#94a3b8',
                                        border: '1px solid #cbd5e1',
                                        padding: '4px 7px',
                                        borderRadius: '6px',
                                        fontSize: '10.5px',
                                        fontWeight: '700',
                                        cursor: 'not-allowed',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '3px',
                                        whiteSpace: 'nowrap'
                                      }}
                                      title="Approved by Admin — Cannot be deleted"
                                    >
                                      <span>🔒</span>
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => handleRetailerDeleteApplication(app)}
                                      style={{
                                        background: '#fef2f2',
                                        color: '#dc2626',
                                        border: '1px solid #fca5a5',
                                        padding: '4px 7px',
                                        borderRadius: '6px',
                                        fontSize: '10.5px',
                                        fontWeight: '700',
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '3px',
                                        transition: 'all 0.15s ease',
                                        whiteSpace: 'nowrap'
                                      }}
                                      title="Delete application and get instant wallet refund"
                                    >
                                      <span>🗑️</span>
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination Footer Controls */}
                  <div style={{
                    display: 'flex',
                    justify: 'space-between',
                    alignItems: 'center',
                    marginTop: '14px',
                    padding: '12px 18px',
                    background: '#ffffff',
                    borderRadius: '12px',
                    border: '1px solid #fed7aa',
                    flexWrap: 'wrap',
                    gap: '10px'
                  }}>
                    <div style={{ fontSize: '13px', color: '#475569', fontWeight: '600' }}>
                      Showing <strong>{filteredList.length === 0 ? 0 : startIndex + 1}</strong> to <strong>{Math.min(startIndex + historyPageSize, filteredList.length)}</strong> of <strong>{filteredList.length}</strong> applications
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <button
                        type="button"
                        disabled={currentPage <= 1}
                        onClick={() => setHistoryPage(prev => Math.max(1, prev - 1))}
                        style={{
                          padding: '6px 14px',
                          borderRadius: '8px',
                          border: '1px solid #fdba74',
                          background: currentPage <= 1 ? '#f1f5f9' : '#fff7ed',
                          color: currentPage <= 1 ? '#94a3b8' : '#ea580c',
                          fontWeight: '700',
                          fontSize: '12px',
                          cursor: currentPage <= 1 ? 'not-allowed' : 'pointer'
                        }}
                      >
                        ◀ Prev
                      </button>

                      <span style={{ fontSize: '12.5px', fontWeight: '700', color: '#334155', padding: '0 8px' }}>
                        Page {currentPage} of {totalPages}
                      </span>

                      <button
                        type="button"
                        disabled={currentPage >= totalPages}
                        onClick={() => setHistoryPage(prev => Math.min(totalPages, prev + 1))}
                        style={{
                          padding: '6px 14px',
                          borderRadius: '8px',
                          border: '1px solid #fdba74',
                          background: currentPage >= totalPages ? '#f1f5f9' : '#fff7ed',
                          color: currentPage >= totalPages ? '#94a3b8' : '#ea580c',
                          fontWeight: '700',
                          fontSize: '12px',
                          cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer'
                        }}
                      >
                        Next ▶
                      </button>
                    </div>
                  </div>
                </div>
              )}

            {selectedAppForDocument && (
              <div style={{
                position: 'fixed',
                inset: 0,
                background: isLightTheme ? 'rgba(15, 23, 42, 0.65)' : 'rgba(0,0,0,0.75)',
                zIndex: 100000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '20px'
              }}>
                <div style={{
                  width: '100%',
                  maxWidth: '520px',
                  background: isLightTheme ? '#ffffff' : '#1e293b',
                  borderRadius: '16px',
                  padding: '24px',
                  boxShadow: isLightTheme ? '0 20px 50px rgba(15, 23, 42, 0.2)' : '0 20px 50px rgba(0,0,0,0.5)',
                  border: isLightTheme ? '1.5px solid #fed7aa' : '1.5px solid #ea580c',
                  color: isLightTheme ? '#0f172a' : '#fff'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', marginBottom: '8px' }}>
                    <div>
                      <h4 style={{ margin: 0, color: '#c2410c' }}>📎 Add supporting document</h4>
                      <p style={{ margin: '5px 0 0', color: isLightTheme ? '#64748b' : '#94a3b8', fontSize: '12px' }}>Application: {selectedAppForDocument.ackNumber}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedAppForDocument(null)}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        fontSize: '22px',
                        cursor: 'pointer',
                        color: isLightTheme ? '#64748b' : '#94a3b8'
                      }}
                    >
                      ×
                    </button>
                  </div>
                  <p style={{ color: isLightTheme ? '#475569' : '#cbd5e1', fontSize: '13px', lineHeight: 1.5 }}>
                    The document will be attached to this application and immediately visible in the Admin details screen. No fee is charged.
                  </p>
                  <input
                    type="text"
                    value={documentName}
                    onChange={e => setDocumentName(e.target.value)}
                    placeholder="Document Name (e.g. Aadhaar Card, DOB Proof)"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      background: isLightTheme ? '#ffffff' : '#0f172a',
                      border: isLightTheme ? '1px solid #cbd5e1' : '1px solid rgba(255,255,255,0.2)',
                      borderRadius: '8px',
                      fontSize: '13px',
                      marginBottom: '12px',
                      boxSizing: 'border-box',
                      color: isLightTheme ? '#0f172a' : '#fff'
                    }}
                  />
                  <input
                    type="file"
                    onChange={(e) => {
                      const file = e.target.files[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onloadend = () => setDocumentToAdd(reader.result);
                        reader.readAsDataURL(file);
                      }
                    }}
                    style={{
                      width: '100%',
                      marginBottom: '16px',
                      color: isLightTheme ? '#0f172a' : '#fff'
                    }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '18px' }}>
                    <button
                      type="button"
                      onClick={() => setSelectedAppForDocument(null)}
                      style={{
                        padding: '10px 16px',
                        border: isLightTheme ? '1px solid #cbd5e1' : 'none',
                        borderRadius: '8px',
                        background: isLightTheme ? '#ffffff' : 'rgba(255,255,255,0.1)',
                        color: isLightTheme ? '#334155' : '#fff',
                        cursor: 'pointer'
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleAddDocument}
                      disabled={isAddingDocument || !documentToAdd}
                      style={{
                        padding: '10px 16px',
                        border: 'none',
                        borderRadius: '8px',
                        color: '#fff',
                        background: documentToAdd ? '#ea580c' : '#cbd5e1',
                        cursor: documentToAdd ? 'pointer' : 'not-allowed',
                        fontWeight: '700'
                      }}
                    >
                      {isAddingDocument ? 'Adding…' : 'Add document'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ========================================================================= */}
            {/* MODAL 1: VIEW FULL APPLICATION DETAILS (ADMIN / RETAILER) */}
            {/* ========================================================================= */}
            {selectedAppForModal && (
              <div style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: isLightTheme ? 'rgba(15, 23, 42, 0.6)' : 'rgba(0, 0, 0, 0.85)',
                zIndex: 99999,
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'center',
                padding: '24px 12px 12px 12px',
                backdropFilter: 'blur(4px)',
                overflowY: 'auto'
              }}>
                <div style={{
                  background: isLightTheme ? '#ffffff' : '#1e293b',
                  border: isLightTheme ? '1.5px solid #fed7aa' : '1.5px solid #0284c7',
                  borderRadius: '16px',
                  width: '96%',
                  maxWidth: '940px',
                  maxHeight: 'calc(100vh - 48px)',
                  display: 'flex',
                  flexDirection: 'column',
                  color: isLightTheme ? '#0f172a' : '#fff',
                  boxShadow: isLightTheme ? '0 25px 60px rgba(15, 23, 42, 0.2)' : '0 25px 60px rgba(0,0,0,0.7)',
                  overflow: 'hidden'
                }}>

                  {/* Fixed Header Bar */}
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: isLightTheme ? 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)' : '#0f172a',
                    borderBottom: isLightTheme ? '1px solid #fed7aa' : '1px solid rgba(255,255,255,0.1)',
                    padding: '12px 20px',
                    gap: '10px'
                  }}>
                    <div>
                      <h4 style={{
                        margin: 0,
                        fontSize: '16px',
                        color: isLightTheme ? '#c2410c' : '#38bdf8',
                        fontWeight: '800',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}>
                        <span>📋</span> <span>PAN Form Details</span>
                        <span style={{
                          fontSize: '12px',
                          background: isLightTheme ? '#ffedd5' : 'rgba(2, 132, 199, 0.25)',
                          border: isLightTheme ? '1px solid #fdba74' : '1px solid rgba(56, 189, 248, 0.4)',
                          color: isLightTheme ? '#ea580c' : '#7dd3fc',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          fontWeight: '700'
                        }}>
                          ACK: {selectedAppForModal.ackNumber || 'N/A'}
                        </span>
                      </h4>
                      <div style={{ fontSize: '11.5px', color: isLightTheme ? '#64748b' : '#94a3b8', marginTop: '2px' }}>
                        Submitted by User: <strong style={{ color: isLightTheme ? '#1e293b' : '#e2e8f0' }}>{selectedAppForModal.userId || selectedAppForModal.userMobile || 'Retailer'}</strong>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <button
                        type="button"
                        onClick={() => copyApplicationDetailsToClipboard(selectedAppForModal)}
                        style={{
                          background: isLightTheme ? 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)' : 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                          color: '#ffffff',
                          border: isLightTheme ? '1px solid #fdba74' : '1px solid rgba(56, 189, 248, 0.5)',
                          padding: '6px 14px',
                          borderRadius: '8px',
                          fontSize: '12px',
                          fontWeight: '800',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          boxShadow: isLightTheme ? '0 2px 8px rgba(234, 88, 12, 0.3)' : '0 2px 8px rgba(2, 132, 199, 0.35)',
                          transition: 'all 0.15s ease'
                        }}
                        title="Copy all application details to clipboard"
                      >
                        <span>📋</span> <span>Copy Details</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedAppForModal(null)}
                        style={{
                          background: isLightTheme ? '#f1f5f9' : 'rgba(255,255,255,0.1)',
                          border: isLightTheme ? '1px solid #cbd5e1' : 'none',
                          color: isLightTheme ? '#64748b' : '#fff',
                          width: '30px',
                          height: '30px',
                          borderRadius: '50%',
                          cursor: 'pointer',
                          fontSize: '16px',
                          fontWeight: 'bold',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = '#ef4444';
                          e.currentTarget.style.color = '#ffffff';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = isLightTheme ? '#f1f5f9' : 'rgba(255,255,255,0.1)';
                          e.currentTarget.style.color = isLightTheme ? '#64748b' : '#fff';
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  {/* Scrollable Body Content (Compact 2-Column Dashboard Layout) */}
                  <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12.5px', background: isLightTheme ? '#f8fafc' : 'transparent' }}>
                    {(() => {
                      const d = selectedAppForModal.details || {};
                      const appStatus = (selectedAppForModal.status || 'Submitted').toUpperCase();
                      const statusColor = appStatus === 'APPROVED' || appStatus === 'COMPLETED' ? '#10b981' : appStatus === 'REJECTED' ? '#ef4444' : '#f59e0b';
                      const statusBg = appStatus === 'APPROVED' || appStatus === 'COMPLETED' ? (isLightTheme ? '#dcfce7' : 'rgba(16, 185, 129, 0.15)') : appStatus === 'REJECTED' ? (isLightTheme ? '#fee2e2' : 'rgba(239, 68, 68, 0.15)') : (isLightTheme ? '#fef3c7' : 'rgba(245, 158, 11, 0.15)');

                      const sectionBg = isLightTheme ? '#ffffff' : 'rgba(15, 23, 42, 0.5)';
                      const sectionBorder = isLightTheme ? '1px solid #e2e8f0' : '1px solid rgba(255,255,255,0.08)';
                      const labelColor = isLightTheme ? '#64748b' : '#94a3b8';
                      const valColor = isLightTheme ? '#0f172a' : '#f8fafc';
                      const headingColor = isLightTheme ? '#ea580c' : '#fb923c';

                      return (
                        <>
                          {/* Top Status & Type Bar */}
                          <div style={{
                            background: isLightTheme ? 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)' : 'linear-gradient(135deg, rgba(2, 132, 199, 0.12) 0%, rgba(15, 23, 42, 0.4) 100%)',
                            border: isLightTheme ? '1px solid #fed7aa' : '1px solid rgba(56, 189, 248, 0.25)',
                            padding: '8px 14px',
                            borderRadius: '10px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: '8px'
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ color: labelColor, fontSize: '11.5px', fontWeight: '600' }}>Current Status:</span>
                              <span style={{ background: statusBg, border: `1px solid ${statusColor}`, color: statusColor, padding: '2px 10px', borderRadius: '14px', fontWeight: '800', fontSize: '11.5px', letterSpacing: '0.4px' }}>
                                {appStatus}
                              </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                              {selectedAppForModal.receiptUrl && (
                                <button
                                  type="button"
                                  onClick={() => downloadReceiptToPc(selectedAppForModal.receiptUrl, selectedAppForModal.ackNumber || 'PAN')}
                                  style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '800', cursor: 'pointer', boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)' }}
                                >
                                  📄 View Approved Receipt
                                </button>
                              )}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ color: labelColor, fontSize: '11.5px' }}>Type:</span>
                                <strong style={{ color: isLightTheme ? '#c2410c' : '#38bdf8', background: isLightTheme ? '#fed7aa' : 'rgba(2, 132, 199, 0.2)', padding: '2px 8px', borderRadius: '5px', fontSize: '11.5px' }}>
                                  {selectedAppForModal.applicationType || 'Manual New PAN'}
                                </strong>
                              </div>
                            </div>
                          </div>

                          {/* 2-Column Responsive Dashboard */}
                          <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: '10px' }}>
                            
                            {/* Left Column: Personal Particulars & Parents */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                              {/* Personal Particulars */}
                              <div style={{ background: sectionBg, padding: '12px', borderRadius: '10px', border: sectionBorder, boxShadow: isLightTheme ? '0 2px 6px rgba(0,0,0,0.03)' : 'none' }}>
                                <h5 style={{ margin: '0 0 8px 0', color: headingColor, fontSize: '13px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span>👤</span> <span>Personal Particulars</span>
                                </h5>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px', color: valColor, fontSize: '12px' }}>
                                  <div><span style={{ color: labelColor }}>Title:</span> <strong style={{ color: valColor }}>{d.title || selectedAppForModal.title || 'SHRI'}</strong></div>
                                  <div><span style={{ color: labelColor }}>Gender:</span> <strong style={{ color: valColor }}>{selectedAppForModal.gender || d.gender || 'Male'}</strong></div>
                                  <div><span style={{ color: labelColor }}>Last Name:</span> <strong style={{ color: valColor }}>{d.lastName || selectedAppForModal.applicantName || '—'}</strong></div>
                                  <div><span style={{ color: labelColor }}>DOB:</span> <strong style={{ color: valColor }}>{selectedAppForModal.dob || d.dob || '—'}</strong></div>
                                  <div><span style={{ color: labelColor }}>First Name:</span> <strong style={{ color: valColor }}>{d.firstName || '—'}</strong></div>
                                  <div><span style={{ color: labelColor }}>Aadhaar:</span> <strong style={{ color: valColor }}>{selectedAppForModal.aadhaarNumber || d.aadhaarNumber || '—'}</strong></div>
                                  <div><span style={{ color: labelColor }}>Middle Name:</span> <strong style={{ color: valColor }}>{d.middleName || '—'}</strong></div>
                                  <div><span style={{ color: labelColor }}>Mobile:</span> <strong style={{ color: valColor }}>{selectedAppForModal.mobileNumber || '—'}</strong></div>
                                  <div style={{ gridColumn: 'span 2' }}><span style={{ color: labelColor }}>Email:</span> <strong style={{ color: valColor }}>{selectedAppForModal.email || '—'}</strong></div>
                                </div>
                              </div>

                              {/* Parents Details */}
                              <div style={{ background: sectionBg, padding: '12px', borderRadius: '10px', border: sectionBorder, boxShadow: isLightTheme ? '0 2px 6px rgba(0,0,0,0.03)' : 'none' }}>
                                <h5 style={{ margin: '0 0 8px 0', color: headingColor, fontSize: '13px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span>👨‍👩‍👦</span> <span>Parents Details</span>
                                </h5>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', color: valColor, fontSize: '12px' }}>
                                  <div><span style={{ color: labelColor }}>Father's Name:</span> <strong style={{ color: valColor }}>{selectedAppForModal.fatherName || `${d.fatherFirstName || ''} ${d.fatherLastName || ''}`.trim() || '—'}</strong></div>
                                  <div><span style={{ color: labelColor }}>Mother's Name:</span> <strong style={{ color: valColor }}>{`${d.motherFirstName || ''} ${d.motherLastName || ''}`.trim() || '—'}</strong></div>
                                </div>
                              </div>
                            </div>

                            {/* Right Column: Address, AO Code & Attachments */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                              {/* Residence Address */}
                              <div style={{ background: sectionBg, padding: '12px', borderRadius: '10px', border: sectionBorder, boxShadow: isLightTheme ? '0 2px 6px rgba(0,0,0,0.03)' : 'none' }}>
                                <h5 style={{ margin: '0 0 8px 0', color: headingColor, fontSize: '13px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span>🏠</span> <span>Residence Address</span>
                                </h5>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 10px', color: valColor, fontSize: '12px' }}>
                                  <div><span style={{ color: labelColor }}>Flat/Door:</span> <strong style={{ color: isLightTheme ? '#334155' : '#e2e8f0' }}>{d.flatNo || '—'}</strong></div>
                                  <div><span style={{ color: labelColor }}>Building:</span> <strong style={{ color: isLightTheme ? '#334155' : '#e2e8f0' }}>{d.premises || '—'}</strong></div>
                                  <div><span style={{ color: labelColor }}>Street:</span> <strong style={{ color: isLightTheme ? '#334155' : '#e2e8f0' }}>{d.roadStreet || '—'}</strong></div>
                                  <div><span style={{ color: labelColor }}>Area:</span> <strong style={{ color: isLightTheme ? '#334155' : '#e2e8f0' }}>{d.areaTaluka || '—'}</strong></div>
                                  <div><span style={{ color: labelColor }}>District:</span> <strong style={{ color: isLightTheme ? '#0284c7' : '#38bdf8' }}>{(d.district && d.district !== 'SELECT') ? d.district : (selectedAppForModal.district || '—')}</strong></div>
                                  <div><span style={{ color: labelColor }}>State:</span> <strong style={{ color: isLightTheme ? '#0284c7' : '#38bdf8' }}>{(d.state && d.state !== 'PLEASE SELECT') ? d.state : (selectedAppForModal.state || 'MAHARASHTRA')}</strong></div>
                                  <div><span style={{ color: labelColor }}>Pincode:</span> <strong style={{ color: valColor }}>{d.pincode || '—'}</strong></div>
                                </div>
                              </div>

                              {/* AO Code Details */}
                              <div style={{ background: sectionBg, padding: '10px 12px', borderRadius: '10px', border: sectionBorder, boxShadow: isLightTheme ? '0 2px 6px rgba(0,0,0,0.03)' : 'none' }}>
                                <h5 style={{ margin: '0 0 6px 0', color: headingColor, fontSize: '13px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span>🏢</span> <span>AO Code Details</span>
                                </h5>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px', textAlign: 'center' }}>
                                  <div style={{ background: isLightTheme ? '#f0f9ff' : 'rgba(2, 132, 199, 0.15)', border: isLightTheme ? '1px solid #bae6fd' : '1px solid rgba(56, 189, 248, 0.25)', padding: '5px 4px', borderRadius: '6px' }}>
                                    <div style={{ fontSize: '10px', color: labelColor }}>Area</div>
                                    <strong style={{ color: isLightTheme ? '#0369a1' : '#38bdf8', fontSize: '12px' }}>{d.aoAreaCode || 'MUM'}</strong>
                                  </div>
                                  <div style={{ background: isLightTheme ? '#f0f9ff' : 'rgba(2, 132, 199, 0.15)', border: isLightTheme ? '1px solid #bae6fd' : '1px solid rgba(56, 189, 248, 0.25)', padding: '5px 4px', borderRadius: '6px' }}>
                                    <div style={{ fontSize: '10px', color: labelColor }}>Type</div>
                                    <strong style={{ color: isLightTheme ? '#0369a1' : '#38bdf8', fontSize: '12px' }}>{d.aoType || 'C'}</strong>
                                  </div>
                                  <div style={{ background: isLightTheme ? '#f0f9ff' : 'rgba(2, 132, 199, 0.15)', border: isLightTheme ? '1px solid #bae6fd' : '1px solid rgba(56, 189, 248, 0.25)', padding: '5px 4px', borderRadius: '6px' }}>
                                    <div style={{ fontSize: '10px', color: labelColor }}>Range</div>
                                    <strong style={{ color: isLightTheme ? '#0369a1' : '#38bdf8', fontSize: '12px' }}>{d.aoRangeCode || '11'}</strong>
                                  </div>
                                  <div style={{ background: isLightTheme ? '#f0f9ff' : 'rgba(2, 132, 199, 0.15)', border: isLightTheme ? '1px solid #bae6fd' : '1px solid rgba(56, 189, 248, 0.25)', padding: '5px 4px', borderRadius: '6px' }}>
                                    <div style={{ fontSize: '10px', color: labelColor }}>AO No</div>
                                    <strong style={{ color: isLightTheme ? '#0369a1' : '#38bdf8', fontSize: '12px' }}>{d.aoNo || '1'}</strong>
                                  </div>
                                  <div style={{ background: isLightTheme ? '#f0f9ff' : 'rgba(2, 132, 199, 0.15)', border: isLightTheme ? '1px solid #bae6fd' : '1px solid rgba(56, 189, 248, 0.25)', padding: '5px 4px', borderRadius: '6px' }}>
                                    <div style={{ fontSize: '10px', color: labelColor }}>City</div>
                                    <strong style={{ color: isLightTheme ? '#0369a1' : '#38bdf8', fontSize: '12px' }}>{d.aoCity || d.district || 'MUMBAI'}</strong>
                                  </div>
                                </div>
                              </div>

                              {/* Photo & Signature Attachments */}
                              <div style={{ background: sectionBg, padding: '10px 12px', borderRadius: '10px', border: sectionBorder, boxShadow: isLightTheme ? '0 2px 6px rgba(0,0,0,0.03)' : 'none' }}>
                                <h5 style={{ margin: '0 0 6px 0', color: headingColor, fontSize: '13px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span>🖼️</span> <span>Attachments</span>
                                </h5>
                                <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                                  {(selectedAppForModal.photoUrl || d.photoUrl) && (
                                    <div style={{ textAlign: 'center' }}>
                                      <div style={{ fontSize: '10.5px', color: labelColor, marginBottom: '3px' }}>Photo</div>
                                      <img src={selectedAppForModal.photoUrl || d.photoUrl} alt="Photo" onClick={() => window.open(selectedAppForModal.photoUrl || d.photoUrl, '_blank')} style={{ width: '65px', height: '75px', objectFit: 'cover', borderRadius: '6px', border: '1.5px solid #0284c7', cursor: 'pointer', boxShadow: isLightTheme ? '0 2px 6px rgba(0,0,0,0.1)' : 'none' }} title="Click to view full photo" />
                                    </div>
                                  )}
                                  {(selectedAppForModal.signatureUrl || d.signatureUrl) && (
                                    <div style={{ textAlign: 'center' }}>
                                      <div style={{ fontSize: '10.5px', color: labelColor, marginBottom: '3px' }}>Signature</div>
                                      <img src={selectedAppForModal.signatureUrl || d.signatureUrl} alt="Signature" onClick={() => window.open(selectedAppForModal.signatureUrl || d.signatureUrl, '_blank')} style={{ width: '120px', height: '50px', objectFit: 'contain', background: '#fff', padding: '4px', borderRadius: '6px', border: '1.5px solid #0284c7', cursor: 'pointer', boxShadow: isLightTheme ? '0 2px 6px rgba(0,0,0,0.1)' : 'none' }} title="Click to view full signature" />
                                    </div>
                                  )}
                                  {(d.raPhotoUrl || d.proofOfOtherUrl) && (
                                    <div style={{ textAlign: 'center' }}>
                                      <div style={{ fontSize: '10.5px', color: labelColor, marginBottom: '3px' }}>Guardian</div>
                                      <img src={d.raPhotoUrl || d.proofOfOtherUrl} alt="RA Photo" onClick={() => window.open(d.raPhotoUrl || d.proofOfOtherUrl, '_blank')} style={{ width: '65px', height: '75px', objectFit: 'cover', borderRadius: '6px', border: '1.5px solid #f97316', cursor: 'pointer', boxShadow: isLightTheme ? '0 2px 6px rgba(0,0,0,0.1)' : 'none' }} title="Click to view full photo" />
                                    </div>
                                  )}
                                </div>
                              </div>

                            </div>
                          </div>

                          {(selectedAppForModal.additionalDocuments || []).length > 0 && (
                            <div style={{ background: sectionBg, padding: '10px 12px', borderRadius: '10px', border: sectionBorder, boxShadow: isLightTheme ? '0 2px 6px rgba(0,0,0,0.03)' : 'none' }}>
                              <h5 style={{ margin: '0 0 6px 0', color: headingColor, fontSize: '13px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span>📎</span> <span>Additional Documents from Retailer</span>
                              </h5>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {selectedAppForModal.additionalDocuments.map((document, index) => (
                                  <div key={document._id || index} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', background: isLightTheme ? '#f8fafc' : 'rgba(255,255,255,0.06)', padding: '8px 12px', borderRadius: '6px', border: isLightTheme ? '1px solid #e2e8f0' : '1px solid rgba(255,255,255,0.08)' }}>
                                    <div>
                                      <strong style={{ color: valColor, fontSize: '12px' }}>{document.name || 'Additional document'}</strong>
                                      <div style={{ fontSize: '10.5px', color: labelColor, marginTop: '1px' }}>Uploaded {document.uploadedAt ? new Date(document.uploadedAt).toLocaleString() : 'recently'}</div>
                                    </div>
                                    <button type="button" onClick={() => window.open(document.dataUrl, '_blank')} style={{ background: '#0284c7', color: '#fff', border: 'none', padding: '5px 12px', borderRadius: '5px', fontSize: '11.5px', fontWeight: '700', cursor: 'pointer' }}>View</button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>

                  {/* Fixed Footer Bar */}
                  <div style={{
                    display: 'flex',
                    gap: '10px',
                    justifyContent: 'flex-end',
                    alignItems: 'center',
                    background: isLightTheme ? '#f8fafc' : '#0f172a',
                    borderTop: isLightTheme ? '1px solid #e2e8f0' : '1px solid rgba(255,255,255,0.1)',
                    padding: '10px 20px',
                    flexWrap: 'wrap'
                  }}>
                    <button
                      type="button"
                      onClick={() => copyApplicationDetailsToClipboard(selectedAppForModal)}
                      style={{
                        background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                        color: '#ffffff',
                        border: 'none',
                        padding: '8px 16px',
                        borderRadius: '6px',
                        fontWeight: '800',
                        cursor: 'pointer',
                        fontSize: '12px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        boxShadow: '0 2px 8px rgba(245, 158, 11, 0.3)'
                      }}
                      title="Copy all application details to clipboard"
                    >
                      <span>📋</span> <span>Copy All Details</span>
                    </button>
                    {selectedAppForModal.receiptUrl && (
                      <button
                        type="button"
                        onClick={() => downloadReceiptToPc(selectedAppForModal.receiptUrl, selectedAppForModal.ackNumber || 'PAN')}
                        style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '6px', fontWeight: '800', cursor: 'pointer', fontSize: '12px' }}
                      >
                        📥 Download Receipt
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => generateForm49APdf(selectedAppForModal.details?.lastName ? selectedAppForModal.details : selectedAppForModal)}
                      style={{ background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', fontWeight: '700', cursor: 'pointer', fontSize: '12px' }}
                    >
                      📄 Download Form 49A PDF
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedAppForModal(null)}
                      style={{
                        background: isLightTheme ? '#ffffff' : 'rgba(255,255,255,0.12)',
                        color: isLightTheme ? '#334155' : '#fff',
                        border: isLightTheme ? '1px solid #cbd5e1' : '1px solid rgba(255,255,255,0.2)',
                        padding: '8px 16px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontWeight: '700',
                        fontSize: '12px'
                      }}
                    >
                      Close
                    </button>
                  </div>

                </div>
              </div>
            )}

            {/* ========================================================================= */}
            {/* MODAL 2: ADMIN STATUS UPDATE MODAL */}
            {/* ========================================================================= */}
            {selectedAppForStatusUpdate && (
              <div style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: isLightTheme ? 'rgba(15, 23, 42, 0.65)' : 'rgba(0,0,0,0.8)',
                zIndex: 99999,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '20px'
              }}>
                <div style={{
                  background: isLightTheme ? '#ffffff' : '#1e293b',
                  border: isLightTheme ? '1.5px solid #fed7aa' : '1.5px solid #ea580c',
                  borderRadius: '18px',
                  width: '100%',
                  maxWidth: '500px',
                  padding: '24px',
                  color: isLightTheme ? '#0f172a' : '#fff',
                  boxShadow: isLightTheme ? '0 20px 50px rgba(15, 23, 42, 0.18)' : '0 20px 50px rgba(0,0,0,0.6)'
                }}>

                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderBottom: isLightTheme ? '1px solid #fed7aa' : '1px solid rgba(255,255,255,0.1)',
                    paddingBottom: '12px',
                    marginBottom: '16px'
                  }}>
                    <h4 style={{ margin: 0, fontSize: '17px', color: '#ea580c', fontWeight: '800' }}>
                      ✏️ Update Form Status (Admin)
                    </h4>
                    <button
                      type="button"
                      onClick={() => setSelectedAppForStatusUpdate(null)}
                      style={{
                        background: isLightTheme ? '#f1f5f9' : 'rgba(255,255,255,0.1)',
                        border: isLightTheme ? '1px solid #cbd5e1' : 'none',
                        color: isLightTheme ? '#64748b' : '#fff',
                        width: '30px',
                        height: '30px',
                        borderRadius: '50%',
                        cursor: 'pointer',
                        fontSize: '15px'
                      }}
                    >
                      ✕
                    </button>
                  </div>

                  <div style={{ fontSize: '13px', marginBottom: '14px', color: isLightTheme ? '#475569' : '#cbd5e1' }}>
                    Updating status for Ack: <strong style={{ color: isLightTheme ? '#0284c7' : '#38bdf8' }}>{selectedAppForStatusUpdate.ackNumber}</strong> ({selectedAppForStatusUpdate.applicantName})
                  </div>

                  <div style={{ marginBottom: '14px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '6px', color: isLightTheme ? '#475569' : '#94a3b8' }}>
                      Select New Application Status:
                    </label>
                    <select
                      value={statusUpdateVal}
                      onChange={e => setStatusUpdateVal(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        background: isLightTheme ? '#ffffff' : '#0f172a',
                        border: isLightTheme ? '1px solid #cbd5e1' : '1px solid rgba(255,255,255,0.2)',
                        borderRadius: '8px',
                        color: isLightTheme ? '#0f172a' : '#fff',
                        fontSize: '14px',
                        fontWeight: '700'
                      }}
                    >
                      <option value="Submitted">Submitted</option>
                      <option value="In Progress">In Progress</option>
                      <option value="Approved">Approved</option>
                      <option value="Completed">Completed</option>
                      <option value="Rejected">Rejected</option>
                    </select>
                  </div>

                  <div style={{ marginBottom: '14px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '6px', color: isLightTheme ? '#475569' : '#94a3b8' }}>
                      Admin Remarks (Optional):
                    </label>
                    <textarea
                      rows={2}
                      placeholder="e.g. Verified by Admin. e-PAN dispatched to email."
                      value={adminRemarksInput}
                      onChange={e => setAdminRemarksInput(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px',
                        background: isLightTheme ? '#ffffff' : '#0f172a',
                        border: isLightTheme ? '1px solid #cbd5e1' : '1px solid rgba(255,255,255,0.2)',
                        borderRadius: '8px',
                        color: isLightTheme ? '#0f172a' : '#fff',
                        fontSize: '13px',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>

                  {/* NSDL Receipt / Ack Slip Remark */}
                  <div style={{ marginBottom: '14px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '6px', color: isLightTheme ? '#0284c7' : '#38bdf8' }}>
                      NSDL Receipt / Ack Slip Remark (Send to Retailer):
                    </label>
                    <input
                      type="text"
                      placeholder="Enter NSDL receipt number or ack slip remark..."
                      value={nsdlReceiptInput}
                      onChange={e => setNsdlReceiptInput(e.target.value)}
                      maxLength={50}
                      style={{
                        width: '100%',
                        padding: '10px',
                        background: isLightTheme ? '#f0f9ff' : '#0f172a',
                        border: '1.5px solid #0284c7',
                        borderRadius: '8px',
                        color: isLightTheme ? '#0369a1' : '#38bdf8',
                        fontSize: '13px',
                        fontFamily: 'monospace',
                        fontWeight: '700',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                    <div style={{ fontSize: '11px', color: isLightTheme ? '#64748b' : '#94a3b8', marginTop: '4px' }}>
                      💡 This receipt number / remark will be sent to retailer and displayed in the <strong>NSDL RECEIPT</strong> column.
                    </div>
                  </div>

                  {/* Send / Upload Approved Application Receipt PDF */}
                  <div style={{
                    marginBottom: '20px',
                    background: isLightTheme ? '#f0fdf4' : 'rgba(2, 132, 199, 0.1)',
                    border: isLightTheme ? '1px dashed #86efac' : '1px dashed rgba(56, 189, 248, 0.4)',
                    padding: '12px',
                    borderRadius: '10px'
                  }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '6px', color: isLightTheme ? '#16a34a' : '#38bdf8' }}>
                      📄 Send Approved Receipt PDF / Ack Slip (To Retailer):
                    </label>
                    <input
                      type="file"
                      accept="application/pdf,image/*"
                      onChange={(e) => {
                        const file = e.target.files[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onloadend = () => setReceiptInputUrl(reader.result);
                          reader.readAsDataURL(file);
                        }
                      }}
                      style={{
                        width: '100%',
                        padding: '6px',
                        background: isLightTheme ? '#ffffff' : '#0f172a',
                        border: isLightTheme ? '1px solid #cbd5e1' : '1px solid rgba(255,255,255,0.15)',
                        borderRadius: '6px',
                        color: isLightTheme ? '#0f172a' : '#fff',
                        fontSize: '12px'
                      }}
                    />
                    {(receiptInputUrl || selectedAppForStatusUpdate.receiptUrl) && (
                      <div style={{ marginTop: '6px', fontSize: '11.5px', color: '#16a34a', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span>✓</span> <span>{receiptInputUrl ? 'New receipt PDF selected! Will be sent to retailer upon saving.' : 'Receipt already uploaded for retailer.'}</span>
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      onClick={() => setSelectedAppForStatusUpdate(null)}
                      style={{
                        background: isLightTheme ? '#f1f5f9' : 'rgba(255,255,255,0.1)',
                        color: isLightTheme ? '#475569' : '#fff',
                        border: isLightTheme ? '1px solid #cbd5e1' : 'none',
                        padding: '10px 18px',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontWeight: '600'
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={updatingStatusId === selectedAppForStatusUpdate._id}
                      onClick={() => handleSaveStatus(selectedAppForStatusUpdate._id)}
                      style={{ background: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)', color: '#fff', border: 'none', padding: '10px 22px', borderRadius: '8px', fontWeight: '800', cursor: 'pointer' }}
                    >
                      {updatingStatusId === selectedAppForStatusUpdate._id ? 'Saving...' : 'Save & Send to Retailer'}
                    </button>
                  </div>

                </div>
              </div>
            )}
          </div>
        ) : activeTab === 'epan_correction' ? (
          <PanCorrectionForm
            data={correctionData}
            onChange={handleCorrectionChange}
            onFileChange={handleCorrectionFileUpload}
            onSubmit={handleCorrectionSubmit}
            onDownload={handleCorrectionDownload}
            isSubmitting={isSubmitting}
            customFields={getCustomFieldsForCurrentForm('epan_correction')}
            tabs={tabs}
          />

        ) : activeTab === 'manual_new_pan' ? (
          /* MANUAL NEW PAN APPLICATION FORM (EXACT MATCH FOR SCREENSHOT 2) */
          <div className="manual-pan-wrapper">

            {/* Top Breadcrumb & Title Bar */}
            <div className="manual-pan-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', paddingBottom: '10px', borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
              <h3 style={{ margin: 0, color: '#0284c7', fontSize: '18px', fontWeight: '800' }}>
                New Pan Application
              </h3>
              <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                <span>Home</span> &gt; <span style={{ color: '#0284c7', fontWeight: '700' }}>Pan New Application</span>
              </div>
            </div>

            <form onSubmit={handleManualSubmit} className="manual-pan-form">
              {/* Dynamic Ordered Form Fields (Reflecting Admin Drag & Drop Order) */}
              <div className="manual-pan-dynamic-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '16px 14px', marginBottom: '24px' }}>
                {getOrderedFieldsForCurrentForm().map(field => renderSingleField(field))}
              </div>

              {/* AO Code Selection Section (Common for both Individual & Non-Individual) */}
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '14px', marginTop: '12px', marginBottom: '20px' }}>
                <div style={{ flex: '1' }}>
                  <label className="form-label-pro">For Help on AO Code, SELECT CITY <span className="req-star">*</span></label>
                  <select name="aoCity" value={manualData.aoCity} onChange={handleManualChange} className="form-select-pro">
                    <option value="SELECT CITY">SELECT CITY</option>
                    {Array.from(new Set([...AO_CODES_LIST.map(a => a.city), ...ALL_INDIAN_DISTRICTS])).sort().map((city, idx) => (
                      <option key={idx} value={city}>{city}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <button
                    type="button" 
                    onClick={handleGetAoCode}
                    style={{
                      background: '#00b4d8',
                      color: '#ffffff',
                      border: 'none',
                      padding: '10px 18px',
                      borderRadius: '8px',
                      fontWeight: '800',
                      fontSize: '13px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      boxShadow: '0 4px 12px rgba(0, 180, 216, 0.3)'
                    }}
                  >
                    <span>🔍</span> <span>Get AO Code</span>
                  </button>
                </div>
              </div>

              {/* Official PAN AO Code Selection Table View */}
              <div className="ao-table-wrapper">
                <div className="ao-table-container">
                  <table className="ao-table">
                    <thead>
                      <tr>
                        <th style={{ width: '55px', textAlign: 'center', color: isLightTheme ? '#0f172a' : '#38bdf8', fontWeight: '800' }}>Select</th>
                        <th style={{ width: '140px', color: isLightTheme ? '#0f172a' : '#38bdf8', fontWeight: '800' }}>Description</th>
                        <th style={{ color: isLightTheme ? '#0f172a' : '#38bdf8', fontWeight: '800' }}>Additional Jurisdiction Description</th>
                        <th style={{ width: '80px', textAlign: 'center', color: isLightTheme ? '#0f172a' : '#38bdf8', fontWeight: '800' }}>Area Code</th>
                        <th style={{ width: '70px', textAlign: 'center', color: isLightTheme ? '#0f172a' : '#38bdf8', fontWeight: '800' }}>AO Type</th>
                        <th style={{ width: '80px', textAlign: 'center', color: isLightTheme ? '#0f172a' : '#38bdf8', fontWeight: '800' }}>Range Code</th>
                        <th style={{ width: '80px', textAlign: 'center', color: isLightTheme ? '#0f172a' : '#38bdf8', fontWeight: '800' }}>AO Number</th>
                      </tr>
                    </thead>
                    <tbody>
                      {getAoCodesForDistrict(manualData.aoCity !== 'SELECT CITY' ? manualData.aoCity : manualData.district).map((ao, idx) => {
                        const isSelected = (manualData.aoAreaCode === ao.areaCode && manualData.aoType === ao.aoType && manualData.aoRangeCode === ao.rangeCode && manualData.aoNo === ao.aoNo);
                        return (
                          <tr key={ao.id || idx} className={isSelected ? 'ao-row-selected' : ''}>
                            <td style={{ textAlign: 'center' }}>
                              <input
                                type="radio"
                                name="selectedAoCodeRow"
                                checked={isSelected}
                                onChange={() => handleAoSelect(ao.id)}
                                style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: isLightTheme ? '#0284c7' : '#38bdf8' }}
                              />
                            </td>
                            <td style={{ fontWeight: '800', color: isLightTheme ? '#0f172a' : '#f8fafc', fontSize: '12.5px' }}>{ao.description}</td>
                            <td style={{ color: isLightTheme ? '#1e293b' : '#94a3b8', lineHeight: '1.4', fontSize: '11.5px', fontWeight: isLightTheme ? '600' : 'normal' }}>{ao.additionalDesc || 'Territorial Jurisdiction Details'}</td>
                            <td style={{ textAlign: 'center', fontWeight: '800', color: isLightTheme ? '#0284c7' : '#38bdf8', fontSize: '12.5px' }}>{ao.areaCode}</td>
                            <td style={{ textAlign: 'center', fontWeight: '800', color: isLightTheme ? '#0284c7' : '#38bdf8', fontSize: '12.5px' }}>{ao.aoType}</td>
                            <td style={{ textAlign: 'center', fontWeight: '800', color: isLightTheme ? '#0284c7' : '#38bdf8', fontSize: '12.5px' }}>{ao.rangeCode}</td>
                            <td style={{ textAlign: 'center', fontWeight: '800', color: isLightTheme ? '#0284c7' : '#38bdf8', fontSize: '12.5px' }}>{ao.aoNo}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Active Synced AO Code Summary & Manual Input Sync */}
                <div className="ao-summary-bar">
                  <div style={{ fontSize: '12.5px', color: isLightTheme ? '#0f172a' : '#e2e8f0', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>✅ Active Synced AO Code: </span>
                    <span style={{ color: isLightTheme ? '#0369a1' : '#38bdf8', background: isLightTheme ? '#e0f2fe' : 'rgba(56, 189, 248, 0.15)', padding: '4px 10px', borderRadius: '6px', border: isLightTheme ? '1.5px solid #7dd3fc' : '1px solid rgba(56, 189, 248, 0.3)', fontWeight: '800', letterSpacing: '1px' }}>
                      {manualData.aoAreaCode || '--'} | {manualData.aoType || '--'} | {manualData.aoRangeCode || '--'} | {manualData.aoNo || '--'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ fontSize: '12px', color: isLightTheme ? '#0f172a' : '#94a3b8', fontWeight: '800' }}>Area:</span>
                      <input type="text" name="aoAreaCode" maxLength={3} value={manualData.aoAreaCode || ''} onChange={handleManualChange} className="form-input-pro" style={{ width: '50px', textAlign: 'center', padding: '4px', textTransform: 'uppercase', fontWeight: '800', color: isLightTheme ? '#0f172a' : '#fff', background: isLightTheme ? '#ffffff' : undefined, border: isLightTheme ? '1.5px solid #cbd5e1' : undefined }} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ fontSize: '12px', color: isLightTheme ? '#0f172a' : '#94a3b8', fontWeight: '800' }}>Type:</span>
                      <input type="text" name="aoType" maxLength={2} value={manualData.aoType || ''} onChange={handleManualChange} className="form-input-pro" style={{ width: '45px', textAlign: 'center', padding: '4px', textTransform: 'uppercase', fontWeight: '800', color: isLightTheme ? '#0f172a' : '#fff', background: isLightTheme ? '#ffffff' : undefined, border: isLightTheme ? '1.5px solid #cbd5e1' : undefined }} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ fontSize: '12px', color: isLightTheme ? '#0f172a' : '#94a3b8', fontWeight: '800' }}>Range:</span>
                      <input type="text" name="aoRangeCode" maxLength={3} value={manualData.aoRangeCode || ''} onChange={handleManualChange} className="form-input-pro" style={{ width: '50px', textAlign: 'center', padding: '4px', textTransform: 'uppercase', fontWeight: '800', color: isLightTheme ? '#0f172a' : '#fff', background: isLightTheme ? '#ffffff' : undefined, border: isLightTheme ? '1.5px solid #cbd5e1' : undefined }} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ fontSize: '12px', color: isLightTheme ? '#0f172a' : '#94a3b8', fontWeight: '800' }}>No:</span>
                      <input type="text" name="aoNo" maxLength={3} value={manualData.aoNo || ''} onChange={handleManualChange} className="form-input-pro" style={{ width: '50px', textAlign: 'center', padding: '4px', textTransform: 'uppercase', fontWeight: '800', color: isLightTheme ? '#0f172a' : '#fff', background: isLightTheme ? '#ffffff' : undefined, border: isLightTheme ? '1.5px solid #cbd5e1' : undefined }} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Photo, Signature & Proof Document Upload Section */}
              <div className="form-section-card pan-upload-card" style={{ marginBottom: '24px' }}>
                <h4 className="form-section-title" style={{ margin: '0 0 16px 0', fontSize: '15px', color: '#ea580c', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>📷</span> <span>{manualData.category === 'INDIVIDUAL' ? 'Photo & Signature Upload Form (Physical PAN Processing)' : 'Authorized Representative Signature & Stamp Upload'}</span>
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: manualData.category === 'INDIVIDUAL' ? '1fr 1fr' : '1fr', gap: '20px', marginBottom: '20px' }}>
                  {manualData.category === 'INDIVIDUAL' && isFieldVisible('photoUrl') && (
                    <DropzoneBox
                      label="Upload Applicant Photo"
                      fieldName="photoUrl"
                      isRequired={isFieldReq('photoUrl')}
                      currentValue={manualData.photoUrl}
                      onFileSelect={(dataUrl) => setManualData(prev => ({ ...prev, photoUrl: dataUrl }))}
                      accept="image/*"
                      hint="Drag & drop applicant photo here or click to browse (JPG, PNG)"
                      icon="👤"
                    />
                  )}
                  {isFieldVisible('signatureUrl') && (
                    manualData.category === 'INDIVIDUAL' ? (
                      <DropzoneBox
                        label="Upload Applicant Signature"
                        fieldName="signatureUrl"
                        isRequired={isFieldReq('signatureUrl')}
                        currentValue={manualData.signatureUrl}
                        onFileSelect={(dataUrl) => setManualData(prev => ({ ...prev, signatureUrl: dataUrl }))}
                        accept="image/*"
                        hint="Drag & drop applicant signature here or click to browse (JPG, PNG)"
                        icon="✍️"
                      />
                    ) : (
                      <div style={{ gridColumn: 'span 1' }}>
                        <StampSignatureMerger
                          value={manualData.signatureUrl}
                          isRequired={isFieldReq('signatureUrl')}
                          onMerge={(dataUrl) => setManualData(prev => ({ ...prev, signatureUrl: dataUrl }))}
                        />
                      </div>
                    )
                  )}
                </div>

                {/* 3rd Uploaded Photo Field (Representative Assessee / Parent / Guardian Photo for Underage Minor) */}
                {(isMinor || manualData.raPhotoUrl || manualData.proofOfOtherUrl) && (
                  <div style={{ background: 'rgba(2, 132, 199, 0.08)', border: '1.5px dashed rgba(2, 132, 199, 0.4)', borderRadius: '12px', padding: '16px', marginBottom: '20px' }}>
                    <div style={{ color: '#38bdf8', fontWeight: '800', fontSize: '13.5px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>👶</span> <span>3rd Uploaded Photo: Representative Assessee (Parent / Guardian Photo) for Underage Applicant</span>
                      {isMinor && <span style={{ background: '#ef4444', color: '#fff', fontSize: '10px', padding: '2px 8px', borderRadius: '4px', fontWeight: '800' }}>REQUIRED (UNDERAGE &lt; 18)</span>}
                    </div>
                    <DropzoneBox
                      label="Upload 3rd Photo (Representative Assessee / Parent / Guardian Photo)"
                      fieldName="raPhotoUrl"
                      isRequired={isMinor}
                      currentValue={manualData.raPhotoUrl || manualData.proofOfOtherUrl}
                      onFileSelect={(dataUrl) => setManualData(prev => ({ ...prev, raPhotoUrl: dataUrl, proofOfOtherUrl: dataUrl }))}
                      accept="image/*"
                      hint="Drag & drop Parent / Guardian photo (3rd photo). Displayed in PART E of downloaded Form 49A PDF."
                      icon="👨‍👦"
                    />
                  </div>
                )}

                {/* Proof Document Uploads (Identity, Address, Birth & Other Proof) */}
                <h4 style={{ margin: '20px 0 16px 0', fontSize: '15px', color: '#0284c7', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px', borderTop: '1px dashed #cbd5e1', paddingTop: '16px' }}>
                  <span>📁</span> <span>Document Proof Uploads (Identity, Address, Birth & Other Proof)</span>
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                  <DropzoneBox
                    label="Upload Identity Proof (Identity Proof File)"
                    fieldName="proofOfIdentityUrl"
                    isRequired={false}
                    currentValue={manualData.proofOfIdentityUrl}
                    onFileSelect={(dataUrl) => setManualData(prev => ({ ...prev, proofOfIdentityUrl: dataUrl }))}
                    accept="image/*,application/pdf"
                    hint="Drag & drop Identity Proof (Aadhaar, Voter ID, Passport, DL) here (JPG, PNG, PDF)"
                    icon="🪪"
                  />
                  <DropzoneBox
                    label="Upload Address Proof (Address Proof File)"
                    fieldName="proofOfAddressUrl"
                    isRequired={false}
                    currentValue={manualData.proofOfAddressUrl}
                    onFileSelect={(dataUrl) => setManualData(prev => ({ ...prev, proofOfAddressUrl: dataUrl }))}
                    accept="image/*,application/pdf"
                    hint="Drag & drop Address Proof (Aadhaar, Voter ID, Utility Bill) here (JPG, PNG, PDF)"
                    icon="🏠"
                  />
                  <DropzoneBox
                    label="Upload Birth Proof (Date of Birth Proof File)"
                    fieldName="proofOfDobUrl"
                    isRequired={false}
                    currentValue={manualData.proofOfDobUrl}
                    onFileSelect={(dataUrl) => setManualData(prev => ({ ...prev, proofOfDobUrl: dataUrl }))}
                    accept="image/*,application/pdf"
                    hint="Drag & drop Birth Proof (Birth Certificate, 10th Pass Cert, ABHA Card) here (JPG, PNG, PDF)"
                    icon="🎂"
                  />
                  <DropzoneBox
                    label="Upload Other Proof / Supporting Document"
                    fieldName="proofOfOtherUrl"
                    isRequired={false}
                    currentValue={manualData.proofOfOtherUrl}
                    onFileSelect={(dataUrl) => setManualData(prev => ({ ...prev, proofOfOtherUrl: dataUrl }))}
                    accept="image/*,application/pdf"
                    hint="Drag & drop Any Other Supporting Proof document here (JPG, PNG, PDF)"
                    icon="📄"
                  />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
                <button type="button" onClick={handleDownloadPdf} className="pancard-submit-btn" style={{ background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)' }}>
                  📥 Download Pre-Filled PDF
                </button>
                <button type="submit" disabled={isSubmitting} className="pancard-submit-btn">
                  {isSubmitting ? 'Submitting...' : '🚀 Submit Application'}
                </button>
              </div>

            </form>
          </div>
        ) : (
          /* E-KYC / CORRECTION FORM DISPLAY */
          <form className="pancard-form" onSubmit={handleManualSubmit}>
            <div className="tab-form-section animated-tab-form" key={activeTab}>
              <div className="pancard-form-split-wrapper">

                <div className="pancard-form-main-col">
                  <div className="pancard-form-hero-card">
                    <div className="hero-card-header">
                      <h4 className="hero-form-title" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                        <span>{currentTabObj?.icon || '💳'} {currentTabObj?.label || 'PAN Application'} Form</span>
                        <span className="hero-fee-pill" style={{ marginLeft: '4px' }}>Fee: ₹{currentTabObj?.fee ?? 107}</span>
                      </h4>
                      <p className="hero-form-desc">{currentTabObj?.description}</p>
                    </div>
                  </div>

                  <div className="pancard-form-grid">
                    <div className="form-group-pro">
                      <label className="form-label-pro">Applicant Full Name (As per Aadhaar) <span className="req-star">*</span></label>
                      <input type="text" name="applicantName" value={formData.applicantName} onChange={handleChange} placeholder="Enter full name of applicant..." className="form-input-pro" required />
                    </div>
                    <div className="form-group-pro">
                      <label className="form-label-pro">Father's Full Name <span className="req-star">*</span></label>
                      <input type="text" name="fatherName" value={formData.fatherName} onChange={handleChange} placeholder="Enter father's full name..." className="form-input-pro" required />
                    </div>
                    <div className="form-group-pro">
                      <label className="form-label-pro">Date of Birth (DOB) <span className="req-star">*</span></label>
                      <input type="date" name="dob" value={formData.dob} onChange={handleChange} className="form-input-pro" required />
                    </div>
                    <div className="form-group-pro">
                      <label className="form-label-pro">Gender <span className="req-star">*</span></label>
                      <select name="gender" value={formData.gender} onChange={handleChange} className="form-select-pro">
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Transgender">Transgender</option>
                      </select>
                    </div>
                    <div className="form-group-pro">
                      <label className="form-label-pro">Mobile Number <span className="req-star">*</span></label>
                      <input type="tel" name="mobileNumber" value={formData.mobileNumber} onChange={handleChange} placeholder="10-digit mobile number..." maxLength={10} className="form-input-pro" required />
                    </div>
                    <div className="form-group-pro">
                      <label className="form-label-pro">Email Address <span className="req-star">*</span></label>
                      <input type="email" name="email" value={formData.email} onChange={handleChange} placeholder="Enter email address..." className="form-input-pro" required />
                    </div>
                    <div className="form-group-pro full-width-field">
                      <label className="form-label-pro">12-Digit Aadhaar Number <span className="req-star">*</span></label>
                      <input type="text" name="aadhaarNumber" value={formData.aadhaarNumber} onChange={handleChange} placeholder="12-digit Aadhaar number..." maxLength={12} className="form-input-pro" required />
                    </div>
                  </div>

                  <div style={{ marginTop: '20px' }}>
                    <button type="submit" disabled={isSubmitting} className="pancard-submit-btn">
                      {isSubmitting ? 'Submitting...' : '🚀 Submit Application'}
                    </button>
                  </div>

                </div>

                {/* Right Summary Sidebar */}
                <div className="pancard-summary-sidebar">
                  <div className="summary-card-pro">
                    <div className="summary-card-header">
                      <h5 className="summary-title">Application Review</h5>
                      <span className="live-pulse-badge">Live Preview</span>
                    </div>

                    <div className="summary-details-list">
                      <div className="summary-detail-item">
                        <span className="detail-label">Service Type:</span>
                        <span className="detail-val highlight-orange">{getApplicationTypeLabel()}</span>
                      </div>
                      <div className="summary-detail-item">
                        <span className="detail-label">Applicant Name:</span>
                        <span className="detail-val">{formData.applicantName || '—'}</span>
                      </div>
                      <div className="summary-detail-item">
                        <span className="detail-label">Mobile Number:</span>
                        <span className="detail-val">{formData.mobileNumber || '—'}</span>
                      </div>
                      <div className="summary-detail-item">
                        <span className="detail-label">Aadhaar Number:</span>
                        <span className="detail-val">{formData.aadhaarNumber ? `XXXX-XXXX-${formData.aadhaarNumber.slice(-4)}` : '—'}</span>
                      </div>
                      <div className="summary-detail-item divider"></div>
                      <div className="summary-detail-item">
                        <span className="detail-label">Deduction Fee:</span>
                        <span className="detail-val fee-text">₹{currentTabObj?.fee ?? 107}</span>
                      </div>
                      <div className="summary-detail-item">
                        <span className="detail-label">Wallet Balance:</span>
                        <span className="detail-val balance-text">₹{parseFloat(walletBalance).toFixed(2)}</span>
                      </div>
                    </div>

                    <div className="trust-guidelines-box">
                      <h6>📌 Retailer Guidelines</h6>
                      <ul>
                        <li>✓ Soft copy sent to applicant's email.</li>
                        <li>✓ Ensure mobile number is active for OTP.</li>
                        <li>✓ Instant balance deduction & transaction ID.</li>
                      </ul>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </form>
        )}

        {/* Pre-Filled Form 49A Official PDF Template Container */}
        <Form93PdfTemplate data={manualData} />
        <FormPanCrPdfTemplate data={correctionData} />

        {/* Form 49A Direct Edit Modal — opened from history tab Details button */}
        {selectedAppForEdit && (
          <Form49ADirectEditModal
            selectedPanAppDetails={selectedAppForEdit}
            onClose={() => setSelectedAppForEdit(null)}
            onSaveSuccess={(updatedData) => {
              setSelectedAppForEdit(prev => ({
                ...prev,
                ...updatedData,
                details: { ...(prev?.details || {}), ...updatedData }
              }));
              fetchHistory();
            }}
            handleDownloadPdf={(data) => generateForm49APdf(data.lastName ? data : selectedAppForEdit)}
          />
        )}

      </div>
    </div>
  );
};

export default PanCardView;
