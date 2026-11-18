import React, { useState, useEffect, useRef } from 'react';
import Swal from 'sweetalert2';
import { API_URL } from '../../utils/apiClient';
import { hasUserAccess, getStoredUserPermissions } from '../../utils/userPermissions';
import './OfflineWorkView.css';

const OfflineWorkView = ({ currentUser, walletBalance, onClose, theme, userPermissions }) => {
  const effectivePermissions = userPermissions || getStoredUserPermissions();
  const [currentTheme, setCurrentTheme] = useState(() => theme || localStorage.getItem('appTheme') || 'light');

  useEffect(() => {
    if (theme) setCurrentTheme(theme);
  }, [theme]);

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

  const [tabs, setTabs] = useState([]);
  const [activeTabId, setActiveTabId] = useState('');
  const [loadingTabs, setLoadingTabs] = useState(true);

  // Form State for dynamic fields: { [fieldName]: value }
  const [formData, setFormData] = useState({});
  // File uploads state: { [fieldName]: { dataUrl, name, size, type } }
  const [filesData, setFilesData] = useState({});
  const [submitting, setSubmitting] = useState(false);

  // History State
  const [historyList, setHistoryList] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [selectedAppForModal, setSelectedAppForModal] = useState(null);
  const [ackModalData, setAckModalData] = useState(null);

  const fileInputRefs = useRef({});

  // Fetch dynamic tabs from backend
  const fetchTabs = async () => {
    try {
      const res = await fetch(`${API_URL}/api/offline-work/tabs`);
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        setTabs(data);
        if (!activeTabId) {
          setActiveTabId(data[0].id);
        }
      }
    } catch (err) {
      console.error('Error fetching offline work tabs:', err);
    } finally {
      setLoadingTabs(false);
    }
  };

  // Fetch user applications history
  const fetchHistory = async () => {
    const user = currentUser || localStorage.getItem('currentUser') || 'guest';
    setLoadingHistory(true);
    try {
      const res = await fetch(`${API_URL}/api/offline-work/applications/${encodeURIComponent(user)}`);
      const data = await res.json();
      if (data && data.success && Array.isArray(data.applications)) {
        setHistoryList(data.applications);
      }
    } catch (err) {
      console.error('Error fetching offline history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchTabs();
    fetchHistory();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset form when tab changes
  useEffect(() => {
    if (activeTabId && activeTabId !== 'history') {
      setFormData({});
      setFilesData({});
    }
  }, [activeTabId]);

  const activeTab = tabs.find(t => t.id === activeTabId);

  // Handle generic input changes
  const handleInputChange = (fieldName, value) => {
    setFormData(prev => ({
      ...prev,
      [fieldName]: value
    }));
  };

  // Handle file selection
  const handleFileChange = (fieldName, file) => {
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      return Swal.fire({
        icon: 'error',
        title: 'File Too Large',
        text: 'File size must be under 10 MB.'
      });
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setFilesData(prev => ({
        ...prev,
        [fieldName]: {
          dataUrl: reader.result,
          name: file.name,
          size: (file.size / 1024).toFixed(1) + ' KB',
          type: file.type
        }
      }));
      setFormData(prev => ({
        ...prev,
        [fieldName]: reader.result
      }));
    };
    reader.readAsDataURL(file);
  };

  const removeFile = (fieldName) => {
    setFilesData(prev => {
      const next = { ...prev };
      delete next[fieldName];
      return next;
    });
    setFormData(prev => {
      const next = { ...prev };
      delete next[fieldName];
      return next;
    });
    if (fileInputRefs.current[fieldName]) {
      fileInputRefs.current[fieldName].value = '';
    }
  };

  // Submit Application
  const handleSubmitApplication = async (e) => {
    if (e) e.preventDefault();

    if (!activeTab) return;

    const currentFields = activeTab.fields || [];

    // Check mandatory fields
    for (const field of currentFields) {
      if (field.hidden) continue;
      if (field.required) {
        const val = formData[field.name];
        if (!val || (typeof val === 'string' && val.trim() === '')) {
          return Swal.fire({
            icon: 'warning',
            title: 'Required Field Missing',
            text: `Please provide: ${field.label || field.name}`
          });
        }
      }
    }

    // Resolve Applicant Name & Mobile from form
    const applicantName = formData.applicantName || formData.fullName || formData.name || formData.applicant_name || 'Applicant';
    const mobileNumber = formData.mobileNumber || formData.mobile || formData.phone || formData.contact || '';
    const email = formData.email || formData.emailId || '';

    if (!mobileNumber || mobileNumber.length < 10) {
      return Swal.fire({
        icon: 'warning',
        title: 'Valid Mobile Number Required',
        text: 'Please enter a valid 10-digit mobile number for notification and updates.'
      });
    }

    const feeAmount = typeof activeTab.fee === 'number' ? activeTab.fee : 0;
    const currentBal = Number(walletBalance || 0);

    if (!hasUserAccess(effectivePermissions, 'offlineWork.submit')) {
      return Swal.fire({
        icon: 'error',
        title: 'Access Restricted',
        text: 'You do not have permission to submit offline applications.',
        confirmButtonColor: '#ea580c'
      });
    }

    if (feeAmount > 0 && currentBal < feeAmount) {
      return Swal.fire({
        icon: 'error',
        title: 'Insufficient Balance',
        html: `This service requires <b>₹${feeAmount}</b> fee.<br/>Your current wallet balance is: <b>₹${currentBal.toFixed(2)}</b>.<br/>Please load your wallet to proceed.`
      });
    }

    const confirmRes = await Swal.fire({
      title: 'Submit Offline Work Application?',
      html: `
        <div style="text-align: left; font-size: 14px; color: #334155; line-height: 1.6;">
          <p style="margin: 0 0 6px;"><b>Service:</b> ${activeTab.label}</p>
          <p style="margin: 0 0 6px;"><b>Applicant:</b> ${applicantName}</p>
          <p style="margin: 0 0 6px;"><b>Mobile:</b> ${mobileNumber}</p>
          <p style="margin: 0 0 6px;"><b>Application Fee:</b> ₹${feeAmount}</p>
        </div>
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: `Yes, Pay ₹${feeAmount} & Submit`,
      cancelButtonText: 'Review Form',
      confirmButtonColor: '#ea580c'
    });

    if (!confirmRes.isConfirmed) return;

    setSubmitting(true);
    try {
      const activeUser = currentUser || localStorage.getItem('currentUser') || 'guest';
      const payload = {
        userId: activeUser,
        tabId: activeTab.id,
        applicationType: activeTab.label,
        applicantName,
        mobileNumber,
        email,
        remarks: formData.customerRemarks || formData.remarks || '',
        details: formData
      };

      const res = await fetch(`${API_URL}/api/offline-work/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (data && data.success) {
        // Reset form
        setFormData({});
        setFilesData({});

        // Show Ack Modal
        setAckModalData({
          ackNumber: data.ackNumber,
          applicantName,
          mobileNumber,
          serviceName: activeTab.label,
          feePaid: feeAmount,
          date: new Date().toLocaleString('en-IN')
        });

        // Refresh History
        fetchHistory();

        Swal.fire({
          icon: 'success',
          title: 'Application Submitted!',
          text: `Acknowledgement No: ${data.ackNumber}`,
          timer: 3000,
          showConfirmButton: false
        });
      } else {
        Swal.fire({
          icon: 'error',
          title: 'Submission Failed',
          text: data.message || 'Could not submit application.'
        });
      }
    } catch (err) {
      console.error('Error submitting application:', err);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Server communication error. Please try again.'
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Helper to render field based on its configured type
  const renderFieldInput = (field) => {
    if (field.hidden) return null;

    const fieldName = field.name;
    const isRequired = field.required;
    const fieldType = field.type || 'text';
    const isSpan2 = field.gridSpan === 2 || 
      field.label.toLowerCase().includes('address') || 
      field.label.toLowerCase().includes('remark') || 
      field.label.toLowerCase().includes('instruction') ||
      field.label.toLowerCase().includes('details');

    const value = formData[fieldName] || '';
    const fileObj = filesData[fieldName];

    return (
      <div 
        key={fieldName} 
        className={`offline-form-group ${isSpan2 ? 'span-2' : ''}`}
      >
        <label className="offline-field-label">
          {field.icon ? `${field.icon} ` : ''}
          {field.label}
          {isRequired && <span className="offline-req-star">*</span>}
        </label>

        {/* 1. SELECT TYPE */}
        {fieldType === 'select' ? (
          <select
            className="offline-field-select"
            value={value}
            onChange={(e) => handleInputChange(fieldName, e.target.value)}
          >
            <option value="">-- Select {field.label} --</option>
            {(field.options || []).map((opt, idx) => (
              <option key={idx} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        ) : 

        /* 2. FILE TYPE */
        fieldType === 'file' ? (
          <div>
            <input
              type="file"
              ref={el => fileInputRefs.current[fieldName] = el}
              style={{ display: 'none' }}
              accept="image/*, application/pdf"
              onChange={(e) => {
                const file = e.target.files && e.target.files[0];
                if (file) handleFileChange(fieldName, file);
              }}
            />

            {!fileObj ? (
              <div
                className="offline-dropzone-box"
                onClick={() => {
                  if (fileInputRefs.current[fieldName]) {
                    fileInputRefs.current[fieldName].click();
                  }
                }}
              >
                <div className="offline-dropzone-icon">📁</div>
                <div className="offline-dropzone-prompt">
                  Click to Choose or Drag & Drop File
                </div>
                <div className="offline-dropzone-hint">
                  Supports JPG, PNG, PDF up to 10 MB
                </div>
              </div>
            ) : (
              <div className="offline-file-preview-card">
                <div className="offline-file-info">
                  {fileObj.dataUrl && fileObj.dataUrl.startsWith('data:image') ? (
                    <img 
                      src={fileObj.dataUrl} 
                      alt="Preview" 
                      className="offline-preview-img" 
                    />
                  ) : (
                    <span style={{ fontSize: '26px' }}>📄</span>
                  )}
                  <div>
                    <div className="offline-file-name">{fileObj.name}</div>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>{fileObj.size}</div>
                  </div>
                </div>
                <button
                  type="button"
                  className="offline-remove-file-btn"
                  onClick={() => removeFile(fieldName)}
                >
                  ✕ Remove
                </button>
              </div>
            )}
          </div>
        ) : 

        /* 3. DATE TYPE */
        fieldType === 'date' ? (
          <input
            type="date"
            className="offline-field-input"
            value={value}
            onChange={(e) => handleInputChange(fieldName, e.target.value)}
          />
        ) : 

        /* 4. TEL TYPE */
        fieldType === 'tel' ? (
          <input
            type="tel"
            maxLength={10}
            className="offline-field-input"
            placeholder={field.placeholder || '10-Digit Mobile Number'}
            value={value}
            onChange={(e) => {
              const cleaned = e.target.value.replace(/[^0-9]/g, '');
              handleInputChange(fieldName, cleaned);
            }}
          />
        ) : 

        /* 5. EMAIL TYPE */
        fieldType === 'email' ? (
          <input
            type="email"
            className="offline-field-input"
            placeholder={field.placeholder || 'email@example.com'}
            value={value}
            onChange={(e) => handleInputChange(fieldName, e.target.value)}
          />
        ) : 

        /* 6. DEFAULT TEXT / OTHER INPUT TYPE */
        (
          <input
            type={fieldType}
            className="offline-field-input"
            placeholder={field.placeholder || `Enter ${field.label}...`}
            value={value}
            onChange={(e) => handleInputChange(fieldName, e.target.value)}
          />
        )}
      </div>
    );
  };

  return (
    <div className={`offline-work-container theme-${currentTheme} ${currentTheme === 'dark' ? 'theme-dark' : 'theme-light'}`}>
      
      {/* Top Header Card */}
      <div className="offline-header-card">
        <div className="offline-header-left">
          <div className="offline-header-icon-wrap">
            📁
          </div>
          <div>
            <div className="offline-title-badge">⚡ MB MITRA SERVICES</div>
            <h2 className="offline-header-title">OFFLINE WORK PORTAL</h2>
            <p className="offline-header-desc">
              Submit offline applications, document verification, certificate services & manual corrections.
            </p>
          </div>
        </div>

        <div className="offline-header-right">
          <div className="offline-wallet-pill">
            <span>💼 Wallet:</span>
            <span>₹ {Number(walletBalance || 0).toFixed(2)}</span>
          </div>
          {onClose && (
            <button 
              type="button" 
              className="offline-back-btn" 
              onClick={onClose}
            >
              ← Back to Dashboard
            </button>
          )}
        </div>
      </div>

      {/* Tabs Navigation Bar */}
      <div className="offline-tabs-bar">
        {tabs.map(tab => (
          <button
            key={tab.id}
            type="button"
            className={`offline-tab-pill ${activeTabId === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTabId(tab.id)}
          >
            <span>{tab.icon || '📁'}</span>
            <span>{tab.label}</span>
            {tab.fee !== undefined && (
              <span className="offline-tab-badge-fee">₹{tab.fee}</span>
            )}
          </button>
        ))}

        {/* History Tab */}
        {hasUserAccess(effectivePermissions, 'offlineWork.history') && (
          <button
            type="button"
            className={`offline-tab-pill ${activeTabId === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTabId('history')}
          >
            <span>📋</span>
            <span>My Application History</span>
            {historyList.length > 0 && (
              <span className="offline-tab-badge-fee">{historyList.length}</span>
            )}
          </button>
        )}
      </div>

      {/* RENDER ACTIVE VIEW */}
      {loadingTabs ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
          <div style={{ fontSize: '32px', marginBottom: '10px' }}>⏳</div>
          <b>Loading Offline Work Services...</b>
        </div>
      ) : activeTabId === 'history' ? (

        /* ==================== HISTORY VIEW ==================== */
        <div className="offline-history-container">
          <div className="offline-history-header">
            <div>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>
                📋 My Offline Work Applications
              </h3>
              <p style={{ margin: '3px 0 0', fontSize: '13px', color: '#64748b' }}>
                Track live status, admin verification, remarks & completion receipts.
              </p>
            </div>
            <button
              type="button"
              className="offline-action-btn-sm"
              onClick={fetchHistory}
            >
              🔄 Refresh List
            </button>
          </div>

          {loadingHistory ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b' }}>
              ⏳ Loading applications...
            </div>
          ) : historyList.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '50px 20px', background: '#f8fafc', borderRadius: '14px', border: '1px dashed #cbd5e1' }}>
              <div style={{ fontSize: '42px', marginBottom: '10px' }}>📭</div>
              <h4 style={{ margin: '0 0 6px', color: '#1e293b' }}>No Applications Submitted Yet</h4>
              <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
                Choose a service from the tabs above to submit your first offline work application.
              </p>
            </div>
          ) : (
            <div className="offline-table-responsive">
              <table className="offline-history-table">
                <thead>
                  <tr>
                    <th>Ack No.</th>
                    <th>Date & Time</th>
                    <th>Service Type</th>
                    <th>Applicant Name</th>
                    <th>Mobile No.</th>
                    <th>Fee Paid</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {historyList.map(app => {
                    const st = (app.status || 'Submitted').toLowerCase().replace(' ', '_');
                    return (
                      <tr key={app._id}>
                        <td>
                          <b style={{ color: '#0284c7', fontFamily: 'monospace' }}>
                            {app.ackNumber}
                          </b>
                        </td>
                        <td>
                          {new Date(app.createdAt).toLocaleDateString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric'
                          })}
                        </td>
                        <td>{app.applicationType}</td>
                        <td>{app.applicantName}</td>
                        <td>{app.mobileNumber}</td>
                        <td>₹{app.feeAmount || 0}</td>
                        <td>
                          <span className={`status-badge-offline ${st}`}>
                            {app.status}
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="offline-action-btn-sm"
                            onClick={() => setSelectedAppForModal(app)}
                          >
                            👁️ View Details
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      ) : activeTab ? (

        /* ==================== ACTIVE FORM VIEW ==================== */
        <div>
          {/* Sub-Tab Information Banner */}
          <div className="offline-banner-box">
            <div className="offline-banner-info">
              <h3 className="offline-banner-heading">
                <span>{activeTab.icon || '📁'}</span>
                <span>{activeTab.label}</span>
                {activeTab.badge && (
                  <span className="offline-title-badge">{activeTab.badge}</span>
                )}
              </h3>
              <p className="offline-banner-sub">
                {activeTab.description || 'Fill out the form below and upload required documents.'}
              </p>
            </div>

            <div className="offline-banner-fee-badge">
              <span>💳 Service Fee:</span>
              <span>₹ {activeTab.fee !== undefined ? activeTab.fee : 0}</span>
            </div>
          </div>

          {/* Dynamic Form Card */}
          <div className="offline-form-card">
            <form onSubmit={handleSubmitApplication}>
              <div className="offline-form-grid">
                {(activeTab.fields || []).map(field => renderFieldInput(field))}
              </div>

              {/* Form Footer */}
              <div className="offline-form-footer">
                <div className="offline-fee-summary">
                  <div className="offline-fee-pill">
                    Total Payable Fee: <span style={{ color: '#ea580c', fontSize: '18px' }}>₹{activeTab.fee || 0}</span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>
                    • Deducted from your wallet balance on submission.
                  </div>
                </div>

                <button
                  type="submit"
                  className="offline-submit-btn"
                  disabled={submitting}
                >
                  {submitting ? '⏳ Submitting Application...' : '🚀 Submit Application'}
                </button>
              </div>
            </form>
          </div>
        </div>

      ) : null}

      {/* ==================== ACKNOWLEDGEMENT MODAL ==================== */}
      {ackModalData && (
        <div className="offline-modal-overlay">
          <div className="offline-modal-box" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '50px', marginBottom: '10px' }}>🎉</div>
            <h3 style={{ margin: '0 0 6px', fontSize: '22px', fontWeight: 900, color: '#15803d' }}>
              Application Successfully Submitted!
            </h3>
            <p style={{ color: '#64748b', fontSize: '14px', margin: '0 0 20px' }}>
              Your offline work request has been received and queued for processing.
            </p>

            <div className="offline-ack-summary-card" style={{ background: '#f8fafc', border: '1.5px dashed #cbd5e1', borderRadius: '16px', padding: '18px 24px', textAlign: 'left', marginBottom: '24px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', fontSize: '13.5px' }}>
                <div>
                  <span style={{ color: '#64748b', display: 'block', fontSize: '11px', fontWeight: 700 }}>ACKNOWLEDGEMENT NO.</span>
                  <b style={{ color: '#0284c7', fontSize: '15px', fontFamily: 'monospace' }}>{ackModalData.ackNumber}</b>
                </div>
                <div>
                  <span style={{ color: '#64748b', display: 'block', fontSize: '11px', fontWeight: 700 }}>DATE & TIME</span>
                  <b>{ackModalData.date}</b>
                </div>
                <div>
                  <span style={{ color: '#64748b', display: 'block', fontSize: '11px', fontWeight: 700 }}>APPLICANT NAME</span>
                  <b>{ackModalData.applicantName}</b>
                </div>
                <div>
                  <span style={{ color: '#64748b', display: 'block', fontSize: '11px', fontWeight: 700 }}>SERVICE TYPE</span>
                  <b>{ackModalData.serviceName}</b>
                </div>
                <div>
                  <span style={{ color: '#64748b', display: 'block', fontSize: '11px', fontWeight: 700 }}>MOBILE NUMBER</span>
                  <b>{ackModalData.mobileNumber}</b>
                </div>
                <div>
                  <span style={{ color: '#64748b', display: 'block', fontSize: '11px', fontWeight: 700 }}>FEE DEBITED</span>
                  <b style={{ color: '#ea580c' }}>₹{ackModalData.feePaid}</b>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => window.print()}
                className="offline-back-btn"
                style={{ background: '#f1f5f9' }}
              >
                🖨️ Print Slip
              </button>
              <button
                type="button"
                onClick={() => {
                  setAckModalData(null);
                  setActiveTabId('history');
                }}
                className="offline-submit-btn"
                style={{ padding: '10px 24px', fontSize: '14px' }}
              >
                View in Application History →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== APPLICATION DETAILS MODAL ==================== */}
      {selectedAppForModal && (
        <div className="offline-modal-overlay" onClick={() => setSelectedAppForModal(null)}>
          <div className="offline-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="offline-modal-header">
              <div>
                <span className="offline-title-badge">APPLICATION DETAILS</span>
                <h3 className="offline-modal-title" style={{ margin: '4px 0 0', fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>
                  {selectedAppForModal.applicationType}
                </h3>
              </div>
              <button 
                type="button" 
                className="offline-modal-close-btn"
                onClick={() => setSelectedAppForModal(null)}
              >
                ✕
              </button>
            </div>

            <div className="offline-modal-details-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px', marginBottom: '20px', background: '#f8fafc', padding: '16px', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
              <div>
                <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 800 }}>ACK NUMBER:</span>
                <div style={{ fontWeight: 800, color: '#0284c7', fontFamily: 'monospace' }}>{selectedAppForModal.ackNumber}</div>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 800 }}>STATUS:</span>
                <div>
                  <span className={`status-badge-offline ${selectedAppForModal.status.toLowerCase().replace(' ', '_')}`}>
                    {selectedAppForModal.status}
                  </span>
                </div>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 800 }}>APPLICANT NAME:</span>
                <div style={{ fontWeight: 700 }}>{selectedAppForModal.applicantName}</div>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 800 }}>MOBILE:</span>
                <div style={{ fontWeight: 700 }}>{selectedAppForModal.mobileNumber}</div>
              </div>
              {selectedAppForModal.email && (
                <div>
                  <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 800 }}>EMAIL:</span>
                  <div style={{ fontWeight: 700 }}>{selectedAppForModal.email}</div>
                </div>
              )}
              <div>
                <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 800 }}>FEE PAID:</span>
                <div style={{ fontWeight: 800, color: '#ea580c' }}>₹{selectedAppForModal.feeAmount}</div>
              </div>
            </div>

            {/* Admin Remarks if any */}
            {selectedAppForModal.adminRemarks && (
              <div className="offline-admin-remarks-box" style={{ background: '#fff7ed', border: '1.5px solid #fed7aa', padding: '14px', borderRadius: '12px', marginBottom: '20px' }}>
                <span style={{ fontSize: '11.5px', fontWeight: 800, color: '#c2410c', display: 'block', marginBottom: '4px' }}>
                  ADMIN REMARKS & UPDATE:
                </span>
                <div style={{ fontSize: '13.5px', color: '#7c2d12', fontWeight: 600 }}>
                  {selectedAppForModal.adminRemarks}
                </div>
              </div>
            )}

            {/* Admin Result / Receipt if uploaded */}
            {selectedAppForModal.receiptUrl && (
              <div className="offline-receipt-box" style={{ background: '#ecfdf5', border: '1.5px solid #a7f3d0', padding: '14px', borderRadius: '12px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <b style={{ color: '#065f46', fontSize: '13.5px' }}>✓ Completion Certificate / Receipt Attached</b>
                  <div style={{ fontSize: '11.5px', color: '#047857' }}>Admin uploaded completion file for this application.</div>
                </div>
                <a
                  href={selectedAppForModal.receiptUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{ background: '#10b981', color: '#ffffff', padding: '6px 14px', borderRadius: '8px', fontWeight: 800, textDecoration: 'none', fontSize: '12px' }}
                >
                  Download / View →
                </a>
              </div>
            )}

            {/* Dynamic Details breakdown */}
            <h4 className="offline-modal-subtitle" style={{ margin: '0 0 10px', fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>
              Form Input Fields Data:
            </h4>
            <div className="offline-modal-fields-container" style={{ maxHeight: '240px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '12px' }}>
              {selectedAppForModal.details && Object.keys(selectedAppForModal.details).length > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
                  {Object.entries(selectedAppForModal.details).map(([k, v]) => {
                    const isFileVal = typeof v === 'string' && (v.startsWith('data:') || v.startsWith('http'));
                    return (
                      <div key={k} className="offline-modal-field-item" style={{ background: '#f8fafc', padding: '8px 10px', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
                        <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', display: 'block' }}>
                          {k}
                        </span>
                        {isFileVal ? (
                          <a
                            href={v}
                            target="_blank"
                            rel="noreferrer"
                            style={{ fontSize: '12px', color: '#0284c7', fontWeight: 800, textDecoration: 'underline' }}
                          >
                            📎 View Uploaded File
                          </a>
                        ) : (
                          <span style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>
                            {String(v || '-')}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ color: '#94a3b8', fontSize: '13px' }}>No additional details</div>
              )}
            </div>

            <div style={{ marginTop: '20px', textAlign: 'right' }}>
              <button
                type="button"
                className="offline-back-btn"
                onClick={() => setSelectedAppForModal(null)}
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default OfflineWorkView;
