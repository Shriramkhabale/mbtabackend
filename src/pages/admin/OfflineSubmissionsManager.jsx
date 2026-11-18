import React, { useState, useEffect, useMemo } from 'react';
import Swal from 'sweetalert2';
import { API_URL } from '../../utils/apiClient';

const Toast = Swal.mixin({
  toast: true,
  position: 'top-end',
  showConfirmButton: false,
  timer: 3000,
  timerProgressBar: true
});

const OfflineSubmissionsManager = ({ hasStaffActionAccess = () => true, users = [] }) => {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters state
  const [retailerFilter, setRetailerFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [typeFilter, setTypeFilter] = useState('All');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(true);

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Modals state
  const [selectedAppForDetails, setSelectedAppForDetails] = useState(null);
  const [statusModalApp, setStatusModalApp] = useState(null);
  const [newStatus, setNewStatus] = useState('Submitted');
  const [adminRemarks, setAdminRemarks] = useState('');
  const [receiptFileUrl, setReceiptFileUrl] = useState('');
  const [receiptFileName, setReceiptFileName] = useState('');
  const [shouldRefund, setShouldRefund] = useState(true);
  const [savingStatus, setSavingStatus] = useState(false);

  // Fetch all submissions
  const fetchSubmissions = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/offline-work/all`);
      const data = await res.json();
      if (data.success && Array.isArray(data.applications)) {
        setApplications(data.applications);
      } else {
        setApplications([]);
      }
    } catch (err) {
      console.error('Error fetching offline submissions:', err);
      Toast.fire({ icon: 'error', title: 'Failed to load offline submissions' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubmissions();
  }, []);

  // Distinct retailer IDs for filter dropdown
  const retailerOptions = useMemo(() => {
    const ids = new Set();
    applications.forEach(a => {
      if (a.userId) ids.add(a.userId);
    });
    users.forEach(u => {
      if (u.userId) ids.add(u.userId);
    });
    return Array.from(ids).sort();
  }, [applications, users]);

  // Distinct service types
  const serviceTypeOptions = useMemo(() => {
    const types = new Set();
    applications.forEach(a => {
      if (a.applicationType) types.add(a.applicationType);
    });
    return Array.from(types).sort();
  }, [applications]);

  // Filtered applications list
  const filteredApps = useMemo(() => {
    return applications.filter(app => {
      if (retailerFilter !== 'All' && (app.userId || '').toLowerCase() !== retailerFilter.toLowerCase()) {
        return false;
      }
      if (statusFilter !== 'All' && (app.status || 'Submitted').toLowerCase() !== statusFilter.toLowerCase()) {
        return false;
      }
      if (typeFilter !== 'All' && app.applicationType !== typeFilter) {
        return false;
      }
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        if (new Date(app.createdAt) < start) return false;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        if (new Date(app.createdAt) > end) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const ack = (app.ackNumber || '').toLowerCase();
        const user = (app.userId || '').toLowerCase();
        const name = (app.applicantName || '').toLowerCase();
        const mobile = (app.mobileNumber || '').toLowerCase();
        const email = (app.email || '').toLowerCase();
        const type = (app.applicationType || '').toLowerCase();
        const matchAny = ack.includes(q) || user.includes(q) || name.includes(q) || mobile.includes(q) || email.includes(q) || type.includes(q);
        if (!matchAny) return false;
      }
      return true;
    });
  }, [applications, retailerFilter, statusFilter, typeFilter, startDate, endDate, searchQuery]);

  // Summary counts
  const totalCnt = applications.length;
  const pendingCnt = applications.filter(a => (a.status || 'Submitted').toLowerCase() === 'submitted').length;
  const inProgressCnt = applications.filter(a => (a.status || '').toLowerCase() === 'in progress').length;
  const completedCnt = applications.filter(a => (a.status || '').toLowerCase() === 'completed' || (a.status || '').toLowerCase() === 'approved').length;
  const rejectedCnt = applications.filter(a => (a.status || '').toLowerCase() === 'rejected').length;

  // Pagination logic
  const totalPages = Math.ceil(filteredApps.length / pageSize) || 1;
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedApps = filteredApps.slice(startIndex, startIndex + pageSize);

  // Handle open status modal
  const handleOpenStatusModal = (app) => {
    setStatusModalApp(app);
    setNewStatus(app.status || 'Submitted');
    setAdminRemarks(app.adminRemarks || '');
    setReceiptFileUrl(app.receiptUrl || '');
    setReceiptFileName('');
    setShouldRefund(true);
  };

  // Handle file upload for receipt in status modal
  const handleReceiptFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      Swal.fire('File Too Large', 'Please upload a receipt file under 5MB.', 'warning');
      return;
    }
    setReceiptFileName(file.name);
    const reader = new FileReader();
    reader.onload = (uploadEvent) => {
      setReceiptFileUrl(uploadEvent.target.result);
    };
    reader.readAsDataURL(file);
  };

  // Submit status update
  const handleSubmitStatus = async (e) => {
    e.preventDefault();
    if (!statusModalApp) return;

    setSavingStatus(true);
    try {
      const res = await fetch(`${API_URL}/api/offline-work/status/${statusModalApp._id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: newStatus,
          adminRemarks: adminRemarks.trim(),
          receiptUrl: receiptFileUrl,
          refund: newStatus === 'Rejected' && shouldRefund
        })
      });

      const data = await res.json();
      if (data.success) {
        Toast.fire({ icon: 'success', title: 'Status updated successfully' });
        setStatusModalApp(null);
        fetchSubmissions();
      } else {
        Swal.fire('Error', data.message || 'Failed to update status', 'error');
      }
    } catch (err) {
      console.error('Error updating status:', err);
      Swal.fire('Error', 'Network or server error while updating status', 'error');
    } finally {
      setSavingStatus(false);
    }
  };

  // Delete submission
  const handleDeleteSubmission = async (app) => {
    const result = await Swal.fire({
      title: 'Delete Application?',
      text: `Are you sure you want to permanently delete application ${app.ackNumber}? This action cannot be undone.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Yes, Delete'
    });

    if (result.isConfirmed) {
      try {
        const res = await fetch(`${API_URL}/api/offline-work/application/${app._id}`, {
          method: 'DELETE'
        });
        const data = await res.json();
        if (data.success) {
          Toast.fire({ icon: 'success', title: 'Application deleted' });
          fetchSubmissions();
        } else {
          Swal.fire('Error', data.message || 'Failed to delete application', 'error');
        }
      } catch (err) {
        console.error('Error deleting application:', err);
        Swal.fire('Error', 'Failed to delete application', 'error');
      }
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header & Metrics Bar */}
      <div className="admin-card" style={{ background: '#fff', borderRadius: '14px', padding: '18px 24px', border: '1px solid #e2e8f0', boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: '#fef3c7', color: '#b45309', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px' }}>
              📁
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '19px', fontWeight: 800, color: '#0f172a' }}>
                Retailer Offline Work Submissions
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: '12.5px', color: '#64748b' }}>
                Real-time review, status tracking, dynamic documents inspection, and completion receipt delivery.
              </p>
            </div>
          </div>

          {/* Metric Badges & Refresh */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <div style={{ padding: '6px 12px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '20px', fontSize: '12px', color: '#334155' }}>
              Total: <strong>{totalCnt}</strong>
            </div>
            <div style={{ padding: '6px 12px', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '20px', fontSize: '12px', color: '#92400e' }}>
              Submitted: <strong>{pendingCnt}</strong>
            </div>
            <div style={{ padding: '6px 12px', background: '#e0f2fe', border: '1px solid #bae6fd', borderRadius: '20px', fontSize: '12px', color: '#0369a1' }}>
              In Progress: <strong>{inProgressCnt}</strong>
            </div>
            <div style={{ padding: '6px 12px', background: '#dcfce7', border: '1px solid #86efac', borderRadius: '20px', fontSize: '12px', color: '#166534' }}>
              Completed: <strong>{completedCnt}</strong>
            </div>
            <div style={{ padding: '6px 12px', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '20px', fontSize: '12px', color: '#991b1b' }}>
              Rejected: <strong>{rejectedCnt}</strong>
            </div>

            <button
              onClick={fetchSubmissions}
              style={{
                padding: '7px 14px',
                background: '#ea580c',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 'bold',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 2px 6px rgba(234,88,12,0.2)'
              }}
            >
              🔄 Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Filter Card */}
      <div className="admin-card" style={{ background: '#fff', borderRadius: '14px', padding: '18px 24px', border: '1px solid #e2e8f0', boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
        <div
          onClick={() => setShowFilters(v => !v)}
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}
        >
          <div style={{ fontWeight: 800, fontSize: '14px', color: '#334155', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🔍</span> SEARCH &amp; FILTERS
          </div>
          <span style={{ fontSize: '13px', color: '#64748b' }}>{showFilters ? '▲ Hide' : '▼ Show'}</span>
        </div>

        {showFilters && (
          <div style={{ marginTop: '16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#475569', marginBottom: '5px' }}>
                  Retailer User ID
                </label>
                <select
                  value={retailerFilter}
                  onChange={(e) => { setRetailerFilter(e.target.value); setPage(1); }}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '7px', border: '1px solid #cbd5e1', fontSize: '12.5px' }}
                >
                  <option value="All">All Retailers ({retailerOptions.length})</option>
                  {retailerOptions.map(rId => (
                    <option key={rId} value={rId}>{rId}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#475569', marginBottom: '5px' }}>
                  Service / Tab
                </label>
                <select
                  value={typeFilter}
                  onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '7px', border: '1px solid #cbd5e1', fontSize: '12.5px' }}
                >
                  <option value="All">All Services ({serviceTypeOptions.length})</option>
                  {serviceTypeOptions.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#475569', marginBottom: '5px' }}>
                  Status
                </label>
                <select
                  value={statusFilter}
                  onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '7px', border: '1px solid #cbd5e1', fontSize: '12.5px' }}
                >
                  <option value="All">All Statuses</option>
                  <option value="Submitted">Submitted</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Approved">Approved</option>
                  <option value="Completed">Completed</option>
                  <option value="Rejected">Rejected</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#475569', marginBottom: '5px' }}>
                  Start Date
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: '7px', border: '1px solid #cbd5e1', fontSize: '12.5px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#475569', marginBottom: '5px' }}>
                  End Date
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: '7px', border: '1px solid #cbd5e1', fontSize: '12.5px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#475569', marginBottom: '5px' }}>
                  Search Query
                </label>
                <input
                  type="text"
                  placeholder="Ack No, Name, Mobile..."
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: '7px', border: '1px solid #cbd5e1', fontSize: '12.5px' }}
                />
              </div>
            </div>

            <div style={{ marginTop: '14px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => {
                  const todayStr = new Date().toISOString().split('T')[0];
                  setStartDate(todayStr);
                  setEndDate(todayStr);
                  setPage(1);
                }}
                style={{
                  padding: '6px 14px',
                  background: '#f1f5f9',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#334155',
                  cursor: 'pointer'
                }}
              >
                📅 Today's Submissions
              </button>

              <button
                type="button"
                onClick={() => {
                  setRetailerFilter('All');
                  setStatusFilter('All');
                  setTypeFilter('All');
                  setStartDate('');
                  setEndDate('');
                  setSearchQuery('');
                  setPage(1);
                }}
                style={{
                  padding: '6px 14px',
                  background: '#f8fafc',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#64748b',
                  cursor: 'pointer'
                }}
              >
                Reset All Filters
              </button>

              <span style={{ fontSize: '12px', color: '#64748b', marginLeft: 'auto' }}>
                Showing <strong>{filteredApps.length}</strong> matching records
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Submissions Table */}
      <div className="admin-card" style={{ background: '#fff', borderRadius: '14px', padding: '20px 24px', border: '1px solid #e2e8f0', boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
            <span style={{ fontSize: '24px', display: 'block', marginBottom: '8px' }}>⏳</span>
            Loading offline applications...
          </div>
        ) : filteredApps.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: '13.5px' }}>
            No offline work applications found matching the selected filters.
          </div>
        ) : (
          <div>
            <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '10px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', color: '#334155', borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
                    <th style={{ padding: '11px 12px', fontWeight: 700 }}>Ack Number</th>
                    <th style={{ padding: '11px 12px', fontWeight: 700 }}>Retailer</th>
                    <th style={{ padding: '11px 12px', fontWeight: 700 }}>Service Type</th>
                    <th style={{ padding: '11px 12px', fontWeight: 700 }}>Applicant Info</th>
                    <th style={{ padding: '11px 12px', fontWeight: 700 }}>Date &amp; Fee</th>
                    <th style={{ padding: '11px 12px', fontWeight: 700, textAlign: 'center' }}>Status</th>
                    <th style={{ padding: '11px 12px', fontWeight: 700, textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedApps.map(app => {
                    const st = app.status || 'Submitted';
                    let stBg = '#fef9c3', stFg = '#854d0e';
                    if (st === 'Approved' || st === 'Completed') { stBg = '#dcfce7'; stFg = '#166534'; }
                    else if (st === 'Rejected') { stBg = '#fee2e2'; stFg = '#991b1b'; }
                    else if (st === 'In Progress') { stBg = '#e0f2fe'; stFg = '#0369a1'; }

                    return (
                      <tr
                        key={app._id}
                        style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.15s ease' }}
                        onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                      >
                        <td style={{ padding: '10px 12px', fontWeight: 700, fontFamily: 'monospace', color: '#0f172a' }}>
                          <div>{app.ackNumber}</div>
                          {app.receiptUrl && (
                            <span style={{ fontSize: '10px', background: '#dcfce7', color: '#166534', padding: '1px 6px', borderRadius: '4px', fontWeight: 'bold' }}>
                              📄 Receipt Sent
                            </span>
                          )}
                        </td>

                        <td style={{ padding: '10px 12px' }}>
                          <span style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', padding: '2px 7px', borderRadius: '6px', fontSize: '11.5px', fontWeight: 800 }}>
                            👤 {app.userId}
                          </span>
                        </td>

                        <td style={{ padding: '10px 12px', fontWeight: 600, color: '#334155' }}>
                          {app.applicationType}
                        </td>

                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ fontWeight: 700, color: '#1e293b' }}>
                            {app.applicantName || 'N/A'}
                          </div>
                          {app.mobileNumber && (
                            <div style={{ fontSize: '11px', color: '#64748b' }}>
                              📞 {app.mobileNumber}
                            </div>
                          )}
                          {app.email && (
                            <div style={{ fontSize: '11px', color: '#64748b' }}>
                              ✉️ {app.email}
                            </div>
                          )}
                        </td>

                        <td style={{ padding: '10px 12px', fontSize: '11.5px', color: '#64748b' }}>
                          <div>{new Date(app.createdAt).toLocaleDateString()}</div>
                          <div style={{ fontWeight: 700, color: '#059669', fontSize: '12px' }}>
                            ₹{app.feeAmount || 0}
                          </div>
                        </td>

                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <span style={{ padding: '3px 9px', background: stBg, color: stFg, borderRadius: '10px', fontSize: '11px', fontWeight: 800 }}>
                            {st}
                          </span>
                          {app.adminRemarks && (
                            <div style={{ fontSize: '10.5px', color: '#64748b', fontStyle: 'italic', marginTop: '3px', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={app.adminRemarks}>
                              "{app.adminRemarks}"
                            </div>
                          )}
                        </td>

                        <td style={{ padding: '10px 12px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                            <button
                              onClick={() => setSelectedAppForDetails(app)}
                              style={{ padding: '5px 10px', background: '#0284c7', color: 'white', border: 'none', borderRadius: '6px', fontSize: '11.5px', fontWeight: 700, cursor: 'pointer' }}
                              title="View full form responses and uploaded documents"
                            >
                              👁️ Details
                            </button>

                            <button
                              onClick={() => handleOpenStatusModal(app)}
                              style={{ padding: '5px 10px', background: '#8b5cf6', color: 'white', border: 'none', borderRadius: '6px', fontSize: '11.5px', fontWeight: 700, cursor: 'pointer' }}
                              title="Update Status & send receipt"
                            >
                              ✏️ Status
                            </button>

                            {app.receiptUrl && (
                              <button
                                onClick={() => window.open(app.receiptUrl, '_blank')}
                                style={{ padding: '5px 10px', background: '#10b981', color: 'white', border: 'none', borderRadius: '6px', fontSize: '11.5px', fontWeight: 700, cursor: 'pointer' }}
                                title="Open attached receipt"
                              >
                                📄 Receipt
                              </button>
                            )}

                            <button
                              onClick={() => handleDeleteSubmission(app)}
                              style={{ padding: '5px 8px', background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: '6px', fontSize: '11.5px', cursor: 'pointer' }}
                              title="Delete submission"
                            >
                              🗑️
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination footer */}
            {totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', fontSize: '12.5px', color: '#64748b' }}>
                <div>
                  Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    disabled={currentPage <= 1}
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    style={{ padding: '5px 12px', border: '1px solid #cbd5e1', borderRadius: '5px', background: currentPage <= 1 ? '#f1f5f9' : '#fff', cursor: currentPage <= 1 ? 'not-allowed' : 'pointer' }}
                  >
                    Previous
                  </button>
                  <button
                    disabled={currentPage >= totalPages}
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    style={{ padding: '5px 12px', border: '1px solid #cbd5e1', borderRadius: '5px', background: currentPage >= totalPages ? '#f1f5f9' : '#fff', cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer' }}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* FULL DETAILS MODAL */}
      {selectedAppForDetails && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '850px', maxHeight: '90vh', overflowY: 'auto', padding: '24px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #f1f5f9', paddingBottom: '14px', marginBottom: '18px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>
                  Application Details: <span style={{ fontFamily: 'monospace', color: '#ea580c' }}>{selectedAppForDetails.ackNumber}</span>
                </h3>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                  {selectedAppForDetails.applicationType} • Submitted on {new Date(selectedAppForDetails.createdAt).toLocaleString()}
                </div>
              </div>
              <button
                onClick={() => setSelectedAppForDetails(null)}
                style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: '32px', height: '32px', fontSize: '16px', cursor: 'pointer', fontWeight: 'bold', color: '#64748b' }}
              >
                ✕
              </button>
            </div>

            {/* Top Info Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '20px', background: '#f8fafc', padding: '14px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
              <div>
                <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>Retailer User ID</div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#1d4ed8' }}>{selectedAppForDetails.userId}</div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>Fee Amount Paid</div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#059669' }}>₹{selectedAppForDetails.feeAmount || 0}</div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>Current Status</div>
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#ea580c' }}>{selectedAppForDetails.status || 'Submitted'}</div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>Applicant Name</div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>{selectedAppForDetails.applicantName || 'N/A'}</div>
              </div>
            </div>

            {/* Dynamic Form Responses */}
            <div style={{ marginBottom: '20px' }}>
              <h4 style={{ margin: '0 0 10px', fontSize: '14px', fontWeight: 700, color: '#334155' }}>
                📋 Form Field Responses
              </h4>
              {selectedAppForDetails.details && Object.keys(selectedAppForDetails.details).length > 0 ? (
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                    <tbody>
                      {Object.entries(selectedAppForDetails.details).map(([key, val], idx) => {
                        const isDoc = typeof val === 'string' && (val.startsWith('http') || val.startsWith('data:image') || val.startsWith('data:application'));
                        return (
                          <tr key={key} style={{ background: idx % 2 === 0 ? '#fff' : '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                            <td style={{ padding: '8px 12px', fontWeight: 600, color: '#475569', width: '35%', textTransform: 'capitalize' }}>
                              {key.replace(/([A-Z])/g, ' $1')}
                            </td>
                            <td style={{ padding: '8px 12px', color: '#0f172a' }}>
                              {isDoc ? (
                                <a href={val} target="_blank" rel="noreferrer" style={{ color: '#2563eb', fontWeight: 600, textDecoration: 'underline' }}>
                                  📎 View / Download Document
                                </a>
                              ) : (
                                String(val || '—')
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ fontSize: '12px', color: '#94a3b8' }}>No extra fields submitted.</div>
              )}
            </div>

            {/* Uploaded Documents Preview */}
            {selectedAppForDetails.documents && selectedAppForDetails.documents.length > 0 && (
              <div style={{ marginBottom: '20px' }}>
                <h4 style={{ margin: '0 0 10px', fontSize: '14px', fontWeight: 700, color: '#334155' }}>
                  📁 Uploaded Documents &amp; Proofs
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>
                  {selectedAppForDetails.documents.map((doc, idx) => (
                    <div key={idx} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px', background: '#f8fafc', textAlign: 'center' }}>
                      <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#334155', marginBottom: '8px', wordBreak: 'break-word' }}>
                        {doc.fieldName || 'Document ' + (idx + 1)}
                      </div>
                      {doc.dataUrl && doc.dataUrl.startsWith('data:image') ? (
                        <img
                          src={doc.dataUrl}
                          alt={doc.fieldName}
                          style={{ maxWidth: '100%', maxHeight: '100px', objectFit: 'contain', borderRadius: '4px', marginBottom: '8px' }}
                        />
                      ) : (
                        <div style={{ fontSize: '32px', margin: '10px 0' }}>📄</div>
                      )}
                      <div>
                        <a
                          href={doc.dataUrl}
                          target="_blank"
                          rel="noreferrer"
                          style={{ display: 'inline-block', padding: '4px 10px', background: '#2563eb', color: '#fff', borderRadius: '5px', fontSize: '11px', fontWeight: 600, textDecoration: 'none' }}
                        >
                          Open Document
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Admin Remarks & Receipt */}
            {(selectedAppForDetails.adminRemarks || selectedAppForDetails.receiptUrl) && (
              <div style={{ background: '#fef3c7', padding: '14px', borderRadius: '10px', border: '1px solid #fde68a' }}>
                <div style={{ fontSize: '12px', fontWeight: 800, color: '#92400e', marginBottom: '4px' }}>
                  Admin Notes &amp; Attached Receipt
                </div>
                {selectedAppForDetails.adminRemarks && (
                  <div style={{ fontSize: '12.5px', color: '#78350f', marginBottom: '6px' }}>
                    Remarks: "{selectedAppForDetails.adminRemarks}"
                  </div>
                )}
                {selectedAppForDetails.receiptUrl && (
                  <a href={selectedAppForDetails.receiptUrl} target="_blank" rel="noreferrer" style={{ color: '#047857', fontWeight: 700, fontSize: '12px', textDecoration: 'underline' }}>
                    📄 View Sent Completion Receipt
                  </a>
                )}
              </div>
            )}

            <div style={{ marginTop: '20px', textAlign: 'right' }}>
              <button
                onClick={() => setSelectedAppForDetails(null)}
                style={{ padding: '8px 18px', background: '#64748b', color: '#fff', border: 'none', borderRadius: '7px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* UPDATE STATUS MODAL */}
      {statusModalApp && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '520px', padding: '24px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#0f172a' }}>
                  Update Application Status
                </h3>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                  Ack No: <strong style={{ color: '#ea580c' }}>{statusModalApp.ackNumber}</strong> ({statusModalApp.applicantName})
                </div>
              </div>
              <button
                onClick={() => setStatusModalApp(null)}
                style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: '30px', height: '30px', fontSize: '15px', cursor: 'pointer', fontWeight: 'bold', color: '#64748b' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitStatus}>
              {/* Status Select */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Select New Status *
                </label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', fontWeight: 600 }}
                  required
                >
                  <option value="Submitted">Submitted (Pending Review)</option>
                  <option value="In Progress">In Progress (Processing at department)</option>
                  <option value="Approved">Approved (Ready / Generating Certificate)</option>
                  <option value="Completed">Completed (Final Delivery Done)</option>
                  <option value="Rejected">Rejected</option>
                </select>
              </div>

              {/* Admin Remarks */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Admin Remarks / Message to Retailer
                </label>
                <textarea
                  rows={3}
                  value={adminRemarks}
                  onChange={(e) => setAdminRemarks(e.target.value)}
                  placeholder="e.g. Document verified, certificate will be issued within 48 hours..."
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12.5px', resize: 'vertical' }}
                />
              </div>

              {/* Upload Receipt / Document */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Attach Completion Certificate / Receipt (PDF or Image)
                </label>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={handleReceiptFileUpload}
                  style={{ width: '100%', fontSize: '12px' }}
                />
                {receiptFileName && (
                  <div style={{ fontSize: '11px', color: '#059669', marginTop: '4px' }}>
                    Selected: {receiptFileName}
                  </div>
                )}
                {receiptFileUrl && !receiptFileName && (
                  <div style={{ fontSize: '11px', color: '#2563eb', marginTop: '4px' }}>
                    <a href={receiptFileUrl} target="_blank" rel="noreferrer">
                      View current attached receipt
                    </a>
                  </div>
                )}
              </div>

              {/* Refund Checkbox on Rejection */}
              {newStatus === 'Rejected' && (
                <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', padding: '12px', borderRadius: '8px', marginBottom: '16px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', color: '#991b1b', fontWeight: 700, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={shouldRefund}
                      onChange={(e) => setShouldRefund(e.target.checked)}
                    />
                    Refund application fee (₹{statusModalApp.feeAmount || 0}) to Retailer's wallet
                  </label>
                  <div style={{ fontSize: '11px', color: '#7f1d1d', marginTop: '4px', marginLeft: '24px' }}>
                    The fee will be immediately credited back to user {statusModalApp.userId} with a ledger entry.
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
                <button
                  type="button"
                  onClick={() => setStatusModalApp(null)}
                  disabled={savingStatus}
                  style={{ padding: '8px 16px', background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', borderRadius: '7px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingStatus}
                  style={{ padding: '8px 20px', background: '#ea580c', color: '#fff', border: 'none', borderRadius: '7px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
                >
                  {savingStatus ? 'Saving...' : 'Update Status'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default OfflineSubmissionsManager;
