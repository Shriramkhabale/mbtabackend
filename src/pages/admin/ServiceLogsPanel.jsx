import React, { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../../utils/apiClient';
import './ServiceLogsPanel.css';

const SERVICE_LOGS = {
  pan: {
    title: 'PAN Card Service Logs',
    description: 'PAN Card applications submitted by retailers.',
    endpoint: '/api/pancard/all',
    icon: '📇',
    serviceBadge: 'PAN Services',
  },
  offline: {
    title: 'Offline Work Service Logs',
    description: 'Offline work applications submitted by retailers.',
    endpoint: '/api/offline-work/all',
    icon: '📁',
    serviceBadge: 'Offline Work',
  },
  quickLinks: {
    title: 'Quick Links Service Logs',
    description: 'Quick-link visits with a wallet fee transaction.',
    endpoint: '/api/quick-links/logs',
    icon: '🔗',
    serviceBadge: 'Quick Links',
  },
};

const getRows = (service, record) => ({
  date: record.createdAt ? new Date(record.createdAt).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  }) : '-',
  rawDate: record.createdAt || '',
  retailer: record.userId || '-',
  service: record.applicationType || record.tabId || record.menuKey || 'Quick Link',
  details: service === 'quickLinks'
    ? (record.description || '-')
    : (record.applicantName || '-'),
  reference: record.ackNumber || record.referenceNumber || '-',
  amount: Number(record.feeAmount ?? record.amount) || 0,
  status: record.status || 'Success',
});

