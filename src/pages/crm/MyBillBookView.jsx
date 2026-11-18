import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Swal from 'sweetalert2';
import { API_URL, apiFetch } from '../../utils/apiClient';
import { hasUserAccess, getStoredUserPermissions } from '../../utils/userPermissions';
import './MyBillBookView.css';

const MONTHS_LIST = [
  { value: 'ALL', label: 'All Months' },
  { value: '1', label: 'January' },
  { value: '2', label: 'February' },
  { value: '3', label: 'March' },
  { value: '4', label: 'April' },
  { value: '5', label: 'May' },
  { value: '6', label: 'June' },
  { value: '7', label: 'July' },
  { value: '8', label: 'August' },
  { value: '9', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' }
];

export default function MyBillBookView({ user, onBack, userPermissions }) {
  const effectivePermissions = useMemo(() => {
    return userPermissions || getStoredUserPermissions();
  }, [userPermissions]);

  const canViewLedger = useMemo(() => {
    return hasUserAccess(effectivePermissions, 'crm.billbook.view') || hasUserAccess(effectivePermissions, 'crm.billbook.access');
  }, [effectivePermissions]);

  // Navigation sub-tab
  const [activeTab, setActiveTab] = useState('transactions'); // 'transactions' | 'profit_loss' | 'customers' | 'bills' | 'monthly'

  // Resolve canonical Retailer ID
  const activeRetailerId = useMemo(() => {
    if (typeof user === 'string' && user.trim() && user.trim().toLowerCase() !== 'user' && user.trim().toLowerCase() !== 'admin') {
      return user.trim();
    }
    if (user && typeof user === 'object') {
      const id = user.userId || user.retailerId || user.userUid || user.customId;
      if (id && String(id).trim() && String(id).trim().toLowerCase() !== 'user') return String(id).trim();
      if (user.username && user.username !== 'user') return user.username;
    }
    const current = localStorage.getItem('currentUser');
    if (current && current.trim() && current.trim().toLowerCase() !== 'user' && current.trim().toLowerCase() !== 'admin') {
      return current.trim();
    }
    try {
      const stored = JSON.parse(localStorage.getItem('user') || '{}');
      const id = stored.userId || stored.retailerId || stored.userUid || stored.customId;
      if (id && String(id).trim() && String(id).trim().toLowerCase() !== 'user') return String(id).trim();
    } catch (_) {}
    return 'MBTAR000010101';
  }, [user]);

  // Financial Transactions State (16 Required Columns)
  const [financialTransactions, setFinancialTransactions] = useState([]);
  const [financialLedger, setFinancialLedger] = useState({
    totalCashReceived: 0,
    totalAmountDebited: 0,
    totalAmountCredited: 0,
    totalCommission: 0,
    netAmountTotal: 0,
    cashBalanceChange: 0,
    bankBalanceChange: 0
  });
  const [financialSearch, setFinancialSearch] = useState('');
  const [financialStatus, setFinancialStatus] = useState('ALL');
  const [financialStartDate, setFinancialStartDate] = useState('');
  const [financialEndDate, setFinancialEndDate] = useState('');
  const [loadingFinancial, setLoadingFinancial] = useState(true);
  const [selectedTxnModal, setSelectedTxnModal] = useState(null);

  // Profit & Loss State (Pie Chart, Day/Month Wise)
  const [profitLossData, setProfitLossData] = useState(null);
  const [plMode, setPlMode] = useState('day'); // 'day' | 'month'
  const [plDate, setPlDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [plYear, setPlYear] = useState(() => new Date().getFullYear());
  const [plMonth, setPlMonth] = useState(() => new Date().getMonth() + 1);
  const [loadingPL, setLoadingPL] = useState(false);

  // Summary State
  const [summary, setSummary] = useState({
    totalRevenue: 0,
    thisMonthRevenue: 0,
    thisMonthBills: 0,
    totalCustomers: 0,
    totalBills: 0,
    currentMonthName: 'Current Month',
    currentYear: new Date().getFullYear()
  });
  const [monthlyAnalysis, setMonthlyAnalysis] = useState([]);
  const [loadingSummary, setLoadingSummary] = useState(true);

  // Customer-wise State
  const [customers, setCustomers] = useState([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [loadingCustomers, setLoadingCustomers] = useState(true);

  // All Bills State
  const [bills, setBills] = useState([]);
  const [billSearch, setBillSearch] = useState('');
  const [filterYear, setFilterYear] = useState('ALL');
  const [filterMonth, setFilterMonth] = useState('ALL');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [loadingBills, setLoadingBills] = useState(true);

  // Customer Revenue Details Modal
  const [selectedCustomerUid, setSelectedCustomerUid] = useState(null);
  const [customerDetail, setCustomerDetail] = useState(null);
  const [customerDetailBills, setCustomerDetailBills] = useState([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // PDF Preview Modal
  const [previewPdfUrl, setPreviewPdfUrl] = useState(null);
  const [previewBillNumber, setPreviewBillNumber] = useState('');

  // 1. Fetch Summary & Monthly Trend
  const fetchSummary = useCallback(async () => {
    try {
      setLoadingSummary(true);
      const res = await apiFetch('/api/crm/billbook/summary');
      const data = await res.json();
      if (data.success) {
        setSummary(data.summary || {});
        setMonthlyAnalysis(data.monthlyAnalysis || []);
      }
    } catch (err) {
      console.error('Error fetching billbook summary:', err);
    } finally {
      setLoadingSummary(false);
    }
  }, []);

  // 2. Fetch Customer-wise Revenue
  const fetchCustomers = useCallback(async () => {
    try {
      setLoadingCustomers(true);
      const query = new URLSearchParams();
      if (customerSearch.trim()) query.append('search', customerSearch.trim());

      const res = await apiFetch(`/api/crm/billbook/customers?${query.toString()}`);
      const data = await res.json();
      if (data.success) {
        setCustomers(data.customers || []);
      }
    } catch (err) {
      console.error('Error fetching customer revenue:', err);
    } finally {
      setLoadingCustomers(false);
    }
  }, [customerSearch]);

  // 3. Fetch All Bills
  const fetchBills = useCallback(async () => {
    try {
      setLoadingBills(true);
      const query = new URLSearchParams();
      if (billSearch.trim()) query.append('search', billSearch.trim());
      if (filterYear !== 'ALL') query.append('year', filterYear);
      if (filterMonth !== 'ALL') query.append('month', filterMonth);
      if (filterStartDate) query.append('startDate', filterStartDate);
      if (filterEndDate) query.append('endDate', filterEndDate);

      const res = await apiFetch(`/api/crm/billbook/bills?${query.toString()}`);
      const data = await res.json();
      if (data.success) {
        setBills(data.bills || []);
      }
    } catch (err) {
      console.error('Error fetching bills:', err);
    } finally {
      setLoadingBills(false);
    }
  }, [billSearch, filterYear, filterMonth, filterStartDate, filterEndDate]);

  // 4. Fetch Financial Transactions (16 Required Columns)
  const fetchFinancialTransactions = useCallback(async () => {
    try {
      setLoadingFinancial(true);
      const params = new URLSearchParams({ retailerId: activeRetailerId });
      if (financialStatus !== 'ALL') params.append('status', financialStatus);
      if (financialSearch.trim()) params.append('search', financialSearch.trim());
      if (financialStartDate) params.append('startDate', financialStartDate);
      if (financialEndDate) params.append('endDate', financialEndDate);

      const res = await apiFetch(`/api/crm/billbook/transactions?${params.toString()}`, {
        headers: {
          'x-retailer-id': activeRetailerId,
          'x-user-id': activeRetailerId
        }
      });
      const data = await res.json();
      if (data.success) {
        setFinancialTransactions(data.records || []);
        if (data.ledger) setFinancialLedger(data.ledger);
      }
    } catch (err) {
      console.error('Error fetching financial transactions:', err);
    } finally {
      setLoadingFinancial(false);
    }
  }, [activeRetailerId, financialStatus, financialSearch, financialStartDate, financialEndDate]);

  // 5. Fetch Profit & Loss Data (Day-Wise & Month-Wise)
  const fetchProfitLoss = useCallback(async () => {
    try {
      setLoadingPL(true);
      const params = new URLSearchParams({
        retailerId: activeRetailerId,
        mode: plMode,
        date: plDate,
        year: String(plYear),
        month: String(plMonth)
      });

      const res = await apiFetch(`/api/crm/billbook/profit-loss?${params.toString()}`, {
        headers: {
          'x-retailer-id': activeRetailerId,
          'x-user-id': activeRetailerId
        }
      });
      const data = await res.json();
      if (data.success) {
        setProfitLossData(data);
      }
    } catch (err) {
      console.error('Error fetching profit & loss:', err);
    } finally {
      setLoadingPL(false);
    }
  }, [activeRetailerId, plMode, plDate, plYear, plMonth]);

  // Initial Load
  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  useEffect(() => {
    fetchBills();
  }, [fetchBills]);

  useEffect(() => {
    fetchFinancialTransactions();
  }, [fetchFinancialTransactions]);

  useEffect(() => {
    fetchProfitLoss();
  }, [fetchProfitLoss]);

  // Refresh All Data
  const handleRefreshAll = async () => {
    await Promise.all([
      fetchSummary(),
      fetchCustomers(),
      fetchBills(),
      fetchFinancialTransactions(),
      fetchProfitLoss()
    ]);
    Swal.fire({
      toast: true,
      position: 'top-end',
      icon: 'success',
      title: 'Revenue & transaction records refreshed',
      showConfirmButton: false,
      timer: 1200
    });
  };

  // Open Customer Detail Modal
  const handleOpenCustomerDetail = async (customerUid) => {
    setSelectedCustomerUid(customerUid);
    setLoadingDetail(true);
    try {
      const res = await apiFetch(`/api/crm/billbook/customers/${customerUid}`);
      const data = await res.json();
      if (data.success) {
        setCustomerDetail(data.customer);
        setCustomerDetailBills(data.bills || []);
      } else {
        Swal.fire({ icon: 'error', title: 'Error', text: data.message || 'Could not load details' });
      }
    } catch (err) {
      console.error('Error loading customer detail:', err);
      Swal.fire({ icon: 'error', title: 'Error', text: 'Server error loading customer revenue details.' });
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleCloseCustomerDetail = () => {
    setSelectedCustomerUid(null);
    setCustomerDetail(null);
    setCustomerDetailBills([]);
  };

  // Copy helper
  const handleCopyText = (text, label, e) => {
    if (e) e.stopPropagation();
    navigator.clipboard.writeText(text);
    Swal.fire({
      toast: true,
      position: 'top-end',
      icon: 'success',
      title: `${label} copied!`,
      showConfirmButton: false,
      timer: 1100
    });
  };

  // View PDF Bill
  const handleViewPdf = (billNumber) => {
    const url = `${API_URL}/api/crm/bills/${billNumber}/pdf`;
    setPreviewPdfUrl(url);
    setPreviewBillNumber(billNumber);
  };

  // Download PDF Bill
  const handleDownloadPdf = (billNumber, e) => {
    if (e) e.stopPropagation();
    const downloadUrl = `${API_URL}/api/crm/bills/${billNumber}/pdf?download=true`;
    const anchor = document.createElement('a');
    anchor.href = downloadUrl;
    anchor.download = `Bill_${billNumber}.pdf`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  };

  // Format INR Currency
  const formatInr = (amount) => {
    return '₹' + Number(amount || 0).toLocaleString('en-IN');
  };

  // Format Date
  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
    } catch {
      return dateStr;
    }
  };

  const formatDateTime = (dateStr) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateStr;
    }
  };

  // Available Years for filter dropdown
  const availableYears = useMemo(() => {
    const currentY = new Date().getFullYear();
    const years = new Set([currentY, currentY - 1, currentY - 2]);
    monthlyAnalysis.forEach(m => {
      if (m.year) years.add(m.year);
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [monthlyAnalysis]);

  // Filtered monthly records based on selected year/month
  const filteredMonthlyRecords = useMemo(() => {
    return monthlyAnalysis.filter(m => {
      if (filterYear !== 'ALL' && String(m.year) !== String(filterYear)) return false;
      if (filterMonth !== 'ALL' && String(m.month) !== String(filterMonth)) return false;
      return true;
    });
  }, [monthlyAnalysis, filterYear, filterMonth]);

  // Max revenue in monthly analysis for chart scaling
  const maxMonthlyRevenue = useMemo(() => {
    if (filteredMonthlyRecords.length === 0) return 1;
    return Math.max(...filteredMonthlyRecords.map(m => m.totalRevenue), 1);
  }, [filteredMonthlyRecords]);

  // Reset all filters in Bills tab
  const handleResetBillFilters = () => {
    setBillSearch('');
    setFilterYear('ALL');
    setFilterMonth('ALL');
    setFilterStartDate('');
    setFilterEndDate('');
  };

  return (
    <div className="crm-billbook-container">
      {/* 1. Header Banner */}
      <div className="crm-billbook-header-card">
        <div className="crm-billbook-header-top">
          <div className="crm-billbook-badge-row">
            <button type="button" className="crm-billbook-back-btn" onClick={onBack}>
              ← Back to CRM Suite
            </button>
            <span className="crm-billbook-tag">CRM Revenue & Billing</span>
          </div>

          <div className="crm-billbook-top-actions">
            <button
              type="button"
              className="crm-billbook-refresh-btn"
              onClick={handleRefreshAll}
              title="Refresh revenue calculations"
            >
              <span>🔄</span> Refresh Data
            </button>
          </div>
        </div>

        <div className="crm-billbook-header-intro">
          <h2>My Bill Book — Revenue & Business Ledger</h2>
          <p>
            Monitor business earnings, analyze customer-level billing records, and track monthly revenue performance from existing issued customer bills.
          </p>
        </div>

        {/* 2. Top 4 Revenue Summary Cards */}
        <div className="crm-revenue-cards-grid">
          {/* Card A: Total Revenue */}
          <div className="crm-rev-card card-emerald">
            <div className="rev-card-top">
              <span className="rev-card-badge">Lifetime</span>
              <span className="rev-card-icon">💰</span>
            </div>
            <div className="rev-card-body">
              <span className="rev-card-label">Total Revenue</span>
              <h3 className="rev-card-value">{loadingSummary ? '...' : formatInr(summary.totalRevenue)}</h3>
              <p className="rev-card-sub">Earned from all issued customer bills</p>
            </div>
          </div>

          {/* Card B: This Month's Revenue */}
          <div className="crm-rev-card card-orange">
            <div className="rev-card-top">
              <span className="rev-card-badge">{summary.currentMonthName} {summary.currentYear}</span>
              <span className="rev-card-icon">📅</span>
            </div>
            <div className="rev-card-body">
              <span className="rev-card-label">This Month's Revenue</span>
              <h3 className="rev-card-value">{loadingSummary ? '...' : formatInr(summary.thisMonthRevenue)}</h3>
              <p className="rev-card-sub">{summary.thisMonthBills} bill(s) generated this month</p>
            </div>
          </div>

          {/* Card C: Total Customers */}
          <div className="crm-rev-card card-purple">
            <div className="rev-card-top">
              <span className="rev-card-badge">Billed Clients</span>
              <span className="rev-card-icon">👥</span>
            </div>
            <div className="rev-card-body">
              <span className="rev-card-label">Total Customers</span>
              <h3 className="rev-card-value">{loadingSummary ? '...' : summary.totalCustomers}</h3>
              <p className="rev-card-sub">Unique clients with at least 1 bill</p>
            </div>
          </div>

          {/* Card D: Total Bills */}
          <div className="crm-rev-card card-blue">
            <div className="rev-card-top">
              <span className="rev-card-badge">Generated Invoices</span>
              <span className="rev-card-icon">🧾</span>
            </div>
            <div className="rev-card-body">
              <span className="rev-card-label">Total Bills</span>
              <h3 className="rev-card-value">{loadingSummary ? '...' : summary.totalBills}</h3>
              <p className="rev-card-sub">Original PDF invoices issued to date</p>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Main Navigation Tab Strip */}
      <div className="crm-billbook-tabs-strip">
        <button
          type="button"
          className={`crm-billbook-tab-btn ${activeTab === 'transactions' ? 'active' : ''}`}
          onClick={() => setActiveTab('transactions')}
        >
          <span>💸</span> Financial Transactions
          <span className="tab-count-pill">{financialTransactions.length}</span>
        </button>

        <button
          type="button"
          className={`crm-billbook-tab-btn ${activeTab === 'profit_loss' ? 'active' : ''}`}
          onClick={() => setActiveTab('profit_loss')}
        >
          <span>📊</span> Profit &amp; Loss Analytics
        </button>

        <button
          type="button"
          className={`crm-billbook-tab-btn ${activeTab === 'customers' ? 'active' : ''}`}
          onClick={() => setActiveTab('customers')}
        >
          <span>👥</span> Customer-wise Revenue
          <span className="tab-count-pill">{customers.length}</span>
        </button>

        <button
          type="button"
          className={`crm-billbook-tab-btn ${activeTab === 'bills' ? 'active' : ''}`}
          onClick={() => setActiveTab('bills')}
        >
          <span>🧾</span> All Bills History
          <span className="tab-count-pill">{bills.length}</span>
        </button>

        <button
          type="button"
          className={`crm-billbook-tab-btn ${activeTab === 'monthly' ? 'active' : ''}`}
          onClick={() => setActiveTab('monthly')}
        >
          <span>📈</span> Monthly Revenue Analysis
          <span className="tab-count-pill">{monthlyAnalysis.length} mos</span>
        </button>
      </div>

      {/* ======================================================================
          TAB A: FINANCIAL TRANSACTIONS (16 EXACT REQUIRED COLUMNS)
          ====================================================================== */}
      {!canViewLedger ? (
        <div className="crm-billbook-section" style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
          <div style={{ fontSize: '36px', marginBottom: '8px' }}>🔒</div>
          <h3 style={{ fontSize: '18px', color: '#0f172a' }}>Ledger Access Restricted</h3>
          <p style={{ marginTop: '6px' }}>You do not have permission to view billing and ledger history.</p>
        </div>
      ) : activeTab === 'transactions' && (
        <div className="crm-billbook-section">
          <div className="crm-billbook-toolbar">
            <div className="crm-billbook-search-box">
              <span className="search-icon">🔍</span>
              <input
                type="text"
                placeholder="Search by Transaction ID (MTXN...), Customer, Mobile, Bank, UTR..."
                value={financialSearch}
                onChange={(e) => setFinancialSearch(e.target.value)}
              />
              {financialSearch && (
                <button
                  type="button"
                  className="search-clear-btn"
                  onClick={() => setFinancialSearch('')}
                >
                  ✕
                </button>
              )}
            </div>

            <div className="crm-billbook-toolbar-right">
              <div className="crm-status-filter-pills">
                {['ALL', 'Successful', 'Pending', 'Failed'].map((st) => (
                  <button
                    key={st}
                    type="button"
                    className={`filter-chip ${financialStatus === st ? 'active' : ''}`}
                    onClick={() => setFinancialStatus(st)}
                  >
                    {st}
                  </button>
                ))}
              </div>

              <div className="crm-billbook-date-filters">
                <input
                  type="date"
                  className="crm-date-input"
                  value={financialStartDate}
                  onChange={(e) => setFinancialStartDate(e.target.value)}
                  title="From date"
                />
                <span style={{ color: '#94a3b8' }}>to</span>
                <input
                  type="date"
                  className="crm-date-input"
                  value={financialEndDate}
                  onChange={(e) => setFinancialEndDate(e.target.value)}
                  title="To date"
                />
                {(financialStartDate || financialEndDate) && (
                  <button
                    type="button"
                    className="crm-btn-reset-filters"
                    onClick={() => {
                      setFinancialStartDate('');
                      setFinancialEndDate('');
                    }}
                  >
                    Reset Dates
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Ledger Accounting Summary Strip */}
          <div className="crm-ledger-strip">
            <div className="ledger-cell">
              <span className="l-label">Total Cash In</span>
              <span className="l-val text-emerald">+{formatInr(financialLedger.totalCashReceived)}</span>
            </div>
            <div className="ledger-cell">
              <span className="l-label">Total Bank Debit</span>
              <span className="l-val text-blue">−{formatInr(financialLedger.totalAmountDebited)}</span>
            </div>
            <div className="ledger-cell">
              <span className="l-label">Total Commission Earned</span>
              <span className="l-val text-purple">+{formatInr(financialLedger.totalCommission)}</span>
            </div>
            <div className="ledger-cell">
              <span className="l-label">Net Online Movement</span>
              <span className="l-val">{formatInr(financialLedger.netAmountTotal)}</span>
            </div>
          </div>

          <div className="crm-billbook-table-container">
            <table className="crm-billbook-table financial-table">
              <thead>
                <tr>
                  {/* 1 */} <th>Transaction ID</th>
                  {/* 2 */} <th>Date</th>
                  {/* 3 */} <th>Customer UID</th>
                  {/* 4 */} <th>Customer Name</th>
                  {/* 5 */} <th>Mobile Number</th>
                  {/* 6 */} <th>Bank Name</th>
                  {/* 7 */} <th>Transaction Type</th>
                  {/* 8 */} <th>Payment Mode</th>
                  {/* 9 */} <th style={{ textAlign: 'right' }}>Cash Received</th>
                  {/* 10 */} <th style={{ textAlign: 'right' }}>Amount Debited</th>
                  {/* 11 */} <th style={{ textAlign: 'right' }}>Amount Credited</th>
                  {/* 12 */} <th style={{ textAlign: 'right' }}>Commission</th>
                  {/* 13 */} <th style={{ textAlign: 'right' }}>Net Amount</th>
                  {/* 14 */} <th style={{ textAlign: 'center' }}>Status</th>
                  {/* 15 */} <th>Reference Number</th>
                  {/* 16 */} <th style={{ textAlign: 'center', width: '100px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loadingFinancial ? (
                  <tr>
                    <td colSpan="16" style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                      <div className="crm-spinner" />
                      <p style={{ marginTop: '10px' }}>Loading synchronized financial transactions...</p>
                    </td>
                  </tr>
                ) : financialTransactions.length === 0 ? (
                  <tr>
                    <td colSpan="16" style={{ textAlign: 'center', padding: '50px 20px', color: '#64748b' }}>
                      <span style={{ fontSize: '36px', display: 'block', marginBottom: '8px' }}>💸</span>
                      <strong style={{ fontSize: '16px', color: '#0f172a' }}>No Financial Transactions Recorded</strong>
                      <p style={{ margin: '6px 0 0 0', fontSize: '13px' }}>
                        Transactions saved in Money Transaction automatically appear here.
                      </p>
                    </td>
                  </tr>
                ) : (
                  financialTransactions.map((t) => (
                    <tr key={t._id}>
                      {/* 1. Transaction ID */}
                      <td>
                        <span className="crm-uid-badge mono">{t.transactionId}</span>
                        <div style={{ marginTop: '4px', fontSize: '11px', whiteSpace: 'nowrap' }}>
                          {t.createdByRole === 'employee' ? (
                            <span style={{ color: '#4f46e5', fontWeight: 700 }} title={`Created by Employee ${t.createdByUid}`}>
                              👤 {t.createdByName || t.createdByUid || 'Employee'}
                            </span>
                          ) : (
                            <span style={{ color: '#059669', fontWeight: 700 }} title="Created by Retailer">
                              👑 Retailer
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 2. Date */}
                      <td>
                        <span className="crm-table-date">{formatDate(t.date)}</span>
                      </td>

                      {/* 3. Customer UID */}
                      <td>
                        <span className="crm-uid-badge" style={{ background: '#f5f3ff', color: '#7c3aed' }}>
                          {t.customerUid}
                        </span>
                      </td>

                      {/* 4. Customer Name */}
                      <td>
                        <strong className="crm-customer-name-link">{t.customerName}</strong>
                      </td>

                      {/* 5. Mobile Number */}
                      <td>
                        <span className="crm-phone-pill">📱 {t.mobileNumber}</span>
                      </td>

                      {/* 6. Bank Name */}
                      <td>
                        <span style={{ fontWeight: 700, color: '#0f172a' }}>{t.bankName}</span>
                      </td>

                      {/* 7. Transaction Type */}
                      <td>
                        <span className="crm-type-badge">{t.transactionType}</span>
                      </td>

                      {/* 8. Payment Mode */}
                      <td>
                        <span className="crm-mode-badge">{t.paymentMode}</span>
                      </td>

                      {/* 9. Cash Received */}
                      <td style={{ textAlign: 'right' }}>
                        <span className="text-emerald" style={{ fontWeight: 800 }}>
                          {formatInr(t.cashReceived)}
                        </span>
                      </td>

                      {/* 10. Amount Debited */}
                      <td style={{ textAlign: 'right' }}>
                        <span className="text-blue" style={{ fontWeight: 800 }}>
                          {t.amountDebited > 0 ? `−${formatInr(t.amountDebited)}` : '₹0'}
                        </span>
                      </td>

                      {/* 11. Amount Credited */}
                      <td style={{ textAlign: 'right' }}>
                        <span className="text-emerald" style={{ fontWeight: 800 }}>
                          {t.amountCredited > 0 ? `+${formatInr(t.amountCredited)}` : '₹0'}
                        </span>
                      </td>

                      {/* 12. Commission */}
                      <td style={{ textAlign: 'right' }}>
                        <span className="text-purple" style={{ fontWeight: 800 }}>
                          +{formatInr(t.commission)}
                        </span>
                      </td>

                      {/* 13. Net Amount */}
                      <td style={{ textAlign: 'right' }}>
                        <span style={{ fontWeight: 900, color: '#0284c7' }}>
                          {formatInr(t.netAmount)}
                        </span>
                      </td>

                      {/* 14. Transaction Status */}
                      <td style={{ textAlign: 'center' }}>
                        <span className={`status-pill status-${(t.transactionStatus || 'successful').toLowerCase()}`}>
                          {t.transactionStatus === 'Successful' ? '✓ ' : t.transactionStatus === 'Pending' ? '⏳ ' : '✕ '}
                          {t.transactionStatus}
                        </span>
                      </td>

                      {/* 15. Reference Number */}
                      <td>
                        <span className="utr-val mono">{t.referenceNumber}</span>
                      </td>

                      {/* 16. Actions */}
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          className="crm-btn-view-customer"
                          onClick={() => setSelectedTxnModal(t)}
                          title="View Transaction Details"
                        >
                          👁️ View
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ======================================================================
          TAB B: PROFIT & LOSS ANALYTICS (Day Wise & Month Wise Pie Chart)
          ====================================================================== */}
      {activeTab === 'profit_loss' && (
        <div className="crm-billbook-section pl-section">
          {/* Controls: Day Wise vs Month Wise */}
          <div className="pl-controls-card">
            <div className="pl-mode-switch">
              <button
                type="button"
                className={`pl-switch-btn ${plMode === 'day' ? 'active' : ''}`}
                onClick={() => setPlMode('day')}
              >
                📅 Day Wise Report
              </button>
              <button
                type="button"
                className={`pl-switch-btn ${plMode === 'month' ? 'active' : ''}`}
                onClick={() => setPlMode('month')}
              >
                📆 Month Wise Report
              </button>
            </div>

            <div className="pl-picker-group">
              {plMode === 'day' ? (
                <div className="pl-input-wrap">
                  <label>Select Date:</label>
                  <input
                    type="date"
                    className="crm-date-input"
                    value={plDate}
                    onChange={(e) => setPlDate(e.target.value)}
                  />
                </div>
              ) : (
                <div className="pl-input-wrap">
                  <label>Select Month &amp; Year:</label>
                  <select
                    className="crm-filter-select"
                    value={plMonth}
                    onChange={(e) => setPlMonth(Number(e.target.value))}
                  >
                    {MONTHS_LIST.filter(m => m.value !== 'ALL').map(m => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                  <select
                    className="crm-filter-select"
                    value={plYear}
                    onChange={(e) => setPlYear(Number(e.target.value))}
                  >
                    {availableYears.map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              )}

              <button
                type="button"
                className="crm-billbook-refresh-btn"
                onClick={fetchProfitLoss}
                title="Calculate profit & loss"
              >
                <span>🔄</span> Recalculate
              </button>
            </div>
          </div>

          {/* Profit & Loss Headline Cards */}
          {profitLossData && (
            <div className="pl-kpi-grid">
              <div className="pl-kpi-card pl-card-profit">
                <span className="pl-kpi-icon">📈</span>
                <div className="pl-kpi-data">
                  <span className="pl-kpi-label">Total Profit</span>
                  <h3 className="pl-kpi-val text-emerald">
                    {formatInr(profitLossData.summary.netProfit)}
                  </h3>
                  <span className="pl-kpi-percent">
                    Profit Margin: <strong>{profitLossData.summary.profitPercentage}%</strong>
                  </span>
                </div>
              </div>

              <div className="pl-kpi-card pl-card-loss">
                <span className="pl-kpi-icon">📉</span>
                <div className="pl-kpi-data">
                  <span className="pl-kpi-label">Total Loss</span>
                  <h3 className="pl-kpi-val text-rose">
                    {formatInr(profitLossData.summary.netLoss)}
                  </h3>
                  <span className="pl-kpi-percent">
                    Loss Deficit: <strong>{profitLossData.summary.lossPercentage}%</strong>
                  </span>
                </div>
              </div>

              <div className="pl-kpi-card pl-card-income">
                <span className="pl-kpi-icon">💰</span>
                <div className="pl-kpi-data">
                  <span className="pl-kpi-label">Total Income</span>
                  <h3 className="pl-kpi-val">
                    {formatInr(profitLossData.summary.totalIncome)}
                  </h3>
                  <span className="pl-kpi-sub">
                    Commissions ({formatInr(profitLossData.summary.commissionIncome)}) + Bills ({formatInr(profitLossData.summary.billingRevenue)})
                  </span>
                </div>
              </div>

              <div className="pl-kpi-card pl-card-expenses">
                <span className="pl-kpi-icon">🧾</span>
                <div className="pl-kpi-data">
                  <span className="pl-kpi-label">Total Expenses</span>
                  <h3 className="pl-kpi-val text-rose">
                    {formatInr(profitLossData.summary.totalExpenses)}
                  </h3>
                  <span className="pl-kpi-sub">
                    {profitLossData.summary.expensesCount} shop expense entries
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Graphical Representation: Interactive Donut / Pie Chart */}
          <div className="pl-graph-section">
            <div className="pl-graph-header">
              <h4>
                📊 Graphical Representation — {profitLossData ? profitLossData.periodLabel : 'Selected Period'}
              </h4>
              <p>Income vs Expense breakdown and net financial performance</p>
            </div>

            {loadingPL ? (
              <div style={{ textAlign: 'center', padding: '50px' }}>
                <div className="crm-spinner" />
                <p style={{ marginTop: '10px', color: '#64748b' }}>Calculating Profit &amp; Loss...</p>
              </div>
            ) : !profitLossData || !profitLossData.hasData ? (
              <div className="pl-no-data-card">
                <span style={{ fontSize: '46px', display: 'block', marginBottom: '8px' }}>📊</span>
                <h4>No Data Available</h4>
                <p>
                  No financial transactions, customer bills, or recorded expenses found for{' '}
                  <strong>{profitLossData ? profitLossData.periodLabel : 'this period'}</strong>.
                </p>
              </div>
            ) : (
              <div className="pl-chart-container">
                {/* SVG Donut / Pie Chart */}
                <div className="pl-svg-column">
                  {(() => {
                    const s = profitLossData.summary;
                    const isProfit = s.netProfit >= s.netLoss;

                    const slices = [
                      { label: 'Commission Earnings', value: s.commissionIncome || 0, color: '#7c3aed' },
                      { label: 'Customer Bills Revenue', value: s.billingRevenue || 0, color: '#0284c7' },
                      { label: 'Business Expenses', value: s.totalExpenses || 0, color: '#ef4444' }
                    ].filter(sl => sl.value > 0);

                    const totalVal = slices.reduce((acc, sl) => acc + sl.value, 0);
                    if (totalVal <= 0) return null;

                    const cx = 100;
                    const cy = 100;
                    const r = 78;
                    const innerR = 48;
                    let curAngle = 0;

                    return (
                      <div className="pl-chart-box">
                        <svg viewBox="0 0 200 200" className="pl-donut-svg">
                          {slices.map((slice, idx) => {
                            const angle = (slice.value / totalVal) * 360;
                            const startAngle = curAngle;
                            const endAngle = curAngle + angle;
                            curAngle += angle;

                            if (angle >= 359.9) {
                              return (
                                <circle
                                  key={idx}
                                  cx={cx}
                                  cy={cy}
                                  r={(r + innerR) / 2}
                                  fill="transparent"
                                  stroke={slice.color}
                                  strokeWidth={r - innerR}
                                />
                              );
                            }

                            const startRad = (startAngle - 90) * (Math.PI / 180);
                            const endRad = (endAngle - 90) * (Math.PI / 180);

                            const x1 = cx + r * Math.cos(startRad);
                            const y1 = cy + r * Math.sin(startRad);
                            const x2 = cx + r * Math.cos(endRad);
                            const y2 = cy + r * Math.sin(endRad);

                            const x1In = cx + innerR * Math.cos(startRad);
                            const y1In = cy + innerR * Math.sin(startRad);
                            const x2In = cx + innerR * Math.cos(endRad);
                            const y2In = cy + innerR * Math.sin(endRad);

                            const largeArc = angle > 180 ? 1 : 0;
                            const pathData = `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} L ${x2In} ${y2In} A ${innerR} ${innerR} 0 ${largeArc} 0 ${x1In} ${y1In} Z`;

                            return (
                              <path
                                key={idx}
                                d={pathData}
                                fill={slice.color}
                                className="pl-svg-slice"
                              >
                                <title>
                                  {slice.label}: ₹{slice.value.toLocaleString('en-IN')} ({(slice.value / totalVal * 100).toFixed(1)}%)
                                </title>
                              </path>
                            );
                          })}

                          {/* Center Donut Label */}
                          <circle cx={cx} cy={cy} r={innerR - 1} fill="#ffffff" />
                          <text x={cx} y={cy - 6} textAnchor="middle" className="donut-center-title">
                            {isProfit ? 'NET PROFIT' : 'NET LOSS'}
                          </text>
                          <text
                            x={cx}
                            y={cy + 14}
                            textAnchor="middle"
                            className={`donut-center-amount ${isProfit ? 'text-emerald' : 'text-rose'}`}
                          >
                            {isProfit ? `+₹${s.netProfit.toLocaleString('en-IN')}` : `−₹${s.netLoss.toLocaleString('en-IN')}`}
                          </text>
                          <text x={cx} y={cy + 26} textAnchor="middle" className="donut-center-ratio">
                            {isProfit ? `${s.profitPercentage}% margin` : `${s.lossPercentage}% loss`}
                          </text>
                        </svg>

                        <div className="pl-legend-column">
                          <h5 style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#334155' }}>
                            Financial Breakdown:
                          </h5>
                          {slices.map((slice, idx) => (
                            <div key={idx} className="pl-legend-row">
                              <span className="legend-indicator" style={{ background: slice.color }} />
                              <div className="legend-info">
                                <span className="legend-name">{slice.label}</span>
                                <span className="legend-amount">
                                  ₹{slice.value.toLocaleString('en-IN')}{' '}
                                  <small>({((slice.value / totalVal) * 100).toFixed(1)}%)</small>
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Breakdown Tables (Income & Expenses) */}
                <div className="pl-breakdown-column">
                  <div className="pl-items-box">
                    <h5 className="items-box-title text-emerald">
                      💰 Income Entries ({profitLossData.incomeBreakdown.items.length})
                    </h5>
                    {profitLossData.incomeBreakdown.items.length === 0 ? (
                      <p className="no-items-text">No income entries for this period.</p>
                    ) : (
                      <div className="items-list-wrap">
                        {profitLossData.incomeBreakdown.items.map((item, idx) => (
                          <div key={idx} className="breakdown-item-row">
                            <div className="item-title-meta">
                              <span className="item-type-tag">{item.type}</span>
                              <span className="item-title">{item.title}</span>
                              <span className="item-date">{formatDate(item.date)}</span>
                            </div>
                            <span className="item-amount text-emerald">+{formatInr(item.amount)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="pl-items-box" style={{ marginTop: '14px' }}>
                    <h5 className="items-box-title text-rose">
                      📉 Recorded Expenses ({profitLossData.expensesBreakdown.items.length})
                    </h5>
                    {profitLossData.expensesBreakdown.items.length === 0 ? (
                      <p className="no-items-text">No expenses recorded for this period.</p>
                    ) : (
                      <div className="items-list-wrap">
                        {profitLossData.expensesBreakdown.items.map((item, idx) => (
                          <div key={idx} className="breakdown-item-row">
                            <div className="item-title-meta">
                              <span className="item-type-tag expense-tag">{item.category}</span>
                              <span className="item-title">{item.title}</span>
                              <span className="item-date">{formatDate(item.date)}</span>
                            </div>
                            <span className="item-amount text-rose">−{formatInr(item.amount)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ======================================================================
          TAB 1: CUSTOMER-WISE REVENUE MANAGEMENT
          ====================================================================== */}
      {activeTab === 'customers' && (
        <div className="crm-billbook-section">
          <div className="crm-billbook-toolbar">
            <div className="crm-billbook-search-box">
              <span className="search-icon">🔍</span>
              <input
                type="text"
                placeholder="Search by Customer UID, Name, or Mobile..."
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
              />
              {customerSearch && (
                <button
                  type="button"
                  className="search-clear-btn"
                  onClick={() => setCustomerSearch('')}
                >
                  ✕
                </button>
              )}
            </div>

            <div className="crm-billbook-toolbar-right">
              <span className="table-count-label">
                Showing <strong>{customers.length}</strong> billed customer(s)
              </span>
            </div>
          </div>

          <div className="crm-billbook-table-container">
            <table className="crm-billbook-table">
              <thead>
                <tr>
                  <th>Customer UID</th>
                  <th>Customer Name</th>
                  <th>Mobile Number</th>
                  <th style={{ textAlign: 'center' }}>Total Works</th>
                  <th style={{ textAlign: 'center' }}>Total Bills</th>
                  <th style={{ textAlign: 'right' }}>Total Revenue</th>
                  <th style={{ textAlign: 'center' }}>Last Work Date</th>
                  <th style={{ textAlign: 'center', width: '130px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loadingCustomers ? (
                  <tr>
                    <td colSpan="8" style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                      <div className="crm-spinner" />
                      <p style={{ marginTop: '10px' }}>Loading customer revenue records...</p>
                    </td>
                  </tr>
                ) : customers.length === 0 ? (
                  <tr>
                    <td colSpan="8" style={{ textAlign: 'center', padding: '48px', color: '#64748b' }}>
                      <div style={{ fontSize: '32px', marginBottom: '8px' }}>👥</div>
                      <strong>No customer billing records found.</strong>
                      <p style={{ fontSize: '12.5px', marginTop: '4px' }}>
                        When bills are generated in Customer Management, customer business metrics appear here automatically.
                      </p>
                    </td>
                  </tr>
                ) : (
                  customers.map((c) => (
                    <tr key={c.customerUid}>
                      <td>
                        <div className="crm-uid-cell">
                          <code className="crm-uid-badge">{c.customerUid}</code>
                          <button
                            type="button"
                            className="crm-copy-btn"
                            title="Copy UID"
                            onClick={(e) => handleCopyText(c.customerUid, 'Customer UID', e)}
                          >
                            📋
                          </button>
                        </div>
                      </td>
                      <td>
                        <strong className="crm-cust-name-text">{c.customerName || '—'}</strong>
                      </td>
                      <td>
                        <span className="crm-phone-text">📞 {c.mobileNumber || '—'}</span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className="crm-works-pill">{c.totalWorks || 0}</span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className="crm-bills-pill">{c.totalBills || 0}</span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <strong className="crm-revenue-badge">{formatInr(c.totalRevenue)}</strong>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className="crm-date-text">{formatDate(c.lastWorkDate)}</span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          className="crm-view-detail-btn"
                          onClick={() => handleOpenCustomerDetail(c.customerUid)}
                        >
                          👁️ View Details
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ======================================================================
          TAB 2: MONTHLY REVENUE ANALYSIS & VISUAL CHART
          ====================================================================== */}
      {activeTab === 'monthly' && (
        <div className="crm-billbook-section">
          {/* Month/Year Filter Bar */}
          <div className="crm-monthly-filter-bar">
            <div className="crm-filter-group">
              <label>Filter Year:</label>
              <select
                value={filterYear}
                onChange={(e) => setFilterYear(e.target.value)}
                className="crm-select-control"
              >
                <option value="ALL">All Years</option>
                {availableYears.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            <div className="crm-filter-group">
              <label>Filter Month:</label>
              <select
                value={filterMonth}
                onChange={(e) => setFilterMonth(e.target.value)}
                className="crm-select-control"
              >
                {MONTHS_LIST.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>

            {(filterYear !== 'ALL' || filterMonth !== 'ALL') && (
              <button
                type="button"
                className="crm-reset-filter-btn"
                onClick={() => {
                  setFilterYear('ALL');
                  setFilterMonth('ALL');
                }}
              >
                Reset Filters
              </button>
            )}
          </div>

          {/* Revenue Trend Visual Chart */}
          <div className="crm-chart-card">
            <div className="crm-chart-header">
              <div className="crm-chart-title-wrap">
                <span className="crm-chart-icon">📊</span>
                <div>
                  <h4>Monthly Revenue Trend</h4>
                  <p>Visual representation of billing performance across calendar months</p>
                </div>
              </div>
              <span className="crm-chart-summary-badge">
                Total Shown: {formatInr(filteredMonthlyRecords.reduce((s, m) => s + m.totalRevenue, 0))}
              </span>
            </div>

            {filteredMonthlyRecords.length === 0 ? (
              <div className="crm-chart-empty">
                <span>📉</span>
                <p>No billing data recorded for the selected period.</p>
              </div>
            ) : (
              <div className="crm-chart-bars-container">
                <div className="crm-chart-bars-wrap">
                  {filteredMonthlyRecords.map((m) => {
                    const heightPercent = Math.max(12, Math.round((m.totalRevenue / maxMonthlyRevenue) * 100));
                    return (
                      <div key={m.key} className="crm-chart-col">
                        <div className="crm-bar-label-top">{formatInr(m.totalRevenue)}</div>
                        <div className="crm-bar-track">
                          <div
                            className="crm-bar-fill"
                            style={{ height: `${heightPercent}%` }}
                            title={`${m.fullLabel}: ${formatInr(m.totalRevenue)} (${m.totalBills} bills, ${m.totalCustomers} clients)`}
                          >
                            <div className="crm-bar-tooltip">
                              <strong>{m.fullLabel}</strong>
                              <div>Revenue: {formatInr(m.totalRevenue)}</div>
                              <div>Bills: {m.totalBills} | Clients: {m.totalCustomers}</div>
                            </div>
                          </div>
                        </div>
                        <div className="crm-bar-label-bottom">{m.monthLabel}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Monthly Data Table */}
          <div className="crm-billbook-table-container" style={{ marginTop: '20px' }}>
            <table className="crm-billbook-table">
              <thead>
                <tr>
                  <th>Month & Year</th>
                  <th style={{ textAlign: 'center' }}>Number of Bills</th>
                  <th style={{ textAlign: 'center' }}>Number of Customers</th>
                  <th style={{ textAlign: 'right' }}>Total Revenue</th>
                  <th style={{ textAlign: 'right' }}>Average Bill Size</th>
                </tr>
              </thead>
              <tbody>
                {filteredMonthlyRecords.length === 0 ? (
                  <tr>
                    <td colSpan="5" style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                      No monthly records found.
                    </td>
                  </tr>
                ) : (
                  filteredMonthlyRecords.map((m) => (
                    <tr key={m.key}>
                      <td>
                        <strong className="crm-month-title">{m.fullLabel}</strong>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className="crm-bills-pill">{m.totalBills}</span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className="crm-works-pill">{m.totalCustomers}</span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <strong className="crm-revenue-badge">{formatInr(m.totalRevenue)}</strong>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <span style={{ fontWeight: 600, color: '#475569' }}>
                          {formatInr(m.averageBill)}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ======================================================================
          TAB 3: ALL BILLS DIRECTORY
          ====================================================================== */}
      {activeTab === 'bills' && (
        <div className="crm-billbook-section">
          {/* Search & Comprehensive Filters */}
          <div className="crm-bill-filter-grid">
            <div className="crm-bill-search-box">
              <span className="search-icon">🔍</span>
              <input
                type="text"
                placeholder="Search Bill No, Customer, UID, or Work..."
                value={billSearch}
                onChange={(e) => setBillSearch(e.target.value)}
              />
              {billSearch && (
                <button
                  type="button"
                  className="search-clear-btn"
                  onClick={() => setBillSearch('')}
                >
                  ✕
                </button>
              )}
            </div>

            <div className="crm-filter-group">
              <select
                value={filterYear}
                onChange={(e) => setFilterYear(e.target.value)}
                className="crm-select-control"
              >
                <option value="ALL">All Years</option>
                {availableYears.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            <div className="crm-filter-group">
              <select
                value={filterMonth}
                onChange={(e) => setFilterMonth(e.target.value)}
                className="crm-select-control"
              >
                {MONTHS_LIST.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>

            <div className="crm-date-range-group">
              <input
                type="date"
                value={filterStartDate}
                onChange={(e) => setFilterStartDate(e.target.value)}
                title="From Date"
                className="crm-date-control"
              />
              <span style={{ color: '#94a3b8' }}>to</span>
              <input
                type="date"
                value={filterEndDate}
                onChange={(e) => setFilterEndDate(e.target.value)}
                title="To Date"
                className="crm-date-control"
              />
            </div>

            {(billSearch || filterYear !== 'ALL' || filterMonth !== 'ALL' || filterStartDate || filterEndDate) && (
              <button
                type="button"
                className="crm-reset-filter-btn"
                onClick={handleResetBillFilters}
              >
                Reset
              </button>
            )}
          </div>

          <div className="crm-billbook-results-summary">
            <span>
              Showing <strong>{bills.length}</strong> bill(s) | Total Billed Amount:{' '}
              <strong style={{ color: '#16a34a' }}>
                {formatInr(bills.reduce((s, b) => s + (Number(b.amount) || 0), 0))}
              </strong>
            </span>
          </div>

          <div className="crm-billbook-table-container">
            <table className="crm-billbook-table">
              <thead>
                <tr>
                  <th>Bill Number</th>
                  <th>Bill Date</th>
                  <th>Customer UID</th>
                  <th>Customer Name</th>
                  <th>Work Description</th>
                  <th style={{ textAlign: 'right' }}>Bill Amount</th>
                  <th style={{ textAlign: 'center' }}>Bill Status</th>
                  <th style={{ textAlign: 'center', width: '170px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loadingBills ? (
                  <tr>
                    <td colSpan="8" style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                      <div className="crm-spinner" />
                      <p style={{ marginTop: '10px' }}>Loading billing records...</p>
                    </td>
                  </tr>
                ) : bills.length === 0 ? (
                  <tr>
                    <td colSpan="8" style={{ textAlign: 'center', padding: '48px', color: '#64748b' }}>
                      <div style={{ fontSize: '32px', marginBottom: '8px' }}>🧾</div>
                      <strong>No bills matched your criteria.</strong>
                      <p style={{ fontSize: '12.5px', marginTop: '4px' }}>
                        Try adjusting your filters or date range.
                      </p>
                    </td>
                  </tr>
                ) : (
                  bills.map((b) => (
                    <tr key={b.billNumber}>
                      <td>
                        <div className="crm-uid-cell">
                          <code className="crm-bill-num-badge">{b.billNumber}</code>
                          <button
                            type="button"
                            className="crm-copy-btn"
                            title="Copy Bill Number"
                            onClick={(e) => handleCopyText(b.billNumber, 'Bill Number', e)}
                          >
                            📋
                          </button>
                        </div>
                        {b.createdByRole && (
                          <div style={{ marginTop: '3px', fontSize: '10.5px' }}>
                            {b.createdByRole === 'employee' ? (
                              <span style={{ color: '#4f46e5', fontWeight: 600 }}>👤 {b.createdByName || b.createdByUid}</span>
                            ) : (
                              <span style={{ color: '#059669', fontWeight: 600 }}>👑 Retailer</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td>
                        <span className="crm-date-text">{formatDateTime(b.billDate)}</span>
                      </td>
                      <td>
                        <code className="crm-uid-badge">{b.customerUid}</code>
                      </td>
                      <td>
                        <strong className="crm-cust-name-text">{b.customerName || '—'}</strong>
                      </td>
                      <td>
                        <span className="crm-work-desc-text" title={b.workDescription}>
                          {b.workDescription}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <strong className="crm-revenue-badge">{formatInr(b.amount)}</strong>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className="crm-status-paid-pill">✓ Paid</span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div className="crm-bill-action-group">
                          <button
                            type="button"
                            className="crm-btn-view-bill"
                            onClick={() => handleViewPdf(b.billNumber)}
                            title="View Official Bill"
                          >
                            👁️ View
                          </button>
                          <button
                            type="button"
                            className="crm-btn-dl-bill"
                            onClick={(e) => handleDownloadPdf(b.billNumber, e)}
                            title="Download PDF Invoice"
                          >
                            ⬇️ PDF
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ======================================================================
          MODAL 1: INDIVIDUAL CUSTOMER REVENUE DETAILS & BILLING HISTORY
          ====================================================================== */}
      {selectedCustomerUid && (
        <div className="crm-modal-overlay" onClick={handleCloseCustomerDetail}>
          <div className="crm-modal-dialog wide" onClick={(e) => e.stopPropagation()}>
            <div className="crm-dialog-header">
              <div className="crm-dialog-title-wrap">
                <span className="crm-dialog-icon">👤</span>
                <div>
                  <h3>Customer Revenue & Billing Profile</h3>
                  <p>Comprehensive ledger, earnings, and historical invoices for UID: {selectedCustomerUid}</p>
                </div>
              </div>
              <button
                type="button"
                className="crm-dialog-close"
                onClick={handleCloseCustomerDetail}
              >
                ✕
              </button>
            </div>

            <div className="crm-dialog-body" style={{ maxHeight: '78vh', overflowY: 'auto' }}>
              {loadingDetail || !customerDetail ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                  <div className="crm-spinner" />
                  <p style={{ marginTop: '10px' }}>Loading customer revenue profile...</p>
                </div>
              ) : (
                <>
                  {/* Customer Information Card */}
                  <div className="crm-cust-detail-card">
                    <div className="crm-cust-detail-header">
                      <div className="cust-identity-row">
                        <span className="cust-avatar-icon">👤</span>
                        <div>
                          <h3 className="cust-full-name">{customerDetail.customerName}</h3>
                          <div className="cust-uid-row">
                            <span className="uid-label">Customer UID:</span>
                            <code className="uid-code">{customerDetail.customerUid}</code>
                            <button
                              type="button"
                              className="crm-copy-btn"
                              onClick={(e) => handleCopyText(customerDetail.customerUid, 'Customer UID', e)}
                              title="Copy UID"
                            >
                              📋
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="cust-revenue-hero">
                        <span className="hero-label">Total Revenue</span>
                        <h2 className="hero-amount">{formatInr(customerDetail.totalRevenue)}</h2>
                        <span className="hero-sub">{customerDetail.totalBills} bill(s) paid</span>
                      </div>
                    </div>

                    <div className="crm-cust-meta-grid">
                      <div className="meta-item">
                        <span className="meta-lbl">Mobile Number:</span>
                        <span className="meta-val">📞 {customerDetail.mobileNumber || '—'}</span>
                      </div>
                      <div className="meta-item">
                        <span className="meta-lbl">Email Address:</span>
                        <span className="meta-val">✉️ {customerDetail.email || '—'}</span>
                      </div>
                      <div className="meta-item">
                        <span className="meta-lbl">Total Completed Works:</span>
                        <span className="meta-val">🛠️ {customerDetail.totalWorks}</span>
                      </div>
                      <div className="meta-item">
                        <span className="meta-lbl">Total Issued Bills:</span>
                        <span className="meta-val">🧾 {customerDetail.totalBills}</span>
                      </div>
                      <div className="meta-item">
                        <span className="meta-lbl">First Bill Date:</span>
                        <span className="meta-val">{formatDate(customerDetail.firstBillDate)}</span>
                      </div>
                      <div className="meta-item">
                        <span className="meta-lbl">Latest Bill Date:</span>
                        <span className="meta-val">{formatDate(customerDetail.latestBillDate)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Customer Billing History Table */}
                  <div className="crm-history-section">
                    <div className="crm-history-header">
                      <h4>Billing History ({customerDetailBills.length})</h4>
                      <span className="crm-history-sub">
                        Showing actual historical records issued from Customer Management.
                      </span>
                    </div>

                    <div className="crm-table-scroll">
                      <table className="crm-billbook-table">
                        <thead>
                          <tr>
                            <th>Bill Number</th>
                            <th>Bill Date</th>
                            <th>Work Description</th>
                            <th style={{ textAlign: 'right' }}>Work Amount</th>
                            <th style={{ textAlign: 'center' }}>Bill Status</th>
                            <th style={{ textAlign: 'center', width: '160px' }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {customerDetailBills.length === 0 ? (
                            <tr>
                              <td colSpan="6" style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                                No historical bills found for this customer.
                              </td>
                            </tr>
                          ) : (
                            customerDetailBills.map((b) => (
                              <tr key={b.billNumber}>
                                <td>
                                  <div className="crm-uid-cell">
                                    <code className="crm-bill-num-badge">{b.billNumber}</code>
                                    <button
                                      type="button"
                                      className="crm-copy-btn"
                                      title="Copy Bill Number"
                                      onClick={(e) => handleCopyText(b.billNumber, 'Bill Number', e)}
                                    >
                                      📋
                                    </button>
                                  </div>
                                </td>
                                <td>
                                  <span className="crm-date-text">{formatDateTime(b.billDate)}</span>
                                </td>
                                <td>
                                  <span className="crm-work-desc-text">{b.workDescription}</span>
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                  <strong className="crm-revenue-badge">{formatInr(b.amount)}</strong>
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                  <span className="crm-status-paid-pill">✓ Paid</span>
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                  <div className="crm-bill-action-group">
                                    <button
                                      type="button"
                                      className="crm-btn-view-bill"
                                      onClick={() => handleViewPdf(b.billNumber)}
                                    >
                                      👁️ View Bill
                                    </button>
                                    <button
                                      type="button"
                                      className="crm-btn-dl-bill"
                                      onClick={(e) => handleDownloadPdf(b.billNumber, e)}
                                    >
                                      ⬇️ PDF
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="crm-dialog-footer">
              <button
                type="button"
                className="crm-btn-primary"
                onClick={handleCloseCustomerDetail}
              >
                Close Profile
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================================
          MODAL: VIEW FINANCIAL TRANSACTION DETAILS (My Bill Book View)
          ====================================================================== */}
      {selectedTxnModal && (
        <div className="crm-modal-overlay" onClick={() => setSelectedTxnModal(null)}>
          <div className="crm-modal-dialog" style={{ maxWidth: '580px' }} onClick={(e) => e.stopPropagation()}>
            <div className="crm-dialog-header">
              <div className="crm-dialog-title-wrap">
                <span className="crm-dialog-icon">💸</span>
                <div>
                  <h3>Transaction Entry — {selectedTxnModal.transactionId}</h3>
                  <p>Synchronized from Money Transaction Module</p>
                </div>
              </div>
              <button
                type="button"
                className="crm-dialog-close"
                onClick={() => setSelectedTxnModal(null)}
              >
                ✕
              </button>
            </div>

            <div className="crm-dialog-body">
              <div className="crm-txn-detail-sheet">
                <div className="sheet-row">
                  <span className="s-label">Transaction ID:</span>
                  <span className="s-val mono">{selectedTxnModal.transactionId}</span>
                </div>
                <div className="sheet-row">
                  <span className="s-label">Date & Time:</span>
                  <span className="s-val">{formatDateTime(selectedTxnModal.date)}</span>
                </div>
                <div className="sheet-row">
                  <span className="s-label">Customer Name:</span>
                  <span className="s-val">{selectedTxnModal.customerName}</span>
                </div>
                <div className="sheet-row">
                  <span className="s-label">Mobile Number:</span>
                  <span className="s-val">📱 {selectedTxnModal.mobileNumber}</span>
                </div>
                {selectedTxnModal.customerUid && selectedTxnModal.customerUid !== '—' && (
                  <div className="sheet-row">
                    <span className="s-label">Customer UID:</span>
                    <span className="s-val mono">{selectedTxnModal.customerUid}</span>
                  </div>
                )}
                <div className="sheet-divider" />

                <div className="sheet-row highlight-green">
                  <span className="s-label">Cash Received:</span>
                  <span className="s-val bold">{formatInr(selectedTxnModal.cashReceived)}</span>
                </div>

                <div className="sheet-row highlight-purple">
                  <span className="s-label">Retailer Commission:</span>
                  <span className="s-val bold">+{formatInr(selectedTxnModal.commission)}</span>
                </div>

                <div className="sheet-row highlight-blue">
                  <span className="s-label">Amount Debited (Bank Out):</span>
                  <span className="s-val bold">{formatInr(selectedTxnModal.amountDebited)}</span>
                </div>

                <div className="sheet-row">
                  <span className="s-label">Net Transfer Amount:</span>
                  <span className="s-val bold">{formatInr(selectedTxnModal.netAmount)}</span>
                </div>
                <div className="sheet-divider" />

                <div className="sheet-row">
                  <span className="s-label">Settlement Bank:</span>
                  <span className="s-val">{selectedTxnModal.bankName}</span>
                </div>
                <div className="sheet-row">
                  <span className="s-label">Payment Mode:</span>
                  <span className="s-val">{selectedTxnModal.paymentMode}</span>
                </div>
                <div className="sheet-row">
                  <span className="s-label">Status:</span>
                  <span className={`status-pill status-${(selectedTxnModal.transactionStatus || 'successful').toLowerCase()}`}>
                    {selectedTxnModal.transactionStatus}
                  </span>
                </div>
                <div className="sheet-row">
                  <span className="s-label">Reference / UTR:</span>
                  <span className="s-val mono">{selectedTxnModal.referenceNumber || '—'}</span>
                </div>
                <div className="sheet-row">
                  <span className="s-label">Created By:</span>
                  <span className="s-val bold" style={{ color: selectedTxnModal.createdByRole === 'employee' ? '#4f46e5' : '#059669' }}>
                    {selectedTxnModal.createdByRole === 'employee'
                      ? `👤 ${selectedTxnModal.createdByName || selectedTxnModal.createdByUid || 'Employee'}`
                      : '👑 Retailer'}
                  </span>
                </div>
                {selectedTxnModal.remarks && (
                  <div className="sheet-row">
                    <span className="s-label">Remarks:</span>
                    <span className="s-val">{selectedTxnModal.remarks}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="crm-dialog-footer">
              <button
                type="button"
                className="crm-btn-primary"
                onClick={() => setSelectedTxnModal(null)}
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================================
          MODAL 2: INLINE PDF BILL PREVIEW MODAL
          ====================================================================== */}
      {previewPdfUrl && (
        <div className="crm-modal-overlay" onClick={() => setPreviewPdfUrl(null)}>
          <div className="crm-modal-dialog preview-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="crm-dialog-header">
              <div className="crm-dialog-title-wrap">
                <span className="crm-dialog-icon">🧾</span>
                <div>
                  <h3>Official Bill Preview — {previewBillNumber}</h3>
                  <p>Preserved PDF Invoice Record</p>
                </div>
              </div>
              <div className="crm-preview-header-actions">
                <button
                  type="button"
                  className="crm-btn-dl-bill"
                  onClick={() => handleDownloadPdf(previewBillNumber)}
                >
                  ⬇️ Download PDF
                </button>
                <button
                  type="button"
                  className="crm-dialog-close"
                  onClick={() => setPreviewPdfUrl(null)}
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="crm-dialog-body preview-body" style={{ padding: 0 }}>
              <iframe
                src={previewPdfUrl}
                title={`Bill-${previewBillNumber}`}
                className="crm-pdf-iframe"
              />
            </div>

            <div className="crm-dialog-footer">
              <button
                type="button"
                className="crm-btn-secondary"
                onClick={() => setPreviewPdfUrl(null)}
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
