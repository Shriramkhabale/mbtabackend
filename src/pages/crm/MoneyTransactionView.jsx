import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Swal from 'sweetalert2';
import { apiFetch } from '../../utils/apiClient';
import { hasUserAccess, getStoredUserPermissions } from '../../utils/userPermissions';
import './MoneyTransactionView.css';

export default function MoneyTransactionView({
  user,
  onBack,
  onNavigateToBankAccounts,
  onNavigateToBillBook,
  userPermissions
}) {
  const effectivePermissions = useMemo(() => {
    return userPermissions || getStoredUserPermissions();
  }, [userPermissions]);
  // Data states
  const [transactions, setTransactions] = useState([]);
  const [summary, setSummary] = useState({
    totalCashReceived: 0,
    totalOnlineTransferred: 0,
    totalCommissionEarned: 0,
    cashBalance: 0,
    successfulCount: 0,
    pendingCount: 0,
    failedCount: 0,
    totalTransactions: 0
  });
  const [bankAccounts, setBankAccounts] = useState([]);
  const [crmCustomers, setCrmCustomers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Modals
  const [showTxnModal, setShowTxnModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [selectedTxnForStatus, setSelectedTxnForStatus] = useState(null);
  const [showReceiptModal, setShowReceiptModal] = useState(null);
  const [showExpenseModal, setShowExpenseModal] = useState(false);

  // Form State for Money Transaction
  const initialTxnForm = {
    customerName: '',
    customerMobile: '',
    customerUid: '',
    transactionType: 'Cash to Online Transfer', // 'Cash to Online Transfer' | 'Online to Cash'
    paymentMode: 'Cash to Online', // 'Cash to Online' | 'Online to Cash'
    amount: '',
    cashAmount: '',
    onlineAmount: '',
    commissionType: 'Fixed', // 'Fixed' | 'Percentage'
    commissionValue: '',
    bankAccountId: '',
    bankName: '',
    customerAccountOrUpi: '',
    referenceNumber: '',
    status: 'Successful',
    remarks: ''
  };
  const [txnForm, setTxnForm] = useState(initialTxnForm);
  const [txnErrors, setTxnErrors] = useState({});
  const [savingTxn, setSavingTxn] = useState(false);

  // Form State for Business Expense
  const [expenseForm, setExpenseForm] = useState({
    title: '',
    category: 'Other',
    amount: '',
    expenseDate: new Date().toISOString().split('T')[0],
    paymentMode: 'Cash',
    remarks: ''
  });
  const [savingExpense, setSavingExpense] = useState(false);

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
    } catch (_) { }
    return 'MBTAR000010101';
  }, [user]);

  // Fetch bank accounts for dropdown
  const fetchBankAccounts = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/crm/bank-accounts?retailerId=${encodeURIComponent(activeRetailerId)}`, {
        headers: {
          'x-retailer-id': activeRetailerId,
          'x-user-id': activeRetailerId
        }
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.accounts)) {
        setBankAccounts(data.accounts);
      }
    } catch (err) {
      console.error('Error fetching bank accounts:', err);
    }
  }, [activeRetailerId]);

  // Fetch CRM Customers for customer autocomplete
  const fetchCrmCustomers = useCallback(async () => {
    try {
      const res = await apiFetch('/api/crm/customers?limit=100');
      const data = await res.json();
      if (data.success && Array.isArray(data.customers)) {
        setCrmCustomers(data.customers);
      }
    } catch (err) {
      console.error('Error fetching CRM customers:', err);
    }
  }, []);

  // Fetch Money Transactions
  const fetchTransactions = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        retailerId: activeRetailerId
      });
      if (statusFilter !== 'ALL') params.append('status', statusFilter);
      if (searchQuery.trim()) params.append('search', searchQuery.trim());
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);

      const res = await apiFetch(`/api/crm/money-transactions?${params.toString()}`, {
        headers: {
          'x-retailer-id': activeRetailerId,
          'x-user-id': activeRetailerId
        }
      });
      const data = await res.json();
      if (data.success) {
        setTransactions(data.transactions || []);
        if (data.summary) {
          setSummary(data.summary);
        }
      }
    } catch (err) {
      console.error('Error fetching transactions:', err);
    } finally {
      setLoading(false);
    }
  }, [activeRetailerId, statusFilter, searchQuery, startDate, endDate]);

  useEffect(() => {
    fetchBankAccounts();
    fetchCrmCustomers();
    fetchTransactions();
  }, [fetchBankAccounts, fetchCrmCustomers, fetchTransactions]);

  // Instant Live Calculations for Transaction (Two-Way Support)
  const calculation = useMemo(() => {
    const isO2C = txnForm.transactionType === 'Online to Cash';
    const rawVal = txnForm.amount !== undefined && txnForm.amount !== ''
      ? txnForm.amount
      : (isO2C ? txnForm.onlineAmount : txnForm.cashAmount);
    const amount = Number(rawVal || 0);
    const commVal = Number(txnForm.commissionValue || 0);

    let commissionAmount = 0;
    if (amount > 0 && commVal >= 0) {
      if (txnForm.commissionType === 'Percentage') {
        commissionAmount = Math.round(((amount * commVal) / 100) * 100) / 100;
      } else {
        commissionAmount = Math.round(commVal * 100) / 100;
      }
    }

    if (commissionAmount > amount) {
      commissionAmount = amount;
    }

    const netPayout = Math.max(0, Math.round((amount - commissionAmount) * 100) / 100);

    if (isO2C) {
      return {
        grossAmount: amount,
        onlineAmount: amount,
        commissionAmount,
        netCashAmount: netPayout,
        netOnlineAmount: amount,
        cashAmount: netPayout
      };
    } else {
      return {
        grossAmount: amount,
        cashAmount: amount,
        commissionAmount,
        netOnlineAmount: netPayout,
        onlineAmount: netPayout,
        netCashAmount: 0
      };
    }
  }, [txnForm.transactionType, txnForm.amount, txnForm.cashAmount, txnForm.onlineAmount, txnForm.commissionType, txnForm.commissionValue]);

  // Auto-fill customer if UID or customer selected
  const handleSelectCustomer = (e) => {
    const selectedUid = e.target.value;
    if (!selectedUid) {
      setTxnForm(prev => ({ ...prev, customerUid: '' }));
      return;
    }
    const cust = crmCustomers.find(c => c.customerUid === selectedUid);
    if (cust) {
      setTxnForm(prev => ({
        ...prev,
        customerUid: cust.customerUid,
        customerName: cust.customerName || prev.customerName,
        customerMobile: cust.mobileNumber || prev.customerMobile
      }));
    }
  };

  // Auto-fill bank name when bank account changes
  const handleSelectBankAccount = (e) => {
    const accId = e.target.value;
    const selected = bankAccounts.find(a => a._id === accId || a.accountId === accId);
    setTxnForm(prev => ({
      ...prev,
      bankAccountId: accId,
      bankName: selected ? selected.bankName : ''
    }));
  };

  // Open transaction modal
  const handleOpenAddTxn = () => {
    if (bankAccounts.length === 0) {
      Swal.fire({
        icon: 'info',
        title: 'Add Bank Account First',
        text: 'Please add at least one bank account in "Bank Account Details" before recording money transactions.',
        showCancelButton: true,
        confirmButtonText: '🏦 Open Bank Accounts',
        confirmButtonColor: '#0284c7'
      }).then((result) => {
        if (result.isConfirmed && onNavigateToBankAccounts) {
          onNavigateToBankAccounts();
        }
      });
      return;
    }

    // Default to default bank account
    const defaultAcc = bankAccounts.find(a => a.isDefault) || bankAccounts[0];
    setTxnForm({
      ...initialTxnForm,
      bankAccountId: defaultAcc ? (defaultAcc._id || defaultAcc.accountId) : '',
      bankName: defaultAcc ? defaultAcc.bankName : ''
    });
    setTxnErrors({});
    setShowTxnModal(true);
  };

  // Validate Transaction Form
  const validateTxnForm = () => {
    const errors = {};
    const isO2C = txnForm.transactionType === 'Online to Cash';

    if (!txnForm.customerName.trim()) errors.customerName = 'Customer name is required';
    if (!txnForm.customerMobile.trim()) {
      errors.customerMobile = 'Mobile number is required';
    } else if (!/^\d{10}$/.test(txnForm.customerMobile.trim())) {
      errors.customerMobile = 'Must be 10 digits';
    }

    const rawVal = txnForm.amount !== undefined && txnForm.amount !== ''
      ? txnForm.amount
      : (isO2C ? txnForm.onlineAmount : txnForm.cashAmount);
    const amountNum = Number(rawVal);
    if (isNaN(amountNum) || amountNum <= 0) {
      errors.amount = isO2C
        ? 'Enter a valid online amount greater than 0'
        : 'Enter a valid cash amount greater than 0';
    }

    const commVal = Number(txnForm.commissionValue);
    if (isNaN(commVal) || commVal < 0) {
      errors.commissionValue = 'Enter a valid commission (>= 0)';
    } else if (txnForm.commissionType === 'Percentage' && commVal > 100) {
      errors.commissionValue = 'Percentage cannot exceed 100%';
    } else if (calculation.commissionAmount > calculation.grossAmount) {
      errors.commissionValue = 'Commission cannot exceed total received amount';
    }

    if (!txnForm.bankAccountId) {
      errors.bankAccountId = isO2C
        ? 'Please select the receiving bank account'
        : 'Please select the settlement bank account';
    }

    if (!isO2C && !txnForm.customerAccountOrUpi.trim()) {
      errors.customerAccountOrUpi = 'Customer target account number or UPI ID is required';
    }

    setTxnErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Proceed to Confirmation
  const handleProceedToConfirm = (e) => {
    e.preventDefault();
    if (!validateTxnForm()) return;
    setShowTxnModal(false);
    setShowConfirmModal(true);
  };

  // Save Confirmed Transaction
  const handleConfirmAndSave = async () => {
    try {
      setSavingTxn(true);
      const isO2C = txnForm.transactionType === 'Online to Cash';
      const payload = {
        ...txnForm,
        transactionType: isO2C ? 'Online to Cash' : 'Cash to Online Transfer',
        paymentMode: isO2C ? 'Online to Cash' : 'Cash to Online',
        amount: calculation.grossAmount,
        cashAmount: isO2C ? calculation.netCashAmount : calculation.grossAmount,
        onlineAmount: isO2C ? calculation.grossAmount : calculation.netOnlineAmount,
        netCashAmount: isO2C ? calculation.netCashAmount : 0,
        netOnlineAmount: isO2C ? calculation.grossAmount : calculation.netOnlineAmount,
        commissionAmount: calculation.commissionAmount,
        retailerId: activeRetailerId
      };

      const res = await apiFetch('/api/crm/money-transactions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-retailer-id': activeRetailerId,
          'x-user-id': activeRetailerId
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (data.success && data.transaction) {
        setShowConfirmModal(false);
        await fetchTransactions();
        const isTxnO2C = data.transaction.transactionType === 'Online to Cash';
        const receivedDisplay = isTxnO2C
          ? (data.transaction.onlineAmount || data.transaction.netOnlineAmount)
          : data.transaction.cashAmount;
        const payoutDisplay = isTxnO2C
          ? (data.transaction.netCashAmount || data.transaction.cashAmount)
          : data.transaction.netOnlineAmount;

        Swal.fire({
          icon: 'success',
          title: 'Transaction Recorded!',
          html: `
            <div style="font-size: 14px; text-align: left; background: #f8fafc; padding: 12px; border-radius: 10px; margin-top: 10px;">
              <div><strong>Transaction ID:</strong> ${data.transaction.transactionId}</div>
              <div><strong>Type:</strong> ${isTxnO2C ? '🌐 ➔ 💵 Online to Cash (Payout)' : '💵 ➔ 🌐 Cash to Online Transfer'}</div>
              <div><strong>${isTxnO2C ? 'Online Received' : 'Cash Received'}:</strong> ₹${Number(receivedDisplay || 0).toLocaleString('en-IN')}</div>
              <div><strong>Commission Earned:</strong> ₹${Number(data.transaction.commissionAmount || 0).toLocaleString('en-IN')}</div>
              <div><strong>${isTxnO2C ? 'Net Cash to Customer' : 'Net Online Transfer'}:</strong> ₹${Number(payoutDisplay || 0).toLocaleString('en-IN')}</div>
              <div><strong>Status:</strong> ${data.transaction.status}</div>
            </div>
            <p style="margin-top: 10px; font-size: 12px; color: #64748b;">This entry has automatically been added to My Bill Book.</p>
          `,
          confirmButtonColor: '#059669',
          confirmButtonText: 'Done'
        });
      } else {
        Swal.fire({
          icon: 'error',
          title: 'Transaction Error',
          text: data.message || 'Could not record transaction.'
        });
      }
    } catch (err) {
      console.error('Error saving transaction:', err);
      Swal.fire({ icon: 'error', title: 'Error', text: 'Network error saving transaction.' });
    } finally {
      setSavingTxn(false);
    }
  };

  // Save Business Expense
  const handleSaveExpense = async (e) => {
    e.preventDefault();
    if (!expenseForm.title.trim() || Number(expenseForm.amount) <= 0) {
      Swal.fire({ icon: 'warning', title: 'Invalid Expense', text: 'Please enter title and a valid amount.' });
      return;
    }

    try {
      setSavingExpense(true);
      const res = await apiFetch('/api/crm/expenses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-retailer-id': activeRetailerId,
          'x-user-id': activeRetailerId
        },
        body: JSON.stringify({
          ...expenseForm,
          amount: Number(expenseForm.amount),
          retailerId: activeRetailerId
        })
      });
      const data = await res.json();
      if (data.success) {
        setShowExpenseModal(false);
        setExpenseForm({
          title: '',
          category: 'Other',
          amount: '',
          expenseDate: new Date().toISOString().split('T')[0],
          paymentMode: 'Cash',
          remarks: ''
        });
        await fetchTransactions();
        Swal.fire({
          toast: true,
          position: 'top-end',
          icon: 'success',
          title: 'Business Expense Recorded',
          showConfirmButton: false,
          timer: 1500
        });
      }
    } catch (err) {
      console.error('Error saving expense:', err);
    } finally {
      setSavingExpense(false);
    }
  };

  // Update Status / UTR Modal
  const handleOpenStatusModal = (txn) => {
    setSelectedTxnForStatus({ ...txn });
    setShowStatusModal(true);
  };

  const handleSaveStatusUpdate = async () => {
    if (!selectedTxnForStatus) return;
    try {
      const res = await apiFetch(`/api/crm/money-transactions/${selectedTxnForStatus._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-retailer-id': activeRetailerId,
          'x-user-id': activeRetailerId
        },
        body: JSON.stringify({
          status: selectedTxnForStatus.status,
          referenceNumber: selectedTxnForStatus.referenceNumber,
          remarks: selectedTxnForStatus.remarks
        })
      });
      const data = await res.json();
      if (data.success) {
        setShowStatusModal(false);
        await fetchTransactions();
        Swal.fire({
          toast: true,
          position: 'top-end',
          icon: 'success',
          title: 'Transaction Status Updated',
          showConfirmButton: false,
          timer: 1500
        });
      }
    } catch (err) {
      console.error('Error updating status:', err);
    }
  };

  // Format INR Helper
  const formatInr = (amount) => {
    return '₹' + Number(amount || 0).toLocaleString('en-IN');
  };

  // Format Date Helper
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

  return (
    <div className="crm-money-container">
      {/* 1. Header Banner */}
      <div className="crm-money-header-card">
        <div className="crm-money-header-left">
          <button type="button" className="crm-money-back-btn" onClick={onBack}>
            ← Back to CRM Suite
          </button>
          <div className="crm-money-title-wrap">
            <div className="crm-money-icon-box">💸</div>
            <div>
              <h2>Money Transaction</h2>
              <p>Record cash received, customize commission, execute online settlement debits, and sync to My Bill Book.</p>
            </div>
          </div>
        </div>

        <div className="crm-money-header-actions">
          {onNavigateToBillBook && (
            <button
              type="button"
              className="crm-money-btn crm-money-btn-secondary"
              onClick={onNavigateToBillBook}
            >
              <span>📖</span> My Bill Book
            </button>
          )}
          {onNavigateToBankAccounts && (
            <button
              type="button"
              className="crm-money-btn crm-money-btn-secondary"
              onClick={onNavigateToBankAccounts}
            >
              <span>🏦</span> Bank Accounts ({bankAccounts.length})
            </button>
          )}
          <button
            type="button"
            className="crm-money-btn crm-money-btn-outline"
            onClick={() => setShowExpenseModal(true)}
          >
            <span>📉</span> Record Expense
          </button>
          <button
            type="button"
            className="crm-money-btn crm-money-btn-primary"
            onClick={handleOpenAddTxn}
          >
            <span>➕</span> New Money Transaction
          </button>
          {hasUserAccess(effectivePermissions, 'crm.money.add') && (
            <button
              type="button"
              className="crm-money-btn crm-money-btn-primary"
              onClick={handleOpenAddTxn}
            >
              <span>➕</span> New Money Transaction
            </button>
          )}
        </div>
      </div>

      {/* 2. Top Summary Financial KPI Cards */}
      <div className="crm-money-kpi-grid">
        {/* Card 1: Cash Received */}
        <div className="crm-money-kpi-card card-emerald">
          <div className="kpi-icon">💵</div>
          <div className="kpi-info">
            <span className="kpi-label">Cash Received</span>
            <h3 className="kpi-value">{loading ? '...' : formatInr(summary.totalCashReceived)}</h3>
            <span className="kpi-sub">Total cash received from clients</span>
          </div>
        </div>

        {/* Card 2: Net Online Transferred (Bank Debit) */}
        <div className="crm-money-kpi-card card-blue">
          <div className="kpi-icon">🏦</div>
          <div className="kpi-info">
            <span className="kpi-label">Bank Debit (Online Sent)</span>
            <h3 className="kpi-value">{loading ? '...' : formatInr(summary.totalOnlineTransferred)}</h3>
            <span className="kpi-sub">Transferred online to customer accounts</span>
          </div>
        </div>

        {/* Card 3: Commission Earned */}
        <div className="crm-money-kpi-card card-purple">
          <div className="kpi-icon">💰</div>
          <div className="kpi-info">
            <span className="kpi-label">Commission Earned</span>
            <h3 className="kpi-value" style={{ color: '#7c3aed' }}>
              {loading ? '...' : formatInr(summary.totalCommissionEarned)}
            </h3>
            <span className="kpi-sub">Net retailer profit retention</span>
          </div>
        </div>

        {/* Card 4: Net Cash in Hand */}
        <div className="crm-money-kpi-card card-orange">
          <div className="kpi-icon">💼</div>
          <div className="kpi-info">
            <span className="kpi-label">Cash in Hand</span>
            <h3 className="kpi-value">{loading ? '...' : formatInr(summary.cashBalance)}</h3>
            <span className="kpi-sub">Cash received minus shop expenses</span>
          </div>
        </div>
      </div>

      {/* 3. Toolbar & Filters */}
      <div className="crm-money-toolbar">
        <div className="crm-money-search">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            placeholder="Search by Transaction ID (MTXN...), Customer, Mobile, Bank, UTR..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="search-clear-btn"
              onClick={() => setSearchQuery('')}
            >
              ✕
            </button>
          )}
        </div>

        <div className="crm-money-filters">
          <div className="status-chips">
            {['ALL', 'Successful', 'Pending', 'Failed'].map((st) => (
              <button
                key={st}
                type="button"
                className={`filter-chip ${statusFilter === st ? 'active' : ''}`}
                onClick={() => setStatusFilter(st)}
              >
                {st} {st === 'ALL' ? `(${transactions.length})` : ''}
              </button>
            ))}
          </div>

          <div className="date-filter-group">
            <input
              type="date"
              className="date-input"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              title="Filter from date"
            />
            <span style={{ color: '#94a3b8' }}>to</span>
            <input
              type="date"
              className="date-input"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              title="Filter to date"
            />
            {(startDate || endDate) && (
              <button
                type="button"
                className="date-clear-btn"
                onClick={() => {
                  setStartDate('');
                  setEndDate('');
                }}
                title="Clear date filter"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 4. Transactions Table */}
      <div className="crm-money-table-card">
        <div className="table-header-row">
          <h3 className="table-title">Transaction Records</h3>
          <span className="table-count-badge">
            Showing {transactions.length} record(s)
          </span>
        </div>

        <div className="crm-money-table-wrap">
          <table className="crm-money-table">
            <thead>
              <tr>
                <th>Transaction ID</th>
                <th>Date & Time</th>
                <th>Customer</th>
                <th>Bank Account</th>
                <th style={{ textAlign: 'right' }}>Amount Received</th>
                <th style={{ textAlign: 'right' }}>Commission</th>
                <th style={{ textAlign: 'right' }}>Net Sent / Payout</th>
                <th style={{ textAlign: 'center' }}>Status</th>
                <th>Reference / UTR</th>
                <th style={{ textAlign: 'center', width: '130px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="10" style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                    <div className="crm-spinner" />
                    <p style={{ marginTop: '10px' }}>Loading transactions...</p>
                  </td>
                </tr>
              ) : transactions.length === 0 ? (
                <tr>
                  <td colSpan="10" style={{ textAlign: 'center', padding: '50px 20px', color: '#64748b' }}>
                    <span style={{ fontSize: '36px', display: 'block', marginBottom: '8px' }}>💸</span>
                    <strong style={{ fontSize: '16px', color: '#0f172a' }}>No Money Transactions Found</strong>
                    <p style={{ margin: '6px 0 16px 0', fontSize: '13px' }}>
                      {searchQuery || statusFilter !== 'ALL'
                        ? 'Try clearing search or filters to see all transactions.'
                        : 'Record your first money transaction to start tracking.'}
                    </p>
                    <button
                      type="button"
                      className="crm-money-btn crm-money-btn-primary"
                      onClick={handleOpenAddTxn}
                    >
                      ➕ New Transaction
                    </button>
                  </td>
                </tr>
              ) : (
                transactions.map((t) => (
                  <tr key={t._id}>
                    {/* 1. Transaction ID & Direction */}
                    <td>
                      <span className="txn-id-badge">{t.transactionId}</span>
                      <div style={{ marginTop: '4px' }}>
                        <span className={`crm-direction-pill ${t.transactionType === 'Online to Cash' ? 'online-to-cash' : 'cash-to-online'}`}>
                          {t.transactionType === 'Online to Cash' ? '🌐 ➔ 💵 Online to Cash' : '💵 ➔ 🌐 Cash to Online'}
                        </span>
                      </div>
                    </td>

                    {/* 2. Date */}
                    <td>
                      <span className="txn-date">{formatDateTime(t.transactionDate)}</span>
                    </td>

                    {/* 3. Customer */}
                    <td>
                      <div className="customer-cell">
                        <span className="customer-name">{t.customerName}</span>
                        <span className="customer-mobile">📱 {t.customerMobile}</span>
                        {t.customerUid && (
                          <span className="customer-uid-tag">{t.customerUid}</span>
                        )}
                      </div>
                    </td>

                    {/* 4. Bank Account */}
                    <td>
                      <div className="bank-cell">
                        <span className="bank-name">{t.bankName || 'Direct'}</span>
                        {t.bankAccountNumberMasked && (
                          <span className="bank-masked">{t.bankAccountNumberMasked}</span>
                        )}
                      </div>
                    </td>

                    {/* 5. Amount Received (Cash In or Online In) */}
                    <td style={{ textAlign: 'right' }}>
                      {t.transactionType === 'Online to Cash' ? (
                        <div>
                          <span className="amount-online">{formatInr(t.onlineAmount || t.netOnlineAmount)}</span>
                          <small className="amount-sub-badge online">🌐 Online In</small>
                        </div>
                      ) : (
                        <div>
                          <span className="amount-cash">{formatInr(t.cashAmount)}</span>
                          <small className="amount-sub-badge cash">💵 Cash In</small>
                        </div>
                      )}
                    </td>

                    {/* 6. Commission */}
                    <td style={{ textAlign: 'right' }}>
                      <span className="amount-comm">
                        +{formatInr(t.commissionAmount)}
                        <small className="comm-type-pill">
                          {t.commissionType === 'Percentage' ? `${t.commissionValue}%` : 'Fix'}
                        </small>
                      </span>
                    </td>

                    {/* 7. Net Online Sent / Cash Paid Out */}
                    <td style={{ textAlign: 'right' }}>
                      {t.transactionType === 'Online to Cash' ? (
                        <div>
                          <span className="amount-cash-out">{formatInr(t.netCashAmount || t.cashAmount)}</span>
                          <small className="amount-sub-badge cash">💵 Cash Given</small>
                        </div>
                      ) : (
                        <div>
                          <span className="amount-net">{formatInr(t.netOnlineAmount)}</span>
                          <small className="amount-sub-badge online">🌐 Online Sent</small>
                        </div>
                      )}
                    </td>

                    {/* 8. Status */}
                    <td style={{ textAlign: 'center' }}>
                      <span className={`status-pill status-${(t.status || 'Successful').toLowerCase()}`}>
                        {t.status === 'Successful' ? '✓ ' : t.status === 'Pending' ? '⏳ ' : '✕ '}
                        {t.status}
                      </span>
                    </td>

                    {/* 9. Reference / UTR */}
                    <td>
                      <span className="utr-val">{t.referenceNumber || '—'}</span>
                    </td>

                    {/* 10. Actions */}
                    <td style={{ textAlign: 'center' }}>
                      <div className="table-actions">
                        <button
                          type="button"
                          className="table-action-btn view-btn"
                          title="View Receipt Summary"
                          onClick={() => setShowReceiptModal(t)}
                        >
                          👁️
                        </button>
                        <button
                          type="button"
                          className="table-action-btn edit-btn"
                          title="Update Status / UTR"
                          onClick={() => handleOpenStatusModal(t)}
                        >
                          ✏️
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

      {/* ======================================================================
          MODAL 1: TRANSACTION ENTRY FORM (Two-Way Support)
          ====================================================================== */}
      {showTxnModal && (
        <div className="crm-modal-backdrop" onClick={() => setShowTxnModal(false)}>
          <div className="crm-modal-card txn-modal" onClick={(e) => e.stopPropagation()}>
            <div className="crm-modal-header">
              <div className="modal-title-wrap">
                <span className="modal-icon">{txnForm.transactionType === 'Online to Cash' ? '🌐' : '💸'}</span>
                <div>
                  <h3 className="crm-modal-title">New Money Transaction</h3>
                  <p className="crm-modal-sub">
                    {txnForm.transactionType === 'Online to Cash'
                      ? 'Online payment received from client to cash payout calculation'
                      : 'Cash received from client to online payment remittance calculation'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="crm-modal-close-btn"
                onClick={() => setShowTxnModal(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleProceedToConfirm} className="crm-modal-body">
              {/* Direction Toggle: Cash to Online vs Online to Cash */}
              <div className="crm-direction-toggle-container">
                <button
                  type="button"
                  className={`crm-direction-btn ${txnForm.transactionType === 'Cash to Online Transfer' ? 'active cash-to-online' : ''}`}
                  onClick={() => {
                    setTxnForm(prev => ({
                      ...prev,
                      transactionType: 'Cash to Online Transfer',
                      paymentMode: 'Cash to Online'
                    }));
                    setTxnErrors({});
                  }}
                >
                  <span className="dir-icon">💵 ➔ 🌐</span>
                  <span className="dir-text">
                    <strong>Cash to Online Transfer</strong>
                    <small>Client gives cash, you send online</small>
                  </span>
                </button>

                <button
                  type="button"
                  className={`crm-direction-btn ${txnForm.transactionType === 'Online to Cash' ? 'active online-to-cash' : ''}`}
                  onClick={() => {
                    setTxnForm(prev => ({
                      ...prev,
                      transactionType: 'Online to Cash',
                      paymentMode: 'Online to Cash'
                    }));
                    setTxnErrors({});
                  }}
                >
                  <span className="dir-icon">🌐 ➔ 💵</span>
                  <span className="dir-text">
                    <strong>Online to Cash (Payout)</strong>
                    <small>Client pays online, you give cash</small>
                  </span>
                </button>
              </div>

              {/* Linked Customer Shortcut */}
              {crmCustomers.length > 0 && (
                <div className="form-group full-width customer-picker-banner">
                  <label className="form-label">
                    <span>👥 Pick Existing Customer (Optional)</span>
                    <small style={{ color: '#64748b' }}>— auto-fills Name & Mobile</small>
                  </label>
                  <select
                    className="form-input"
                    value={txnForm.customerUid}
                    onChange={handleSelectCustomer}
                  >
                    <option value="">-- Type new or select registered customer --</option>
                    {crmCustomers.map((c) => (
                      <option key={c.customerUid} value={c.customerUid}>
                        {c.customerName} ({c.customerUid}) — 📱 {c.mobileNumber}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="form-grid">
                {/* 1. Customer Name */}
                <div className="form-group">
                  <label className="form-label">
                    Customer Name <span className="req-star">*</span>
                  </label>
                  <input
                    type="text"
                    className={`form-input ${txnErrors.customerName ? 'has-error' : ''}`}
                    placeholder="e.g. Ramesh Patil"
                    value={txnForm.customerName}
                    onChange={(e) => {
                      setTxnForm({ ...txnForm, customerName: e.target.value });
                      if (txnErrors.customerName) setTxnErrors({ ...txnErrors, customerName: null });
                    }}
                  />
                  {txnErrors.customerName && <span className="error-text">{txnErrors.customerName}</span>}
                </div>

                {/* 2. Customer Mobile */}
                <div className="form-group">
                  <label className="form-label">
                    Customer Mobile Number <span className="req-star">*</span>
                  </label>
                  <input
                    type="tel"
                    className={`form-input ${txnErrors.customerMobile ? 'has-error' : ''}`}
                    placeholder="10-digit mobile number"
                    maxLength={10}
                    value={txnForm.customerMobile}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '');
                      setTxnForm({ ...txnForm, customerMobile: val });
                      if (txnErrors.customerMobile) setTxnErrors({ ...txnErrors, customerMobile: null });
                    }}
                  />
                  {txnErrors.customerMobile && <span className="error-text">{txnErrors.customerMobile}</span>}
                </div>

                {/* 3. Bank Account Selection */}
                <div className="form-group full-width">
                  <label className="form-label">
                    {txnForm.transactionType === 'Online to Cash' ? 'Receiving Bank Account (Credit)' : 'Settlement Bank Account (Debit)'} <span className="req-star">*</span>
                  </label>
                  <select
                    className={`form-input ${txnErrors.bankAccountId ? 'has-error' : ''}`}
                    value={txnForm.bankAccountId}
                    onChange={handleSelectBankAccount}
                  >
                    <option value="">-- Select Retailer Bank Account --</option>
                    {bankAccounts.map((a) => (
                      <option key={a._id} value={a._id}>
                        {a.bankName} ({a.maskedAccountNumber}) — {a.accountHolderName} {a.isDefault ? '⭐ [Default]' : ''}
                      </option>
                    ))}
                  </select>
                  {txnErrors.bankAccountId && <span className="error-text">{txnErrors.bankAccountId}</span>}
                </div>

                {/* 4. Customer Target / Sender Bank Account or UPI */}
                <div className="form-group full-width">
                  <label className="form-label">
                    {txnForm.transactionType === 'Online to Cash'
                      ? 'Customer UPI ID / Sender Account (Optional)'
                      : 'Customer Target Bank Account Number / UPI ID'}
                    {txnForm.transactionType !== 'Online to Cash' && <span className="req-star"> *</span>}
                  </label>
                  <input
                    type="text"
                    className={`form-input ${txnErrors.customerAccountOrUpi ? 'has-error' : ''}`}
                    placeholder={txnForm.transactionType === 'Online to Cash' ? "e.g. customer@okaxis or sender bank account / UTR" : "e.g. 9876543210@paytm or Account Number & IFSC"}
                    value={txnForm.customerAccountOrUpi}
                    onChange={(e) => {
                      setTxnForm({ ...txnForm, customerAccountOrUpi: e.target.value });
                      if (txnErrors.customerAccountOrUpi) setTxnErrors({ ...txnErrors, customerAccountOrUpi: null });
                    }}
                  />
                  {txnErrors.customerAccountOrUpi && (
                    <span className="error-text">{txnErrors.customerAccountOrUpi}</span>
                  )}
                </div>

                {/* 5. Amount Received (Cash or Online) */}
                <div className="form-group">
                  <label className="form-label">
                    {txnForm.transactionType === 'Online to Cash' ? 'Online Amount Received (₹)' : 'Cash Amount Received (₹)'} <span className="req-star">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    className={`form-input ${txnErrors.amount ? 'has-error' : ''}`}
                    placeholder={txnForm.transactionType === 'Online to Cash' ? "e.g. 10000 (transferred to your QR / Bank)" : "e.g. 10000"}
                    value={txnForm.amount !== undefined && txnForm.amount !== '' ? txnForm.amount : (txnForm.transactionType === 'Online to Cash' ? txnForm.onlineAmount : txnForm.cashAmount)}
                    onChange={(e) => {
                      const val = e.target.value;
                      setTxnForm({
                        ...txnForm,
                        amount: val,
                        cashAmount: val,
                        onlineAmount: val
                      });
                      if (txnErrors.amount) setTxnErrors({ ...txnErrors, amount: null });
                    }}
                  />
                  {txnErrors.amount && <span className="error-text">{txnErrors.amount}</span>}
                </div>

                {/* 6. Commission Configuration */}
                <div className="form-group">
                  <label className="form-label">
                    Retailer Commission <span className="req-star">*</span>
                  </label>
                  <div className="comm-input-group">
                    <select
                      className="comm-type-select"
                      value={txnForm.commissionType}
                      onChange={(e) => setTxnForm({ ...txnForm, commissionType: e.target.value })}
                    >
                      <option value="Fixed">Fixed ₹</option>
                      <option value="Percentage">Percentage %</option>
                    </select>
                    <input
                      type="number"
                      min="0"
                      step={txnForm.commissionType === 'Percentage' ? '0.1' : '1'}
                      className={`form-input ${txnErrors.commissionValue ? 'has-error' : ''}`}
                      placeholder={txnForm.commissionType === 'Percentage' ? 'e.g. 2' : 'e.g. 200'}
                      value={txnForm.commissionValue}
                      onChange={(e) => {
                        setTxnForm({ ...txnForm, commissionValue: e.target.value });
                        if (txnErrors.commissionValue) setTxnErrors({ ...txnErrors, commissionValue: null });
                      }}
                    />
                  </div>
                  {txnErrors.commissionValue && <span className="error-text">{txnErrors.commissionValue}</span>}
                </div>
              </div>

              {/* Instant Calculation Breakdown Card (Dynamic Two-Way Formula) */}
              {txnForm.transactionType === 'Online to Cash' ? (
                <div className="calc-summary-box online-to-cash-calc">
                  <div className="calc-item">
                    <span className="calc-title">Online Received:</span>
                    <span className="calc-val text-blue">
                      {formatInr(calculation.grossAmount)}
                    </span>
                  </div>
                  <div className="calc-operator">−</div>
                  <div className="calc-item">
                    <span className="calc-title">Commission Deducted:</span>
                    <span className="calc-val text-purple">
                      {formatInr(calculation.commissionAmount)}
                    </span>
                  </div>
                  <div className="calc-operator">=</div>
                  <div className="calc-item highlight">
                    <span className="calc-title">Net Cash to Customer:</span>
                    <span className="calc-val text-emerald">
                      {formatInr(calculation.netCashAmount)}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="calc-summary-box">
                  <div className="calc-item">
                    <span className="calc-title">Cash Received:</span>
                    <span className="calc-val text-emerald">
                      {formatInr(calculation.grossAmount)}
                    </span>
                  </div>
                  <div className="calc-operator">−</div>
                  <div className="calc-item">
                    <span className="calc-title">Commission Deducted:</span>
                    <span className="calc-val text-purple">
                      {formatInr(calculation.commissionAmount)}
                    </span>
                  </div>
                  <div className="calc-operator">=</div>
                  <div className="calc-item highlight">
                    <span className="calc-title">Net Online Transfer:</span>
                    <span className="calc-val text-blue">
                      {formatInr(calculation.netOnlineAmount)}
                    </span>
                  </div>
                </div>
              )}

              <div className="form-grid" style={{ marginTop: '14px' }}>
                {/* 7. Reference Number / UTR */}
                <div className="form-group">
                  <label className="form-label">
                    {txnForm.transactionType === 'Online to Cash' ? 'Online Payment Reference / UTR (Optional)' : 'Reference Number / UTR (Optional)'}
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. IMPS/NEFT UTR 423456789012"
                    value={txnForm.referenceNumber}
                    onChange={(e) => setTxnForm({ ...txnForm, referenceNumber: e.target.value })}
                  />
                </div>

                {/* 8. Transaction Status */}
                <div className="form-group">
                  <label className="form-label">Transaction Status</label>
                  <select
                    className="form-input"
                    value={txnForm.status}
                    onChange={(e) => setTxnForm({ ...txnForm, status: e.target.value })}
                  >
                    <option value="Successful">Successful (Completed)</option>
                    <option value="Pending">Pending (Processing)</option>
                    <option value="Failed">Failed (Not sent)</option>
                  </select>
                </div>

                {/* 9. Remarks */}
                <div className="form-group full-width">
                  <label className="form-label">Remarks / Note (Optional)</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Emergency family medical fund transfer"
                    value={txnForm.remarks}
                    onChange={(e) => setTxnForm({ ...txnForm, remarks: e.target.value })}
                  />
                </div>
              </div>

              <div className="crm-modal-footer">
                <button
                  type="button"
                  className="crm-money-btn crm-money-btn-secondary"
                  onClick={() => setShowTxnModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="crm-money-btn crm-money-btn-primary"
                >
                  Next: Review & Confirm →
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================================
          MODAL 2: CONFIRMATION SUMMARY MODAL (Two-Way Support)
          ====================================================================== */}
      {showConfirmModal && (
        <div className="crm-modal-backdrop" onClick={() => setShowConfirmModal(false)}>
          <div className="crm-modal-card confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="crm-modal-header" style={{ background: txnForm.transactionType === 'Online to Cash' ? '#f0f9ff' : '#f0fdf4' }}>
              <div className="modal-title-wrap">
                <span className="modal-icon">{txnForm.transactionType === 'Online to Cash' ? '🌐' : '✅'}</span>
                <div>
                  <h3 className="crm-modal-title">
                    {txnForm.transactionType === 'Online to Cash' ? 'Confirm Online to Cash Transaction' : 'Confirm Money Transaction'}
                  </h3>
                  <p className="crm-modal-sub">Please review the financial details carefully before recording</p>
                </div>
              </div>
              <button
                type="button"
                className="crm-modal-close-btn"
                onClick={() => {
                  setShowConfirmModal(false);
                  setShowTxnModal(true);
                }}
              >
                ✕
              </button>
            </div>

            <div className="crm-modal-body">
              <div className="confirm-receipt-card">
                <div className="receipt-row">
                  <span className="r-label">Transaction Type:</span>
                  <span className={`crm-direction-pill ${txnForm.transactionType === 'Online to Cash' ? 'online-to-cash' : 'cash-to-online'}`}>
                    {txnForm.transactionType === 'Online to Cash' ? '🌐 ➔ 💵 Online to Cash (Payout)' : '💵 ➔ 🌐 Cash to Online Transfer'}
                  </span>
                </div>
                <div className="receipt-row">
                  <span className="r-label">Customer Name:</span>
                  <span className="r-val">{txnForm.customerName}</span>
                </div>
                <div className="receipt-row">
                  <span className="r-label">Mobile Number:</span>
                  <span className="r-val">📱 {txnForm.customerMobile}</span>
                </div>
                {txnForm.customerUid && (
                  <div className="receipt-row">
                    <span className="r-label">Customer UID:</span>
                    <span className="r-val mono">{txnForm.customerUid}</span>
                  </div>
                )}
                <div className="receipt-divider" />

                {/* Received Amount */}
                {txnForm.transactionType === 'Online to Cash' ? (
                  <div className="receipt-row highlight-blue">
                    <span className="r-label">Online Received (In Bank):</span>
                    <span className="r-val bold-lg">{formatInr(calculation.grossAmount)}</span>
                  </div>
                ) : (
                  <div className="receipt-row highlight-green">
                    <span className="r-label">Cash Received (In Hand):</span>
                    <span className="r-val bold-lg">{formatInr(calculation.grossAmount)}</span>
                  </div>
                )}

                {/* Commission */}
                <div className="receipt-row highlight-purple">
                  <span className="r-label">
                    Commission Retained ({txnForm.commissionType === 'Percentage' ? `${txnForm.commissionValue}%` : 'Fixed'}):
                  </span>
                  <span className="r-val bold-lg">+{formatInr(calculation.commissionAmount)}</span>
                </div>

                {/* Net Payout / Transfer */}
                {txnForm.transactionType === 'Online to Cash' ? (
                  <div className="receipt-row highlight-green">
                    <span className="r-label">Net Cash to Customer:</span>
                    <span className="r-val bold-lg">{formatInr(calculation.netCashAmount)}</span>
                  </div>
                ) : (
                  <div className="receipt-row highlight-blue">
                    <span className="r-label">Net Online Transfer Amount:</span>
                    <span className="r-val bold-lg">{formatInr(calculation.netOnlineAmount)}</span>
                  </div>
                )}
                <div className="receipt-divider" />

                <div className="receipt-row">
                  <span className="r-label">
                    {txnForm.transactionType === 'Online to Cash' ? 'Receiving Bank Account:' : 'Settlement Bank Account:'}
                  </span>
                  <span className="r-val">{txnForm.bankName || 'Direct Account'}</span>
                </div>

                <div className="receipt-row">
                  <span className="r-label">
                    {txnForm.transactionType === 'Online to Cash' ? 'Customer Sender UPI / Ref:' : 'Customer Target Bank / UPI:'}
                  </span>
                  <span className="r-val mono">{txnForm.customerAccountOrUpi || '—'}</span>
                </div>

                {txnForm.referenceNumber && (
                  <div className="receipt-row">
                    <span className="r-label">UTR / Reference No:</span>
                    <span className="r-val mono">{txnForm.referenceNumber}</span>
                  </div>
                )}

                <div className="receipt-row">
                  <span className="r-label">Recording Status:</span>
                  <span className={`status-pill status-${txnForm.status.toLowerCase()}`}>
                    {txnForm.status}
                  </span>
                </div>
              </div>

              <div className="confirm-notice-box">
                <span>ℹ️</span>
                <p>
                  <strong>Recorded Financial Entry:</strong>{' '}
                  {txnForm.transactionType === 'Online to Cash'
                    ? 'This records online payment received into your bank account and net cash handed over to customer from cash in hand. Confirming will synchronize this transaction into My Bill Book.'
                    : 'This records the customer cash receipt and debit against your settlement bank account in the ledger. Confirming will synchronize this transaction into My Bill Book.'}
                </p>
              </div>

              <div className="crm-modal-footer">
                <button
                  type="button"
                  className="crm-money-btn crm-money-btn-secondary"
                  onClick={() => {
                    setShowConfirmModal(false);
                    setShowTxnModal(true);
                  }}
                  disabled={savingTxn}
                >
                  ← Edit Details
                </button>
                <button
                  type="button"
                  className="crm-money-btn crm-money-btn-primary"
                  onClick={handleConfirmAndSave}
                  disabled={savingTxn}
                >
                  {savingTxn ? 'Recording...' : '✓ Confirm & Record Transaction'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================================
          MODAL 3: VIEW RECEIPT DETAILS (Two-Way Support)
          ====================================================================== */}
      {showReceiptModal && (
        <div className="crm-modal-backdrop" onClick={() => setShowReceiptModal(null)}>
          <div className="crm-modal-card receipt-view-modal" onClick={(e) => e.stopPropagation()}>
            <div className="crm-modal-header">
              <div className="modal-title-wrap">
                <span className="modal-icon">🧾</span>
                <div>
                  <h3 className="crm-modal-title">Transaction Receipt</h3>
                  <p className="crm-modal-sub">ID: {showReceiptModal.transactionId}</p>
                </div>
              </div>
              <button
                type="button"
                className="crm-modal-close-btn"
                onClick={() => setShowReceiptModal(null)}
              >
                ✕
              </button>
            </div>

            <div className="crm-modal-body">
              <div className="confirm-receipt-card">
                <div className="receipt-row">
                  <span className="r-label">Transaction ID:</span>
                  <span className="r-val mono">{showReceiptModal.transactionId}</span>
                </div>
                <div className="receipt-row">
                  <span className="r-label">Transaction Type:</span>
                  <span className={`crm-direction-pill ${showReceiptModal.transactionType === 'Online to Cash' ? 'online-to-cash' : 'cash-to-online'}`}>
                    {showReceiptModal.transactionType === 'Online to Cash' ? '🌐 ➔ 💵 Online to Cash (Payout)' : '💵 ➔ 🌐 Cash to Online Transfer'}
                  </span>
                </div>
                <div className="receipt-row">
                  <span className="r-label">Date & Time:</span>
                  <span className="r-val">{formatDateTime(showReceiptModal.transactionDate)}</span>
                </div>
                <div className="receipt-row">
                  <span className="r-label">Customer Name:</span>
                  <span className="r-val">{showReceiptModal.customerName}</span>
                </div>
                <div className="receipt-row">
                  <span className="r-label">Customer Mobile:</span>
                  <span className="r-val">📱 {showReceiptModal.customerMobile}</span>
                </div>
                {showReceiptModal.customerUid && (
                  <div className="receipt-row">
                    <span className="r-label">Customer UID:</span>
                    <span className="r-val mono">{showReceiptModal.customerUid}</span>
                  </div>
                )}
                <div className="receipt-divider" />

                {/* Received Amount */}
                {showReceiptModal.transactionType === 'Online to Cash' ? (
                  <div className="receipt-row highlight-blue">
                    <span className="r-label">Online Received:</span>
                    <span className="r-val bold-lg">{formatInr(showReceiptModal.onlineAmount || showReceiptModal.netOnlineAmount)}</span>
                  </div>
                ) : (
                  <div className="receipt-row highlight-green">
                    <span className="r-label">Cash Received:</span>
                    <span className="r-val bold-lg">{formatInr(showReceiptModal.cashAmount)}</span>
                  </div>
                )}

                {/* Commission */}
                <div className="receipt-row highlight-purple">
                  <span className="r-label">Commission Earned:</span>
                  <span className="r-val bold-lg">+{formatInr(showReceiptModal.commissionAmount)}</span>
                </div>

                {/* Net Payout / Transfer */}
                {showReceiptModal.transactionType === 'Online to Cash' ? (
                  <div className="receipt-row highlight-green">
                    <span className="r-label">Net Cash to Customer:</span>
                    <span className="r-val bold-lg">{formatInr(showReceiptModal.netCashAmount || showReceiptModal.cashAmount)}</span>
                  </div>
                ) : (
                  <div className="receipt-row highlight-blue">
                    <span className="r-label">Net Online Transfer:</span>
                    <span className="r-val bold-lg">{formatInr(showReceiptModal.netOnlineAmount)}</span>
                  </div>
                )}
                <div className="receipt-divider" />

                <div className="receipt-row">
                  <span className="r-label">
                    {showReceiptModal.transactionType === 'Online to Cash' ? 'Receiving Bank Name:' : 'Settlement Bank Name:'}
                  </span>
                  <span className="r-val">{showReceiptModal.bankName}</span>
                </div>

                <div className="receipt-row">
                  <span className="r-label">
                    {showReceiptModal.transactionType === 'Online to Cash' ? 'Customer Sender UPI / Ref:' : 'Customer Target Account / UPI:'}
                  </span>
                  <span className="r-val mono">{showReceiptModal.customerAccountOrUpi || '—'}</span>
                </div>

                <div className="receipt-row">
                  <span className="r-label">Reference / UTR:</span>
                  <span className="r-val mono">{showReceiptModal.referenceNumber || '—'}</span>
                </div>

                <div className="receipt-row">
                  <span className="r-label">Status:</span>
                  <span className={`status-pill status-${showReceiptModal.status.toLowerCase()}`}>
                    {showReceiptModal.status}
                  </span>
                </div>

                {showReceiptModal.remarks && (
                  <div className="receipt-row">
                    <span className="r-label">Remarks:</span>
                    <span className="r-val">{showReceiptModal.remarks}</span>
                  </div>
                )}
              </div>

              <div className="crm-modal-footer">
                <button
                  type="button"
                  className="crm-money-btn crm-money-btn-secondary"
                  onClick={() => setShowReceiptModal(null)}
                >
                  Close
                </button>
                <button
                  type="button"
                  className="crm-money-btn crm-money-btn-primary"
                  onClick={() => {
                    const t = showReceiptModal;
                    setShowReceiptModal(null);
                    handleOpenStatusModal(t);
                  }}
                >
                  ✏️ Update Status / UTR
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================================
          MODAL 4: UPDATE STATUS & REFERENCE / UTR
          ====================================================================== */}
      {showStatusModal && selectedTxnForStatus && (
        <div className="crm-modal-backdrop" onClick={() => setShowStatusModal(false)}>
          <div className="crm-modal-card status-modal" onClick={(e) => e.stopPropagation()}>
            <div className="crm-modal-header">
              <div className="modal-title-wrap">
                <span className="modal-icon">✏️</span>
                <div>
                  <h3 className="crm-modal-title">Update Transaction Status</h3>
                  <p className="crm-modal-sub">{selectedTxnForStatus.transactionId} — {selectedTxnForStatus.customerName}</p>
                </div>
              </div>
              <button
                type="button"
                className="crm-modal-close-btn"
                onClick={() => setShowStatusModal(false)}
              >
                ✕
              </button>
            </div>

            <div className="crm-modal-body">
              <div className="form-group" style={{ marginBottom: '14px' }}>
                <label className="form-label">Transaction Status</label>
                <select
                  className="form-input"
                  value={selectedTxnForStatus.status}
                  onChange={(e) => setSelectedTxnForStatus({ ...selectedTxnForStatus, status: e.target.value })}
                >
                  <option value="Successful">Successful (Completed)</option>
                  <option value="Pending">Pending (Processing)</option>
                  <option value="Failed">Failed (Not sent)</option>
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: '14px' }}>
                <label className="form-label">Reference Number / UTR</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Enter bank transaction reference / UTR"
                  value={selectedTxnForStatus.referenceNumber || ''}
                  onChange={(e) => setSelectedTxnForStatus({ ...selectedTxnForStatus, referenceNumber: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Remarks</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Optional update note"
                  value={selectedTxnForStatus.remarks || ''}
                  onChange={(e) => setSelectedTxnForStatus({ ...selectedTxnForStatus, remarks: e.target.value })}
                />
              </div>

              <div className="crm-modal-footer">
                <button
                  type="button"
                  className="crm-money-btn crm-money-btn-secondary"
                  onClick={() => setShowStatusModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="crm-money-btn crm-money-btn-primary"
                  onClick={handleSaveStatusUpdate}
                >
                  ✓ Save Status Update
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================================
          MODAL 5: RECORD BUSINESS EXPENSE (Section 7 Requirement)
          ====================================================================== */}
      {showExpenseModal && (
        <div className="crm-modal-backdrop" onClick={() => setShowExpenseModal(false)}>
          <div className="crm-modal-card expense-modal" onClick={(e) => e.stopPropagation()}>
            <div className="crm-modal-header" style={{ background: '#fef2f2' }}>
              <div className="modal-title-wrap">
                <span className="modal-icon">📉</span>
                <div>
                  <h3 className="crm-modal-title">Record Business Expense</h3>
                  <p className="crm-modal-sub">Recorded expenses feed directly into Profit & Loss reporting in My Bill Book</p>
                </div>
              </div>
              <button
                type="button"
                className="crm-modal-close-btn"
                onClick={() => setShowExpenseModal(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveExpense} className="crm-modal-body">
              <div className="form-grid">
                <div className="form-group full-width">
                  <label className="form-label">
                    Expense Title / Description <span className="req-star">*</span>
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Shop Electricity Bill, Stationery, Rent, Refreshments"
                    value={expenseForm.title}
                    onChange={(e) => setExpenseForm({ ...expenseForm, title: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Category</label>
                  <select
                    className="form-input"
                    value={expenseForm.category}
                    onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}
                  >
                    <option value="Shop Rent">Shop Rent</option>
                    <option value="Electricity">Electricity</option>
                    <option value="Internet / Phone">Internet / Phone</option>
                    <option value="Stationery">Stationery</option>
                    <option value="Tea / Refreshments">Tea / Refreshments</option>
                    <option value="Salaries">Salaries</option>
                    <option value="Maintenance">Maintenance</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">
                    Amount (₹) <span className="req-star">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    className="form-input"
                    placeholder="e.g. 500"
                    value={expenseForm.amount}
                    onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Date</label>
                  <input
                    type="date"
                    className="form-input"
                    value={expenseForm.expenseDate}
                    onChange={(e) => setExpenseForm({ ...expenseForm, expenseDate: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Payment Mode</label>
                  <select
                    className="form-input"
                    value={expenseForm.paymentMode}
                    onChange={(e) => setExpenseForm({ ...expenseForm, paymentMode: e.target.value })}
                  >
                    <option value="Cash">Cash</option>
                    <option value="Bank Account">Bank Account</option>
                    <option value="UPI">UPI</option>
                  </select>
                </div>

                <div className="form-group full-width">
                  <label className="form-label">Remarks (Optional)</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Additional details..."
                    value={expenseForm.remarks}
                    onChange={(e) => setExpenseForm({ ...expenseForm, remarks: e.target.value })}
                  />
                </div>
              </div>

              <div className="crm-modal-footer">
                <button
                  type="button"
                  className="crm-money-btn crm-money-btn-secondary"
                  onClick={() => setShowExpenseModal(false)}
                  disabled={savingExpense}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="crm-money-btn crm-money-btn-primary"
                  style={{ background: '#dc2626' }}
                  disabled={savingExpense}
                >
                  {savingExpense ? 'Recording...' : '✓ Record Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