const getInitials = (text) => {
  if (!text || text === '-') return 'NA';
  const parts = String(text).trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const ServiceLogsPanel = ({ service }) => {
  const config = SERVICE_LOGS[service] || {
    title: 'Service Logs',
    description: 'Service logs and transaction records.',
    endpoint: '/api/offline-work/all',
    icon: '📜',
    serviceBadge: 'Logs'
  };

  const [records, setRecords] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [copiedRef, setCopiedRef] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    const loadLogs = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await apiFetch(config.endpoint, { signal: controller.signal });
        if (!response.ok) {
          throw new Error(`Unable to load logs (${response.status})`);
        }
        const data = await response.json();
        const entries = Array.isArray(data) ? data : data.applications;
        if (!Array.isArray(entries)) {
          throw new Error('The server returned an invalid log response.');
        }
        setRecords(entries);
      } catch (loadError) {
        if (loadError.name !== 'AbortError') {
          console.error(`Failed to load ${service} service logs:`, loadError);
          setError(loadError.message || 'Unable to load service logs.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    loadLogs();
    return () => controller.abort();
  }, [config.endpoint, refreshKey, service]);

  // Copy reference number with feedback
  const handleCopy = (refText) => {
    if (!refText || refText === '-') return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(refText).then(() => {
        setCopiedRef(refText);
        setTimeout(() => setCopiedRef(''), 2200);
      }).catch(() => {});
    }
  };

  // KPI Analytics
  const metrics = useMemo(() => {
    const total = records.length;
    let totalAmount = 0;
    let completed = 0;
    let pending = 0;

    records.forEach(r => {
      const amt = Number(r.feeAmount ?? r.amount) || 0;
      totalAmount += amt;

      const st = String(r.status || '').toLowerCase();
      if (st.includes('complete') || st.includes('success') || st.includes('approved')) {
        completed += 1;
      } else if (st.includes('submit') || st.includes('pend') || st.includes('process')) {
        pending += 1;
      }
    });

    return { total, totalAmount, completed, pending };
  }, [records]);

  // Filtered Records based on Search and Status Filter
  const filteredRecords = useMemo(() => {
    const query = search.trim().toLowerCase();
    const rows = records.map(record => ({ record, ...getRows(service, record) }));

    return rows.filter(row => {
      // Status Filter
      if (statusFilter !== 'ALL') {
        const st = (row.status || '').toLowerCase();
        if (statusFilter === 'COMPLETED' && !(st.includes('complete') || st.includes('success') || st.includes('approved'))) {
          return false;
        }
        if (statusFilter === 'PENDING' && !(st.includes('submit') || st.includes('pend') || st.includes('process'))) {
          return false;
        }
        if (statusFilter === 'REJECTED' && !(st.includes('reject') || st.includes('fail'))) {
          return false;
        }
      }

      // Search Filter
      if (!query) return true;
      return [row.date, row.retailer, row.service, row.details, row.reference, row.status, `₹${row.amount}`]
        .some(value => String(value).toLowerCase().includes(query));
    });
  }, [records, search, statusFilter, service]);

  const exportCsv = () => {
    const headers = ['Date & Time', 'Retailer ID', 'Service', 'Details', 'Reference', 'Amount', 'Status'];
    const quote = value => `"${String(value).replace(/"/g, '""')}"`;
    const lines = [
      headers.map(quote).join(','),
      ...filteredRecords.map(row => [
        row.date, row.retailer, row.service, row.details, row.reference, row.amount.toFixed(2), row.status
      ].map(quote).join(','))
    ];
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    link.download = `${service}_service_logs_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const getStatusClass = (status) => {
    const s = String(status || '').toLowerCase();
    if (s.includes('complete') || s.includes('success') || s.includes('approved')) return 'sl-status-completed';
    if (s.includes('submit') || s.includes('processing')) return 'sl-status-submitted';
    if (s.includes('pend')) return 'sl-status-pending';
    if (s.includes('reject') || s.includes('fail')) return 'sl-status-rejected';
    return 'sl-status-submitted';
  };

  return (
    <div className="sl-container">
      {/* Top Header Card */}
      <section className="sl-header-card">
        <div className="sl-header-left">
          <div className="sl-header-icon-box">
            <span>{config.icon}</span>
          </div>
          <div className="sl-header-info">
            <h2>
              {config.title}
              <span className="sl-badge-pill">{config.serviceBadge}</span>
            </h2>
            <p>{config.description}</p>
          </div>
        </div>

        <div className="sl-header-actions">
          <button
            type="button"
            className="sl-btn sl-btn-secondary"
            onClick={() => setRefreshKey(value => value + 1)}
            disabled={loading}
            title="Refresh logs from server"
          >
            <svg
              className={loading ? 'sl-icon-spin' : ''}
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="23 4 23 10 17 10"></polyline>
              <polyline points="1 20 1 14 7 14"></polyline>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
            </svg>
            <span>{loading ? 'Refreshing...' : 'Refresh'}</span>
          </button>

          <button
            type="button"
            className="sl-btn sl-btn-success"
            onClick={exportCsv}
            disabled={loading || filteredRecords.length === 0}
            title="Export current logs as CSV file"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            <span>Export CSV</span>
          </button>
        </div>
      </section>

      {/* KPI Metric Summary Cards */}
      <div className="sl-kpi-grid">
        {/* Metric 1: Total Records */}
        <div className="sl-kpi-card">
          <div className="sl-kpi-top">
            <span className="sl-kpi-label">Total Logs</span>
            <div className="sl-kpi-icon-pill sl-kpi-icon-blue">
              <span>📋</span>
            </div>
          </div>
          <div className="sl-kpi-value">{metrics.total.toLocaleString()}</div>
          <div className="sl-kpi-footer">
            <span>All recorded submissions</span>
          </div>
        </div>

        {/* Metric 2: Total Revenue */}
        <div className="sl-kpi-card">
          <div className="sl-kpi-top">
            <span className="sl-kpi-label">Total Fees</span>
            <div className="sl-kpi-icon-pill sl-kpi-icon-green">
              <span>₹</span>
            </div>
          </div>
          <div className="sl-kpi-value" style={{ color: '#047857' }}>
            ₹{metrics.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="sl-kpi-footer">
            <span>Collected wallet fees</span>
          </div>
        </div>

        {/* Metric 3: Completed / Approved */}
        <div className="sl-kpi-card">
          <div className="sl-kpi-top">
            <span className="sl-kpi-label">Completed</span>
            <div className="sl-kpi-icon-pill sl-kpi-icon-green">
              <span>✓</span>
            </div>
          </div>
          <div className="sl-kpi-value" style={{ color: '#059669' }}>
            {metrics.completed.toLocaleString()}
          </div>
          <div className="sl-kpi-footer">
            <span>Successfully processed</span>
          </div>
        </div>

        {/* Metric 4: Submitted / In Review */}
        <div className="sl-kpi-card">
          <div className="sl-kpi-top">
            <span className="sl-kpi-label">Pending / In-Review</span>
            <div className="sl-kpi-icon-pill sl-kpi-icon-amber">
              <span>⏳</span>
            </div>
          </div>
          <div className="sl-kpi-value" style={{ color: '#d97706' }}>
            {metrics.pending.toLocaleString()}
          </div>
          <div className="sl-kpi-footer">
            <span>Awaiting processing</span>
          </div>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <section className="sl-toolbar-card">
        <div className="sl-search-box">
          <div className="sl-search-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
          </div>
          <input
            type="text"
            className="sl-search-input"
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Search by retailer, applicant, ack number, service..."
            aria-label="Search service logs"
          />
          {search && (
            <button
              type="button"
              className="sl-search-clear"
              onClick={() => setSearch('')}
              title="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div className="sl-filter-group">
          <button
            type="button"
            className={`sl-filter-pill ${statusFilter === 'ALL' ? 'active' : ''}`}
            onClick={() => setStatusFilter('ALL')}
          >
            <span>All Logs</span>
            <span className="sl-filter-count">{records.length}</span>
          </button>
          <button
            type="button"
            className={`sl-filter-pill ${statusFilter === 'COMPLETED' ? 'active' : ''}`}
            onClick={() => setStatusFilter('COMPLETED')}
          >
            <span>Completed</span>
            <span className="sl-filter-count">{metrics.completed}</span>
          </button>
          <button
            type="button"
            className={`sl-filter-pill ${statusFilter === 'PENDING' ? 'active' : ''}`}
            onClick={() => setStatusFilter('PENDING')}
          >
            <span>Pending</span>
            <span className="sl-filter-count">{metrics.pending}</span>
          </button>
        </div>
      </section>

      {/* Error Alert */}
      {error && (
        <div
          role="alert"
          style={{
            background: '#fef2f2',
            border: '1.5px solid #fecaca',
            color: '#991b1b',
            borderRadius: '12px',
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontWeight: 600,
            fontSize: '13.5px'
          }}
        >
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* Data Table Card */}
      <section className="sl-table-card">
        {loading ? (
          <div className="sl-state-box">
            <div className="sl-spinner"></div>
            <p className="sl-state-title">Loading service records...</p>
            <p className="sl-state-desc">Fetching real-time submission logs from the database.</p>
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="sl-state-box">
            <div className="sl-state-icon">
              <span>🔍</span>
            </div>
            <p className="sl-state-title">
              {records.length === 0 ? 'No service logs found' : 'No records match your filter'}
            </p>
            <p className="sl-state-desc">
              {records.length === 0
                ? 'No transactions or submissions have been recorded for this service category yet.'
                : 'Try adjusting your search query or switching the status filter tab.'}
            </p>
            {(search || statusFilter !== 'ALL') && (
              <button
                type="button"
                className="sl-btn sl-btn-secondary"
                style={{ marginTop: '6px' }}
                onClick={() => {
                  setSearch('');
                  setStatusFilter('ALL');
                }}
              >
                Reset All Filters
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="sl-table-container">
              <table className="sl-table">
                <thead>
                  <tr>
                    <th>Date & Time</th>
                    <th>Retailer ID</th>
                    <th>Service Category</th>
                    <th>Applicant / Details</th>
                    <th>Ack / Reference No</th>
                    <th>Fee Amount</th>
                    <th>Current Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRecords.map(({ record, ...row }) => {
                    const isCopied = copiedRef === row.reference;
                    return (
                      <tr key={record._id || `${row.reference}-${row.date}`}>
                        {/* Date & Time */}
                        <td className="sl-cell-date">
                          <div className="sl-date-main">{row.date.split(',')[0]}</div>
                          <div className="sl-date-time">{row.date.split(',')[1] || ''}</div>
                        </td>

                        {/* Retailer ID */}
                        <td>
                          <span className="sl-code-badge">
                            <span>🏪</span>
                            <span>{row.retailer}</span>
                          </span>
                        </td>

                        {/* Service Category */}
                        <td>
                          <span className="sl-service-badge">
                            <span>📁</span>
                            <span>{row.service}</span>
                          </span>
                        </td>

                        {/* Applicant Name / Details */}
                        <td>
                          <div className="sl-user-cell">
                            <div className="sl-avatar">
                              {getInitials(row.details)}
                            </div>
                            <div className="sl-details-name">
                              {row.details}
                            </div>
                          </div>
                        </td>

                        {/* Reference / Ack Number with Copy */}
                        <td>
                          <div className="sl-code-badge" style={{ background: '#f8fafc' }}>
                            <span>{row.reference}</span>
                            {row.reference !== '-' && (
                              <button
                                type="button"
                                className="sl-copy-btn"
                                onClick={() => handleCopy(row.reference)}
                                title={isCopied ? 'Copied to clipboard!' : 'Copy reference number'}
                              >
                                {isCopied ? (
                                  <span style={{ color: '#059669', fontSize: '11px', fontWeight: 800 }}>✓ Copied</span>
                                ) : (
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                                  </svg>
                                )}
                              </button>
                            )}
                          </div>
                        </td>

                        {/* Fee Amount */}
                        <td>
                          <span className={`sl-amount-badge ${row.amount > 0 ? 'has-fee' : ''}`}>
                            ₹{row.amount.toFixed(2)}
                          </span>
                        </td>

                        {/* Status Badge */}
                        <td>
                          <span className={`sl-status-pill ${getStatusClass(row.status)}`}>
                            <span className="sl-status-dot"></span>
                            <span>{row.status}</span>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Table Footer with Summary Count */}
            <div className="sl-table-footer">
              <div>
                Showing <strong>{filteredRecords.length}</strong> of <strong>{records.length}</strong> records
                {search && <span> matching "<strong>{search}</strong>"</span>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                  Auto-synced with live database
                </span>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
};

export default ServiceLogsPanel;
