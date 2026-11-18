import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import './AdminPanel.css';
import { ALL_INDIAN_STATES, ALL_INDIAN_DISTRICTS, PROOF_OF_IDENTITY_OPTIONS, PROOF_OF_ADDRESS_OPTIONS, PROOF_OF_DOB_OPTIONS } from '../../utils/indiaData';

import Form49APdfTemplate, { generateForm49APdf, getCleanLastName, getIndividualCapacity } from '../pancard/Form49APdfGenerator';
import { generatePanCrPdf } from '../pancard/PanCrPdfGenerator';
import { Form49ADirectEditModal } from '../pancard/Form49ADirectEditModal';
import { API_URL, apiFetch } from '../../utils/apiClient';
import NotificationBell from '../../context/NotificationBell';
import { exportSinglePanApplicationToExcel } from '../../utils/exportPanToExcel';
import logoImg from '../../assets/logo.png';
import { DYNAMIC_LINK_MENUS, getDynamicMenuForSidebarItem, toMenuKey, getCustomMenuIcons, setCustomMenuIcon } from '../../utils/dynamicLinkMenus';
import { normalizePermissions } from '../../utils/userPermissions';
import OfflineFormsManager from './OfflineFormsManager';
import OfflineSubmissionsManager from './OfflineSubmissionsManager';
import ServiceLogsPanel from './ServiceLogsPanel';
import AdminCustomerManagement from './AdminCustomerManagement';

const showCustomToast = (title, text = '', icon = 'success', duration = 5000) => {
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
  let forceRemoveTimer = null;

  const dismiss = () => {
    if (timer) clearTimeout(timer);
    if (forceRemoveTimer) clearTimeout(forceRemoveTimer);
    toastContainer.style.opacity = '0';
    toastContainer.style.transform = 'translateY(-15px) scale(0.95)';
    toastContainer.style.pointerEvents = 'none';
    setTimeout(() => {
      try {
        if (toastContainer && toastContainer.parentNode) {
          toastContainer.parentNode.removeChild(toastContainer);
        } else if (toastContainer && typeof toastContainer.remove === 'function') {
          toastContainer.remove();
        }
      } catch (e) {}
    }, 250);
  };

  toastContainer.onclick = dismiss;
  const toastCloseBtn = toastContainer.querySelector('[title="Close"]');
  if (toastCloseBtn) {
    toastCloseBtn.onclick = (e) => {
      e.stopPropagation();
      dismiss();
    };
  }

  const toastDuration = (duration && Number(duration) > 0) ? Number(duration) : 5000;
  timer = setTimeout(dismiss, toastDuration);

  forceRemoveTimer = setTimeout(() => {
    try {
      const el = document.getElementById('custom-app-toast-container');
      if (el) el.remove();
    } catch (e) {}
  }, toastDuration + 300);
};

const Toast = {
  fire: (opts = {}) => {
    const title = opts.title || opts.text || 'Notification';
    const text = (opts.title && opts.text) ? opts.text : '';
    const icon = opts.icon || 'success';
    const duration = opts.timer || 5000;
    showCustomToast(title, text, icon, duration);
  }
};

const cleanApplicantTitle = (nameStr) => {
  if (!nameStr || typeof nameStr !== 'string') return nameStr || '—';
  const str = nameStr.trim();
  const cleaned = str.replace(/^(KUMARI|KUMAR|SHRI|SMT|MR|MRS|MS|DR|MISS)\.?\s+/i, '').trim();
  return cleaned || str;
};

const getApplicantDisplayFullName = (app) => {
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
  const catStr = String(d.category || app.category || d.applicantStatus || app.applicantStatus || '').toUpperCase();
  const nonIndTypes = ['COMPANY', 'FIRM', 'TRUST', 'HUF', 'HINDU', 'ASSOCIATION', 'AOP', 'BODY', 'BOI', 'LOCAL', 'ARTIFICIAL', 'AJP', 'GOVERNMENT', 'LIMITED', 'LLP'];
  const isNonIndiv = nonIndTypes.some(t => catStr.includes(t)) || (catStr !== '' && catStr !== 'INDIVIDUAL');

  const district = (d.district && d.district !== 'SELECT') ? d.district : (app.district || '—');
  const state = (d.state && d.state !== 'PLEASE SELECT') ? d.state : (app.state || 'MAHARASHTRA');

  let text;
  if (isNonIndiv) {
    const entityName = d.entityName || app.applicantName || d.lastName || '—';
    const incDate = d.dateOfIncorporation || app.dob || d.dob || '—';
    const regNum = d.registrationNumber || d.cin || d.llpin || '—';
    const verName = d.verifierName || d.raName || app.fatherName || '—';
    const verCap = d.verifierCapacity || d.designation || 'DIRECTOR';
    const verPlace = d.verifierPlace || d.place || district || '—';
    const verDate = d.verifierDate || d.date || (app.createdAt ? new Date(app.createdAt).toLocaleDateString() : '—');

    text = [
      `=== PAN APPLICATION DETAILS (NON-INDIVIDUAL) ===`,
      `Ack Number: ${app.ackNumber || 'N/A'}`,
      `Submitted By: ${app.userId || app.userMobile || 'Retailer'}`,
      `Status: ${(app.status || 'Submitted').toUpperCase()}`,
      `Service Type: ${app.applicationType || 'Manual New PAN'}`,
      `Date Submitted: ${app.createdAt ? new Date(app.createdAt).toLocaleString() : 'N/A'}`,
      app.nsdlReceiptNumber ? `NSDL Receipt / Remark: ${app.nsdlReceiptNumber}` : '',
      app.adminRemarks ? `Admin Remarks: ${app.adminRemarks}` : '',
      ``,
      `--- ENTITY PARTICULARS ---`,
      `Category of Applicant: ${catStr || 'COMPANY'}`,
      `Name of Entity / Company / Firm: ${entityName}`,
      `Date of Incorporation: ${incDate}`,
      `Registration / CIN / LLPIN Number: ${regNum}`,
      (app.panNumber || d.panNumber) ? `Existing PAN Number: ${app.panNumber || d.panNumber}` : '',
      `Mobile Number: ${app.mobileNumber || d.mobileNumber || '—'}`,
      `Email Address: ${app.email || d.email || '—'}`,
      `Source of Income: ${d.incomeSource || d.sourceOfIncome || d.sourceofincome || 'BUSINESS / PROFESSION'}`,
      ``,
      `--- AUTHORIZED REPRESENTATIVE / SIGNATORY ---`,
      `Authorized Signatory Name: ${verName}`,
      `Capacity / Designation: ${verCap}`,
      `Place: ${verPlace}`,
      `Date: ${verDate}`,
      ``,
      `--- REGISTERED / OFFICE ADDRESS ---`,
      `Flat/Door/Block: ${(d.officeAddress && d.officeAddress.flatNo) || d.flatNo || '—'}`,
      `Building/Premises: ${(d.officeAddress && d.officeAddress.premises) || d.premises || '—'}`,
      `Road/Street: ${(d.officeAddress && d.officeAddress.roadStreet) || d.roadStreet || '—'}`,
      `Area/Taluka: ${(d.officeAddress && d.officeAddress.areaTaluka) || d.areaTaluka || '—'}`,
      `District: ${(d.officeAddress && d.officeAddress.district) || district}`,
      `State: ${(d.officeAddress && d.officeAddress.state) || state}`,
      `Pincode: ${(d.officeAddress && d.officeAddress.pincode) || d.pincode || '—'}`,
      `===============================================`
    ].filter(line => line !== false && line !== undefined && line !== '').join('\n');
  } else {
    const fullName = [d.firstName, d.middleName, d.lastName || app.applicantName].filter(Boolean).join(' ') || app.applicantName || '—';
    const fatherName = app.fatherName || `${d.fatherFirstName || ''} ${d.fatherMiddleName || ''} ${d.fatherLastName || ''}`.trim() || '—';
    const motherName = `${d.motherFirstName || ''} ${d.motherMiddleName || ''} ${d.motherLastName || ''}`.trim() || '—';

    text = [
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
  }

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

// ─── Fees Ledger Tab Component ────────────────────────────────────────────────
const FeesLedgerTab = ({ title, icon, color, applicationType, transactions = [], loading = false, onRefresh, canExport = true }) => {
  const [search, setSearch] = React.useState('');
  const [typeFilter, setTypeFilter] = React.useState('All');
  const [statusFilter, setStatusFilter] = React.useState('All');
  const [startDate, setStartDate] = React.useState('');
  const [endDate, setEndDate] = React.useState('');
  const [currentPage, setCurrentPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(15);
  const [currentTheme, setCurrentTheme] = React.useState(() => localStorage.getItem('appTheme') || 'light');

  React.useEffect(() => {
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

  const isDark = currentTheme === 'dark' || (typeof document !== 'undefined' && (document.body.classList.contains('dark-theme') || document.documentElement.classList.contains('dark')));

  const filtered = React.useMemo(() => {
    return (transactions || []).filter(tx => {
      const q = search.toLowerCase();
      const matchSearch = !q ||
        (tx.userId || '').toLowerCase().includes(q) ||
        (tx.description || '').toLowerCase().includes(q) ||
        (tx.referenceNumber || '').toLowerCase().includes(q) ||
        (tx.status || '').toLowerCase().includes(q) ||
        (tx.transactionType || '').toLowerCase().includes(q) ||
        (tx.amount != null && tx.amount.toString().includes(q));
      const matchType = typeFilter === 'All' || (tx.transactionType || '').toLowerCase() === typeFilter.toLowerCase();
      const matchStatus = statusFilter === 'All' || (tx.status || '').toLowerCase() === statusFilter.toLowerCase();
      const txDate = tx.createdAt ? new Date(tx.createdAt) : null;
      const matchStart = !startDate || (txDate && txDate >= new Date(startDate));
      const matchEnd = !endDate || (txDate && txDate <= new Date(endDate + 'T23:59:59'));
      return matchSearch && matchType && matchStatus && matchStart && matchEnd;
    });
  }, [transactions, search, typeFilter, statusFilter, startDate, endDate]);

  const totalTransactions = filtered.length;
  const totalDebit = filtered
    .filter(t => t.transactionType === 'Debit')
    .reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);
  const totalCredit = filtered
    .filter(t => t.transactionType === 'Credit')
    .reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);
  const netFees = totalDebit - totalCredit;

  const totalPages = Math.ceil(filtered.length / pageSize) || 1;
  const validPage = Math.min(currentPage, totalPages);
  const startIndex = (validPage - 1) * pageSize;
  const paginatedTransactions = filtered.slice(startIndex, startIndex + pageSize);

  const handleExportCSV = () => {
    if (filtered.length === 0) return;
    const headers = ['S.No', 'Date & Time', 'Retailer ID', 'Type', 'Amount (Rs)', 'Balance Before (Rs)', 'Balance After (Rs)', 'Description', 'Reference No', 'Status'];
    const rows = filtered.map((tx, i) => [
      i + 1,
      tx.createdAt ? `"${new Date(tx.createdAt).toLocaleString()}"` : '-',
      `"${tx.userId || '-'}"`,
      `"${tx.transactionType || '-'}"`,
      parseFloat(tx.amount || 0).toFixed(2),
      parseFloat(tx.balanceBefore || 0).toFixed(2),
      parseFloat(tx.balanceAfter || 0).toFixed(2),
      `"${(tx.description || '-').replace(/"/g, '""')}"`,
      `"${(tx.referenceNumber || '-').replace(/"/g, '""')}"`,
      `"${tx.status || '-'}"`
    ]);
    const csv = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csv));
    link.setAttribute('download', `Fees_Ledger_${applicationType}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    const w = window.open('', '_blank');
    w.document.write(`
      <html><head><title>${title}</title>
      <style>
        body{font-family:Arial,sans-serif;padding:24px;color:#1e293b}
        h2{color:${color};margin-bottom:4px}
        .meta{font-size:13px;color:#64748b;margin-bottom:18px}
        .summary{display:flex;gap:15px;margin-bottom:16px}
        .sum-card{padding:10px 14px;border:1px solid #cbd5e1;border-radius:8px;font-size:12px;background:#f8fafc}
        table{width:100%;border-collapse:collapse;margin-top:10px}
        th,td{border:1px solid #cbd5e1;padding:8px 10px;text-align:left;font-size:11px}
        th{background:#f1f5f9;font-weight:700}
        .credit{color:#15803d;font-weight:bold}
        .debit{color:#dc2626;font-weight:bold}
        .total{margin-top:14px;font-size:14px;font-weight:800;color:${color}}
      </style></head><body>
      <h2>${icon} ${title}</h2>
      <div class="meta">Generated: ${new Date().toLocaleString()} | Total Transactions: <strong>${filtered.length}</strong></div>
      <div class="summary">
        <div class="sum-card"><strong>Total Debit (Deducted):</strong> <span class="debit">₹${totalDebit.toFixed(2)}</span></div>
        <div class="sum-card"><strong>Total Credit (Refunded):</strong> <span class="credit">₹${totalCredit.toFixed(2)}</span></div>
        <div class="sum-card"><strong>Net Collected Fees:</strong> <strong>₹${netFees.toFixed(2)}</strong></div>
      </div>
      <table>
        <thead><tr><th>S.No</th><th>Date & Time</th><th>Retailer ID</th><th>Type</th><th>Amount (₹)</th><th>Bal Before</th><th>Bal After</th><th>Description</th><th>Reference No</th><th>Status</th></tr></thead>
        <tbody>
          ${filtered.map((tx, i) => `<tr>
            <td>${i + 1}</td>
            <td>${tx.createdAt ? new Date(tx.createdAt).toLocaleString() : '-'}</td>
            <td><strong>${tx.userId || '-'}</strong></td>
            <td><span class="${tx.transactionType === 'Credit' ? 'credit' : 'debit'}">${tx.transactionType || '-'}</span></td>
            <td class="${tx.transactionType === 'Credit' ? 'credit' : 'debit'}">${tx.transactionType === 'Credit' ? '+' : '-'} ₹${parseFloat(tx.amount || 0).toFixed(2)}</td>
            <td>₹${parseFloat(tx.balanceBefore || 0).toFixed(2)}</td>
            <td>₹${parseFloat(tx.balanceAfter || 0).toFixed(2)}</td>
            <td>${tx.description || '-'}</td>
            <td>${tx.referenceNumber || '-'}</td>
            <td>${tx.status || '-'}</td>
          </tr>`).join('')}
        </tbody>
      </table>
      <div class="total">Net Collected Fees: ₹${netFees.toFixed(2)}</div>
      </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 400);
  };

  return (
    <div className="admin-card" style={{ display: 'flex', flexDirection: 'column', gap: '20px', minHeight: '500px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2.5px solid #f1f5f9', paddingBottom: '15px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ background: `linear-gradient(135deg, ${color} 0%, ${color}cc 100%)`, width: '44px', height: '44px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', color: 'white' }}>
            {icon}
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: isDark ? '#f8fafc' : '#1e293b' }}>{title}</h3>
            <p style={{ margin: '2px 0 0', fontSize: '13px', color: isDark ? '#cbd5e1' : '#64748b' }}>Live Credit (+) &amp; Debit (-) Ledger History from Retailer Wallets</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {onRefresh && (
            <button onClick={onRefresh} style={{ padding: '8px 16px', background: isDark ? '#334155' : '#f1f5f9', color: isDark ? '#f8fafc' : '#334155', border: isDark ? '1px solid #475569' : '1px solid #cbd5e1', borderRadius: '8px', fontSize: '13px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
              🔄 Refresh
            </button>
          )}
          {canExport && (
            <>
              <button onClick={handleExportCSV} style={{ padding: '8px 16px', background: 'linear-gradient(135deg,#10b981,#059669)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 800, cursor: 'pointer' }}>
                📥 Export CSV
              </button>
              <button onClick={handlePrint} style={{ padding: '8px 16px', background: 'linear-gradient(135deg,#8b5cf6,#7c3aed)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 800, cursor: 'pointer' }}>
                🖨️ Print PDF
              </button>
            </>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px' }}>
        {[
          { label: 'Total Transactions', value: totalTransactions, bg: isDark ? 'rgba(59, 130, 246, 0.15)' : '#eff6ff', border: isDark ? 'rgba(59, 130, 246, 0.3)' : '#bfdbfe', textColor: isDark ? '#60a5fa' : '#1d4ed8', icon: '📋' },
          { label: 'Total Debit (Fee Deductions)', value: `₹${totalDebit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, bg: isDark ? 'rgba(239, 68, 68, 0.15)' : '#fef2f2', border: isDark ? 'rgba(239, 68, 68, 0.3)' : '#fecaca', textColor: isDark ? '#f87171' : '#dc2626', icon: '📉' },
          { label: 'Total Credit (Refunds / Add)', value: `₹${totalCredit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, bg: isDark ? 'rgba(16, 185, 129, 0.15)' : '#f0fdf4', border: isDark ? 'rgba(16, 185, 129, 0.3)' : '#bbf7d0', textColor: isDark ? '#34d399' : '#15803d', icon: '📈' },
          { label: 'Net Fees Collected', value: `₹${netFees.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, bg: isDark ? 'rgba(168, 85, 247, 0.15)' : '#faf5ff', border: isDark ? 'rgba(168, 85, 247, 0.3)' : '#e9d5ff', textColor: isDark ? '#c084fc' : '#7c3aed', icon: '💰' },
        ].map((card, i) => (
          <div key={i} style={{ background: card.bg, border: `1.5px solid ${card.border}`, borderRadius: '12px', padding: '16px 18px' }}>
            <div style={{ fontSize: '22px', marginBottom: '6px' }}>{card.icon}</div>
            <div style={{ fontSize: '13px', color: isDark ? '#cbd5e1' : '#64748b', fontWeight: 600 }}>{card.label}</div>
            <div style={{ fontSize: '20px', fontWeight: 900, color: card.textColor, marginTop: '4px' }}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ background: isDark ? '#1e293b' : '#f8fafc', border: isDark ? '1px solid #334155' : '1px solid #e2e8f0', borderRadius: '12px', padding: '16px 18px', display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 160px' }}>
          <label style={{ fontSize: '12px', fontWeight: 700, color: isDark ? '#cbd5e1' : '#475569' }}>🔍 Search</label>
          <input type="text" placeholder="Retailer / Desc / Ref..." value={search} onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
            style={{ padding: '8px 12px', border: isDark ? '1.5px solid #475569' : '1.5px solid #cbd5e1', background: isDark ? '#0f172a' : '#ffffff', color: isDark ? '#f8fafc' : '#0f172a', borderRadius: '8px', fontSize: '13px', outline: 'none' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 130px' }}>
          <label style={{ fontSize: '12px', fontWeight: 700, color: isDark ? '#cbd5e1' : '#475569' }}>Tx Type</label>
          <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setCurrentPage(1); }}
            style={{ padding: '8px 12px', border: isDark ? '1.5px solid #475569' : '1.5px solid #cbd5e1', background: isDark ? '#0f172a' : '#ffffff', color: isDark ? '#f8fafc' : '#0f172a', borderRadius: '8px', fontSize: '13px', outline: 'none' }}>
            <option value="All">All Types</option>
            <option value="Debit">Debit (-)</option>
            <option value="Credit">Credit (+)</option>
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 130px' }}>
          <label style={{ fontSize: '12px', fontWeight: 700, color: isDark ? '#cbd5e1' : '#475569' }}>Status</label>
          <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setCurrentPage(1); }}
            style={{ padding: '8px 12px', border: isDark ? '1.5px solid #475569' : '1.5px solid #cbd5e1', background: isDark ? '#0f172a' : '#ffffff', color: isDark ? '#f8fafc' : '#0f172a', borderRadius: '8px', fontSize: '13px', outline: 'none' }}>
            <option value="All">All Statuses</option>
            <option value="Success">Success</option>
            <option value="Pending">Pending</option>
            <option value="Failed">Failed</option>
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 140px' }}>
          <label style={{ fontSize: '12px', fontWeight: 700, color: isDark ? '#cbd5e1' : '#475569' }}>From Date</label>
          <input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); setCurrentPage(1); }}
            style={{ padding: '8px 12px', border: isDark ? '1.5px solid #475569' : '1.5px solid #cbd5e1', background: isDark ? '#0f172a' : '#ffffff', color: isDark ? '#f8fafc' : '#0f172a', borderRadius: '8px', fontSize: '13px', outline: 'none' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 140px' }}>
          <label style={{ fontSize: '12px', fontWeight: 700, color: isDark ? '#cbd5e1' : '#475569' }}>To Date</label>
          <input type="date" value={endDate} onChange={e => { setEndDate(e.target.value); setCurrentPage(1); }}
            style={{ padding: '8px 12px', border: isDark ? '1.5px solid #475569' : '1.5px solid #cbd5e1', background: isDark ? '#0f172a' : '#ffffff', color: isDark ? '#f8fafc' : '#0f172a', borderRadius: '8px', fontSize: '13px', outline: 'none' }} />
        </div>
        <button onClick={() => { setSearch(''); setTypeFilter('All'); setStatusFilter('All'); setStartDate(''); setEndDate(''); setCurrentPage(1); }}
          style={{ padding: '8px 16px', background: isDark ? '#334155' : '#f1f5f9', color: isDark ? '#f8fafc' : '#475569', border: isDark ? '1px solid #475569' : '1px solid #cbd5e1', borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', alignSelf: 'flex-end' }}>
          ↺ Reset
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '48px 20px', color: '#64748b' }}>
          <div style={{ display: 'inline-block', width: '28px', height: '28px', border: '3px solid #cbd5e1', borderTopColor: color, borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          <div style={{ marginTop: '10px', fontSize: '14px', fontWeight: 700 }}>Loading ledger transactions...</div>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 20px', color: '#94a3b8' }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>{icon}</div>
          <div style={{ fontSize: '16px', fontWeight: 700 }}>No transactions found</div>
          <div style={{ fontSize: '13px', marginTop: '6px' }}>Try adjusting search or date filters</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ overflowX: 'auto', borderRadius: '12px', border: isDark ? '1px solid #334155' : '1px solid #e2e8f0' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: isDark ? '#1e293b' : '#f1f5f9' }}>
                  {['S.No', 'Date & Time', 'Retailer ID', 'Type', 'Amount (₹)', 'Balance Before', 'Balance After', 'Description', 'Reference No', 'Status'].map(h => (
                    <th key={h} style={{ padding: '11px 14px', textAlign: 'left', fontWeight: 800, color: isDark ? '#f8fafc' : '#334155', borderBottom: isDark ? '2px solid #334155' : '2px solid #e2e8f0', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginatedTransactions.map((tx, i) => {
                  const isCredit = tx.transactionType === 'Credit';
                  const status = tx.status || 'Success';
                  const statusColors = { Success: { bg: isDark ? 'rgba(16, 185, 129, 0.2)' : '#f0fdf4', color: isDark ? '#34d399' : '#15803d' }, Failed: { bg: isDark ? 'rgba(239, 68, 68, 0.2)' : '#fef2f2', color: isDark ? '#f87171' : '#dc2626' }, Pending: { bg: isDark ? 'rgba(245, 158, 11, 0.2)' : '#fefce8', color: isDark ? '#fbbf24' : '#b45309' } };
                  const sc = statusColors[status] || { bg: isDark ? '#1e293b' : '#f8fafc', color: isDark ? '#cbd5e1' : '#475569' };
                  const rowBg = i % 2 === 0 ? (isDark ? '#0f172a' : '#ffffff') : (isDark ? '#1e293b' : '#f8fafc');
                  const hoverBg = isDark ? '#334155' : '#f0f9ff';
                  return (
                    <tr key={tx._id || i} style={{ borderBottom: isDark ? '1px solid #1e293b' : '1px solid #f1f5f9', background: rowBg }}
                      onMouseEnter={e => e.currentTarget.style.background = hoverBg}
                      onMouseLeave={e => e.currentTarget.style.background = rowBg}>
                      <td style={{ padding: '10px 14px', color: isDark ? '#94a3b8' : '#64748b', fontWeight: 600 }}>{startIndex + i + 1}</td>
                      <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', fontSize: '12.5px', fontWeight: 600, color: isDark ? '#f1f5f9' : '#1e293b' }}>{tx.createdAt ? new Date(tx.createdAt).toLocaleString() : '-'}</td>
                      <td style={{ padding: '10px 14px', fontWeight: 700, color: isDark ? '#f8fafc' : '#1e293b' }}>{tx.userId || '-'}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{
                          background: isCredit ? (isDark ? 'rgba(16, 185, 129, 0.2)' : '#f0fdf4') : (isDark ? 'rgba(239, 68, 68, 0.2)' : '#fef2f2'),
                          color: isCredit ? (isDark ? '#34d399' : '#15803d') : (isDark ? '#f87171' : '#dc2626'),
                          border: `1px solid ${isCredit ? (isDark ? 'rgba(16, 185, 129, 0.4)' : '#bbf7d0') : (isDark ? 'rgba(239, 68, 68, 0.4)' : '#fecaca')}`,
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontSize: '11.5px',
                          fontWeight: 800
                        }}>
                          {isCredit ? '+ CREDIT' : '- DEBIT'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', fontWeight: 800, color: isCredit ? (isDark ? '#34d399' : '#15803d') : (isDark ? '#f87171' : '#dc2626'), whiteSpace: 'nowrap' }}>
                        {isCredit ? '+' : '-'} ₹{parseFloat(tx.amount || 0).toFixed(2)}
                      </td>
                      <td style={{ padding: '10px 14px', color: isDark ? '#94a3b8' : '#64748b' }}>₹{parseFloat(tx.balanceBefore || 0).toFixed(2)}</td>
                      <td style={{ padding: '10px 14px', fontWeight: 700, color: isDark ? '#e2e8f0' : '#334155' }}>₹{parseFloat(tx.balanceAfter || 0).toFixed(2)}</td>
                      <td style={{ padding: '10px 14px', maxWidth: '280px', wordBreak: 'break-word', fontSize: '12.5px', fontWeight: 600, color: isDark ? '#e2e8f0' : '#334155' }}>{tx.description || '-'}</td>
                      <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: '12px', color: isDark ? '#cbd5e1' : '#475569' }}>
                        <span style={{ background: isDark ? '#1e293b' : '#f1f5f9', padding: '2px 6px', borderRadius: '4px', border: isDark ? '1px solid #334155' : '1px solid #e2e8f0', color: isDark ? '#f8fafc' : '#475569' }}>
                          {tx.referenceNumber || '-'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ background: sc.bg, color: sc.color, padding: '3px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 800 }}>{status}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: '#f1f5f9', borderTop: '2px solid #e2e8f0' }}>
                  <td colSpan={4} style={{ padding: '11px 14px', fontWeight: 800, color: '#334155', textAlign: 'right' }}>
                    TOTALS (Filtered {filtered.length} txs):
                  </td>
                  <td style={{ padding: '11px 14px', fontWeight: 900, fontSize: '14px', color: '#15803d', whiteSpace: 'nowrap' }}>
                    Net: ₹{netFees.toFixed(2)}
                  </td>
                  <td colSpan={5} style={{ padding: '11px 14px', fontSize: '12.5px', color: '#475569', fontWeight: 600 }}>
                    Debit: <strong style={{ color: '#dc2626' }}>₹{totalDebit.toFixed(2)}</strong> | Credit: <strong style={{ color: '#15803d' }}>₹{totalCredit.toFixed(2)}</strong>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '10px 16px',
              background: '#f8fafc',
              borderRadius: '10px',
              border: '1px solid #e2e8f0',
              flexWrap: 'wrap',
              gap: '10px'
            }}>
              <div style={{ fontSize: '12.5px', color: '#475569', fontWeight: 600 }}>
                Showing <strong>{filtered.length === 0 ? 0 : startIndex + 1}</strong> to <strong>{Math.min(startIndex + pageSize, filtered.length)}</strong> of <strong>{filtered.length}</strong> transactions
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button
                  disabled={validPage === 1}
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  style={{
                    padding: '6px 12px',
                    border: '1px solid #cbd5e1',
                    borderRadius: '6px',
                    background: validPage === 1 ? '#f1f5f9' : 'white',
                    color: validPage === 1 ? '#94a3b8' : '#334155',
                    cursor: validPage === 1 ? 'not-allowed' : 'pointer',
                    fontSize: '12px',
                    fontWeight: 700
                  }}>
                  ◀ Previous
                </button>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#334155', padding: '0 6px' }}>
                  Page {validPage} of {totalPages}
                </span>
                <button
                  disabled={validPage >= totalPages}
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  style={{
                    padding: '6px 12px',
                    border: '1px solid #cbd5e1',
                    borderRadius: '6px',
                    background: validPage >= totalPages ? '#f1f5f9' : 'white',
                    color: validPage >= totalPages ? '#94a3b8' : '#334155',
                    cursor: validPage >= totalPages ? 'not-allowed' : 'pointer',
                    fontSize: '12px',
                    fontWeight: 700
                  }}>
                  Next ▶
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
// ─────────────────────────────────────────────────────────────────────────────

const AdminPanel = () => {
  const navigate = useNavigate();
  // Role & Staff Permissions (SessionStorage prioritized over localStorage for tab isolation)
  const getAuthValue = (key) => sessionStorage.getItem(key) || localStorage.getItem(key);

  const [userRole] = useState(() => getAuthValue('userRole') || 'admin');
  const [staffName, setStaffName] = useState(() => getAuthValue('staffName') || '');
  const [staffPermissions, setStaffPermissions] = useState(() => {
    try {
      return JSON.parse(getAuthValue('staffPermissions') || '[]');
    } catch (e) {
      return [];
    }
  });

  // Sync live staff permissions from backend dynamically
  useEffect(() => {
    if (userRole === 'staff') {
      const currentStaffUsername = getAuthValue('currentUser');
      if (currentStaffUsername && currentStaffUsername !== 'admin') {
        fetch(`${API_URL}/api/staff/profile/${encodeURIComponent(currentStaffUsername)}`)
          .then(res => res.json())
          .then(data => {
            if (data.success && data.staff) {
              const livePerms = data.staff.permissions || [];
              setStaffPermissions(livePerms);
              if (data.staff.name) setStaffName(data.staff.name);
              sessionStorage.setItem('staffPermissions', JSON.stringify(livePerms));
              if (data.staff.name) sessionStorage.setItem('staffName', data.staff.name);
              localStorage.setItem('staffPermissions', JSON.stringify(livePerms));
              if (data.staff.name) localStorage.setItem('staffName', data.staff.name);
            }
          })
          .catch(err => console.error('Failed to sync staff permissions:', err));
      }
    }
  }, [userRole]);

  const [activeTab, setActiveTab] = useState(() => {
    const savedTab = sessionStorage.getItem('adminPanelActiveTab');
    const role = getAuthValue('userRole') || 'admin';
    if (role === 'staff') {
      try {
        const perms = JSON.parse(getAuthValue('staffPermissions') || '[]');
        if (savedTab) {
          const hasAccess = perms.includes(savedTab) || perms.some(p => p.startsWith(savedTab + '.'));
          if (hasAccess) return savedTab;
        }
        if (perms.length > 0) {
          const first = perms[0];
          return first.includes('.') ? first.split('.')[0] : first;
        }
        return '';
      } catch (e) {
        return '';
      }
    }
    return savedTab || 'actionCards';
  });

  // Filter links on the frontend by menuKey as a reliable safety net.
  // This guarantees each tab only shows its own links even if the backend
  // returns unfiltered data (e.g. older production backend without menuKey support).
  const filterLinksByMenuKey = (data, menuKey) => {
    if (!Array.isArray(data)) return [];
    if (!menuKey || menuKey === 'quickLinks') {
      return data.filter(l => !l.menuKey || l.menuKey === '' || l.menuKey === 'quickLinks');
    }
    return data.filter(l => l.menuKey === menuKey);
  };

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    sessionStorage.setItem('adminPanelActiveTab', tabId);
    const isLinkTab = tabId === 'quickLinks' || dynamicLinkMenusList.some(m => m.key === tabId) || DYNAMIC_LINK_MENUS.some(m => m.key === tabId);
    if (isLinkTab) {
      apiFetch(`/api/quick-links?menuKey=${tabId}`).then(res => res.json()).then(data => {
        setQuickLinks(filterLinksByMenuKey(data, tabId));
      }).catch(err => console.error('Failed to load links:', err));
    }
  };

  const [isUiSubmenuOpen, setIsUiSubmenuOpen] = useState(false);
  const [isDynamicMenusOpen, setIsDynamicMenusOpen] = useState(false);
  const [isPanSubmenuOpen, setIsPanSubmenuOpen] = useState(false);
  const [isOfflineSubmenuOpen, setIsOfflineSubmenuOpen] = useState(false);
  const [isFeesSubmenuOpen, setIsFeesSubmenuOpen] = useState(false);
  const [isLedgerSubmenuOpen, setIsLedgerSubmenuOpen] = useState(false);


  // Protect Admin Panel - redirect unauthenticated users to Admin Login
  useEffect(() => {
    const adminAuth = getAuthValue('adminAuth');
    if (adminAuth !== 'true') {
      navigate('/admin-login');
    }
  }, [navigate]);

  // Ensure staff cannot access unauthorized tabs
  useEffect(() => {
    if (userRole === 'staff') {
      const perms = staffPermissions || [];
      if (perms.length > 0) {
        const hasAccess = perms.includes(activeTab) || perms.some(p => p.startsWith(activeTab + '.'));
        if (!hasAccess) {
          const firstRoot = perms[0].split('.')[0];
          setActiveTab(firstRoot);
          sessionStorage.setItem('adminPanelActiveTab', firstRoot);
        }
      }
    }
  }, [userRole, staffPermissions, activeTab]);

  // Staff Management State (Admin only)
  const [staffList, setStaffList] = useState([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [staffSearch, setStaffSearch] = useState('');
  const [staffStatusFilter, setStaffStatusFilter] = useState('ALL');
  const [staffViewMode, setStaffViewMode] = useState('GRID'); // 'GRID' | 'TABLE' | 'BOTH'
  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);
  const [editingStaffId, setEditingStaffId] = useState(null);
  const [staffFormData, setStaffFormData] = useState({
    name: '',
    username: '',
    password: '',
    email: '',
    mobile: '',
    permissions: [],
    isActive: true
  });

  const [collapsedStaffModules, setCollapsedStaffModules] = useState({});

  const AVAILABLE_STAFF_MODULES = [
    {
      id: 'actionCards',
      label: 'Action Cards',
      icon: '💳',
      subPermissions: [
        { id: 'actionCards.add', label: 'Add New Card', icon: '➕' },
        { id: 'actionCards.edit', label: 'Edit Card', icon: '✏️' },
        { id: 'actionCards.delete', label: 'Delete Card', icon: '🗑️' },
      ]
    },
    {
      id: 'topTabs',
      label: 'Top Tabs',
      icon: '📑',
      subPermissions: [
        { id: 'topTabs.add', label: 'Add Top Tab', icon: '➕' },
        { id: 'topTabs.edit', label: 'Edit Tab', icon: '✏️' },
        { id: 'topTabs.delete', label: 'Delete Tab', icon: '🗑️' },
      ]
    },
    {
      id: 'sidebarMenus',
      label: 'Sidebar Menus',
      icon: '☰',
      subPermissions: [
        { id: 'sidebarMenus.add', label: 'Add Menu', icon: '➕' },
        { id: 'sidebarMenus.edit', label: 'Edit Menu', icon: '✏️' },
        { id: 'sidebarMenus.delete', label: 'Delete Menu', icon: '🗑️' },
      ]
    },
    {
      id: 'crmCards',
      label: 'CRM Management',
      icon: '👥',
      subPermissions: [
        { id: 'crmCards.add', label: 'Add CRM Card', icon: '➕' },
        { id: 'crmCards.edit', label: 'Edit CRM Card & Toggle', icon: '✏️' },
        { id: 'crmCards.delete', label: 'Delete CRM Card', icon: '🗑️' },
      ]
    },
    {
      id: 'banners',
      label: 'Banners',
      icon: '🖼️',
      subPermissions: [
        { id: 'banners.add', label: 'Add Banner', icon: '➕' },
        { id: 'banners.delete', label: 'Delete Banner', icon: '🗑️' },
      ]
    },
    {
      id: 'newsImages',
      label: 'Login News Images',
      icon: '📰',
      subPermissions: [
        { id: 'newsImages.upload', label: 'Upload Images', icon: '📤' },
        { id: 'newsImages.delete', label: 'Delete Image', icon: '🗑️' },
      ]
    },
    {
      id: 'quickLinks',
      label: 'Quick Links',
      icon: '🔗',
      subPermissions: [
        { id: 'quickLinks.add', label: 'Add Quick Link', icon: '➕' },
        { id: 'quickLinks.edit', label: 'Edit Quick Link', icon: '✏️' },
        { id: 'quickLinks.delete', label: 'Delete Quick Link', icon: '🗑️' },
      ]
    },
    {
      id: 'panSubmissions',
      label: 'Retailer PAN Submissions',
      icon: '📇',
      subPermissions: [
        { id: 'panSubmissions.view', label: 'View & Filter List', icon: '👁️' },
        { id: 'panSubmissions.edit', label: 'Direct Edit Form 49A', icon: '✏️' },
        { id: 'panSubmissions.status', label: 'Update Status & Remarks', icon: '🔄' },
        { id: 'panSubmissions.receipt', label: 'Upload & Send Receipt', icon: '📤' },
        { id: 'panSubmissions.docs', label: 'View Documents', icon: '📄' },
        { id: 'panSubmissions.export', label: 'Download PDF & Excel', icon: '📥' },
      ]
    },
    {
      id: 'panForms',
      label: 'PAN Form Manager',
      icon: '📝',
      subPermissions: [
        { id: 'panForms.addTab', label: 'Add Service Tab', icon: '➕' },
        { id: 'panForms.editTab', label: 'Edit Tab & Fee', icon: '✏️' },
        { id: 'panForms.deleteTab', label: 'Delete Tab', icon: '🗑️' },
        { id: 'panForms.fields', label: 'Manage Form Fields', icon: '⚙️' },
      ]
    },
    {
      id: 'offlineSubmissions',
      label: 'Retailer Offline Submissions',
      icon: '📁',
      subPermissions: [
        { id: 'offlineSubmissions.view', label: 'View & Filter List', icon: '👁️' },
        { id: 'offlineSubmissions.status', label: 'Update Status & Remarks', icon: '🔄' },
        { id: 'offlineSubmissions.receipt', label: 'Upload & Send Receipt', icon: '📤' },
        { id: 'offlineSubmissions.docs', label: 'View Documents', icon: '📄' },
      ]
    },
    {
      id: 'offlineForms',
      label: 'Offline Form Manager',
      icon: '📑',
      subPermissions: [
        { id: 'offlineForms.addTab', label: 'Add Service Tab', icon: '➕' },
        { id: 'offlineForms.editTab', label: 'Edit Tab & Fee', icon: '✏️' },
        { id: 'offlineForms.deleteTab', label: 'Delete Tab', icon: '🗑️' },
        { id: 'offlineForms.fields', label: 'Manage Form Fields', icon: '⚙️' },
      ]
    },
    {
      id: 'walletRequests',
      label: 'Wallet Requests',
      icon: '💼',
      subPermissions: [
        { id: 'walletRequests.approve', label: 'Approve Requisition', icon: '✅' },
        { id: 'walletRequests.reject', label: 'Reject Requisition', icon: '❌' },
        { id: 'walletRequests.edit', label: 'Edit Requisition', icon: '✏️' },
        { id: 'walletRequests.upiConfig', label: 'UPI Scanner Config', icon: '⚙️' },
      ]
    },
    {
      id: 'ledgerHistory',
      label: 'Ledger History',
      icon: '📒',
      subPermissions: [
        { id: 'ledgerHistory.view', label: 'View & Filter Transactions', icon: '👁️' },
        { id: 'ledgerHistory.export', label: 'Export Excel & PDF', icon: '📥' },
        { id: 'ledgerHistory.import', label: 'Import CSV Ledger', icon: '📤' },
      ]
    },
    {
      id: 'users',
      label: 'User Management',
      icon: '👥',
      subPermissions: [
        { id: 'users.view', label: 'View & Search Users', icon: '👁️' },
        { id: 'users.create', label: 'Create New User', icon: '➕' },
        { id: 'users.approve', label: 'Approve / Reject Users', icon: '⚖️' },
        { id: 'users.delete', label: 'Remove / Delete User', icon: '🗑️' },
      ]
    },
    {
      id: 'customerManagement',
      label: 'Customer Management',
      icon: '📇',
      subPermissions: [
        { id: 'customerManagement.view', label: 'View All Customers', icon: '👁️' },
      ]
    },
    {
      id: 'feesNewApplication',
      label: 'Fees – PAN New Application',
      icon: '📄',
      subPermissions: [
        { id: 'feesNewApplication.view', label: 'View Ledger & Totals', icon: '👁️' },
        { id: 'feesNewApplication.export', label: 'Export CSV & Print PDF', icon: '📥' },
      ]
    },
    {
      id: 'feesCorrection',
      label: 'Fees – PAN Correction',
      icon: '✏️',
      subPermissions: [
        { id: 'feesCorrection.view', label: 'View Ledger & Totals', icon: '👁️' },
        { id: 'feesCorrection.export', label: 'Export CSV & Print PDF', icon: '📥' },
      ]
    },
    {
      id: 'payInHistory',
      label: 'Pay-In History',
      icon: '📥',
      subPermissions: [
        { id: 'payInHistory.view', label: 'View Pay-In Ledger', icon: '👁️' },
        { id: 'payInHistory.export', label: 'Export CSV & Print PDF', icon: '📥' },
      ]
    },
    {
      id: 'payOutHistory',
      label: 'Pay-Out History',
      icon: '📤',
      subPermissions: [
        { id: 'payOutHistory.view', label: 'View Pay-Out Ledger', icon: '👁️' },
        { id: 'payOutHistory.export', label: 'Export CSV & Print PDF', icon: '📥' },
      ]
    },
  ];

  const AVAILABLE_USER_MODULES = [
    {
      id: 'panCard',
      label: 'PAN Card Services',
      icon: '📇',
      subPermissions: [
        { id: 'pan.manualNew', label: 'Physical New PAN (Form 49A / Form 93)', icon: '📝' },
        { id: 'pan.epanKyc', label: 'Instant E-PAN KYC (Biometric / OTP)', icon: '⚡' },
        { id: 'pan.epanCorrectionOtp', label: 'Paperless E-Pan Correction (OTP Base)', icon: '⚡' },
        { id: 'pan.epanSignPhoto', label: 'Paperless E-Pan (Upload Photo & Sign)', icon: '📸' },
        { id: 'pan.epanCorrectionSignPhoto', label: 'Paperless E-Pan Correction (Photo with Sign)', icon: '✍️' },
        { id: 'pan.correction', label: 'PAN Correction & Changes (CSF Form)', icon: '✏️' },
        { id: 'pan.findPan', label: 'Find PAN Number by Aadhaar', icon: '🔍' },
        { id: 'pan.merger', label: 'Stamp & Signature PDF Merger Tool', icon: '📎' },
        { id: 'pan.submissions', label: 'View Submissions & Status Tracking', icon: '📊' }
      ]
    },
    {
      id: 'offlineWork',
      label: 'Offline Work Services',
      icon: '📁',
      subPermissions: [
        { id: 'offlineWork.view', label: 'Access Offline Work Portal', icon: '👁️' },
        { id: 'offlineWork.submit', label: 'Submit Offline Applications', icon: '📝' },
        { id: 'offlineWork.history', label: 'View Submission History & Receipts', icon: '📜' }
      ]
    },
    {
      id: 'toolsModule',
      label: 'Tools & AI Utilities',
      icon: '⚡',
      subPermissions: [
        { id: 'tools.view', label: 'Access Tools & AI Utilities Portal', icon: '👁️' },
        { id: 'tools.aadharCutter', label: 'Aadhaar Card PDF Cutter AI API', icon: '🪪' },
        { id: 'tools.allIdCutter', label: 'All Type ID Card Crop/Cutter AI API', icon: '✂️' },
        { id: 'tools.bgRemover', label: 'Background Remover Image AI API', icon: '🖼️' },
        { id: 'tools.signValidation', label: 'Digital Signature PDF Validation Tool', icon: '✍️' },
        { id: 'tools.autoCrop', label: 'All Identity Card Auto Cropping Tool', icon: '📐' },
        { id: 'tools.ocrConverter', label: 'Image to Text (OCR) Converter Online API', icon: '📝' },
        { id: 'tools.imageEnhancer', label: 'AI Image Enhancer & 4K Upscaler API', icon: '✨' },
        { id: 'tools.rationCutter', label: 'Mera Ration Card PDF Crop/Cutter AI API', icon: '🌾' },
        { id: 'tools.panCutter', label: 'PAN Card PDF Crop/Cutter AI API', icon: '💳' },
        { id: 'tools.voterCutter', label: 'Voter ID (EPIC) PDF Crop/Cutter AI API', icon: '🗳️' },
        { id: 'tools.pdf2Html', label: 'PDF to HTML Convert API', icon: '🌐' }
      ]
    },
    {
      id: 'crm',
      label: 'CRM Suite (Core & Overview)',
      icon: '👥',
      subPermissions: [
        { id: 'crm.access', label: 'Access CRM Suite Portal', icon: '👥' },
        { id: 'crm.dashboard', label: 'View CRM Dashboard & Metrics', icon: '📊' }
      ]
    },
    {
      id: 'crmCustomer',
      label: 'CRM – Customer Management',
      icon: '📇',
      subPermissions: [
        { id: 'crm.customer.access', label: 'Access Customer Management Module', icon: '📇' },
        { id: 'crm.customer.view', label: 'View Customer Profiles & Directory', icon: '👁️' },
        { id: 'crm.customer.add', label: 'Register New Customers', icon: '➕' },
        { id: 'crm.customer.edit', label: 'Edit Customer Information', icon: '✏️' }
      ]
    },
    {
      id: 'crmBillBook',
      label: 'CRM – My Bill Book (Billing & Ledger)',
      icon: '📖',
      subPermissions: [
        { id: 'crm.billbook.access', label: 'Access My Bill Book Module', icon: '📖' },
        { id: 'crm.billbook.view', label: 'View Customer Ledger & Statements', icon: '👁️' },
        { id: 'crm.billbook.add', label: 'Create New Invoices & Bills', icon: '🧾' },
        { id: 'crm.billbook.edit', label: 'Edit & Update Billing Invoices', icon: '✏️' }
      ]
    },
    {
      id: 'crmBank',
      label: 'CRM – Bank Account Details',
      icon: '🏦',
      subPermissions: [
        { id: 'crm.bank.access', label: 'Access Bank Accounts Module', icon: '🏦' },
        { id: 'crm.bank.view', label: 'View Linked Bank Accounts', icon: '👁️' },
        { id: 'crm.bank.add', label: 'Add New Bank Account', icon: '➕' },
        { id: 'crm.bank.edit', label: 'Edit Bank Account Details', icon: '✏️' },
        { id: 'crm.bank.delete', label: 'Delete Bank Accounts', icon: '🗑️' }
      ]
    },
    {
      id: 'crmMoney',
      label: 'CRM – Money Transaction (Remittance)',
      icon: '💸',
      subPermissions: [
        { id: 'crm.money.access', label: 'Access Money Transaction Module', icon: '💸' },
        { id: 'crm.money.view', label: 'View Remittance Transactions', icon: '👁️' },
        { id: 'crm.money.add', label: 'Create Transaction (Cash↔Online)', icon: '➕' },
        { id: 'crm.money.status', label: 'Update Status & Reference / UTR', icon: '🔄' },
        { id: 'crm.money.reports', label: 'View Financial Reports & Invoices', icon: '📑' },
        { id: 'crm.money.pnl', label: 'View Profit & Loss Analytics', icon: '📈' }
      ]
    },
    {
      id: 'crmEmployee',
      label: 'CRM – Employee Management',
      icon: '👔',
      subPermissions: [
        { id: 'crm.employee.access', label: 'Access Employee Management Module', icon: '👔' },
        { id: 'crm.employee.manage', label: 'Create, Edit & Delegate Employee Access', icon: '👥' }
      ]
    },
    {
      id: 'crmTask',
      label: 'CRM – Task Management',
      icon: '📋',
      subPermissions: [
        { id: 'crm.task.access', label: 'Access Task Management Module', icon: '📋' },
        { id: 'crm.task.add', label: 'Add New Tasks', icon: '➕' },
        { id: 'crm.task.edit', label: 'Edit & Update Tasks', icon: '✏️' },
        { id: 'crm.task.delete', label: 'Delete Tasks', icon: '🗑️' }
      ]
    },
    {
      id: 'crmPending',
      label: 'CRM – Pending Work',
      icon: '⏳',
      subPermissions: [
        { id: 'crm.pending.access', label: 'Access Pending Work Module', icon: '⏳' },
        { id: 'crm.pending.view', label: 'View Pending Work List', icon: '👁️' },
        { id: 'crm.pending.update', label: 'Update Pending Work Status', icon: '🔄' }
      ]
    },
    {
      id: 'dynamicMenus',
      label: 'Dynamic Service Portals',
      icon: '🌐',
      subPermissions: [
        { id: 'dyn.servicesLink', label: 'Services Link Portal', icon: '🛠️' },
        { id: 'dyn.jobLinks', label: 'Job Links Portal', icon: '💼' },
        { id: 'dyn.admitCard', label: 'Admit Card Portal', icon: '🎫' },
        { id: 'dyn.formLinks', label: 'Form Links Portal', icon: '📋' },
        { id: 'dyn.vedioLink', label: 'Video / Tutorial Portal', icon: '🎥' },
        { id: 'dyn.trainingLinks', label: 'Training Links Portal', icon: '🎓' },
        { id: 'dyn.productLinks', label: 'Product Links Portal', icon: '📦' },
        { id: 'dyn.govtLinks', label: 'Government Links Portal', icon: '🏛️' },
        { id: 'dyn.print', label: 'Print Services Portal', icon: '🖨️' },
        { id: 'dyn.schorshipLinks', label: 'Scholarship Links Portal', icon: '📜' }
      ]
    },
    {
      id: 'quickLinksModule',
      label: 'Quick Links & Bookmarks',
      icon: '🔗',
      subPermissions: [
        { id: 'quickLinks.view', label: 'View Quick Links Dashboard', icon: '👁️' },
        { id: 'quickLinks.open', label: 'Open External & Direct URLs', icon: '🚀' },
        { id: 'quickLinks.search', label: 'Search & Filter Quick Links', icon: '🔍' }
      ]
    },
    {
      id: 'walletModule',
      label: 'Wallet & Fund Management',
      icon: '💼',
      subPermissions: [
        { id: 'wallet.balance', label: 'View Live Wallet Balance', icon: '👁️' },
        { id: 'wallet.upiPayment', label: 'Instant UPI QR Code Top-up', icon: '📱' },
        { id: 'wallet.requisition', label: 'Submit Bank Payment Requisition', icon: '🏦' },
        { id: 'wallet.history', label: 'View Top-up & Payment History', icon: '📜' }
      ]
    },
    {
      id: 'ledgerModule',
      label: 'Wallet Ledger & Statements',
      icon: '📒',
      subPermissions: [
        { id: 'ledger.view', label: 'View Passbook & Debit/Credit Ledger', icon: '👁️' },
        { id: 'ledger.filter', label: 'Filter Transactions by Date & Type', icon: '🔍' },
        { id: 'ledger.exportPdf', label: 'Download & Print Ledger PDF', icon: '📥' }
      ]
    },
    {
      id: 'dashboardNavModule',
      label: 'Dashboard Shortcuts & Navigation',
      icon: '💳',
      subPermissions: [
        { id: 'dashboard.actionCards', label: 'Access Action Quick Cards', icon: '💳' },
        { id: 'dashboard.topTabs', label: 'Access Top Service Tabs', icon: '📑' },
        { id: 'dashboard.banners', label: 'View Promotional Banners & News', icon: '🖼️' }
      ]
    },
    {
      id: 'profileModule',
      label: 'Account Profile & Receipts',
      icon: '👤',
      subPermissions: [
        { id: 'profile.view', label: 'View Profile & Retailer Info', icon: '👤' },
        { id: 'profile.receipts', label: 'Download Application Receipts', icon: '🧾' },
        { id: 'profile.certificate', label: 'View Authorized Retailer Certificate', icon: '🏆' },
        { id: 'profile.password', label: 'Change Login Password', icon: '🔑' }
      ]
    }
  ];

  const fetchStaffList = async () => {
    setStaffLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/staff`);
      const data = await res.json();
      if (data.success) {
        setStaffList(data.staff || []);
      }
    } catch (err) {
      console.error('Failed to fetch staff list', err);
    } finally {
      setStaffLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'staffMembers' && userRole === 'admin') {
      fetchStaffList();
    }
  }, [activeTab, userRole]);

  const handleOpenAddStaff = () => {
    setEditingStaffId(null);
    setCollapsedStaffModules({});
    setStaffFormData({
      name: '',
      username: '',
      password: '',
      email: '',
      mobile: '',
      permissions: [],
      isActive: true
    });
    setIsStaffModalOpen(true);
  };

  const handleOpenEditStaff = (staff) => {
    setEditingStaffId(staff._id);
    setCollapsedStaffModules({});
    setStaffFormData({
      name: staff.name || '',
      username: staff.username || '',
      password: '',
      email: staff.email || '',
      mobile: staff.mobile || '',
      permissions: staff.permissions || [],
      isActive: staff.isActive !== false
    });
    setIsStaffModalOpen(true);
  };

  const handleSaveStaff = async (e) => {
    e.preventDefault();
    const cleanName = staffFormData.name ? staffFormData.name.trim() : '';
    const cleanUsername = staffFormData.username ? staffFormData.username.trim() : '';
    const cleanPassword = staffFormData.password ? staffFormData.password.trim() : '';

    if (!cleanName) {
      Toast.fire({ icon: 'warning', title: 'Full Name is required' });
      return;
    }
    if (!editingStaffId && !cleanPassword) {
      Toast.fire({ icon: 'warning', title: 'Password is required for new staff' });
      return;
    }

    try {
      const url = editingStaffId 
        ? `${API_URL}/api/staff/${editingStaffId}` 
        : `${API_URL}/api/staff`;
      const method = editingStaffId ? 'PUT' : 'POST';

      const payload = {
        name: cleanName,
        username: cleanUsername,
        email: staffFormData.email ? staffFormData.email.trim() : '',
        mobile: staffFormData.mobile ? staffFormData.mobile.trim() : '',
        permissions: Array.from(new Set(staffFormData.permissions || [])),
        isActive: staffFormData.isActive !== false
      };

      if (!editingStaffId || cleanPassword) {
        payload.password = cleanPassword;
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      let data;
      try {
        data = await res.json();
      } catch (jsonErr) {
        data = null;
      }

      if (res.ok && data?.success) {
        Toast.fire({
          icon: 'success',
          title: editingStaffId ? 'Staff updated successfully!' : 'Staff created successfully!'
        });
        setIsStaffModalOpen(false);
        fetchStaffList();
      } else {
        Toast.fire({ icon: 'error', title: data?.message || `Failed to save staff (Status ${res.status})` });
      }
    } catch (err) {
      console.error('Staff save error:', err);
      Toast.fire({ icon: 'error', title: err?.message || 'Server error saving staff' });
    }
  };

  const handleToggleStaffStatus = async (staff) => {
    try {
      const res = await fetch(`${API_URL}/api/staff/${staff._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !staff.isActive })
      });
      let data;
      try {
        data = await res.json();
      } catch (jsonErr) {
        data = null;
      }
      if (res.ok && data?.success) {
        Toast.fire({
          icon: 'success',
          title: `Staff ${!staff.isActive ? 'Activated' : 'Suspended'}`
        });
        fetchStaffList();
      } else {
        Toast.fire({ icon: 'error', title: data?.message || 'Update failed' });
      }
    } catch (err) {
      Toast.fire({ icon: 'error', title: err?.message || 'Failed to update status' });
    }
  };

  const handleDeleteStaff = async (staffId, sName) => {
    const result = await Swal.fire({
      title: 'Delete Staff Member?',
      text: `Are you sure you want to remove ${sName}? They will no longer be able to log in.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Yes, Delete'
    });

    if (result.isConfirmed) {
      try {
        const res = await fetch(`${API_URL}/api/staff/${staffId}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
          Toast.fire({ icon: 'success', title: 'Staff member deleted' });
          fetchStaffList();
        } else {
          Toast.fire({ icon: 'error', title: data.message || 'Delete failed' });
        }
      } catch (err) {
        Toast.fire({ icon: 'error', title: 'Failed to delete staff' });
      }
    }
  };

  const handleToggleModuleAll = (mod, isChecked) => {
    setStaffFormData(prev => {
      const current = prev.permissions || [];
      const subIds = mod.subPermissions ? mod.subPermissions.map(s => s.id) : [];
      const allModIds = [mod.id, ...subIds];

      if (isChecked) {
        const set = new Set([...current, ...allModIds]);
        return { ...prev, permissions: Array.from(set) };
      } else {
        const removeSet = new Set(allModIds);
        return { ...prev, permissions: current.filter(id => !removeSet.has(id)) };
      }
    });
  };

  const handleToggleSubPermission = (mod, subId) => {
    setStaffFormData(prev => {
      const current = prev.permissions || [];
      const isCurrentlyChecked = current.includes(subId);
      let updated;

      if (isCurrentlyChecked) {
        updated = current.filter(id => id !== subId);
        const otherSubs = (mod.subPermissions || []).map(s => s.id).filter(id => id !== subId);
        const hasOtherChecked = otherSubs.some(id => updated.includes(id));
        if (!hasOtherChecked) {
          updated = updated.filter(id => id !== mod.id);
        }
      } else {
        const set = new Set([...current, subId, mod.id]);
        updated = Array.from(set);
      }

      return { ...prev, permissions: updated };
    });
  };

  const handleToggleAllPermissions = (select) => {
    if (select) {
      const allPerms = [];
      AVAILABLE_STAFF_MODULES.forEach(mod => {
        allPerms.push(mod.id);
        if (mod.subPermissions) {
          mod.subPermissions.forEach(s => allPerms.push(s.id));
        }
      });
      setStaffFormData(prev => ({
        ...prev,
        permissions: allPerms
      }));
    } else {
      setStaffFormData(prev => ({
        ...prev,
        permissions: []
      }));
    }
  };

  const handleToggleCollapseAllModules = () => {
    setCollapsedStaffModules(prev => {
      const anyOpen = AVAILABLE_STAFF_MODULES.some(m => !prev[m.id]);
      const next = {};
      AVAILABLE_STAFF_MODULES.forEach(m => {
        next[m.id] = anyOpen;
      });
      return next;
    });
  };

  const handleToggleModuleCollapse = (modId) => {
    setCollapsedStaffModules(prev => ({
      ...prev,
      [modId]: !prev[modId]
    }));
  };

  // eslint-disable-next-line no-unused-vars
  const totalStaffCount = staffList.length;
  // eslint-disable-next-line no-unused-vars
  const activeStaffCount = staffList.filter(s => s.isActive !== false).length;
  // eslint-disable-next-line no-unused-vars
  const suspendedStaffCount = staffList.filter(s => s.isActive === false).length;
  // eslint-disable-next-line no-unused-vars
  const totalPermissionsAssigned = staffList.reduce((acc, s) => acc + (s.permissions ? s.permissions.length : 0), 0);

  const filteredStaffList = staffList.filter(s => {
    if (staffStatusFilter === 'ACTIVE' && s.isActive === false) return false;
    if (staffStatusFilter === 'SUSPENDED' && s.isActive !== false) return false;

    if (!staffSearch.trim()) return true;
    const q = staffSearch.toLowerCase();
    return (
      (s.name && s.name.toLowerCase().includes(q)) ||
      (s.username && s.username.toLowerCase().includes(q)) ||
      (s.mobile && s.mobile.toLowerCase().includes(q)) ||
      (s.email && s.email.toLowerCase().includes(q))
    );
  });

  // States for Retailer PAN Card Submissions & Analytics
  const [panSubmissionsData, setPanSubmissionsData] = useState({
    totalApplications: 0,
    uniqueRetailersCount: 0,
    statusCounts: { Submitted: 0, InProgress: 0, Approved: 0, Completed: 0, Rejected: 0 },
    retailers: [],
    applications: []
  });
  const [panSearchQuery, setPanSearchQuery] = useState('');
  const [panStatusFilter, setPanStatusFilter] = useState('All');
  const [panRetailerFilter, setPanRetailerFilter] = useState('All');
  const [panStartDate, setPanStartDate] = useState('');
  const [panEndDate, setPanEndDate] = useState('');
  const [panMonth, setPanMonth] = useState('');
  const [panPage, setPanPage] = useState(1);
  const [panPageSize, setPanPageSize] = useState(10);
  const [panShowFilters, setPanShowFilters] = useState(true);
  const [selectedPanAppDetails, setSelectedPanAppDetails] = useState(null);
  const [selectedPanAppForModal, setSelectedPanAppForModal] = useState(null);
  const [selectedPanAppDocuments, setSelectedPanAppDocuments] = useState(null);
  const [editingPanAppStatus, setEditingPanAppStatus] = useState(null);
  const [newStatusVal, setNewStatusVal] = useState('Submitted');
  const [newStatusRemarks, setNewStatusRemarks] = useState('');
  const [newReceiptFileUrl, setNewReceiptFileUrl] = useState('');
  const [newNsdlReceiptNumber, setNewNsdlReceiptNumber] = useState('');
  const [pdfTargetData, setPdfTargetData] = useState(null);

  const handleDownloadPdf = (app) => {
    if (!app) return;
    const d = app.details || {};
    
    const nameParts = (app.applicantName || d.nameAsPerAadhaar || app.nameAsPerAadhaar || '').trim().split(' ');
    const fName = (app.firstName !== undefined && app.firstName !== '') ? app.firstName : (d.firstName || (nameParts.length > 1 ? nameParts[0] : nameParts[0] || ''));
    const rawLName = (app.lastName !== undefined && app.lastName !== '') ? app.lastName : (d.lastName || (nameParts.length > 1 ? nameParts[nameParts.length - 1] : '') || '');
    const isIndiv = (app.applicantStatus || d.applicantStatus || 'INDIVIDUAL') === 'INDIVIDUAL';
    const lName = isIndiv ? getCleanLastName(rawLName, fName, app.applicantName || d.nameAsPerAadhaar || app.nameAsPerAadhaar) : rawLName;
    const mName = (app.middleName !== undefined && app.middleName !== '') ? app.middleName : (d.middleName || (nameParts.length > 2 ? nameParts.slice(1, -1).join(' ') : '') || '');

    const genderVal = (app.gender || d.gender || 'MALE').toUpperCase();
    const isMinor = Boolean(app.isMinor || d.isMinor);
    const vCap = isIndiv ? getIndividualCapacity({ ...d, ...app, gender: genderVal }, isMinor) : (app.verifierCapacity || d.verifierCapacity || 'DIRECTOR');

    const normalized = {
      ...d,
      ...app,
      firstName: fName,
      lastName: lName,
      middleName: mName,
      nameAsPerAadhaar: app.nameAsPerAadhaar || d.nameAsPerAadhaar || app.applicantName || `${fName} ${lName}`.trim(),
      title: app.title || d.title || (genderVal === 'FEMALE' ? 'SMT' : 'SHRI'),
      otherName: app.otherName || d.otherName || 'NO',
      gender: genderVal,
      dob: app.dob || d.dob || '',
      mobileNumber: app.mobileNumber || d.mobileNumber || '',
      email: app.email || d.email || '',
      aadhaarNumber: app.aadhaarNumber || d.aadhaarNumber || '',
      panNumber: app.panNumber || d.panNumber || '',
      photoUrl: app.photoUrl || d.photoUrl || '',
      signatureUrl: app.signatureUrl || d.signatureUrl || '',
      fatherFirstName: (app.fatherFirstName !== undefined && app.fatherFirstName !== '') ? app.fatherFirstName : (d.fatherFirstName || app.fatherName || ''),
      fatherLastName: (app.fatherLastName !== undefined && app.fatherLastName !== '') ? app.fatherLastName : (d.fatherLastName || ''),
      fatherMiddleName: (app.fatherMiddleName !== undefined && app.fatherMiddleName !== '') ? app.fatherMiddleName : (d.fatherMiddleName || ''),
      motherFirstName: app.motherFirstName || d.motherFirstName || '',
      motherMiddleName: app.motherMiddleName || d.motherMiddleName || '',
      motherLastName: app.motherLastName || d.motherLastName || '',
      isSingleParent: app.isSingleParent || app.isSingleMother || d.isSingleParent || d.isSingleMother || 'NO',
      isSingleMother: app.isSingleMother || app.isSingleParent || d.isSingleMother || d.isSingleParent || 'NO',
      cardParentName: app.cardParentName || d.cardParentName || 'FATHER',
      parentNameToPrint: app.cardParentName || d.cardParentName || 'FATHER',
      aoAreaCode: app.aoAreaCode || d.aoAreaCode || 'PNE',
      aoType: app.aoType || d.aoType || 'C',
      aoRangeCode: app.aoRangeCode || d.aoRangeCode || '94',
      aoNo: app.aoNo || d.aoNo || '1',
      flatNo: app.flatNo || d.flatNo || '',
      premises: app.premises || d.premises || '',
      roadStreet: app.roadStreet || d.roadStreet || '',
      areaTaluka: app.areaTaluka || d.areaTaluka || '',
      district: app.district || d.district || '',
      state: app.state || d.state || 'MAHARASHTRA',
      pincode: app.pincode || d.pincode || '',
      commAddress: app.commAddress || d.commAddress || 'RESIDENCE',
      communicationAddress: app.commAddress || d.commAddress || 'RESIDENCE',
      applicantStatus: app.applicantStatus || d.applicantStatus || 'INDIVIDUAL',
      incomeSource: app.incomeSource || d.incomeSource || 'NO INCOME',
      proofOfIdentity: app.proofOfIdentity || d.proofOfIdentity || 'AADHAAR CARD',
      proofOfAddress: app.proofOfAddress || d.proofOfAddress || 'AADHAAR CARD',
      proofOfDob: app.proofOfDob || d.proofOfDob || 'AADHAAR CARD',
      verifierName: app.verifierName || d.verifierName || `${fName} ${lName}`.trim() || app.applicantName || '',
      verifierCapacity: vCap,
      verifierPlace: app.verifierPlace || d.verifierPlace || app.district || d.district || '',
      verifierDate: app.verifierDate || d.verifierDate || new Date().toISOString().split('T')[0]
    };

    setPdfTargetData(normalized);

    const isCorr = (app.applicationType || '').toLowerCase().includes('correction') || (normalized.panNumber && !normalized.aadhaarNumber);

    setTimeout(() => {
      if (isCorr) {
        generatePanCrPdf(normalized);
      } else {
        generateForm49APdf(normalized);
      }
    }, 200);
  };

  const handleOpenPanDocuments = async (app) => {
    if (!app?._id) return;
    try {
      const response = await fetch(`${API_URL}/api/pancard/application/${app._id}`);
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || 'Unable to fetch documents.');
      setSelectedPanAppDocuments(data.application);
    } catch (error) {
      console.error('Error fetching PAN documents:', error);
      alert(error.message || 'Unable to fetch documents.');
    }
  };

  const handleViewPanDocument = async (applicationId, documentKey) => {
    const viewer = window.open('', '_blank');
    if (!viewer) {
      alert('Please allow popups to view uploaded documents.');
      return;
    }
    try {
      const response = await fetch(`${API_URL}/api/pancard/application/${applicationId}/document/${documentKey}`);
      if (!response.ok) throw new Error('Unable to load document.');
      const documentBlob = await response.blob();
      viewer.location.href = URL.createObjectURL(documentBlob);
    } catch (error) {
      viewer.close();
      console.error('Error viewing PAN document:', error);
      alert(error.message || 'Unable to load document.');
    }
  };

  const [editPanData, setEditPanData] = useState(null);

  useEffect(() => {
    if (selectedPanAppDetails) {
      const app = selectedPanAppDetails;
      const d = app.details || {};
      const nameParts = (app.applicantName || d.nameAsPerAadhaar || '').trim().split(' ');
      const rawLName = d.lastName || (nameParts.length > 1 ? nameParts[nameParts.length - 1] : nameParts[0] || '');
      const fName = d.firstName || (nameParts.length > 1 ? nameParts[0] : '');
      const isIndiv = (d.applicantStatus || app.applicantStatus || 'INDIVIDUAL') === 'INDIVIDUAL';
      const cleanLName = isIndiv ? getCleanLastName(rawLName, fName, app.applicantName || d.nameAsPerAadhaar) : rawLName;
      setEditPanData({
        _id: app._id,
        title: d.title || 'SHRI',
        lastName: cleanLName,
        firstName: fName,
        middleName: d.middleName || (nameParts.length > 2 ? nameParts.slice(1, -1).join(' ') : ''),
        nameAsPerAadhaar: d.nameAsPerAadhaar || app.applicantName || '',
        gender: app.gender || d.gender || 'Male',
        dob: app.dob || d.dob || '',
        fatherLastName: d.fatherLastName || (app.fatherName || '').split(' ').pop() || '',
        fatherFirstName: d.fatherFirstName || (app.fatherName || '').split(' ')[0] || '',
        fatherMiddleName: d.fatherMiddleName || '',
        motherLastName: d.motherLastName || '',
        motherFirstName: d.motherFirstName || '',
        motherMiddleName: d.motherMiddleName || '',
        aoAreaCode: d.aoAreaCode || 'PNE',
        aoType: d.aoType || 'C',
        aoRangeCode: d.aoRangeCode || '94',
        aoNo: d.aoNo || '1',
        flatNo: d.flatNo || '',
        premises: d.premises || '',
        roadStreet: d.roadStreet || '',
        areaTaluka: d.areaTaluka || '',
        district: d.district || '',
        state: d.state || 'MAHARASHTRA',
        pincode: d.pincode || '',
        mobileNumber: app.mobileNumber || d.mobileNumber || '',
        email: app.email || d.email || '',
        aadhaarNumber: app.aadhaarNumber || d.aadhaarNumber || '',
        panNumber: app.panNumber || d.panNumber || '',
        proofOfIdentity: d.proofOfIdentity || 'AADHAAR CARD',
        proofOfAddress: d.proofOfAddress || 'AADHAAR CARD',
        proofOfDob: d.proofOfDob || 'AADHAAR CARD',
        photoUrl: app.photoUrl || d.photoUrl || '',
        signatureUrl: app.signatureUrl || d.signatureUrl || '',
        applicationType: app.applicationType || 'Manual New PAN',
        ackNumber: app.ackNumber || '',
        userId: app.userId || ''
      });
    } else {
      setEditPanData(null);
    }
  }, [selectedPanAppDetails]);

  // eslint-disable-next-line no-unused-vars
  const handleSaveEditedPanApp = async () => {
    if (!editPanData || !editPanData._id) return;
    try {
      const fullApplicantName = `${editPanData.title || ''} ${editPanData.firstName || ''} ${editPanData.middleName || ''} ${editPanData.lastName || ''}`.trim() || editPanData.nameAsPerAadhaar;
      const fullFatherName = `${editPanData.fatherFirstName || ''} ${editPanData.fatherMiddleName || ''} ${editPanData.fatherLastName || ''}`.trim();

      const payload = {
        applicantName: fullApplicantName,
        fatherName: fullFatherName,
        dob: editPanData.dob,
        gender: editPanData.gender,
        mobileNumber: editPanData.mobileNumber,
        email: editPanData.email,
        aadhaarNumber: editPanData.aadhaarNumber,
        panNumber: editPanData.panNumber,
        details: { ...editPanData }
      };

      const res = await fetch(`${API_URL}/api/pancard/update-application/${editPanData._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (data.success) {
        alert('✅ Application details updated & saved to database!');
        setPdfTargetData({ ...editPanData, applicantName: fullApplicantName, fatherName: fullFatherName });
        fetchAll();
      } else {
        alert('Error updating application: ' + data.message);
      }
    } catch (err) {
      alert('Failed to save changes: ' + err.message);
    }
  };

  // States for fetching data
  const [cards, setCards] = useState([]);
  const [topTabs, setTopTabs] = useState([]);
  const [sidebarMenus, setSidebarMenus] = useState([]);

  // CRM Cards Management States
  const [crmCards, setCrmCards] = useState([]);
  const [crmForm, setCrmForm] = useState({
    title: '',
    subtitle: '',
    icon: '📋',
    badge: '',
    color: '#3b82f6',
    url: '',
    isActive: true
  });
  const [editingCrmCardId, setEditingCrmCardId] = useState(null);
  const [crmSubmitting, setCrmSubmitting] = useState(false);

  // Dynamic Menu Add / Edit Modal States
  const [showDynamicMenuModal, setShowDynamicMenuModal] = useState(false);
  const [editingDynamicMenu, setEditingDynamicMenu] = useState(null); // null if adding new, or menu object if editing
  const [dynamicMenuForm, setDynamicMenuForm] = useState({
    label: '',
    icon: '🌐',
    route: ''
  });
  const [isSavingDynamicMenu, setIsSavingDynamicMenu] = useState(false);

  // Derive all link menus (Quick Links + all dynamic link menus) ordered according to sidebarMenus
  const allLinkMenusList = useMemo(() => {
    const customIcons = getCustomMenuIcons();
    const result = [];
    const seenKeys = new Set();

    (sidebarMenus || []).forEach(sm => {
      if (!sm || !sm.label) return;
      const l = (sm.label || '').toLowerCase();
      const u = (sm.url || '').toLowerCase();
      const isPan = l.includes('pan');
      const isDash = l.includes('dash');
      const isWallet = l.includes('wallet');
      const isLedger = l.includes('ledger') || l.includes('report');
      if (isDash || isPan || isWallet || isLedger) return;

      const matchedStd = getDynamicMenuForSidebarItem(sm);
      const isQuick = !matchedStd && (
        u === '/quick-links' || u === '/view-links' || l.includes('quick') || l === 'view links'
      );

      if (isQuick) {
        if (!seenKeys.has('quickLinks')) {
          seenKeys.add('quickLinks');
          result.push({
            key: 'quickLinks',
            _id: sm._id,
            label: (sm.label && sm.label.trim()) || 'Quick Links',
            icon: customIcons['quickLinks'] || '🔗',
            route: '/quick-links',
            isActive: sm.isActive !== undefined ? Boolean(sm.isActive) : true,
            isCustom: false
          });
        }
        return;
      }

      if (matchedStd) {
        if (!seenKeys.has(matchedStd.key)) {
          seenKeys.add(matchedStd.key);
          result.push({
            ...matchedStd,
            _id: sm._id,
            label: (sm.label && sm.label.trim()) || matchedStd.label,
            icon: customIcons[matchedStd.key] || matchedStd.icon || '🌐',
            route: matchedStd.route,
            isActive: sm.isActive !== undefined ? Boolean(sm.isActive) : true,
            isCustom: false
          });
        }
        return;
      }

      if (sm.url && sm.url.startsWith('/')) {
        const lowerUrl = (sm.url || '').toLowerCase();
        const lowerLabel = (sm.label || '').toLowerCase();
        if (lowerUrl.includes('offline') || lowerLabel.includes('offline') || lowerUrl.includes('pan') || lowerLabel.includes('pan')) {
          return;
        }
        const key = sm.url.replace(/^\/+/, '').replace(/[^a-zA-Z0-9]/g, '');
        if (key && !seenKeys.has(key)) {
          seenKeys.add(key);
          result.push({
            key,
            _id: sm._id,
            label: sm.label.trim(),
            icon: customIcons[key] || '🌐',
            route: sm.url,
            isActive: sm.isActive !== undefined ? Boolean(sm.isActive) : true,
            isCustom: true
          });
        }
      }
    });

    // Ensure any standard menus not yet in sidebarMenus are appended
    DYNAMIC_LINK_MENUS.forEach(dyn => {
      if (!seenKeys.has(dyn.key)) {
        seenKeys.add(dyn.key);
        result.push({
          ...dyn,
          icon: customIcons[dyn.key] || dyn.icon || '🌐',
          _id: null,
          isActive: true,
          isCustom: false
        });
      }
    });

    // Ensure quickLinks is included
    if (!seenKeys.has('quickLinks')) {
      seenKeys.add('quickLinks');
      result.unshift({
        key: 'quickLinks',
        label: 'Quick Links',
        icon: '🔗',
        route: '/quick-links',
        isActive: true,
        _id: null,
        isCustom: false
      });
    }

    return result;
  }, [sidebarMenus]);

  const dynamicLinkMenusList = useMemo(() => {
    return allLinkMenusList.filter(m => m.key !== 'quickLinks');
  }, [allLinkMenusList]);
  const [banners, setBanners] = useState([]);
  const [newsImages, setNewsImages] = useState([]);
  const [quickLinks, setQuickLinks] = useState([]);
  const [users, setUsers] = useState([]);
  const [marqueeInput, setMarqueeInput] = useState('WELCOME TO MB MITRA');

  // States for Wallet Ledger History Reports
  const [ledgerTransactions, setLedgerTransactions] = useState([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerFilters, setLedgerFilters] = useState({
    userId: '',
    startDate: '',
    endDate: '',
    month: '',
    transactionType: 'All',
    status: 'All',
    search: ''
  });
  const [filterInput, setFilterInput] = useState({
    userId: '',
    startDate: '',
    endDate: '',
    month: '',
    transactionType: 'All',
    status: 'All',
    search: ''
  });
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerPageSize, setLedgerPageSize] = useState(10);

  // States for Admin to Retailer Wallet Payment / Adjustment
  const [retailerSearchQuery, setRetailerSearchQuery] = useState('');
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [showRetailerModal, setShowRetailerModal] = useState(false);
  const [modalSearch, setModalSearch] = useState('');
  const [selectedRetailer, setSelectedRetailer] = useState(null);
  const [transferTxType, setTransferTxType] = useState('Credit'); // 'Credit' | 'Debit'
  const [transferAmount, setTransferAmount] = useState('');
  const [transferRemarks, setTransferRemarks] = useState('');
  const [transferLoading, setTransferLoading] = useState(false);

  // Form States
  const DEFAULT_PAN_TABS = [
    {
      id: 'manual_new_pan',
      label: 'Manual New PAN',
      icon: '📄',
      fee: 107,
      badge: 'Form 49A Physical',
      badgeClass: '',
      description: 'Detailed manual PAN Application with Photo & Signature Upload support.',
      fields: [
        { name: 'category', label: 'CATEGORY OF APPLICANT', type: 'select', options: ['INDIVIDUAL', 'FIRM', 'BODY OF INDIVIDUALS', 'TRUST', 'ASSOCIATION OF PERSONS', 'LOCAL AUTHORITY', 'COMPANY', 'HINDU UNDIVIDED FAMILY', 'LIMITED LIABILITY PARTNERSHIP', 'ARTIFICIAL JURIDICAL PERSON', 'GOVERNMENT'], required: true, formType: 'Both' },
        { name: 'aadhaarNumber', label: 'AADHAAR NO', type: 'text', placeholder: '12 DIGITS UID NO', required: true, formType: 'Form 93' },
        { name: 'proofOfDob', label: 'PROOF OF DOB', type: 'select', options: PROOF_OF_DOB_OPTIONS, required: true, formType: 'Form 93' },
        { name: 'title', label: 'TITLE', type: 'select', options: ['SELECT', 'SHRI', 'SMT', 'KUMARI'], required: true, formType: 'Form 93' },
        { name: 'firstName', label: 'FIRST NAME', type: 'text', placeholder: 'FIRST NAME', required: false, formType: 'Form 93' },
        { name: 'middleName', label: 'MIDDLE NAME', type: 'text', placeholder: 'MIDDLE NAME', required: false, formType: 'Form 93' },
        { name: 'lastName', label: 'LAST NAME / SURNAME', type: 'text', placeholder: 'LAST NAME / SURNAME', required: true, formType: 'Form 93' },
        { name: 'isSingleParent', label: 'WHETHER MOTHER/FATHER IS A SINGLE PARENT', type: 'select', options: ['NO', 'YES'], required: true, formType: 'Form 93' },
        { name: 'fatherFirstName', label: "FATHER'S FIRST NAME", type: 'text', placeholder: 'FATHER FIRST NAME', required: false, formType: 'Form 93' },
        { name: 'fatherMiddleName', label: "FATHER'S MIDDLE NAME", type: 'text', placeholder: 'FATHER MIDDLE NAME', required: false, formType: 'Form 93' },
        { name: 'fatherLastName', label: "FATHER'S LAST NAME", type: 'text', placeholder: 'FATHER LAST NAME', required: false, formType: 'Form 93' },
        { name: 'motherFirstName', label: "MOTHER'S FIRST NAME", type: 'text', placeholder: 'MOTHER FIRST NAME', required: false, formType: 'Form 93' },
        { name: 'motherMiddleName', label: "MOTHER'S MIDDLE NAME", type: 'text', placeholder: 'MOTHER MIDDLE NAME', required: false, formType: 'Form 93' },
        { name: 'motherLastName', label: "MOTHER'S LAST NAME", type: 'text', placeholder: 'MOTHER LAST NAME', required: false, formType: 'Form 93' },
        { name: 'nameAsPerAadhaar', label: 'NAME AS PER AADHAAR', type: 'text', placeholder: 'NAME AS PER AADHAAR', required: true, formType: 'Form 93' },
        { name: 'gender', label: 'GENDER', type: 'select', options: ['SELECT', 'MALE', 'FEMALE', 'TRANSGENDER'], required: true, formType: 'Form 93' },
        { name: 'dob', label: 'DATE OF BIRTH', type: 'date', required: true, formType: 'Form 93' },
        { name: 'mobileNumber', label: 'MOBILE NO.', type: 'tel', placeholder: 'MOBILE NO.', required: true, formType: 'Both' },
        { name: 'email', label: 'EMAIL ID', type: 'email', placeholder: 'EMAIL ID', required: true, formType: 'Both' },
        { name: 'flatNo', label: 'FLAT/DOOR/BLOCK NO', type: 'text', placeholder: 'FLAT/DOOR/BLOCK NO', required: true, formType: 'Form 93' },
        { name: 'premises', label: 'PREMISES/BUILDING/VILLAGE', type: 'text', placeholder: 'PREMISES/BUILDING/VILLAGE', required: true, formType: 'Form 93' },
        { name: 'roadStreet', label: 'ROAD/STREET/POST OFFICE', type: 'text', placeholder: 'ROAD/STREET/LANE/POST OFFICE', required: true, formType: 'Form 93' },
        { name: 'areaTaluka', label: 'AREA/TALUKA/SUB DIVISION', type: 'text', placeholder: 'AREA/TALUKA/SUB DIVISION', required: true, formType: 'Form 93' },
        { name: 'state', label: 'STATE', type: 'select', options: ['PLEASE SELECT', ...ALL_INDIAN_STATES], required: true, formType: 'Form 93' },
        { name: 'district', label: 'TOWN/DISTRICT', type: 'select', options: ['SELECT', ...ALL_INDIAN_DISTRICTS], required: true, formType: 'Form 93' },
        { name: 'pincode', label: 'PINCODE', type: 'text', placeholder: 'PINCODE', required: true, formType: 'Form 93' },
        { name: 'proofOfIdentity', label: 'PROOF OF IDENTITY', type: 'select', options: PROOF_OF_IDENTITY_OPTIONS, required: true, formType: 'Form 93' },
        { name: 'proofOfAddress', label: 'PROOF OF ADDRESS', type: 'select', options: PROOF_OF_ADDRESS_OPTIONS, required: true, formType: 'Form 93' },

        { name: 'photoUrl', label: 'Upload Applicant Photo', type: 'file', required: false, formType: 'Form 93' },
        { name: 'signatureUrl', label: 'Upload Applicant Signature', type: 'file', required: false, formType: 'Form 93' },
        // Form 94 (Non-Individual / Other Entities) Fields
        { name: 'entityName', label: '1. NAME OF FIRM / ENTITY', type: 'text', placeholder: 'ENTER FULL NAME OF FIRM', required: true, formType: 'Form 94' },
        { name: 'dateOfIncorporation', label: '2. DATE OF INCORPORATION / AGREEMENT / TRUST DEED / FORMATION', type: 'date', required: true, formType: 'Form 94' },
        { name: 'registrationNumber', label: 'REGISTRATION NUMBER (FOR COMPANY, FIRM, LLP, TRUST, ETC.)', type: 'text', placeholder: 'ENTER REGISTRATION / CIN NO.', required: false, formType: 'Form 94' },
        { name: 'tin', label: 'TAXPAYER IDENTIFICATION NUMBER (TIN IN COUNTRY OF RESIDENCE, IF ANY)', type: 'text', placeholder: 'ENTER TIN IN COUNTRY OF RESIDENCE (IF APPLICABLE)', required: false, formType: 'Both' },
        { name: 'stdCode', label: 'STD CODE', type: 'text', placeholder: 'STD', required: false, formType: 'Form 94' },
        { name: 'landlineNumber', label: 'LANDLINE NO. WITH STD CODE', type: 'text', placeholder: 'LANDLINE NO.', required: false, formType: 'Form 94' },
        { name: 'proofOfIncorporation', label: 'PROOF OF INCORPORATION / AGREEMENT / DEED', type: 'select', options: ['REGISTRATION CERTIFICATE ISSUED BY REGISTRAR OF COMPANIES', 'PARTNERSHIP DEED', 'TRUST DEED', 'LLP AGREEMENT', 'CERTIFICATE OF INCORPORATION'], required: true, formType: 'Form 94' },
        { name: 'verifierName', label: 'AUTHORIZED SIGNATORY / VERIFIER NAME', type: 'text', placeholder: 'AUTHORIZED SIGNATORY / VERIFIER NAME', required: true, formType: 'Form 94' },
        { name: 'designation', label: 'DESIGNATION OF SIGNATORY', type: 'select', options: ['PARTNER', 'DIRECTOR', 'TRUSTEE', 'AUTHORISED SIGNATORY', 'PROPRIETOR', 'KARTA'], required: true, formType: 'Form 94' },
        { name: 'proofOfIncorporationUrl', label: 'UPLOAD REGISTRATION CERTIFICATE (ROC / DEED)', type: 'file', required: false, formType: 'Form 94' }
      ]
    },
    {
      id: 'epan_kyc',
      label: 'E-Pan Kyc',
      icon: '📲',
      fee: 107,
      badge: 'PAN CARD Service Documents Upload',
      badgeClass: '',
      description: 'Instant E-KYC application using Aadhaar OTP / Biometric verification.',
      fields: [
        { name: 'applicantName', label: 'Applicant Full Name (As per Aadhaar)', type: 'text', placeholder: 'Enter full name of applicant...', icon: '👤', required: true, gridSpan: 1 },
        { name: 'fatherName', label: "Father's Full Name", type: 'text', placeholder: "Enter father's full name...", icon: '👨‍👦', required: true, gridSpan: 1 },
        { name: 'dob', label: 'Date of Birth (DOB)', type: 'date', icon: '📅', required: true, gridSpan: 1 },
        { name: 'gender', label: 'Gender', type: 'select', options: ['Male', 'Female', 'Transgender'], icon: '🚻', required: true, gridSpan: 1, defaultValue: 'Male' },
        { name: 'mobileNumber', label: 'Mobile Number', type: 'tel', maxLength: 10, placeholder: '10-digit mobile number...', icon: '📱', required: true, gridSpan: 1 },
        { name: 'email', label: 'Email Address', type: 'email', placeholder: 'Enter email for e-PAN soft copy...', icon: '📧', required: true, gridSpan: 1 },
        { name: 'aadhaarNumber', label: '12-Digit Aadhaar Number', type: 'text', maxLength: 12, placeholder: '12-digit Aadhaar number...', icon: '🆔', required: true, gridSpan: 1 }
      ]
    },
    {
      id: 'epan_correction',
      label: 'PAN Correction',
      icon: '📝',
      fee: 107,
      badge: 'PAN Update Service',
      badgeClass: 'badge-correction',
      description: 'Update or correct personal details on your existing PAN Card record.',
      fields: [
        // Primary & Common Fields (Both Form 93 & Form 94)
        { name: 'category', label: 'CATEGORY OF APPLICANT', type: 'select', options: ['INDIVIDUAL', 'FIRM', 'BODY OF INDIVIDUALS', 'TRUST', 'ASSOCIATION OF PERSONS', 'LOCAL AUTHORITY', 'COMPANY', 'HINDU UNDIVIDED FAMILY', 'LIMITED LIABILITY PARTNERSHIP', 'ARTIFICIAL JURIDICAL PERSON', 'GOVERNMENT'], required: true, formType: 'Both' },
        { name: 'panNumber', label: 'EXISTING PAN NUMBER', type: 'text', placeholder: 'e.g. ABCDE1234F', required: true, uppercase: true, formType: 'Both' },

        // Form 93 (Individual Specific Fields)
        { name: 'aadhaarNumber', label: 'AADHAAR NO', type: 'text', placeholder: '12 DIGITS UID NO', required: true, formType: 'Form 93' },
        { name: 'title', label: 'TITLE', type: 'select', options: ['SELECT', 'SHRI', 'SMT', 'KUMARI'], required: true, formType: 'Form 93' },
        { name: 'firstName', label: 'FIRST NAME', type: 'text', placeholder: 'FIRST NAME', required: true, formType: 'Form 93' },
        { name: 'middleName', label: 'MIDDLE NAME', type: 'text', placeholder: 'MIDDLE NAME', required: false, formType: 'Form 93' },
        { name: 'lastName', label: 'LAST NAME / SURNAME', type: 'text', placeholder: 'LAST NAME / SURNAME', required: true, formType: 'Form 93' },
        { name: 'nameAsPerAadhaar', label: 'NAME AS PER AADHAAR', type: 'text', placeholder: 'NAME AS PER AADHAAR', required: true, formType: 'Form 93' },
        { name: 'gender', label: 'GENDER', type: 'select', options: ['SELECT', 'MALE', 'FEMALE', 'TRANSGENDER'], required: true, formType: 'Form 93' },
        { name: 'dob', label: 'DATE OF BIRTH', type: 'date', required: true, formType: 'Form 93' },
        { name: 'addressType', label: 'ADDRESS TYPE', type: 'select', options: ['RESIDENCE', 'OFFICE'], required: true, formType: 'Form 93' },
        { name: 'parentToPrint', label: 'NAME OF PARENT TO PRINT ON PAN CARD', type: 'select', options: ['Father', 'Mother'], required: true, formType: 'Form 93' },
        { name: 'fatherFirstName', label: "FATHER'S FIRST NAME", type: 'text', placeholder: "FATHER'S FIRST NAME", required: true, formType: 'Form 93' },
        { name: 'fatherMiddleName', label: "FATHER'S MIDDLE NAME", type: 'text', placeholder: "FATHER'S MIDDLE NAME", required: false, formType: 'Form 93' },
        { name: 'fatherLastName', label: "FATHER'S LAST NAME", type: 'text', placeholder: "FATHER'S LAST NAME", required: true, formType: 'Form 93' },
        { name: 'motherFirstName', label: "MOTHER'S FIRST NAME", type: 'text', placeholder: "MOTHER'S FIRST NAME", required: false, formType: 'Form 93' },
        { name: 'motherMiddleName', label: "MOTHER'S MIDDLE NAME", type: 'text', placeholder: "MOTHER'S MIDDLE NAME", required: false, formType: 'Form 93' },
        { name: 'motherLastName', label: "MOTHER'S LAST NAME", type: 'text', placeholder: "MOTHER'S LAST NAME", required: false, formType: 'Form 93' },
        { name: 'proofOfDob', label: 'PROOF OF DATE OF BIRTH', type: 'select', options: PROOF_OF_DOB_OPTIONS, required: true, formType: 'Form 93' },
        { name: 'passportNumber', label: 'PASSPORT NUMBER (IF APPLICABLE)', type: 'text', placeholder: 'PASSPORT NUMBER', required: false, formType: 'Form 93' },
        { name: 'photoUrl', label: 'UPLOAD APPLICANT PHOTO', type: 'file', required: false, formType: 'Form 93' },
        { name: 'proofOfDobUrl', label: 'UPLOAD DATE OF BIRTH PROOF', type: 'file', required: false, formType: 'Form 93' },

        // Form 94 (Non-Individual Specific Fields - Part A)
        { name: 'entityName', label: '1. NAME OF FIRM / ENTITY', type: 'text', placeholder: 'ENTER FULL NAME OF FIRM', required: true, formType: 'Form 94' },
        { name: 'dateOfIncorporation', label: '2. DATE OF INCORPORATION / AGREEMENT / TRUST DEED / FORMATION', type: 'date', required: true, formType: 'Form 94' },
        { name: 'registrationNumber', label: 'REGISTRATION NUMBER (FOR COMPANY, FIRM, LLP, TRUST, ETC.)', type: 'text', placeholder: 'ENTER REGISTRATION / CIN NO.', required: false, formType: 'Form 94' },
        { name: 'tin', label: 'TAXPAYER IDENTIFICATION NUMBER (TIN IN COUNTRY OF RESIDENCE, IF ANY)', type: 'text', placeholder: 'ENTER TIN IN COUNTRY OF RESIDENCE (IF APPLICABLE)', required: false, formType: 'Both' },
        { name: 'stdCode', label: 'STD CODE', type: 'text', placeholder: 'STD', required: false, formType: 'Form 94' },
        { name: 'landlineNumber', label: 'LANDLINE NO. WITH STD CODE', type: 'text', placeholder: 'LANDLINE NO.', required: false, formType: 'Form 94' },

        // Common Contact & Address Fields (Both Form 93 & Form 94)
        { name: 'mobileNumber', label: 'MOBILE NO.', type: 'tel', placeholder: '10-DIGIT MOBILE NO.', required: true, formType: 'Both' },
        { name: 'email', label: 'EMAIL ID', type: 'email', placeholder: 'OFFICIAL EMAIL ID', required: true, formType: 'Both' },
        { name: 'flatNo', label: 'FLAT / DOOR / BUILDING', type: 'text', placeholder: 'FLAT / DOOR / BUILDING', required: true, formType: 'Both' },
        { name: 'roadStreet', label: 'ROAD / STREET / BLOCK / SECTOR', type: 'text', placeholder: 'ROAD / STREET / BLOCK / SECTOR', required: true, formType: 'Both' },
        { name: 'postOffice', label: 'POST OFFICE', type: 'text', placeholder: 'POST OFFICE', required: true, formType: 'Both' },
        { name: 'areaTaluka', label: 'AREA / LOCALITY / TOWN / CITY', type: 'text', placeholder: 'AREA / LOCALITY / TOWN / CITY', required: true, formType: 'Both' },
        { name: 'state', label: 'STATE / UNION TERRITORY', type: 'select', options: ['PLEASE SELECT', ...ALL_INDIAN_STATES], required: true, formType: 'Both' },
        { name: 'district', label: 'DISTRICT', type: 'select', options: ['SELECT', ...ALL_INDIAN_DISTRICTS], required: true, formType: 'Both' },
        { name: 'country', label: 'COUNTRY / REGION', type: 'text', placeholder: 'INDIA', required: true, formType: 'Both' },
        { name: 'pincode', label: 'PIN / ZIP CODE', type: 'text', placeholder: 'PIN / ZIP CODE', required: true, formType: 'Both' },

        // Part B - Declarations & Proof Documents (Both & Form 94)
        { name: 'proofOfIdentity', label: 'PROOF OF IDENTITY', type: 'select', options: PROOF_OF_IDENTITY_OPTIONS, required: true, formType: 'Both' },
        { name: 'proofOfAddress', label: 'PROOF OF ADDRESS', type: 'select', options: PROOF_OF_ADDRESS_OPTIONS, required: true, formType: 'Both' },
        { name: 'proofOfIncorporation', label: 'PROOF OF INCORPORATION / AGREEMENT / DEED', type: 'select', options: ['REGISTRATION CERTIFICATE ISSUED BY REGISTRAR OF COMPANIES', 'PARTNERSHIP DEED', 'TRUST DEED', 'LLP AGREEMENT', 'CERTIFICATE OF INCORPORATION'], required: true, formType: 'Form 94' },
        { name: 'copyOfPan', label: 'PROOF OF PAN', type: 'select', options: ['COPY OF PAN CARD ATTACHED', 'PAN ALLOTMENT LETTER ATTACHED', 'NO PAN COPY ATTACHED'], required: false, formType: 'Both' },
        { name: 'verifierName', label: 'AUTHORIZED SIGNATORY / VERIFIER NAME', type: 'text', placeholder: 'AUTHORIZED SIGNATORY / VERIFIER NAME', required: true, formType: 'Form 94' },
        { name: 'designation', label: 'DESIGNATION OF SIGNATORY', type: 'select', options: ['PARTNER', 'DIRECTOR', 'TRUSTEE', 'AUTHORISED SIGNATORY', 'PROPRIETOR', 'KARTA'], required: true, formType: 'Form 94' },

        // Supporting Document Uploads
        { name: 'signatureUrl', label: 'UPLOAD APPLICANT / SIGNATORY SIGNATURE', type: 'file', required: false, formType: 'Both' },
        { name: 'proofOfIncorporationUrl', label: 'UPLOAD REGISTRATION CERTIFICATE (ROC / DEED)', type: 'file', required: false, formType: 'Form 94' },
        { name: 'proofOfIdentityUrl', label: 'UPLOAD IDENTITY PROOF', type: 'file', required: false, formType: 'Both' },
        { name: 'proofOfAddressUrl', label: 'UPLOAD ADDRESS PROOF', type: 'file', required: false, formType: 'Both' }
      ]
    },
    {
      id: 'epan_correction_otp',
      label: 'E-Pan Correction',
      icon: '⚡',
      fee: 107,
      badge: 'PAPER LESS E-Pan Correction OTP Base',
      badgeClass: '',
      description: 'Paperless E-Pan Correction OTP Base application.',
      fields: []
    },
    {
      id: 'epan_sign_photo',
      label: 'EPan (Sign&Photo)',
      icon: '📸',
      fee: 107,
      badge: 'PAPER LESS E- Pan Card Upload photo And Sign',
      badgeClass: '',
      description: 'Paperless E-Pan Card with photo and sign upload.',
      fields: []
    },
    {
      id: 'epan_correction_sign_photo',
      label: 'E Pan Correction photo with sign',
      icon: '✍️',
      fee: 107,
      badge: 'PAPER LESS E-Pan Correction photo with sign',
      badgeClass: '',
      description: 'Paperless E-Pan Correction with photo and sign.',
      fields: []
    }
  ];

  const [cardForm, setCardForm] = useState({ title: '', imgFile: null, icon: '', isAeps: false, url: '' });
  const [tabForm, setTabForm] = useState({ label: '', order: 0, url: '' });
  
  const [editingCardId, setEditingCardId] = useState(null);
  const [editingTabId, setEditingTabId] = useState(null);
  const [editingMenuId, setEditingMenuId] = useState(null);
  const [menuForm, setMenuForm] = useState({ label: '', url: '', isActive: false, order: 0 });
  const [bannerForm, setBannerForm] = useState({ imgFile: null, fallbackIcon: '', fallbackPerson: '' });
  const [newsImageForm, setNewsImageForm] = useState({ imgFile: null, imgFiles: null });
  const [quickLinkForm, setQuickLinkForm] = useState({ 
    title: '', 
    url: '', 
    category: 'link', 
    icon: '🔗', 
    fee: '', 
    imgFile: null,
    videoSource: 'url',
    videoFile: null,
    existingVideoUrl: ''
  });
  const [quickLinkPreview, setQuickLinkPreview] = useState(null);
  const [quickLinkVideoPreview, setQuickLinkVideoPreview] = useState(null);
  const [quickLinkSubmitting, setQuickLinkSubmitting] = useState(false);
  const quickLinkFileInputRef = useRef(null);
  const quickLinkVideoFileInputRef = useRef(null);
  const [editingQuickLinkId, setEditingQuickLinkId] = useState(null);
  const [paymentRequisitions, setPaymentRequisitions] = useState([]);
  const [upiConfig, setUpiConfig] = useState(null); // eslint-disable-line no-unused-vars
  const [upiForm, setUpiForm] = useState({ upiId: '', qrCodeImgFile: null });
  const [userForm, setUserForm] = useState({ userId: '', email: '', mobile: '', role: 'customer' });
  const [userSearch, setUserSearch] = useState('');
  const [userStatusFilter, setUserStatusFilter] = useState('All');
  const [userRoleFilter, setUserRoleFilter] = useState('All');
  const [userSortBy, setUserSortBy] = useState('newest'); // 'newest' | 'oldest' | 'userId' | 'name' | 'balanceHigh' | 'balanceLow'
  const [userPage, setUserPage] = useState(1);
  const [userPageSize, setUserPageSize] = useState(15);
  const [userViewMode, setUserViewMode] = useState('TABLE'); // 'TABLE' | 'GRID'

  const [isUserCreateModalOpen, setIsUserCreateModalOpen] = useState(false);
  const [isUserEditModalOpen, setIsUserEditModalOpen] = useState(false);
  const [isUserViewModalOpen, setIsUserViewModalOpen] = useState(false);
  const [selectedUserForModal, setSelectedUserForModal] = useState(null);
  const [isUserPermsModalOpen, setIsUserPermsModalOpen] = useState(false);
  const [selectedUserForPerms, setSelectedUserForPerms] = useState(null);
  const [userPermsFormData, setUserPermsFormData] = useState({ permissions: [] });
  const [collapsedUserModules, setCollapsedUserModules] = useState({});
  const [userPermsSaving, setUserPermsSaving] = useState(false);

  const [showCreateUserPassword, setShowCreateUserPassword] = useState(false);
  const [showCreateUserConfirmPassword, setShowCreateUserConfirmPassword] = useState(false);
  const [createUserForm, setCreateUserForm] = useState({
    fullName: '',
    name: '',
    mobile: '',
    shopName: '',
    email: '',
    businessAddress: '',
    password: '',
    confirmPassword: '',
    userId: '',
    retailerId: '',
    role: 'retailer',
    status: 'Approved',
    walletBalance: 0
  });

  const [editUserForm, setEditUserForm] = useState({
    _id: '',
    userId: '',
    retailerId: '',
    name: '',
    shopName: '',
    businessAddress: '',
    email: '',
    mobile: '',
    password: '',
    role: 'retailer',
    status: 'Approved',
    walletBalance: 0
  });

  const [reqSearch, setReqSearch] = useState('');
  const [reqStatusFilter, setReqStatusFilter] = useState('All');

  // PAN Form Manager States
  const [panTabsConfigList, setPanTabsConfigList] = useState(DEFAULT_PAN_TABS);
  const [selectedPanTabId, setSelectedPanTabId] = useState('manual_new_pan');
  const [panFormTypeFilter, setPanFormTypeFilter] = useState('Form93'); // 'Form93' (Individual), 'Form94' (Non-Individual), or 'ALL'
  const [panCategoryFilter, setPanCategoryFilter] = useState('ALL'); // Category filter option ('ALL', 'INDIVIDUAL', 'FIRM', 'COMPANY', 'TRUST', etc.)
  const [showAddTabModal, setShowAddTabModal] = useState(false);
  const [newTabForm, setNewTabForm] = useState({
    id: '',
    label: '',
    icon: '📄',
    fee: 107,
    badge: 'New Service',
    description: ''
  });
  const [newPanFieldForm, setNewPanFieldForm] = useState({
    name: '',
    label: '',
    type: 'text',
    placeholder: '',
    icon: '📝',
    required: true,
    hidden: false,
    gridSpan: 1,
    optionsRaw: ''
  });

  // Tools Management States
  const [adminTools, setAdminTools] = useState([]);
  const [isToolsServiceActive, setIsToolsServiceActive] = useState(true);
  const [isSavingTool, setIsSavingTool] = useState(false);
  const [editingToolId, setEditingToolId] = useState(null);
  const [toolSearch, setToolSearch] = useState('');
  const [toolForm, setToolForm] = useState({
    title: '',
    url: '',
    apiUrl: '',
    icon: '⚡',
    category: 'Card Cutter',
    badge: 'AI API',
    fee: 0,
    description: '',
    isActive: true
  });

  // PDF Tools Suite Sub-Tools Control States
  const [pdfSubToolsModalOpen, setPdfSubToolsModalOpen] = useState(false);
  const [currentPdfTool, setCurrentPdfTool] = useState(null);
  const [pdfSubToolsState, setPdfSubToolsState] = useState({});
  const [pdfSubToolFilterCategory, setPdfSubToolFilterCategory] = useState('all');
  const [pdfSubToolSearch, setPdfSubToolSearch] = useState('');
  const [isSavingPdfSubTools, setIsSavingPdfSubTools] = useState(false);
  
  const [draggedIndex, setDraggedIndex] = useState(null);

  const handleDragStart = (index) => setDraggedIndex(index);

  const handleDragEnter = (e, index, list, setList) => {
    if (draggedIndex === index) return;
    const newList = [...list];
    const draggedItem = newList[draggedIndex];
    newList.splice(draggedIndex, 1);
    newList.splice(index, 0, draggedItem);
    setDraggedIndex(index);
    setList(newList);
  };

  const handleDragEnd = async (endpoint, list) => {
    setDraggedIndex(null);
    const orderedIds = list.map(item => item._id);
    try {
      await fetch(`${API_URL}/api/${endpoint}/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds })
      });
    } catch (e) { console.error("Error saving order"); }
  };

  // Drag and drop states & handlers for dynamic link menus tab switcher (Photo 2)
  const [draggedMenuTabIdx, setDraggedMenuTabIdx] = useState(null);
  const isDraggingMenuTabRef = useRef(false);
  const latestSidebarMenusRef = useRef(sidebarMenus);
  useEffect(() => {
    latestSidebarMenusRef.current = sidebarMenus;
  }, [sidebarMenus]);

  const handleMenuTabDragStart = (e, index) => {
    setDraggedMenuTabIdx(index);
    isDraggingMenuTabRef.current = false;
    e.dataTransfer.effectAllowed = 'move';
    try {
      e.dataTransfer.setData('text/plain', String(index));
    } catch (err) {}
  };

  const handleMenuTabDragEnter = (e, targetIdx) => {
    e.preventDefault();
    if (draggedMenuTabIdx === null || draggedMenuTabIdx === targetIdx) return;
    isDraggingMenuTabRef.current = true;

    const currentLinks = [...allLinkMenusList];
    const [movedLink] = currentLinks.splice(draggedMenuTabIdx, 1);
    currentLinks.splice(targetIdx, 0, movedLink);
    setDraggedMenuTabIdx(targetIdx);

    const currentSidebar = latestSidebarMenusRef.current || sidebarMenus || [];
    const nonLinkMenus = currentSidebar.filter(sm => {
      return !currentLinks.some(lm => lm._id && String(lm._id) === String(sm._id));
    });
    const updatedLinkMenus = currentLinks
      .map(lm => currentSidebar.find(sm => lm._id && String(sm._id) === String(lm._id)))
      .filter(Boolean);

    const combined = [...nonLinkMenus, ...updatedLinkMenus];
    latestSidebarMenusRef.current = combined;
    setSidebarMenus(combined);
  };

  const handleMenuTabDragEnd = async () => {
    setDraggedMenuTabIdx(null);
    setTimeout(() => {
      isDraggingMenuTabRef.current = false;
    }, 120);

    const toSave = latestSidebarMenusRef.current || sidebarMenus || [];
    const orderedIds = toSave.map(m => m._id).filter(Boolean);
    if (orderedIds.length > 0) {
      try {
        await fetch(`${API_URL}/api/sidebar-menus/reorder`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderedIds })
        });
        showCustomToast('Position Saved', 'Dynamic menu positions updated successfully.', 'success', 1800);
      } catch (err) {
        console.error('Failed to save reordered dynamic menus:', err);
      }
    }
  };

  // Drag and drop states & handlers for PAN form field reordering
  const [draggedPanFieldIndex, setDraggedPanFieldIndex] = useState(null);
  const [dragOverPanFieldIndex, setDragOverPanFieldIndex] = useState(null);

  const handlePanFieldDragStart = (e, index) => {
    setDraggedPanFieldIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    try {
      e.dataTransfer.setData('text/plain', String(index));
    } catch (err) {}
  };

  const handlePanFieldDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverPanFieldIndex !== index) {
      setDragOverPanFieldIndex(index);
    }
  };

  const handlePanFieldDrop = (e, targetIndex) => {
    e.preventDefault();
    const fromIndex = draggedPanFieldIndex !== null ? draggedPanFieldIndex : parseInt(e.dataTransfer.getData('text/plain'), 10);

    if (isNaN(fromIndex) || fromIndex === null || fromIndex === targetIndex) {
      setDraggedPanFieldIndex(null);
      setDragOverPanFieldIndex(null);
      return;
    }

    const updated = panTabsConfigList.map(tab => {
      if (tab.id === selectedPanTabId) {
        const fields = [...(tab.fields || [])];
        const [movedField] = fields.splice(fromIndex, 1);
        fields.splice(targetIndex, 0, movedField);
        return { ...tab, fields };
      }
      return tab;
    });

    setPanTabsConfigList(updated);
    handleSavePanTabsConfig(updated);
    setDraggedPanFieldIndex(null);
    setDragOverPanFieldIndex(null);
  };

  const handlePanFieldDragEnd = () => {
    setDraggedPanFieldIndex(null);
    setDragOverPanFieldIndex(null);
  };

  const handleSavePanTabsConfig = async (overrideList) => {
    const listToSave = overrideList || panTabsConfigList;
    try {
      const res = await fetch(`${API_URL}/api/pancard/tabs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tabs: listToSave })
      });
      const data = await res.json();
      if (data.success) {
        window.dispatchEvent(new Event('pan_tabs_updated'));
        if (!overrideList) {
          Swal.fire({ icon: 'success', title: 'Saved!', text: 'PAN Card form configurations saved successfully.', timer: 1500, showConfirmButton: false });
        }
      }
    } catch (err) {
      console.error('Error saving PAN tabs config:', err);
    }
  };

  const handleUpdatePanField = (fieldIndex, prop, value) => {
    const updated = panTabsConfigList.map(tab => {
      if (tab.id === selectedPanTabId) {
        const fields = [...(tab.fields || [])];
        fields[fieldIndex] = { ...fields[fieldIndex], [prop]: value };
        return { ...tab, fields };
      }
      return tab;
    });
    setPanTabsConfigList(updated);
    handleSavePanTabsConfig(updated);
  };

  const handleTogglePanField = (fieldIndex, prop) => {
    const updated = panTabsConfigList.map(tab => {
      if (tab.id === selectedPanTabId) {
        const fields = [...(tab.fields || [])];
        const currentVal = fields[fieldIndex][prop];
        fields[fieldIndex] = { ...fields[fieldIndex], [prop]: !currentVal };
        return { ...tab, fields };
      }
      return tab;
    });
    setPanTabsConfigList(updated);
    handleSavePanTabsConfig(updated);
  };

  const handleMovePanField = (fieldIndex, direction) => {
    const updated = panTabsConfigList.map(tab => {
      if (tab.id === selectedPanTabId) {
        const fields = [...(tab.fields || [])];
        const targetIndex = direction === 'up' ? fieldIndex - 1 : fieldIndex + 1;
        if (targetIndex < 0 || targetIndex >= fields.length) return tab;
        const temp = fields[fieldIndex];
        fields[fieldIndex] = fields[targetIndex];
        fields[targetIndex] = temp;
        return { ...tab, fields };
      }
      return tab;
    });
    setPanTabsConfigList(updated);
    handleSavePanTabsConfig(updated);
  };

  const handleDeletePanField = async (fieldIndex) => {
    const confirmRes = await Swal.fire({
      title: 'Delete Input Field?',
      text: 'Are you sure you want to delete this input field from the form configuration?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Yes, Delete Field',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#e11d48',
      cancelButtonColor: '#64748b'
    });

    if (!confirmRes.isConfirmed) return;

    const updated = panTabsConfigList.map(tab => {
      if (tab.id === selectedPanTabId) {
        const fields = (tab.fields || []).filter((_, idx) => idx !== fieldIndex);
        return { ...tab, fields };
      }
      return tab;
    });
    setPanTabsConfigList(updated);
    await handleSavePanTabsConfig(updated);
    Swal.fire({ icon: 'success', title: 'Deleted!', text: 'Field removed successfully.', timer: 1200, showConfirmButton: false });
  };

  const handleAddFieldToPanTab = () => {
    if (!newPanFieldForm.label.trim()) {
      return Swal.fire({ icon: 'warning', text: 'Please enter a field label.' });
    }

    const nameKey = newPanFieldForm.name.trim() || newPanFieldForm.label.toLowerCase().replace(/[^a-zA-Z0-9]/g, '');
    const options = newPanFieldForm.type === 'select' && newPanFieldForm.optionsRaw
      ? newPanFieldForm.optionsRaw.split(',').map(s => s.trim()).filter(Boolean)
      : [];

    const isDualFormTab = selectedPanTabId === 'manual_new_pan' || selectedPanTabId === 'epan_correction';
    const newFieldObj = {
      name: nameKey,
      label: newPanFieldForm.label,
      type: newPanFieldForm.type,
      placeholder: newPanFieldForm.placeholder,
      icon: newPanFieldForm.icon || '📝',
      required: newPanFieldForm.required,
      hidden: newPanFieldForm.hidden,
      formType: isDualFormTab ? (panFormTypeFilter === 'Form94' ? 'Form 94' : 'Form 93') : 'Both',
      ...(options.length > 0 ? { options } : {})
    };

    const updated = panTabsConfigList.map(tab => {
      if (tab.id === selectedPanTabId) {
        return { ...tab, fields: [...(tab.fields || []), newFieldObj] };
      }
      return tab;
    });

    setPanTabsConfigList(updated);
    handleSavePanTabsConfig(updated);
    setNewPanFieldForm({ name: '', label: '', type: 'text', placeholder: '', icon: '📝', required: true, hidden: false, gridSpan: 1, optionsRaw: '' });
    Swal.fire({ icon: 'success', title: 'Field Added!', text: `Field "${newPanFieldForm.label}" added to ${newFieldObj.formType}.`, timer: 1500, showConfirmButton: false });
  };

  const handleResetDefaultPanFields = async () => {
    const confirmRes = await Swal.fire({
      title: 'Reset Standard Fields?',
      text: 'Reset all fields for this form back to standard defaults? Custom fields added will be replaced.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Yes, Reset Fields',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#ea580c',
      cancelButtonColor: '#64748b'
    });

    if (!confirmRes.isConfirmed) return;

    const defaultTab = DEFAULT_PAN_TABS.find(t => t.id === selectedPanTabId);
    if (!defaultTab) return;
    const updated = panTabsConfigList.map(tab => {
      if (tab.id === selectedPanTabId) {
        return { ...tab, fields: [...defaultTab.fields] };
      }
      return tab;
    });
    setPanTabsConfigList(updated);
    await handleSavePanTabsConfig(updated);
    Swal.fire({ icon: 'success', title: 'Reset Complete!', text: 'Form fields restored to default.', timer: 1200, showConfirmButton: false });
  };

  const handleUpdateTabHeader = (field, value) => {
    const updated = panTabsConfigList.map(tab => {
      if (tab.id === selectedPanTabId) {
        return { ...tab, [field]: value };
      }
      return tab;
    });
    setPanTabsConfigList(updated);
    handleSavePanTabsConfig(updated);
  };

  const handleAddNewPanTab = () => {
    if (!newTabForm.label.trim()) return Swal.fire({ icon: 'warning', text: 'Please provide a tab title.' });
    const tabId = newTabForm.id.trim() || newTabForm.label.toLowerCase().replace(/[^a-zA-Z0-9]/g, '_');
    const newTab = {
      id: tabId,
      label: newTabForm.label,
      icon: newTabForm.icon || '📄',
      fee: Number(newTabForm.fee) || 107,
      badge: newTabForm.badge || 'New Service',
      description: newTabForm.description || '',
      fields: []
    };
    const updated = [...panTabsConfigList, newTab];
    setPanTabsConfigList(updated);
    setSelectedPanTabId(tabId);
    handleSavePanTabsConfig(updated);
    setNewTabForm({ id: '', label: '', icon: '📄', fee: 107, badge: 'New Service', description: '' });
    setShowAddTabModal(false);
  };

  const handleDeletePanTab = async (tabId) => {
    if (panTabsConfigList.length <= 1) return Swal.fire({ icon: 'warning', text: 'You cannot delete the last remaining service tab.' });
    const confirmRes = await Swal.fire({
      title: 'Delete Service Tab?',
      text: 'Delete this service sub-tab permanently?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Yes, Delete Tab',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#e11d48',
      cancelButtonColor: '#64748b'
    });

    if (!confirmRes.isConfirmed) return;

    const updated = panTabsConfigList.filter(t => t.id !== tabId);
    setPanTabsConfigList(updated);
    if (selectedPanTabId === tabId) {
      setSelectedPanTabId(updated[0].id);
    }
    await handleSavePanTabsConfig(updated);
    Swal.fire({ icon: 'success', title: 'Deleted!', text: 'Service sub-tab removed.', timer: 1200, showConfirmButton: false });
  };



  useEffect(() => { fetchAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fetch links data whenever the active tab changes to a link-type tab.
  // Also applies frontend filtering to guarantee each tab shows only its own links.
  useEffect(() => {
    const isLinkTab = activeTab === 'quickLinks' || dynamicLinkMenusList.some(m => m.key === activeTab) || DYNAMIC_LINK_MENUS.some(m => m.key === activeTab);
    if (isLinkTab) {
      apiFetch(`/api/quick-links?menuKey=${activeTab}`)
        .then(res => res.json())
        .then(data => { setQuickLinks(filterLinksByMenuKey(data, activeTab)); })
        .catch(err => console.error('Failed to reload links for tab:', activeTab, err));
    }
  }, [activeTab, dynamicLinkMenusList]); // eslint-disable-line react-hooks/exhaustive-deps


  const fetchLedgerTransactions = async () => {
    setLedgerLoading(true);
    try {
      let url = `${API_URL}/api/wallet-transactions/report`;
      if (activeTab === 'ledgerHistory') {
        const params = new URLSearchParams();
        if (ledgerFilters.userId) params.append('userId', ledgerFilters.userId);
        if (ledgerFilters.startDate) params.append('startDate', ledgerFilters.startDate);
        if (ledgerFilters.endDate) params.append('endDate', ledgerFilters.endDate);
        if (ledgerFilters.month) params.append('month', ledgerFilters.month);
        if (ledgerFilters.transactionType && ledgerFilters.transactionType !== 'All') params.append('transactionType', ledgerFilters.transactionType);
        if (ledgerFilters.status && ledgerFilters.status !== 'All') params.append('status', ledgerFilters.status);
        if (ledgerFilters.search) params.append('search', ledgerFilters.search);
        const qs = params.toString();
        if (qs) url += `?${qs}`;
      }
      
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setLedgerTransactions(data);
      }
    } catch (err) {
      console.error("Error fetching ledger report:", err);
    } finally {
      setLedgerLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'ledgerHistory' || activeTab === 'payInHistory' || activeTab === 'payOutHistory' || activeTab === 'feesNewApplication' || activeTab === 'feesCorrection') {
      fetchLedgerTransactions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, ledgerFilters]);

  const handleApplyFilters = () => {
    setLedgerFilters({ ...filterInput });
    setLedgerPage(1);
  };

  const handleResetFilters = () => {
    const emptyFilters = {
      userId: '',
      startDate: '',
      endDate: '',
      month: '',
      transactionType: 'All',
      status: 'All',
      search: ''
    };
    setFilterInput(emptyFilters);
    setLedgerFilters(emptyFilters);
    setLedgerPage(1);
  };

  const exportLedgerToCSV = (transactions) => {
    if (!transactions || transactions.length === 0) {
      return Swal.fire({ icon: 'warning', text: 'No transaction data to export.' });
    }
    const headers = ['Date', 'User ID', 'Transaction Type', 'Amount (INR)', 'Balance Before (INR)', 'Balance After (INR)', 'Description', 'Reference Number', 'Status'];
    const rows = transactions.map(t => [
      new Date(t.createdAt).toLocaleString(),
      t.userId,
      t.transactionType,
      t.amount,
      t.balanceBefore,
      t.balanceAfter,
      t.description,
      t.referenceNumber,
      t.status
    ]);
    
    const csvContent = "\uFEFF" + [headers.join(','), ...rows.map(r => r.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `ledger_history_report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const printLedgerPDF = (transactions, filters) => {
    if (!transactions || transactions.length === 0) {
      return Swal.fire({ icon: 'warning', text: 'No transaction data to print.' });
    }
    const printWindow = window.open('', '_blank');
    const filterInfo = `
      ${filters.userId ? `<strong>User ID:</strong> ${filters.userId} | ` : ''}
      ${filters.startDate ? `<strong>Start Date:</strong> ${filters.startDate} | ` : ''}
      ${filters.endDate ? `<strong>End Date:</strong> ${filters.endDate} | ` : ''}
      ${filters.month ? `<strong>Month:</strong> ${filters.month} | ` : ''}
      ${filters.transactionType !== 'All' ? `<strong>Type:</strong> ${filters.transactionType} | ` : ''}
      ${filters.status !== 'All' ? `<strong>Status:</strong> ${filters.status}` : ''}
    `.trim().replace(/\|\s*$/, '');

    const tableRowsHtml = transactions.map(t => `
      <tr>
        <td>${new Date(t.createdAt).toLocaleString()}</td>
        <td>${t.userId}</td>
        <td><span class="badge ${t.transactionType.toLowerCase()}">${t.transactionType}</span></td>
        <td class="amount text-right">₹${parseFloat(t.amount).toFixed(2)}</td>
        <td class="amount text-right">₹${parseFloat(t.balanceBefore).toFixed(2)}</td>
        <td class="amount text-right">₹${parseFloat(t.balanceAfter).toFixed(2)}</td>
        <td>${t.description}</td>
        <td class="mono">${t.referenceNumber}</td>
        <td><span class="status-badge ${t.status.toLowerCase()}">${t.status}</span></td>
      </tr>
    `).join('');

    const htmlContent = `
      <html>
      <head>
        <title>Ledger History Report</title>
        <style>
          body { font-family: 'Inter', system-ui, -apple-system, sans-serif; color: #1e293b; padding: 20px; font-size: 12px; line-height: 1.5; }
          .header { border-bottom: 2px solid #4318ff; padding-bottom: 15px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-end; }
          .title h1 { margin: 0; font-size: 22px; color: #1b2559; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; }
          .title p { margin: 5px 0 0 0; color: #64748b; font-size: 12px; }
          .meta-info { text-align: right; font-size: 11px; color: #64748b; }
          .filters-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 15px; margin-bottom: 20px; font-size: 11px; }
          .filters-box h4 { margin: 0 0 6px 0; color: #475569; font-weight: 700; text-transform: uppercase; font-size: 10px; letter-spacing: 0.5px; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; page-break-inside: auto; }
          tr { page-break-inside: avoid; page-break-after: auto; }
          th { background: #f1f5f9; color: #475569; font-weight: 700; text-transform: uppercase; font-size: 10px; letter-spacing: 0.5px; padding: 10px 12px; text-align: left; border-bottom: 1.5px solid #cbd5e1; }
          td { padding: 10px 12px; border-bottom: 1px solid #e2e8f0; vertical-align: middle; word-break: break-word; }
          .text-right { text-align: right; }
          .amount { font-weight: 700; font-family: monospace; font-size: 12px; }
          .badge { padding: 3px 8px; border-radius: 12px; font-size: 9px; font-weight: 800; text-transform: uppercase; display: inline-block; }
          .badge.credit { background: #dcfce7; color: #166534; }
          .badge.debit { background: #fee2e2; color: #991b1b; }
          .status-badge { padding: 3px 8px; border-radius: 12px; font-size: 9px; font-weight: 700; display: inline-block; }
          .status-badge.success { background: #dcfce7; color: #166534; }
          .status-badge.pending { background: #fef9c3; color: #854d0e; }
          .status-badge.failed { background: #fee2e2; color: #991b1b; }
          .mono { font-family: monospace; font-size: 10px; color: #475569; }
          @media print {
            body { padding: 0; }
            .no-print { display: none; }
            @page { margin: 1.5cm; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="title">
            <h1>Ledger History Report</h1>
            <p>MB Mitra Wallet Transaction Logs</p>
          </div>
          <div class="meta-info">
            <strong>Generated:</strong> ${new Date().toLocaleString()}<br/>
            <strong>Total Records:</strong> ${transactions.length}
          </div>
        </div>
        ${filterInfo ? `
          <div class="filters-box">
            <h4>Active Filters</h4>
            <div>${filterInfo}</div>
          </div>
        ` : ''}
        <table>
          <thead>
            <tr>
              <th>Date & Time</th>
              <th>User ID</th>
              <th>Type</th>
              <th class="text-right">Amount</th>
              <th class="text-right">Before</th>
              <th class="text-right">After</th>
              <th>Description</th>
              <th>Reference No</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${tableRowsHtml}
          </tbody>
        </table>
        <script>
          window.onload = function() {
            window.print();
          }
        </script>
      </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  const downloadCSVTemplate = () => {
    const headers = ['userId', 'transactionType', 'amount', 'description', 'referenceNumber', 'status', 'createdAt'];
    const sampleRow = ['MBM000012', 'Credit', '1000', 'Top-up reward', 'REF998877', 'Success', new Date().toISOString()];
    const csvContent = "\uFEFF" + [headers.join(','), sampleRow.join(',')].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "ledger_import_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const parseCSV = (text) => {
    const lines = [];
    let row = [""];
    let insideQuote = false;
    
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];
      
      if (char === '"') {
        if (insideQuote && nextChar === '"') {
          row[row.length - 1] += '"';
          i++; // skip next quote
        } else {
          insideQuote = !insideQuote;
        }
      } else if (char === ',' && !insideQuote) {
        row.push('');
      } else if ((char === '\r' || char === '\n') && !insideQuote) {
        if (char === '\r' && nextChar === '\n') {
          i++; // skip \n
        }
        lines.push(row);
        row = [''];
      } else {
        row[row.length - 1] += char;
      }
    }
    if (row.length > 1 || row[0] !== '') {
      lines.push(row);
    }
    return lines;
  };

  const handleCsvImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const text = evt.target.result;
        const rows = parseCSV(text);
        if (rows.length < 2) {
          return Swal.fire({ icon: 'error', text: 'The CSV file is empty or only contains headers.' });
        }
        
        const headers = rows[0].map(h => h.trim().toLowerCase());
        
        // Required fields index
        const userIdIdx = headers.indexOf('userid');
        const typeIdx = headers.indexOf('transactiontype');
        const amountIdx = headers.indexOf('amount');
        const descIdx = headers.indexOf('description');
        const refIdx = headers.indexOf('referencenumber');
        const statusIdx = headers.indexOf('status');
        const dateIdx = headers.indexOf('createdat');
        
        if (userIdIdx === -1 || typeIdx === -1 || amountIdx === -1) {
          return Swal.fire({
            icon: 'error',
            title: 'Invalid CSV Headers',
            text: 'CSV must contain at least "userId", "transactionType", and "amount" columns.'
          });
        }
        
        const transactions = [];
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (row.length <= 1 && row[0] === '') continue; // skip empty rows
          
          const userId = row[userIdIdx] ? row[userIdIdx].trim() : '';
          const transactionType = row[typeIdx] ? row[typeIdx].trim() : '';
          const amount = row[amountIdx] ? parseFloat(row[amountIdx].trim()) : 0;
          const description = descIdx !== -1 && row[descIdx] ? row[descIdx].trim() : '';
          const referenceNumber = refIdx !== -1 && row[refIdx] ? row[refIdx].trim() : '';
          const status = statusIdx !== -1 && row[statusIdx] ? row[statusIdx].trim() : 'Success';
          const createdAt = dateIdx !== -1 && row[dateIdx] ? row[dateIdx].trim() : undefined;
          
          if (!userId || !transactionType || isNaN(amount)) {
            continue; // skip rows with missing essential fields
          }
          
          transactions.push({
            userId,
            transactionType,
            amount,
            description,
            referenceNumber,
            status,
            createdAt
          });
        }
        
        if (transactions.length === 0) {
          return Swal.fire({ icon: 'warning', text: 'No valid transaction records found in the CSV.' });
        }
        
        // Prompt confirmation
        const confirm = await Swal.fire({
          title: 'Confirm Import',
          text: `Are you sure you want to import ${transactions.length} transaction records? User balances will be updated accordingly.`,
          icon: 'question',
          showCancelButton: true,
          confirmButtonText: 'Yes, Import',
          cancelButtonText: 'Cancel'
        });
        
        if (!confirm.isConfirmed) return;
        
        // Send to server
        Swal.showLoading();
        const res = await fetch(`${API_URL}/api/wallet-transactions/import`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transactions })
        });
        
        const result = await res.json();
        Swal.close();
        
        if (res.ok) {
          let msg = `Successfully imported ${result.successCount} transactions.`;
          if (result.failedCount > 0) {
            msg += ` Failed to import ${result.failedCount} rows.`;
            const failures = result.details.filter(d => d.status === 'Failed').slice(0, 5).map(f => `Row ${f.row}: ${f.message}`).join('\n');
            msg += `\n\nFirst few errors:\n${failures}`;
          }
          Swal.fire({
            icon: result.failedCount > 0 ? 'warning' : 'success',
            title: 'Import Complete',
            text: msg,
            customClass: {
              htmlContainer: 'swal-pre-wrap'
            }
          });
          
          fetchLedgerTransactions();
        } else {
          Swal.fire({ icon: 'error', title: 'Import Failed', text: result.message || 'Server error during import.' });
        }
      } catch (err) {
        console.error(evt, err);
        Swal.fire({ icon: 'error', title: 'Import Error', text: 'An error occurred while parsing the CSV file.' });
      }
    };
    reader.readAsText(file);
    e.target.value = null;
  };

  const filteredRetailers = useMemo(() => {
    const q = retailerSearchQuery.toLowerCase().trim();
    if (!q) return users;
    return users.filter(u => {
      const nameMatch = u.name && u.name.toLowerCase().includes(q);
      const userIdMatch = u.userId && u.userId.toLowerCase().includes(q);
      const retailerIdMatch = u.retailerId && u.retailerId.toLowerCase().includes(q);
      const mobileMatch = u.mobile && u.mobile.toString().includes(q);
      const shopMatch = u.shopName && u.shopName.toLowerCase().includes(q);
      const emailMatch = u.email && u.email.toLowerCase().includes(q);
      return nameMatch || userIdMatch || retailerIdMatch || mobileMatch || shopMatch || emailMatch;
    });
  }, [users, retailerSearchQuery]);

  const handleAdminWalletTransfer = async (e) => {
    if (e) e.preventDefault();
    if (!selectedRetailer) {
      return Swal.fire({ icon: 'warning', title: 'Select Retailer', text: 'Please search and select a retailer to transfer payment.' });
    }
    const amountNum = Number(transferAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      return Swal.fire({ icon: 'warning', title: 'Invalid Amount', text: 'Please enter a valid amount greater than 0.' });
    }

    const currentBal = Number(selectedRetailer.walletBalance || 0);
    const newBal = transferTxType === 'Credit' ? currentBal + amountNum : currentBal - amountNum;

    const confirmResult = await Swal.fire({
      title: `Confirm ${transferTxType.toUpperCase()} Payment?`,
      html: `
        <div style="text-align: left; background: #f8fafc; padding: 14px; border-radius: 10px; border: 1px solid #e2e8f0; font-size: 13.5px; font-family: sans-serif;">
          <p style="margin: 5px 0;"><strong>Retailer Name:</strong> ${selectedRetailer.name || selectedRetailer.userId}</p>
          <p style="margin: 5px 0;"><strong>User ID:</strong> ${selectedRetailer.userId} ${selectedRetailer.retailerId ? `(${selectedRetailer.retailerId})` : ''}</p>
          <p style="margin: 5px 0;"><strong>Mobile No:</strong> ${selectedRetailer.mobile || 'N/A'}</p>
          <hr style="border: none; border-top: 1px dashed #cbd5e1; margin: 10px 0;" />
          <p style="margin: 5px 0;"><strong>Action:</strong> <span style="color: ${transferTxType === 'Credit' ? '#16a34a' : '#dc2626'}; font-weight: 800;">${transferTxType === 'Credit' ? 'CREDIT (+)' : 'DEBIT (-)'} ₹${amountNum.toFixed(2)}</span></p>
          <p style="margin: 5px 0;"><strong>Current Balance:</strong> ₹${currentBal.toFixed(2)}</p>
          <p style="margin: 5px 0; color: #0284c7; font-weight: 800; font-size: 15px;"><strong>New Balance:</strong> ₹${newBal.toFixed(2)}</p>
          ${transferRemarks ? `<p style="margin: 5px 0; color: #475569;"><strong>Remarks:</strong> ${transferRemarks}</p>` : ''}
        </div>
      `,
      icon: transferTxType === 'Credit' ? 'info' : 'warning',
      showCancelButton: true,
      confirmButtonText: `Yes, ${transferTxType} ₹${amountNum}`,
      cancelButtonText: 'Cancel',
      confirmButtonColor: transferTxType === 'Credit' ? '#16a34a' : '#dc2626',
      cancelButtonColor: '#64748b'
    });

    if (!confirmResult.isConfirmed) return;

    setTransferLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/wallet-transactions/admin-transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetUserId: selectedRetailer.userId,
          transactionType: transferTxType,
          amount: amountNum,
          description: transferRemarks.trim() || `Admin Manual Payment (${transferTxType})`
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to process wallet transfer');

      Swal.fire({
        icon: 'success',
        title: 'Transaction Successful!',
        text: data.message,
        timer: 2200,
        showConfirmButton: false
      });

      // Refresh users list and ledger history
      const usersRes = await fetch(`${API_URL}/api/users`);
      if (usersRes.ok) {
        const updatedUsers = await usersRes.json();
        setUsers(updatedUsers);
        const updatedSelected = updatedUsers.find(u => u.userId === selectedRetailer.userId);
        if (updatedSelected) setSelectedRetailer(updatedSelected);
      }
      fetchLedgerTransactions();

      // Reset amount and remarks
      setTransferAmount('');
      setTransferRemarks('');
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Transfer Failed', text: err.message });
    } finally {
      setTransferLoading(false);
    }
  };

  const fetchAll = (linkMenuKeyOverride) => {
    const load = (path, onData) => apiFetch(path)
      .then(response => {
        if (!response.ok) throw new Error(`Request failed (${response.status})`);
        return response.json();
      })
      .then(onData)
      .catch(error => console.error(`Error loading ${path}:`, error));

    load('/api/action-cards', setCards);
    load('/api/top-tabs', setTopTabs);
    load('/api/sidebar-menus', setSidebarMenus);
    load('/api/crm/cards', setCrmCards);
    load('/api/banners', setBanners);
    load('/api/news-images', setNewsImages);
    // Use the explicitly-passed key first; fall back to activeTab only if it's a link menu; else 'quickLinks'
    const activeLinkMenuKey = linkMenuKeyOverride
      || (dynamicLinkMenusList.some(m => m.key === activeTab) || DYNAMIC_LINK_MENUS.some(m => m.key === activeTab) ? activeTab
        : activeTab === 'quickLinks' ? 'quickLinks' : null);
    if (activeLinkMenuKey) {
      // Apply frontend filtering as safety net against unfiltered backend responses
      load(`/api/quick-links?menuKey=${activeLinkMenuKey}`, data =>
        setQuickLinks(filterLinksByMenuKey(data, activeLinkMenuKey))
      );
    }
    load('/api/users', setUsers);
    load('/api/payment-requisitions', setPaymentRequisitions);
    load('/api/wallet-transactions/report', data => {
      if (Array.isArray(data)) {
        setLedgerTransactions(data);
      }
    });
    load('/api/pancard/stats', data => {
      if (data && data.success) {
        setPanSubmissionsData(data);
      }
    });
    load('/api/pancard/tabs', data => {
      if (Array.isArray(data) && data.length > 0) {
        const merged = data.map(tab => {
          const defaultTabObj = DEFAULT_PAN_TABS.find(d => d.id === tab.id);
          let fields = tab.fields && tab.fields.length > 0 ? tab.fields : (defaultTabObj ? defaultTabObj.fields : []);
          if (tab.id === 'epan_correction' && (!tab.fields || tab.fields.length <= 5)) {
            fields = defaultTabObj ? defaultTabObj.fields : [];
          }
          
          // Ensure state and district fields have upper case labels and complete option lists
          fields = fields.map(f => {
            if (f.name === 'state') {
              return { ...f, label: (f.label && f.label !== 'state') ? f.label : 'STATE', options: ['PLEASE SELECT', ...ALL_INDIAN_STATES] };
            }
            if (f.name === 'district') {
              return { ...f, label: (f.label && f.label !== 'district') ? f.label : 'TOWN/DISTRICT', options: ['SELECT', ...ALL_INDIAN_DISTRICTS] };
            }
            return f;
          });

          return { ...tab, fields };
        });
        setPanTabsConfigList(merged);
      }
    });
    load('/api/upi-config', data => {
      setUpiConfig(data);
      if(data) setUpiForm({ upiId: data.upiId || '', qrCodeImgFile: null });
    });
    load('/api/site-settings/dashboard_marquee', data => {
      if (data && data.success && data.value) {
        setMarqueeInput(data.value);
      }
    });
    load('/api/tools', data => {
      if (Array.isArray(data)) setAdminTools(data);
    });
    load('/api/tools/service-status', data => {
      if (data && data.isActive !== undefined) setIsToolsServiceActive(Boolean(data.isActive));
    });
  };

  const handleToggleToolsMasterService = async () => {
    const newStatus = !isToolsServiceActive;
    try {
      const res = await fetch(`${API_URL}/api/tools/toggle-service`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: newStatus })
      });
      if (res.ok) {
        setIsToolsServiceActive(newStatus);
        fetchAll();
        showCustomToast(
          `Tools Service is now ${newStatus ? 'ON (Active)' : 'OFF (Paused)'}`,
          newStatus ? 'All tools are now visible and accessible to retailers.' : 'Tools section is now hidden/disabled for retailers.',
          newStatus ? 'success' : 'warning',
          2500
        );
      }
    } catch (err) {
      console.error('Failed to toggle tools master service:', err);
      Swal.fire({ icon: 'error', text: 'Failed to update service status.' });
    }
  };

  const handleToggleSingleTool = async (tool) => {
    if (!tool || !tool._id) return;
    const newActive = !tool.isActive;
    try {
      setAdminTools(prev => prev.map(t => t._id === tool._id ? { ...t, isActive: newActive } : t));
      await fetch(`${API_URL}/api/tools/${tool._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: newActive })
      });
      showCustomToast(
        `${tool.title} ${newActive ? 'Enabled' : 'Disabled'}`,
        newActive ? 'Tool is now active in user panel.' : 'Tool is now hidden from user panel.',
        newActive ? 'success' : 'warning',
        1800
      );
    } catch (err) {
      console.error('Failed to toggle tool:', err);
    }
  };

  const handleSaveTool = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!toolForm.title.trim()) {
      return Swal.fire({ icon: 'warning', text: 'Please enter a title for the tool.' });
    }
    setIsSavingTool(true);
    const parsedFee = toolForm.fee === '' ? 0 : (parseFloat(toolForm.fee) || 0);
    const payload = {
      ...toolForm,
      fee: parsedFee
    };
    try {
      if (editingToolId) {
        const res = await fetch(`${API_URL}/api/tools/${editingToolId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          const updated = await res.json();
          setAdminTools(prev => prev.map(t => t._id === editingToolId ? updated : t));
          setEditingToolId(null);
          setToolForm({ title: '', url: '', apiUrl: '', icon: '⚡', category: 'Card Cutter', badge: 'AI API', fee: 0, description: '', isActive: true });
          showCustomToast('Tool Updated', `"${updated.title}" was updated successfully.`, 'success', 2000);
        }
      } else {
        const res = await fetch(`${API_URL}/api/tools`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          const created = await res.json();
          setAdminTools(prev => [...prev, created]);
          setToolForm({ title: '', url: '', apiUrl: '', icon: '⚡', category: 'Card Cutter', badge: 'AI API', fee: 0, description: '', isActive: true });
          showCustomToast('Tool Added', `"${created.title}" was created successfully.`, 'success', 2000);
        }
      }
    } catch (err) {
      console.error('Error saving tool:', err);
      Swal.fire({ icon: 'error', text: 'Failed to save tool.' });
    } finally {
      setIsSavingTool(false);
    }
  };

  const handleDeleteTool = async (toolId, toolTitle) => {
    const confirmRes = await Swal.fire({
      title: `Delete "${toolTitle}"?`,
      text: 'Are you sure you want to remove this tool from the suite?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Yes, Delete',
      confirmButtonColor: '#ef4444',
      cancelButtonText: 'Cancel'
    });
    if (!confirmRes.isConfirmed) return;
    try {
      const res = await fetch(`${API_URL}/api/tools/${toolId}`, { method: 'DELETE' });
      if (res.ok) {
        setAdminTools(prev => prev.filter(t => t._id !== toolId));
        showCustomToast('Tool Deleted', `"${toolTitle}" was removed.`, 'success', 1800);
      }
    } catch (err) {
      console.error('Error deleting tool:', err);
    }
  };

  // PDF Tools Suite Sub-Tools Catalog & Helpers
  const DEFAULT_PDF_SUBTOOLS = [
    { id: 'image_to_pdf', category: 'conversion', title: 'JPG / PNG to PDF', badge: 'Conversion', icon: '🖼️', description: 'Combine one or multiple images into a high-quality PDF document.', fee: 0, isActive: true, isDeleted: false },
    { id: 'pdf_to_images', category: 'conversion', title: 'PDF to JPG / PNG', badge: 'Conversion', icon: '📸', description: 'Convert every page of your PDF into high-resolution JPG or PNG images.', fee: 0, isActive: true, isDeleted: false },
    { id: 'word_to_pdf', category: 'conversion', title: 'Word to PDF', badge: 'Conversion', icon: '📝', description: 'Convert Microsoft Word documents (.docx, .doc) into standard PDF documents.', fee: 0, isActive: true, isDeleted: false },
    { id: 'pdf_to_word', category: 'conversion', title: 'PDF to Word (Editable)', badge: 'Conversion', icon: '📄', description: 'Convert PDF documents into editable Microsoft Word (.docx) documents.', fee: 0, isActive: true, isDeleted: false },
    { id: 'pdf_to_excel', category: 'conversion', title: 'PDF to Excel (.xlsx)', badge: 'Conversion', icon: '📊', description: 'Extract tables and tabular contents from PDF into formatted Excel (.xlsx).', fee: 0, isActive: true, isDeleted: false },
    { id: 'merge_pdfs', category: 'management', title: 'Merge PDF Files', badge: 'Management', icon: '📑', description: 'Combine multiple PDF documents into a single document in customized order.', fee: 0, isActive: true, isDeleted: false },
    { id: 'split_pdf', category: 'management', title: 'Split PDF Pages', badge: 'Management', icon: '✂️', description: 'Extract custom page ranges or separate all pages into individual PDF files.', fee: 0, isActive: true, isDeleted: false },
    { id: 'compress_pdf', category: 'management', title: 'Compress PDF', badge: 'Management', icon: '🗜️', description: 'Reduce PDF file size while retaining crystal-clear quality.', fee: 0, isActive: true, isDeleted: false },
    { id: 'rotate_pdf', category: 'management', title: 'Rotate PDF Pages', badge: 'Management', icon: '🔄', description: 'Rotate all or specific pages by 90°, 180°, or 270° clockwise.', fee: 0, isActive: true, isDeleted: false },
    { id: 'reorder_pdf', category: 'management', title: 'Reorder PDF Pages', badge: 'Management', icon: '🔀', description: 'Visually rearrange PDF pages in any desired sequence.', fee: 0, isActive: true, isDeleted: false },
    { id: 'delete_pages', category: 'management', title: 'Delete PDF Pages', badge: 'Management', icon: '🗑️', description: 'Select and remove unwanted pages or ranges from your PDF document.', fee: 0, isActive: true, isDeleted: false },
    { id: 'add_page_numbers', category: 'management', title: 'Add Page Numbers', badge: 'Management', icon: '🔢', description: 'Stamp professional page numbering at custom positions.', fee: 0, isActive: true, isDeleted: false },
    { id: 'protect_pdf', category: 'security', title: 'Protect PDF (Add Password)', badge: 'Security', icon: '🔒', description: 'Encrypt your confidential PDF files with AES-256 user password protection.', fee: 0, isActive: true, isDeleted: false },
    { id: 'unlock_pdf', category: 'security', title: 'Unlock PDF', badge: 'Security', icon: '🔓', description: 'Authorized PDF decryption: enter valid password to remove password restrictions.', fee: 0, isActive: true, isDeleted: false },
    { id: 'ocr_searchable_pdf', category: 'ocr', title: 'Scan Images to Searchable PDF (OCR)', badge: 'OCR / AI', icon: '🔍', description: 'Extract and embed an invisible searchable text layer over scanned documents & photos.', fee: 0, isActive: true, isDeleted: false }
  ];

  const isPdfSuiteTool = (tool) => {
    const t = (tool?.title || '').toLowerCase();
    const c = (tool?.category || '').toLowerCase();
    return t.includes('pdf tools') || t.includes('pdf suite') || t.includes('all in one pdf') || (c.includes('pdf') && t.includes('suite'));
  };

  const handleOpenPdfSubTools = (tool) => {
    setCurrentPdfTool(tool);
    const existing = tool?.subTools || {};
    const initialMap = {};
    DEFAULT_PDF_SUBTOOLS.forEach((item) => {
      const saved = existing[item.id] || {};
      initialMap[item.id] = {
        id: item.id,
        category: item.category,
        title: saved.title || item.title,
        badge: saved.badge || item.badge,
        icon: item.icon,
        description: item.description,
        fee: saved.fee !== undefined ? saved.fee : item.fee,
        isActive: saved.isActive !== undefined ? saved.isActive : true,
        isDeleted: false
      };
    });
    setPdfSubToolsState(initialMap);
    setPdfSubToolFilterCategory('all');
    setPdfSubToolSearch('');
    setPdfSubToolsModalOpen(true);
  };

  const handleTogglePdfSubTool = (toolId) => {
    setPdfSubToolsState((prev) => ({
      ...prev,
      [toolId]: {
        ...prev[toolId],
        isActive: !prev[toolId]?.isActive
      }
    }));
  };

  const handleFeeChangePdfSubTool = (toolId, feeVal) => {
    const num = feeVal === '' ? 0 : Math.max(0, parseFloat(feeVal) || 0);
    setPdfSubToolsState((prev) => ({
      ...prev,
      [toolId]: {
        ...prev[toolId],
        fee: num
      }
    }));
  };

  const handleBadgeChangePdfSubTool = (toolId, badgeVal) => {
    setPdfSubToolsState((prev) => ({
      ...prev,
      [toolId]: {
        ...prev[toolId],
        badge: badgeVal
      }
    }));
  };

  const handleTitleChangePdfSubTool = (toolId, titleVal) => {
    setPdfSubToolsState((prev) => ({
      ...prev,
      [toolId]: {
        ...prev[toolId],
        title: titleVal
      }
    }));
  };

  const handleBatchTogglePdfSubTools = (enableAll) => {
    setPdfSubToolsState((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((id) => {
        next[id] = { ...next[id], isActive: enableAll, isDeleted: false };
      });
      return next;
    });
  };

  const handleBatchFeePdfSubTools = (feeVal) => {
    setPdfSubToolsState((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((id) => {
        next[id] = { ...next[id], fee: feeVal };
      });
      return next;
    });
  };

  const handleSavePdfSubTools = async () => {
    if (!currentPdfTool?._id) return;
    setIsSavingPdfSubTools(true);
    try {
      const res = await fetch(`${API_URL}/api/tools/${currentPdfTool._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subTools: pdfSubToolsState
        })
      });
      if (res.ok) {
        const updatedTool = await res.json();
        setAdminTools((prev) => prev.map((t) => (t._id === currentPdfTool._id ? updatedTool : t)));
        setPdfSubToolsModalOpen(false);
        showCustomToast(
          'PDF Sub-Tools Updated',
          'All individual tool settings, ON/OFF states, charges and visibility saved!',
          'success',
          2500
        );
      } else {
        const errData = await res.json().catch(() => ({}));
        Swal.fire({ icon: 'error', text: errData.message || 'Failed to update sub-tools settings.' });
      }
    } catch (err) {
      console.error('Error saving PDF subtools:', err);
      Swal.fire({ icon: 'error', text: 'Error saving sub-tools settings.' });
    } finally {
      setIsSavingPdfSubTools(false);
    }
  };

  // CRM Cards Handlers
  const handleToggleCrmCard = async (card) => {
    try {
      const res = await apiFetch(`/api/crm/cards/${card._id}/toggle`, { method: 'PATCH' });
      const data = await res.json();
      if (data.success && data.card) {
        setCrmCards(prev => prev.map(c => c._id === card._id ? data.card : c));
        showCustomToast(
          'CRM Card Updated',
          `"${card.title}" visibility turned ${data.card.isActive ? 'ON' : 'OFF'}!`,
          'success',
          2500
        );
      }
    } catch (err) {
      console.error('Error toggling CRM card status:', err);
      showCustomToast('Update Failed', 'Could not update CRM card status.', 'error', 3000);
    }
  };

  const handleEditCrmCard = (card) => {
    setEditingCrmCardId(card._id);
    setCrmForm({
      cardId: card.cardId || '',
      title: card.title || '',
      subtitle: card.subtitle || '',
      icon: card.icon || '📋',
      badge: card.badge || '',
      color: card.color || '#3b82f6',
      url: card.url || '',
      isActive: card.isActive !== false
    });
  };

  const handleCancelEditCrmCard = () => {
    setEditingCrmCardId(null);
    setCrmForm({
      cardId: '',
      title: '',
      subtitle: '',
      icon: '📋',
      badge: '',
      color: '#3b82f6',
      url: '',
      isActive: true
    });
  };

  const handleSaveCrmCard = async () => {
    if (!crmForm.title.trim()) {
      Swal.fire({ icon: 'warning', title: 'Title Required', text: 'Please enter a title for the CRM card.' });
      return;
    }
    setCrmSubmitting(true);
    try {
      if (editingCrmCardId) {
        const res = await apiFetch(`/api/crm/cards/${editingCrmCardId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(crmForm)
        });
        const data = await res.json();
        if (data.success && data.card) {
          setCrmCards(prev => prev.map(c => c._id === editingCrmCardId ? data.card : c));
          showCustomToast('CRM Card Updated', 'Changes saved successfully!', 'success', 2500);
          handleCancelEditCrmCard();
        }
      } else {
        const res = await apiFetch('/api/crm/cards', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(crmForm)
        });
        const data = await res.json();
        if (data.success && data.card) {
          setCrmCards(prev => [...prev, data.card]);
          showCustomToast('CRM Card Added', 'New card created successfully!', 'success', 2500);
          handleCancelEditCrmCard();
        }
      }
    } catch (err) {
      console.error('Error saving CRM card:', err);
      showCustomToast('Save Failed', 'Could not save CRM card.', 'error', 3000);
    } finally {
      setCrmSubmitting(false);
    }
  };

  const handleDeleteCrmCard = async (card) => {
    const result = await Swal.fire({
      title: `Delete "${card.title}"?`,
      text: 'Are you sure you want to delete this CRM card?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      confirmButtonText: 'Yes, Delete',
      cancelButtonText: 'Cancel'
    });
    if (!result.isConfirmed) return;
    try {
      const res = await apiFetch(`/api/crm/cards/${card._id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setCrmCards(prev => prev.filter(c => c._id !== card._id));
        showCustomToast('Card Deleted', `"${card.title}" removed successfully.`, 'success', 2500);
        if (editingCrmCardId === card._id) handleCancelEditCrmCard();
      }
    } catch (err) {
      console.error('Error deleting CRM card:', err);
      showCustomToast('Delete Failed', 'Could not delete CRM card.', 'error', 3000);
    }
  };

  const handleStartEditTool = (tool) => {
    setEditingToolId(tool._id);
    setToolForm({
      title: tool.title || '',
      url: tool.url || '',
      apiUrl: tool.apiUrl || '',
      icon: tool.icon || '⚡',
      category: tool.category || 'Card Cutter',
      badge: tool.badge || 'AI API',
      fee: tool.fee || 0,
      description: tool.description || '',
      isActive: tool.isActive !== undefined ? tool.isActive : true
    });
  };

  const handleSaveMarquee = async () => {
    try {
      const res = await fetch(`${API_URL}/api/site-settings/dashboard_marquee`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: marqueeInput })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        Toast.fire({
          icon: 'success',
          title: 'Marquee Announcement Saved!',
          text: 'New marquee text will now display across Retailer Dashboards.'
        });
      } else {
        Toast.fire({ icon: 'error', title: data.message || 'Failed to update marquee text' });
      }
    } catch (err) {
      console.error(err);
      Toast.fire({ icon: 'error', title: 'Error saving marquee setting' });
    }
  };

  const handleAdminDeletePanApp = async (app) => {
    const confirmRes = await Swal.fire({
      title: 'Delete PAN Application?',
      text: `Are you sure you want to delete application ${app.ackNumber} (Retailer: ${app.userId})?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Yes, Delete Application',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#64748b'
    });

    if (!confirmRes.isConfirmed) return;

    try {
      const res = await fetch(`${API_URL}/api/pancard/application/${app._id}?role=admin`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (res.ok && data.success) {
        Toast.fire({ icon: 'success', title: 'PAN application deleted successfully!' });
        fetchAll();
      } else {
        Toast.fire({ icon: 'error', title: data.message || 'Failed to delete application.' });
      }
    } catch (err) {
      console.error('Delete PAN error:', err);
      Toast.fire({ icon: 'error', title: 'Error deleting application.' });
    }
  };

  const handleUpdatePanStatus = async () => {
    if (!editingPanAppStatus) return;
    try {
      const res = await fetch(`${API_URL}/api/pancard/status/${editingPanAppStatus._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: newStatusVal,
          adminRemarks: newStatusRemarks,
          receiptUrl: newReceiptFileUrl || undefined,
          nsdlReceiptNumber: newNsdlReceiptNumber
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        Toast.fire({
          icon: 'success',
          title: 'Status Updated Successfully!',
          text: data.message || (newReceiptFileUrl
            ? `Approved receipt attached & sent to Retailer (${editingPanAppStatus.userId}).`
            : `Application status changed to '${newStatusVal}'.`)
        });
        setEditingPanAppStatus(null);
        setNewStatusRemarks('');
        setNewReceiptFileUrl('');
        setNewNsdlReceiptNumber('');
        fetchAll();
      } else {
        Toast.fire({ icon: 'error', title: data.message || 'Failed to update status' });
      }
    } catch (err) {
      console.error(err);
      Toast.fire({ icon: 'error', title: 'Error updating PAN application status' });
    }
  };



  const startEditMenu = (menu) => {
    setEditingMenuId(menu._id);
    setMenuForm({
      label: menu.label || '',
      url: menu.url || '',
      isActive: menu.isActive || false,
      order: menu.order || 0
    });
  };



  const addActionCard = async () => {
    const formData = new FormData();
    formData.append('title', cardForm.title);
    formData.append('icon', cardForm.icon);
    formData.append('isAeps', cardForm.isAeps);
    formData.append('url', cardForm.url);
    if (cardForm.imgFile) formData.append('image', cardForm.imgFile);
    
    if (editingCardId) {
      await fetch(`${API_URL}/api/action-cards/${editingCardId}`, { method: 'PUT', body: formData });
      setEditingCardId(null);
    } else {
      await fetch(`${API_URL}/api/action-cards`, { method: 'POST', body: formData });
    }
    
    setCardForm({ title: '', imgFile: null, icon: '', isAeps: false, url: '' });
    fetchAll();
  };

  const startEditCard = (card) => {
    setEditingCardId(card._id);
    setCardForm({
      title: card.title,
      imgFile: null,
      icon: card.icon || '',
      isAeps: card.isAeps || false,
      url: card.url || ''
    });
  };

  const addBanner = async () => {
    const formData = new FormData();
    formData.append('fallbackIcon', bannerForm.fallbackIcon);
    formData.append('fallbackPerson', bannerForm.fallbackPerson);
    if (bannerForm.imgFile) formData.append('image', bannerForm.imgFile);
    await fetch(`${API_URL}/api/banners`, { method: 'POST', body: formData });
    setBannerForm({ imgFile: null, fallbackIcon: '', fallbackPerson: '' });
    fetchAll();
  };

  const addNewsImage = async () => {
    const files = newsImageForm.imgFiles ? Array.from(newsImageForm.imgFiles) : (newsImageForm.imgFile ? [newsImageForm.imgFile] : []);
    if (files.length === 0) return Swal.fire({ icon: 'warning', text: 'Please select an image first', confirmButtonText: 'OK' });

    for (const file of files) {
      const formData = new FormData();
      formData.append('image', file);
      await fetch(`${API_URL}/api/news-images`, { method: 'POST', body: formData });
    }

    setNewsImageForm({ imgFile: null, imgFiles: null });
    fetchAll();
    Swal.fire({ icon: 'success', text: `${files.length} News Image(s) Uploaded Successfully!`, confirmButtonText: 'OK' });
  };

  const addQuickLink = async () => {
    const currentMenuKey = dynamicLinkMenusList.some(m => m.key === activeTab) ? activeTab : 'quickLinks';
    const currentMenuObj = allLinkMenusList.find(m => m.key === currentMenuKey) || { label: 'Quick Link' };
    const isVideoMenu = currentMenuKey === 'vedioLink';

    if (!quickLinkForm.title.trim()) {
      return Swal.fire({ icon: 'warning', text: `Please enter a title for the ${currentMenuObj.label}.` });
    }

    if (isVideoMenu && quickLinkForm.videoSource === 'device') {
      if (!quickLinkForm.videoFile && !quickLinkForm.existingVideoUrl) {
        return Swal.fire({ icon: 'warning', text: 'Please choose a video file to upload from your device.' });
      }
    } else {
      if (!quickLinkForm.url.trim()) {
        return Swal.fire({ icon: 'warning', text: isVideoMenu ? 'Please enter a video URL.' : 'Please enter a URL (e.g. website link or video link).' });
      }
    }

    const formData = new FormData();
    formData.append('title', quickLinkForm.title.trim());
    formData.append(
      'url', 
      (isVideoMenu && quickLinkForm.videoSource === 'device' && !quickLinkForm.url.trim()) 
        ? (quickLinkForm.existingVideoUrl || 'device-video') 
        : quickLinkForm.url.trim()
    );
    formData.append('category', quickLinkForm.category || (isVideoMenu ? 'video' : 'link'));
    formData.append('icon', quickLinkForm.icon || (isVideoMenu ? '🎥' : '🔗'));
    formData.append('fee', quickLinkForm.fee !== undefined && quickLinkForm.fee !== '' ? Number(quickLinkForm.fee) : 0);
    formData.append('menuKey', currentMenuKey);
    formData.append('videoSource', isVideoMenu ? (quickLinkForm.videoSource || 'url') : 'url');

    if (quickLinkForm.imgFile) formData.append('image', quickLinkForm.imgFile);
    if (isVideoMenu && quickLinkForm.videoFile) formData.append('videoFile', quickLinkForm.videoFile);
    if (isVideoMenu && !quickLinkForm.videoFile && quickLinkForm.existingVideoUrl) {
      formData.append('videoFile', quickLinkForm.existingVideoUrl);
    }

    setQuickLinkSubmitting(true);
    try {
      let res;
      if (editingQuickLinkId) {
        res = await fetch(`${API_URL}/api/quick-links/${editingQuickLinkId}`, {
          method: 'PUT',
          body: formData
        });
      } else {
        res = await fetch(`${API_URL}/api/quick-links`, {
          method: 'POST',
          body: formData
        });
      }

      const responseText = await res.text();
      let data = {};
      try {
        data = JSON.parse(responseText);
      } catch (parseErr) {
        if (!res.ok) {
          throw new Error(`Server returned status ${res.status}: ${res.statusText}`);
        }
      }
      if (!res.ok) {
        throw new Error(data.message || `Server error while saving ${currentMenuObj.label}.`);
      }

      Swal.fire({
        icon: 'success',
        title: editingQuickLinkId ? `${currentMenuObj.label} Updated!` : `${currentMenuObj.label} Added!`,
        text: `"${data.title}" has been saved successfully.`,
        timer: 1800,
        showConfirmButton: false
      });

      setQuickLinkForm({ 
        title: '', 
        url: '', 
        category: isVideoMenu ? 'video' : 'link', 
        icon: isVideoMenu ? '🎥' : '🔗', 
        fee: '', 
        imgFile: null,
        videoSource: 'url',
        videoFile: null,
        existingVideoUrl: ''
      });
      setQuickLinkPreview(null);
      setQuickLinkVideoPreview(null);
      if (quickLinkFileInputRef.current) {
        quickLinkFileInputRef.current.value = '';
      }
      if (quickLinkVideoFileInputRef.current) {
        quickLinkVideoFileInputRef.current.value = '';
      }
      setEditingQuickLinkId(null);
      fetchAll(currentMenuKey);
    } catch (err) {
      console.error('Quick link save error:', err);
      Swal.fire({
        icon: 'error',
        title: 'Upload Failed',
        text: err.message || `Failed to save ${currentMenuObj.label} or upload video/photo.`
      });
    } finally {
      setQuickLinkSubmitting(false);
    }
  };

  const startEditQuickLink = (link) => {
    setEditingQuickLinkId(link._id);
    const isVideo = link.menuKey === 'vedioLink' || link.videoSource === 'device' || Boolean(link.videoFile);
    setQuickLinkForm({
      title: link.title || '',
      url: link.url || '',
      category: link.category || (isVideo ? 'video' : 'link'),
      icon: link.icon || (isVideo ? '🎥' : '🔗'),
      fee: link.fee !== undefined ? link.fee : '',
      imgFile: null,
      videoSource: (link.videoSource === 'device' || link.videoFile) ? 'device' : 'url',
      videoFile: null,
      existingVideoUrl: link.videoFile || (isVideo && link.url && link.url.includes('/uploads/videos/') ? link.url : '')
    });
    setQuickLinkPreview(link.img || null);
    setQuickLinkVideoPreview(null);
    if (quickLinkFileInputRef.current) {
      quickLinkFileInputRef.current.value = '';
    }
    if (quickLinkVideoFileInputRef.current) {
      quickLinkVideoFileInputRef.current.value = '';
    }
  };

  const updateUpiConfig = async () => {
    const formData = new FormData();
    formData.append('upiId', upiForm.upiId);
    if (upiForm.qrCodeImgFile) formData.append('qrCodeImg', upiForm.qrCodeImgFile);
    await fetch(`${API_URL}/api/upi-config`, { method: 'PUT', body: formData });
    fetchAll();
    Swal.fire({ icon: 'success', text: 'UPI Configuration Updated!', confirmButtonText: 'OK' });
  };

  const filteredAndSortedUsers = useMemo(() => {
    let result = (users || []).filter(u => {
      const q = (userSearch || '').trim().toLowerCase();
      const matchesSearch = !q ||
        (u.userId && u.userId.toLowerCase().includes(q)) ||
        (u.retailerId && u.retailerId.toLowerCase().includes(q)) ||
        (u.name && u.name.toLowerCase().includes(q)) ||
        (u.shopName && u.shopName.toLowerCase().includes(q)) ||
        (u.mobile && u.mobile.includes(q)) ||
        (u.email && u.email.toLowerCase().includes(q)) ||
        (u.businessAddress && u.businessAddress.toLowerCase().includes(q));

      const matchesStatus = userStatusFilter === 'All' || (u.status || 'Approved').toLowerCase() === userStatusFilter.toLowerCase();
      const matchesRole = userRoleFilter === 'All' || (u.role || 'customer').toLowerCase() === userRoleFilter.toLowerCase();

      return matchesSearch && matchesStatus && matchesRole;
    });

    // Sorting
    result.sort((a, b) => {
      if (userSortBy === 'newest') {
        return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
      }
      if (userSortBy === 'oldest') {
        return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
      }
      if (userSortBy === 'userId') {
        return (a.userId || '').localeCompare(b.userId || '');
      }
      if (userSortBy === 'name') {
        return (a.name || a.userId || '').localeCompare(b.name || b.userId || '');
      }
      if (userSortBy === 'balanceHigh') {
        return (parseFloat(b.walletBalance) || 0) - (parseFloat(a.walletBalance) || 0);
      }
      if (userSortBy === 'balanceLow') {
        return (parseFloat(a.walletBalance) || 0) - (parseFloat(b.walletBalance) || 0);
      }
      return 0;
    });

    return result;
  }, [users, userSearch, userStatusFilter, userRoleFilter, userSortBy]);

  const totalUserPages = Math.ceil(filteredAndSortedUsers.length / userPageSize) || 1;
  const currentUserPage = Math.min(userPage, totalUserPages);
  const userStartIndex = (currentUserPage - 1) * userPageSize;
  const paginatedUsers = filteredAndSortedUsers.slice(userStartIndex, userStartIndex + userPageSize);

  const handleOpenCreateUser = () => {
    setCreateUserForm({
      fullName: '',
      name: '',
      mobile: '',
      shopName: '',
      email: '',
      businessAddress: '',
      password: '',
      confirmPassword: '',
      role: 'retailer',
      status: 'Approved',
      walletBalance: 0
    });
    setShowCreateUserPassword(false);
    setShowCreateUserConfirmPassword(false);
    setIsUserCreateModalOpen(true);
  };

  const handleSaveCreateUser = async (e) => {
    if (e) e.preventDefault();
    const name = (createUserForm.fullName || createUserForm.name || '').trim();
    const mob = (createUserForm.mobile || '').trim();

    if (!name) {
      return Swal.fire({ icon: 'warning', text: 'Please enter Full Name (As per Aadhar Card).', confirmButtonText: 'OK' });
    }
    if (!mob || mob.length !== 10) {
      return Swal.fire({ icon: 'warning', text: 'Please enter a valid 10-digit mobile number.', confirmButtonText: 'OK' });
    }
    if (!createUserForm.shopName.trim()) {
      return Swal.fire({ icon: 'warning', text: 'Please enter Shop Name.', confirmButtonText: 'OK' });
    }
    if (!createUserForm.businessAddress.trim()) {
      return Swal.fire({ icon: 'warning', text: 'Please enter Business Address.', confirmButtonText: 'OK' });
    }
    if (!createUserForm.password || createUserForm.password.length < 6) {
      return Swal.fire({ icon: 'warning', text: 'Password must be at least 6 characters.', confirmButtonText: 'OK' });
    }
    if (createUserForm.confirmPassword && createUserForm.password !== createUserForm.confirmPassword) {
      return Swal.fire({ icon: 'warning', text: 'Passwords do not match!', confirmButtonText: 'OK' });
    }

    try {
      const payload = {
        name: name,
        fullName: name,
        mobile: mob,
        shopName: createUserForm.shopName.trim(),
        email: (createUserForm.email || '').trim(),
        businessAddress: createUserForm.businessAddress.trim(),
        password: createUserForm.password,
        role: createUserForm.role || 'retailer',
        status: createUserForm.status || 'Approved',
        walletBalance: parseFloat(createUserForm.walletBalance) || 0
      };

      const response = await fetch(`${API_URL}/api/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (response.ok) {
        Swal.fire({
          icon: 'success',
          title: 'User Account Created!',
          text: `Retailer ${data.userId || data.retailerId || 'Account'} has been created successfully with ${payload.status} status.`,
          confirmButtonText: 'OK',
          confirmButtonColor: '#10b981'
        });
        setIsUserCreateModalOpen(false);
        fetchAll();
      } else {
        Swal.fire({ icon: 'error', text: data.message || 'Failed to create user', confirmButtonText: 'OK' });
      }
    } catch (err) {
      console.error('Error creating user:', err);
      Swal.fire({ icon: 'error', text: 'Error connecting to server', confirmButtonText: 'OK' });
    }
  };

  const handleOpenEditUser = (u) => {
    setSelectedUserForModal(u);
    setEditUserForm({
      _id: u._id,
      userId: u.userId || '',
      retailerId: u.retailerId || '',
      name: u.name || '',
      shopName: u.shopName || '',
      businessAddress: u.businessAddress || '',
      email: u.email || '',
      mobile: u.mobile || '',
      password: '',
      role: u.role || 'retailer',
      status: u.status || 'Approved',
      walletBalance: u.walletBalance !== undefined ? u.walletBalance : 0
    });
    setIsUserEditModalOpen(true);
  };

  const handleSaveEditUser = async (e) => {
    if (e) e.preventDefault();
    if (!editUserForm._id) return;
    if (editUserForm.mobile && editUserForm.mobile.trim().length !== 10) {
      return Swal.fire({ icon: 'warning', text: 'Mobile number must be exactly 10 digits', confirmButtonText: 'OK' });
    }

    const payload = { ...editUserForm };
    if (userRole !== 'admin') {
      delete payload.password;
    }

    try {
      const response = await fetch(`${API_URL}/api/users/${editUserForm._id}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'x-user-role': userRole
        },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (response.ok) {
        Toast.fire({ icon: 'success', title: 'User Profile Updated Successfully!' });
        setIsUserEditModalOpen(false);
        fetchAll();
      } else {
        Toast.fire({ icon: 'error', title: data.message || 'Failed to update user' });
      }
    } catch (err) {
      console.error('Error updating user:', err);
      Toast.fire({ icon: 'error', title: 'Error connecting to server' });
    }
  };

  const handleOpenViewUser = (u) => {
    setSelectedUserForModal(u);
    setIsUserViewModalOpen(true);
  };

  const getAllUserPermissionsList = () => {
    const all = [];
    AVAILABLE_USER_MODULES.forEach(mod => {
      all.push(mod.id);
      if (mod.subPermissions) {
        mod.subPermissions.forEach(s => all.push(s.id));
      }
    });
    return all;
  };

  const handleOpenUserPermissions = (user) => {
    setSelectedUserForPerms(user);
    setCollapsedUserModules({});
    if (Array.isArray(user.permissions) && user.permissions.includes('none')) {
      setUserPermsFormData({ permissions: [] });
    } else if (Array.isArray(user.permissions) && user.permissions.length > 0) {
      const normalized = normalizePermissions(user.permissions);
      const expanded = new Set(normalized);
      AVAILABLE_USER_MODULES.forEach(mod => {
        const subIds = (mod.subPermissions || []).map(s => s.id);
        const hasAnySub = subIds.some(s => normalized.includes(s));
        if ((normalized.includes(mod.id) || (normalized.includes('crm') && mod.id.startsWith('crm'))) && !hasAnySub) {
          subIds.forEach(s => expanded.add(s));
          expanded.add(mod.id);
        }
      });
      setUserPermsFormData({ permissions: Array.from(expanded) });
    } else {
      setUserPermsFormData({ permissions: getAllUserPermissionsList() });
    }
    setIsUserPermsModalOpen(true);
  };

  const handleToggleUserModuleAll = (mod, isChecked) => {
    setUserPermsFormData(prev => {
      const current = prev.permissions || [];
      const subIds = mod.subPermissions ? mod.subPermissions.map(s => s.id) : [];
      const allModIds = [mod.id, ...subIds];

      if (isChecked) {
        const set = new Set([...current, ...allModIds]);
        if (mod.id.startsWith('crm')) {
          set.add('crm.access');
          set.add('crm');
        }
        return { ...prev, permissions: Array.from(set) };
      } else {
        const removeSet = new Set(allModIds);
        let updated = current.filter(id => !removeSet.has(id));
        const otherCrmActive = updated.some(id => 
          (id.startsWith('crm') && id !== 'crm' && id !== 'crm.access' && id !== 'crm.dashboard') ||
          (id.startsWith('crm.') && id !== 'crm.access' && id !== 'crm.dashboard')
        );
        if (!otherCrmActive && (mod.id === 'crm' || mod.id.startsWith('crm'))) {
          updated = updated.filter(id => id !== 'crm' && id !== 'crm.access' && id !== 'crm.dashboard');
        }
        return { ...prev, permissions: updated };
      }
    });
  };

  const handleToggleUserSubPermission = (mod, subId) => {
    setUserPermsFormData(prev => {
      const current = prev.permissions || [];
      const isCurrentlyChecked = current.includes(subId);
      const subIds = (mod.subPermissions || []).map(s => s.id);
      let updated;

      if (isCurrentlyChecked) {
        // Unchecking this sub-permission: remove subId and remove mod.id since not all are selected
        updated = current.filter(id => id !== subId && id !== mod.id);
        const otherCrmActive = updated.some(id => 
          (id.startsWith('crm') && id !== 'crm' && id !== 'crm.access' && id !== 'crm.dashboard') ||
          (id.startsWith('crm.') && id !== 'crm.access' && id !== 'crm.dashboard')
        );
        if (!otherCrmActive && (mod.id === 'crm' || subId === 'crm.access')) {
          updated = updated.filter(id => id !== 'crm' && id !== 'crm.access' && id !== 'crm.dashboard');
        }
      } else {
        // Checking this sub-permission:
        const nextList = [...current.filter(id => id !== mod.id), subId];
        // Only include parent mod.id if ALL sub-permissions of this module are selected
        const allChecked = subIds.length > 0 && subIds.every(id => nextList.includes(id));
        if (allChecked) {
          nextList.push(mod.id);
        }
        if (mod.id.startsWith('crm') || subId.startsWith('crm.')) {
          nextList.push('crm.access');
          nextList.push('crm');
        }
        updated = Array.from(new Set(nextList));
      }

      return { ...prev, permissions: updated };
    });
  };

  const handleToggleAllUserPermissions = (select) => {
    if (select) {
      setUserPermsFormData({ permissions: getAllUserPermissionsList() });
    } else {
      setUserPermsFormData({ permissions: [] });
    }
  };

  const handleToggleCollapseAllUserModules = () => {
    setCollapsedUserModules(prev => {
      const anyOpen = AVAILABLE_USER_MODULES.some(m => !prev[m.id]);
      const next = {};
      AVAILABLE_USER_MODULES.forEach(m => {
        next[m.id] = anyOpen;
      });
      return next;
    });
  };

  const handleToggleUserModuleCollapse = (modId) => {
    setCollapsedUserModules(prev => ({
      ...prev,
      [modId]: !prev[modId]
    }));
  };

  const handleSaveUserPermissions = async (e) => {
    if (e) e.preventDefault();
    if (!selectedUserForPerms) return;
    const targetId = selectedUserForPerms._id || selectedUserForPerms.userId || selectedUserForPerms.retailerId || selectedUserForPerms.id;
    if (!targetId) return;

    setUserPermsSaving(true);
    try {
      const permsToSave = Array.from(new Set(userPermsFormData.permissions || []));
      const finalPermsToSave = permsToSave.length === 0 ? ['none'] : permsToSave;
      let res = await apiFetch(`/api/users/${targetId}/permissions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions: finalPermsToSave })
      });

      // Fallback to /api/users/:id if /permissions is 404
      if (!res.ok && res.status === 404) {
        res = await apiFetch(`/api/users/${targetId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ permissions: finalPermsToSave })
        });
      }

      let data = null;
      try {
        data = await res.json();
      } catch (jsonErr) {
        data = null;
      }

      if (res.ok && (data?.success || res.status === 200)) {
        Toast.fire({
          icon: 'success',
          title: `Service Access Updated for ${selectedUserForPerms.name || selectedUserForPerms.userId || 'User'}!`,
          timer: 5000
        });
        setUsers(prev => prev.map(u => 
          (u._id === targetId || u.userId === targetId || u._id === selectedUserForPerms._id || u.userId === selectedUserForPerms.userId) 
            ? { ...u, permissions: finalPermsToSave } 
            : u
        ));
        setIsUserPermsModalOpen(false);
      } else {
        Toast.fire({
          icon: 'error',
          title: data?.message || `Failed to update service permissions (Status ${res.status})`,
          timer: 5000
        });
      }
    } catch (err) {
      console.error('Save user permissions error:', err);
      Toast.fire({
        icon: 'error',
        title: err?.message || 'Server error saving permissions',
        timer: 5000
      });
    } finally {
      setUserPermsSaving(false);
    }
  };

  const handleExportUsersCSV = () => {
    if (filteredAndSortedUsers.length === 0) {
      return Toast.fire({ icon: 'warning', title: 'No users to export' });
    }
    const headers = ['S.No', 'User ID', 'Full Name', 'Shop / Business', 'Mobile Number', 'Email Address', 'Role', 'Status', 'Wallet Balance (Rs)', 'Registered Date'];
    const rows = filteredAndSortedUsers.map((u, i) => [
      i + 1,
      `"${(u.userId || '').replace(/"/g, '""')}"`,
      `"${(u.name || '').replace(/"/g, '""')}"`,
      `"${(u.shopName || '').replace(/"/g, '""')}"`,
      `"${(u.mobile || '').replace(/"/g, '""')}"`,
      `"${(u.email || '').replace(/"/g, '""')}"`,
      `"${(u.role || 'customer').toUpperCase()}"`,
      `"${(u.status || 'Approved').toUpperCase()}"`,
      parseFloat(u.walletBalance || 0).toFixed(2),
      u.createdAt ? `"${new Date(u.createdAt).toLocaleString()}"` : '""'
    ]);
    const csv = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csv));
    link.setAttribute('download', `Users_Directory_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrintUsersList = () => {
    const w = window.open('', '_blank');
    w.document.write(`
      <html><head><title>Users Directory</title>
      <style>
        body{font-family:Arial,sans-serif;padding:24px;color:#1e293b}
        h2{color:#1e40af;margin-bottom:4px}
        .meta{font-size:13px;color:#64748b;margin-bottom:18px}
        table{width:100%;border-collapse:collapse;margin-top:10px}
        th,td{border:1px solid #cbd5e1;padding:8px 10px;text-align:left;font-size:11.5px}
        th{background:#f1f5f9;font-weight:700}
        .approved{color:#15803d;font-weight:bold}
        .pending{color:#b45309;font-weight:bold}
        .rejected{color:#dc2626;font-weight:bold}
      </style></head><body>
      <h2>👥 MB Mitra - Users & Retailers Directory</h2>
      <div class="meta">Generated: ${new Date().toLocaleString()} | Total Users in Report: <strong>${filteredAndSortedUsers.length}</strong></div>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>User ID</th>
            <th>Name / Shop</th>
            <th>Mobile</th>
            <th>Email</th>
            <th>Role</th>
            <th>Wallet (₹)</th>
            <th>Status</th>
            <th>Registered</th>
          </tr>
        </thead>
        <tbody>
          ${filteredAndSortedUsers.map((u, i) => `<tr>
            <td>${i + 1}</td>
            <td><strong>${u.userId || '-'}</strong></td>
            <td>${u.name || u.shopName || '-'}</td>
            <td>${u.mobile || '-'}</td>
            <td>${u.email || '-'}</td>
            <td>${(u.role || 'customer').toUpperCase()}</td>
            <td>₹${parseFloat(u.walletBalance || 0).toFixed(2)}</td>
            <td class="${(u.status || 'Approved').toLowerCase()}">${(u.status || 'Approved').toUpperCase()}</td>
            <td>${u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '-'}</td>
          </tr>`).join('')}
        </tbody>
      </table>
      </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 400);
  };

  const addUser = async () => {
    if (!userForm.userId) return Swal.fire({ icon: 'warning', text: 'User ID is required', confirmButtonText: 'OK' });
    const response = await fetch(`${API_URL}/api/users`, {
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userForm) 
    });
    
    if(response.ok) {
      Toast.fire({ icon: 'success', title: 'User Created Successfully!' });
      setUserForm({ userId: '', email: '', mobile: '', role: 'customer' });
      fetchAll();
    } else {
      const data = await response.json();
      Toast.fire({ icon: 'error', title: data.message });
    }
  };

  const updateUserStatus = async (userId, newStatus) => {
    if (newStatus === 'Rejected') {
      const confirmRes = await Swal.fire({
        title: 'Reject User Registration?',
        text: 'Are you sure you want to reject this user registration account request?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Yes, Reject User',
        cancelButtonText: 'Cancel',
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#64748b'
      });
      if (!confirmRes.isConfirmed) return;
    }

    try {
      const response = await fetch(`${API_URL}/api/users/${userId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      const data = await response.json();
      if (response.ok) {
        Swal.fire({
          icon: 'success',
          title: `User ${newStatus}!`,
          text: data.message || `Account status updated to ${newStatus}.`,
          timer: 1800,
          showConfirmButton: false
        });
        fetchAll();
      } else {
        Swal.fire({ icon: 'error', text: data.message || 'Failed to update user status.' });
      }
    } catch (err) {
      console.error('Error updating user status:', err);
      Swal.fire({ icon: 'error', text: 'Error connecting to server.' });
    }
  };

  const updateRequisition = async (id, status, reqAmount) => {
    let finalStatus = status;
    let approvedAmount = 0;

    if (status === 'Approved') {
      if (userRole === 'staff') {
        // Staff members can ONLY fully approve (partially approval is restricted to admin)
        const result = await Swal.fire({
          title: 'Fully Approve Payment?',
          text: `Are you sure you want to approve the full requested amount of ₹${reqAmount}?`,
          icon: 'question',
          showCancelButton: true,
          confirmButtonText: 'Yes, Approve Full Amount',
          confirmButtonColor: '#22c55e',
          cancelButtonColor: '#6b7280',
          customClass: {
            popup: 'small-prompt-modal'
          }
        });
        if (!result.isConfirmed) return; // cancelled
        approvedAmount = Number(reqAmount);
        finalStatus = 'Approved';
      } else {
        // Admin has full options: can edit amount to partially approve or fully approve
        const maxAllowed = Number(reqAmount);
        const { value: amountStr } = await Swal.fire({
          title: 'Approve Payment',
          text: `Enter approved amount (Requested: ₹${maxAllowed})`,
          input: 'number',
          inputValue: maxAllowed,
          inputAttributes: {
            min: '1',
            max: String(maxAllowed),
            step: '1'
          },
          showCancelButton: true,
          confirmButtonText: 'Approve',
          customClass: {
            popup: 'small-prompt-modal'
          },
          inputValidator: (value) => {
            if (!value) return 'Please enter an approval amount!';
            const valNum = Number(value);
            if (isNaN(valNum) || valNum <= 0) {
              return 'Please enter a valid positive amount!';
            }
            if (valNum > maxAllowed) {
              return `Approval amount cannot exceed requested amount of ₹${maxAllowed}!`;
            }
          }
        });
        if (!amountStr) return; // cancelled
        
        approvedAmount = Number(amountStr);
        if (approvedAmount > maxAllowed) {
          return Swal.fire({
            icon: 'error',
            text: `Approval amount (₹${approvedAmount}) cannot exceed requested amount of ₹${maxAllowed}!`
          });
        }
        if (approvedAmount < maxAllowed && approvedAmount > 0) {
          finalStatus = 'Partially Approved';
        } else {
          finalStatus = 'Approved';
        }
      }
    } else if (status === 'Rejected') {
      const result = await Swal.fire({
        title: 'Reject Payment Requisition?',
        text: 'Are you sure you want to reject this requisition?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Yes, Reject',
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#6b7280',
        customClass: {
          popup: 'small-prompt-modal'
        }
      });
      if (!result.isConfirmed) return;
      finalStatus = 'Rejected';
      approvedAmount = 0;
    }
    
    try {
      const res = await fetch(`${API_URL}/api/payment-requisitions/${id}`, {
        method: 'PUT', 
        headers: { 
          'Content-Type': 'application/json',
          'x-user-role': userRole
        },
        body: JSON.stringify({ status: finalStatus, approvedAmount }) 
      });
      const data = await res.json();
      if (!res.ok) {
        Swal.fire({ icon: 'error', text: data.message || 'Failed to update requisition.' });
      } else {
        Swal.fire({
          icon: 'success',
          title: `Requisition ${finalStatus}!`,
          text: `Approved Amount: ₹${approvedAmount}`,
          timer: 1500,
          showConfirmButton: false
        });
      }
    } catch (err) {
      console.error('Error updating payment requisition:', err);
      Swal.fire({ icon: 'error', text: 'Error connecting to server.' });
    }
    fetchAll();
  };

  const handleEditRequisition = async (req) => {
    const maxAllowed = Number(req.amount);
    const currentAppAmount = req.approvedAmount !== undefined ? req.approvedAmount : (req.status === 'Approved' ? maxAllowed : 0);

    const result = await Swal.fire({
      title: '✏️ Edit Payment Requisition',
      html: `
        <div style="text-align: left; font-size: 13px; color: #475569; margin-bottom: 14px; background: #f8fafc; padding: 12px; border-radius: 8px; border: 1px solid #e2e8f0;">
          <div style="margin-bottom: 4px;"><b>User ID:</b> ${req.userId}</div>
          <div style="margin-bottom: 4px;"><b>Reference No:</b> ${req.referenceNumber}</div>
          <div style="margin-bottom: 4px;"><b>Requested Amount:</b> <span style="color: #2563eb; font-weight: 700;">₹${maxAllowed}</span></div>
          <div><b>Current Approved:</b> <span style="color: #059669; font-weight: 700;">₹${currentAppAmount}</span></div>
        </div>
        <div style="display: flex; flex-direction: column; gap: 12px; text-align: left;">
          <div>
            <label style="font-size: 12px; font-weight: 700; color: #334155; display: block; margin-bottom: 4px;">Status</label>
            <select id="swal-edit-status" class="swal2-select" style="width: 100%; margin: 0; padding: 8px 10px; border-radius: 6px; border: 1px solid #cbd5e1; font-size: 14px;">
              <option value="Approved" ${req.status === 'Approved' ? 'selected' : ''}>Approved (Full)</option>
              <option value="Partially Approved" ${req.status === 'Partially Approved' ? 'selected' : ''}>Partially Approved</option>
              <option value="Rejected" ${req.status === 'Rejected' ? 'selected' : ''}>Rejected</option>
              <option value="Pending" ${req.status === 'Pending' ? 'selected' : ''}>Pending</option>
            </select>
          </div>
          <div>
            <label style="font-size: 12px; font-weight: 700; color: #334155; display: block; margin-bottom: 4px;">
              Approved Amount (Max: ₹${maxAllowed})
            </label>
            <input id="swal-edit-amount" type="number" min="0" max="${maxAllowed}" value="${currentAppAmount}" class="swal2-input" style="width: 100%; margin: 0; padding: 8px 10px; border-radius: 6px; border: 1px solid #cbd5e1; font-size: 14px; box-sizing: border-box;" />
          </div>
          <div>
            <label style="font-size: 12px; font-weight: 700; color: #334155; display: block; margin-bottom: 4px;">Remarks (Optional)</label>
            <input id="swal-edit-remarks" type="text" placeholder="Add remarks..." value="${req.remarks && req.remarks !== '-' ? req.remarks : ''}" class="swal2-input" style="width: 100%; margin: 0; padding: 8px 10px; border-radius: 6px; border: 1px solid #cbd5e1; font-size: 14px; box-sizing: border-box;" />
          </div>
        </div>
      `,
      focusConfirm: false,
      showCancelButton: true,
      showDenyButton: true,
      confirmButtonText: 'Save Changes',
      confirmButtonColor: '#2563eb',
      denyButtonText: '✕ Reject',
      denyButtonColor: '#ef4444',
      cancelButtonText: 'Cancel',
      cancelButtonColor: '#64748b',
      didOpen: () => {
        const statusSelect = document.getElementById('swal-edit-status');
        const amountInput = document.getElementById('swal-edit-amount');
        if (statusSelect && amountInput) {
          statusSelect.addEventListener('change', (e) => {
            if (e.target.value === 'Rejected' || e.target.value === 'Pending') {
              amountInput.value = '0';
              amountInput.disabled = true;
            } else {
              amountInput.disabled = false;
              if (Number(amountInput.value) === 0) {
                amountInput.value = String(maxAllowed);
              }
            }
          });
          amountInput.addEventListener('input', (e) => {
            const val = Number(e.target.value);
            if (val === 0 && e.target.value !== '') {
              statusSelect.value = 'Rejected';
            } else if (val > 0 && val < maxAllowed) {
              statusSelect.value = 'Partially Approved';
            } else if (val >= maxAllowed) {
              statusSelect.value = 'Approved';
            }
          });
          if (statusSelect.value === 'Rejected' || statusSelect.value === 'Pending') {
            amountInput.disabled = true;
          }
        }
      },
      preConfirm: () => {
        const selectedStatus = document.getElementById('swal-edit-status').value;
        const enteredAmountStr = document.getElementById('swal-edit-amount').value;
        const enteredRemarks = document.getElementById('swal-edit-remarks').value;

        const valNum = Number(enteredAmountStr);

        if (enteredAmountStr === '' || isNaN(valNum) || valNum < 0) {
          Swal.showValidationMessage('Please enter a valid amount (₹0 or more)!');
          return false;
        }

        if (valNum > maxAllowed) {
          Swal.showValidationMessage(`Approved amount cannot exceed requested amount of ₹${maxAllowed}!`);
          return false;
        }

        let finalStatus = selectedStatus;
        let finalAmount = valNum;

        if (valNum === 0 || selectedStatus === 'Rejected') {
          finalStatus = 'Rejected';
          finalAmount = 0;
        } else if (selectedStatus === 'Pending') {
          finalAmount = 0;
        } else {
          if (finalAmount < maxAllowed) {
            finalStatus = 'Partially Approved';
          } else {
            finalStatus = 'Approved';
          }
        }

        return {
          status: finalStatus,
          approvedAmount: finalAmount,
          remarks: enteredRemarks
        };
      },
      preDeny: () => {
        const enteredRemarks = document.getElementById('swal-edit-remarks')?.value;
        return {
          status: 'Rejected',
          approvedAmount: 0,
          remarks: enteredRemarks || req.remarks || 'Rejected by Admin'
        };
      }
    });

    let formValues = null;
    if (result.isConfirmed) {
      formValues = result.value;
    } else if (result.isDenied) {
      formValues = result.value || {
        status: 'Rejected',
        approvedAmount: 0,
        remarks: req.remarks || 'Rejected by Admin'
      };
    }

    if (!formValues) return; // Cancelled

    try {
      const res = await fetch(`${API_URL}/api/payment-requisitions/${req._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': userRole
        },
        body: JSON.stringify(formValues)
      });
      const data = await res.json();
      if (!res.ok) {
        Swal.fire({ icon: 'error', text: data.message || 'Failed to update requisition.' });
      } else {
        Swal.fire({
          icon: 'success',
          title: formValues.status === 'Rejected' ? 'Requisition Rejected!' : 'Requisition Updated!',
          text: `Status: ${formValues.status} | Approved Amount: ₹${formValues.approvedAmount}`,
          timer: 1600,
          showConfirmButton: false
        });
      }
    } catch (err) {
      console.error('Error updating requisition:', err);
      Swal.fire({ icon: 'error', text: 'Error connecting to server.' });
    }
    fetchAll();
  };

  const addItem = async (url, data, setForm, initialForm, editingId, setEditingId) => {
    if (editingId) {
      await fetch(`${url}/${editingId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      if (setEditingId) setEditingId(null);
    } else {
      await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    }
    setForm(initialForm);
    fetchAll();
  };

  const toggleSidebarMenuStatus = async (menuItem, explicitKey) => {
    if (!menuItem) return;

    const resolvedKey = explicitKey || menuItem.key || null;

    // Resolve the actual database item from sidebarMenus
    let targetSm = null;
    if (menuItem._id) {
      targetSm = (sidebarMenus || []).find(sm => String(sm._id) === String(menuItem._id));
    }
    if (!targetSm && (menuItem.route || menuItem.url)) {
      const u = (menuItem.route || menuItem.url).toLowerCase().trim();
      targetSm = (sidebarMenus || []).find(sm => sm.url && sm.url.toLowerCase().trim() === u);
    }
    if (!targetSm && (menuItem.label || menuItem.title)) {
      const targetLabel = (menuItem.label || menuItem.title || '').toLowerCase().trim();
      targetSm = (sidebarMenus || []).find(sm => (sm.label || '').toLowerCase().trim() === targetLabel);
    }
    if (!targetSm && resolvedKey) {
      targetSm = (sidebarMenus || []).find(sm => {
        const d = getDynamicMenuForSidebarItem(sm, dynamicLinkMenusList);
        return d && d.key === resolvedKey;
      });
    }

    const currentActive = (targetSm && targetSm.isActive !== undefined)
      ? Boolean(targetSm.isActive)
      : (menuItem.isActive !== undefined ? Boolean(menuItem.isActive) : true);
    const newStatus = !currentActive;
    const targetId = targetSm ? targetSm._id : menuItem._id;

    // Immediately update local React state so UI flips ON/OFF with 0ms delay
    setSidebarMenus(prev => {
      const list = prev || [];
      return list.map(sm => {
        if (targetId && String(sm._id) === String(targetId)) {
          return { ...sm, isActive: newStatus };
        }
        if (resolvedKey) {
          const d = getDynamicMenuForSidebarItem(sm, dynamicLinkMenusList);
          if (d && d.key === resolvedKey) {
            return { ...sm, isActive: newStatus };
          }
        }
        if (menuItem.label && sm.label && sm.label.toLowerCase().trim() === menuItem.label.toLowerCase().trim()) {
          return { ...sm, isActive: newStatus };
        }
        return sm;
      });
    });

    try {
      if (targetId) {
        await apiFetch(`/api/sidebar-menus/${targetId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isActive: newStatus })
        });
      } else {
        const dyn = DYNAMIC_LINK_MENUS.find(d => d.key === (resolvedKey || menuItem.key));
        const postRes = await apiFetch('/api/sidebar-menus', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            label: menuItem.label || (dyn ? dyn.label : 'Menu'),
            url: menuItem.route || (dyn ? dyn.route : ''),
            isActive: newStatus,
            order: (sidebarMenus || []).length
          })
        });
        if (postRes.ok) {
          const created = await postRes.json();
          setSidebarMenus(prev => [...(prev || []), created]);
        }
      }
      fetchAll();
      showCustomToast(
        `${menuItem.label || 'Menu'} is now ${newStatus ? 'ON (Visible)' : 'OFF (Hidden)'}`,
        newStatus ? 'This menu is now visible in the user panel.' : 'This menu is now hidden from the user panel.',
        newStatus ? 'success' : 'warning',
        2500
      );
    } catch (err) {
      console.error('Failed to toggle sidebar menu status:', err);
      fetchAll();
      Swal.fire({ icon: 'error', text: 'Failed to update menu status.' });
    }
  };

  const handleOpenAddDynamicMenu = () => {
    setEditingDynamicMenu(null);
    setDynamicMenuForm({
      label: '',
      icon: '🌐',
      route: ''
    });
    setShowDynamicMenuModal(true);
  };

  const handleOpenEditDynamicMenu = (menuItem) => {
    setEditingDynamicMenu(menuItem);
    setDynamicMenuForm({
      label: menuItem.label || '',
      icon: menuItem.icon || '🌐',
      route: menuItem.route || ''
    });
    setShowDynamicMenuModal(true);
  };

  const handleSaveDynamicMenu = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!dynamicMenuForm.label.trim()) {
      return Swal.fire({ icon: 'warning', text: 'Please enter a title for the Dynamic Menu.' });
    }

    const cleanLabel = dynamicMenuForm.label.trim();
    const cleanIcon = dynamicMenuForm.icon.trim() || '🌐';
    setIsSavingDynamicMenu(true);

    try {
      if (editingDynamicMenu) {
        // Editing existing dynamic menu (standard or custom)
        const targetKey = editingDynamicMenu.key;
        setCustomMenuIcon(targetKey, cleanIcon);

        if (editingDynamicMenu._id) {
          await fetch(`${API_URL}/api/sidebar-menus/${editingDynamicMenu._id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              label: cleanLabel
            })
          });
        } else {
          // Standard menu record not yet created in sidebar-menus DB
          await fetch(`${API_URL}/api/sidebar-menus`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              label: cleanLabel,
              url: editingDynamicMenu.route,
              isActive: editingDynamicMenu.isActive !== undefined ? editingDynamicMenu.isActive : true,
              order: sidebarMenus.length
            })
          });
        }

        setShowDynamicMenuModal(false);
        fetchAll(targetKey);
        Swal.fire({
          icon: 'success',
          title: 'Dynamic Menu Updated',
          text: `"${cleanLabel}" has been updated successfully.`,
          timer: 1600,
          showConfirmButton: false
        });
      } else {
        // Creating new custom dynamic menu
        const slug = cleanLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'menu';
        const formattedRoute = `/${slug}`;
        const newKey = slug.replace(/[^a-zA-Z0-9]/g, '');

        setCustomMenuIcon(newKey, cleanIcon);

        const res = await fetch(`${API_URL}/api/sidebar-menus`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            label: cleanLabel,
            url: formattedRoute,
            isActive: true,
            order: sidebarMenus.length
          })
        });

        if (!res.ok) {
          throw new Error('Failed to create new dynamic menu on server');
        }

        setShowDynamicMenuModal(false);
        fetchAll(newKey);
        setActiveTab(newKey);
        sessionStorage.setItem('adminPanelActiveTab', newKey);
        Swal.fire({
          icon: 'success',
          title: 'Dynamic Menu Added!',
          text: `"${cleanLabel}" is now created and active. You can now add service links to it!`,
          timer: 2000,
          showConfirmButton: false
        });
      }
    } catch (err) {
      console.error('Error saving dynamic menu:', err);
      Swal.fire({ icon: 'error', title: 'Error', text: err.message || 'Failed to save dynamic menu.' });
    } finally {
      setIsSavingDynamicMenu(false);
    }
  };

  const handleDeleteCustomDynamicMenu = async (menuItem) => {
    if (!menuItem || !menuItem._id) return;
    const confirmRes = await Swal.fire({
      title: `Delete "${menuItem.label}"?`,
      text: 'Are you sure you want to delete this custom dynamic menu? All associated links may also be deleted.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Yes, Delete',
      confirmButtonColor: '#ef4444',
      cancelButtonText: 'Cancel'
    });

    if (!confirmRes.isConfirmed) return;

    try {
      await fetch(`${API_URL}/api/sidebar-menus/${menuItem._id}`, {
        method: 'DELETE'
      });
      setShowDynamicMenuModal(false);
      setActiveTab('quickLinks');
      sessionStorage.setItem('adminPanelActiveTab', 'quickLinks');
      fetchAll('quickLinks');
      Swal.fire({
        icon: 'success',
        title: 'Deleted',
        text: `Menu "${menuItem.label}" was deleted.`,
        timer: 1500,
        showConfirmButton: false
      });
    } catch (err) {
      console.error('Failed to delete custom dynamic menu:', err);
      Swal.fire({ icon: 'error', text: 'Failed to delete dynamic menu.' });
    }
  };

  const startEditTab = (tab) => {
    setEditingTabId(tab._id);
    setTabForm({
      label: tab.label,
      order: tab.order,
      url: tab.url || ''
    });
  };

  const deleteItem = async (url, id) => {
    const confirmRes = await Swal.fire({
      title: 'Are you sure?',
      text: 'Do you really want to remove this item? This action cannot be undone.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Yes, Remove It',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#64748b'
    });

    if (!confirmRes.isConfirmed) return;

    try {
      await fetch(`${url}/${id}`, { method: 'DELETE' });
      Toast.fire({ icon: 'success', title: 'Item removed successfully!' });
      fetchAll();
    } catch (err) {
      console.error(err);
      Toast.fire({ icon: 'error', title: 'Failed to remove item.' });
    }
  };

  const allMenuItems = [
    { id: 'actionCards', label: 'Action Cards', icon: '💳' },
    { id: 'topTabs', label: 'Top Tabs', icon: '📑' },
    { id: 'sidebarMenus', label: 'Sidebar Menus', icon: '☰' },
    { id: 'crmCards', label: 'CRM Management', icon: '👥' },
    { id: 'banners', label: 'Banners', icon: '🖼️' },
    { id: 'newsImages', label: 'Login News Images', icon: '📰' },
    { id: 'quickLinks', label: 'Quick Links', icon: '🔗' },
    { id: 'quickLinkServiceLogs', label: 'Quick Links Service Logs', icon: '📜', adminOnly: true },
    { id: 'panSubmissions', label: 'Retailer PAN Submissions', icon: '📇' },
    { id: 'panServiceLogs', label: 'PAN Service Logs', icon: '📜', adminOnly: true },
    { id: 'panForms', label: 'PAN Form Manager', icon: '📝' },
    { id: 'offlineSubmissions', label: 'Retailer Offline Submissions', icon: '📁' },
    { id: 'offlineServiceLogs', label: 'Offline Work Service Logs', icon: '📜', adminOnly: true },
    { id: 'offlineForms', label: 'Offline Form Manager', icon: '📑' },
    { id: 'walletRequests', label: 'Wallet Requests', icon: '💼' },
    { id: 'payInHistory', label: 'Pay-In History', icon: '📥' },
    { id: 'payOutHistory', label: 'Pay-Out History', icon: '📤' },
    { id: 'ledgerHistory', label: 'Ledger History', icon: '📒' },
    { id: 'payInPayOutHistory', label: 'Pay-In / Pay-Out History', icon: '⇄' },
    { id: 'feesNewApplication', label: 'Fees – PAN New Application', icon: '💰' },
    { id: 'feesCorrection', label: 'Fees – PAN Correction', icon: '💰' },
    { id: 'users', label: 'User Management', icon: '👥' },
    { id: 'customerManagement', label: 'Customer Management', icon: '📇', adminOnly: true },
    { id: 'staffMembers', label: 'Staff Management', icon: '👔', adminOnly: true },
  ];

  const hasStaffModuleAccess = (modId) => {
    if (userRole === 'admin') return true;
    if (DYNAMIC_LINK_MENUS.some(d => d.key === modId)) {
      if (staffPermissions && (staffPermissions.includes(modId) || staffPermissions.includes('quickLinks') || staffPermissions.some(p => p.startsWith('quickLinks.')))) {
        return true;
      }
    }
    if (!staffPermissions || !Array.isArray(staffPermissions) || staffPermissions.length === 0) return false;
    return staffPermissions.includes(modId) || staffPermissions.some(p => p === modId || p.startsWith(modId + '.'));
  };

  const hasStaffActionAccess = (actionKey) => {
    if (userRole === 'admin') return true;
    if (!staffPermissions || !Array.isArray(staffPermissions) || staffPermissions.length === 0) return false;
    if (staffPermissions.includes(actionKey)) return true;
    if (actionKey.includes('.')) {
      const parent = actionKey.split('.')[0];
      const hasAnySubForParent = staffPermissions.some(p => p.startsWith(parent + '.'));
      if (hasAnySubForParent) {
        return false;
      }
      return staffPermissions.includes(parent);
    }
    return staffPermissions.includes(actionKey);
  };

  const menuItems = allMenuItems.filter(item => {
    if (userRole === 'admin') return true;
    if (item.adminOnly) return false;
    return hasStaffModuleAccess(item.id);
  });

  const uiSubmenuItems = [
    { id: 'actionCards', label: 'Action Cards', icon: '💳' },
    { id: 'topTabs', label: 'Top Tabs', icon: '📑' },
    { id: 'sidebarMenus', label: 'Sidebar Menus', icon: '☰' },
    { id: 'crmCards', label: 'CRM Management', icon: '👥' },
    { id: 'banners', label: 'Banners', icon: '🖼️' },
    { id: 'newsImages', label: 'Login News Images', icon: '📰' },
    { id: 'quickLinks', label: (allLinkMenusList.find(m => m.key === 'quickLinks') || {}).label || 'Quick Links', icon: '🔗' },
    { id: 'quickLinkServiceLogs', label: 'Quick Links Service Logs', icon: '📜', adminOnly: true },
  ].filter(item => (userRole === 'admin' || !item.adminOnly) && (userRole === 'admin' || hasStaffModuleAccess(item.id)));

  const panSubmenuItems = [
    { id: 'panSubmissions', label: 'Retailer PAN Submissions', icon: '📇' },
    { id: 'panServiceLogs', label: 'PAN Service Logs', icon: '📜', adminOnly: true },
    { id: 'panForms', label: 'PAN Form Manager', icon: '📝' },
  ].filter(item => (userRole === 'admin' || !item.adminOnly) && (userRole === 'admin' || hasStaffModuleAccess(item.id)));

  const offlineSubmenuItems = [
    { id: 'offlineSubmissions', label: 'Retailer Submissions', icon: '📁' },
    { id: 'offlineServiceLogs', label: 'Offline Work Service Logs', icon: '📜', adminOnly: true },
    { id: 'offlineForms', label: 'Offline Form Manager', icon: '📑' },
  ].filter(item => (userRole === 'admin' || !item.adminOnly) && (userRole === 'admin' || hasStaffModuleAccess(item.id)));

  const standaloneItems = [
    { id: 'walletRequests', label: 'Wallet Requests', icon: '💼' },
    { id: 'users', label: 'User Management', icon: '👥' },
    { id: 'customerManagement', label: 'Customer Management', icon: '📇', adminOnly: true },
    { id: 'staffMembers', label: 'Staff Management', icon: '👔', adminOnly: true },
  ].filter(item => {
    if (userRole === 'admin') return true;
    if (item.adminOnly) return false;
    return hasStaffModuleAccess(item.id);
  });

  const feesSubmenuItems = [
    { id: 'feesNewApplication', label: 'PAN New Application', icon: '📄' },
    { id: 'feesCorrection', label: 'PAN Correction', icon: '✏️' },
  ].filter(item => hasStaffModuleAccess(item.id));

  const ledgerSubmenuItems = [
    { id: 'ledgerHistory', label: 'All Ledger Transactions', icon: '📋' },
    { id: 'payInPayOutHistory', label: 'Pay-In / Pay-Out History', icon: '⇄' },
  ].filter(item => hasStaffModuleAccess(item.id) || hasStaffModuleAccess('ledgerHistory') || hasStaffModuleAccess('payInHistory') || hasStaffModuleAccess('payOutHistory'));

  // Filter ledger transactions for PAN New Application
  const newPanTransactions = React.useMemo(() => {
    const isCorrectionApp = (a) => {
      const t = (a.applicationType || a.type || a.serviceType || '').toLowerCase();
      return t.includes('correct') || t.includes('cr') || t.includes('update') || t.includes('change') || t.includes('already pan') || t.includes('already_pan') || t.includes('already-pan') || t.includes('scope3') || t.includes('scope4') || t.includes('csf');
    };

    const correctionAckSet = new Set();
    const newPanAckSet = new Set();

    (panSubmissionsData.applications || []).forEach(a => {
      const acks = [a.ackNumber, a.referenceId, a._id, a.panNumber, a.nsdlReceiptNumber].filter(Boolean).map(x => x.toString().toLowerCase().trim());
      if (isCorrectionApp(a)) {
        acks.forEach(k => correctionAckSet.add(k));
      } else {
        acks.forEach(k => newPanAckSet.add(k));
      }
    });

    return (ledgerTransactions || []).filter(tx => {
      const desc = (tx.description || '').toLowerCase();
      const ref = (tx.referenceNumber || '').toLowerCase().replace(/^ref-/, '').trim();

      if (correctionAckSet.has(ref)) return false;
      if (newPanAckSet.has(ref)) return true;

      const isCorrectionDesc = desc.includes('correct') || desc.includes('cr form') || desc.includes('pan cr') || desc.includes('49cr') || desc.includes('manual_pan_correction') || desc.includes('epan_correction') || desc.includes('pan update') || desc.includes('card update') || desc.includes('pan correction') || desc.includes('already pan') || desc.includes('already_pan') || desc.includes('already-pan') || desc.includes('pan application fee - pan correction') || desc.includes('pan application fee - correction') || desc.includes('pan application fee - manual_pan_correction') || desc.includes('pan application fee - already pan');
      if (isCorrectionDesc) return false;

      const isNewPanDesc = desc.includes('new pan') || desc.includes('form 49a') || desc.includes('manual_new_pan') || desc.includes('manual new pan') || desc.includes('pan application fee - new') || desc.includes('pan application fee - manual_new_pan') || desc.includes('pan 49a');
      if (isNewPanDesc) return true;

      // Generic PAN application fee or refund that isn't correction
      if (desc.includes('pan application fee') || desc.includes('pan application') || desc.includes('refund for rejected pan') || desc.includes('pan fee')) {
        return true;
      }

      return false;
    });
  }, [ledgerTransactions, panSubmissionsData.applications]);

  // Filter ledger transactions for PAN Correction
  const panCorrectionTransactions = React.useMemo(() => {
    const isCorrectionApp = (a) => {
      const t = (a.applicationType || a.type || a.serviceType || '').toLowerCase();
      return t.includes('correct') || t.includes('cr') || t.includes('update') || t.includes('change') || t.includes('already pan') || t.includes('already_pan') || t.includes('already-pan') || t.includes('scope3') || t.includes('scope4') || t.includes('csf');
    };

    const correctionAckSet = new Set();
    (panSubmissionsData.applications || []).forEach(a => {
      if (isCorrectionApp(a)) {
        const acks = [a.ackNumber, a.referenceId, a._id, a.panNumber, a.nsdlReceiptNumber].filter(Boolean).map(x => x.toString().toLowerCase().trim());
        acks.forEach(k => correctionAckSet.add(k));
      }
    });

    return (ledgerTransactions || []).filter(tx => {
      const desc = (tx.description || '').toLowerCase();
      const ref = (tx.referenceNumber || '').toLowerCase().replace(/^ref-/, '').trim();

      if (correctionAckSet.has(ref)) return true;

      const isCorrectionDesc = desc.includes('correct') || desc.includes('cr form') || desc.includes('pan cr') || desc.includes('49cr') || desc.includes('manual_pan_correction') || desc.includes('epan_correction') || desc.includes('pan update') || desc.includes('card update') || desc.includes('pan correction') || desc.includes('already pan') || desc.includes('already_pan') || desc.includes('already-pan') || desc.includes('pan application fee - pan correction') || desc.includes('pan application fee - correction') || desc.includes('pan application fee - manual_pan_correction') || desc.includes('pan application fee - already pan');
      if (isCorrectionDesc) return true;

      if (desc.includes('refund') && (desc.includes('correct') || desc.includes('already pan') || desc.includes('cr') || desc.includes('update'))) {
        return true;
      }

      return false;
    });
  }, [ledgerTransactions, panSubmissionsData.applications]);

  // Filter transactions for Pay-In (Credit) and Pay-Out (Debit) sorted by Date/Time
  const payInTransactions = React.useMemo(() => {
    return (ledgerTransactions || [])
      .filter(tx => tx.transactionType === 'Credit')
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }, [ledgerTransactions]);

  const payOutTransactions = React.useMemo(() => {
    return (ledgerTransactions || [])
      .filter(tx => tx.transactionType === 'Debit')
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }, [ledgerTransactions]);

  const payInPayOutTransactions = React.useMemo(() => {
    return (ledgerTransactions || [])
      .filter(tx => tx.transactionType === 'Credit' || tx.transactionType === 'Debit')
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }, [ledgerTransactions]);

  return (
    <div className="admin-layout">
      {/* Vertical Sidebar */}
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <h2>{userRole === 'staff' ? 'Staff Portal' : 'Admin Panel'}</h2>
        </div>
        <nav className="admin-nav-vertical">
          {/* Submenu 1: UI & Layout Setup */}
          {uiSubmenuItems.length > 0 && (
            <div className="admin-submenu-group">
              <button
                type="button"
                className={`admin-nav-parent-btn ${uiSubmenuItems.some(i => i.id === activeTab) ? 'active-group' : ''}`}
                onClick={() => setIsUiSubmenuOpen(!isUiSubmenuOpen)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span className="nav-icon">🎨</span>
                  <span>UI & Layout Setup</span>
                </div>
                <span className={`submenu-arrow ${isUiSubmenuOpen ? 'open' : ''}`}>▼</span>
              </button>
              {isUiSubmenuOpen && (
                <div className="admin-submenu-items">
                  {uiSubmenuItems.map(item => (
                    <button
                      key={item.id}
                      type="button"
                      className={`admin-nav-sub-btn ${activeTab === item.id ? 'active' : ''}`}
                      onClick={() => handleTabChange(item.id)}
                    >
                      <span className="nav-icon" style={{ fontSize: '15px', marginRight: '8px' }}>{item.icon}</span>
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Submenu: Dynamic Menus (Link Portals) */}
          <div className="admin-submenu-group">
            <button
              type="button"
              className={`admin-nav-parent-btn ${dynamicLinkMenusList.some(i => i.key === activeTab) ? 'active-group' : ''}`}
              onClick={() => setIsDynamicMenusOpen(!isDynamicMenusOpen)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span className="nav-icon">🌐</span>
                <span>Dynamic Menus ({dynamicLinkMenusList.length})</span>
              </div>
              <span className={`submenu-arrow ${isDynamicMenusOpen ? 'open' : ''}`}>▼</span>
            </button>
            {isDynamicMenusOpen && (
              <div className="admin-submenu-items">
                {dynamicLinkMenusList.map(item => (
                  <button
                    key={item.key}
                    type="button"
                    className={`admin-nav-sub-btn ${activeTab === item.key ? 'active' : ''}`}
                    onClick={() => handleTabChange(item.key)}
                    style={{ display: 'flex', alignItems: 'center' }}
                  >
                    <span className="nav-icon" style={{ fontSize: '15px', marginRight: '8px' }}>{item.icon}</span>
                    <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
                    <span style={{
                      fontSize: '9.5px',
                      padding: '2px 6px',
                      borderRadius: '8px',
                      fontWeight: 800,
                      letterSpacing: '0.4px',
                      background: item.isActive ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                      color: item.isActive ? '#10b981' : '#ef4444',
                      marginLeft: '6px',
                      flexShrink: 0
                    }}>
                      {item.isActive ? 'ON' : 'OFF'}
                    </span>
                  </button>
                ))}

                <button
                  type="button"
                  onClick={handleOpenAddDynamicMenu}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    width: '100%',
                    padding: '8px 12px',
                    margin: '6px 0 2px',
                    borderRadius: '8px',
                    background: 'rgba(2, 132, 199, 0.12)',
                    border: '1px dashed #0284c7',
                    color: '#0284c7',
                    fontWeight: 800,
                    fontSize: '12px',
                    cursor: 'pointer',
                    transition: 'all 0.18s ease'
                  }}
                >
                  <span style={{ fontSize: '14px' }}>➕</span>
                  <span>+ Add Dynamic Menu</span>
                </button>
              </div>
            )}
          </div>

          {/* Submenu 2: PAN Card Management */}
          {panSubmenuItems.length > 0 && (
            <div className="admin-submenu-group">
              <button
                type="button"
                className={`admin-nav-parent-btn ${panSubmenuItems.some(i => i.id === activeTab) ? 'active-group' : ''}`}
                onClick={() => setIsPanSubmenuOpen(!isPanSubmenuOpen)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span className="nav-icon">📇</span>
                  <span>PAN Management</span>
                </div>
                <span className={`submenu-arrow ${isPanSubmenuOpen ? 'open' : ''}`}>▼</span>
              </button>
              {isPanSubmenuOpen && (
                <div className="admin-submenu-items">
                  {panSubmenuItems.map(item => (
                    <button
                      key={item.id}
                      type="button"
                      className={`admin-nav-sub-btn ${activeTab === item.id ? 'active' : ''}`}
                      onClick={() => handleTabChange(item.id)}
                    >
                      <span className="nav-icon" style={{ fontSize: '15px', marginRight: '8px' }}>{item.icon}</span>
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Submenu: Offline Work Management */}
          {offlineSubmenuItems.length > 0 && (
            <div className="admin-submenu-group">
              <button
                type="button"
                className={`admin-nav-parent-btn ${offlineSubmenuItems.some(i => i.id === activeTab) ? 'active-group' : ''}`}
                onClick={() => setIsOfflineSubmenuOpen(!isOfflineSubmenuOpen)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span className="nav-icon">📁</span>
                  <span>Offline Work</span>
                </div>
                <span className={`submenu-arrow ${isOfflineSubmenuOpen ? 'open' : ''}`}>▼</span>
              </button>
              {isOfflineSubmenuOpen && (
                <div className="admin-submenu-items">
                  {offlineSubmenuItems.map(item => (
                    <button
                      key={item.id}
                      type="button"
                      className={`admin-nav-sub-btn ${activeTab === item.id ? 'active' : ''}`}
                      onClick={() => handleTabChange(item.id)}
                    >
                      <span className="nav-icon" style={{ fontSize: '15px', marginRight: '8px' }}>{item.icon}</span>
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tools & AI Utilities Management Navigation */}
          <div className="admin-submenu-group">
            <button
              type="button"
              className={`admin-nav-parent-btn ${activeTab === 'toolsManagement' ? 'active-group' : ''}`}
              onClick={() => handleTabChange('toolsManagement')}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span className="nav-icon">⚡</span>
                <span>Tools Management</span>
              </div>
              <span style={{
                fontSize: '9.5px',
                padding: '2px 7px',
                borderRadius: '8px',
                fontWeight: 800,
                background: isToolsServiceActive ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                color: isToolsServiceActive ? '#10b981' : '#ef4444',
                marginLeft: 'auto'
              }}>
                {isToolsServiceActive ? 'ON' : 'OFF'}
              </span>
            </button>
          </div>

          {/* Submenu 3: Fees Management */}
          {feesSubmenuItems.length > 0 && (
            <div className="admin-submenu-group">
              <button
                type="button"
                className={`admin-nav-parent-btn ${feesSubmenuItems.some(i => i.id === activeTab) ? 'active-group' : ''}`}
                onClick={() => setIsFeesSubmenuOpen(!isFeesSubmenuOpen)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span className="nav-icon">💰</span>
                  <span>Fees Management</span>
                </div>
                <span className={`submenu-arrow ${isFeesSubmenuOpen ? 'open' : ''}`}>▼</span>
              </button>
              {isFeesSubmenuOpen && (
                <div className="admin-submenu-items">
                  {feesSubmenuItems.map(item => (
                    <button
                      key={item.id}
                      type="button"
                      className={`admin-nav-sub-btn ${activeTab === item.id ? 'active' : ''}`}
                      onClick={() => handleTabChange(item.id)}
                    >
                      <span className="nav-icon" style={{ fontSize: '15px', marginRight: '8px' }}>{item.icon}</span>
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Submenu 4: Ledger History */}
          {ledgerSubmenuItems.length > 0 && (
            <div className="admin-submenu-group">
              <button
                type="button"
                className={`admin-nav-parent-btn ${ledgerSubmenuItems.some(i => i.id === activeTab) ? 'active-group' : ''}`}
                onClick={() => setIsLedgerSubmenuOpen(!isLedgerSubmenuOpen)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span className="nav-icon">📒</span>
                  <span>Ledger History</span>
                </div>
                <span className={`submenu-arrow ${isLedgerSubmenuOpen ? 'open' : ''}`}>▼</span>
              </button>
              {isLedgerSubmenuOpen && (
                <div className="admin-submenu-items">
                  {ledgerSubmenuItems.map(item => (
                    <button
                      key={item.id}
                      type="button"
                      className={`admin-nav-sub-btn ${activeTab === item.id ? 'active' : ''}`}
                      onClick={() => handleTabChange(item.id)}
                    >
                      <span className="nav-icon" style={{ fontSize: '15px', marginRight: '8px' }}>{item.icon}</span>
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Standalone Items */}
          {standaloneItems.map(item => {
            const pendingCount = item.id === 'users' ? users.filter(u => u.status === 'Pending').length : 0;
            return (
              <button 
                key={item.id} 
                type="button"
                className={`admin-nav-btn ${activeTab === item.id ? 'active' : ''}`} 
                onClick={() => handleTabChange(item.id)}
              >
                <span className="nav-icon">{item.icon}</span>
                <span style={{ flex: 1, textAlign: 'left' }}>{item.label}</span>
                {pendingCount > 0 && (
                  <span style={{
                    background: '#ea580c',
                    color: '#ffffff',
                    borderRadius: '10px',
                    fontSize: '11px',
                    fontWeight: '800',
                    padding: '2px 7px',
                    marginLeft: 'auto'
                  }}>
                    {pendingCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
        <div className="admin-sidebar-footer">
          {/* Footer removed per user request */}
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="admin-main">
        <header className="admin-topbar">
          <h1>{dynamicLinkMenusList.find(m => m.key === activeTab)?.label || (activeTab === 'quickLinks' ? (allLinkMenusList.find(m => m.key === 'quickLinks')?.label || 'Quick Links') : (allMenuItems.find(m => m.id === activeTab)?.label || 'Dashboard'))}</h1>
          <div className="admin-topbar-actions" style={{ display: 'flex', gap: '18px', alignItems: 'center' }}>
            <NotificationBell />
            <div className="user-profile" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', background: '#f8fafc', border: '1px solid #e2e8f0', padding: '7px 14px', borderRadius: '20px', fontWeight: '700', color: '#0f172a', fontSize: '13px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
              <span style={{ fontSize: '16px' }}>{userRole === 'staff' ? '👔' : '👨‍💼'}</span>
              <span>{userRole === 'staff' ? `Staff: ${staffName || 'Member'}` : 'Admin Profile'}</span>
            </div>
            <button 
              onClick={() => {
                sessionStorage.removeItem('adminAuth');
                sessionStorage.removeItem('adminEmail');
                sessionStorage.removeItem('userRole');
                sessionStorage.removeItem('staffName');
                sessionStorage.removeItem('staffPermissions');
                sessionStorage.removeItem('currentUser');
                sessionStorage.removeItem('sessionToken');
                sessionStorage.removeItem('adminSessionToken');

                localStorage.removeItem('adminAuth');
                localStorage.removeItem('adminEmail');
                localStorage.removeItem('userRole');
                localStorage.removeItem('staffName');
                localStorage.removeItem('staffPermissions');
                localStorage.removeItem('currentUser');
                localStorage.removeItem('adminSessionToken');

                navigate('/admin-login');
              }} 
              style={{ padding: '7px 14px', background: 'rgba(239, 68, 68, 0.08)', color: '#dc2626', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '9px', cursor: 'pointer', fontWeight: '700', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.18s ease' }}
            >
              <span>🚪</span> Logout
            </button>
          </div>
        </header>
        
        <div className="admin-content-wrapper">
          
          {/* Action Cards Tab */}
          {activeTab === 'actionCards' && (
            <div className="admin-panel-grid" style={{ gridTemplateColumns: hasStaffActionAccess('actionCards.add') ? undefined : '1fr' }}>
              {hasStaffActionAccess('actionCards.add') && (
                <div className="admin-card form-card">
                  <h3>Add New Card</h3>
                  <div className="modern-form">
                    <input type="text" placeholder="Title" value={cardForm.title} onChange={e => setCardForm({...cardForm, title: e.target.value})} />
                    <div className="file-upload-wrapper">
                      <input type="file" accept="image/*" onChange={e => setCardForm({...cardForm, imgFile: e.target.files[0]})} />
                    </div>
                    <input type="text" placeholder="Redirect URL (e.g. https://google.com)" value={cardForm.url} onChange={e => setCardForm({...cardForm, url: e.target.value})} />
                    <label className="modern-checkbox">
                      <input type="checkbox" checked={cardForm.isAeps} onChange={e => setCardForm({...cardForm, isAeps: e.target.checked})} /> 
                      <span>Is AEPS?</span>
                    </label>
                    <button className="modern-submit-btn" onClick={addActionCard}>
                      {editingCardId ? 'Update Card' : 'Add Card'}
                    </button>
                    {editingCardId && (
                      <button className="modern-submit-btn" style={{ background: '#6b7280', marginTop: '5px' }} onClick={() => { setEditingCardId(null); setCardForm({ title: '', imgFile: null, icon: '', isAeps: false, url: '' }); }}>Cancel Edit</button>
                    )}
                  </div>
                </div>
              )}
              <div className="admin-card list-card">
                <h3>Existing Cards</h3>
                <div className="modern-list">
                  {cards.map((c, index) => (
                    <div 
                      className="list-item" 
                      key={c._id}
                      draggable
                      onDragStart={() => handleDragStart(index)}
                      onDragEnter={(e) => handleDragEnter(e, index, cards, setCards)}
                      onDragEnd={() => handleDragEnd('action-cards', cards)}
                      onDragOver={(e) => e.preventDefault()}
                      style={{ cursor: 'grab' }}
                    >
                      <div style={{ marginRight: '10px', color: '#9ca3af', fontSize: '20px' }}>☰</div>
                      <img src={c.img} alt="" className="item-thumb"/>
                      <span className="item-name">{c.title}</span>
                      <div className="item-actions">
                        {hasStaffActionAccess('actionCards.edit') && (
                          <button className="modern-edit-btn" onClick={() => startEditCard(c)} style={{ marginRight: '8px', background: '#3b82f6', color: 'white', border: 'none', padding: '8px 14px', borderRadius: '6px', cursor: 'pointer' }}>Edit</button>
                        )}
                        {hasStaffActionAccess('actionCards.delete') && (
                          <button className="modern-delete-btn" onClick={() => deleteItem(`${API_URL}/api/action-cards`, c._id)}>Delete</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Top Tabs Tab */}
          {activeTab === 'topTabs' && (
            <div className="admin-panel-grid" style={{ gridTemplateColumns: hasStaffActionAccess('topTabs.add') ? undefined : '1fr' }}>
              {hasStaffActionAccess('topTabs.add') && (
                <div className="admin-card form-card">
                  <h3>Add Top Tab</h3>
                  <div className="modern-form">
                    <input type="text" placeholder="Label" value={tabForm.label} onChange={e => setTabForm({...tabForm, label: e.target.value})} />
                    <input type="text" placeholder="Redirect URL (e.g. https://google.com)" value={tabForm.url} onChange={e => setTabForm({...tabForm, url: e.target.value})} />
                    <input type="number" placeholder="Order" value={tabForm.order} onChange={e => setTabForm({...tabForm, order: e.target.value})} />
                    <button className="modern-submit-btn" onClick={() => addItem(`${API_URL}/api/top-tabs`, tabForm, setTabForm, { label: '', order: 0, url: '' }, editingTabId, setEditingTabId)}>
                      {editingTabId ? 'Update Tab' : 'Add Tab'}
                    </button>
                    {editingTabId && (
                      <button className="modern-submit-btn" style={{ background: '#6b7280', marginTop: '5px' }} onClick={() => { setEditingTabId(null); setTabForm({ label: '', order: 0, url: '' }); }}>Cancel Edit</button>
                    )}
                  </div>
                </div>
              )}
              <div className="admin-card list-card">
                <h3>Existing Tabs</h3>
                <div className="modern-list">
                  {topTabs.map((t, index) => (
                    <div 
                      className="list-item" 
                      key={t._id}
                      draggable
                      onDragStart={() => handleDragStart(index)}
                      onDragEnter={(e) => handleDragEnter(e, index, topTabs, setTopTabs)}
                      onDragEnd={() => handleDragEnd('top-tabs', topTabs)}
                      onDragOver={(e) => e.preventDefault()}
                      style={{ cursor: 'grab' }}
                    >
                      <div style={{ marginRight: '10px', color: '#9ca3af', fontSize: '20px' }}>☰</div>
                      <span className="item-name">{t.label}</span>
                      <div className="item-actions">
                        {hasStaffActionAccess('topTabs.edit') && (
                          <button className="modern-edit-btn" onClick={() => startEditTab(t)} style={{ marginRight: '8px', background: '#3b82f6', color: 'white', border: 'none', padding: '8px 14px', borderRadius: '6px', cursor: 'pointer' }}>Edit</button>
                        )}
                        {hasStaffActionAccess('topTabs.delete') && (
                          <button className="modern-delete-btn" onClick={() => deleteItem(`${API_URL}/api/top-tabs`, t._id)}>Delete</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          {/* Sidebar Menu Tab */}
          {activeTab === 'sidebarMenus' && (
            <div className="admin-panel-grid" style={{ gridTemplateColumns: hasStaffActionAccess('sidebarMenus.add') ? undefined : '1fr' }}>
              {hasStaffActionAccess('sidebarMenus.add') && (
                <div className="admin-card form-card">
                  <h3>{editingMenuId ? 'Edit Sidebar Menu' : 'Add Sidebar Menu'}</h3>
                  <div className="modern-form">
                    <input type="text" placeholder="Label (e.g. Wallet, PAN Card)" value={menuForm.label} onChange={e => setMenuForm({...menuForm, label: e.target.value})} />
                    <input type="text" placeholder="Routing URL (e.g. /pan-card, /wallet)" value={menuForm.url} onChange={e => setMenuForm({...menuForm, url: e.target.value})} />
                    <input type="number" placeholder="Order" value={menuForm.order} onChange={e => setMenuForm({...menuForm, order: e.target.value})} />
                    <label className="modern-checkbox" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', margin: '8px 0' }}>
                      <input type="checkbox" checked={menuForm.isActive} onChange={e => setMenuForm({...menuForm, isActive: e.target.checked})} /> 
                      <span style={{ fontWeight: 700, fontSize: '13px' }}>
                        User Panel Visibility: {menuForm.isActive ? <span style={{ color: '#10b981' }}>🟢 ON (Visible)</span> : <span style={{ color: '#ef4444' }}>⚪ OFF (Hidden)</span>}
                      </span>
                    </label>
                    <button className="modern-submit-btn" onClick={() => addItem(`${API_URL}/api/sidebar-menus`, menuForm, setMenuForm, { label: '', url: '', isActive: false, order: 0 }, editingMenuId, setEditingMenuId)}>
                      {editingMenuId ? 'Update Menu' : 'Add Menu'}
                    </button>
                    {editingMenuId && (
                      <button className="modern-submit-btn" style={{ background: '#6b7280', marginTop: '5px' }} onClick={() => { setEditingMenuId(null); setMenuForm({ label: '', url: '', isActive: false, order: 0 }); }}>Cancel Edit</button>
                    )}
                  </div>
                </div>
              )}
              <div className="admin-card list-card">
                <h3>Existing Menus</h3>
                <div className="modern-list">
                  {sidebarMenus.map((m, index) => (
                    <div 
                      className="list-item" 
                      key={m._id}
                      draggable
                      onDragStart={() => handleDragStart(index)}
                      onDragEnter={(e) => handleDragEnter(e, index, sidebarMenus, setSidebarMenus)}
                      onDragEnd={() => handleDragEnd('sidebar-menus', sidebarMenus)}
                      onDragOver={(e) => e.preventDefault()}
                      style={{ cursor: 'grab' }}
                    >
                      <div style={{ marginRight: '10px', color: '#9ca3af', fontSize: '20px' }}>☰</div>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span className="item-name">{m.label || '(Empty Block)'} {m.isActive && '★'}</span>
                        {m.url && <span style={{ fontSize: '11px', color: '#3b82f6', fontFamily: 'monospace' }}>🔗 {m.url}</span>}
                      </div>
                      <div className="item-actions" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
                        <button
                          type="button"
                          onClick={() => toggleSidebarMenuStatus(m)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '6px 13px',
                            borderRadius: '20px',
                            border: 'none',
                            fontSize: '12px',
                            fontWeight: '800',
                            cursor: 'pointer',
                            background: m.isActive ? '#10b981' : '#e2e8f0',
                            color: m.isActive ? '#ffffff' : '#64748b',
                            boxShadow: m.isActive ? '0 2px 8px rgba(16, 185, 129, 0.3)' : 'none',
                            transition: 'all 0.2s ease',
                            marginRight: '8px'
                          }}
                          title={m.isActive ? 'Click to Turn OFF (Hide from User Panel)' : 'Click to Turn ON (Show in User Panel)'}
                        >
                          <span style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            background: m.isActive ? '#ffffff' : '#94a3b8'
                          }}></span>
                          {m.isActive ? 'ON' : 'OFF'}
                        </button>
                        {hasStaffActionAccess('sidebarMenus.edit') && (
                          <button className="modern-edit-btn" onClick={() => startEditMenu(m)} style={{ background: '#3b82f6', color: 'white', border: 'none', padding: '8px 14px', borderRadius: '6px', cursor: 'pointer' }}>Edit</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* CRM Cards Management Tab */}
          {activeTab === 'crmCards' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Header Info Banner */}
              <div style={{
                background: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)',
                border: '1.5px solid #fed7aa',
                borderRadius: '16px',
                padding: '18px 22px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '14px',
                boxShadow: '0 2px 10px rgba(234, 88, 12, 0.06)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{
                    width: '46px',
                    height: '46px',
                    borderRadius: '12px',
                    background: '#ea580c',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '24px',
                    boxShadow: '0 4px 12px rgba(234, 88, 12, 0.3)'
                  }}>
                    👥
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#9a3412' }}>
                      CRM Management — Dynamic Cards ({crmCards.length})
                    </h3>
                    <p style={{ margin: '3px 0 0', fontSize: '12.5px', color: '#7c2d12' }}>
                      Configure cards visible in the User Panel's CRM menu. Toggle cards ON/OFF, edit titles, badges, and descriptions.
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{
                    padding: '6px 14px',
                    borderRadius: '20px',
                    background: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    color: '#15803d',
                    fontSize: '12px',
                    fontWeight: 800
                  }}>
                    ✓ {crmCards.filter(c => c.isActive !== false).length} / {crmCards.length} Active in User Panel
                  </span>
                </div>
              </div>

              {/* Grid: Form (Left) & List (Right) */}
              <div className="admin-panel-grid" style={{ gridTemplateColumns: hasStaffActionAccess('crmCards.add') || hasStaffActionAccess('crmCards.edit') ? undefined : '1fr' }}>
                {(hasStaffActionAccess('crmCards.add') || hasStaffActionAccess('crmCards.edit')) && (
                  <div className="admin-card form-card">
                    <h3>{editingCrmCardId ? 'Edit CRM Card' : 'Add New CRM Card'}</h3>
                    <div className="modern-form">
                      <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                          Card Title *
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Task, Pending Work, My Bill Book"
                          value={crmForm.title}
                          onChange={e => setCrmForm({ ...crmForm, title: e.target.value })}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                          Subtitle / Description
                        </label>
                        <input
                          type="text"
                          placeholder="Short description of card purpose"
                          value={crmForm.subtitle}
                          onChange={e => setCrmForm({ ...crmForm, subtitle: e.target.value })}
                        />
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                            Icon Emoji
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. 📋, ⏳, 📖, 👥"
                            value={crmForm.icon}
                            onChange={e => setCrmForm({ ...crmForm, icon: e.target.value })}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                            Badge Label
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. Tasks, Billing"
                            value={crmForm.badge}
                            onChange={e => setCrmForm({ ...crmForm, badge: e.target.value })}
                          />
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                            Accent Color
                          </label>
                          <input
                            type="color"
                            value={crmForm.color}
                            onChange={e => setCrmForm({ ...crmForm, color: e.target.value })}
                            style={{ width: '100%', height: '40px', padding: '2px', cursor: 'pointer', borderRadius: '8px' }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                            Navigation Route URL
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. /crm/task"
                            value={crmForm.url}
                            onChange={e => setCrmForm({ ...crmForm, url: e.target.value })}
                          />
                        </div>
                      </div>

                      <label className="modern-checkbox" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', margin: '6px 0' }}>
                        <input
                          type="checkbox"
                          checked={crmForm.isActive}
                          onChange={e => setCrmForm({ ...crmForm, isActive: e.target.checked })}
                        />
                        <span style={{ fontSize: '13px', fontWeight: 600 }}>Active in User Panel</span>
                      </label>

                      <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                        <button
                          type="button"
                          className="modern-submit-btn"
                          onClick={handleSaveCrmCard}
                          disabled={crmSubmitting}
                          style={{ flex: 1 }}
                        >
                          {crmSubmitting ? 'Saving...' : editingCrmCardId ? '✓ Update Card' : '➕ Add Card'}
                        </button>
                        {editingCrmCardId && (
                          <button
                            type="button"
                            onClick={handleCancelEditCrmCard}
                            style={{
                              background: '#f1f5f9',
                              border: '1px solid #cbd5e1',
                              borderRadius: '8px',
                              padding: '10px 16px',
                              fontWeight: 700,
                              cursor: 'pointer',
                              color: '#475569'
                            }}
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* List of CRM Cards */}
                <div className="admin-card list-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                    <h3 style={{ margin: 0 }}>Existing CRM Cards ({crmCards.length})</h3>
                    <span style={{ fontSize: '12px', color: '#64748b' }}>Drag ☰ to reorder cards</span>
                  </div>

                  <div className="modern-list">
                    {crmCards.length === 0 ? (
                      <div style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>
                        No CRM cards configured yet. Use the form to add cards.
                      </div>
                    ) : (
                      crmCards.map((card, index) => (
                        <div
                          key={card._id}
                          className="list-item"
                          draggable
                          onDragStart={(e) => handleDragStart(e, index)}
                          onDragEnter={(e) => handleDragEnter(e, index, crmCards, setCrmCards)}
                          onDragEnd={() => handleDragEnd('crm/cards', crmCards)}
                          onDragOver={(e) => e.preventDefault()}
                          style={{
                            borderLeft: `4px solid ${card.color || '#3b82f6'}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '12px 14px',
                            borderRadius: '8px',
                            background: '#ffffff',
                            border: '1px solid #e2e8f0',
                            marginBottom: '8px'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{ cursor: 'grab', color: '#9ca3af', fontSize: '18px' }} title="Drag to reorder">
                              ☰
                            </div>
                            <div style={{
                              width: '38px',
                              height: '38px',
                              borderRadius: '8px',
                              background: `${card.color || '#3b82f6'}18`,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '20px',
                              border: `1px solid ${card.color || '#3b82f6'}40`
                            }}>
                              {card.icon || '📋'}
                            </div>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontWeight: 800, fontSize: '14px', color: '#0f172a' }}>
                                  {card.title}
                                </span>
                                {card.badge && (
                                  <span style={{
                                    fontSize: '11px',
                                    padding: '2px 8px',
                                    borderRadius: '10px',
                                    background: `${card.color || '#3b82f6'}15`,
                                    color: card.color || '#3b82f6',
                                    fontWeight: 800,
                                    border: `1px solid ${card.color || '#3b82f6'}30`
                                  }}>
                                    {card.badge}
                                  </span>
                                )}
                              </div>
                              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                                {card.subtitle || 'No subtitle configured'}
                              </div>
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {/* Toggle ON/OFF */}
                            <button
                              type="button"
                              onClick={() => handleToggleCrmCard(card)}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '5px 12px',
                                borderRadius: '20px',
                                border: 'none',
                                fontSize: '11.5px',
                                fontWeight: 800,
                                cursor: 'pointer',
                                background: card.isActive !== false ? '#10b981' : '#e2e8f0',
                                color: card.isActive !== false ? '#ffffff' : '#64748b',
                                boxShadow: card.isActive !== false ? '0 2px 8px rgba(16, 185, 129, 0.3)' : 'none',
                                transition: 'all 0.2s ease'
                              }}
                            >
                              <span style={{
                                width: '7px',
                                height: '7px',
                                borderRadius: '50%',
                                background: card.isActive !== false ? '#ffffff' : '#94a3b8'
                              }}></span>
                              {card.isActive !== false ? 'ON' : 'OFF'}
                            </button>

                            {/* Edit Button */}
                            {hasStaffActionAccess('crmCards.edit') && (
                              <button
                                type="button"
                                onClick={() => handleEditCrmCard(card)}
                                style={{
                                  background: '#f0f9ff',
                                  border: '1px solid #bae6fd',
                                  color: '#0284c7',
                                  padding: '5px 10px',
                                  borderRadius: '6px',
                                  cursor: 'pointer',
                                  fontSize: '11.5px',
                                  fontWeight: 700
                                }}
                              >
                                ✏️ Edit
                              </button>
                            )}

                            {/* Delete Button */}
                            {hasStaffActionAccess('crmCards.delete') && (
                              <button
                                type="button"
                                onClick={() => handleDeleteCrmCard(card)}
                                style={{
                                  background: '#fef2f2',
                                  border: '1px solid #fecaca',
                                  color: '#dc2626',
                                  padding: '5px 8px',
                                  borderRadius: '6px',
                                  cursor: 'pointer',
                                  fontSize: '11.5px',
                                  fontWeight: 700
                                }}
                                title="Delete Card"
                              >
                                🗑️
                              </button>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Banners Tab */}
          {activeTab === 'banners' && (
            <div className="admin-panel-grid" style={{ gridTemplateColumns: hasStaffActionAccess('banners.add') ? undefined : '1fr' }}>
              {hasStaffActionAccess('banners.add') && (
                <div className="admin-card form-card">
                  <h3>Add Banner</h3>
                  <div className="modern-form">
                    <div className="file-upload-wrapper">
                      <input type="file" accept="image/*" onChange={e => setBannerForm({...bannerForm, imgFile: e.target.files[0]})} />
                    </div>
                    <input type="text" placeholder="Fallback Icon (e.g. ✈️)" value={bannerForm.fallbackIcon} onChange={e => setBannerForm({...bannerForm, fallbackIcon: e.target.value})} />
                    <input type="text" placeholder="Fallback Person (e.g. 🧍)" value={bannerForm.fallbackPerson} onChange={e => setBannerForm({...bannerForm, fallbackPerson: e.target.value})} />
                    <button className="modern-submit-btn" onClick={addBanner}>Add Banner</button>
                  </div>
                </div>
              )}
              <div className="admin-card list-card">
                <h3>Existing Banners</h3>
                <div className="modern-list">
                  {banners.map(b => (
                    <div className="list-item" key={b._id}>
                      <img src={b.img} alt="" className="item-thumb large"/>
                      {hasStaffActionAccess('banners.delete') && (
                        <button className="modern-delete-btn" onClick={() => deleteItem(`${API_URL}/api/banners`, b._id)}>Delete</button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Dynamic Dashboard Marquee Tag Setting Card */}
              <div className="admin-card form-card" style={{ gridColumn: '1 / -1', marginTop: '10px', background: '#ffffff', border: '1.5px solid #38bdf8', borderRadius: '14px', padding: '20px' }}>
                <h3 style={{ margin: '0 0 6px 0', fontSize: '15px', fontWeight: 800, color: '#0369a1', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  📢 Dashboard Marquee Announcement Text
                </h3>
                <p style={{ margin: '0 0 14px 0', fontSize: '12px', color: '#64748b' }}>
                  Set the scrolling announcement text displayed at the top of all Retailer Dashboards (e.g. WELCOME TO MB MITRA).
                </p>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <input
                    type="text"
                    placeholder="Enter Marquee Announcement (e.g. WELCOME TO MB MITRA)..."
                    value={marqueeInput}
                    onChange={(e) => setMarqueeInput(e.target.value)}
                    style={{
                      flex: '1 1 300px',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: '1.5px solid #0284c7',
                      fontSize: '13.5px',
                      fontWeight: 700,
                      color: '#0f172a',
                      background: '#f0f9ff'
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleSaveMarquee}
                    style={{
                      padding: '10px 22px',
                      background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '8px',
                      fontWeight: 800,
                      fontSize: '13px',
                      cursor: 'pointer',
                      boxShadow: '0 4px 12px rgba(2, 132, 199, 0.3)',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    💾 Save Marquee Text
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* News Images Tab */}
          {activeTab === 'newsImages' && (
            <div className="admin-panel-grid" style={{ gridTemplateColumns: hasStaffActionAccess('newsImages.upload') ? undefined : '1fr' }}>
              {hasStaffActionAccess('newsImages.upload') && (
                <div className="admin-card form-card">
                  <h3>Add Login News Image</h3>
                  <div className="modern-form">
                    <div className="file-upload-wrapper">
                      <input type="file" accept="image/*" multiple onChange={e => setNewsImageForm({ imgFile: e.target.files[0], imgFiles: e.target.files })} />
                    </div>
                    <button className="modern-submit-btn" onClick={addNewsImage}>Upload Image(s)</button>
                  </div>
                </div>
              )}
              <div className="admin-card list-card">
                <h3>Existing News Images</h3>
                <div className="modern-list">
                  {newsImages.map(n => (
                    <div className="list-item" key={n._id}>
                      <img src={n.img} alt="" className="item-thumb portrait"/>
                      {hasStaffActionAccess('newsImages.delete') && (
                        <button className="modern-delete-btn" onClick={() => deleteItem(`${API_URL}/api/news-images`, n._id)}>Delete</button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Tools & AI Utilities Suite Management Tab */}
          {activeTab === 'toolsManagement' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Top Master Service Control Card */}
              <div className="admin-card" style={{
                background: isToolsServiceActive 
                  ? 'linear-gradient(135deg, rgba(240, 253, 244, 0.9) 0%, rgba(220, 252, 231, 0.6) 100%)' 
                  : 'linear-gradient(135deg, rgba(254, 242, 242, 0.9) 0%, rgba(254, 226, 226, 0.6) 100%)',
                border: isToolsServiceActive ? '1.5px solid #86efac' : '1.5px solid #fca5a5',
                borderRadius: '16px',
                padding: '20px 24px',
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.04)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '24px' }}>⚡</span>
                      <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>
                        Tools & AI Utilities Suite Master Control
                      </h3>
                      <span style={{
                        padding: '3px 10px',
                        borderRadius: '20px',
                        fontSize: '11px',
                        fontWeight: 800,
                        background: isToolsServiceActive ? '#15803d' : '#b91c1c',
                        color: '#ffffff'
                      }}>
                        {isToolsServiceActive ? '🟢 SUITE ACTIVE' : '🔴 SUITE PAUSED'}
                      </span>
                    </div>
                    <p style={{ margin: '6px 0 0 0', fontSize: '13px', color: '#475569', maxWidth: '680px' }}>
                      Control whole service visibility in the User Panel. When ON, the Tools option appears in the retailer sidebar and gives retailers access to all active AI cutter APIs, background removers, validators, and converters.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleToggleToolsMasterService}
                    style={{
                      padding: '10px 22px',
                      borderRadius: '12px',
                      border: 'none',
                      background: isToolsServiceActive ? '#dc2626' : '#16a34a',
                      color: '#ffffff',
                      fontSize: '13px',
                      fontWeight: 800,
                      cursor: 'pointer',
                      boxShadow: isToolsServiceActive ? '0 4px 12px rgba(220, 38, 38, 0.25)' : '0 4px 12px rgba(22, 163, 74, 0.25)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <span>{isToolsServiceActive ? '⏸️' : '▶️'}</span>
                    <span>{isToolsServiceActive ? 'Pause Whole Service' : 'Activate Whole Service'}</span>
                  </button>
                </div>
              </div>

              {/* Grid: Left = Add/Edit Form, Right = Configured Tools List */}
              <div className="admin-panel-grid" style={{ gridTemplateColumns: 'minmax(320px, 420px) 1fr' }}>
                {/* Form Card */}
                <div
                  className="admin-card form-card"
                  style={{
                    borderRadius: '14px',
                    border: editingToolId ? '2px solid #3b82f6' : '1px solid #e2e8f0',
                    boxShadow: editingToolId ? '0 10px 25px -5px rgba(59, 130, 246, 0.15)' : '0 4px 16px rgba(0, 0, 0, 0.05)',
                    background: '#ffffff',
                    padding: '20px',
                    transition: 'all 0.25s ease'
                  }}
                >
                  {/* Form Header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid #f1f5f9' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '10px',
                        background: editingToolId ? 'linear-gradient(135deg, #eff6ff, #dbeafe)' : 'linear-gradient(135deg, #f0fdf4, #dcfce7)',
                        color: editingToolId ? '#2563eb' : '#16a34a',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '18px',
                        boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.04)'
                      }}>
                        {editingToolId ? '✏️' : '➕'}
                      </div>
                      <div>
                        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.2px' }}>
                          {editingToolId ? 'Edit Tool' : 'Add New Tool'}
                        </h3>
                        <span style={{ fontSize: '11px', color: '#64748b' }}>
                          {editingToolId ? 'Modify configuration & service fee' : 'Register a new AI utility or API'}
                        </span>
                      </div>
                    </div>
                    {editingToolId && (
                      <span style={{
                        background: '#dbeafe',
                        color: '#1e40af',
                        fontSize: '10.5px',
                        fontWeight: 800,
                        padding: '3px 8px',
                        borderRadius: '6px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.4px'
                      }}>
                        Editing
                      </span>
                    )}
                  </div>

                  <div className="modern-form" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {/* Tool Title */}
                    <div>
                      <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '5px' }}>
                        <span>Tool Title <span style={{ color: '#ef4444' }}>*</span></span>
                        <span style={{ fontSize: '10.5px', color: '#94a3b8', fontWeight: 500 }}>Required</span>
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. AADHAR CARD PDF CUTTER AI API"
                        value={toolForm.title}
                        onChange={e => setToolForm({ ...toolForm, title: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          borderRadius: '8px',
                          border: '1.5px solid #cbd5e1',
                          fontSize: '13px',
                          fontWeight: 600,
                          color: '#0f172a',
                          boxSizing: 'border-box',
                          outline: 'none',
                          transition: 'border-color 0.2s'
                        }}
                      />
                    </div>

                    {/* Category & Icon */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div>
                        <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '5px' }}>Category</label>
                        <select
                          value={toolForm.category}
                          onChange={e => setToolForm({ ...toolForm, category: e.target.value })}
                          style={{
                            width: '100%',
                            padding: '10px 12px',
                            borderRadius: '8px',
                            border: '1.5px solid #cbd5e1',
                            fontSize: '13px',
                            fontWeight: 600,
                            color: '#0f172a',
                            background: '#ffffff',
                            boxSizing: 'border-box',
                            outline: 'none',
                            cursor: 'pointer'
                          }}
                        >
                          <option value="Card Cutter">Card Cutter</option>
                          <option value="Image AI">Image AI</option>
                          <option value="Validation">Validation</option>
                          <option value="OCR / Text">OCR / Text</option>
                          <option value="Converter">Converter</option>
                          <option value="General">General</option>
                        </select>
                      </div>

                      <div>
                        <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '5px' }}>Icon</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <div style={{
                            width: '38px',
                            height: '38px',
                            borderRadius: '8px',
                            background: '#f8fafc',
                            border: '1.5px solid #e2e8f0',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '18px',
                            flexShrink: 0
                          }}>
                            {toolForm.icon || '⚡'}
                          </div>
                          <input
                            type="text"
                            placeholder="Emoji icon"
                            value={toolForm.icon}
                            onChange={e => setToolForm({ ...toolForm, icon: e.target.value })}
                            style={{
                              flex: 1,
                              padding: '10px 10px',
                              borderRadius: '8px',
                              border: '1.5px solid #cbd5e1',
                              fontSize: '13px',
                              color: '#0f172a',
                              boxSizing: 'border-box',
                              outline: 'none'
                            }}
                          />
                        </div>
                        {/* Quick Icon Chips */}
                        <div style={{ display: 'flex', gap: '4px', marginTop: '5px', flexWrap: 'wrap' }}>
                          {['🪪', '✂️', '⚡', '🔍', '✨', '📜', '💳', '🗳️', '🏥'].map(ico => (
                            <button
                              key={ico}
                              type="button"
                              onClick={() => setToolForm({ ...toolForm, icon: ico })}
                              style={{
                                background: toolForm.icon === ico ? '#e0f2fe' : '#f1f5f9',
                                border: toolForm.icon === ico ? '1px solid #38bdf8' : '1px solid #e2e8f0',
                                borderRadius: '5px',
                                padding: '1px 6px',
                                fontSize: '12px',
                                cursor: 'pointer'
                              }}
                              title={`Set icon ${ico}`}
                            >
                              {ico}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Badge Label & Service Fee */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div>
                        <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '5px' }}>Badge Label</label>
                        <input
                          type="text"
                          placeholder="e.g. AI API"
                          value={toolForm.badge}
                          onChange={e => setToolForm({ ...toolForm, badge: e.target.value })}
                          style={{
                            width: '100%',
                            padding: '10px 12px',
                            borderRadius: '8px',
                            border: '1.5px solid #cbd5e1',
                            fontSize: '13px',
                            color: '#0f172a',
                            boxSizing: 'border-box',
                            outline: 'none'
                          }}
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '5px' }}>
                          <span>Service Fee (₹)</span>
                          <span style={{ fontSize: '10.5px', color: (parseFloat(toolForm.fee) > 0) ? '#b45309' : '#16a34a', fontWeight: 700 }}>
                            {parseFloat(toolForm.fee) > 0 ? `₹${parseFloat(toolForm.fee).toFixed(2)}` : 'FREE'}
                          </span>
                        </label>
                        <div style={{ position: 'relative' }}>
                          <span style={{
                            position: 'absolute',
                            left: '12px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            fontWeight: 800,
                            color: '#64748b',
                            fontSize: '14px',
                            pointerEvents: 'none'
                          }}>
                            ₹
                          </span>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            placeholder="0 (Free)"
                            value={toolForm.fee === '' ? '' : (toolForm.fee ?? '')}
                            onChange={e => {
                              const val = e.target.value;
                              setToolForm({ ...toolForm, fee: val });
                            }}
                            style={{
                              width: '100%',
                              padding: '10px 12px 10px 28px',
                              borderRadius: '8px',
                              border: parseFloat(toolForm.fee) > 0 ? '1.5px solid #f59e0b' : '1.5px solid #cbd5e1',
                              fontSize: '13px',
                              fontWeight: 700,
                              color: parseFloat(toolForm.fee) > 0 ? '#b45309' : '#0f172a',
                              background: parseFloat(toolForm.fee) > 0 ? '#fffbeb' : '#ffffff',
                              boxSizing: 'border-box',
                              outline: 'none'
                            }}
                          />
                        </div>
                        {/* Quick Fee chips */}
                        <div style={{ display: 'flex', gap: '4px', marginTop: '5px' }}>
                          {[
                            { label: 'Free', val: 0 },
                            { label: '₹5', val: 5 },
                            { label: '₹10', val: 10 },
                            { label: '₹20', val: 20 }
                          ].map(chip => (
                            <button
                              key={chip.label}
                              type="button"
                              onClick={() => setToolForm({ ...toolForm, fee: chip.val })}
                              style={{
                                background: Number(toolForm.fee) === chip.val ? '#fef3c7' : '#f8fafc',
                                border: Number(toolForm.fee) === chip.val ? '1px solid #f59e0b' : '1px solid #e2e8f0',
                                color: Number(toolForm.fee) === chip.val ? '#b45309' : '#475569',
                                borderRadius: '5px',
                                padding: '2px 6px',
                                fontSize: '10.5px',
                                fontWeight: 700,
                                cursor: 'pointer'
                              }}
                            >
                              {chip.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Redirect / Web App URL */}
                    <div>
                      <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '5px' }}>Redirect / Web App URL (Optional)</label>
                      <input
                        type="text"
                        placeholder="https://... (URL opens when user clicks Open Tool)"
                        value={toolForm.url}
                        onChange={e => setToolForm({ ...toolForm, url: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '9px 12px',
                          borderRadius: '8px',
                          border: '1.5px solid #cbd5e1',
                          fontSize: '12.5px',
                          color: '#0f172a',
                          boxSizing: 'border-box',
                          outline: 'none',
                          fontFamily: 'monospace'
                        }}
                      />
                    </div>

                    {/* API Endpoint */}
                    <div>
                      <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '5px' }}>API Endpoint (Optional)</label>
                      <input
                        type="text"
                        placeholder="https://api.example.com/v1/cutter"
                        value={toolForm.apiUrl}
                        onChange={e => setToolForm({ ...toolForm, apiUrl: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '9px 12px',
                          borderRadius: '8px',
                          border: '1.5px solid #cbd5e1',
                          fontSize: '12.5px',
                          color: '#0f172a',
                          boxSizing: 'border-box',
                          outline: 'none',
                          fontFamily: 'monospace'
                        }}
                      />
                    </div>

                    {/* Description */}
                    <div>
                      <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '5px' }}>Description</label>
                      <textarea
                        rows="2"
                        placeholder="Brief summary of what this tool does..."
                        value={toolForm.description}
                        onChange={e => setToolForm({ ...toolForm, description: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '9px 12px',
                          borderRadius: '8px',
                          border: '1.5px solid #cbd5e1',
                          fontSize: '12.5px',
                          color: '#0f172a',
                          boxSizing: 'border-box',
                          outline: 'none',
                          resize: 'vertical'
                        }}
                      />
                    </div>

                    {/* User Panel Visibility Switch */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: '#f8fafc',
                      padding: '10px 14px',
                      borderRadius: '10px',
                      border: '1px solid #e2e8f0',
                      marginTop: '2px'
                    }}>
                      <div>
                        <span style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#0f172a' }}>
                          User Panel Visibility
                        </span>
                        <span style={{ fontSize: '11px', color: '#64748b' }}>
                          {toolForm.isActive ? 'Visible to retailers in the Tools menu' : 'Hidden from retailer panel'}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setToolForm({ ...toolForm, isActive: !toolForm.isActive })}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '5px 12px',
                          borderRadius: '20px',
                          border: 'none',
                          fontSize: '11.5px',
                          fontWeight: 800,
                          cursor: 'pointer',
                          background: toolForm.isActive ? '#10b981' : '#e2e8f0',
                          color: toolForm.isActive ? '#ffffff' : '#64748b',
                          transition: 'all 0.2s'
                        }}
                      >
                        <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: toolForm.isActive ? '#fff' : '#94a3b8' }}></span>
                        {toolForm.isActive ? 'ON (Visible)' : 'OFF (Hidden)'}
                      </button>
                    </div>

                    {/* PDF Suite 15 Sub-Tools Control Banner */}
                    {editingToolId && isPdfSuiteTool(adminTools.find(t => t._id === editingToolId) || toolForm) && (
                      <div style={{
                        background: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)',
                        border: '1.5px solid #fdba74',
                        borderRadius: '10px',
                        padding: '12px 14px',
                        marginTop: '6px'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                          <span style={{ fontSize: '18px' }}>📑</span>
                          <span style={{ fontWeight: 800, fontSize: '13px', color: '#9a3412' }}>
                            PDF Suite: 15 Sub-Tools Control
                          </span>
                        </div>
                        <p style={{ margin: '0 0 10px 0', fontSize: '11.5px', color: '#7c2d12', lineHeight: '1.4' }}>
                          Turn each of the 15 tools ON/OFF and set individual service fees (charges).
                        </p>
                        <button
                          type="button"
                          onClick={() => handleOpenPdfSubTools(adminTools.find(t => t._id === editingToolId) || { _id: editingToolId, ...toolForm })}
                          style={{
                            width: '100%',
                            background: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)',
                            color: '#ffffff',
                            border: 'none',
                            padding: '9px 14px',
                            borderRadius: '7px',
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontWeight: 800,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            boxShadow: '0 3px 10px rgba(234, 88, 12, 0.3)'
                          }}
                        >
                          ⚙️ Manage 15 Sub-Tools (ON/OFF & Fees)
                        </button>
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                      <button
                        type="button"
                        disabled={isSavingTool}
                        onClick={handleSaveTool}
                        style={{
                          flex: 1,
                          background: editingToolId ? 'linear-gradient(135deg, #2563eb, #1d4ed8)' : 'linear-gradient(135deg, #10b981, #059669)',
                          color: '#ffffff',
                          border: 'none',
                          padding: '12px 16px',
                          borderRadius: '8px',
                          fontSize: '13.5px',
                          fontWeight: 700,
                          cursor: isSavingTool ? 'not-allowed' : 'pointer',
                          boxShadow: editingToolId ? '0 4px 12px rgba(37, 99, 235, 0.25)' : '0 4px 12px rgba(16, 185, 129, 0.25)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          transition: 'all 0.2s'
                        }}
                      >
                        {isSavingTool ? 'Saving...' : (editingToolId ? '✓ Update Tool' : '＋ Add Tool')}
                      </button>

                      {editingToolId && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingToolId(null);
                            setToolForm({ title: '', url: '', apiUrl: '', icon: '⚡', category: 'Card Cutter', badge: 'AI API', fee: 0, description: '', isActive: true });
                          }}
                          style={{
                            background: '#f1f5f9',
                            color: '#475569',
                            border: '1.5px solid #cbd5e1',
                            padding: '12px 16px',
                            borderRadius: '8px',
                            fontSize: '13px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '4px'
                          }}
                        >
                          ✕ Cancel
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* List Card */}
                <div className="admin-card list-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '14px' }}>
                    <h3 style={{ margin: 0 }}>
                      Configured Tools ({adminTools.filter(t => !/ayushman|pmjay/i.test(t.title || '')).length})
                    </h3>
                    <input
                      type="text"
                      placeholder="Filter tools..."
                      value={toolSearch}
                      onChange={e => setToolSearch(e.target.value)}
                      style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', minWidth: '180px' }}
                    />
                  </div>

                  <div className="modern-list" style={{ maxHeight: '680px', overflowY: 'auto' }}>
                    {adminTools
                      .filter(t => {
                        const tTitle = (t.title || '').toLowerCase();
                        if (tTitle.includes('ayushman') || tTitle.includes('pmjay')) return false;
                        if (!toolSearch.trim()) return true;
                        const q = toolSearch.toLowerCase();
                        return tTitle.includes(q) || (t.category || '').toLowerCase().includes(q);
                      })
                      .map((t, index) => (
                        <div
                          className="list-item"
                          key={t._id || index}
                          style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '12px' }}
                        >
                          <div style={{ fontSize: '22px', width: '36px', height: '36px', borderRadius: '8px', background: 'rgba(234, 88, 12, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {t.icon || '⚡'}
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              <span style={{ fontWeight: 800, fontSize: '13.5px', color: '#0f172a' }}>
                                {t.title}
                              </span>
                              <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '6px', background: '#e0f2fe', color: '#0369a1', fontWeight: 700 }}>
                                {t.badge || t.category || 'AI API'}
                              </span>
                              {t.fee > 0 && (
                                <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '6px', background: '#fef3c7', color: '#b45309', fontWeight: 800 }}>
                                  ₹{t.fee}
                                </span>
                              )}
                            </div>
                            {t.url ? (
                              <span style={{ fontSize: '11px', color: '#3b82f6', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                🔗 {t.url}
                              </span>
                            ) : (
                              <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                                ⚡ Standard AI Endpoint
                              </span>
                            )}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
                              <span style={{ fontSize: '11px', color: '#475569', background: '#f1f5f9', padding: '2px 7px', borderRadius: '4px', fontWeight: 600 }}>
                                📊 Uses: <strong>{t.usageCount || 0}</strong>
                              </span>
                              <span style={{ fontSize: '11px', color: '#15803d', background: '#dcfce7', padding: '2px 7px', borderRadius: '4px', fontWeight: 700 }}>
                                ✓ Success: <strong>{t.successCount || 0}</strong>
                              </span>
                              {(t.failureCount || 0) > 0 && (
                                <span style={{ fontSize: '11px', color: '#b91c1c', background: '#fee2e2', padding: '2px 7px', borderRadius: '4px', fontWeight: 700 }}>
                                  ✕ Failed: <strong>{t.failureCount || 0}</strong>
                                </span>
                              )}
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto', flexShrink: 0 }}>
                            <button
                              type="button"
                              onClick={() => handleToggleSingleTool(t)}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '5px 12px',
                                borderRadius: '16px',
                                border: 'none',
                                fontSize: '11.5px',
                                fontWeight: 800,
                                cursor: 'pointer',
                                background: t.isActive ? '#10b981' : '#e2e8f0',
                                color: t.isActive ? '#ffffff' : '#64748b'
                              }}
                              title={t.isActive ? 'Turn OFF for user panel' : 'Turn ON for user panel'}
                            >
                              <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: t.isActive ? '#fff' : '#94a3b8' }}></span>
                              {t.isActive ? 'ON' : 'OFF'}
                            </button>

                            {isPdfSuiteTool(t) && (
                              <button
                                type="button"
                                onClick={() => handleOpenPdfSubTools(t)}
                                style={{
                                  background: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)',
                                  color: '#ffffff',
                                  border: 'none',
                                  padding: '5px 12px',
                                  borderRadius: '6px',
                                  cursor: 'pointer',
                                  fontSize: '11.5px',
                                  fontWeight: 800,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '5px',
                                  boxShadow: '0 2px 6px rgba(234, 88, 12, 0.25)',
                                  whiteSpace: 'nowrap'
                                }}
                                title="Manage individual PDF tools: Turn ON/OFF, set charges/fees, and badges for all 15 tools"
                              >
                                <span>📑</span> Manage 15 Sub-Tools
                              </button>
                            )}

                            <button
                              type="button"
                              className="modern-edit-btn"
                              onClick={() => handleStartEditTool(t)}
                              style={{ background: '#3b82f6', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 700 }}
                            >
                              Edit
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Quick Links & Dynamic Link Menus Tabs */}
          {(activeTab === 'quickLinks' || dynamicLinkMenusList.some(m => m.key === activeTab)) && (() => {
            const currentMenuKey = dynamicLinkMenusList.some(m => m.key === activeTab) ? activeTab : 'quickLinks';
            const currentLinkMenu = allLinkMenusList.find(m => m.key === currentMenuKey) || { key: 'quickLinks', label: 'Quick Links', icon: '🔗' };

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {/* Horizontal Quick Switcher Pill Bar */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  flexWrap: 'wrap',
                  padding: '4px 2px 12px'
                }}>
                  {allLinkMenusList.map((m, index) => {
                    const isSelected = activeTab === m.key;
                    const isDyn = m.key !== 'quickLinks';
                    const isBeingDragged = draggedMenuTabIdx === index;
                    return (
                      <button
                        key={m.key}
                        type="button"
                        draggable
                        onDragStart={(e) => handleMenuTabDragStart(e, index)}
                        onDragEnter={(e) => handleMenuTabDragEnter(e, index)}
                        onDragEnd={handleMenuTabDragEnd}
                        onDragOver={(e) => e.preventDefault()}
                        onClick={() => {
                          if (isDraggingMenuTabRef.current) return;
                          handleTabChange(m.key);
                        }}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '7px',
                          padding: '8px 14px',
                          borderRadius: '10px',
                          border: isSelected ? '1.5px solid #0284c7' : '1px solid #cbd5e1',
                          background: isSelected ? 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)' : '#ffffff',
                          color: isSelected ? '#ffffff' : '#334155',
                          fontWeight: isSelected ? 800 : 600,
                          fontSize: '12.5px',
                          cursor: 'grab',
                          whiteSpace: 'nowrap',
                          boxShadow: isSelected ? '0 4px 12px rgba(2, 132, 199, 0.25)' : '0 1px 3px rgba(0,0,0,0.04)',
                          transition: 'all 0.18s ease',
                          opacity: isBeingDragged ? 0.35 : 1,
                          transform: isBeingDragged ? 'scale(0.96)' : 'none',
                          userSelect: 'none'
                        }}
                        title="Drag ☰ to reorder position / Click to view"
                      >
                        <span style={{ fontSize: '12px', color: isSelected ? 'rgba(255,255,255,0.7)' : '#94a3b8', cursor: 'grab', marginRight: '-2px' }}>☰</span>
                        <span style={{ fontSize: '14px' }}>{m.icon}</span>
                        <span>{m.label}</span>
                        {isDyn && (
                          <span style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            background: m.isActive ? (isSelected ? '#86efac' : '#10b981') : (isSelected ? '#fca5a5' : '#ef4444'),
                            display: 'inline-block',
                            marginLeft: '2px'
                          }} title={m.isActive ? 'Status: ON (Visible in User Panel)' : 'Status: OFF (Hidden from User Panel)'} />
                        )}
                      </button>
                    );
                  })}

                  {/* Add Dynamic Menu Pill Button */}
                  <button
                    type="button"
                    onClick={handleOpenAddDynamicMenu}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '7px',
                      padding: '8px 15px',
                      borderRadius: '10px',
                      border: '1.5px dashed #0284c7',
                      background: 'rgba(2, 132, 199, 0.08)',
                      color: '#0284c7',
                      fontWeight: 800,
                      fontSize: '12.5px',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      transition: 'all 0.18s ease'
                    }}
                    title="Add a new Dynamic Menu to User Panel"
                  >
                    <span style={{ fontSize: '14px' }}>➕</span>
                    <span>+ Add Dynamic Menu</span>
                  </button>
                </div>

                {currentMenuKey !== 'quickLinks' && (() => {
                  const matchingSm = (sidebarMenus || []).find(sm => {
                    if (currentLinkMenu._id && String(sm._id) === String(currentLinkMenu._id)) return true;
                    if (sm.url && currentLinkMenu.route && sm.url.toLowerCase().trim() === currentLinkMenu.route.toLowerCase().trim()) return true;
                    const d = getDynamicMenuForSidebarItem(sm, dynamicLinkMenusList);
                    return d && d.key === currentMenuKey;
                  }) || currentLinkMenu;
                  const isMenuOn = (matchingSm && matchingSm.isActive !== undefined) 
                    ? Boolean(matchingSm.isActive) 
                    : (currentLinkMenu && currentLinkMenu.isActive !== undefined ? Boolean(currentLinkMenu.isActive) : true);

                  return (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 18px',
                      borderRadius: '12px',
                      background: isMenuOn 
                        ? 'linear-gradient(135deg, #ecfdf5 0%, #f0fdf4 100%)' 
                        : 'linear-gradient(135deg, #fef2f2 0%, #fff1f2 100%)',
                      border: `1.5px solid ${isMenuOn ? '#a7f3d0' : '#fecaca'}`,
                      flexWrap: 'wrap',
                      gap: '12px',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                          width: '38px',
                          height: '38px',
                          borderRadius: '10px',
                          background: isMenuOn ? '#10b981' : '#ef4444',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#ffffff',
                          fontSize: '18px',
                          fontWeight: 900
                        }}>
                          {isMenuOn ? '✓' : '✕'}
                        </div>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: '14px', color: isMenuOn ? '#065f46' : '#991b1b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span>User Panel Status:</span>
                            <span style={{
                              padding: '2px 8px',
                              borderRadius: '12px',
                              fontSize: '11px',
                              background: isMenuOn ? '#10b981' : '#ef4444',
                              color: '#ffffff',
                              fontWeight: 900
                            }}>
                              {isMenuOn ? 'ON (VISIBLE)' : 'OFF (HIDDEN)'}
                            </span>
                          </div>
                          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                            {isMenuOn 
                              ? `"${currentLinkMenu.label}" is currently visible to users in their sidebar.`
                              : `"${currentLinkMenu.label}" is currently hidden from users in their sidebar.`}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        {/* Edit Menu Name / Icon Button */}
                        <button
                          type="button"
                          onClick={() => handleOpenEditDynamicMenu(currentLinkMenu)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '7px',
                            padding: '9px 16px',
                            borderRadius: '24px',
                            border: '1.5px solid #cbd5e1',
                            fontWeight: 800,
                            fontSize: '13px',
                            cursor: 'pointer',
                            background: '#ffffff',
                            color: '#1e293b',
                            boxShadow: '0 2px 6px rgba(0,0,0,0.05)',
                            transition: 'all 0.18s ease'
                          }}
                          title="Edit Dynamic Menu Title & Icon"
                        >
                          <span>✏️</span>
                          <span>Edit Menu</span>
                        </button>

                        {/* Turn ON / OFF Status Button */}
                        <button
                          type="button"
                          onClick={() => toggleSidebarMenuStatus(matchingSm, currentMenuKey)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '9px 20px',
                            borderRadius: '24px',
                            border: 'none',
                            fontWeight: 800,
                            fontSize: '13px',
                            cursor: 'pointer',
                            background: isMenuOn ? '#ef4444' : '#10b981',
                            color: '#ffffff',
                            boxShadow: isMenuOn ? '0 4px 12px rgba(239, 68, 68, 0.3)' : '0 4px 12px rgba(16, 185, 129, 0.3)',
                            transition: 'all 0.18s ease'
                          }}
                        >
                          <span style={{
                            width: '9px',
                            height: '9px',
                            borderRadius: '50%',
                            background: '#ffffff'
                          }}></span>
                          {isMenuOn ? 'Turn OFF (Hide Menu)' : 'Turn ON (Show Menu)'}
                        </button>

                        {/* Delete button if custom menu */}
                        {currentLinkMenu.isCustom && currentLinkMenu._id && (
                          <button
                            type="button"
                            onClick={() => handleDeleteCustomDynamicMenu(currentLinkMenu)}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '9px 14px',
                              borderRadius: '24px',
                              border: '1.5px solid #fecaca',
                              fontWeight: 800,
                              fontSize: '13px',
                              cursor: 'pointer',
                              background: '#fff1f2',
                              color: '#dc2626',
                              boxShadow: '0 2px 6px rgba(220, 38, 38, 0.1)',
                              transition: 'all 0.18s ease'
                            }}
                            title="Delete this dynamic menu"
                          >
                            <span>🗑️</span>
                            <span>Delete</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })()}

                <div className="admin-panel-grid" style={{ gridTemplateColumns: hasStaffActionAccess('quickLinks.add') ? undefined : '1fr' }}>
                  {hasStaffActionAccess('quickLinks.add') && (
                    <div className="admin-card form-card">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                        <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#e0f2fe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', color: '#0284c7' }}>
                          {currentLinkMenu.icon || '🔗'}
                        </div>
                        <div>
                          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>
                            {editingQuickLinkId ? `Edit ${currentLinkMenu.label}` : `Add ${currentLinkMenu.label} / Service`}
                          </h3>
                          <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748b' }}>
                            Configure dynamic links, fees and logos for {currentLinkMenu.label}
                          </p>
                        </div>
                      </div>
                      <div className="modern-form">
                        <div>
                          <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>Title / Display Name *</label>
                          <input 
                            type="text" 
                            placeholder="e.g. NEW PANCARD FORM 93 or Video Guide" 
                            value={quickLinkForm.title} 
                            onChange={e => setQuickLinkForm({ ...quickLinkForm, title: e.target.value })} 
                          />
                        </div>

                        <div>
                          <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>Category / Type</label>
                          <select 
                            value={quickLinkForm.category} 
                            onChange={e => setQuickLinkForm({ ...quickLinkForm, category: e.target.value })}
                            style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1.5px solid #e2e8f0', background: '#f8fafc', fontWeight: 600, fontSize: '13px' }}
                          >
                            <option value="link">🔗 Web Link / External Form Portal</option>
                            <option value="video">🎥 Video Guide / Tutorial</option>
                            <option value="service">⚙️ Internal Service / Tool</option>
                          </select>
                        </div>

                        {currentMenuKey === 'vedioLink' ? (
                          <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '10px', border: '1.5px solid #e2e8f0' }}>
                            <label style={{ fontSize: '12px', fontWeight: 800, color: '#0f172a', display: 'block', marginBottom: '8px' }}>
                              Video Source Option *
                            </label>
                            
                            {/* Toggle / Segmented Buttons */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                              <button
                                type="button"
                                onClick={() => setQuickLinkForm({ ...quickLinkForm, videoSource: 'url' })}
                                style={{
                                  padding: '9px 12px',
                                  borderRadius: '8px',
                                  border: quickLinkForm.videoSource === 'url' ? '2px solid #0284c7' : '1px solid #cbd5e1',
                                  background: quickLinkForm.videoSource === 'url' ? '#e0f2fe' : '#ffffff',
                                  color: quickLinkForm.videoSource === 'url' ? '#0369a1' : '#64748b',
                                  fontWeight: 800,
                                  fontSize: '12px',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '6px',
                                  transition: 'all 0.15s ease'
                                }}
                              >
                                <span>🔗</span>
                                <span>Online Video Link / URL</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => setQuickLinkForm({ ...quickLinkForm, videoSource: 'device' })}
                                style={{
                                  padding: '9px 12px',
                                  borderRadius: '8px',
                                  border: quickLinkForm.videoSource === 'device' ? '2px solid #0284c7' : '1px solid #cbd5e1',
                                  background: quickLinkForm.videoSource === 'device' ? '#e0f2fe' : '#ffffff',
                                  color: quickLinkForm.videoSource === 'device' ? '#0369a1' : '#64748b',
                                  fontWeight: 800,
                                  fontSize: '12px',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '6px',
                                  transition: 'all 0.15s ease'
                                }}
                              >
                                <span>📁</span>
                                <span>Upload Video from Device</span>
                              </button>
                            </div>

                            {quickLinkForm.videoSource === 'device' ? (
                              <div>
                                <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>
                                  Choose Video File from Device * (.mp4, .webm, .mov, .mkv)
                                </label>
                                <div className="file-upload-wrapper">
                                  <input 
                                    ref={quickLinkVideoFileInputRef}
                                    type="file" 
                                    accept="video/*, .mp4, .webm, .mov, .mkv, .avi, .m4v" 
                                    onChange={e => {
                                      const file = e.target.files && e.target.files[0];
                                      setQuickLinkForm({ ...quickLinkForm, videoFile: file || null });
                                      if (file) {
                                        setQuickLinkVideoPreview(URL.createObjectURL(file));
                                      } else {
                                        setQuickLinkVideoPreview(null);
                                      }
                                    }} 
                                  />
                                </div>
                                <small style={{ color: '#64748b', fontSize: '11px', marginTop: '4px', display: 'block' }}>
                                  Video file will be uploaded directly from your device and playable by users.
                                </small>

                                {/* Video preview / details */}
                                {(quickLinkVideoPreview || quickLinkForm.existingVideoUrl) && (
                                  <div style={{ marginTop: '10px', background: '#0f172a', borderRadius: '10px', padding: '10px', color: '#fff' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                                      <div style={{ fontSize: '12px', fontWeight: 700, color: '#38bdf8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '75%' }}>
                                        🎥 {quickLinkForm.videoFile ? quickLinkForm.videoFile.name : 'Current Device Video'}
                                      </div>
                                      {quickLinkForm.videoFile && (
                                        <span style={{ fontSize: '10px', color: '#94a3b8', background: '#1e293b', padding: '2px 6px', borderRadius: '4px' }}>
                                          {(quickLinkForm.videoFile.size / (1024 * 1024)).toFixed(1)} MB
                                        </span>
                                      )}
                                    </div>
                                    <video 
                                      src={quickLinkVideoPreview || (quickLinkForm.existingVideoUrl ? (quickLinkForm.existingVideoUrl.startsWith('http') ? quickLinkForm.existingVideoUrl : `${API_URL}${quickLinkForm.existingVideoUrl}`) : '')} 
                                      controls 
                                      style={{ width: '100%', maxHeight: '180px', borderRadius: '6px', background: '#000' }} 
                                    />
                                    <button 
                                      type="button" 
                                      onClick={() => {
                                        setQuickLinkForm({ ...quickLinkForm, videoFile: null, existingVideoUrl: '' });
                                        setQuickLinkVideoPreview(null);
                                        if (quickLinkVideoFileInputRef.current) quickLinkVideoFileInputRef.current.value = '';
                                      }}
                                      style={{ marginTop: '6px', background: '#fee2e2', color: '#dc2626', border: 'none', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                                    >
                                      ✕ Remove Video
                                    </button>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div>
                                <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>
                                  Video URL *
                                </label>
                                <input 
                                  type="text" 
                                  placeholder="e.g. https://youtube.com/watch?v=... or https://..." 
                                  value={quickLinkForm.url} 
                                  onChange={e => setQuickLinkForm({ ...quickLinkForm, url: e.target.value })} 
                                />
                                <small style={{ color: '#64748b', fontSize: '11px', marginTop: '2px', display: 'block' }}>
                                  Enter YouTube, Vimeo, or web hosted video link.
                                </small>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div>
                            <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>Link / Video URL *</label>
                            <input 
                              type="text" 
                              placeholder="e.g. https://tin.tin.nsdl.com or https://youtube.com/..." 
                              value={quickLinkForm.url} 
                              onChange={e => setQuickLinkForm({ ...quickLinkForm, url: e.target.value })} 
                            />
                          </div>
                        )}

                        <div>
                          <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>Emoji / Fallback Icon Symbol</label>
                          <input 
                            type="text" 
                            placeholder="e.g. 🔄 or 📄 or 🎥 or 🔗" 
                            value={quickLinkForm.icon} 
                            onChange={e => setQuickLinkForm({ ...quickLinkForm, icon: e.target.value })} 
                          />
                        </div>

                        <div>
                          <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>Visiting Fee (₹)</label>
                          <input 
                            type="number" 
                            min="0"
                            step="any"
                            placeholder="e.g. 0 for Free, or 20" 
                            value={quickLinkForm.fee} 
                            onChange={e => setQuickLinkForm({ ...quickLinkForm, fee: e.target.value })} 
                          />
                          <small style={{ color: '#64748b', fontSize: '11px', marginTop: '2px', display: 'block' }}>
                            Visiting fee amount (leave 0 or empty for Free). Deducted from user's wallet when they access this link.
                          </small>
                        </div>

                        <div>
                          <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>Square Icon Photo / Logo (Square Shape)</label>
                          <div className="file-upload-wrapper">
                            <input 
                              ref={quickLinkFileInputRef}
                              type="file" 
                              accept="image/*, .png, .jpg, .jpeg, .webp, .svg, .gif, .avif, .bmp, .ico, .tiff, .tif, .heic, .heif" 
                              onChange={e => {
                                const file = e.target.files && e.target.files[0];
                                setQuickLinkForm({ ...quickLinkForm, imgFile: file || null });
                                if (file) {
                                  setQuickLinkPreview(URL.createObjectURL(file));
                                } else {
                                  setQuickLinkPreview(null);
                                }
                              }} 
                            />
                          </div>
                          <small style={{ color: '#64748b', fontSize: '11px', marginTop: '4px', display: 'block' }}>
                            Square icon photo will display in the square box on User Panel (Available links).
                          </small>

                          {/* Square Photo Preview Box */}
                          {quickLinkPreview && (
                            <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '14px', background: '#f8fafc', padding: '10px 14px', borderRadius: '12px', border: '1.5px solid #cbd5e1' }}>
                              <div style={{ width: '64px', height: '64px', borderRadius: '14px', overflow: 'hidden', border: '2.5px solid #0284c7', boxShadow: '0 4px 12px rgba(2, 132, 199, 0.2)', flexShrink: 0, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <img src={quickLinkPreview} alt="Square Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>✓ Square Photo Selected</div>
                                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>This square photo will appear on the User Panel icon card.</div>
                                <button 
                                  type="button" 
                                  onClick={() => {
                                    setQuickLinkForm({ ...quickLinkForm, imgFile: null });
                                    setQuickLinkPreview(null);
                                    if (quickLinkFileInputRef.current) quickLinkFileInputRef.current.value = '';
                                  }}
                                  style={{ marginTop: '6px', background: '#fee2e2', color: '#dc2626', border: 'none', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                                >
                                  ✕ Remove Photo
                                </button>
                              </div>
                            </div>
                          )}
                        </div>

                        <button 
                          className="modern-submit-btn" 
                          onClick={addQuickLink} 
                          disabled={quickLinkSubmitting}
                          style={{ 
                            marginTop: '12px', 
                            padding: '12px', 
                            fontWeight: 800,
                            opacity: quickLinkSubmitting ? 0.7 : 1,
                            cursor: quickLinkSubmitting ? 'not-allowed' : 'pointer'
                          }}
                        >
                          {quickLinkSubmitting 
                            ? '⏳ Uploading Photo & Saving...' 
                            : (editingQuickLinkId ? `💾 Update ${currentLinkMenu.label}` : `➕ Add ${currentLinkMenu.label}`)}
                        </button>
                        {editingQuickLinkId && (
                          <button 
                            className="modern-submit-btn" 
                            style={{ background: '#64748b', marginTop: '6px' }} 
                            onClick={() => {
                              setEditingQuickLinkId(null);
                              setQuickLinkForm({ title: '', url: '', category: 'link', icon: '🔗', fee: '', imgFile: null });
                              setQuickLinkPreview(null);
                              if (quickLinkFileInputRef.current) quickLinkFileInputRef.current.value = '';
                            }}
                          >
                            Cancel Edit
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                  <div className="admin-card list-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <h3 style={{ margin: 0 }}>Available {currentLinkMenu.label}</h3>
                        <span style={{ background: '#0284c7', color: 'white', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 800 }}>
                          {quickLinks.length}
                        </span>
                      </div>
                      <small style={{ color: '#64748b', fontWeight: 600 }}>Drag ☰ to reorder</small>
                    </div>
                    <div className="modern-list">
                      {quickLinks.length === 0 ? (
                        <div style={{ padding: '50px 20px', textAlign: 'center', color: '#94a3b8' }}>
                          <div style={{ fontSize: '32px', marginBottom: '10px' }}>{currentLinkMenu.icon || '🔗'}</div>
                          <div style={{ fontWeight: 700, fontSize: '15px' }}>No {currentLinkMenu.label} Added Yet</div>
                          <div style={{ fontSize: '12px', marginTop: '4px' }}>Add links and services from the form on the left.</div>
                        </div>
                      ) : (
                        quickLinks.map((link, index) => (
                          <div 
                            className="list-item" 
                            key={link._id}
                            draggable
                            onDragStart={() => handleDragStart(index)}
                            onDragEnter={(e) => handleDragEnter(e, index, quickLinks, setQuickLinks)}
                            onDragEnd={() => handleDragEnd('quick-links', quickLinks)}
                            onDragOver={(e) => e.preventDefault()}
                            style={{ cursor: 'grab', display: 'flex', alignItems: 'center', gap: '14px', padding: '12px 14px' }}
                          >
                            <div style={{ color: '#9ca3af', fontSize: '18px', cursor: 'grab' }} title="Drag to reorder">☰</div>
                            
                            {/* Square Thumbnail Preview matching User Panel */}
                            <div style={{
                              width: '48px',
                              height: '48px',
                              borderRadius: '12px',
                              background: 'linear-gradient(145deg, #f8fafc, #e2e8f0)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              overflow: 'hidden',
                              border: '2px solid #cbd5e1',
                              boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
                              flexShrink: 0
                            }}>
                              {link.img ? (
                                <img src={link.img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              ) : (
                                <span style={{ fontSize: '24px' }}>{link.icon || currentLinkMenu.icon || '🔗'}</span>
                              )}
                            </div>

                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 800, fontSize: '14px', color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {link.title}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                                <span style={{
                                  fontSize: '10px',
                                  fontWeight: 800,
                                  padding: '2px 7px',
                                  borderRadius: '6px',
                                  background: link.category === 'video' ? '#fef2f2' : link.category === 'service' ? '#f5f3ff' : '#f0fdf4',
                                  color: link.category === 'video' ? '#dc2626' : link.category === 'service' ? '#7c3aed' : '#15803d',
                                  border: `1px solid ${link.category === 'video' ? '#fca5a5' : link.category === 'service' ? '#ddd6fe' : '#bbf7d0'}`
                                }}>
                                  {link.category === 'video' ? '🎥 VIDEO' : link.category === 'service' ? '⚙️ SERVICE' : '🔗 LINK'}
                                </span>
                                {Number(link.fee) > 0 ? (
                                  <span style={{
                                    fontSize: '10px',
                                    fontWeight: 800,
                                    padding: '2px 7px',
                                    borderRadius: '6px',
                                    background: '#fef3c7',
                                    color: '#b45309',
                                    border: '1px solid #fde68a'
                                  }}>
                                    💰 ₹{link.fee} FEE
                                  </span>
                                ) : (
                                  <span style={{
                                    fontSize: '10px',
                                    fontWeight: 800,
                                    padding: '2px 7px',
                                    borderRadius: '6px',
                                    background: '#f1f5f9',
                                    color: '#64748b',
                                    border: '1px solid #e2e8f0'
                                  }}>
                                    FREE
                                  </span>
                                )}
                                {(link.videoSource === 'device' || link.videoFile) && (
                                  <span style={{
                                    fontSize: '10px',
                                    fontWeight: 800,
                                    padding: '2px 7px',
                                    borderRadius: '6px',
                                    background: '#eff6ff',
                                    color: '#1d4ed8',
                                    border: '1px solid #bfdbfe'
                                  }}>
                                    📁 DEVICE VIDEO
                                  </span>
                                )}
                                <a 
                                  href={link.url ? (link.url.startsWith('http') ? link.url : `${API_URL}${link.url.startsWith('/') ? '' : '/'}${link.url}`) : '#'} 
                                  target="_blank" 
                                  rel="noreferrer" 
                                  style={{ fontSize: '12px', color: '#0284c7', textDecoration: 'none', maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}
                                  title={link.url}
                                >
                                  {(link.videoSource === 'device' && link.videoFile) ? (link.videoFile.split('/').pop() || link.url) : link.url}
                                </a>
                              </div>
                            </div>

                            <div className="item-actions" style={{ display: 'flex', gap: '8px' }}>
                              {hasStaffActionAccess('quickLinks.edit') && (
                                <button 
                                  className="modern-edit-btn" 
                                  onClick={() => startEditQuickLink(link)} 
                                  style={{ background: '#0284c7', color: 'white', border: 'none', padding: '7px 14px', borderRadius: '7px', cursor: 'pointer', fontSize: '12px', fontWeight: 700 }}
                                >
                                  Edit
                                </button>
                              )}
                              {hasStaffActionAccess('quickLinks.delete') && (
                                <button 
                                  className="modern-delete-btn" 
                                  onClick={async () => {
                                    await deleteItem(`${API_URL}/api/quick-links`, link._id);
                                    apiFetch(`/api/quick-links?menuKey=${currentMenuKey}`).then(r => r.json()).then(d => {
                                      setQuickLinks(filterLinksByMenuKey(d, currentMenuKey));
                                    }).catch(() => {});
                                  }}
                                  style={{ background: '#ef4444', color: 'white', border: 'none', padding: '7px 14px', borderRadius: '7px', cursor: 'pointer', fontSize: '12px', fontWeight: 700 }}
                                >
                                  Delete
                                </button>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                {/* Add / Edit Dynamic Menu Modal */}
                {showDynamicMenuModal && (
                  <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(15, 23, 42, 0.65)',
                    backdropFilter: 'blur(5px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 99999,
                    padding: '20px'
                  }}>
                    <div style={{
                      backgroundColor: '#ffffff',
                      borderRadius: '18px',
                      width: '100%',
                      maxWidth: '480px',
                      boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                      overflow: 'hidden',
                      border: '1px solid #e2e8f0',
                      animation: 'modalSlideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
                    }}>
                      <div style={{
                        padding: '18px 24px',
                        borderBottom: '1px solid #f1f5f9',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ fontSize: '22px' }}>{editingDynamicMenu ? '✏️' : '✨'}</span>
                          <div>
                            <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#0f172a' }}>
                              {editingDynamicMenu ? `Edit "${editingDynamicMenu.label}"` : 'Add New Dynamic Menu'}
                            </h3>
                            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                              {editingDynamicMenu ? 'Update title and icon for this menu' : 'Create a new dynamic service portal for users'}
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowDynamicMenuModal(false)}
                          style={{
                            background: '#f1f5f9',
                            border: 'none',
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#64748b',
                            fontSize: '15px',
                            fontWeight: 700
                          }}
                        >
                          ✕
                        </button>
                      </div>

                      <form onSubmit={handleSaveDynamicMenu} style={{ padding: '22px 24px' }}>
                        <div style={{ marginBottom: '16px' }}>
                          <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                            Menu Title / Name *
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. EXAM RESULTS or RATION CARD"
                            value={dynamicMenuForm.label}
                            onChange={(e) => setDynamicMenuForm({ ...dynamicMenuForm, label: e.target.value })}
                            style={{
                              width: '100%',
                              padding: '11px 14px',
                              borderRadius: '10px',
                              border: '1.5px solid #cbd5e1',
                              fontSize: '14px',
                              fontWeight: 600,
                              outline: 'none',
                              boxSizing: 'border-box'
                            }}
                            autoFocus
                            required
                          />
                          <small style={{ fontSize: '11px', color: '#64748b', marginTop: '4px', display: 'block' }}>
                            This name will display in the Admin Dynamic Menus tabs and the User Panel sidebar.
                          </small>
                        </div>

                        <div style={{ marginBottom: '20px' }}>
                          <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                            Icon (Emoji / Symbol)
                          </label>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <input
                              type="text"
                              value={dynamicMenuForm.icon}
                              onChange={(e) => setDynamicMenuForm({ ...dynamicMenuForm, icon: e.target.value })}
                              style={{
                                width: '70px',
                                textAlign: 'center',
                                padding: '10px',
                                fontSize: '20px',
                                borderRadius: '10px',
                                border: '1.5px solid #cbd5e1',
                                outline: 'none'
                              }}
                            />
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                              {['🌐', '📋', '💼', '📊', '🏛️', '📦', '🎓', '🛠️', '🎫', '⚡'].map(ic => (
                                <button
                                  type="button"
                                  key={ic}
                                  onClick={() => setDynamicMenuForm({ ...dynamicMenuForm, icon: ic })}
                                  style={{
                                    fontSize: '16px',
                                    padding: '6px 10px',
                                    borderRadius: '8px',
                                    border: dynamicMenuForm.icon === ic ? '1.5px solid #0284c7' : '1px solid #e2e8f0',
                                    background: dynamicMenuForm.icon === ic ? '#e0f2fe' : '#ffffff',
                                    cursor: 'pointer'
                                  }}
                                >
                                  {ic}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '24px', paddingTop: '16px', borderTop: '1px solid #f1f5f9' }}>
                          <button
                            type="button"
                            onClick={() => setShowDynamicMenuModal(false)}
                            style={{
                              padding: '10px 18px',
                              borderRadius: '10px',
                              border: '1px solid #cbd5e1',
                              background: '#ffffff',
                              color: '#475569',
                              fontWeight: 700,
                              fontSize: '13px',
                              cursor: 'pointer'
                            }}
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={isSavingDynamicMenu}
                            style={{
                              padding: '10px 22px',
                              borderRadius: '10px',
                              border: 'none',
                              background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                              color: '#ffffff',
                              fontWeight: 800,
                              fontSize: '13px',
                              cursor: isSavingDynamicMenu ? 'not-allowed' : 'pointer',
                              boxShadow: '0 4px 12px rgba(2, 132, 199, 0.3)'
                            }}
                          >
                            {isSavingDynamicMenu ? 'Saving...' : (editingDynamicMenu ? 'Update Menu' : 'Create Dynamic Menu')}
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Separate Service Logs Tabs */}
          {activeTab === 'panServiceLogs' && <ServiceLogsPanel service="pan" />}
          {activeTab === 'offlineServiceLogs' && <ServiceLogsPanel service="offline" />}
          {activeTab === 'quickLinkServiceLogs' && <ServiceLogsPanel service="quickLinks" />}

          {/* Retailer PAN Card Submissions Tab */}
          {activeTab === 'panSubmissions' && (
            <div className="admin-panel-grid" style={{ gridTemplateColumns: '1fr', gap: '20px' }}>
              
              {/* Sleek Header & KPI Summary Badges Bar */}
              <div className="admin-card" style={{ background: '#fff', borderRadius: '14px', padding: '18px 24px', border: '1px solid #e2e8f0', boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: '#eff6ff', color: '#1d4ed8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px' }}>
                      📇
                    </div>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '19px', fontWeight: 800, color: '#0f172a' }}>
                        Retailer PAN Card Submissions
                      </h3>
                      <p style={{ margin: '2px 0 0', fontSize: '12.5px', color: '#64748b' }}>
                        Real-time Retailer PAN form filings, status tracking, Form 49A PDF downloads, and approval management.
                      </p>
                    </div>
                  </div>

                  {/* Summary Metric Pills & Refresh Button */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    {(() => {
                      const allApps = panSubmissionsData.applications || [];
                      const activeApps = panRetailerFilter === 'All'
                        ? allApps
                        : allApps.filter(a => (a.userId || '').toLowerCase() === panRetailerFilter.toLowerCase());

                      const totalCnt = activeApps.length;
                      const pendingCnt = activeApps.filter(a => (a.status || 'Submitted').toLowerCase() === 'submitted' || (a.status || '').toLowerCase() === 'in progress').length;
                      const approvedCnt = activeApps.filter(a => (a.status || '').toLowerCase() === 'approved' || (a.status || '').toLowerCase() === 'completed').length;
                      const rejectedCnt = activeApps.filter(a => (a.status || '').toLowerCase() === 'rejected').length;

                      return (
                        <>
                          <div style={{ padding: '6px 14px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '20px', fontSize: '12px', color: '#334155' }}>
                            Total Forms: <strong>{totalCnt}</strong>
                          </div>
                          <div style={{ padding: '6px 14px', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '20px', fontSize: '12px', color: '#92400e' }}>
                            Pending/Submitted: <strong>{pendingCnt}</strong>
                          </div>
                          <div style={{ padding: '6px 14px', background: '#dcfce7', border: '1px solid #86efac', borderRadius: '20px', fontSize: '12px', color: '#166534' }}>
                            Approved: <strong>{approvedCnt}</strong>
                          </div>
                          <div style={{ padding: '6px 14px', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '20px', fontSize: '12px', color: '#991b1b' }}>
                            Rejected: <strong>{rejectedCnt}</strong>
                          </div>
                        </>
                      );
                    })()}

                    <button
                      onClick={fetchAll}
                      style={{ padding: '8px 16px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 2px 6px rgba(37,99,235,0.2)' }}
                    >
                      🔄 Refresh
                    </button>
                  </div>
                </div>
              </div>

              {/* RETAILER-WISE SUBMISSIONS BREAKDOWN SUMMARY TABLE */}
              <div className="admin-card" style={{ background: 'white', borderRadius: '14px', padding: '20px 24px', border: '1px solid #e2e8f0', boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>🏪</span> Retailer Submission Breakdown
                    </h4>
                  </div>
                  {panRetailerFilter !== 'All' && (
                    <button
                      onClick={() => setPanRetailerFilter('All')}
                      style={{ padding: '4px 12px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}
                    >
                      Clear Retailer Filter ({panRetailerFilter})
                    </button>
                  )}
                </div>

                {(() => {
                  const combinedBreakdownRetailers = (() => {
                    const existingMap = {};
                    (panSubmissionsData.retailers || []).forEach(ret => {
                      existingMap[ret.userId.toLowerCase()] = { ...ret };
                    });

                    (users || []).forEach(u => {
                      const uId = (u.userId || '').trim();
                      if (!uId) return;
                      const key = uId.toLowerCase();
                      if (!existingMap[key]) {
                        const userApps = (panSubmissionsData.applications || []).filter(a =>
                          (a.userId || '').toLowerCase() === key ||
                          (u.mobile && a.mobileNumber && u.mobile === a.mobileNumber)
                        );
                        existingMap[key] = {
                          userId: uId,
                          totalCount: userApps.length,
                          manualCount: userApps.filter(a => (a.applicationType || '').toLowerCase().includes('manual')).length,
                          ekycCount: userApps.filter(a => !(a.applicationType || '').toLowerCase().includes('manual') && !(a.applicationType || '').toLowerCase().includes('correction')).length,
                          correctionCount: userApps.filter(a => (a.applicationType || '').toLowerCase().includes('correction')).length,
                          latestSubmission: userApps.length > 0 ? userApps[0].createdAt : null,
                          mobile: u.mobile || ''
                        };
                      } else {
                        if (u.mobile) existingMap[key].mobile = u.mobile;
                      }
                    });

                    return Object.values(existingMap).sort((a, b) => b.totalCount - a.totalCount);
                  })();

                  if (combinedBreakdownRetailers.length === 0) {
                    return (
                      <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                        No retailer PAN submissions recorded.
                      </div>
                    );
                  }

                  return (
                    <div style={{ overflowX: 'auto', maxHeight: '220px', overflowY: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                        <thead>
                          <tr style={{ background: '#f8fafc', color: '#475569', borderBottom: '2px solid #e2e8f0', textAlign: 'left', position: 'sticky', top: 0, zIndex: 5 }}>
                            <th style={{ padding: '10px 14px', fontWeight: 700 }}>Retailer User ID</th>
                            <th style={{ padding: '10px 14px', fontWeight: 700, textAlign: 'center' }}>Total Submitted</th>
                            <th style={{ padding: '10px 14px', fontWeight: 700, textAlign: 'center' }}>Manual PAN</th>
                            <th style={{ padding: '10px 14px', fontWeight: 700, textAlign: 'center' }}>Aadhaar OTP PAN</th>
                            <th style={{ padding: '10px 14px', fontWeight: 700, textAlign: 'center' }}>Correction</th>
                            <th style={{ padding: '10px 14px', fontWeight: 700 }}>Latest Submission</th>
                            <th style={{ padding: '10px 14px', fontWeight: 700, textAlign: 'center' }}>Filter Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {combinedBreakdownRetailers.map((ret) => (
                            <tr key={ret.userId} style={{ borderBottom: '1px solid #f1f5f9', background: panRetailerFilter.toLowerCase() === ret.userId.toLowerCase() ? '#eff6ff' : 'transparent' }}>
                              <td style={{ padding: '10px 14px', fontWeight: 700, color: '#1d4ed8' }}>
                                <div>👤 {ret.userId}</div>
                                {ret.mobile && (
                                  <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 400 }}>
                                    📞 {ret.mobile}
                                  </div>
                                )}
                              </td>
                              <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                                <span style={{ padding: '2px 10px', background: ret.totalCount > 0 ? '#dbeafe' : '#f1f5f9', color: ret.totalCount > 0 ? '#1e40af' : '#64748b', borderRadius: '12px', fontWeight: 800, fontSize: '13px' }}>
                                  {ret.totalCount}
                                </span>
                              </td>
                              <td style={{ padding: '10px 14px', textAlign: 'center', color: '#475569', fontWeight: 600 }}>
                                {ret.manualCount}
                              </td>
                              <td style={{ padding: '10px 14px', textAlign: 'center', color: '#475569', fontWeight: 600 }}>
                                {ret.ekycCount}
                              </td>
                              <td style={{ padding: '10px 14px', textAlign: 'center', color: '#475569', fontWeight: 600 }}>
                                {ret.correctionCount}
                              </td>
                              <td style={{ padding: '10px 14px', color: '#64748b', fontSize: '12px' }}>
                                {ret.latestSubmission ? new Date(ret.latestSubmission).toLocaleString() : 'No submissions yet'}
                              </td>
                              <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                                <button
                                  onClick={() => setPanRetailerFilter(ret.userId)}
                                  style={{
                                    padding: '4px 12px',
                                    background: panRetailerFilter.toLowerCase() === ret.userId.toLowerCase() ? '#1d4ed8' : '#f1f5f9',
                                    color: panRetailerFilter.toLowerCase() === ret.userId.toLowerCase() ? 'white' : '#334155',
                                    border: 'none',
                                    borderRadius: '6px',
                                    fontSize: '11.5px',
                                    fontWeight: 'bold',
                                    cursor: 'pointer'
                                  }}
                                >
                                  {panRetailerFilter.toLowerCase() === ret.userId.toLowerCase() ? '✓ Active Filter' : '🔍 Filter Submissions'}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
              </div>

              {/* ALL SUBMITTED PAN APPLICATIONS TABLE WITH SEARCH & FILTERS & SCROLLABLE VIEW */}
              <div className="admin-card" style={{ background: 'white', borderRadius: '14px', padding: '20px 24px', border: '1px solid #e2e8f0', boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>📄</span> Detailed PAN Applications
                    </h4>
                  </div>
                </div>

                {/* FILTER & GENERATE REPORT card — matches Ledger style */}
                <div className="ledger-filter-card" style={{ marginBottom: '18px' }}>
                  <div
                    className="ledger-filter-header"
                    onClick={() => setPanShowFilters(v => !v)}
                  >
                    <div className="ledger-filter-title">🔍 FILTER &amp; GENERATE REPORT</div>
                    <div className="ledger-filter-chevron">{panShowFilters ? '▲' : '▼'}</div>
                  </div>

                  {panShowFilters && (
                    <div className="ledger-filter-content">
                      <div className="ledger-filter-grid">

                        <div className="ledger-field-group">
                          <label>Retailer User ID</label>
                          <select
                            className="ledger-filter-input"
                            value={panRetailerFilter}
                            onChange={(e) => setPanRetailerFilter(e.target.value)}
                          >
                            {(() => {
                              const allRetailerIds = Array.from(new Set([
                                ...(panSubmissionsData.retailers || []).map(r => r.userId),
                                ...(users || []).map(u => u.userId)
                              ])).filter(Boolean).sort();

                              return (
                                <>
                                  <option value="All">All Retailers ({allRetailerIds.length})</option>
                                  {allRetailerIds.map(uId => {
                                    const userObj = (users || []).find(u => (u.userId || '').toLowerCase() === uId.toLowerCase());
                                    const label = userObj?.mobile ? `${uId} (📞 ${userObj.mobile})` : uId;
                                    return <option key={uId} value={uId}>{label}</option>;
                                  })}
                                </>
                              );
                            })()}
                          </select>
                        </div>

                        <div className="ledger-field-group">
                          <label>Start Date</label>
                          <input
                            type="date"
                            className="ledger-filter-input"
                            value={panStartDate}
                            onChange={(e) => { setPanStartDate(e.target.value); setPanPage(1); }}
                          />
                        </div>

                        <div className="ledger-field-group">
                          <label>End Date</label>
                          <input
                            type="date"
                            className="ledger-filter-input"
                            value={panEndDate}
                            onChange={(e) => { setPanEndDate(e.target.value); setPanPage(1); }}
                          />
                        </div>

                        <div className="ledger-field-group">
                          <label>Specific Month</label>
                          <input
                            type="month"
                            className="ledger-filter-input"
                            value={panMonth}
                            onChange={(e) => { setPanMonth(e.target.value); setPanPage(1); }}
                          />
                        </div>

                        <div className="ledger-field-group">
                          <label>Status</label>
                          <select
                            className="ledger-filter-input"
                            value={panStatusFilter}
                            onChange={(e) => { setPanStatusFilter(e.target.value); setPanPage(1); }}
                          >
                            <option value="All">All Statuses</option>
                            <option value="Submitted">Submitted</option>
                            <option value="In Progress">In Progress</option>
                            <option value="Approved">Approved</option>
                            <option value="Completed">Completed</option>
                            <option value="Rejected">Rejected</option>
                          </select>
                        </div>

                        <div className="ledger-field-group">
                          <label>Search Keywords</label>
                          <input
                            type="text"
                            className="ledger-filter-input"
                            placeholder="Ack No, Name, Mobile, Aadhaar..."
                            value={panSearchQuery}
                            onChange={(e) => { setPanSearchQuery(e.target.value); setPanPage(1); }}
                          />
                        </div>

                        <div className="ledger-field-group">
                          <label>Items Per Page</label>
                          <select
                            className="ledger-filter-input"
                            value={panPageSize}
                            onChange={(e) => { setPanPageSize(Number(e.target.value)); setPanPage(1); }}
                          >
                            <option value={10}>10 per page</option>
                            <option value={25}>25 per page</option>
                            <option value={50}>50 per page</option>
                            <option value={100}>100 per page</option>
                          </select>
                        </div>

                      </div>

                      <div className="ledger-filter-actions-row" style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          style={{
                            padding: '8px 16px',
                            background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '8px',
                            fontSize: '12.5px',
                            fontWeight: '700',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            boxShadow: '0 2px 6px rgba(37,99,235,0.2)'
                          }}
                          onClick={() => {
                            const todayStr = new Date().toISOString().split('T')[0];
                            setPanStartDate(todayStr);
                            setPanEndDate(todayStr);
                            setPanMonth('');
                            setPanPage(1);
                          }}
                        >
                          📅 Today's Applications
                        </button>

                        <button
                          type="button"
                          className="ledger-btn-reset"
                          onClick={() => {
                            setPanRetailerFilter('All');
                            setPanStatusFilter('All');
                            setPanStartDate('');
                            setPanEndDate('');
                            setPanMonth('');
                            setPanSearchQuery('');
                            setPanPage(1);
                          }}
                        >
                          Reset Filters
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Table Data Render with fixed max height and sticky header for 100+ items */}
                {(() => {
                  let filtered = panSubmissionsData.applications || [];

                  if (panRetailerFilter !== 'All') {
                    filtered = filtered.filter(app => (app.userId || '').toLowerCase() === panRetailerFilter.toLowerCase());
                  }

                  if (panStatusFilter !== 'All') {
                    filtered = filtered.filter(app => (app.status || 'Submitted').toLowerCase() === panStatusFilter.toLowerCase());
                  }

                  // Date range filter
                  if (panStartDate) {
                    const start = new Date(panStartDate);
                    start.setHours(0, 0, 0, 0);
                    filtered = filtered.filter(app => new Date(app.createdAt) >= start);
                  }
                  if (panEndDate) {
                    const end = new Date(panEndDate);
                    end.setHours(23, 59, 59, 999);
                    filtered = filtered.filter(app => new Date(app.createdAt) <= end);
                  }

                  // Specific month filter (YYYY-MM)
                  if (panMonth) {
                    filtered = filtered.filter(app => {
                      const d = new Date(app.createdAt);
                      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                      return ym === panMonth;
                    });
                  }

                  if (panSearchQuery.trim()) {
                    const q = panSearchQuery.toLowerCase();
                    filtered = filtered.filter(app =>
                      (app.ackNumber || '').toLowerCase().includes(q) ||
                      (app.userId || '').toLowerCase().includes(q) ||
                      (app.applicantName || '').toLowerCase().includes(q) ||
                      getApplicantDisplayFullName(app).toLowerCase().includes(q) ||
                      (app.mobileNumber || '').toLowerCase().includes(q) ||
                      (app.email || '').toLowerCase().includes(q) ||
                      (app.aadhaarNumber || '').toLowerCase().includes(q)
                    );
                  }

                  if (filtered.length === 0) {
                    return (
                      <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: '13.5px' }}>
                        No PAN applications match the selected search & filters.
                      </div>
                    );
                  }

                  const totalPages = Math.ceil(filtered.length / panPageSize) || 1;
                  const currentPage = Math.min(panPage, totalPages);
                  const startIndex = (currentPage - 1) * panPageSize;
                  const paginated = filtered.slice(startIndex, startIndex + panPageSize);

                  return (
                    <div>
                      <div style={{ overflowX: 'auto', maxHeight: '550px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '10px' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                          <thead>
                            <tr style={{ background: '#f8fafc', color: '#334155', borderBottom: '2px solid #e2e8f0', textAlign: 'left', position: 'sticky', top: 0, zIndex: 10 }}>
                              <th style={{ padding: '10px 12px', fontWeight: 700 }}>Ack Number</th>
                              <th style={{ padding: '10px 12px', fontWeight: 700 }}>User ID</th>
                              <th style={{ padding: '10px 12px', fontWeight: 700 }}>Service Type</th>
                              <th style={{ padding: '10px 12px', fontWeight: 700 }}>Applicant Name</th>
                              <th style={{ padding: '10px 12px', fontWeight: 700 }}>Contact Info</th>
                              <th style={{ padding: '10px 12px', fontWeight: 700 }}>Date Submitted</th>
                              <th style={{ padding: '10px 12px', fontWeight: 700, textAlign: 'center' }}>Status</th>
                              <th style={{ padding: '10px 12px', fontWeight: 700, textAlign: 'center' }}>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {paginated.map(app => {
                              const st = app.status || 'Submitted';
                              let stBg = '#fef9c3', stFg = '#854d0e';
                              if (st === 'Approved' || st === 'Completed') { stBg = '#dcfce7'; stFg = '#166534'; }
                              else if (st === 'Rejected') { stBg = '#fee2e2'; stFg = '#991b1b'; }
                              else if (st === 'In Progress') { stBg = '#e0f2fe'; stFg = '#0369a1'; }

                              return (
                                <tr
                                  key={app._id}
                                  onClick={() => setSelectedPanAppForModal(app)}
                                  style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer', transition: 'background 0.15s ease' }}
                                  onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
                                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                  title="Click row to view full application details"
                                >
                                  <td style={{ padding: '10px 12px', fontWeight: 700, fontFamily: 'monospace', color: '#0f172a' }}>
                                    {app.ackNumber}
                                  </td>
                                  <td style={{ padding: '10px 12px', fontWeight: 600, color: '#1d4ed8' }}>
                                    <span style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', padding: '3px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: 800, fontFamily: 'monospace' }}>
                                      👤 {app.userId}
                                    </span>
                                    {(() => {
                                      const retUser = (users || []).find(u =>
                                        (u.userId || '').toLowerCase() === (app.userId || '').toLowerCase() ||
                                        (u.retailerId || '').toLowerCase() === (app.userId || '').toLowerCase() ||
                                        (u.mobile && app.mobileNumber && u.mobile === app.mobileNumber)
                                      );
                                      if (!retUser) return null;
                                      return (
                                        <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 500, marginTop: '3px' }}>
                                          {retUser.mobile && <div>📞 {retUser.mobile}</div>}
                                        </div>
                                      );
                                    })()}
                                  </td>
                                  <td style={{ padding: '10px 12px', color: '#475569', fontWeight: 600 }}>
                                    {app.applicationType}
                                  </td>
                                  <td style={{ padding: '10px 12px', fontWeight: 700, color: '#1e293b' }}>
                                    {getApplicantDisplayFullName(app)}
                                    {app.dob && <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 400 }}>DOB: {app.dob}</div>}
                                  </td>
                                  <td style={{ padding: '10px 12px', color: '#475569' }}>
                                    <div>📞 {app.mobileNumber}</div>
                                    <div style={{ fontSize: '11px', color: '#64748b' }}>✉️ {app.email}</div>
                                  </td>
                                  <td style={{ padding: '10px 12px', color: '#64748b', fontSize: '11.5px' }}>
                                    {new Date(app.createdAt).toLocaleString()}
                                  </td>
                                  <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                    <span style={{ padding: '3px 9px', background: stBg, color: stFg, borderRadius: '10px', fontSize: '11px', fontWeight: 800 }}>
                                      {st}
                                    </span>
                                    {app.receiptUrl && (
                                      <div style={{ marginTop: '3px' }}>
                                        <span style={{ background: '#dcfce7', color: '#15803d', border: '1px solid #86efac', padding: '1px 7px', borderRadius: '8px', fontSize: '10px', fontWeight: '800', display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                                          📄 Receipt Sent
                                        </span>
                                      </div>
                                    )}
                                    {app.adminRemarks && (
                                      <div style={{ fontSize: '10.5px', color: '#64748b', fontStyle: 'italic', marginTop: '2px' }}>
                                        "{app.adminRemarks}"
                                      </div>
                                    )}
                                  </td>
                                  <td style={{ padding: '10px 12px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                    <div style={{ display: 'inline-flex', gap: '5px', alignItems: 'center', justifyContent: 'center' }}>

                                      {/* Details Button */}
                                      {hasStaffActionAccess('panSubmissions.view') && (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedPanAppForModal(app);
                                          }}
                                          style={{ padding: '5px 9px', background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)', color: 'white', border: 'none', borderRadius: '5px', fontSize: '11.5px', cursor: 'pointer', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                                          title="View full application details & copy info"
                                        >
                                          <span>👁️</span> <span>Details</span>
                                        </button>
                                      )}

                                      {/* PDF Download Button */}
                                      {hasStaffActionAccess('panSubmissions.export') && (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleDownloadPdf(app);
                                          }}
                                          style={{ padding: '5px 9px', background: '#10b981', color: 'white', border: 'none', borderRadius: '5px', fontSize: '11.5px', cursor: 'pointer', fontWeight: 600 }}
                                          title="Download Pre-filled Form 49A PDF"
                                        >
                                          📥 PDF
                                        </button>
                                      )}

                                      {/* Retailer Uploaded Documents Button */}
                                      {hasStaffActionAccess('panSubmissions.docs') && (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleOpenPanDocuments(app);
                                          }}
                                          style={{ padding: '5px 9px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '5px', fontSize: '11.5px', cursor: 'pointer', fontWeight: 600 }}
                                          title="View documents uploaded by retailer"
                                        >
                                          📎 Documents
                                        </button>
                                      )}

                                      {/* Edit Status & Receipt Upload Modal Trigger */}
                                      {hasStaffActionAccess('panSubmissions.status') && (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setEditingPanAppStatus(app);
                                            setNewStatusVal(app.status || 'Submitted');
                                            setNewStatusRemarks(app.adminRemarks || '');
                                            setNewNsdlReceiptNumber(app.nsdlReceiptNumber || app.ackNumber || '');
                                            setNewReceiptFileUrl('');
                                          }}
                                          style={{ padding: '5px 9px', background: '#8b5cf6', color: 'white', border: 'none', borderRadius: '5px', fontSize: '11.5px', cursor: 'pointer', fontWeight: 600 }}
                                          title="Update Status & Upload Approved Receipt"
                                        >
                                          ✏️ Status
                                        </button>
                                      )}

                                      {/* Download/View Receipt if already uploaded OR Upload & Send Receipt button */}
                                      {hasStaffActionAccess('panSubmissions.receipt') && (
                                        app.receiptUrl ? (
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              window.open(app.receiptUrl, '_blank');
                                            }}
                                            style={{ padding: '5px 9px', background: '#059669', color: 'white', border: 'none', borderRadius: '5px', fontSize: '11.5px', cursor: 'pointer', fontWeight: 700 }}
                                            title="View approved receipt sent to retailer"
                                          >
                                            📄 View Receipt
                                          </button>
                                        ) : (
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setEditingPanAppStatus(app);
                                              setNewStatusVal(app.status === 'Submitted' ? 'Approved' : (app.status || 'Approved'));
                                              setNewStatusRemarks(app.adminRemarks || '');
                                              setNewNsdlReceiptNumber(app.nsdlReceiptNumber || app.ackNumber || '');
                                              setNewReceiptFileUrl('');
                                            }}
                                            style={{ padding: '5px 9px', background: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)', color: 'white', border: 'none', borderRadius: '5px', fontSize: '11.5px', cursor: 'pointer', fontWeight: 700 }}
                                            title={`Upload approved receipt PDF/Image to send to retailer (${app.userId})`}
                                          >
                                            📤 Send Receipt
                                          </button>
                                        )
                                      )}

                                      {/* Export Excel Button */}
                                      {hasStaffActionAccess('panSubmissions.export') && (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            exportSinglePanApplicationToExcel(app);
                                          }}
                                          style={{ padding: '5px 9px', background: 'linear-gradient(135deg, #16a34a, #15803d)', color: 'white', border: 'none', borderRadius: '5px', fontSize: '11.5px', cursor: 'pointer', fontWeight: 600 }}
                                          title="Download this application as Excel"
                                        >
                                          📊 Excel
                                        </button>
                                      )}

                                      {/* Delete Application Button */}
                                      {(userRole === 'admin') && (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleAdminDeletePanApp(app);
                                          }}
                                          style={{ padding: '5px 9px', background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: '5px', fontSize: '11.5px', cursor: 'pointer', fontWeight: 700 }}
                                          title="Delete PAN application"
                                        >
                                          🗑️ Delete
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

                      {/* Pagination Controls Footer */}
                      <div style={{
                        display: 'flex',
                        justify: 'space-between',
                        alignItems: 'center',
                        marginTop: '12px',
                        padding: '12px 16px',
                        background: '#f8fafc',
                        borderRadius: '10px',
                        border: '1px solid #e2e8f0',
                        flexWrap: 'wrap',
                        gap: '10px'
                      }}>
                        <div style={{ fontSize: '12.5px', color: '#475569', fontWeight: '600' }}>
                          Showing <strong>{filtered.length === 0 ? 0 : startIndex + 1}</strong> to <strong>{Math.min(startIndex + panPageSize, filtered.length)}</strong> of <strong>{filtered.length}</strong> submissions
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <button
                            type="button"
                            disabled={currentPage <= 1}
                            onClick={() => setPanPage(prev => Math.max(1, prev - 1))}
                            style={{
                              padding: '6px 12px',
                              borderRadius: '6px',
                              border: '1px solid #cbd5e1',
                              background: currentPage <= 1 ? '#f1f5f9' : '#ffffff',
                              color: currentPage <= 1 ? '#94a3b8' : '#1e293b',
                              fontWeight: '700',
                              fontSize: '12px',
                              cursor: currentPage <= 1 ? 'not-allowed' : 'pointer'
                            }}
                          >
                            ◀ Prev
                          </button>

                          <span style={{ fontSize: '12px', fontWeight: '700', color: '#334155', padding: '0 8px' }}>
                            Page {currentPage} of {totalPages}
                          </span>

                          <button
                            type="button"
                            disabled={currentPage >= totalPages}
                            onClick={() => setPanPage(prev => Math.min(totalPages, prev + 1))}
                            style={{
                              padding: '6px 12px',
                              borderRadius: '6px',
                              border: '1px solid #cbd5e1',
                              background: currentPage >= totalPages ? '#f1f5f9' : '#ffffff',
                              color: currentPage >= totalPages ? '#94a3b8' : '#1e293b',
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
                  );
                })()}
              </div>

            </div>
          )}

          {/* PAN Form Manager Tab */}
          {activeTab === 'panForms' && (
            <div className="admin-panel-grid" style={{ gridTemplateColumns: '1fr', gap: '20px' }}>
              <div className="pan-manager-card">
                
                {/* Manager Header Bar */}
                <div className="pan-manager-header-bar">
                  <div className="pan-manager-header-title">
                    <div className="pan-manager-title-icon">📝</div>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '20px', color: '#0f172a', fontWeight: 800, letterSpacing: '-0.3px' }}>
                        PAN Card Forms & Sub-Tabs Manager
                      </h3>
                      <p style={{ margin: '3px 0 0', fontSize: '13px', color: '#64748b' }}>
                        Manage dynamic service sub-tabs, application fees, instructions, and input fields for retailers.
                      </p>
                    </div>
                  </div>
                  {hasStaffActionAccess('panForms.editTab') && (
                    <button
                      onClick={() => handleSavePanTabsConfig()}
                      className="pan-save-all-btn"
                    >
                      <span>💾</span> Save All Form Changes
                    </button>
                  )}
                </div>

                {/* STEP 1: Select Active Service Sub-Tab */}
                <div className="pan-step-card">
                  <div className="pan-step-header">
                    <div className="pan-step-title-group">
                      <span className="pan-step-num-badge">1</span>
                      <h4 className="pan-step-title">STEP 1: Select PAN Sub-Tab to Configure</h4>
                    </div>
                    {hasStaffActionAccess('panForms.addTab') && (
                      <button
                        onClick={() => setShowAddTabModal(!showAddTabModal)}
                        className={`pan-create-tab-btn ${showAddTabModal ? 'is-open' : ''}`}
                      >
                        {showAddTabModal ? '❌ Close Form' : '➕ Create New Service Sub-Tab'}
                      </button>
                    )}
                  </div>

                  {/* Collapsible Create Sub-Tab Form */}
                  {showAddTabModal && hasStaffActionAccess('panForms.addTab') && (
                    <div className="pan-add-tab-panel">
                      <h5 style={{ margin: '0 0 14px', color: '#1d4ed8', fontSize: '15px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        ✨ Add a Brand New PAN Service Sub-Tab
                      </h5>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', marginBottom: '16px' }}>
                        <div>
                          <label className="pan-input-label">Tab Title / Label *</label>
                          <input
                            type="text"
                            placeholder="e.g. E-PAN Minor / Physical PAN"
                            value={newTabForm.label}
                            onChange={(e) => setNewTabForm({ ...newTabForm, label: e.target.value })}
                            className="pan-form-control"
                          />
                        </div>
                        <div>
                          <label className="pan-input-label">Icon Emoji</label>
                          <input
                            type="text"
                            placeholder="e.g. 👦 / 💳"
                            value={newTabForm.icon}
                            onChange={(e) => setNewTabForm({ ...newTabForm, icon: e.target.value })}
                            className="pan-form-control"
                          />
                        </div>
                        <div>
                          <label className="pan-input-label">Fee Amount (₹)</label>
                          <input
                            type="number"
                            placeholder="107"
                            value={newTabForm.fee}
                            onChange={(e) => setNewTabForm({ ...newTabForm, fee: e.target.value })}
                            className="pan-form-control pan-fee-input"
                          />
                        </div>
                        <div>
                          <label className="pan-input-label">Badge Header</label>
                          <input
                            type="text"
                            placeholder="e.g. Minor Application"
                            value={newTabForm.badge}
                            onChange={(e) => setNewTabForm({ ...newTabForm, badge: e.target.value })}
                            className="pan-form-control"
                          />
                        </div>
                        <div style={{ gridColumn: 'span 2' }}>
                          <label className="pan-input-label">Service Description</label>
                          <input
                            type="text"
                            placeholder="e.g. Application for minor below 18 years of age..."
                            value={newTabForm.description}
                            onChange={(e) => setNewTabForm({ ...newTabForm, description: e.target.value })}
                            className="pan-form-control"
                          />
                        </div>
                      </div>
                      <button
                        onClick={handleAddNewPanTab}
                        className="pan-save-all-btn"
                        style={{ padding: '10px 20px', fontSize: '13px' }}
                      >
                        ➕ Save & Add New Tab
                      </button>
                    </div>
                  )}

                  {/* Active Tabs Selection Pill Bar */}
                  <div className="pan-subtabs-grid">
                    {panTabsConfigList.map(tab => {
                      const isActive = selectedPanTabId === tab.id;
                      return (
                        <div
                          key={tab.id}
                          className={`pan-subtab-pill ${isActive ? 'active' : ''}`}
                          onClick={() => setSelectedPanTabId(tab.id)}
                        >
                          <span className="pan-subtab-icon">{tab.icon || '💳'}</span>
                          <span>{tab.label}</span>
                          <span className="pan-subtab-fields-badge">
                            {tab.fields?.length || 0} fields
                          </span>
                          {hasStaffActionAccess('panForms.deleteTab') && (
                            <button
                              type="button"
                              className="pan-subtab-trash-btn"
                              title="Delete this sub-tab"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeletePanTab(tab.id);
                              }}
                            >
                              🗑️
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* STEP 2 & STEP 3 Container */}
                {(() => {
                  const currentTab = panTabsConfigList.find(t => t.id === selectedPanTabId);
                  if (!currentTab) return null;

                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                      
                      {/* STEP 2: Configure Tab Info & Fee */}
                      <div className="pan-step-card" style={{ marginBottom: 0 }}>
                        <div className="pan-step-header">
                          <div className="pan-step-title-group">
                            <span className="pan-step-num-badge step-2">2</span>
                            <h4 className="pan-step-title">
                              STEP 2: Tab Details & Fee for "{currentTab.label}"
                            </h4>
                          </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                          <div>
                            <label className="pan-input-label">Tab Display Label</label>
                            <input
                              type="text"
                              value={currentTab.label || ''}
                              onChange={(e) => handleUpdateTabHeader('label', e.target.value)}
                              disabled={!hasStaffActionAccess('panForms.editTab')}
                              className="pan-form-control"
                            />
                          </div>
                          <div>
                            <label className="pan-input-label">Tab Icon Emoji</label>
                            <input
                              type="text"
                              value={currentTab.icon || ''}
                              onChange={(e) => handleUpdateTabHeader('icon', e.target.value)}
                              disabled={!hasStaffActionAccess('panForms.editTab')}
                              className="pan-form-control"
                            />
                          </div>
                          <div>
                            <label className="pan-input-label">Application Fee (₹)</label>
                            <input
                              type="number"
                              value={currentTab.fee !== undefined && currentTab.fee !== null ? currentTab.fee : ''}
                              onChange={(e) => handleUpdateTabHeader('fee', e.target.value === '' ? '' : Number(e.target.value))}
                              disabled={!hasStaffActionAccess('panForms.editTab')}
                              className="pan-form-control pan-fee-input"
                            />
                          </div>
                          <div>
                            <label className="pan-input-label">Badge Header</label>
                            <input
                              type="text"
                              value={currentTab.badge || ''}
                              onChange={(e) => handleUpdateTabHeader('badge', e.target.value)}
                              disabled={!hasStaffActionAccess('panForms.editTab')}
                              className="pan-form-control"
                            />
                          </div>
                          <div style={{ gridColumn: 'span 2' }}>
                            <label className="pan-input-label">Subtitle Instructions / Description</label>
                            <input
                              type="text"
                              value={currentTab.description || ''}
                              onChange={(e) => handleUpdateTabHeader('description', e.target.value)}
                              disabled={!hasStaffActionAccess('panForms.editTab')}
                              className="pan-form-control"
                            />
                          </div>
                        </div>
                      </div>

                      {/* STEP 3: Manage Form Fields */}
                      {hasStaffActionAccess('panForms.fields') && (
                      <div className="pan-step-card" style={{ background: '#ffffff', borderColor: '#fdba74', marginBottom: 0 }}>
                        
                        <div className="pan-step-header" style={{ borderBottom: '1.5px solid #ffedd5', paddingBottom: '14px', marginBottom: '20px' }}>
                          <div className="pan-step-title-group" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', flexWrap: 'wrap', gap: '10px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <span className="pan-step-num-badge step-3">3</span>
                              <h4 className="pan-step-title" style={{ color: '#9a3412', margin: 0 }}>
                                STEP 3: Form Fields Builder for "{currentTab.label}"
                              </h4>
                            </div>

                            {/* Dynamic Badge */}
                            <span style={{ background: '#fff7ed', color: '#ea580c', border: '1px solid #fdba74', padding: '4px 12px', borderRadius: '12px', fontSize: '12px', fontWeight: 800 }}>
                              Active Tab: {currentTab.label}
                            </span>
                          </div>
                        </div>

                        {/* FORM 93 vs FORM 94 SEPARATE FORM SELECTOR CARDS */}
                        {(selectedPanTabId === 'manual_new_pan' || selectedPanTabId === 'epan_correction') && (() => {
                          const masterFields = currentTab.fields || [];
                          const isF94 = (f) => {
                            if (!f) return false;
                            if (f.formType === 'Form 94' || f.formType === 'Both') return true;
                            if (f.formType === 'Form 93') return false;
                            const name = f.name || '';
                            return name.startsWith('comm') || name.startsWith('ra') || name.startsWith('verifier') || name === 'entityName' || name === 'dateOfIncorporation' || name === 'registrationNumber' || name === 'incomeSource' || name === 'proofOfIncorporation';
                          };
                          const isF93 = (f) => {
                            if (!f) return false;
                            if (f.formType === 'Form 93' || f.formType === 'Both') return true;
                            if (f.formType === 'Form 94') return false;
                            return !isF94(f);
                          };

                          const countF93 = masterFields.filter(isF93).length;
                          const countF94 = masterFields.filter(isF94).length;


                          return (
                            <div style={{ marginBottom: '24px' }}>
                              <div style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a', marginBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                                <span>📋 Select Form Standard to Manage Drag & Drop Fields:</span>
                                <div style={{ fontSize: '12px', color: '#64748b' }}>
                                  Click on Form 93 or Form 94 to view and manage their fields below
                                </div>
                              </div>

                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
                                
                                {/* FORM 93 SELECTION CARD */}
                                <div
                                  onClick={() => {
                                    setPanFormTypeFilter('Form93');
                                    setPanCategoryFilter('INDIVIDUAL');
                                  }}
                                  style={{
                                    background: panFormTypeFilter === 'Form93' ? 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)' : '#ffffff',
                                    border: panFormTypeFilter === 'Form93' ? '2.5px solid #0284c7' : '1.5px solid #cbd5e1',
                                    borderRadius: '16px',
                                    padding: '18px 20px',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease',
                                    boxShadow: panFormTypeFilter === 'Form93' ? '0 8px 20px rgba(2, 132, 199, 0.18)' : '0 2px 6px rgba(0,0,0,0.03)',
                                    position: 'relative',
                                    overflow: 'hidden'
                                  }}
                                >
                                  {panFormTypeFilter === 'Form93' && (
                                    <div style={{ position: 'absolute', top: 0, right: 0, background: '#0284c7', color: '#ffffff', fontSize: '10px', fontWeight: 900, padding: '3px 12px', borderRadius: '0 0 0 10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                      ✓ ACTIVE SELECTION
                                    </div>
                                  )}

                                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                                    <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: panFormTypeFilter === 'Form93' ? '#0284c7' : '#f1f5f9', color: panFormTypeFilter === 'Form93' ? '#ffffff' : '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', fontWeight: 800 }}>
                                      👤
                                    </div>
                                    <div>
                                      <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: panFormTypeFilter === 'Form93' ? '#0369a1' : '#0f172a' }}>
                                        FORM 93 (Individual Applicants)
                                      </h4>
                                      <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>
                                        Standard Form 49A for Individual Citizens
                                      </span>
                                    </div>
                                  </div>

                                  <div style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid #bae6fd', borderRadius: '10px', padding: '10px 12px', marginTop: '10px' }}>
                                    <div style={{ fontSize: '11.5px', fontWeight: 800, color: '#0369a1', marginBottom: '4px' }}>
                                      📌 Applicable Category:
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                      <span style={{ background: '#0284c7', color: '#ffffff', padding: '3px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 800 }}>
                                        👤 INDIVIDUAL
                                      </span>
                                      <span style={{ background: '#e0f2fe', color: '#0369a1', padding: '3px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 700 }}>
                                        {countF93} Form Fields Configured
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                {/* FORM 94 SELECTION CARD */}
                                <div
                                  onClick={() => {
                                    setPanFormTypeFilter('Form94');
                                    if (panCategoryFilter === 'INDIVIDUAL') setPanCategoryFilter('ALL');
                                  }}
                                  style={{
                                    background: panFormTypeFilter === 'Form94' ? 'linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%)' : '#ffffff',
                                    border: panFormTypeFilter === 'Form94' ? '2.5px solid #9333ea' : '1.5px solid #cbd5e1',
                                    borderRadius: '16px',
                                    padding: '18px 20px',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease',
                                    boxShadow: panFormTypeFilter === 'Form94' ? '0 8px 20px rgba(147, 51, 234, 0.18)' : '0 2px 6px rgba(0,0,0,0.03)',
                                    position: 'relative',
                                    overflow: 'hidden'
                                  }}
                                >
                                  {panFormTypeFilter === 'Form94' && (
                                    <div style={{ position: 'absolute', top: 0, right: 0, background: '#9333ea', color: '#ffffff', fontSize: '10px', fontWeight: 900, padding: '3px 12px', borderRadius: '0 0 0 10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                      ✓ ACTIVE SELECTION
                                    </div>
                                  )}

                                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                                    <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: panFormTypeFilter === 'Form94' ? '#9333ea' : '#f1f5f9', color: panFormTypeFilter === 'Form94' ? '#ffffff' : '#9333ea', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', fontWeight: 800 }}>
                                      🏢
                                    </div>
                                    <div>
                                      <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: panFormTypeFilter === 'Form94' ? '#7e22ce' : '#0f172a' }}>
                                        FORM 94 (Non-Individual / Entities)
                                      </h4>
                                      <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>
                                        Form 49A for Firms, Trusts, Companies & Other Entities
                                      </span>
                                    </div>
                                  </div>

                                  <div style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid #d8b4fe', borderRadius: '10px', padding: '10px 12px', marginTop: '10px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                      <span style={{ fontSize: '11.5px', fontWeight: 800, color: '#7e22ce' }}>
                                        🏢 Form 94 Applicable Categories:
                                      </span>
                                      <span style={{ background: '#9333ea', color: '#ffffff', padding: '2px 8px', borderRadius: '10px', fontSize: '10.5px', fontWeight: 800 }}>
                                        {countF94} Fields
                                      </span>
                                    </div>

                                    {/* List of Form 94 Entity Names */}
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                                      {['FIRM', 'TRUST', 'COMPANY', 'HUF', 'LLP', 'BODY OF INDIVIDUALS', 'ASSOCIATION OF PERSONS', 'LOCAL AUTHORITY', 'GOVERNMENT', 'ARTIFICIAL JURIDICAL PERSON'].map(cat => (
                                        <span
                                          key={cat}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setPanFormTypeFilter('Form94');
                                            setPanCategoryFilter(cat);
                                          }}
                                          style={{
                                            background: panCategoryFilter === cat ? '#9333ea' : '#f3e8ff',
                                            color: panCategoryFilter === cat ? '#ffffff' : '#7e22ce',
                                            border: '1px solid #d8b4fe',
                                            padding: '2px 7px',
                                            borderRadius: '8px',
                                            fontSize: '10.5px',
                                            fontWeight: 800,
                                            cursor: 'pointer'
                                          }}
                                          title={`Click to view fields for ${cat}`}
                                        >
                                          {cat}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                </div>

                              </div>

                              {/* All Fields Combined Button */}
                              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPanFormTypeFilter('ALL');
                                    setPanCategoryFilter('ALL');
                                  }}
                                  style={{
                                    background: panFormTypeFilter === 'ALL' ? 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)' : '#ffffff',
                                    color: panFormTypeFilter === 'ALL' ? '#ffffff' : '#475569',
                                    border: '1.5px solid #cbd5e1',
                                    padding: '6px 14px',
                                    borderRadius: '10px',
                                    fontSize: '12px',
                                    fontWeight: 800,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                  }}
                                >
                                  📂 View All Fields Combined ({masterFields.length})
                                </button>
                              </div>
                            </div>
                          );
                        })()}

                        {/* Add New Field Box */}
                        <div style={{ background: '#fffbf5', border: '1.5px dashed #ea580c', borderRadius: '14px', padding: '20px', marginBottom: '24px' }}>
                          <h5 style={{ margin: '0 0 14px', color: '#ea580c', fontSize: '15px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            ➕ Add a New Form Input Field to {(selectedPanTabId === 'manual_new_pan' || selectedPanTabId === 'epan_correction') ? (panFormTypeFilter === 'Form94' ? 'Form 94 (Non-Individual)' : 'Form 93 (Individual)') : 'Form'}
                          </h5>
                          
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '16px' }}>
                            <div>
                              <label className="pan-input-label">Field Label (Displayed to Retailer) *</label>
                              <input
                                type="text"
                                placeholder="e.g. Father's Full Name"
                                value={newPanFieldForm.label}
                                onChange={(e) => setNewPanFieldForm({ ...newPanFieldForm, label: e.target.value })}
                                className="pan-form-control"
                              />
                            </div>
                            
                            <div>
                              <label className="pan-input-label">Input Type</label>
                              <select
                                value={newPanFieldForm.type}
                                onChange={(e) => setNewPanFieldForm({ ...newPanFieldForm, type: e.target.value })}
                                className="pan-form-control"
                                style={{ fontWeight: 600 }}
                              >
                                <option value="text">🔤 Text Input (Name, Address, PAN No)</option>
                                <option value="tel">📱 Mobile / Phone Number</option>
                                <option value="email">📧 Email Address</option>
                                <option value="date">📅 Date Picker (DOB)</option>
                                <option value="select">🔽 Dropdown Selection Menu</option>
                                <option value="file">📁 Direct File / Photo Upload (Choose File)</option>
                              </select>
                            </div>

                            {/* Dynamic Options Input if Dropdown Select */}
                            {newPanFieldForm.type === 'select' && (
                              <div style={{ gridColumn: 'span 2', background: '#fff7ed', border: '1.5px solid #fdba74', padding: '12px 16px', borderRadius: '10px' }}>
                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#c2410c', marginBottom: '4px' }}>
                                  🔽 Dropdown Options (Comma Separated) *
                                </label>
                                <input
                                  type="text"
                                  placeholder="e.g. Male, Female, Transgender  OR  Option A, Option B"
                                  value={newPanFieldForm.optionsRaw}
                                  onChange={(e) => setNewPanFieldForm({ ...newPanFieldForm, optionsRaw: e.target.value })}
                                  className="pan-form-control"
                                  style={{ borderColor: '#f97316', fontWeight: 600 }}
                                />
                                <span style={{ fontSize: '11px', color: '#9a3412', marginTop: '4px', display: 'block' }}>
                                  💡 Separate each dropdown choice with a comma.
                                </span>
                              </div>
                            )}

                            <div>
                              <label className="pan-input-label">Placeholder Hint Text</label>
                              <input
                                type="text"
                                placeholder="e.g. Enter details..."
                                value={newPanFieldForm.placeholder}
                                onChange={(e) => setNewPanFieldForm({ ...newPanFieldForm, placeholder: e.target.value })}
                                className="pan-form-control"
                              />
                            </div>

                            <div>
                              <label className="pan-input-label">Icon Emoji</label>
                              <input
                                type="text"
                                placeholder="e.g. 👨‍👦 / 📱 / 📧"
                                value={newPanFieldForm.icon}
                                onChange={(e) => setNewPanFieldForm({ ...newPanFieldForm, icon: e.target.value })}
                                className="pan-form-control"
                              />
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '20px', flexWrap: 'wrap' }}>
                              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 800, color: '#ea580c', cursor: 'pointer', background: '#ffffff', padding: '8px 12px', border: '1.5px solid #fed7aa', borderRadius: '10px' }}>
                                <input
                                  type="checkbox"
                                  checked={newPanFieldForm.required}
                                  onChange={(e) => setNewPanFieldForm({ ...newPanFieldForm, required: e.target.checked })}
                                  style={{ width: '16px', height: '16px', accentColor: '#ea580c', cursor: 'pointer' }}
                                />
                                Mandatory / Required?
                              </label>

                              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 800, color: '#0284c7', cursor: 'pointer', background: '#ffffff', padding: '8px 12px', border: '1.5px solid #bae6fd', borderRadius: '10px' }}>
                                <input
                                  type="checkbox"
                                  checked={newPanFieldForm.hidden}
                                  onChange={(e) => setNewPanFieldForm({ ...newPanFieldForm, hidden: e.target.checked })}
                                  style={{ width: '16px', height: '16px', accentColor: '#0284c7', cursor: 'pointer' }}
                                />
                                Hide Field from User Form?
                              </label>
                            </div>
                          </div>

                          <button
                            onClick={handleAddFieldToPanTab}
                            className="pan-save-all-btn"
                            style={{ background: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)', boxShadow: '0 4px 12px rgba(234,88,12,0.25)' }}
                          >
                            ➕ Add Field to Form
                          </button>
                        </div>

                        {/* Existing Form Fields Grid */}
                        {(() => {
                          const masterFields = currentTab.fields || [];
                          const isF94 = (f) => {
                            if (!f) return false;
                            if (f.formType === 'Form 94' || f.formType === 'Both') return true;
                            if (f.formType === 'Form 93') return false;
                            const name = f.name || '';
                            return name.startsWith('comm') || name.startsWith('ra') || name.startsWith('verifier') || name === 'entityName' || name === 'dateOfIncorporation' || name === 'registrationNumber' || name === 'incomeSource' || name === 'proofOfIncorporation';
                          };
                          const isF93 = (f) => {
                            if (!f) return false;
                            if (f.formType === 'Form 93' || f.formType === 'Both') return true;
                            if (f.formType === 'Form 94') return false;
                            return !isF94(f);
                          };

                          const isDualFormTab = selectedPanTabId === 'manual_new_pan' || selectedPanTabId === 'epan_correction';
                          let displayedFields = masterFields;
                          if (isDualFormTab) {
                            if (panFormTypeFilter === 'Form93') {
                              displayedFields = masterFields.filter(isF93);
                            } else if (panFormTypeFilter === 'Form94') {
                              displayedFields = masterFields.filter(isF94);
                            }
                          }

                          return (
                            <div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                                <h5 style={{ margin: 0, color: '#0f172a', fontSize: '15px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  📋 Configured Form Fields ({displayedFields.length}) {(selectedPanTabId === 'manual_new_pan' || selectedPanTabId === 'epan_correction') && (panFormTypeFilter === 'Form93' ? '— Form 93 (Individual)' : panFormTypeFilter === 'Form94' ? `— Form 94 (Non-Individual${panCategoryFilter !== 'ALL' ? ` • ${panCategoryFilter}` : ''})` : '')}
                                </h5>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                  <button
                                    type="button"
                                    onClick={handleResetDefaultPanFields}
                                    style={{
                                      background: '#0284c7',
                                      color: '#ffffff',
                                      border: 'none',
                                      padding: '6px 14px',
                                      borderRadius: '8px',
                                      fontSize: '12px',
                                      fontWeight: 800,
                                      cursor: 'pointer',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '5px'
                                    }}
                                    title="Click to restore all standard government form fields for this form"
                                  >
                                    🔄 Load All Fixed Fields
                                  </button>
                                </div>
                              </div>

                              <div style={{ overflowX: 'auto', background: '#ffffff', borderRadius: '12px', border: '1px solid #cbd5e1', boxShadow: '0 4px 16px rgba(0, 0, 0, 0.05)' }}>
                                <table className="pan-fields-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                                  <thead>
                                    <tr style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', color: '#ffffff' }}>
                                      <th style={{ padding: '12px 14px', width: '130px' }}>Order & Drag</th>
                                      {isDualFormTab && <th style={{ padding: '12px 14px', width: '120px' }}>Form Badge</th>}
                                      <th style={{ padding: '12px 14px' }}>Field Label</th>
                                      <th style={{ padding: '12px 14px' }}>Field Key</th>
                                      <th style={{ padding: '12px 14px', width: '130px' }}>Input Type</th>
                                      <th style={{ padding: '12px 14px', textAlign: 'center', width: '130px' }}>Visibility</th>
                                      <th style={{ padding: '12px 14px', textAlign: 'center', width: '130px' }}>Requirement</th>
                                      <th style={{ padding: '12px 14px', textAlign: 'center', width: '90px' }}>Actions</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {displayedFields.map((field, dispIdx) => {
                                      const masterIdx = masterFields.findIndex(f => f.name === field.name);
                                      const isForm94Field = isF94(field);
                                      const isDragging = draggedPanFieldIndex === masterIdx;
                                      const isDragOver = dragOverPanFieldIndex === masterIdx;

                                      return (
                                        <tr
                                          key={field.name || dispIdx}
                                          draggable={true}
                                          onDragStart={(e) => handlePanFieldDragStart(e, masterIdx)}
                                          onDragOver={(e) => handlePanFieldDragOver(e, masterIdx)}
                                          onDrop={(e) => handlePanFieldDrop(e, masterIdx)}
                                          onDragEnd={handlePanFieldDragEnd}
                                          style={{
                                            borderBottom: '1px solid #f1f5f9',
                                            background: isDragging ? '#f0f9ff' : isDragOver ? '#e0f2fe' : dispIdx % 2 === 0 ? '#ffffff' : '#f8fafc',
                                            transition: 'background 0.15s ease'
                                          }}
                                        >
                                          {/* Order & Drag Handle */}
                                          <td style={{ padding: '10px 14px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                              <span style={{ cursor: 'grab', fontSize: '15px', color: '#94a3b8', userSelect: 'none' }} title="Drag row to reorder">
                                                ⋮⋮
                                              </span>
                                              <span style={{ background: '#e2e8f0', color: '#334155', fontWeight: 800, fontSize: '11px', padding: '2px 6px', borderRadius: '6px' }}>
                                                #{dispIdx + 1}
                                              </span>
                                              <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                                                <button
                                                  type="button"
                                                  disabled={dispIdx === 0}
                                                  onClick={() => handleMovePanField(masterIdx, 'up')}
                                                  style={{ border: 'none', background: 'transparent', cursor: dispIdx === 0 ? 'not-allowed' : 'pointer', opacity: dispIdx === 0 ? 0.3 : 1, fontSize: '10px', padding: '0' }}
                                                  title="Move Up"
                                                >
                                                  ⬆️
                                                </button>
                                                <button
                                                  type="button"
                                                  disabled={dispIdx === displayedFields.length - 1}
                                                  onClick={() => handleMovePanField(masterIdx, 'down')}
                                                  style={{ border: 'none', background: 'transparent', cursor: dispIdx === displayedFields.length - 1 ? 'not-allowed' : 'pointer', opacity: dispIdx === displayedFields.length - 1 ? 0.3 : 1, fontSize: '10px', padding: '0' }}
                                                  title="Move Down"
                                                >
                                                  ⬇️
                                                </button>
                                              </div>
                                            </div>
                                          </td>

                                          {/* Form Badge (Physical / Traditional Forms only) */}
                                          {isDualFormTab && (
                                            <td style={{ padding: '10px 14px' }}>
                                              {isForm94Field ? (
                                                <span style={{ background: '#f3e8ff', color: '#9333ea', border: '1px solid #d8b4fe', padding: '3px 8px', borderRadius: '8px', fontSize: '11px', fontWeight: 800 }}>
                                                  🏢 Form 94
                                                </span>
                                              ) : (
                                                <span style={{ background: '#e0f2fe', color: '#0284c7', border: '1px solid #7dd3fc', padding: '3px 8px', borderRadius: '8px', fontSize: '11px', fontWeight: 800 }}>
                                                  👤 Form 93
                                                </span>
                                              )}
                                            </td>
                                          )}

                                          {/* Editable Label */}
                                          <td style={{ padding: '10px 14px' }}>
                                            <input
                                              type="text"
                                              value={field.label || ''}
                                              onChange={(e) => handleUpdatePanField(masterIdx, 'label', e.target.value)}
                                              style={{ width: '100%', padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', fontWeight: 600, color: '#0f172a' }}
                                            />
                                          </td>

                                          {/* Field Key */}
                                          <td style={{ padding: '10px 14px' }}>
                                            <code style={{ background: '#f1f5f9', color: '#0284c7', padding: '3px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: 700, fontFamily: 'monospace' }}>
                                              {field.name}
                                            </code>
                                          </td>

                                          {/* Input Type */}
                                          <td style={{ padding: '10px 14px' }}>
                                            <select
                                              value={field.type || 'text'}
                                              onChange={(e) => handleUpdatePanField(masterIdx, 'type', e.target.value)}
                                              style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', fontWeight: 600 }}
                                            >
                                              <option value="text">Text</option>
                                              <option value="tel">Mobile</option>
                                              <option value="email">Email</option>
                                              <option value="date">Date</option>
                                              <option value="select">Dropdown</option>
                                              <option value="file">File Upload</option>
                                            </select>
                                          </td>

                                          {/* Visibility Toggle */}
                                          <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                                            <button
                                              type="button"
                                              onClick={() => handleTogglePanField(masterIdx, 'hidden')}
                                              style={{
                                                background: field.hidden ? '#f1f5f9' : '#dcfce7',
                                                color: field.hidden ? '#64748b' : '#15803d',
                                                border: `1px solid ${field.hidden ? '#cbd5e1' : '#86efac'}`,
                                                padding: '5px 10px',
                                                borderRadius: '8px',
                                                fontSize: '11.5px',
                                                fontWeight: 800,
                                                cursor: 'pointer',
                                                width: '100%'
                                              }}
                                            >
                                              {field.hidden ? '🙈 HIDDEN' : '👁️ DISPLAYED'}
                                            </button>
                                          </td>

                                          {/* Requirement Toggle */}
                                          <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                                            <button
                                              type="button"
                                              onClick={() => handleTogglePanField(masterIdx, 'required')}
                                              style={{
                                                background: field.required ? '#fee2e2' : '#f1f5f9',
                                                color: field.required ? '#dc2626' : '#64748b',
                                                border: `1px solid ${field.required ? '#fca5a5' : '#cbd5e1'}`,
                                                padding: '5px 10px',
                                                borderRadius: '8px',
                                                fontSize: '11.5px',
                                                fontWeight: 800,
                                                cursor: 'pointer',
                                                width: '100%'
                                              }}
                                            >
                                              {field.required ? '🔴 REQUIRED' : '⚪ OPTIONAL'}
                                            </button>
                                          </td>

                                          {/* Delete Action */}
                                          <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                                            <button
                                              type="button"
                                              onClick={() => handleDeletePanField(masterIdx)}
                                              style={{ background: '#fff1f2', color: '#e11d48', border: '1px solid #fecdd3', padding: '6px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 800, cursor: 'pointer' }}
                                              title="Delete field"
                                            >
                                              🗑️ Delete
                                            </button>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          );
                        })()}

                      </div>
                      )}
                    </div>
                  );
                })()}

              </div>
            </div>
          )}

          {/* Offline Work Submissions Tab */}
          {activeTab === 'offlineSubmissions' && (
            <OfflineSubmissionsManager
              hasStaffActionAccess={hasStaffActionAccess}
              users={users}
            />
          )}

          {/* Offline Work Forms Manager Tab */}
          {activeTab === 'offlineForms' && (
            <OfflineFormsManager
              hasStaffActionAccess={hasStaffActionAccess}
            />
          )}

          {/* Wallet Requests Tab */}
          {activeTab === 'walletRequests' && (
            <div className="admin-panel-grid" style={{ gridTemplateColumns: hasStaffActionAccess('walletRequests.upiConfig') ? undefined : '1fr' }}>
              {hasStaffActionAccess('walletRequests.upiConfig') && (
                <div className="admin-card form-card">
                  <h3>UPI Scanner Config</h3>
                  <div className="modern-form">
                    <input type="text" placeholder="UPI ID (e.g. mbmitra@upi)" value={upiForm.upiId} onChange={e => setUpiForm({...upiForm, upiId: e.target.value})} />
                    <div className="file-upload-wrapper">
                      <input type="file" accept="image/*" onChange={e => setUpiForm({...upiForm, qrCodeImgFile: e.target.files[0]})} />
                    </div>
                    <button className="modern-submit-btn" onClick={updateUpiConfig}>Update UPI Config</button>
                  </div>
                </div>
              )}
              <div className="admin-card list-card" style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', borderBottom: '2px solid #f3f4f6', paddingBottom: '15px', flexWrap: 'wrap', gap: '10px' }}>
                  <h3 style={{ margin: 0, border: 'none', padding: 0 }}>Payment Requisitions</h3>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <select 
                      value={reqStatusFilter} 
                      onChange={e => setReqStatusFilter(e.target.value)}
                      style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', outline: 'none' }}
                    >
                      <option value="All">All Status</option>
                      <option value="Pending">Pending</option>
                      <option value="Approved">Approved</option>
                      <option value="Rejected">Rejected</option>
                    </select>
                    <input 
                      type="text" 
                      placeholder="Search User ID or Ref No..." 
                      value={reqSearch} 
                      onChange={(e) => setReqSearch(e.target.value)} 
                      style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', outline: 'none', width: '200px' }}
                    />
                  </div>
                </div>
                <div className="modern-table-container">
                  <table className="modern-table">
                    <thead>
                      <tr>
                        <th>User & Ref</th>
                        <th>Amount</th>
                        <th>Status</th>
                        <th>Remarks</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paymentRequisitions.filter(r => reqStatusFilter === 'All' || r.status === reqStatusFilter).filter(r => r.userId.toLowerCase().includes(reqSearch.toLowerCase()) || r.referenceNumber.toLowerCase().includes(reqSearch.toLowerCase())).map((req) => {
                        let statusClass = 'status-pending';
                        if (req.status === 'Approved') statusClass = 'status-approved';
                        if (req.status === 'Partially Approved') statusClass = 'status-partial';
                        if (req.status === 'Rejected') statusClass = 'status-rejected';

                        return (
                          <tr key={req._id}>
                            <td>
                              <strong>{req.userId}</strong><br/>
                              <span style={{ color: '#6b7280', fontSize: '12px' }}>{req.referenceNumber}</span>
                            </td>
                            <td>
                              <div>Req: ₹{req.amount}</div>
                              <div style={{ color: '#059669', fontSize: '12px' }}>App: ₹{req.approvedAmount || 0}</div>
                              <div style={{ color: '#6b7280', fontSize: '12px' }}>{new Date(req.paymentDate).toLocaleDateString()}</div>
                            </td>
                            <td>
                              <span className={`status-badge ${statusClass}`}>{req.status}</span>
                            </td>
                            <td style={{ maxWidth: '150px', wordWrap: 'break-word' }}>
                              {req.remarks || '-'}
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                                {hasStaffActionAccess('walletRequests.approve') && req.status === 'Pending' && (
                                  <button className="modern-submit-btn" style={{ padding: '6px 12px', background: '#22c55e', fontSize: '13px', margin: 0 }} onClick={() => updateRequisition(req._id, 'Approved', req.amount)}>Approve</button>
                                )}
                                {hasStaffActionAccess('walletRequests.reject') && req.status !== 'Rejected' && (
                                  <button className="modern-delete-btn" style={{ padding: '6px 12px', background: '#ef4444', fontSize: '13px', margin: 0 }} onClick={() => updateRequisition(req._id, 'Rejected', 0)}>Reject</button>
                                )}
                                {hasStaffActionAccess('walletRequests.edit') && (
                                  <button
                                    className="modern-submit-btn"
                                    style={{ padding: '6px 12px', background: '#2563eb', color: '#ffffff', fontSize: '13px', margin: 0, display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                    onClick={() => handleEditRequisition(req)}
                                    title="Edit payment requisition"
                                  >
                                    <span>✏️</span> Edit
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {paymentRequisitions.length === 0 && (
                        <tr><td colSpan="5" style={{ textAlign: 'center', color: '#888', padding: '20px' }}>No payment requisitions found.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Fees Management – PAN New Application Tab */}
          {activeTab === 'feesNewApplication' && (
            <FeesLedgerTab
              title="PAN New Application Fees Ledger"
              icon="📄"
              color="#2563eb"
              applicationType="new"
              transactions={newPanTransactions}
              loading={ledgerLoading}
              onRefresh={fetchLedgerTransactions}
              canExport={hasStaffActionAccess('feesNewApplication.export')}
            />
          )}

          {/* Fees Management – PAN Correction Tab */}
          {activeTab === 'feesCorrection' && (
            <FeesLedgerTab
              title="PAN Correction Fees Ledger"
              icon="✏️"
              color="#7c3aed"
              applicationType="correction"
              transactions={panCorrectionTransactions}
              loading={ledgerLoading}
              onRefresh={fetchLedgerTransactions}
              canExport={hasStaffActionAccess('feesCorrection.export')}
            />
          )}

          {/* Combined Pay-In / Pay-Out History Tab */}
          {(activeTab === 'payInPayOutHistory' || activeTab === 'payInHistory' || activeTab === 'payOutHistory') && (
            <FeesLedgerTab
              title="Pay-In / Pay-Out History (Credit & Debit Ledger)"
              icon="⇄"
              color="#ea580c"
              applicationType="pay_in_out"
              transactions={payInPayOutTransactions}
              loading={ledgerLoading}
              onRefresh={fetchLedgerTransactions}
              canExport={hasStaffActionAccess('payInHistory.export') || hasStaffActionAccess('payOutHistory.export')}
            />
          )}

          {/* All Ledger Transactions Tab */}
          {activeTab === 'ledgerHistory' && (
            <FeesLedgerTab
              title="All Ledger History & Transactions"
              icon="📋"
              color="#2563eb"
              applicationType="all"
              transactions={ledgerTransactions}
              loading={ledgerLoading}
              onRefresh={fetchLedgerTransactions}
              canExport={hasStaffActionAccess('ledgerHistory.export')}
            />
          )}

          {/* User Management Tab (Redesigned for 100+ Users with Pagination, Filtering, and Table/Grid Views) */}
          {activeTab === 'users' && (
            <div className="user-mgmt-container">
              
              {/* Summary Metric KPI Cards */}
              <div className="user-stat-grid">
                <div className="user-stat-card">
                  <div className="user-stat-icon" style={{ background: '#eff6ff', color: '#2563eb' }}>👥</div>
                  <div className="user-stat-info">
                    <span className="user-stat-label">Total Users</span>
                    <span className="user-stat-value">{users.length}</span>
                  </div>
                </div>

                <div className="user-stat-card">
                  <div className="user-stat-icon" style={{ background: '#f0fdf4', color: '#15803d' }}>✅</div>
                  <div className="user-stat-info">
                    <span className="user-stat-label">Approved Users</span>
                    <span className="user-stat-value" style={{ color: '#15803d' }}>
                      {users.filter(u => (u.status || 'Approved') === 'Approved').length}
                    </span>
                  </div>
                </div>

                <div 
                  className="user-stat-card" 
                  style={{ 
                    border: users.filter(u => u.status === 'Pending').length > 0 ? '1.5px solid #f59e0b' : undefined,
                    cursor: users.filter(u => u.status === 'Pending').length > 0 ? 'pointer' : 'default'
                  }}
                  onClick={() => {
                    if (users.filter(u => u.status === 'Pending').length > 0) {
                      setUserStatusFilter('Pending');
                      setUserPage(1);
                    }
                  }}
                  title={users.filter(u => u.status === 'Pending').length > 0 ? 'Click to filter pending requests' : ''}
                >
                  <div className="user-stat-icon" style={{ background: '#fffbeb', color: '#d97706' }}>⏳</div>
                  <div className="user-stat-info">
                    <span className="user-stat-label">Pending Approval</span>
                    <span className="user-stat-value" style={{ color: users.filter(u => u.status === 'Pending').length > 0 ? '#b45309' : '#64748b' }}>
                      {users.filter(u => u.status === 'Pending').length}
                    </span>
                  </div>
                </div>

                <div className="user-stat-card">
                  <div className="user-stat-icon" style={{ background: '#fef2f2', color: '#dc2626' }}>❌</div>
                  <div className="user-stat-info">
                    <span className="user-stat-label">Rejected Accounts</span>
                    <span className="user-stat-value" style={{ color: '#dc2626' }}>
                      {users.filter(u => u.status === 'Rejected').length}
                    </span>
                  </div>
                </div>

                <div className="user-stat-card">
                  <div className="user-stat-icon" style={{ background: '#faf5ff', color: '#7c3aed' }}>💰</div>
                  <div className="user-stat-info">
                    <span className="user-stat-label">Retailer Balances</span>
                    <span className="user-stat-value" style={{ color: '#7c3aed', fontSize: '18px' }}>
                      ₹{users.reduce((sum, u) => sum + (parseFloat(u.walletBalance) || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>

              {/* Pending Approvals Attention Banner */}
              {users.filter(u => u.status === 'Pending').length > 0 && (
                <div style={{ background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)', border: '1.5px solid #fde68a', borderRadius: '14px', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', boxShadow: '0 2px 8px rgba(245,158,11,0.08)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '26px' }}>⏳</span>
                    <div>
                      <strong style={{ color: '#92400e', fontSize: '15px' }}>
                        {users.filter(u => u.status === 'Pending').length} Registration Approval Request(s) Pending!
                      </strong>
                      <div style={{ color: '#b45309', fontSize: '12.5px', marginTop: '2px' }}>
                        Review new user registrations waiting for administrative approval to access their accounts.
                      </div>
                    </div>
                  </div>
                  <button 
                    onClick={() => {
                      setUserStatusFilter('Pending');
                      setUserPage(1);
                    }}
                    style={{ padding: '7px 14px', background: '#d97706', color: '#ffffff', border: 'none', borderRadius: '8px', fontSize: '12.5px', fontWeight: '800', cursor: 'pointer', boxShadow: '0 2px 6px rgba(217,119,6,0.25)' }}
                  >
                    🔍 View Pending Users Only
                  </button>
                </div>
              )}

              {/* Main Toolbar & Filter Bar */}
              <div className="user-toolbar">
                <div className="user-toolbar-top">
                  <div className="user-toolbar-title-group">
                    <h3>
                      <span>👥</span> User & Retailer Management
                      <span style={{ fontSize: '12px', background: '#eff6ff', color: '#2563eb', padding: '2px 8px', borderRadius: '12px', fontWeight: 800 }}>
                        {filteredAndSortedUsers.length} {filteredAndSortedUsers.length === 1 ? 'User' : 'Users'}
                      </span>
                    </h3>
                    <p>Search, manage permissions, approve accounts, inspect wallet balances, and view receipts for all retailers</p>
                  </div>

                  <div className="user-toolbar-actions">
                    <button onClick={fetchAll} className="user-btn user-btn-secondary" title="Refresh Users List">
                      🔄 Refresh
                    </button>
                    <button onClick={handleExportUsersCSV} className="user-btn user-btn-secondary" title="Export to Excel / CSV">
                      📥 Export CSV
                    </button>
                    <button onClick={handlePrintUsersList} className="user-btn user-btn-secondary" title="Print Users Directory">
                      🖨️ Print
                    </button>
                    {hasStaffActionAccess('users.create') && (
                      <button onClick={handleOpenCreateUser} className="user-btn user-btn-primary">
                        ➕ Add New User
                      </button>
                    )}
                  </div>
                </div>

                {/* Filter Controls Row */}
                <div className="user-filter-row">
                  {/* Search Input */}
                  <div className="user-search-wrapper">
                    <span className="user-search-icon">🔍</span>
                    <input 
                      type="text" 
                      className="user-search-input"
                      placeholder="Search User ID, Name, Mobile, Email..."
                      value={userSearch}
                      onChange={(e) => {
                        setUserSearch(e.target.value);
                        setUserPage(1);
                      }}
                    />
                    {userSearch && (
                      <button 
                        onClick={() => { setUserSearch(''); setUserPage(1); }}
                        style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', color: '#94a3b8', cursor: 'pointer', fontWeight: 800, fontSize: '13px' }}
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {/* Status Filter */}
                  <select 
                    className="user-filter-select"
                    value={userStatusFilter}
                    onChange={(e) => {
                      setUserStatusFilter(e.target.value);
                      setUserPage(1);
                    }}
                  >
                    <option value="All">All Statuses</option>
                    <option value="Approved">✓ Approved</option>
                    <option value="Pending">⏳ Pending Approval</option>
                    <option value="Rejected">✕ Rejected</option>
                  </select>

                  {/* Role Filter */}
                  <select 
                    className="user-filter-select"
                    value={userRoleFilter}
                    onChange={(e) => {
                      setUserRoleFilter(e.target.value);
                      setUserPage(1);
                    }}
                  >
                    <option value="All">All Roles</option>
                    <option value="retailer">Retailer</option>
                    <option value="admin">Admin</option>
                  </select>

                  {/* Sort By */}
                  <select 
                    className="user-filter-select"
                    value={userSortBy}
                    onChange={(e) => setUserSortBy(e.target.value)}
                  >
                    <option value="newest">Sort: Newest First</option>
                    <option value="oldest">Sort: Oldest First</option>
                    <option value="userId">Sort: User ID (A-Z)</option>
                    <option value="name">Sort: Name (A-Z)</option>
                    <option value="balanceHigh">Sort: Highest Wallet</option>
                    <option value="balanceLow">Sort: Lowest Wallet</option>
                  </select>

                  {/* Page Size */}
                  <select 
                    className="user-filter-select"
                    style={{ minWidth: '100px' }}
                    value={userPageSize}
                    onChange={(e) => {
                      setUserPageSize(Number(e.target.value));
                      setUserPage(1);
                    }}
                  >
                    <option value={10}>10 / page</option>
                    <option value={15}>15 / page</option>
                    <option value={25}>25 / page</option>
                    <option value={50}>50 / page</option>
                    <option value={100}>100 / page</option>
                  </select>

                  {/* View Mode Toggle */}
                  <div className="user-view-toggle">
                    <button 
                      className={`user-view-btn ${userViewMode === 'TABLE' ? 'active' : ''}`}
                      onClick={() => setUserViewMode('TABLE')}
                      title="Table View (Compact & Detailed)"
                    >
                      📋 Table
                    </button>
                    <button 
                      className={`user-view-btn ${userViewMode === 'GRID' ? 'active' : ''}`}
                      onClick={() => setUserViewMode('GRID')}
                      title="Grid Cards View"
                    >
                      🔲 Cards
                    </button>
                  </div>

                  {/* Reset Filters */}
                  {(userSearch || userStatusFilter !== 'All' || userRoleFilter !== 'All' || userSortBy !== 'newest') && (
                    <button 
                      onClick={() => {
                        setUserSearch('');
                        setUserStatusFilter('All');
                        setUserRoleFilter('All');
                        setUserSortBy('newest');
                        setUserPage(1);
                      }}
                      style={{ padding: '8px 12px', background: '#ffffff', color: '#64748b', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer' }}
                    >
                      ↺ Reset
                    </button>
                  )}
                </div>
              </div>

              {/* Data Presentation Container */}
              <div className="user-table-card">
                {paginatedUsers.length === 0 ? (
                  <div style={{ padding: '60px 20px', textAlign: 'center', color: '#64748b' }}>
                    <div style={{ fontSize: '48px', marginBottom: '12px' }}>👥</div>
                    <h4 style={{ margin: '0 0 6px 0', fontSize: '18px', color: '#1e293b' }}>No users found</h4>
                    <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8' }}>
                      {userSearch || userStatusFilter !== 'All' || userRoleFilter !== 'All' 
                        ? 'No users match your active filters. Try adjusting search or filter options.'
                        : 'No users registered yet in the system.'}
                    </p>
                    {(userSearch || userStatusFilter !== 'All' || userRoleFilter !== 'All') && (
                      <button 
                        onClick={() => {
                          setUserSearch('');
                          setUserStatusFilter('All');
                          setUserRoleFilter('All');
                        }}
                        style={{ marginTop: '16px', padding: '8px 16px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
                      >
                        Clear All Filters
                      </button>
                    )}
                  </div>
                ) : userViewMode === 'TABLE' ? (
                  /* ================= TABLE VIEW ================= */
                  <div className="user-table-scroll">
                    <table className="user-data-table">
                      <thead>
                        <tr>
                          <th style={{ width: '50px' }}>#</th>
                          <th>User ID</th>
                          <th>Name / Shop</th>
                          <th>Contact Details</th>
                          <th>Role</th>
                          <th>Wallet Balance</th>
                          <th>Status</th>
                          <th>Registered</th>
                          <th style={{ textAlign: 'center' }}>Services Access</th>
                          <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedUsers.map((u, index) => {
                          const status = u.status || 'Approved';
                          const role = u.role || 'customer';
                          const initials = (u.name || u.userId || 'U').slice(0, 2).toUpperCase();
                          const walletVal = parseFloat(u.walletBalance || 0);

                          return (
                            <tr key={u._id || index}>
                              {/* Index */}
                              <td style={{ fontWeight: 600, color: '#94a3b8' }}>
                                {userStartIndex + index + 1}
                              </td>

                              {/* User ID */}
                              <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                  <div className="user-avatar" title={u.userId}>
                                    {initials}
                                  </div>
                                  <div>
                                    <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                      {u.userId}
                                    </div>
                                  </div>
                                </div>
                              </td>

                              {/* Name & Shop */}
                              <td>
                                <div>
                                  <div style={{ fontWeight: 700, color: '#1e293b' }}>
                                    {u.name || <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>No Name</span>}
                                  </div>
                                  {u.shopName && (
                                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                                      🏪 {u.shopName}
                                    </div>
                                  )}
                                </div>
                              </td>

                              {/* Contact */}
                              <td>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>
                                    📱 {u.mobile || <span style={{ color: '#94a3b8' }}>No Mobile</span>}
                                  </div>
                                  {u.email && (
                                    <div style={{ fontSize: '11.5px', color: '#64748b' }}>
                                      ✉️ {u.email}
                                    </div>
                                  )}
                                </div>
                              </td>

                              {/* Role */}
                              <td>
                                <span className={`user-role-badge ${role === 'retailer' ? 'user-role-retailer' : role === 'admin' ? 'user-role-admin' : 'user-role-customer'}`}>
                                  {role}
                                </span>
                              </td>

                              {/* Wallet Balance */}
                              <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <span style={{ fontWeight: 900, color: walletVal >= 0 ? '#15803d' : '#dc2626', fontSize: '13.5px' }}>
                                    ₹{walletVal.toFixed(2)}
                                  </span>
                                  <button
                                    onClick={() => {
                                      setSelectedRetailer(u);
                                      setActiveTab('ledgerHistory');
                                    }}
                                    style={{ border: 'none', background: '#f0fdf4', color: '#166534', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 800, cursor: 'pointer' }}
                                    title="View Wallet Ledger / Adjust Funds"
                                  >
                                    💳 Adjust
                                  </button>
                                </div>
                              </td>

                              {/* Status */}
                              <td>
                                {status === 'Pending' ? (
                                  <span className="user-status-pill user-status-pending">
                                    ⏳ Pending
                                  </span>
                                ) : status === 'Rejected' ? (
                                  <span className="user-status-pill user-status-rejected">
                                    ✕ Rejected
                                  </span>
                                ) : (
                                  <span className="user-status-pill user-status-approved">
                                    ✓ Approved
                                  </span>
                                )}
                              </td>

                              {/* Registered Date */}
                              <td style={{ fontSize: '12px', color: '#64748b', whiteSpace: 'nowrap' }}>
                                {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—'}
                              </td>

                              {/* Services Access */}
                              <td style={{ textAlign: 'center' }}>
                                <button 
                                  type="button"
                                  onClick={() => handleOpenUserPermissions(u)}
                                  style={{
                                    padding: '5px 12px',
                                    background: '#fff7ed',
                                    color: '#ea580c',
                                    border: '1.5px solid #fed7aa',
                                    borderRadius: '8px',
                                    fontSize: '12px',
                                    fontWeight: 800,
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    boxShadow: '0 1px 3px rgba(234, 88, 12, 0.08)',
                                    transition: 'all 0.15s ease'
                                  }}
                                  title={`Configure Service Access & Permissions for ${u.name || u.userId}`}
                                >
                                  <span>🛡️</span>
                                  <span>Services Access</span>
                                  {Array.isArray(u.permissions) && u.permissions.includes('none') ? (
                                    <span style={{
                                      background: '#ef4444',
                                      color: '#ffffff',
                                      borderRadius: '10px',
                                      padding: '1px 7px',
                                      fontSize: '10px',
                                      fontWeight: 800
                                    }}
                                    title="All service permissions revoked (0 active)">
                                      0
                                    </span>
                                  ) : Array.isArray(u.permissions) && u.permissions.length > 0 ? (
                                    <span style={{
                                      background: '#ea580c',
                                      color: '#ffffff',
                                      borderRadius: '10px',
                                      padding: '1px 7px',
                                      fontSize: '10px',
                                      fontWeight: 800
                                    }}
                                    title={`${u.permissions.length} services / sub-permissions allowed`}>
                                      {u.permissions.length}
                                    </span>
                                  ) : null}
                                </button>
                              </td>

                              {/* Actions */}
                              <td>
                                <div className="user-actions-cell" style={{ justifyContent: 'flex-end' }}>
                                  {/* Quick Approve / Reject for Pending */}
                                  {hasStaffActionAccess('users.approve') && status === 'Pending' && (
                                    <>
                                      <button 
                                        className="user-mini-btn user-mini-btn-approve"
                                        onClick={() => updateUserStatus(u._id, 'Approved')}
                                        title="Approve User Registration"
                                      >
                                        ✓ Approve
                                      </button>
                                      <button 
                                        className="user-mini-btn user-mini-btn-reject"
                                        onClick={() => updateUserStatus(u._id, 'Rejected')}
                                        title="Reject Registration"
                                      >
                                        ✕ Reject
                                      </button>
                                    </>
                                  )}

                                  {/* View Profile */}
                                  <button 
                                    className="user-mini-btn user-mini-btn-view"
                                    onClick={() => handleOpenViewUser(u)}
                                    title="View Full Profile Details"
                                  >
                                    👁️ View
                                  </button>

                                  {/* Receipts / Filings */}
                                  <button 
                                    className="user-mini-btn user-mini-btn-receipts"
                                    onClick={() => {
                                      setPanRetailerFilter(u.userId);
                                      setActiveTab('panSubmissions');
                                    }}
                                    title={`View PAN submissions & send receipts for ${u.userId}`}
                                  >
                                    📄 Receipts
                                  </button>

                                  {/* Edit Profile */}
                                  <button 
                                    className="user-mini-btn user-mini-btn-edit"
                                    onClick={() => handleOpenEditUser(u)}
                                    title="Edit User Information"
                                  >
                                    ✏️ Edit
                                  </button>

                                  {/* Remove / Delete */}
                                  {hasStaffActionAccess('users.delete') && (
                                    <button 
                                      className="user-mini-btn user-mini-btn-delete"
                                      onClick={() => deleteItem(`${API_URL}/api/users`, u._id)}
                                      title="Delete User Account"
                                    >
                                      🗑️
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
                ) : (
                  /* ================= GRID CARDS VIEW ================= */
                  <div className="user-grid-container">
                    {paginatedUsers.map((u, index) => {
                      const status = u.status || 'Approved';
                      const role = u.role || 'customer';
                      const initials = (u.name || u.userId || 'U').slice(0, 2).toUpperCase();
                      const walletVal = parseFloat(u.walletBalance || 0);

                      return (
                        <div key={u._id || index} className="user-grid-card">
                          <div className="user-grid-card-top">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <div className="user-avatar">
                                {initials}
                              </div>
                              <div>
                                <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '15px' }}>
                                  {u.userId}
                                </div>
                              </div>
                            </div>
                            <div>
                              {status === 'Pending' ? (
                                <span className="user-status-pill user-status-pending">⏳ Pending</span>
                              ) : status === 'Rejected' ? (
                                <span className="user-status-pill user-status-rejected">✕ Rejected</span>
                              ) : (
                                <span className="user-status-pill user-status-approved">✓ Approved</span>
                              )}
                            </div>
                          </div>

                          <div style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12.5px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ color: '#64748b' }}>Name:</span>
                              <strong style={{ color: '#1e293b' }}>{u.name || '—'}</strong>
                            </div>
                            {u.shopName && (
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: '#64748b' }}>Shop:</span>
                                <span style={{ color: '#334155', fontWeight: 600 }}>{u.shopName}</span>
                              </div>
                            )}
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ color: '#64748b' }}>Mobile:</span>
                              <strong style={{ color: '#334155' }}>{u.mobile || '—'}</strong>
                            </div>
                            {u.email && (
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: '#64748b' }}>Email:</span>
                                <span style={{ color: '#334155', wordBreak: 'break-all', maxWidth: '180px' }}>{u.email}</span>
                              </div>
                            )}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px', borderTop: '1px solid #e2e8f0', paddingTop: '4px' }}>
                              <span style={{ color: '#64748b', fontWeight: 700 }}>Wallet:</span>
                              <strong style={{ color: '#15803d', fontSize: '13.5px' }}>₹{walletVal.toFixed(2)}</strong>
                            </div>
                          </div>

                          {/* Card Actions */}
                          <div className="user-grid-card-actions">
                            {hasStaffActionAccess('users.approve') && status === 'Pending' && (
                              <>
                                <button 
                                  className="user-mini-btn user-mini-btn-approve"
                                  onClick={() => updateUserStatus(u._id, 'Approved')}
                                  style={{ flex: '1 1 45%' }}
                                >
                                  ✓ Approve
                                </button>
                                <button 
                                  className="user-mini-btn user-mini-btn-reject"
                                  onClick={() => updateUserStatus(u._id, 'Rejected')}
                                  style={{ flex: '1 1 45%' }}
                                >
                                  ✕ Reject
                                </button>
                              </>
                            )}

                            <button 
                              className="user-mini-btn user-mini-btn-view"
                              onClick={() => handleOpenViewUser(u)}
                              style={{ flex: '1 1 30%' }}
                            >
                              👁️ View
                            </button>

                            <button 
                              className="user-mini-btn user-mini-btn-receipts"
                              onClick={() => {
                                setPanRetailerFilter(u.userId);
                                setActiveTab('panSubmissions');
                              }}
                              style={{ flex: '1 1 30%' }}
                            >
                              📄 Receipts
                            </button>

                            <button 
                              className="user-mini-btn user-mini-btn-edit"
                              onClick={() => handleOpenEditUser(u)}
                              style={{ flex: '1 1 30%' }}
                            >
                              ✏️ Edit
                            </button>

                            <button 
                              className="user-mini-btn"
                              onClick={() => handleOpenUserPermissions(u)}
                              style={{ flex: '1 1 100%', background: '#fff7ed', color: '#ea580c', border: '1.5px solid #fed7aa', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontWeight: 800 }}
                              title={`Configure Service Access & Permissions for ${u.name || u.userId}`}
                            >
                              <span>🛡️ Services Access</span>
                              {Array.isArray(u.permissions) && u.permissions.includes('none') ? (
                                <span style={{ background: '#ef4444', color: '#ffffff', borderRadius: '10px', padding: '1px 7px', fontSize: '10px', fontWeight: 800 }}>
                                  0
                                </span>
                              ) : Array.isArray(u.permissions) && u.permissions.length > 0 ? (
                                <span style={{ background: '#ea580c', color: '#ffffff', borderRadius: '10px', padding: '1px 7px', fontSize: '10px', fontWeight: 800 }}>
                                  {u.permissions.length}
                                </span>
                              ) : null}
                            </button>

                            {hasStaffActionAccess('users.delete') && (
                              <button 
                                className="user-mini-btn user-mini-btn-delete"
                                onClick={() => deleteItem(`${API_URL}/api/users`, u._id)}
                                style={{ flex: '0 0 auto' }}
                              >
                                🗑️
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Pagination Controls */}
                {filteredAndSortedUsers.length > 0 && (
                  <div className="user-pagination-bar">
                    <div className="user-pagination-info">
                      Showing <strong>{userStartIndex + 1}</strong> to <strong>{Math.min(userStartIndex + userPageSize, filteredAndSortedUsers.length)}</strong> of <strong>{filteredAndSortedUsers.length}</strong> users
                      {filteredAndSortedUsers.length !== users.length && ` (filtered from ${users.length} total)`}
                    </div>

                    <div className="user-pagination-nav">
                      <button 
                        className="user-page-btn"
                        onClick={() => setUserPage(1)}
                        disabled={currentUserPage === 1}
                        title="First Page"
                      >
                        «
                      </button>
                      <button 
                        className="user-page-btn"
                        onClick={() => setUserPage(p => Math.max(1, p - 1))}
                        disabled={currentUserPage === 1}
                        title="Previous Page"
                      >
                        ‹
                      </button>

                      {/* Dynamic Page Numbers */}
                      {Array.from({ length: totalUserPages }, (_, i) => i + 1)
                        .filter(pageNum => {
                          return pageNum === 1 ||
                            pageNum === totalUserPages ||
                            Math.abs(pageNum - currentUserPage) <= 2;
                        })
                        .map((pageNum, idx, arr) => {
                          const prev = arr[idx - 1];
                          return (
                            <React.Fragment key={pageNum}>
                              {prev && pageNum - prev > 1 && (
                                <span style={{ padding: '0 4px', color: '#94a3b8' }}>...</span>
                              )}
                              <button 
                                className={`user-page-btn ${currentUserPage === pageNum ? 'active' : ''}`}
                                onClick={() => setUserPage(pageNum)}
                              >
                                {pageNum}
                              </button>
                            </React.Fragment>
                          );
                        })}

                      <button 
                        className="user-page-btn"
                        onClick={() => setUserPage(p => Math.min(totalUserPages, p + 1))}
                        disabled={currentUserPage >= totalUserPages}
                        title="Next Page"
                      >
                        ›
                      </button>
                      <button 
                        className="user-page-btn"
                        onClick={() => setUserPage(totalUserPages)}
                        disabled={currentUserPage >= totalUserPages}
                        title="Last Page"
                      >
                        »
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'ledgerHistory' && (
            <div className="admin-card" style={{ display: 'flex', flexDirection: 'column', width: '100%', minHeight: '600px', boxSizing: 'border-box' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '2.5px solid #f1f5f9', paddingBottom: '15px', flexWrap: 'wrap', gap: '15px' }}>
                <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#1e293b', border: 'none', padding: 0 }}>📒 Wallet Ledger Transaction History</h3>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <button onClick={downloadCSVTemplate} style={{ padding: '8px 14px', background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
                    📋 Template
                  </button>
                  <input type="file" accept=".csv" onChange={handleCsvImport} style={{ display: 'none' }} id="admin-csv-import" />
                  {hasStaffActionAccess('ledgerHistory.import') && (
                    <button onClick={() => document.getElementById('admin-csv-import').click()} style={{ padding: '8px 14px', background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 800, cursor: 'pointer', boxShadow: '0 4px 10px rgba(245,158,11,0.25)' }}>
                      📥 Import CSV
                    </button>
                  )}
                  {hasStaffActionAccess('ledgerHistory.export') && (
                    <>
                      <button onClick={() => exportLedgerToCSV(ledgerTransactions)} style={{ padding: '8px 14px', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 800, cursor: 'pointer', boxShadow: '0 4px 10px rgba(16,185,129,0.25)' }}>
                        🟢 Export Excel (CSV)
                      </button>
                      <button onClick={() => printLedgerPDF(ledgerTransactions, ledgerFilters)} style={{ padding: '8px 14px', background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 800, cursor: 'pointer', boxShadow: '0 4px 10px rgba(139,92,246,0.25)' }}>
                        🟣 Download PDF
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Professional Admin to Retailer Payment & Wallet Adjustment Card */}
              <div style={{ background: '#ffffff', padding: '22px', borderRadius: '16px', border: '1px solid #e2e8f0', marginBottom: '24px', boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
                {/* Card Title */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)', width: '38px', height: '38px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', color: 'white', boxShadow: '0 4px 10px rgba(37,99,235,0.25)' }}>
                      💳
                    </div>
                    <div>
                      <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>Admin to Retailer Payment & Wallet Transfer</h4>
                      <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#64748b' }}>Instantly Credit (+) or Debit (-) money for any retailer account</p>
                    </div>
                  </div>
                  
                  {selectedRetailer && (
                    <button 
                      onClick={() => { setSelectedRetailer(null); setRetailerSearchQuery(''); setTransferAmount(''); setTransferRemarks(''); }} 
                      style={{ padding: '6px 14px', background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s' }}
                    >
                      🔄 Change Retailer
                    </button>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px', alignItems: 'start' }}>
                  
                  {/* LEFT COLUMN: Retailer Selection */}
                  <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', height: '100%', boxSizing: 'border-box' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <label style={{ fontSize: '12px', fontWeight: 800, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Step 1: Choose Retailer
                      </label>
                      <button 
                        type="button"
                        onClick={() => setShowRetailerModal(true)}
                        style={{ padding: '4px 10px', background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: '6px', fontSize: '11px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                      >
                        👥 Browse All ({users.length})
                      </button>
                    </div>

                    {!selectedRetailer ? (
                      <div style={{ position: 'relative' }}>
                        <input 
                          type="text" 
                          placeholder="🔍 Type Retailer Name, User ID, or Mobile..." 
                          value={retailerSearchQuery}
                          onFocus={() => setShowSearchDropdown(true)}
                          onChange={e => {
                            setRetailerSearchQuery(e.target.value);
                            setShowSearchDropdown(true);
                          }}
                          style={{ width: '100%', padding: '11px 14px', borderRadius: '10px', border: '1.5px solid #cbd5e1', background: 'white', fontSize: '13.5px', color: '#0f172a', outline: 'none', boxSizing: 'border-box', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}
                        />

                        {/* Search Dropdown Popup */}
                        {showSearchDropdown && (
                          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, background: 'white', border: '1px solid #cbd5e1', borderRadius: '10px', marginTop: '6px', maxHeight: '250px', overflowY: 'auto', boxShadow: '0 10px 25px rgba(0,0,0,0.15)' }}>
                            <div style={{ padding: '8px 12px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#64748b', fontWeight: 700 }}>
                              <span>Matching Retailers ({filteredRetailers.length})</span>
                              <button type="button" onClick={() => setShowSearchDropdown(false)} style={{ border: 'none', background: 'none', color: '#ef4444', fontWeight: 800, cursor: 'pointer', fontSize: '11px' }}>Close ✕</button>
                            </div>
                            {filteredRetailers.length === 0 ? (
                              <div style={{ padding: '16px', fontSize: '13px', color: '#64748b', textAlign: 'center' }}>No retailer found for "{retailerSearchQuery}"</div>
                            ) : (
                              filteredRetailers.map(r => (
                                <div 
                                  key={r._id || r.userId}
                                  onClick={() => {
                                    setSelectedRetailer(r);
                                    setRetailerSearchQuery(r.name ? `${r.name} (${r.userId})` : r.userId);
                                    setShowSearchDropdown(false);
                                  }}
                                  style={{ padding: '10px 14px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                  onMouseEnter={e => e.currentTarget.style.background = '#f0f9ff'}
                                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                >
                                  <div>
                                    <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '13.5px' }}>👤 {r.name || r.userId}</div>
                                    <div style={{ fontSize: '11.5px', color: '#64748b' }}>ID: <strong>{r.userId}</strong> {r.mobile ? `| 📱 ${r.mobile}` : ''}</div>
                                  </div>
                                  <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: '13px', fontWeight: 800, color: '#10b981' }}>₹{(r.walletBalance || 0).toFixed(2)}</div>
                                    <div style={{ fontSize: '10px', color: '#94a3b8' }}>Wallet</div>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      /* Selected Retailer Card Banner */
                      <div style={{ background: 'linear-gradient(135deg, #eff6ff 0%, #e0f2fe 100%)', border: '1.5px solid #bfdbfe', borderRadius: '12px', padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontSize: '15px', fontWeight: 800, color: '#1e40af' }}>👤 {selectedRetailer.name || selectedRetailer.userId}</div>
                          <div style={{ fontSize: '12px', color: '#3b82f6', marginTop: '2px' }}>
                            User ID: <strong>{selectedRetailer.userId}</strong> {selectedRetailer.mobile ? `| 📱 ${selectedRetailer.mobile}` : ''}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '10px', textTransform: 'uppercase', color: '#64748b', fontWeight: 700 }}>Current Wallet</div>
                          <div style={{ fontSize: '17px', fontWeight: 900, color: '#059669' }}>₹{(selectedRetailer.walletBalance || 0).toFixed(2)}</div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* RIGHT COLUMN: Payment Details & Action */}
                  <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>
                      Step 2: Payment Action & Amount
                    </label>

                    {/* Credit / Debit Pills */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
                      <button 
                        type="button"
                        onClick={() => setTransferTxType('Credit')}
                        style={{ 
                          padding: '10px', 
                          borderRadius: '10px', 
                          border: transferTxType === 'Credit' ? '2px solid #16a34a' : '1px solid #cbd5e1', 
                          background: transferTxType === 'Credit' ? '#dcfce7' : 'white', 
                          color: transferTxType === 'Credit' ? '#15803d' : '#475569', 
                          fontWeight: 800, 
                          fontSize: '13.5px', 
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justify: 'center',
                          gap: '6px'
                        }}
                      >
                        ➕ CREDIT (+)
                      </button>
                      <button 
                        type="button"
                        onClick={() => setTransferTxType('Debit')}
                        style={{ 
                          padding: '10px', 
                          borderRadius: '10px', 
                          border: transferTxType === 'Debit' ? '2px solid #dc2626' : '1px solid #cbd5e1', 
                          background: transferTxType === 'Debit' ? '#fee2e2' : 'white', 
                          color: transferTxType === 'Debit' ? '#b91c1c' : '#475569', 
                          fontWeight: 800, 
                          fontSize: '13.5px', 
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justify: 'center',
                          gap: '6px'
                        }}
                      >
                        ➖ DEBIT (-)
                      </button>
                    </div>

                    {/* Amount & Presets */}
                    <div style={{ marginBottom: '12px' }}>
                      <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>
                        Enter Amount (₹) *
                      </label>
                      <input 
                        type="number" 
                        min="1" 
                        step="any"
                        placeholder="e.g. 500" 
                        value={transferAmount}
                        onChange={e => setTransferAmount(e.target.value)}
                        style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1.5px solid #cbd5e1', background: 'white', fontSize: '14px', fontWeight: 700, color: '#0f172a', outline: 'none', boxSizing: 'border-box' }}
                      />

                      {/* Quick Presets */}
                      <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
                        {[100, 500, 1000, 2000, 5000].map(amt => (
                          <button
                            key={amt}
                            type="button"
                            onClick={() => setTransferAmount(amt.toString())}
                            style={{ padding: '4px 8px', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '11px', fontWeight: 700, color: '#334155', cursor: 'pointer' }}
                          >
                            +₹{amt}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Remarks */}
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>
                        Remarks / Description
                      </label>
                      <input 
                        type="text" 
                        placeholder="e.g. Counter Payment, Commission, Adjustment" 
                        value={transferRemarks}
                        onChange={e => setTransferRemarks(e.target.value)}
                        style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', background: 'white', fontSize: '13px', color: '#0f172a', outline: 'none', boxSizing: 'border-box' }}
                      />
                    </div>

                    {/* Submit Button */}
                    <button 
                      type="button"
                      onClick={handleAdminWalletTransfer}
                      disabled={transferLoading || !selectedRetailer || !transferAmount}
                      style={{ 
                        width: '100%', 
                        padding: '12px', 
                        borderRadius: '10px', 
                        border: 'none', 
                        background: transferTxType === 'Credit' ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', 
                        color: 'white', 
                        fontSize: '14.5px', 
                        fontWeight: 800, 
                        cursor: (transferLoading || !selectedRetailer || !transferAmount) ? 'not-allowed' : 'pointer',
                        opacity: (transferLoading || !selectedRetailer || !transferAmount) ? 0.6 : 1,
                        boxShadow: transferTxType === 'Credit' ? '0 4px 12px rgba(16,185,129,0.3)' : '0 4px 12px rgba(239,68,68,0.3)'
                      }}
                    >
                      {transferLoading ? 'Processing...' : selectedRetailer ? `🚀 Submit ${transferTxType} Payment to ${selectedRetailer.name || selectedRetailer.userId}` : `Select Retailer First`}
                    </button>
                  </div>
                </div>
              </div>

              {/* Retailer Selection Overlay Modal (Ideal for 1,000+ Retailers) */}
              {showRetailerModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99999, background: 'rgba(15,23,42,0.65)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
                  <div style={{ background: 'white', borderRadius: '16px', width: '100%', maxWidth: '750px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
                    
                    {/* Modal Header */}
                    <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
                      <div>
                        <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#1e293b' }}>👥 Select Retailer for Payment</h3>
                        <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#64748b' }}>Choose any retailer from the system ({users.length} registered retailers)</p>
                      </div>
                      <button 
                        onClick={() => setShowRetailerModal(false)}
                        style={{ width: '32px', height: '32px', borderRadius: '50%', border: 'none', background: '#e2e8f0', color: '#475569', fontSize: '16px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >
                        ✕
                      </button>
                    </div>

                    {/* Modal Search Bar */}
                    <div style={{ padding: '14px 20px', background: 'white', borderBottom: '1px solid #f1f5f9' }}>
                      <input 
                        type="text"
                        placeholder="🔍 Search by Retailer Name, User ID, Mobile No..."
                        value={modalSearch}
                        onChange={e => setModalSearch(e.target.value)}
                        autoFocus
                        style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1.5px solid #cbd5e1', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
                      />
                    </div>

                    {/* Modal Retailer List Table */}
                    <div style={{ padding: '10px 20px', overflowY: 'auto', flex: 1 }}>
                      {users
                        .filter(u => {
                          if (!modalSearch.trim()) return true;
                          const q = modalSearch.toLowerCase().trim();
                          return (u.name && u.name.toLowerCase().includes(q)) ||
                                 (u.userId && u.userId.toLowerCase().includes(q)) ||
                                 (u.retailerId && u.retailerId.toLowerCase().includes(q)) ||
                                 (u.mobile && u.mobile.toString().includes(q));
                        })
                        .map(r => (
                          <div 
                            key={r._id || r.userId}
                            onClick={() => {
                              setSelectedRetailer(r);
                              setRetailerSearchQuery(r.name ? `${r.name} (${r.userId})` : r.userId);
                              setShowRetailerModal(false);
                            }}
                            style={{
                              display: 'flex',
                              justify: 'space-between',
                              alignItems: 'center',
                              padding: '12px 14px',
                              borderRadius: '10px',
                              border: '1px solid #f1f5f9',
                              marginBottom: '8px',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease',
                              background: '#ffffff'
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = '#f0f9ff'}
                            onMouseLeave={e => e.currentTarget.style.background = '#ffffff'}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#e0f2fe', color: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '16px' }}>
                                {(r.name || r.userId).charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>{r.name || r.userId}</div>
                                <div style={{ fontSize: '12px', color: '#64748b' }}>
                                  User ID: <strong>{r.userId}</strong> {r.mobile ? `| 📱 ${r.mobile}` : ''}
                                </div>
                              </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                              <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '10px', textTransform: 'uppercase', color: '#64748b', fontWeight: 700 }}>Wallet Balance</div>
                                <div style={{ fontSize: '15px', fontWeight: 800, color: '#10b981' }}>₹{(r.walletBalance || 0).toFixed(2)}</div>
                              </div>
                              <button 
                                style={{ padding: '7px 14px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                              >
                                Select
                              </button>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              )}


              {/* Filters Panel */}
              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '20px' }}>
                <h4 style={{ margin: '0 0 12px 0', fontSize: '12px', textTransform: 'uppercase', color: '#64748b', fontWeight: 800, letterSpacing: '0.5px' }}>Filter & Generate Report</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(185px, 1fr))', gap: '12px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>User ID</label>
                    <input 
                      type="text" 
                      placeholder="e.g. MBM000012" 
                      value={filterInput.userId} 
                      onChange={e => setFilterInput({...filterInput, userId: e.target.value})} 
                      style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', outline: 'none' }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>Start Date</label>
                    <input 
                      type="date" 
                      value={filterInput.startDate} 
                      onChange={e => setFilterInput({...filterInput, startDate: e.target.value, month: ''})} 
                      style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', outline: 'none' }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>End Date</label>
                    <input 
                      type="date" 
                      value={filterInput.endDate} 
                      onChange={e => setFilterInput({...filterInput, endDate: e.target.value, month: ''})} 
                      style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', outline: 'none' }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>Specific Month</label>
                    <input 
                      type="month" 
                      value={filterInput.month} 
                      onChange={e => setFilterInput({...filterInput, month: e.target.value, startDate: '', endDate: ''})} 
                      style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', outline: 'none' }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>Tx Type</label>
                    <select 
                      value={filterInput.transactionType} 
                      onChange={e => setFilterInput({...filterInput, transactionType: e.target.value})} 
                      style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', outline: 'none', background: 'white' }}
                    >
                      <option value="All">All Types</option>
                      <option value="Credit">Credit (+)</option>
                      <option value="Debit">Debit (-)</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>Status</label>
                    <select 
                      value={filterInput.status} 
                      onChange={e => setFilterInput({...filterInput, status: e.target.value})} 
                      style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', outline: 'none', background: 'white' }}
                    >
                      <option value="All">All Statuses</option>
                      <option value="Success">Success</option>
                      <option value="Pending">Pending</option>
                      <option value="Failed">Failed</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>Search Keywords (Ref, Description...)</label>
                    <input 
                      type="text" 
                      placeholder="e.g. UPI, NetBanking, topup..." 
                      value={filterInput.search} 
                      onChange={e => setFilterInput({...filterInput, search: e.target.value})} 
                      style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', outline: 'none' }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>Items Per Page</label>
                    <select
                      value={ledgerPageSize}
                      onChange={e => { setLedgerPageSize(Number(e.target.value)); setLedgerPage(1); }}
                      style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', outline: 'none', background: 'white' }}
                    >
                      <option value={10}>10 per page</option>
                      <option value={25}>25 per page</option>
                      <option value={50}>50 per page</option>
                      <option value={100}>100 per page</option>
                    </select>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <button
                    type="button"
                    style={{
                      padding: '8px 16px',
                      background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '13px',
                      fontWeight: '800',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      boxShadow: '0 4px 10px rgba(37,99,235,0.2)'
                    }}
                    onClick={() => {
                      const todayStr = new Date().toISOString().split('T')[0];
                      const todayFilters = { ...filterInput, startDate: todayStr, endDate: todayStr, month: '' };
                      setFilterInput(todayFilters);
                      setLedgerFilters(todayFilters);
                      setLedgerPage(1);
                    }}
                  >
                    📅 Today's Applications / Transactions
                  </button>
                  <button onClick={handleResetFilters} style={{ padding: '8px 16px', background: '#cbd5e1', color: '#1e293b', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
                    Reset Filters
                  </button>
                  <button onClick={handleApplyFilters} style={{ padding: '8px 20px', background: 'linear-gradient(135deg, #1b2559 0%, #4318ff 100%)', color: 'white', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 800, cursor: 'pointer', boxShadow: '0 4px 10px rgba(67,24,255,0.2)' }}>
                    Apply Filters
                  </button>
                </div>
              </div>

              {/* Transactions Table */}
              {(() => {
                const totalLedgerPages = Math.ceil(ledgerTransactions.length / ledgerPageSize) || 1;
                const currentLedgerPage = Math.min(ledgerPage, totalLedgerPages);
                const ledgerStartIndex = (currentLedgerPage - 1) * ledgerPageSize;
                const paginatedLedger = ledgerTransactions.slice(ledgerStartIndex, ledgerStartIndex + ledgerPageSize);

                return (
                  <div>
                    <div className="modern-table-container" style={{ flex: 1, maxHeight: '500px', overflowY: 'auto' }}>
                      <table className="modern-table" style={{ width: '100%' }}>
                        <thead>
                          <tr style={{ position: 'sticky', top: 0, zIndex: 10, background: '#f1f5f9' }}>
                            <th style={{ padding: '12px' }}>Date & Time</th>
                            <th style={{ padding: '12px' }}>User ID</th>
                            <th style={{ padding: '12px' }}>Type</th>
                            <th style={{ padding: '12px' }}>Amount</th>
                            <th style={{ padding: '12px' }}>Before</th>
                            <th style={{ padding: '12px' }}>After</th>
                            <th style={{ padding: '12px' }}>Description</th>
                            <th style={{ padding: '12px' }}>Reference No</th>
                            <th style={{ padding: '12px' }}>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ledgerLoading ? (
                            <tr>
                              <td colSpan="9" style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                                <div style={{ display: 'inline-block', width: '24px', height: '24px', border: '3px solid #cbd5e1', borderTopColor: '#4318ff', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                                <div style={{ marginTop: '8px', fontSize: '13px', fontWeight: 'bold' }}>Loading transactions...</div>
                              </td>
                            </tr>
                          ) : ledgerTransactions.length === 0 ? (
                            <tr>
                              <td colSpan="9" style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                                <span style={{ fontSize: '30px' }}>📭</span>
                                <p style={{ margin: '5px 0 0 0', fontSize: '13px' }}>No transactions found for the selected filters.</p>
                              </td>
                            </tr>
                          ) : (
                            paginatedLedger.map(tx => (
                              <tr key={tx._id}>
                                <td style={{ whiteSpace: 'nowrap', padding: '12px', fontSize: '13px', color: '#1e293b', fontWeight: 600 }}>{new Date(tx.createdAt).toLocaleString()}</td>
                                <td style={{ padding: '12px', fontSize: '13px' }}><strong>{tx.userId}</strong></td>
                                <td style={{ padding: '12px', fontSize: '13px' }}>
                                  <span className={`status-badge ${tx.transactionType === 'Credit' ? 'status-approved' : 'status-rejected'}`} style={{ padding: '4px 8px', fontSize: '11px' }}>
                                    {tx.transactionType}
                                  </span>
                                </td>
                                <td style={{ padding: '12px', fontSize: '13px' }}><strong style={{ color: tx.transactionType === 'Credit' ? '#10b981' : '#ef4444' }}>{tx.transactionType === 'Credit' ? '+' : '-'} ₹{parseFloat(tx.amount).toFixed(2)}</strong></td>
                                <td style={{ color: '#64748b', padding: '12px', fontSize: '13px' }}>₹{parseFloat(tx.balanceBefore).toFixed(2)}</td>
                                <td style={{ fontWeight: 600, padding: '12px', fontSize: '13px' }}>₹{parseFloat(tx.balanceAfter).toFixed(2)}</td>
                                <td style={{ padding: '12px', fontSize: '13px', color: '#334155', fontWeight: 600 }}>{tx.description}</td>
                                <td style={{ fontFamily: 'monospace', fontSize: '11px', padding: '12px' }}>{tx.referenceNumber}</td>
                                <td style={{ padding: '12px', fontSize: '13px' }}>
                                  <span className={`status-badge ${tx.status === 'Success' ? 'status-approved' : tx.status === 'Pending' ? 'status-pending' : 'status-rejected'}`} style={{ padding: '4px 8px', fontSize: '11px' }}>
                                    {tx.status}
                                  </span>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Ledger Pagination Footer */}
                    <div style={{
                      display: 'flex',
                      justify: 'space-between',
                      alignItems: 'center',
                      marginTop: '12px',
                      padding: '12px 16px',
                      background: '#f8fafc',
                      borderRadius: '10px',
                      border: '1px solid #e2e8f0',
                      flexWrap: 'wrap',
                      gap: '10px'
                    }}>
                      <div style={{ fontSize: '12.5px', color: '#475569', fontWeight: '600' }}>
                        Showing <strong>{ledgerTransactions.length === 0 ? 0 : ledgerStartIndex + 1}</strong> to <strong>{Math.min(ledgerStartIndex + ledgerPageSize, ledgerTransactions.length)}</strong> of <strong>{ledgerTransactions.length}</strong> transactions
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <button
                          type="button"
                          disabled={currentLedgerPage <= 1}
                          onClick={() => setLedgerPage(prev => Math.max(1, prev - 1))}
                          style={{
                            padding: '6px 12px',
                            borderRadius: '6px',
                            border: '1px solid #cbd5e1',
                            background: currentLedgerPage <= 1 ? '#f1f5f9' : '#ffffff',
                            color: currentLedgerPage <= 1 ? '#94a3b8' : '#1e293b',
                            fontWeight: '700',
                            fontSize: '12px',
                            cursor: currentLedgerPage <= 1 ? 'not-allowed' : 'pointer'
                          }}
                        >
                          ◀ Prev
                        </button>

                        <span style={{ fontSize: '12px', fontWeight: '700', color: '#334155', padding: '0 8px' }}>
                          Page {currentLedgerPage} of {totalLedgerPages}
                        </span>

                        <button
                          type="button"
                          disabled={currentLedgerPage >= totalLedgerPages}
                          onClick={() => setLedgerPage(prev => Math.min(totalLedgerPages, prev + 1))}
                          style={{
                            padding: '6px 12px',
                            borderRadius: '6px',
                            border: '1px solid #cbd5e1',
                            background: currentLedgerPage >= totalLedgerPages ? '#f1f5f9' : '#ffffff',
                            color: currentLedgerPage >= totalLedgerPages ? '#94a3b8' : '#1e293b',
                            fontWeight: '700',
                            fontSize: '12px',
                            cursor: currentLedgerPage >= totalLedgerPages ? 'not-allowed' : 'pointer'
                          }}
                        >
                          Next ▶
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Customer Management Tab (Admin Only - OTP-Free Viewing) */}
          {activeTab === 'customerManagement' && (
            <AdminCustomerManagement
              hasStaffActionAccess={hasStaffActionAccess}
              userRole={userRole}
            />
          )}

          {/* Staff Management Tab (Admin Only) */}
          {activeTab === 'staffMembers' && userRole === 'admin' && (() => {
            const totalStaffCount = staffList.length;
            const activeStaffCount = staffList.filter(s => s.isActive !== false).length;
            const suspendedStaffCount = staffList.filter(s => s.isActive === false).length;
            const totalPermissionsAssigned = staffList.reduce((acc, s) => acc + (s.permissions || []).length, 0);

            return (
              <div className="staff-container" style={{ padding: '0 4px' }}>
                
                {/* KPI Stats Overview Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                  <div style={{ background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)', border: '1.5px solid #e2e8f0', borderRadius: '16px', padding: '18px 22px', boxShadow: '0 4px 14px rgba(0,0,0,0.03)', display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', boxShadow: '0 4px 12px rgba(2, 132, 199, 0.3)' }}>
                      👥
                    </div>
                    <div>
                      <div style={{ fontSize: '12px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Total Staff Accounts
                      </div>
                      <div style={{ fontSize: '24px', fontWeight: 900, color: '#0f172a', margin: '2px 0 0' }}>
                        {totalStaffCount}
                      </div>
                    </div>
                  </div>

                  <div style={{ background: 'linear-gradient(135deg, #ffffff 0%, #f0fdf4 100%)', border: '1.5px solid #bbf7d0', borderRadius: '16px', padding: '18px 22px', boxShadow: '0 4px 14px rgba(0,0,0,0.03)', display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: 'linear-gradient(135deg, #10b981 0%, #047857 100%)', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)' }}>
                      🟢
                    </div>
                    <div>
                      <div style={{ fontSize: '12px', fontWeight: 800, color: '#15803d', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Active & Operational
                      </div>
                      <div style={{ fontSize: '24px', fontWeight: 900, color: '#14532d', margin: '2px 0 0' }}>
                        {activeStaffCount}
                      </div>
                    </div>
                  </div>

                  <div style={{ background: 'linear-gradient(135deg, #ffffff 0%, #fff7ed 100%)', border: '1.5px solid #fed7aa', borderRadius: '16px', padding: '18px 22px', boxShadow: '0 4px 14px rgba(0,0,0,0.03)', display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', boxShadow: '0 4px 12px rgba(234, 88, 12, 0.3)' }}>
                      🛡️
                    </div>
                    <div>
                      <div style={{ fontSize: '12px', fontWeight: 800, color: '#c2410c', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Assigned Permissions
                      </div>
                      <div style={{ fontSize: '24px', fontWeight: 900, color: '#7c2d12', margin: '2px 0 0' }}>
                        {totalPermissionsAssigned}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Main Header Card with Controls */}
                <div style={{ background: '#ffffff', border: '1.5px solid #e2e8f0', borderRadius: '18px', padding: '20px 24px', marginBottom: '24px', boxShadow: '0 4px 16px rgba(0, 0, 0, 0.04)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span>👔</span> Staff Access Control & Role Manager
                      </h3>
                      <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>
                        Create team member credentials and assign specific module permissions for secure admin access.
                      </p>
                    </div>

                    <button 
                      type="button"
                      className="staff-add-btn"
                      onClick={handleOpenAddStaff}
                      style={{
                        background: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)',
                        color: '#ffffff',
                        border: 'none',
                        padding: '12px 22px',
                        borderRadius: '12px',
                        fontSize: '14px',
                        fontWeight: 800,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        boxShadow: '0 4px 14px rgba(234, 88, 12, 0.35)',
                        transition: 'transform 0.15s ease'
                      }}
                    >
                      <span>➕</span> Add New Staff Member
                    </button>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '18px', paddingTop: '16px', borderTop: '1px solid #f1f5f9', flexWrap: 'wrap', gap: '14px' }}>
                    {/* Status Filter Switcher */}
                    <div style={{ display: 'flex', gap: '6px', background: '#f1f5f9', padding: '4px', borderRadius: '12px' }}>
                      <button
                        type="button"
                        onClick={() => setStaffStatusFilter('ALL')}
                        style={{
                          background: staffStatusFilter === 'ALL' ? '#ffffff' : 'transparent',
                          color: staffStatusFilter === 'ALL' ? '#0f172a' : '#64748b',
                          border: 'none',
                          padding: '6px 14px',
                          borderRadius: '9px',
                          fontSize: '12.5px',
                          fontWeight: 800,
                          cursor: 'pointer',
                          boxShadow: staffStatusFilter === 'ALL' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none'
                        }}
                      >
                        All Staff ({totalStaffCount})
                      </button>
                      <button
                        type="button"
                        onClick={() => setStaffStatusFilter('ACTIVE')}
                        style={{
                          background: staffStatusFilter === 'ACTIVE' ? '#10b981' : 'transparent',
                          color: staffStatusFilter === 'ACTIVE' ? '#ffffff' : '#15803d',
                          border: 'none',
                          padding: '6px 14px',
                          borderRadius: '9px',
                          fontSize: '12.5px',
                          fontWeight: 800,
                          cursor: 'pointer',
                          boxShadow: staffStatusFilter === 'ACTIVE' ? '0 2px 6px rgba(16,185,129,0.3)' : 'none'
                        }}
                      >
                        🟢 Active ({activeStaffCount})
                      </button>
                      <button
                        type="button"
                        onClick={() => setStaffStatusFilter('SUSPENDED')}
                        style={{
                          background: staffStatusFilter === 'SUSPENDED' ? '#ef4444' : 'transparent',
                          color: staffStatusFilter === 'SUSPENDED' ? '#ffffff' : '#b91c1c',
                          border: 'none',
                          padding: '6px 14px',
                          borderRadius: '9px',
                          fontSize: '12.5px',
                          fontWeight: 800,
                          cursor: 'pointer',
                          boxShadow: staffStatusFilter === 'SUSPENDED' ? '0 2px 6px rgba(239,68,68,0.3)' : 'none'
                        }}
                      >
                        🔴 Suspended ({suspendedStaffCount})
                      </button>
                    </div>

                    {/* View Switcher & Search Bar */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                      {/* View Mode Switcher */}
                      <div style={{ display: 'flex', gap: '4px', background: '#f1f5f9', padding: '4px', borderRadius: '12px' }}>
                        <button
                          type="button"
                          onClick={() => setStaffViewMode('GRID')}
                          style={{
                            background: staffViewMode === 'GRID' ? '#ffffff' : 'transparent',
                            color: staffViewMode === 'GRID' ? '#ea580c' : '#64748b',
                            border: 'none',
                            padding: '6px 12px',
                            borderRadius: '9px',
                            fontSize: '12px',
                            fontWeight: 800,
                            cursor: 'pointer',
                            boxShadow: staffViewMode === 'GRID' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none'
                          }}
                        >
                          🔲 Grid Cards
                        </button>
                        <button
                          type="button"
                          onClick={() => setStaffViewMode('TABLE')}
                          style={{
                            background: staffViewMode === 'TABLE' ? '#ffffff' : 'transparent',
                            color: staffViewMode === 'TABLE' ? '#ea580c' : '#64748b',
                            border: 'none',
                            padding: '6px 12px',
                            borderRadius: '9px',
                            fontSize: '12px',
                            fontWeight: 800,
                            cursor: 'pointer',
                            boxShadow: staffViewMode === 'TABLE' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none'
                          }}
                        >
                          📋 Table View
                        </button>
                        <button
                          type="button"
                          onClick={() => setStaffViewMode('BOTH')}
                          style={{
                            background: staffViewMode === 'BOTH' ? '#ffffff' : 'transparent',
                            color: staffViewMode === 'BOTH' ? '#ea580c' : '#64748b',
                            border: 'none',
                            padding: '6px 12px',
                            borderRadius: '9px',
                            fontSize: '12px',
                            fontWeight: 800,
                            cursor: 'pointer',
                            boxShadow: staffViewMode === 'BOTH' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none'
                          }}
                        >
                          📊 Show Both
                        </button>
                      </div>

                      {/* Search Bar */}
                      <div style={{ position: 'relative', width: '280px', maxWidth: '100%' }}>
                        <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '15px' }}>
                          🔍
                        </span>
                        <input 
                          type="text" 
                          className="staff-search-input" 
                          placeholder="Search name, username, mobile..." 
                          value={staffSearch}
                          onChange={(e) => setStaffSearch(e.target.value)}
                          style={{
                            width: '100%',
                            padding: '9px 14px 9px 36px',
                            border: '1.5px solid #cbd5e1',
                            borderRadius: '10px',
                            fontSize: '13px',
                            outline: 'none',
                            boxSizing: 'border-box'
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Staff Cards Grid */}
                {staffLoading ? (
                  <div style={{ textAlign: 'center', padding: '60px', color: '#64748b' }}>
                    <div style={{ display: 'inline-block', width: '32px', height: '32px', border: '3px solid #cbd5e1', borderTopColor: '#ea580c', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                    <p style={{ marginTop: '12px', fontWeight: 700, fontSize: '14px' }}>Loading staff records...</p>
                  </div>
                ) : filteredStaffList.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '60px 20px', background: '#ffffff', borderRadius: '18px', border: '1.5px solid #e2e8f0', boxShadow: '0 4px 16px rgba(0,0,0,0.03)' }}>
                    <span style={{ fontSize: '48px', display: 'block', marginBottom: '10px' }}>👥</span>
                    <h4 style={{ margin: '0 0 6px 0', fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>
                      {staffSearch ? 'No staff member found matching your search' : 'No staff accounts created yet'}
                    </h4>
                    <p style={{ margin: '0 0 16px 0', fontSize: '13.5px', color: '#64748b', maxWidth: '460px', marginLeft: 'auto', marginRight: 'auto' }}>
                      Click "Add New Staff Member" above to create credentials and assign tab module permissions.
                    </p>
                    <button 
                      type="button"
                      onClick={handleOpenAddStaff}
                      style={{ background: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)', color: '#ffffff', border: 'none', padding: '10px 20px', borderRadius: '10px', fontSize: '13px', fontWeight: 800, cursor: 'pointer' }}
                    >
                      ➕ Add First Staff Member
                    </button>
                  </div>
                ) : (
                  <div>
                    {/* Data Table View */}
                    {(staffViewMode === 'TABLE' || staffViewMode === 'BOTH') && (
                      <div style={{ background: '#ffffff', border: '1.5px solid #e2e8f0', borderRadius: '18px', padding: '16px', boxShadow: '0 4px 16px rgba(0,0,0,0.04)', overflowX: 'auto', marginBottom: staffViewMode === 'BOTH' ? '28px' : '0' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', paddingBottom: '10px', borderBottom: '1px solid #f1f5f9' }}>
                          <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span>📋</span> Staff Accounts Data Table ({filteredStaffList.length})
                          </h4>
                          <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>Showing active & suspended accounts</span>
                        </div>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                          <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569' }}>
                              <th style={{ padding: '12px 14px', fontWeight: 800, fontSize: '12px', letterSpacing: '0.5px' }}>STAFF MEMBER</th>
                              <th style={{ padding: '12px 14px', fontWeight: 800, fontSize: '12px', letterSpacing: '0.5px' }}>CONTACT DETAILS</th>
                              <th style={{ padding: '12px 14px', fontWeight: 800, fontSize: '12px', letterSpacing: '0.5px' }}>STATUS</th>
                              <th style={{ padding: '12px 14px', fontWeight: 800, fontSize: '12px', letterSpacing: '0.5px', textAlign: 'right' }}>ACTIONS</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredStaffList.map(staff => {
                              const isStaffActive = staff.isActive !== false;
                              return (
                                <tr key={staff._id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                  <td style={{ padding: '14px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                      <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: isStaffActive ? 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)' : '#64748b', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '16px', boxShadow: isStaffActive ? '0 3px 8px rgba(234, 88, 12, 0.25)' : 'none' }}>
                                        {staff.name ? staff.name.charAt(0).toUpperCase() : 'S'}
                                      </div>
                                      <div>
                                        <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '14px' }}>{staff.name}</div>
                                        <span style={{ fontSize: '11px', fontWeight: 800, color: '#ea580c', background: '#fff7ed', padding: '2px 6px', borderRadius: '5px', fontFamily: 'monospace' }}>@{staff.username}</span>
                                      </div>
                                    </div>
                                  </td>
                                  <td style={{ padding: '14px' }}>
                                    <div style={{ color: '#334155', fontWeight: 600, fontSize: '12.5px' }}>✉️ {staff.email || 'No Email'}</div>
                                    <div style={{ color: '#64748b', fontSize: '12px', marginTop: '2px' }}>📱 {staff.mobile || 'No Mobile'}</div>
                                  </td>
                                  <td style={{ padding: '14px' }}>
                                    <button
                                      type="button"
                                      onClick={() => handleToggleStaffStatus(staff)}
                                      style={{
                                        background: isStaffActive ? '#dcfce7' : '#fee2e2',
                                        color: isStaffActive ? '#15803d' : '#dc2626',
                                        border: `1px solid ${isStaffActive ? '#86efac' : '#fca5a5'}`,
                                        padding: '4px 10px',
                                        borderRadius: '8px',
                                        fontSize: '11.5px',
                                        fontWeight: 800,
                                        cursor: 'pointer'
                                      }}
                                    >
                                      {isStaffActive ? '● Active' : '○ Suspended'}
                                    </button>
                                  </td>
                                  <td style={{ padding: '14px', textAlign: 'right' }}>
                                    <div style={{ display: 'inline-flex', gap: '8px' }}>
                                      <button
                                        type="button"
                                        onClick={() => handleOpenEditStaff(staff)}
                                        style={{ background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)', color: '#ffffff', border: 'none', padding: '7px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 800, cursor: 'pointer', boxShadow: '0 2px 6px rgba(2, 132, 199, 0.2)' }}
                                      >
                                        ✏️ Edit
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteStaff(staff._id, staff.name)}
                                        style={{ background: '#fff1f2', color: '#e11d48', border: '1px solid #fecdd3', padding: '7px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 800, cursor: 'pointer' }}
                                      >
                                        🗑️ Delete
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Grid Cards View */}
                    {(staffViewMode === 'GRID' || staffViewMode === 'BOTH') && (
                      <div>
                        {staffViewMode === 'BOTH' && (
                          <h4 style={{ margin: '0 0 14px 0', fontSize: '15px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span>🔲</span> Staff Cards Grid ({filteredStaffList.length})
                          </h4>
                        )}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '20px' }}>
                          {filteredStaffList.map(staff => {
                            const isStaffActive = staff.isActive !== false;
                            const perms = staff.permissions || [];

                            return (
                              <div 
                                key={staff._id} 
                                style={{
                                  background: '#ffffff',
                                  border: isStaffActive ? '1.5px solid #e2e8f0' : '1.5px solid #fca5a5',
                                  borderRadius: '18px',
                                  padding: '20px',
                                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.04)',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  justifyContent: 'space-between',
                                  gap: '16px',
                                  transition: 'transform 0.2s ease, box-shadow 0.2s ease'
                                }}
                              >
                                <div>
                                  {/* Top Row: Avatar, Info, Status Badge */}
                                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '14px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                                      <div 
                                        style={{
                                          width: '48px',
                                          height: '48px',
                                          borderRadius: '14px',
                                          background: isStaffActive ? 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)' : '#64748b',
                                          color: '#ffffff',
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          fontSize: '20px',
                                          fontWeight: 900,
                                          boxShadow: isStaffActive ? '0 4px 12px rgba(234, 88, 12, 0.3)' : 'none'
                                        }}
                                      >
                                        {staff.name ? staff.name.charAt(0).toUpperCase() : 'S'}
                                      </div>
                                      <div>
                                        <h4 style={{ margin: 0, fontSize: '16.5px', fontWeight: 800, color: '#0f172a' }}>
                                          {staff.name}
                                        </h4>
                                        <span style={{ display: 'inline-block', marginTop: '2px', background: '#f1f5f9', color: '#ea580c', padding: '2px 8px', borderRadius: '6px', fontSize: '11.5px', fontWeight: 800, fontFamily: 'monospace' }}>
                                          @{staff.username}
                                        </span>
                                      </div>
                                    </div>

                                    <button 
                                      type="button"
                                      onClick={() => handleToggleStaffStatus(staff)}
                                      style={{
                                        background: isStaffActive ? '#dcfce7' : '#fee2e2',
                                        color: isStaffActive ? '#15803d' : '#dc2626',
                                        border: `1px solid ${isStaffActive ? '#86efac' : '#fca5a5'}`,
                                        padding: '4px 10px',
                                        borderRadius: '10px',
                                        fontSize: '11.5px',
                                        fontWeight: 800,
                                        cursor: 'pointer',
                                        whiteSpace: 'nowrap'
                                      }}
                                      title="Click to toggle staff active status"
                                    >
                                      {isStaffActive ? '● Active' : '○ Suspended'}
                                    </button>
                                  </div>

                                  {/* Contact Info Pills */}
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '6px' }}>
                                    <span style={{ background: '#f8fafc', border: '1px solid #e2e8f0', color: '#475569', padding: '6px 12px', borderRadius: '8px', fontSize: '12.5px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                      ✉️ {staff.email || 'No Email'}
                                    </span>
                                    <span style={{ background: '#f8fafc', border: '1px solid #e2e8f0', color: '#475569', padding: '6px 12px', borderRadius: '8px', fontSize: '12.5px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                      📱 {staff.mobile || 'No Mobile'}
                                    </span>
                                  </div>
                                </div>

                                {/* Footer Actions */}
                                <div style={{ display: 'flex', gap: '10px', paddingTop: '14px', borderTop: '1px solid #f1f5f9' }}>
                                  <button 
                                    type="button"
                                    onClick={() => handleOpenEditStaff(staff)}
                                    style={{
                                      flex: 1,
                                      padding: '9px 12px',
                                      background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                                      color: '#ffffff',
                                      border: 'none',
                                      borderRadius: '10px',
                                      fontSize: '12.5px',
                                      fontWeight: 800,
                                      cursor: 'pointer',
                                      boxShadow: '0 3px 10px rgba(2, 132, 199, 0.25)'
                                    }}
                                  >
                                    ✏️ Edit Credentials & Access
                                  </button>
                                  <button 
                                    type="button"
                                    onClick={() => handleDeleteStaff(staff._id, staff.name)}
                                    style={{
                                      padding: '9px 14px',
                                      background: '#fff1f2',
                                      color: '#e11d48',
                                      border: '1px solid #fecdd3',
                                      borderRadius: '10px',
                                      fontSize: '12.5px',
                                      fontWeight: 800,
                                      cursor: 'pointer'
                                    }}
                                    title="Delete Staff Account"
                                  >
                                    🗑️ Delete
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

              </div>
            );
          })()}

          {/* No Access Warning for Staff without permissions */}
          {userRole === 'staff' && menuItems.length === 0 && (
            <div style={{ textAlign: 'center', padding: '60px 20px', background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>🔒</div>
              <h3 style={{ fontSize: '20px', fontWeight: 800, color: '#1e293b', margin: '0 0 8px 0' }}>No Access Assigned</h3>
              <p style={{ color: '#64748b', fontSize: '14px', maxWidth: '460px', margin: '0 auto' }}>
                Your staff account is active, but the administrator has not granted permissions to any modules yet. Please contact the administrator.
              </p>
            </div>
          )}

        </div>
      </main>

      {/* ========================================================================= */}
      {/* MODAL: VIEW FULL APPLICATION DETAILS (ADMIN PANEL) WITH COPY OPTION */}
      {/* ========================================================================= */}
      {selectedPanAppForModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0, 0, 0, 0.85)', zIndex: 99999, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 12px 12px 12px', backdropFilter: 'blur(4px)', overflowY: 'auto' }}>
          <div style={{ background: '#1e293b', border: '1.5px solid #0284c7', borderRadius: '16px', width: '96%', maxWidth: '940px', maxHeight: 'calc(100vh - 48px)', display: 'flex', flexDirection: 'column', color: '#fff', boxShadow: '0 25px 60px rgba(0,0,0,0.7)', overflow: 'hidden' }}>

            {/* Fixed Header Bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#0f172a', borderBottom: '1px solid rgba(255,255,255,0.1)', padding: '12px 20px', gap: '10px' }}>
              <div>
                <h4 style={{ margin: 0, fontSize: '16px', color: '#38bdf8', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>📋</span> <span>PAN Form Details</span>
                  <span style={{ fontSize: '12px', background: 'rgba(2, 132, 199, 0.25)', border: '1px solid rgba(56, 189, 248, 0.4)', color: '#7dd3fc', padding: '2px 8px', borderRadius: '6px', fontWeight: '700' }}>
                    ACK: {selectedPanAppForModal.ackNumber || 'N/A'}
                  </span>
                </h4>
                <div style={{ fontSize: '11.5px', color: '#94a3b8', marginTop: '2px' }}>
                  Submitted by Retailer: <strong style={{ color: '#e2e8f0' }}>{selectedPanAppForModal.userId || selectedPanAppForModal.userMobile || 'Retailer'}</strong>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => copyApplicationDetailsToClipboard(selectedPanAppForModal)}
                  style={{
                    background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                    color: '#ffffff',
                    border: '1px solid rgba(56, 189, 248, 0.5)',
                    padding: '6px 14px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: '800',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 2px 8px rgba(2, 132, 199, 0.35)',
                    transition: 'all 0.15s ease'
                  }}
                  title="Copy all application details to clipboard"
                >
                  <span>📋</span> <span>Copy Details</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedPanAppForModal(null)}
                  style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', width: '30px', height: '30px', borderRadius: '50%', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#ef4444'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Scrollable Body Content (Compact 2-Column Dashboard Layout) */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12.5px' }}>
              {(() => {
                const d = selectedPanAppForModal.details || {};
                const catStr = String(d.category || selectedPanAppForModal.category || d.applicantStatus || selectedPanAppForModal.applicantStatus || '').toUpperCase();
                const nonIndTypes = ['COMPANY', 'FIRM', 'TRUST', 'HUF', 'HINDU', 'ASSOCIATION', 'AOP', 'BODY', 'BOI', 'LOCAL', 'ARTIFICIAL', 'AJP', 'GOVERNMENT', 'LIMITED', 'LLP'];
                const isNonIndiv = nonIndTypes.some(t => catStr.includes(t)) || (catStr !== '' && catStr !== 'INDIVIDUAL');

                const appStatus = (selectedPanAppForModal.status || 'Submitted').toUpperCase();
                const statusColor = appStatus === 'APPROVED' || appStatus === 'COMPLETED' ? '#10b981' : appStatus === 'REJECTED' ? '#ef4444' : '#f59e0b';
                const statusBg = appStatus === 'APPROVED' || appStatus === 'COMPLETED' ? 'rgba(16, 185, 129, 0.15)' : appStatus === 'REJECTED' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)';

                return (
                  <>
                    {/* Top Status & Type Bar */}
                    <div style={{ background: 'linear-gradient(135deg, rgba(2, 132, 199, 0.12) 0%, rgba(15, 23, 42, 0.4) 100%)', border: '1px solid rgba(56, 189, 248, 0.25)', padding: '8px 14px', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ color: '#94a3b8', fontSize: '11.5px', fontWeight: '600' }}>Current Status:</span>
                        <span style={{ background: statusBg, border: `1px solid ${statusColor}`, color: statusColor, padding: '2px 10px', borderRadius: '14px', fontWeight: '800', fontSize: '11.5px', letterSpacing: '0.4px' }}>
                          {appStatus}
                        </span>
                        {selectedPanAppForModal.nsdlReceiptNumber && (
                          <span style={{ background: 'rgba(245, 158, 11, 0.15)', border: '1px solid #f59e0b', color: '#fbbf24', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '700', fontFamily: 'monospace' }}>
                            NSDL: {selectedPanAppForModal.nsdlReceiptNumber}
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        {selectedPanAppForModal.receiptUrl && (
                          <button
                            type="button"
                            onClick={() => window.open(selectedPanAppForModal.receiptUrl, '_blank')}
                            style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '800', cursor: 'pointer', boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)' }}
                          >
                            📄 View Approved Receipt
                          </button>
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ color: '#94a3b8', fontSize: '11.5px' }}>Type:</span>
                          <strong style={{ color: '#38bdf8', background: 'rgba(2, 132, 199, 0.2)', padding: '2px 8px', borderRadius: '5px', fontSize: '11.5px' }}>
                            {selectedPanAppForModal.applicationType || 'Manual New PAN'}
                          </strong>
                        </div>
                      </div>
                    </div>

                    {/* 2-Column Responsive Dashboard */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: '10px' }}>
                      {isNonIndiv ? (
                        <>
                          {/* Non-Individual Left Column: Entity Particulars & Authorized Signatory */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <div style={{ background: 'rgba(15, 23, 42, 0.5)', padding: '12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)' }}>
                              <h5 style={{ margin: '0 0 8px 0', color: '#fb923c', fontSize: '13px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span>🏢</span> <span>Entity Particulars</span>
                              </h5>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px', color: '#cbd5e1', fontSize: '12px' }}>
                                <div style={{ gridColumn: 'span 2' }}><span style={{ color: '#94a3b8' }}>Entity Name:</span> <strong style={{ color: '#f8fafc' }}>{d.entityName || selectedPanAppForModal.applicantName || d.lastName || '—'}</strong></div>
                                <div><span style={{ color: '#94a3b8' }}>Category:</span> <strong style={{ color: '#38bdf8' }}>{catStr || 'COMPANY'}</strong></div>
                                <div><span style={{ color: '#94a3b8' }}>Date of Incorp:</span> <strong style={{ color: '#f8fafc' }}>{d.dateOfIncorporation || selectedPanAppForModal.dob || d.dob || '—'}</strong></div>
                                <div style={{ gridColumn: 'span 2' }}><span style={{ color: '#94a3b8' }}>Reg / CIN / LLPIN:</span> <strong style={{ color: '#f8fafc' }}>{d.registrationNumber || d.cin || d.llpin || '—'}</strong></div>
                                {(selectedPanAppForModal.panNumber || d.panNumber) && (
                                  <div><span style={{ color: '#94a3b8' }}>Existing PAN:</span> <strong style={{ color: '#f8fafc' }}>{selectedPanAppForModal.panNumber || d.panNumber}</strong></div>
                                )}
                                <div><span style={{ color: '#94a3b8' }}>Mobile:</span> <strong style={{ color: '#f8fafc' }}>{selectedPanAppForModal.mobileNumber || d.mobileNumber || '—'}</strong></div>
                                <div><span style={{ color: '#94a3b8' }}>Email:</span> <strong style={{ color: '#f8fafc' }}>{selectedPanAppForModal.email || d.email || '—'}</strong></div>
                                <div style={{ gridColumn: 'span 2' }}><span style={{ color: '#94a3b8' }}>Income Source:</span> <strong style={{ color: '#f8fafc' }}>{d.incomeSource || d.sourceOfIncome || d.sourceofincome || 'BUSINESS / PROFESSION'}</strong></div>
                              </div>
                            </div>

                            <div style={{ background: 'rgba(15, 23, 42, 0.5)', padding: '12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)' }}>
                              <h5 style={{ margin: '0 0 8px 0', color: '#fb923c', fontSize: '13px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span>✍️</span> <span>Authorized Signatory</span>
                              </h5>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px', color: '#cbd5e1', fontSize: '12px' }}>
                                <div><span style={{ color: '#94a3b8' }}>Signatory Name:</span> <strong style={{ color: '#f8fafc' }}>{d.verifierName || d.raName || selectedPanAppForModal.fatherName || '—'}</strong></div>
                                <div><span style={{ color: '#94a3b8' }}>Designation:</span> <strong style={{ color: '#f8fafc' }}>{d.verifierCapacity || d.designation || 'DIRECTOR'}</strong></div>
                                <div><span style={{ color: '#94a3b8' }}>Place:</span> <strong style={{ color: '#f8fafc' }}>{d.verifierPlace || d.place || '—'}</strong></div>
                                <div><span style={{ color: '#94a3b8' }}>Date:</span> <strong style={{ color: '#f8fafc' }}>{d.verifierDate || d.date || '—'}</strong></div>
                              </div>
                            </div>
                          </div>

                          {/* Non-Individual Right Column: Office Address & Seal/Signature */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <div style={{ background: 'rgba(15, 23, 42, 0.5)', padding: '12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)' }}>
                              <h5 style={{ margin: '0 0 8px 0', color: '#fb923c', fontSize: '13px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span>🏢</span> <span>Registered / Office Address</span>
                              </h5>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 10px', color: '#cbd5e1', fontSize: '12px' }}>
                                <div><span style={{ color: '#94a3b8' }}>Flat/Door:</span> <strong style={{ color: '#e2e8f0' }}>{(d.officeAddress && d.officeAddress.flatNo) || d.flatNo || '—'}</strong></div>
                                <div><span style={{ color: '#94a3b8' }}>Building:</span> <strong style={{ color: '#e2e8f0' }}>{(d.officeAddress && d.officeAddress.premises) || d.premises || '—'}</strong></div>
                                <div><span style={{ color: '#94a3b8' }}>Street:</span> <strong style={{ color: '#e2e8f0' }}>{(d.officeAddress && d.officeAddress.roadStreet) || d.roadStreet || '—'}</strong></div>
                                <div><span style={{ color: '#94a3b8' }}>Area:</span> <strong style={{ color: '#e2e8f0' }}>{(d.officeAddress && d.officeAddress.areaTaluka) || d.areaTaluka || '—'}</strong></div>
                                <div><span style={{ color: '#94a3b8' }}>District:</span> <strong style={{ color: '#38bdf8' }}>{(d.officeAddress && d.officeAddress.district) || ((d.district && d.district !== 'SELECT') ? d.district : (selectedPanAppForModal.district || '—'))}</strong></div>
                                <div><span style={{ color: '#94a3b8' }}>State:</span> <strong style={{ color: '#38bdf8' }}>{(d.officeAddress && d.officeAddress.state) || ((d.state && d.state !== 'PLEASE SELECT') ? d.state : (selectedPanAppForModal.state || 'MAHARASHTRA'))}</strong></div>
                                <div><span style={{ color: '#94a3b8' }}>Pincode:</span> <strong style={{ color: '#f8fafc' }}>{(d.officeAddress && d.officeAddress.pincode) || d.pincode || '—'}</strong></div>
                              </div>
                            </div>

                            <div style={{ background: 'rgba(15, 23, 42, 0.5)', padding: '10px 12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)' }}>
                              <h5 style={{ margin: '0 0 6px 0', color: '#fb923c', fontSize: '13px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span>🖼️</span> <span>Authorized Stamp & Signature</span>
                              </h5>
                              <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                                {(selectedPanAppForModal.signatureUrl || d.signatureUrl) && (
                                  <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: '10.5px', color: '#94a3b8', marginBottom: '3px' }}>Authorized Stamp / Signature</div>
                                    <img src={selectedPanAppForModal.signatureUrl || d.signatureUrl} alt="Signature" onClick={() => window.open(selectedPanAppForModal.signatureUrl || d.signatureUrl, '_blank')} style={{ width: '150px', height: '65px', objectFit: 'contain', background: '#fff', padding: '4px', borderRadius: '6px', border: '1.5px solid #0284c7', cursor: 'pointer' }} title="Click to view full signature" />
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </>
                      ) : (
                        <>
                          {/* Individual Left Column: Personal Particulars & Parents */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {/* Personal Particulars */}
                            <div style={{ background: 'rgba(15, 23, 42, 0.5)', padding: '12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)' }}>
                              <h5 style={{ margin: '0 0 8px 0', color: '#fb923c', fontSize: '13px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span>👤</span> <span>Personal Particulars</span>
                              </h5>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px', color: '#cbd5e1', fontSize: '12px' }}>
                                <div><span style={{ color: '#94a3b8' }}>Title:</span> <strong style={{ color: '#f8fafc' }}>{d.title || selectedPanAppForModal.title || 'SHRI'}</strong></div>
                                <div><span style={{ color: '#94a3b8' }}>Gender:</span> <strong style={{ color: '#f8fafc' }}>{selectedPanAppForModal.gender || d.gender || 'Male'}</strong></div>
                                <div><span style={{ color: '#94a3b8' }}>Last Name:</span> <strong style={{ color: '#f8fafc' }}>{d.lastName || selectedPanAppForModal.applicantName || '—'}</strong></div>
                                <div><span style={{ color: '#94a3b8' }}>DOB:</span> <strong style={{ color: '#f8fafc' }}>{selectedPanAppForModal.dob || d.dob || '—'}</strong></div>
                                <div><span style={{ color: '#94a3b8' }}>First Name:</span> <strong style={{ color: '#f8fafc' }}>{d.firstName || '—'}</strong></div>
                                <div><span style={{ color: '#94a3b8' }}>Aadhaar:</span> <strong style={{ color: '#f8fafc' }}>{selectedPanAppForModal.aadhaarNumber || d.aadhaarNumber || '—'}</strong></div>
                                <div><span style={{ color: '#94a3b8' }}>Middle Name:</span> <strong style={{ color: '#f8fafc' }}>{d.middleName || '—'}</strong></div>
                                <div><span style={{ color: '#94a3b8' }}>Mobile:</span> <strong style={{ color: '#f8fafc' }}>{selectedPanAppForModal.mobileNumber || '—'}</strong></div>
                                <div style={{ gridColumn: 'span 2' }}><span style={{ color: '#94a3b8' }}>Email:</span> <strong style={{ color: '#f8fafc' }}>{selectedPanAppForModal.email || '—'}</strong></div>
                              </div>
                            </div>

                            {/* Parents Details */}
                            <div style={{ background: 'rgba(15, 23, 42, 0.5)', padding: '12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)' }}>
                              <h5 style={{ margin: '0 0 8px 0', color: '#fb923c', fontSize: '13px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span>👨‍👩‍👦</span> <span>Parents Details</span>
                              </h5>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', color: '#cbd5e1', fontSize: '12px' }}>
                                <div><span style={{ color: '#94a3b8' }}>Father's Name:</span> <strong style={{ color: '#f8fafc' }}>{selectedPanAppForModal.fatherName || `${d.fatherFirstName || ''} ${d.fatherLastName || ''}`.trim() || '—'}</strong></div>
                                <div><span style={{ color: '#94a3b8' }}>Mother's Name:</span> <strong style={{ color: '#f8fafc' }}>{`${d.motherFirstName || ''} ${d.motherLastName || ''}`.trim() || '—'}</strong></div>
                              </div>
                            </div>
                          </div>

                          {/* Individual Right Column: Address, AO Code & Attachments */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {/* Residence Address */}
                            <div style={{ background: 'rgba(15, 23, 42, 0.5)', padding: '12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)' }}>
                              <h5 style={{ margin: '0 0 8px 0', color: '#fb923c', fontSize: '13px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span>🏠</span> <span>Residence Address</span>
                              </h5>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 10px', color: '#cbd5e1', fontSize: '12px' }}>
                                <div><span style={{ color: '#94a3b8' }}>Flat/Door:</span> <strong style={{ color: '#e2e8f0' }}>{d.flatNo || '—'}</strong></div>
                                <div><span style={{ color: '#94a3b8' }}>Building:</span> <strong style={{ color: '#e2e8f0' }}>{d.premises || '—'}</strong></div>
                                <div><span style={{ color: '#94a3b8' }}>Street:</span> <strong style={{ color: '#e2e8f0' }}>{d.roadStreet || '—'}</strong></div>
                                <div><span style={{ color: '#94a3b8' }}>Area:</span> <strong style={{ color: '#e2e8f0' }}>{d.areaTaluka || '—'}</strong></div>
                                <div><span style={{ color: '#94a3b8' }}>District:</span> <strong style={{ color: '#38bdf8' }}>{(d.district && d.district !== 'SELECT') ? d.district : (selectedPanAppForModal.district || '—')}</strong></div>
                                <div><span style={{ color: '#94a3b8' }}>State:</span> <strong style={{ color: '#38bdf8' }}>{(d.state && d.state !== 'PLEASE SELECT') ? d.state : (selectedPanAppForModal.state || 'MAHARASHTRA')}</strong></div>
                                <div><span style={{ color: '#94a3b8' }}>Pincode:</span> <strong style={{ color: '#f8fafc' }}>{d.pincode || '—'}</strong></div>
                              </div>
                            </div>

                            {/* AO Code Details */}
                            <div style={{ background: 'rgba(15, 23, 42, 0.5)', padding: '10px 12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)' }}>
                              <h5 style={{ margin: '0 0 6px 0', color: '#fb923c', fontSize: '13px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span>🏢</span> <span>AO Code Details</span>
                              </h5>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px', textAlign: 'center' }}>
                                <div style={{ background: 'rgba(2, 132, 199, 0.15)', border: '1px solid rgba(56, 189, 248, 0.25)', padding: '5px 4px', borderRadius: '6px' }}>
                                  <div style={{ fontSize: '10px', color: '#94a3b8' }}>Area</div>
                                  <strong style={{ color: '#38bdf8', fontSize: '12px' }}>{d.aoAreaCode || 'MUM'}</strong>
                                </div>
                                <div style={{ background: 'rgba(2, 132, 199, 0.15)', border: '1px solid rgba(56, 189, 248, 0.25)', padding: '5px 4px', borderRadius: '6px' }}>
                                  <div style={{ fontSize: '10px', color: '#94a3b8' }}>Type</div>
                                  <strong style={{ color: '#38bdf8', fontSize: '12px' }}>{d.aoType || 'C'}</strong>
                                </div>
                                <div style={{ background: 'rgba(2, 132, 199, 0.15)', border: '1px solid rgba(56, 189, 248, 0.25)', padding: '5px 4px', borderRadius: '6px' }}>
                                  <div style={{ fontSize: '10px', color: '#94a3b8' }}>Range</div>
                                  <strong style={{ color: '#38bdf8', fontSize: '12px' }}>{d.aoRangeCode || '11'}</strong>
                                </div>
                                <div style={{ background: 'rgba(2, 132, 199, 0.15)', border: '1px solid rgba(56, 189, 248, 0.25)', padding: '5px 4px', borderRadius: '6px' }}>
                                  <div style={{ fontSize: '10px', color: '#94a3b8' }}>AO No</div>
                                  <strong style={{ color: '#38bdf8', fontSize: '12px' }}>{d.aoNo || '1'}</strong>
                                </div>
                                <div style={{ background: 'rgba(2, 132, 199, 0.15)', border: '1px solid rgba(56, 189, 248, 0.25)', padding: '5px 4px', borderRadius: '6px' }}>
                                  <div style={{ fontSize: '10px', color: '#94a3b8' }}>City</div>
                                  <strong style={{ color: '#38bdf8', fontSize: '12px' }}>{d.aoCity || d.district || 'MUMBAI'}</strong>
                                </div>
                              </div>
                            </div>

                            {/* Photo & Signature Attachments */}
                            <div style={{ background: 'rgba(15, 23, 42, 0.5)', padding: '10px 12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)' }}>
                              <h5 style={{ margin: '0 0 6px 0', color: '#fb923c', fontSize: '13px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span>🖼️</span> <span>Attachments</span>
                              </h5>
                              <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                                {(selectedPanAppForModal.photoUrl || d.photoUrl) && (
                                  <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: '10.5px', color: '#94a3b8', marginBottom: '3px' }}>Photo</div>
                                    <img src={selectedPanAppForModal.photoUrl || d.photoUrl} alt="Photo" onClick={() => window.open(selectedPanAppForModal.photoUrl || d.photoUrl, '_blank')} style={{ width: '65px', height: '75px', objectFit: 'cover', borderRadius: '6px', border: '1.5px solid #0284c7', cursor: 'pointer' }} title="Click to view full photo" />
                                  </div>
                                )}
                                {(selectedPanAppForModal.signatureUrl || d.signatureUrl) && (
                                  <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: '10.5px', color: '#94a3b8', marginBottom: '3px' }}>Signature</div>
                                    <img src={selectedPanAppForModal.signatureUrl || d.signatureUrl} alt="Signature" onClick={() => window.open(selectedPanAppForModal.signatureUrl || d.signatureUrl, '_blank')} style={{ width: '120px', height: '50px', objectFit: 'contain', background: '#fff', padding: '4px', borderRadius: '6px', border: '1.5px solid #0284c7', cursor: 'pointer' }} title="Click to view full signature" />
                                  </div>
                                )}
                                {(d.raPhotoUrl || d.proofOfOtherUrl) && (
                                  <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: '10.5px', color: '#94a3b8', marginBottom: '3px' }}>Guardian</div>
                                    <img src={d.raPhotoUrl || d.proofOfOtherUrl} alt="RA Photo" onClick={() => window.open(d.raPhotoUrl || d.proofOfOtherUrl, '_blank')} style={{ width: '65px', height: '75px', objectFit: 'cover', borderRadius: '6px', border: '1.5px solid #f97316', cursor: 'pointer' }} title="Click to view full photo" />
                                  </div>
                                )}
                              </div>
                            </div>

                          </div>
                        </>
                      )}
                    </div>

                    {(selectedPanAppForModal.additionalDocuments || []).length > 0 && (
                      <div style={{ background: 'rgba(15, 23, 42, 0.5)', padding: '10px 12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <h5 style={{ margin: '0 0 6px 0', color: '#fb923c', fontSize: '13px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span>📎</span> <span>Additional Documents from Retailer</span>
                        </h5>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {selectedPanAppForModal.additionalDocuments.map((document, index) => (
                            <div key={document._id || index} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', background: 'rgba(255,255,255,0.06)', padding: '8px 12px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.08)' }}>
                              <div>
                                <strong style={{ color: '#f8fafc', fontSize: '12px' }}>{document.name || 'Additional document'}</strong>
                                <div style={{ fontSize: '10.5px', color: '#94a3b8', marginTop: '1px' }}>Uploaded {document.uploadedAt ? new Date(document.uploadedAt).toLocaleString() : 'recently'}</div>
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
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', alignItems: 'center', background: '#0f172a', borderTop: '1px solid rgba(255,255,255,0.1)', padding: '10px 20px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => copyApplicationDetailsToClipboard(selectedPanAppForModal)}
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
              {selectedPanAppForModal.receiptUrl && (
                <button
                  type="button"
                  onClick={() => window.open(selectedPanAppForModal.receiptUrl, '_blank')}
                  style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '6px', fontWeight: '800', cursor: 'pointer', fontSize: '12px' }}
                >
                  📥 View Receipt
                </button>
              )}
              <button
                type="button"
                onClick={() => handleDownloadPdf(selectedPanAppForModal)}
                style={{ background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', fontWeight: '700', cursor: 'pointer', fontSize: '12px' }}
              >
                📄 {selectedPanAppForModal.applicationType?.toLowerCase()?.includes('correction') ? 'Download PAN CR PDF' : 'Download Form 49A PDF'}
              </button>
              <button
                type="button"
                onClick={() => setSelectedPanAppForModal(null)}
                style={{ background: 'rgba(255,255,255,0.12)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: '700', fontSize: '12px' }}
              >
                Close
              </button>
            </div>

          </div>
        </div>
      )}

      {/* RETAILER-UPLOADED PAN DOCUMENTS */}
      {selectedPanAppDocuments && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(15, 23, 42, 0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ width: '100%', maxWidth: '620px', maxHeight: '85vh', overflowY: 'auto', background: '#fff', borderRadius: '14px', padding: '22px', boxShadow: '0 24px 60px rgba(15, 23, 42, 0.35)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', marginBottom: '18px' }}>
              <div>
                <h3 style={{ margin: 0, color: '#0f172a', fontSize: '18px', fontWeight: 800 }}>📎 Retailer Uploaded Documents</h3>
                <p style={{ margin: '5px 0 0', color: '#64748b', fontSize: '12px' }}>Ack No: <strong>{selectedPanAppDocuments.ackNumber}</strong> · {selectedPanAppDocuments.applicantName}</p>
              </div>
              <button type="button" onClick={() => setSelectedPanAppDocuments(null)} style={{ border: 'none', background: '#f1f5f9', color: '#475569', width: '30px', height: '30px', borderRadius: '7px', fontSize: '18px', cursor: 'pointer' }}>×</button>
            </div>

            {(() => {
              const details = selectedPanAppDocuments.details || {};
              const documents = (Array.isArray(selectedPanAppDocuments.additionalDocuments) ? selectedPanAppDocuments.additionalDocuments : [])
                .filter(document => document.dataUrl);
              const photoUrl = selectedPanAppDocuments.photoUrl || details.photoUrl;
              const signatureUrl = selectedPanAppDocuments.signatureUrl || details.signatureUrl;

              if (!photoUrl && !signatureUrl && documents.length === 0) {
                return <div style={{ padding: '30px 16px', textAlign: 'center', color: '#64748b', background: '#f8fafc', borderRadius: '10px' }}>No documents have been uploaded by this retailer.</div>;
              }

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {photoUrl && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px', border: '1px solid #dbeafe', borderRadius: '9px', background: '#f8fbff' }}><div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><img src={photoUrl} alt="Applicant" style={{ width: '54px', height: '64px', objectFit: 'cover', border: '1px solid #cbd5e1', borderRadius: '5px' }} /><strong style={{ color: '#1e3a8a', fontSize: '13px' }}>Applicant Photo</strong></div><button type="button" onClick={() => handleViewPanDocument(selectedPanAppDocuments._id, 'photo')} style={{ border: 'none', background: '#2563eb', color: '#fff', padding: '7px 12px', borderRadius: '6px', fontWeight: 700, cursor: 'pointer' }}>View</button></div>}
                  {signatureUrl && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px', border: '1px solid #dbeafe', borderRadius: '9px', background: '#f8fbff' }}><div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><img src={signatureUrl} alt="Signature" style={{ width: '100px', height: '38px', objectFit: 'contain', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '5px' }} /><strong style={{ color: '#1e3a8a', fontSize: '13px' }}>Applicant Signature</strong></div><button type="button" onClick={() => handleViewPanDocument(selectedPanAppDocuments._id, 'signature')} style={{ border: 'none', background: '#2563eb', color: '#fff', padding: '7px 12px', borderRadius: '6px', fontWeight: 700, cursor: 'pointer' }}>View</button></div>}
                  {documents.map((document, index) => <div key={document._id || index} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '10px', border: '1px solid #dbeafe', borderRadius: '9px', background: '#f8fbff' }}><div><strong style={{ color: '#1e3a8a', fontSize: '13px' }}>{document.name || 'Additional document'}</strong><div style={{ color: '#64748b', fontSize: '11px', marginTop: '3px' }}>{document.uploadedAt ? new Date(document.uploadedAt).toLocaleString() : 'Uploaded recently'}</div></div><button type="button" onClick={() => handleViewPanDocument(selectedPanAppDocuments._id, document._id)} style={{ border: 'none', background: '#2563eb', color: '#fff', padding: '7px 12px', borderRadius: '6px', fontWeight: 700, cursor: 'pointer' }}>View</button></div>)}
                </div>
              );
            })()}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}><button type="button" onClick={() => setSelectedPanAppDocuments(null)} style={{ border: '1px solid #cbd5e1', background: '#fff', color: '#475569', padding: '9px 15px', borderRadius: '7px', fontWeight: 700, cursor: 'pointer' }}>Close</button></div>
          </div>
        </div>
      )}

      {/* PAN APPLICATION DIRECT OFFICIAL FORM 49A EDIT MODAL */}
      {selectedPanAppDetails && (
        <Form49ADirectEditModal
          selectedPanAppDetails={selectedPanAppDetails}
          onClose={() => setSelectedPanAppDetails(null)}
          onDataChange={(currentData) => {
            setPdfTargetData(currentData);
          }}
          onSaveSuccess={(updatedData) => {
            setPdfTargetData(updatedData);
            setSelectedPanAppDetails(prev => ({
              ...prev,
              ...updatedData,
              details: { ...(prev?.details || {}), ...updatedData }
            }));
            fetchAll();
          }}
          handleDownloadPdf={handleDownloadPdf}
        />
      )}

      {/* STATUS EDIT MODAL */}
      {editingPanAppStatus && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: 'white', borderRadius: '16px', maxWidth: '480px', width: '100%', padding: '24px', boxShadow: '0 20px 50px rgba(0,0,0,0.25)' }}>
            <h3 style={{ margin: '0 0 6px 0', fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>
              ✏️ Update Application Status
            </h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: '#64748b' }}>
              Ack No: <strong>{editingPanAppStatus.ackNumber}</strong> ({editingPanAppStatus.applicantName})
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Application Status
                </label>
                <select
                  value={newStatusVal}
                  onChange={(e) => setNewStatusVal(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px', background: '#fff' }}
                >
                  <option value="Submitted">Submitted (Pending)</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Approved">Approved</option>
                  <option value="Completed">Completed</option>
                  <option value="Rejected">Rejected</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Admin Remarks / Notes
                </label>
                <textarea
                  rows={3}
                  placeholder="Enter remarks for the retailer..."
                  value={newStatusRemarks}
                  onChange={(e) => setNewStatusRemarks(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>

              {/* NSDL Receipt / Ack Slip Remark */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  NSDL Receipt / Ack Slip Remark (Send to Retailer)
                </label>
                <input
                  type="text"
                  placeholder="Enter NSDL receipt number or ack slip remark..."
                  value={newNsdlReceiptNumber}
                  onChange={(e) => setNewNsdlReceiptNumber(e.target.value)}
                  maxLength={50}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1.5px solid #0284c7',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontFamily: 'monospace',
                    fontWeight: 700,
                    color: '#0369a1',
                    background: '#f0f9ff',
                    boxSizing: 'border-box'
                  }}
                />
                <span style={{ fontSize: '11px', color: '#64748b', marginTop: '4px', display: 'block' }}>
                  💡 This receipt number / remark will be sent to retailer and displayed under the <strong>NSDL RECEIPT</strong> column in their application history.
                </span>
              </div>

              {/* Upload Approved Receipt PDF / Ack Slip */}
              <div style={{ background: '#f0f9ff', border: '1.5px dashed #0284c7', padding: '14px', borderRadius: '12px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#0369a1', marginBottom: '4px' }}>
                  📄 Upload Approved Receipt PDF / Ack Slip (To Retailer):
                </label>
                <p style={{ fontSize: '11.5px', color: '#64748b', margin: '0 0 8px 0' }}>
                  Select PDF or Image receipt to send directly to Retailer <strong>{editingPanAppStatus.userId}</strong>.
                </p>
                <input
                  type="file"
                  accept="application/pdf,image/*"
                  onChange={(e) => {
                    const file = e.target.files[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onloadend = () => setNewReceiptFileUrl(reader.result);
                      reader.readAsDataURL(file);
                    }
                  }}
                  style={{ width: '100%', padding: '7px', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '12px', boxSizing: 'border-box' }}
                />
                {(newReceiptFileUrl || editingPanAppStatus.receiptUrl) && (
                  <div style={{ marginTop: '8px', fontSize: '11.5px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
                    <span style={{ color: '#059669', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      ✓ {newReceiptFileUrl ? 'New receipt PDF selected! Will be sent to retailer on save.' : 'Receipt already uploaded for retailer.'}
                    </span>
                    {editingPanAppStatus.receiptUrl && !newReceiptFileUrl && (
                      <a
                        href={editingPanAppStatus.receiptUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: '#0284c7', textDecoration: 'underline', fontSize: '11.5px' }}
                      >
                        👁️ View Existing Receipt
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => {
                  setEditingPanAppStatus(null);
                  setNewReceiptFileUrl('');
                }}
                style={{ padding: '8px 16px', background: '#e2e8f0', color: '#475569', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleUpdatePanStatus}
                style={{ padding: '8px 18px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                Save Status & Send Receipt
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STAFF ADD / EDIT MODAL */}
      {isStaffModalOpen && (
        <div className="staff-modal-overlay">
          <div className="staff-modal-box">
            <div className="staff-modal-header">
              <h3>{editingStaffId ? (staffFormData.username ? `✏️ Edit Staff & Permissions (${staffFormData.username})` : '✏️ Edit Staff & Permissions') : '➕ Add New Staff Member'}</h3>
              <button 
                type="button"
                className="staff-modal-close" 
                onClick={() => setIsStaffModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveStaff}>
              <div className="staff-modal-body">
                <div className="staff-input-row">
                  <div className="staff-input-group">
                    <label>Full Name *</label>
                    <input 
                      type="text" 
                      className="staff-input-field" 
                      placeholder="e.g. Rahul Sharma"
                      value={staffFormData.name}
                      onChange={e => setStaffFormData({...staffFormData, name: e.target.value})}
                      required
                    />
                  </div>
                  <div className="staff-input-group">
                    <label>{editingStaffId ? 'New Password (leave blank to keep current)' : 'Login Password *'}</label>
                    <input 
                      type="password" 
                      className="staff-input-field" 
                      placeholder={editingStaffId ? '••••••••' : 'Enter password'}
                      value={staffFormData.password}
                      onChange={e => setStaffFormData({...staffFormData, password: e.target.value})}
                      required={!editingStaffId}
                    />
                  </div>
                </div>

                <div className="staff-input-row">
                  <div className="staff-input-group">
                    <label>Mobile Number</label>
                    <input 
                      type="text" 
                      className="staff-input-field" 
                      placeholder="e.g. 9876543210"
                      value={staffFormData.mobile}
                      onChange={e => setStaffFormData({...staffFormData, mobile: e.target.value})}
                    />
                  </div>
                  <div className="staff-input-group">
                    <label>Email Address</label>
                    <input 
                      type="email" 
                      className="staff-input-field" 
                      placeholder="e.g. rahul@example.com"
                      value={staffFormData.email}
                      onChange={e => setStaffFormData({...staffFormData, email: e.target.value})}
                    />
                  </div>
                </div>

                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '18px', marginTop: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                    <span style={{ fontSize: '12.5px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                      ALLOWED MODULES &amp; SUB-ACCESS PERMISSIONS
                    </span>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <button 
                        type="button" 
                        onClick={() => handleToggleAllPermissions(true)}
                        style={{ padding: '5px 12px', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '11.5px', fontWeight: 700, color: '#334155', cursor: 'pointer' }}
                      >
                        Select All
                      </button>
                      <button 
                        type="button" 
                        onClick={() => handleToggleAllPermissions(false)}
                        style={{ padding: '5px 12px', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '11.5px', fontWeight: 700, color: '#334155', cursor: 'pointer' }}
                      >
                        Deselect All
                      </button>
                      <button 
                        type="button" 
                        onClick={handleToggleCollapseAllModules}
                        style={{ padding: '5px 12px', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '11.5px', fontWeight: 700, color: '#334155', cursor: 'pointer' }}
                      >
                        {AVAILABLE_STAFF_MODULES.some(m => !collapsedStaffModules[m.id]) ? 'Collapse All' : 'Expand All'}
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '14px' }}>
                    {AVAILABLE_STAFF_MODULES.map(mod => {
                      const subIds = mod.subPermissions ? mod.subPermissions.map(s => s.id) : [];
                      const selectedSubCount = subIds.filter(id => (staffFormData.permissions || []).includes(id)).length;
                      const isParentDirect = (staffFormData.permissions || []).includes(mod.id);
                      const isAnySelected = isParentDirect || selectedSubCount > 0;
                      const isFullySelected = subIds.length > 0 ? selectedSubCount === subIds.length : isParentDirect;
                      const isCollapsed = !!collapsedStaffModules[mod.id];

                      return (
                        <div 
                          key={mod.id}
                          style={{
                            border: isAnySelected ? '1.5px solid #ea580c' : '1.5px solid #e2e8f0',
                            borderRadius: '14px',
                            background: isAnySelected ? '#fffcf9' : '#ffffff',
                            boxShadow: isAnySelected ? '0 2px 8px rgba(234, 88, 12, 0.08)' : 'none',
                            overflow: 'hidden',
                            transition: 'border-color 0.2s, box-shadow 0.2s'
                          }}
                        >
                          {/* Module Header */}
                          <div 
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              padding: '10px 14px',
                              background: isAnySelected ? '#fff7ed' : '#f8fafc',
                              borderBottom: isCollapsed ? 'none' : (isAnySelected ? '1px solid #fed7aa' : '1px solid #e2e8f0'),
                              userSelect: 'none'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <input 
                                type="checkbox"
                                checked={isFullySelected}
                                onChange={(e) => handleToggleModuleAll(mod, e.target.checked)}
                                style={{ width: '16px', height: '16px', accentColor: '#ea580c', cursor: 'pointer' }}
                              />
                              <span 
                                onClick={() => handleToggleModuleCollapse(mod.id)}
                                style={{
                                  fontWeight: 800,
                                  fontSize: '13.5px',
                                  color: isAnySelected ? '#9a3412' : '#0f172a',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  cursor: 'pointer'
                                }}
                              >
                                <span>{mod.icon}</span>
                                <span>{mod.label}</span>
                              </span>
                            </div>

                            <span 
                              onClick={() => handleToggleModuleCollapse(mod.id)}
                              style={{
                                background: isAnySelected ? '#ffedd5' : '#f1f5f9',
                                color: isAnySelected ? '#c2410c' : '#64748b',
                                border: isAnySelected ? '1px solid #fed7aa' : '1px solid #cbd5e1',
                                padding: '2px 8px',
                                borderRadius: '6px',
                                fontSize: '11px',
                                fontWeight: 800,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                            >
                              {selectedSubCount}/{subIds.length} {isCollapsed ? '▼' : '▲'}
                            </span>
                          </div>

                          {/* Sub-permissions List */}
                          {!isCollapsed && mod.subPermissions && mod.subPermissions.length > 0 && (
                            <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '6px', background: '#ffffff' }}>
                              {mod.subPermissions.map(sub => {
                                const isSubChecked = (staffFormData.permissions || []).includes(sub.id);
                                return (
                                  <label 
                                    key={sub.id}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '10px',
                                      padding: '7px 12px',
                                      borderRadius: '8px',
                                      border: isSubChecked ? '1px solid #fdba74' : '1px solid #e2e8f0',
                                      background: isSubChecked ? '#fff7ed' : '#ffffff',
                                      cursor: 'pointer',
                                      transition: 'all 0.15s ease',
                                      userSelect: 'none'
                                    }}
                                  >
                                    <input 
                                      type="checkbox"
                                      checked={isSubChecked}
                                      onChange={() => handleToggleSubPermission(mod, sub.id)}
                                      style={{ width: '15px', height: '15px', accentColor: '#ea580c', cursor: 'pointer' }}
                                    />
                                    <span style={{ fontSize: '13px' }}>{sub.icon}</span>
                                    <span style={{ fontSize: '12.5px', fontWeight: isSubChecked ? 800 : 600, color: isSubChecked ? '#9a3412' : '#334155' }}>
                                      {sub.label}
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '6px' }}>
                  <input 
                    type="checkbox" 
                    id="staffActiveToggle"
                    style={{ width: '16px', height: '16px', accentColor: '#ea580c', cursor: 'pointer' }}
                    checked={staffFormData.isActive}
                    onChange={e => setStaffFormData({...staffFormData, isActive: e.target.checked})}
                  />
                  <label htmlFor="staffActiveToggle" style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b', cursor: 'pointer' }}>
                    Account Active (staff can log in)
                  </label>
                </div>
              </div>

              <div className="staff-modal-footer">
                <button 
                  type="button" 
                  className="staff-modal-cancel-btn"
                  onClick={() => setIsStaffModalOpen(false)}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="staff-modal-save-btn"
                >
                  {editingStaffId ? '💾 Save Changes' : '➕ Create Staff Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE NEW USER MODAL (MATCHING REGISTER PAGE FORM LAYOUT) */}
      {isUserCreateModalOpen && (
        <div className="staff-modal-overlay">
          <div className="admin-reg-modal-box">
            <div className="staff-modal-header" style={{ background: 'linear-gradient(135deg, #FFF7ED 0%, #FFFFFF 100%)', borderBottom: '1.5px solid #FFEDD5' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div className="orange-logo-badge" style={{ width: '40px', height: '40px', margin: 0 }}>
                  <img src={logoImg} alt="MB MITRA Logo" className="orange-badge-img" />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0F172A' }}>Create Retailer Account</h3>
                  <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748B' }}>Fill in details to register and activate retailer account as per standard registration</p>
                </div>
              </div>
              <button 
                type="button" 
                className="staff-modal-close" 
                onClick={() => setIsUserCreateModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveCreateUser}>
              <div className="staff-modal-body reg-custom-scrollbar" style={{ maxHeight: '74vh', overflowY: 'auto', padding: '18px 22px' }}>
                
                {/* 1. Personal & Business Details */}
                <div className="admin-reg-section-card">
                  <div className="admin-reg-section-header">
                    <span className="admin-reg-section-num">1</span>
                    <strong className="admin-reg-section-title">1. Personal &amp; Business Details</strong>
                  </div>

                  <div className="admin-reg-grid-2col">
                    <div>
                      <label className="admin-reg-field-label">Full Name (As per Aadhar Card) *</label>
                      <div className="admin-reg-input-wrapper">
                        <span className="admin-reg-input-icon">
                          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                            <circle cx="12" cy="7" r="4" />
                          </svg>
                        </span>
                        <input
                          type="text"
                          value={createUserForm.fullName}
                          onChange={e => setCreateUserForm({ ...createUserForm, fullName: e.target.value, name: e.target.value })}
                          placeholder="Enter your full name"
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <label className="admin-reg-field-label">Mobile Number *</label>
                      <div className="admin-reg-input-wrapper">
                        <span className="admin-reg-input-icon">
                          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                          </svg>
                        </span>
                        <input
                          type="tel"
                          maxLength="10"
                          value={createUserForm.mobile}
                          onChange={e => setCreateUserForm({ ...createUserForm, mobile: e.target.value.replace(/\D/g, '') })}
                          placeholder="Enter 10 digit mobile number"
                          required
                        />
                      </div>
                    </div>
                  </div>

                  <div className="admin-reg-grid-2col">
                    <div>
                      <label className="admin-reg-field-label">Shop Name *</label>
                      <div className="admin-reg-input-wrapper">
                        <span className="admin-reg-input-icon">
                          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                            <polyline points="9 22 9 12 15 12 15 22" />
                          </svg>
                        </span>
                        <input
                          type="text"
                          value={createUserForm.shopName}
                          onChange={e => setCreateUserForm({ ...createUserForm, shopName: e.target.value })}
                          placeholder="Enter your shop name"
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <label className="admin-reg-field-label">E-Mail ID</label>
                      <div className="admin-reg-input-wrapper">
                        <span className="admin-reg-input-icon">
                          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                            <polyline points="22,6 12,13 2,6" />
                          </svg>
                        </span>
                        <input
                          type="email"
                          value={createUserForm.email}
                          onChange={e => setCreateUserForm({ ...createUserForm, email: e.target.value })}
                          placeholder="Enter your email address"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="admin-reg-field-label">Business Address *</label>
                    <div className="admin-reg-input-wrapper">
                      <span className="admin-reg-input-icon">
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                          <circle cx="12" cy="10" r="3" />
                        </svg>
                      </span>
                      <input
                        type="text"
                        value={createUserForm.businessAddress}
                        onChange={e => setCreateUserForm({ ...createUserForm, businessAddress: e.target.value })}
                        placeholder="Enter your complete business address"
                        required
                      />
                    </div>
                  </div>
                </div>

                {/* 2. Account Security */}
                <div className="admin-reg-section-card">
                  <div className="admin-reg-section-header">
                    <span className="admin-reg-section-num">2</span>
                    <strong className="admin-reg-section-title">2. Account Security</strong>
                  </div>

                  <div className="admin-reg-grid-2col">
                    <div>
                      <label className="admin-reg-field-label">Password *</label>
                      <div className="admin-reg-input-wrapper">
                        <span className="admin-reg-input-icon">
                          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                          </svg>
                        </span>
                        <input
                          type={showCreateUserPassword ? "text" : "password"}
                          value={createUserForm.password}
                          onChange={e => setCreateUserForm({ ...createUserForm, password: e.target.value })}
                          placeholder="Enter password"
                          required
                        />
                        <span
                          className="admin-reg-password-toggle"
                          onClick={() => setShowCreateUserPassword(!showCreateUserPassword)}
                          title={showCreateUserPassword ? "Hide password" : "Show password"}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            {showCreateUserPassword ? (
                              <>
                                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                                <line x1="1" y1="1" x2="23" y2="23" />
                              </>
                            ) : (
                              <>
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                <circle cx="12" cy="12" r="3" />
                              </>
                            )}
                          </svg>
                        </span>
                      </div>
                    </div>

                    <div>
                      <label className="admin-reg-field-label">Confirm Password *</label>
                      <div className="admin-reg-input-wrapper">
                        <span className="admin-reg-input-icon">
                          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                          </svg>
                        </span>
                        <input
                          type={showCreateUserConfirmPassword ? "text" : "password"}
                          value={createUserForm.confirmPassword}
                          onChange={e => setCreateUserForm({ ...createUserForm, confirmPassword: e.target.value })}
                          placeholder="Re-enter password"
                          required
                        />
                        <span
                          className="admin-reg-password-toggle"
                          onClick={() => setShowCreateUserConfirmPassword(!showCreateUserConfirmPassword)}
                          title={showCreateUserConfirmPassword ? "Hide password" : "Show password"}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            {showCreateUserConfirmPassword ? (
                              <>
                                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                                <line x1="1" y1="1" x2="23" y2="23" />
                              </>
                            ) : (
                              <>
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                <circle cx="12" cy="12" r="3" />
                              </>
                            )}
                          </svg>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. Account Configuration & Role */}
                <div className="admin-reg-section-card">
                  <div className="admin-reg-section-header">
                    <span className="admin-reg-section-num">3</span>
                    <strong className="admin-reg-section-title">3. Account Configuration &amp; Role</strong>
                  </div>


                  <div className="admin-reg-grid-3col">
                    <div>
                      <label className="admin-reg-field-label">Account Role</label>
                      <div className="admin-reg-input-wrapper">
                        <select
                          value={createUserForm.role}
                          onChange={e => setCreateUserForm({ ...createUserForm, role: e.target.value })}
                        >
                          <option value="retailer">Retailer</option>
                          <option value="admin">Admin</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="admin-reg-field-label">Account Status</label>
                      <div className="admin-reg-input-wrapper">
                        <select
                          value={createUserForm.status}
                          onChange={e => setCreateUserForm({ ...createUserForm, status: e.target.value })}
                        >
                          <option value="Approved">✓ Approved (Active)</option>
                          <option value="Pending">⏳ Pending</option>
                          <option value="Rejected">✕ Rejected</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="admin-reg-field-label">Initial Wallet (₹)</label>
                      <div className="admin-reg-input-wrapper">
                        <span className="admin-reg-input-icon">₹</span>
                        <input
                          type="number"
                          step="0.01"
                          value={createUserForm.walletBalance}
                          onChange={e => setCreateUserForm({ ...createUserForm, walletBalance: parseFloat(e.target.value) || 0 })}
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                  </div>
                </div>

              </div>

              <div className="staff-modal-footer" style={{ background: '#F8FAFC', borderTop: '1.5px solid #F1F5F9' }}>
                <button 
                  type="button" 
                  className="staff-modal-cancel-btn"
                  onClick={() => setIsUserCreateModalOpen(false)}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="admin-reg-submit-btn"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="8.5" cy="7" r="4" />
                    <line x1="20" y1="8" x2="20" y2="14" />
                    <line x1="23" y1="11" x2="17" y2="11" />
                  </svg>
                  <span>Register Account</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT USER MODAL */}
      {isUserEditModalOpen && (
        <div className="staff-modal-overlay">
          <div className="staff-modal-box" style={{ maxWidth: '640px' }}>
            <div className="staff-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ background: '#fef3c7', color: '#b45309', width: '36px', height: '36px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>
                  ✏️
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#0f172a' }}>Edit User Profile</h3>
                  <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748b' }}>
                    User ID: <strong>{editUserForm.userId}</strong>
                  </p>
                </div>
              </div>
              <button 
                type="button" 
                className="staff-modal-close" 
                onClick={() => setIsUserEditModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEditUser}>
              <div className="staff-modal-body" style={{ maxHeight: '72vh', overflowY: 'auto' }}>
                <div className="staff-input-group" style={{ marginBottom: '16px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>User ID</label>
                  <input 
                    type="text" 
                    className="staff-input-field" 
                    value={editUserForm.userId}
                    disabled
                    style={{ background: '#f1f5f9', cursor: 'not-allowed' }}
                  />
                </div>

                <div className="staff-input-row">
                  <div className="staff-input-group">
                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>Full Name</label>
                    <input 
                      type="text" 
                      className="staff-input-field" 
                      placeholder="e.g. Rahul Sharma"
                      value={editUserForm.name}
                      onChange={e => setEditUserForm({...editUserForm, name: e.target.value})}
                    />
                  </div>

                  <div className="staff-input-group">
                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>Shop / Firm Name</label>
                    <input 
                      type="text" 
                      className="staff-input-field" 
                      placeholder="e.g. Sharma Cyber Cafe"
                      value={editUserForm.shopName}
                      onChange={e => setEditUserForm({...editUserForm, shopName: e.target.value})}
                    />
                  </div>
                </div>

                <div className="staff-input-row">
                  <div className="staff-input-group">
                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>Mobile Number</label>
                    <input 
                      type="text" 
                      className="staff-input-field" 
                      placeholder="e.g. 9876543210"
                      maxLength={10}
                      value={editUserForm.mobile}
                      onChange={e => setEditUserForm({...editUserForm, mobile: e.target.value.replace(/\D/g, '')})}
                    />
                  </div>

                  <div className="staff-input-group">
                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>Email Address</label>
                    <input 
                      type="email" 
                      className="staff-input-field" 
                      placeholder="e.g. rahul@example.com"
                      value={editUserForm.email}
                      onChange={e => setEditUserForm({...editUserForm, email: e.target.value})}
                    />
                  </div>
                </div>

                <div className="staff-input-row">
                  <div className="staff-input-group">
                    <label style={{ fontSize: '12px', fontWeight: 700, color: userRole === 'admin' ? '#334155' : '#94a3b8' }}>
                      Reset Password {userRole !== 'admin' ? '(Admin Only)' : '(leave blank to keep current)'}
                    </label>
                    <input 
                      type="password" 
                      className="staff-input-field" 
                      placeholder={userRole === 'admin' ? "Enter new password to change" : "Only Admin can reset password"}
                      value={editUserForm.password}
                      onChange={e => setEditUserForm({...editUserForm, password: e.target.value})}
                      disabled={userRole !== 'admin'}
                      style={userRole !== 'admin' ? { background: '#f1f5f9', cursor: 'not-allowed', color: '#94a3b8' } : {}}
                    />
                  </div>

                  <div className="staff-input-group">
                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>Wallet Balance (₹)</label>
                    <input 
                      type="number" 
                      step="0.01"
                      className="staff-input-field" 
                      value={editUserForm.walletBalance}
                      onChange={e => setEditUserForm({...editUserForm, walletBalance: parseFloat(e.target.value) || 0})}
                    />
                  </div>
                </div>

                <div className="staff-input-row">
                  <div className="staff-input-group">
                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>Role</label>
                    <select 
                      className="staff-input-field"
                      value={editUserForm.role}
                      onChange={e => setEditUserForm({...editUserForm, role: e.target.value})}
                    >
                      <option value="retailer">Retailer</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>

                  <div className="staff-input-group">
                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>Account Status</label>
                    <select 
                      className="staff-input-field"
                      value={editUserForm.status}
                      onChange={e => setEditUserForm({...editUserForm, status: e.target.value})}
                    >
                      <option value="Approved">✓ Approved</option>
                      <option value="Pending">⏳ Pending Approval</option>
                      <option value="Rejected">✕ Rejected</option>
                    </select>
                  </div>
                </div>

                <div className="staff-input-group">
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>Business Address / Location</label>
                  <input 
                    type="text" 
                    className="staff-input-field" 
                    placeholder="e.g. Shop No 4, Main Market, Mumbai"
                    value={editUserForm.businessAddress}
                    onChange={e => setEditUserForm({...editUserForm, businessAddress: e.target.value})}
                  />
                </div>
              </div>

              <div className="staff-modal-footer">
                <button 
                  type="button" 
                  className="staff-modal-cancel-btn"
                  onClick={() => setIsUserEditModalOpen(false)}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="staff-modal-save-btn"
                  style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', boxShadow: '0 4px 12px rgba(16,185,129,0.3)' }}
                >
                  💾 Save User Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* USER SERVICE ACCESS & PERMISSIONS MODAL */}
      {isUserPermsModalOpen && selectedUserForPerms && (
        <div className="staff-modal-overlay">
          <div className="staff-modal-box">
            <div className="staff-modal-header" style={{ background: 'linear-gradient(135deg, #fff7ed 0%, #ffffff 100%)', borderBottom: '1.5px solid #ffedd5' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div className="user-avatar" style={{ width: '44px', height: '44px', fontSize: '17px', background: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)', color: '#ffffff' }}>
                  {(selectedUserForPerms.name || selectedUserForPerms.userId || 'U').slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>
                    🛡️ User Service Access &amp; Permissions
                  </h3>
                  <div style={{ fontSize: '12.5px', color: '#ea580c', fontWeight: 700, marginTop: '2px' }}>
                    {selectedUserForPerms.name || 'User'} ({selectedUserForPerms.userId}) {selectedUserForPerms.shopName ? `• ${selectedUserForPerms.shopName}` : ''}
                  </div>
                </div>
              </div>
              <button 
                type="button" 
                className="staff-modal-close" 
                onClick={() => setIsUserPermsModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveUserPermissions}>
              <div className="staff-modal-body">
                {/* User Summary Info Row */}
                <div className="staff-input-row">
                  <div className="staff-input-group">
                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>Full Name</label>
                    <input 
                      type="text" 
                      className="staff-input-field" 
                      value={selectedUserForPerms.name || ''} 
                      disabled 
                      style={{ background: '#f8fafc', color: '#334155', fontWeight: 700 }}
                    />
                  </div>
                  <div className="staff-input-group">
                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>User ID / Retailer UID</label>
                    <input 
                      type="text" 
                      className="staff-input-field" 
                      value={selectedUserForPerms.userId || ''} 
                      disabled 
                      style={{ background: '#f8fafc', color: '#0284c7', fontWeight: 800 }}
                    />
                  </div>
                </div>

                <div className="staff-input-row">
                  <div className="staff-input-group">
                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>Mobile Number</label>
                    <input 
                      type="text" 
                      className="staff-input-field" 
                      value={selectedUserForPerms.mobile || 'Not provided'} 
                      disabled 
                      style={{ background: '#f8fafc', color: '#334155' }}
                    />
                  </div>
                  <div className="staff-input-group">
                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>Email Address</label>
                    <input 
                      type="text" 
                      className="staff-input-field" 
                      value={selectedUserForPerms.email || 'Not provided'} 
                      disabled 
                      style={{ background: '#f8fafc', color: '#334155' }}
                    />
                  </div>
                </div>

                {/* Modules & Permissions Card Container */}
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '18px', marginTop: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                    <span style={{ fontSize: '12.5px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                      ALLOWED MODULES &amp; SUB-ACCESS PERMISSIONS
                    </span>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <button 
                        type="button" 
                        onClick={() => handleToggleAllUserPermissions(true)}
                        style={{ padding: '5px 12px', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '11.5px', fontWeight: 700, color: '#334155', cursor: 'pointer' }}
                      >
                        Select All
                      </button>
                      <button 
                        type="button" 
                        onClick={() => handleToggleAllUserPermissions(false)}
                        style={{ padding: '5px 12px', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '11.5px', fontWeight: 700, color: '#334155', cursor: 'pointer' }}
                      >
                        Deselect All
                      </button>
                      <button 
                        type="button" 
                        onClick={handleToggleCollapseAllUserModules}
                        style={{ padding: '5px 12px', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '11.5px', fontWeight: 700, color: '#334155', cursor: 'pointer' }}
                      >
                        {AVAILABLE_USER_MODULES.some(m => !collapsedUserModules[m.id]) ? 'Collapse All' : 'Expand All'}
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '14px' }}>
                    {AVAILABLE_USER_MODULES.map(mod => {
                      const subIds = mod.subPermissions ? mod.subPermissions.map(s => s.id) : [];
                      const selectedSubCount = subIds.filter(id => (userPermsFormData.permissions || []).includes(id)).length;
                      const isParentDirect = (userPermsFormData.permissions || []).includes(mod.id);
                      const isAnySelected = isParentDirect || selectedSubCount > 0;
                      const isFullySelected = subIds.length > 0 ? selectedSubCount === subIds.length : isParentDirect;
                      const isCollapsed = !!collapsedUserModules[mod.id];

                      return (
                        <div 
                          key={mod.id}
                          style={{
                            border: isAnySelected ? '1.5px solid #ea580c' : '1.5px solid #e2e8f0',
                            borderRadius: '14px',
                            background: isAnySelected ? '#fffcf9' : '#ffffff',
                            boxShadow: isAnySelected ? '0 2px 8px rgba(234, 88, 12, 0.08)' : 'none',
                            overflow: 'hidden',
                            transition: 'border-color 0.2s, box-shadow 0.2s'
                          }}
                        >
                          {/* Module Header */}
                          <div 
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              padding: '10px 14px',
                              background: isAnySelected ? '#fff7ed' : '#f8fafc',
                              borderBottom: isCollapsed ? 'none' : (isAnySelected ? '1px solid #fed7aa' : '1px solid #e2e8f0'),
                              userSelect: 'none'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <input 
                                type="checkbox"
                                checked={isFullySelected}
                                onChange={(e) => handleToggleUserModuleAll(mod, e.target.checked)}
                                style={{ width: '16px', height: '16px', accentColor: '#ea580c', cursor: 'pointer' }}
                              />
                              <span 
                                onClick={() => handleToggleUserModuleCollapse(mod.id)}
                                style={{
                                  fontWeight: 800,
                                  fontSize: '13.5px',
                                  color: isAnySelected ? '#9a3412' : '#0f172a',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  cursor: 'pointer'
                                }}
                              >
                                <span>{mod.icon}</span>
                                <span>{mod.label}</span>
                              </span>
                            </div>

                            <span 
                              onClick={() => handleToggleUserModuleCollapse(mod.id)}
                              style={{
                                background: isAnySelected ? '#ffedd5' : '#f1f5f9',
                                color: isAnySelected ? '#c2410c' : '#64748b',
                                border: isAnySelected ? '1px solid #fed7aa' : '1px solid #cbd5e1',
                                padding: '2px 8px',
                                borderRadius: '6px',
                                fontSize: '11px',
                                fontWeight: 800,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                            >
                              {selectedSubCount}/{subIds.length} {isCollapsed ? '▼' : '▲'}
                            </span>
                          </div>

                          {/* Sub-permissions List */}
                          {!isCollapsed && mod.subPermissions && mod.subPermissions.length > 0 && (
                            <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '6px', background: '#ffffff' }}>
                              {mod.subPermissions.map(sub => {
                                const isSubChecked = (userPermsFormData.permissions || []).includes(sub.id);
                                return (
                                  <label 
                                    key={sub.id}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '10px',
                                      padding: '7px 12px',
                                      borderRadius: '8px',
                                      border: isSubChecked ? '1px solid #fdba74' : '1px solid #e2e8f0',
                                      background: isSubChecked ? '#fff7ed' : '#ffffff',
                                      cursor: 'pointer',
                                      transition: 'all 0.15s ease',
                                      userSelect: 'none'
                                    }}
                                  >
                                    <input 
                                      type="checkbox"
                                      checked={isSubChecked}
                                      onChange={() => handleToggleUserSubPermission(mod, sub.id)}
                                      style={{ width: '15px', height: '15px', accentColor: '#ea580c', cursor: 'pointer' }}
                                    />
                                    <span style={{ fontSize: '13px' }}>{sub.icon}</span>
                                    <span style={{ fontSize: '12.5px', fontWeight: isSubChecked ? 800 : 600, color: isSubChecked ? '#9a3412' : '#334155' }}>
                                      {sub.label}
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="staff-modal-footer">
                <button 
                  type="button" 
                  className="staff-modal-cancel-btn"
                  onClick={() => setIsUserPermsModalOpen(false)}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="staff-modal-save-btn"
                  disabled={userPermsSaving}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <span>💾</span>
                  <span>{userPermsSaving ? 'Saving...' : 'Save Services Access'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VIEW USER DETAILS MODAL */}
      {isUserViewModalOpen && selectedUserForModal && (
        <div className="staff-modal-overlay">
          <div className="staff-modal-box" style={{ maxWidth: '580px' }}>
            <div className="staff-modal-header" style={{ background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div className="user-avatar" style={{ width: '46px', height: '46px', fontSize: '18px' }}>
                  {(selectedUserForModal.name || selectedUserForModal.userId || 'U').slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>
                    {selectedUserForModal.name || selectedUserForModal.userId}
                  </h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                    <span className="user-id-badge">ID: {selectedUserForModal.userId}</span>
                  </div>
                </div>
              </div>
              <button 
                type="button" 
                className="staff-modal-close" 
                onClick={() => setIsUserViewModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className="staff-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              {/* Wallet & Status Quick Ribbon */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ background: '#f0fdf4', border: '1.5px solid #bbf7d0', borderRadius: '12px', padding: '14px' }}>
                  <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#166534', fontWeight: 800, letterSpacing: '0.4px' }}>
                    Current Wallet Balance
                  </div>
                  <div style={{ fontSize: '22px', fontWeight: 900, color: '#15803d', marginTop: '4px' }}>
                    ₹{parseFloat(selectedUserForModal.walletBalance || 0).toFixed(2)}
                  </div>
                </div>

                <div style={{ background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: '12px', padding: '14px' }}>
                  <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#64748b', fontWeight: 800, letterSpacing: '0.4px' }}>
                    Account Status
                  </div>
                  <div style={{ marginTop: '6px' }}>
                    {(selectedUserForModal.status || 'Approved') === 'Pending' ? (
                      <span className="user-status-pill user-status-pending">⏳ Pending Approval</span>
                    ) : selectedUserForModal.status === 'Rejected' ? (
                      <span className="user-status-pill user-status-rejected">✕ Rejected</span>
                    ) : (
                      <span className="user-status-pill user-status-approved">✓ Approved</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Profile Details List */}
              <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
                {[
                  { label: 'Mobile Number', value: selectedUserForModal.mobile || 'Not provided', icon: '📱' },
                  { label: 'Email Address', value: selectedUserForModal.email || 'Not provided', icon: '✉️' },
                  { label: 'Shop / Firm Name', value: selectedUserForModal.shopName || 'Not provided', icon: '🏪' },
                  { label: 'Business Address', value: selectedUserForModal.businessAddress || 'Not provided', icon: '📍' },
                  { label: 'Account Role', value: (selectedUserForModal.role || 'customer').toUpperCase(), icon: '🛡️' },
                  { label: 'Registration Date', value: selectedUserForModal.createdAt ? new Date(selectedUserForModal.createdAt).toLocaleString() : 'Not available', icon: '📅' },
                ].map((item, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 16px', borderBottom: i < 5 ? '1px solid #f1f5f9' : 'none', fontSize: '13px' }}>
                    <span style={{ color: '#64748b', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
                      <span>{item.icon}</span> {item.label}:
                    </span>
                    <strong style={{ color: '#1e293b', textAlign: 'right', maxWidth: '280px', wordBreak: 'break-word' }}>
                      {item.value}
                    </strong>
                  </div>
                ))}
              </div>

              {/* Quick Actions Shortcuts */}
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <button
                  onClick={() => {
                    setIsUserViewModalOpen(false);
                    setPanRetailerFilter(selectedUserForModal.userId);
                    setActiveTab('panSubmissions');
                  }}
                  style={{ flex: 1, padding: '10px 14px', background: '#eff6ff', color: '#1d4ed8', border: '1.5px solid #bfdbfe', borderRadius: '10px', fontSize: '13px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                >
                  📄 View Retailer Filings &amp; Receipts
                </button>
                <button
                  onClick={() => {
                    setIsUserViewModalOpen(false);
                    setSelectedRetailer(selectedUserForModal);
                    setActiveTab('ledgerHistory');
                  }}
                  style={{ flex: 1, padding: '10px 14px', background: '#f0fdf4', color: '#166534', border: '1.5px solid #bbf7d0', borderRadius: '10px', fontSize: '13px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                >
                  💳 Adjust Wallet Balance
                </button>
              </div>

            </div>

            <div className="staff-modal-footer">
              <button 
                type="button" 
                className="staff-modal-cancel-btn"
                onClick={() => setIsUserViewModalOpen(false)}
              >
                Close
              </button>
              <button 
                type="button" 
                className="staff-modal-save-btn"
                style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', boxShadow: '0 4px 12px rgba(245,158,11,0.3)' }}
                onClick={() => {
                  setIsUserViewModalOpen(false);
                  handleOpenEditUser(selectedUserForModal);
                }}
              >
                ✏️ Edit Profile
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PDF TOOLS SUITE 15 SUB-TOOLS MANAGEMENT MODAL */}
      {pdfSubToolsModalOpen && currentPdfTool && (
        <div
          className="staff-modal-overlay"
          style={{
            zIndex: 10050,
            background: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'fixed',
            inset: 0,
            padding: '16px'
          }}
        >
          <div
            className="staff-modal-box"
            style={{
              maxWidth: '960px',
              width: '100%',
              maxHeight: '92vh',
              display: 'flex',
              flexDirection: 'column',
              borderRadius: '16px',
              overflow: 'hidden',
              background: '#ffffff',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
              border: '1px solid #e2e8f0'
            }}
          >
            {/* Modal Header */}
            <div
              className="staff-modal-header"
              style={{
                background: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)',
                borderBottom: '1.5px solid #fed7aa',
                padding: '16px 22px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: '#ea580c', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', boxShadow: '0 4px 10px rgba(234, 88, 12, 0.3)' }}>
                  📑
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#9a3412' }}>
                    PDF Tools Suite — Individual Tools Management (15 Tools)
                  </h3>
                  <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#7c2d12' }}>
                    Turn individual tools ON/OFF, set service fees (₹), and configure custom badges for all 15 tools in the suite
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPdfSubToolsModalOpen(false)}
                style={{
                  background: '#ffffff',
                  border: '1px solid #fed7aa',
                  borderRadius: '50%',
                  width: '32px',
                  height: '32px',
                  fontSize: '15px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  color: '#7c2d12',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 2px 5px rgba(0,0,0,0.06)'
                }}
              >
                ✕
              </button>
            </div>

            {/* Toolbar: Category Filter Tabs, Search & Batch Actions */}
            <div style={{ padding: '12px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                {/* Category Tabs */}
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {[
                    { id: 'all', label: 'All Tools', count: DEFAULT_PDF_SUBTOOLS.length },
                    { id: 'conversion', label: 'Conversion', count: DEFAULT_PDF_SUBTOOLS.filter(t => t.category === 'conversion').length },
                    { id: 'management', label: 'Management', count: DEFAULT_PDF_SUBTOOLS.filter(t => t.category === 'management').length },
                    { id: 'security', label: 'Security', count: DEFAULT_PDF_SUBTOOLS.filter(t => t.category === 'security').length },
                    { id: 'ocr', label: 'OCR / AI', count: DEFAULT_PDF_SUBTOOLS.filter(t => t.category === 'ocr').length }
                  ].map(cat => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setPdfSubToolFilterCategory(cat.id)}
                      style={{
                        padding: '5px 12px',
                        borderRadius: '20px',
                        border: pdfSubToolFilterCategory === cat.id ? '1.5px solid #ea580c' : '1px solid #cbd5e1',
                        background: pdfSubToolFilterCategory === cat.id ? '#ea580c' : '#ffffff',
                        color: pdfSubToolFilterCategory === cat.id ? '#ffffff' : '#475569',
                        fontSize: '11.5px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <span>{cat.label}</span>
                      <span style={{
                        padding: '1px 6px',
                        borderRadius: '10px',
                        fontSize: '10px',
                        fontWeight: 800,
                        background: pdfSubToolFilterCategory === cat.id ? 'rgba(255,255,255,0.25)' : '#f1f5f9',
                        color: pdfSubToolFilterCategory === cat.id ? '#ffffff' : '#64748b'
                      }}>
                        {cat.count}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Batch Quick Actions & Active Count */}
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{
                    padding: '4px 10px',
                    borderRadius: '20px',
                    background: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    color: '#15803d',
                    fontSize: '11.5px',
                    fontWeight: 800
                  }}>
                    ✓ {Object.values(pdfSubToolsState).filter(t => t.isActive !== false).length} / {DEFAULT_PDF_SUBTOOLS.length} Active
                  </span>
                  <button
                    type="button"
                    onClick={() => handleBatchTogglePdfSubTools(true)}
                    style={{
                      padding: '5px 10px',
                      borderRadius: '6px',
                      border: '1px solid #86efac',
                      background: '#f0fdf4',
                      color: '#15803d',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                    title="Turn all 15 tools ON"
                  >
                    🟢 All ON
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBatchTogglePdfSubTools(false)}
                    style={{
                      padding: '5px 10px',
                      borderRadius: '6px',
                      border: '1px solid #e2e8f0',
                      background: '#f8fafc',
                      color: '#64748b',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                    title="Turn all tools OFF"
                  >
                    ⚪ All OFF
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBatchFeePdfSubTools(0)}
                    style={{
                      padding: '5px 10px',
                      borderRadius: '6px',
                      border: '1px solid #fed7aa',
                      background: '#fff7ed',
                      color: '#c2410c',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                    title="Make all tools Free (₹0 fee)"
                  >
                    🏷️ All Free (₹0)
                  </button>
                </div>
              </div>

              {/* Search input */}
              <div>
                <input
                  type="text"
                  placeholder="Search sub-tools (e.g. Word, Compress, Password, Split, OCR)..."
                  value={pdfSubToolSearch}
                  onChange={e => setPdfSubToolSearch(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '7px 12px',
                    borderRadius: '8px',
                    border: '1.5px solid #cbd5e1',
                    fontSize: '12px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            </div>

            {/* Modal Sub-Tools List */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: '10px', background: '#f8fafc' }}>
              {DEFAULT_PDF_SUBTOOLS
                .filter(def => {
                  const state = pdfSubToolsState[def.id] || def;
                  if (pdfSubToolFilterCategory !== 'all' && def.category !== pdfSubToolFilterCategory) return false;
                  if (pdfSubToolSearch.trim()) {
                    const q = pdfSubToolSearch.toLowerCase();
                    return (
                      (state.title || def.title).toLowerCase().includes(q) ||
                      (state.badge || def.badge).toLowerCase().includes(q) ||
                      def.description.toLowerCase().includes(q)
                    );
                  }
                  return true;
                })
                .map(def => {
                  const state = pdfSubToolsState[def.id] || def;
                  const isActive = state.isActive !== false;
                  return (
                    <div
                      key={def.id}
                      style={{
                        background: isActive ? '#ffffff' : '#f8fafc',
                        border: isActive ? '1.5px solid #e2e8f0' : '1.5px dashed #cbd5e1',
                        borderRadius: '12px',
                        padding: '12px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '14px',
                        boxShadow: isActive ? '0 2px 6px rgba(0,0,0,0.03)' : 'none',
                        opacity: isActive ? 1 : 0.75,
                        transition: 'all 0.2s'
                      }}
                    >
                      {/* Icon & Title */}
                      <div style={{
                        fontSize: '22px',
                        width: '40px',
                        height: '40px',
                        borderRadius: '10px',
                        background: isActive ? '#fff7ed' : '#f1f5f9',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}>
                        {def.icon}
                      </div>

                      {/* Info & Title edit */}
                      <div style={{ flex: 1.4, minWidth: '180px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <input
                            type="text"
                            value={state.title || def.title}
                            onChange={e => handleTitleChangePdfSubTool(def.id, e.target.value)}
                            style={{
                              fontWeight: 800,
                              fontSize: '13.5px',
                              color: isActive ? '#0f172a' : '#64748b',
                              border: '1px solid transparent',
                              background: 'transparent',
                              padding: '2px 4px',
                              borderRadius: '4px',
                              maxWidth: '220px'
                            }}
                            onFocus={e => { e.target.style.border = '1px solid #cbd5e1'; e.target.style.background = '#ffffff'; }}
                            onBlur={e => { e.target.style.border = '1px solid transparent'; e.target.style.background = 'transparent'; }}
                            title="Click to rename sub-tool title"
                          />
                          <span style={{
                            fontSize: '10px',
                            padding: '2px 7px',
                            borderRadius: '6px',
                            background: '#f1f5f9',
                            color: '#475569',
                            fontWeight: 700,
                            textTransform: 'uppercase'
                          }}>
                            {def.category}
                          </span>
                          <span style={{
                            fontSize: '10px',
                            padding: '2px 7px',
                            borderRadius: '6px',
                            background: isActive ? '#dcfce7' : '#f1f5f9',
                            color: isActive ? '#15803d' : '#64748b',
                            fontWeight: 800
                          }}>
                            {isActive ? 'ACTIVE' : 'OFF'}
                          </span>
                        </div>
                        <p style={{ margin: '3px 0 0 0', fontSize: '11px', color: '#64748b', lineHeight: '1.3' }}>
                          {def.description}
                        </p>
                      </div>

                      {/* Service Fee Controls */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '160px' }}>
                        <label style={{ fontSize: '10.5px', fontWeight: 700, color: '#475569' }}>
                          Service Charge / Fee (₹)
                        </label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <div style={{ position: 'relative', width: '75px' }}>
                            <span style={{ position: 'absolute', left: '7px', top: '50%', transform: 'translateY(-50%)', fontSize: '11px', color: '#64748b', fontWeight: 800 }}>₹</span>
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={state.fee !== undefined ? state.fee : 0}
                              onChange={e => handleFeeChangePdfSubTool(def.id, e.target.value)}
                              style={{
                                width: '100%',
                                padding: '5px 6px 5px 18px',
                                borderRadius: '6px',
                                border: '1px solid #cbd5e1',
                                fontSize: '12px',
                                fontWeight: 700,
                                boxSizing: 'border-box'
                              }}
                            />
                          </div>
                          {/* Quick chips */}
                          <div style={{ display: 'flex', gap: '3px' }}>
                            {[0, 5, 10].map(amt => (
                              <button
                                key={amt}
                                type="button"
                                onClick={() => handleFeeChangePdfSubTool(def.id, amt)}
                                style={{
                                  padding: '3px 6px',
                                  borderRadius: '4px',
                                  border: (state.fee || 0) === amt ? '1px solid #ea580c' : '1px solid #e2e8f0',
                                  background: (state.fee || 0) === amt ? '#fff7ed' : '#ffffff',
                                  color: (state.fee || 0) === amt ? '#ea580c' : '#475569',
                                  fontSize: '10px',
                                  fontWeight: 700,
                                  cursor: 'pointer'
                                }}
                              >
                                {amt === 0 ? 'Free' : `₹${amt}`}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Custom Badge Label Input */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '110px' }}>
                        <label style={{ fontSize: '10.5px', fontWeight: 700, color: '#475569' }}>
                          Badge Label
                        </label>
                        <input
                          type="text"
                          value={state.badge || ''}
                          placeholder={def.badge}
                          onChange={e => handleBadgeChangePdfSubTool(def.id, e.target.value)}
                          style={{
                            padding: '5px 8px',
                            borderRadius: '6px',
                            border: '1px solid #cbd5e1',
                            fontSize: '11.5px',
                            boxSizing: 'border-box'
                          }}
                        />
                      </div>

                      {/* Action Button: ON/OFF Toggle */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto', flexShrink: 0 }}>
                        <button
                          type="button"
                          onClick={() => handleTogglePdfSubTool(def.id)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            padding: '6px 14px',
                            borderRadius: '16px',
                            border: 'none',
                            fontSize: '12px',
                            fontWeight: 800,
                            cursor: 'pointer',
                            background: isActive ? '#10b981' : '#e2e8f0',
                            color: isActive ? '#ffffff' : '#64748b',
                            boxShadow: isActive ? '0 2px 6px rgba(16, 185, 129, 0.25)' : 'none',
                            transition: 'all 0.2s'
                          }}
                          title={isActive ? 'Turn OFF this tool' : 'Turn ON this tool'}
                        >
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: isActive ? '#fff' : '#94a3b8' }}></span>
                          {isActive ? 'ON' : 'OFF'}
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>

            {/* Modal Footer */}
            <div
              className="staff-modal-footer"
              style={{
                padding: '14px 22px',
                background: '#ffffff',
                borderTop: '1px solid #e2e8f0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <span style={{ fontSize: '12px', color: '#64748b' }}>
                💡 Changes take effect immediately in the User Panel upon saving.
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="staff-modal-cancel-btn"
                  onClick={() => setPdfSubToolsModalOpen(false)}
                  style={{
                    padding: '8px 18px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    background: '#f8fafc',
                    color: '#475569',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSavingPdfSubTools}
                  onClick={handleSavePdfSubTools}
                  style={{
                    padding: '8px 22px',
                    borderRadius: '8px',
                    border: 'none',
                    background: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)',
                    color: '#ffffff',
                    fontSize: '12.5px',
                    fontWeight: 800,
                    cursor: isSavingPdfSubTools ? 'not-allowed' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 4px 12px rgba(234, 88, 12, 0.3)'
                  }}
                >
                  {isSavingPdfSubTools ? 'Saving Changes...' : '💾 Save Sub-Tools Settings'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Hidden Container for Form 49A PDF Generation */}
      <Form49APdfTemplate data={pdfTargetData || selectedPanAppDetails?.details || selectedPanAppDetails || {}} />

    </div>
  );
};

export default AdminPanel;
