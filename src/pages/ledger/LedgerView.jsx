import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import './LedgerView.css';
import { API_URL } from '../../utils/apiClient';
import { hasUserAccess, getStoredUserPermissions } from '../../utils/userPermissions';

const Toast = Swal.mixin({
  toast: true,
  position: 'top-end',
  showConfirmButton: false,
  timer: 5000,
  timerProgressBar: true,
  background: '#181b20',
  color: '#f8fafc',
  iconColor: '#ea580c'
});

const LedgerView = ({ currentUser = 'RETAILER_USER_001', inlineMode = false, userPermissions }) => {
  const effectivePermissions = userPermissions || getStoredUserPermissions();
  const navigate = useNavigate();

  const [transactions, setTransactions] = useState([]);
  const [paySprintBalance, setPaySprintBalance] = useState(null);
  const [loadingLedger, setLoadingLedger] = useState(false);
  const [showFilters, setShowFilters] = useState(true);

  // Filter States
  const [searchKeywords, setSearchKeywords] = useState('');
  const [txType, setTxType] = useState('All Types');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [specificMonth, setSpecificMonth] = useState('');

  const [walletBalance, setWalletBalance] = useState(0);

  // Fetch Wallet & PaySprint Balances
  useEffect(() => {
    if (currentUser) {
      fetch(`${API_URL}/api/users/${currentUser}`)
        .then(res => res.json())
        .then(data => {
          if (data && data.walletBalance !== undefined) {
            setWalletBalance(data.walletBalance);
          }
        })
        .catch(err => console.error("Error fetching user balance:", err));
    }

    fetch(`${API_URL}/api/admin/paysprint-setting`)
      .then(res => res.json())
      .then(data => {
        if (data && data.wallet !== undefined) {
          setPaySprintBalance(data.wallet);
        }
      })
      .catch(err => console.error("Error fetching PaySprint balance:", err));
  }, [currentUser]);

  const fetchLedger = useCallback(() => {
    if (!currentUser) return;
    setLoadingLedger(true);

    let url = `${API_URL}/api/wallet-transactions/report?userId=${encodeURIComponent(currentUser)}`;
    if (searchKeywords) url += `&search=${encodeURIComponent(searchKeywords)}`;
    if (txType && txType !== 'All Types') url += `&transactionType=${encodeURIComponent(txType)}`;
    if (startDate) url += `&startDate=${encodeURIComponent(startDate)}`;
    if (endDate) url += `&endDate=${encodeURIComponent(endDate)}`;
    if (specificMonth) url += `&month=${encodeURIComponent(specificMonth)}`;

    fetch(url)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setTransactions(data);
        } else {
          setTransactions([]);
        }
        setLoadingLedger(false);
      })
      .catch(err => {
        console.error("Error loading transactions:", err);
        setLoadingLedger(false);
      });
  }, [currentUser, searchKeywords, txType, startDate, endDate, specificMonth]);

  useEffect(() => {
    fetchLedger();
  }, [fetchLedger]);

  const handleResetFilters = () => {
    setSearchKeywords('');
    setTxType('All Types');
    setStartDate('');
    setEndDate('');
    setSpecificMonth('');
  };

  const handleExportCSV = () => {
    if (!hasUserAccess(effectivePermissions, 'ledger.exportPdf')) {
      Toast.fire({ icon: 'error', title: 'Export permission restricted by administrator.' });
      return;
    }
    if (transactions.length === 0) {
      Toast.fire({ icon: 'warning', title: 'No transactions to export.' });
      return;
    }

    const headers = ['Date & Time', 'Transaction Type', 'Description', 'Reference Number', 'Amount (INR)', 'Balance After (INR)', 'Status'];
    const rows = transactions.map(tx => [
      `"${new Date(tx.createdAt).toLocaleString()}"`,
      `"${tx.transactionType}"`,
      `"${(tx.description || '').replace(/"/g, '""')}"`,
      `"${tx.referenceNumber}"`,
      tx.amount,
      tx.balanceAfter,
      `"${tx.status}"`
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Wallet_Ledger_${currentUser || 'report'}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    Toast.fire({ icon: 'success', title: 'CSV Report downloaded successfully!' });
  };

  const handlePrintPDF = () => {
    if (!hasUserAccess(effectivePermissions, 'ledger.exportPdf')) {
      Toast.fire({ icon: 'error', title: 'Print / Export permission restricted by administrator.' });
      return;
    }
    if (transactions.length === 0) {
      Toast.fire({ icon: 'warning', title: 'No transactions to print.' });
      return;
    }

    const printWindow = window.open('', '_blank');
    const html = `
      <html>
        <head>
          <title>Wallet Ledger Report - ${currentUser}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; color: #1e293b; }
            h2 { color: #3f2b96; margin-bottom: 4px; }
            .meta { font-size: 13px; color: #64748b; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th, td { border: 1px solid #cbd5e1; padding: 10px; text-align: left; font-size: 12px; }
            th { background-color: #f1f5f9; font-weight: bold; }
            .credit { color: #047857; font-weight: bold; }
            .debit { color: #dc2626; font-weight: bold; }
          </style>
        </head>
        <body>
          <h2>My Wallet Ledger Report</h2>
          <div class="meta">
            User: <strong>${currentUser}</strong> | Generated On: ${new Date().toLocaleString()} <br/>
            Local Wallet Balance: <strong>₹${parseFloat(walletBalance || 0).toFixed(2)}</strong> | PaySprint UAT Balance: <strong>₹${parseFloat(paySprintBalance || 0).toFixed(2)}</strong>
          </div>
          <table>
            <thead>
              <tr>
                <th>Date & Time</th>
                <th>Description</th>
                <th>Reference No</th>
                <th>Type</th>
                <th>Amount (₹)</th>
                <th>Balance After (₹)</th>
              </tr>
            </thead>
            <tbody>
              ${transactions.map(tx => `
                <tr>
                  <td>${new Date(tx.createdAt).toLocaleString()}</td>
                  <td>${tx.description || '-'}</td>
                  <td>${tx.referenceNumber}</td>
                  <td>${tx.transactionType}</td>
                  <td class="${tx.transactionType === 'Credit' ? 'credit' : 'debit'}">
                    ${tx.transactionType === 'Credit' ? '+' : '-'} ₹${parseFloat(tx.amount || 0).toFixed(2)}
                  </td>
                  <td>₹${parseFloat(tx.balanceAfter || 0).toFixed(2)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </body>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 500);
  };

  return (
    <div className="ledger-page-container">
      {/* Page Header */}
      <div className="ledger-header-card">
        <div className="ledger-title-area">
          <div className="ledger-icon-badge">📒</div>
          <div>
            <h2 className="ledger-page-title">Wallet Ledger & Transaction History</h2>
            <p className="ledger-page-subtitle">View, filter and export your complete wallet ledger statement for {currentUser}</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button className="ledger-refresh-btn" onClick={() => navigate('/dashboard')} title="Back to Main Dashboard">
            ⬅️ Back to Dashboard
          </button>
          <button className="ledger-refresh-btn" onClick={fetchLedger} title="Refresh Ledger Data">
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* Top Balance Summary Cards */}
      <div className="ledger-balance-cards-grid">
        <div className="ledger-balance-card card-local">
          <div className="balance-card-inner-left">
            <span className="balance-icon">💼</span>
            <div>
              <span className="ledger-balance-card-label">Local Wallet Balance</span>
              <div className="ledger-balance-amount">₹{parseFloat(walletBalance || 0).toFixed(2)}</div>
            </div>
          </div>
          <span className="ledger-badge-green">ACTIVE</span>
        </div>

        <div className="ledger-balance-card card-paysprint">
          <div className="balance-card-inner-left">
            <span className="balance-icon">🔗</span>
            <div>
              <span className="ledger-balance-card-label">PaySprint UAT Balance</span>
              <div className="ledger-balance-amount">₹{parseFloat(paySprintBalance || 0).toFixed(2)}</div>
            </div>
          </div>
          <span className="ledger-badge-purple">CONNECTED</span>
        </div>

        <div className="ledger-balance-card card-count">
          <div className="balance-card-inner-left">
            <span className="balance-icon">📊</span>
            <div>
              <span className="ledger-balance-card-label">Total Transactions</span>
              <div className="ledger-balance-amount">{transactions.length} Records</div>
            </div>
          </div>
          <span className="ledger-badge-amber">FILTERED</span>
        </div>
      </div>

      {/* Filter & Export Section */}
      <div className="ledger-filter-card">
        <div
          className="ledger-filter-header"
          onClick={() => setShowFilters(!showFilters)}
        >
          <div className="ledger-filter-title">
            🔍 Filter & Export Reports
          </div>
          <div className="ledger-filter-chevron">
            {showFilters ? '▲' : '▼'}
          </div>
        </div>

        {showFilters && (
          <div className="ledger-filter-content">
            <div className="ledger-filter-grid">
              
              <div className="ledger-field-group">
                <label>Search Keywords</label>
                <input
                  type="text"
                  className="ledger-filter-input"
                  placeholder="Search reference, desc..."
                  value={searchKeywords}
                  onChange={e => setSearchKeywords(e.target.value)}
                />
              </div>

              <div className="ledger-field-group">
                <label>Tx Type</label>
                <select
                  className="ledger-filter-input"
                  value={txType}
                  onChange={e => setTxType(e.target.value)}
                >
                  <option value="All Types">All Types</option>
                  <option value="Credit">Credit</option>
                  <option value="Debit">Debit</option>
                </select>
              </div>

              <div className="ledger-field-group">
                <label>Start Date</label>
                <input
                  type="date"
                  className="ledger-filter-input"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                />
              </div>

              <div className="ledger-field-group">
                <label>End Date</label>
                <input
                  type="date"
                  className="ledger-filter-input"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                />
              </div>

              <div className="ledger-field-group">
                <label>Specific Month</label>
                <input
                  type="month"
                  className="ledger-filter-input"
                  value={specificMonth}
                  onChange={e => setSpecificMonth(e.target.value)}
                />
              </div>

            </div>

            <div className="ledger-filter-actions-row">
              {hasUserAccess(effectivePermissions, 'ledger.filter') && (
                <button
                  type="button"
                  className="ledger-btn-reset"
                  onClick={handleResetFilters}
                >
                  Reset Filters
                </button>
              )}

              {hasUserAccess(effectivePermissions, 'ledger.exportPdf') && (
                <div className="ledger-export-btns">
                  <button
                    type="button"
                    className="ledger-btn-export-csv"
                    onClick={handleExportCSV}
                  >
                    📥 Export CSV
                  </button>
                  <button
                    type="button"
                    className="ledger-btn-print-pdf"
                    onClick={handlePrintPDF}
                  >
                    🖨️ Print PDF
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Transactions List */}
      <div className="ledger-list-wrapper">
        {loadingLedger ? (
          <div className="ledger-loading-state">
            <div className="spinner"></div>
            <span>Loading transactions history...</span>
          </div>
        ) : transactions.length === 0 ? (
          <div className="ledger-empty-state">
            <div className="ledger-empty-icon">📑</div>
            <div className="ledger-empty-title">No Ledger Transactions Found</div>
            <div className="ledger-empty-sub">Try resetting filters or searching with different parameters</div>
          </div>
        ) : (
          <div className="ledger-table-card">
            <div className="ledger-table-header-row">
              <div className="col-date">DATE & TIME</div>
              <div className="col-desc">DESCRIPTION & REF</div>
              <div className="col-type">TYPE</div>
              <div className="col-status">STATUS</div>
              <div className="col-amount">AMOUNT (₹)</div>
              <div className="col-bal">BALANCE AFTER</div>
            </div>

            <div className="ledger-table-body">
              {transactions.map((tx, idx) => {
                const isCredit = tx.transactionType === 'Credit';
                const isSuccess = tx.status === 'Success';
                const isPending = tx.status === 'Pending';
                return (
                  <div key={tx._id || tx.id || idx} className="ledger-table-row">
                    <div className="col-date">
                      <div className="date-main">{new Date(tx.createdAt).toLocaleDateString()}</div>
                      <div className="time-sub">{new Date(tx.createdAt).toLocaleTimeString()}</div>
                    </div>

                    <div className="col-desc">
                      <div className="desc-title">{tx.description || 'Wallet Transaction'}</div>
                      <div className="ref-code">Ref: {tx.referenceNumber || 'N/A'}</div>
                    </div>

                    <div className="col-type">
                      <span className={`type-badge ${isCredit ? 'credit' : 'debit'}`}>
                        {isCredit ? '📥 CREDIT' : '📤 DEBIT'}
                      </span>
                    </div>

                    <div className="col-status">
                      <span className={`ledger-status-badge ${isSuccess ? 'status-success' : isPending ? 'status-pending' : 'status-failed'}`}>
                        {isSuccess ? '✓ SUCCESS' : isPending ? '⏳ PENDING' : tx.status || 'FAILED'}
                      </span>
                    </div>

                    <div className="col-amount">
                      <span className={`amount-text ${isCredit ? 'credit' : 'debit'}`}>
                        {isCredit ? '+' : '-'} ₹{parseFloat(tx.amount || 0).toFixed(2)}
                      </span>
                    </div>

                    <div className="col-bal">
                      <span className="balance-badge">
                        ₹{parseFloat(tx.balanceAfter || 0).toFixed(2)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LedgerView;
