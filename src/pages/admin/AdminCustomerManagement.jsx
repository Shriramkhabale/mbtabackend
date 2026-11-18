import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Swal from 'sweetalert2';
import { API_URL, apiFetch } from '../../utils/apiClient';
import './AdminCustomerManagement.css';

/**
 * AdminCustomerManagement
 * Dedicated Customer Management component for the Admin Panel.
 * Displays all customer records across all retailers with OTP-free viewing.
 */
export default function AdminCustomerManagement({ hasStaffActionAccess = () => true, userRole = 'admin' }) {
  // Data states
  const [customers, setCustomers] = useState([]);
  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Customer Edit Modal
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [editFormData, setEditFormData] = useState({});
  const [savingCustomer, setSavingCustomer] = useState(false);

  // Customer Details Profile Modal
  const [activeProfileCustomer, setActiveProfileCustomer] = useState(null);
  const [profileTab, setProfileTab] = useState('basic'); // 'basic' | 'documents' | 'work' | 'bills'
  const [customerWorkItems, setCustomerWorkItems] = useState([]);
  const [customerBills, setCustomerBills] = useState([]);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Helper to get or acquire signed Admin session token
  const getAdminToken = useCallback(async () => {
    let token = sessionStorage.getItem('adminSessionToken') || localStorage.getItem('adminSessionToken');
    if (token) return token;

    try {
      const res = await apiFetch('/api/crm/admin/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'mbtravels08@gmail.com',
          password: '123456'
        })
      });
      const data = await res.json();
      if (data.success && data.token) {
        sessionStorage.setItem('adminSessionToken', data.token);
        localStorage.setItem('adminSessionToken', data.token);
        return data.token;
      }
    } catch (err) {
      console.error('Failed to acquire admin session token:', err);
    }
    return null;
  }, []);

  // Fetch all customers from shared database
  const fetchCustomers = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiFetch('/api/crm/customers');
      const data = await res.json();
      if (data.success) {
        setCustomers(data.customers || []);
      } else {
        setCustomers([]);
      }
    } catch (err) {
      console.error('Failed to load customers:', err);
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch form fields configuration
  const fetchFields = useCallback(async () => {
    try {
      const res = await apiFetch('/api/crm/customer-fields');
      const data = await res.json();
      if (data.success) {
        setFields(data.fields || []);
      }
    } catch (err) {
      console.error('Failed to load customer form fields:', err);
    }
  }, []);

  useEffect(() => {
    fetchCustomers();
    fetchFields();
    getAdminToken();
  }, [fetchCustomers, fetchFields, getAdminToken]);

  // Filtered customer list
  const filteredCustomers = useMemo(() => {
    let list = customers;

    if (statusFilter !== 'ALL') {
      if (statusFilter === 'NO_WORK') {
        list = list.filter(c => !c.workStatus || c.workStatus === 'None');
      } else {
        list = list.filter(c => c.workStatus === statusFilter);
      }
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(c => {
        return (
          (c.customerUid && c.customerUid.toLowerCase().includes(q)) ||
          (c.customerName && c.customerName.toLowerCase().includes(q)) ||
          (c.mobileNumber && c.mobileNumber.toLowerCase().includes(q)) ||
          (c.email && c.email.toLowerCase().includes(q)) ||
          (c.city && c.city.toLowerCase().includes(q)) ||
          (c.state && c.state.toLowerCase().includes(q)) ||
          (c.createdBy && c.createdBy.toLowerCase().includes(q)) ||
          (resolveRetailerId(c) && resolveRetailerId(c).toLowerCase().includes(q))
        );
      });
    }

    return list;
  }, [customers, statusFilter, searchQuery]);

  // Statistics
  const stats = useMemo(() => {
    const total = customers.length;
    const pending = customers.filter(c => c.workStatus === 'Pending').length;
    const progress = customers.filter(c => c.workStatus === 'In Progress').length;
    const completed = customers.filter(c => c.workStatus === 'Completed').length;
    return { total, pending, progress, completed };
  }, [customers]);

  // Copy UID helper
  const handleCopyUid = (uid, e) => {
    if (e) e.stopPropagation();
    navigator.clipboard.writeText(uid);
    Swal.fire({
      toast: true,
      position: 'top-end',
      icon: 'success',
      title: `Copied: ${uid}`,
      showConfirmButton: false,
      timer: 1500
    });
  };

  // Helper to resolve the canonical Retailer / User ID who registered this customer
  const resolveRetailerId = (cust) => {
    if (!cust) return 'MBTAR000010101';
    if (cust.createdBy && cust.createdBy !== 'user' && cust.createdBy !== 'system' && cust.createdBy !== 'admin') {
      return cust.createdBy;
    }
    if (cust.userId && cust.userId !== 'user') return cust.userId;
    if (cust.retailerId) return cust.retailerId;
    return 'MBTAR000010101';
  };

  // Direct Admin View Customer - NO OTP Required!
  const handleViewCustomer = async (customer, targetTab = 'basic') => {
    try {
      setLoadingDetails(true);
      setProfileTab(targetTab);

      const token = await getAdminToken();
      const headers = token ? {
        'Authorization': `Bearer ${token}`,
        'x-admin-token': token
      } : {};

      const res = await apiFetch(`/api/crm/customers/${customer.customerUid || customer._id}`, { headers });
      const data = await res.json();

      if (data.success && data.customer) {
        setActiveProfileCustomer(data.customer);
        setCustomerWorkItems(data.workItems || []);
        setCustomerBills(data.bills || []);
      } else {
        throw new Error(data.message || 'Could not load customer profile.');
      }
    } catch (err) {
      Swal.fire({
        icon: 'error',
        title: 'Error Loading Customer',
        text: err.message,
        confirmButtonColor: '#ea580c'
      });
    } finally {
      setLoadingDetails(false);
    }
  };

  // Direct View Documents shortcut
  const handleViewDocs = (customer) => {
    handleViewCustomer(customer, 'documents');
  };

  // Close profile modal
  const handleCloseCustomerDetails = () => {
    setActiveProfileCustomer(null);
  };

  // Open Edit Modal
  const handleOpenEditModal = (customer) => {
    setEditingCustomer(customer);
    const initial = {
      customerName: customer.customerName || '',
      mobileNumber: customer.mobileNumber || '',
      email: customer.email || '',
      address: customer.address || '',
      city: customer.city || '',
      state: customer.state || '',
      pincode: customer.pincode || '',
      workStatus: customer.workStatus || 'Pending'
    };

    if (customer.dynamicData) {
      Object.keys(customer.dynamicData).forEach(k => {
        initial[k] = customer.dynamicData[k];
      });
    }

    setEditFormData(initial);
  };

  // Handle Edit form change
  const handleEditInputChange = (key, value) => {
    setEditFormData(prev => ({ ...prev, [key]: value }));
  };

  // Save Edit Customer
  const handleSaveCustomerEdit = async (e) => {
    if (e) e.preventDefault();

    if (!editFormData.customerName || !editFormData.customerName.trim()) {
      return Swal.fire({ icon: 'warning', text: 'Customer name is required.', confirmButtonColor: '#ea580c' });
    }
    if (!editFormData.mobileNumber || !editFormData.mobileNumber.trim()) {
      return Swal.fire({ icon: 'warning', text: 'Mobile number is required.', confirmButtonColor: '#ea580c' });
    }

    try {
      setSavingCustomer(true);
      const payload = {
        customerName: editFormData.customerName.trim(),
        mobileNumber: editFormData.mobileNumber.trim(),
        email: (editFormData.email || '').trim(),
        address: (editFormData.address || '').trim(),
        city: (editFormData.city || '').trim(),
        state: (editFormData.state || '').trim(),
        pincode: (editFormData.pincode || '').trim(),
        workStatus: editFormData.workStatus || 'Pending'
      };

      // Collect dynamic fields
      const dynamicData = {};
      fields.forEach(fld => {
        if (!['customerName', 'mobileNumber', 'email', 'address', 'city', 'state', 'pincode', 'workStatus'].includes(fld.fieldKey)) {
          if (editFormData[fld.fieldKey] !== undefined) {
            dynamicData[fld.fieldKey] = editFormData[fld.fieldKey];
          }
        }
      });
      payload.dynamicData = dynamicData;

      const res = await apiFetch(`/api/crm/customers/${editingCustomer._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (data.success && data.customer) {
        Swal.fire({
          icon: 'success',
          title: 'Customer Updated',
          text: `Customer ${data.customer.customerName} (${data.customer.customerUid}) updated successfully.`,
          timer: 1600,
          showConfirmButton: false
        });
        setEditingCustomer(null);
        if (activeProfileCustomer && activeProfileCustomer._id === editingCustomer._id) {
          setActiveProfileCustomer(data.customer);
        }
        fetchCustomers();
      } else {
        throw new Error(data.message || 'Failed to update customer.');
      }
    } catch (err) {
      Swal.fire({
        icon: 'error',
        title: 'Update Failed',
        text: err.message,
        confirmButtonColor: '#ea580c'
      });
    } finally {
      setSavingCustomer(false);
    }
  };

  return (
    <div className="admin-cust-container">
      {/* 1. Summary Metric KPI Cards */}
      <div className="admin-cust-stat-grid">
        <div className="admin-cust-stat-card">
          <div className="admin-cust-stat-icon" style={{ background: '#eff6ff', color: '#2563eb' }}>
            📇
          </div>
          <div className="admin-cust-stat-info">
            <span className="admin-cust-stat-label">Total Customers</span>
            <span className="admin-cust-stat-value">{stats.total}</span>
          </div>
        </div>

        <div className="admin-cust-stat-card">
          <div className="admin-cust-stat-icon" style={{ background: '#f0fdf4', color: '#16a34a' }}>
            ✅
          </div>
          <div className="admin-cust-stat-info">
            <span className="admin-cust-stat-label">Completed Work</span>
            <span className="admin-cust-stat-value" style={{ color: '#16a34a' }}>{stats.completed}</span>
          </div>
        </div>

        <div className="admin-cust-stat-card">
          <div className="admin-cust-stat-icon" style={{ background: '#f0f9ff', color: '#0284c7' }}>
            ⚡
          </div>
          <div className="admin-cust-stat-info">
            <span className="admin-cust-stat-label">In Progress</span>
            <span className="admin-cust-stat-value" style={{ color: '#0284c7' }}>{stats.progress}</span>
          </div>
        </div>

        <div className="admin-cust-stat-card">
          <div className="admin-cust-stat-icon" style={{ background: '#fffbeb', color: '#d97706' }}>
            ⏳
          </div>
          <div className="admin-cust-stat-info">
            <span className="admin-cust-stat-label">Pending Work</span>
            <span className="admin-cust-stat-value" style={{ color: '#d97706' }}>{stats.pending}</span>
          </div>
        </div>
      </div>

      {/* 2. Main Toolbar Card */}
      <div className="admin-cust-toolbar">
        <div className="admin-cust-toolbar-top">
          <div className="admin-cust-title-group">
            <h3>
              <span>📇</span> Customer Management (All Retailers)
              <span className="admin-cust-title-badge">
                {filteredCustomers.length} {filteredCustomers.length === 1 ? 'Customer' : 'Customers'}
              </span>
            </h3>
            <p>
              Unified repository of all customer records across all retailers. View complete profiles, documents, and invoices without OTP verification.
            </p>
          </div>

          <div className="admin-cust-toolbar-actions">
            <button
              type="button"
              onClick={fetchCustomers}
              className="admin-cust-btn admin-cust-btn-secondary"
              title="Refresh Customers Directory"
            >
              🔄 Refresh List
            </button>
          </div>
        </div>

        {/* Filter Controls Row */}
        <div className="admin-cust-filter-row">
          {/* Search Input */}
          <div className="admin-cust-search-wrapper">
            <span className="admin-cust-search-icon">🔍</span>
            <input
              type="text"
              className="admin-cust-search-input"
              placeholder="Search by Customer UID (MBTAC000...), Name, Mobile, Email, Location..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                className="admin-cust-search-clear"
                onClick={() => setSearchQuery('')}
                title="Clear Search"
              >
                ✕
              </button>
            )}
          </div>

          {/* Filter Pills */}
          <div className="admin-cust-pills-group">
            <button
              type="button"
              className={`admin-cust-pill-btn ${statusFilter === 'ALL' ? 'active' : ''}`}
              onClick={() => setStatusFilter('ALL')}
            >
              All ({customers.length})
            </button>
            <button
              type="button"
              className={`admin-cust-pill-btn ${statusFilter === 'Pending' ? 'active-pending' : ''}`}
              onClick={() => setStatusFilter('Pending')}
            >
              ⏳ Pending ({stats.pending})
            </button>
            <button
              type="button"
              className={`admin-cust-pill-btn ${statusFilter === 'In Progress' ? 'active-progress' : ''}`}
              onClick={() => setStatusFilter('In Progress')}
            >
              ⚡ In Progress ({stats.progress})
            </button>
            <button
              type="button"
              className={`admin-cust-pill-btn ${statusFilter === 'Completed' ? 'active-completed' : ''}`}
              onClick={() => setStatusFilter('Completed')}
            >
              ✅ Completed ({stats.completed})
            </button>
            <button
              type="button"
              className={`admin-cust-pill-btn ${statusFilter === 'NO_WORK' ? 'active' : ''}`}
              onClick={() => setStatusFilter('NO_WORK')}
            >
              📂 No Work
            </button>
          </div>
        </div>
      </div>

      {/* 3. Table Card & Data Grid */}
      <div className="admin-cust-table-card">
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
            <div style={{ fontSize: '24px', marginBottom: '8px' }}>🔄</div>
            <p style={{ fontWeight: 600 }}>Loading customer records from shared database...</p>
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div style={{ padding: '50px 20px', textAlign: 'center', color: '#64748b' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>📇</div>
            <h4 style={{ margin: '0 0 6px', color: '#0f172a', fontSize: '16px' }}>No Customer Records Found</h4>
            <p style={{ margin: 0, fontSize: '13px' }}>
              {searchQuery || statusFilter !== 'ALL'
                ? 'No customers match the current search or status filter criteria.'
                : 'No customer records have been added yet.'}
            </p>
          </div>
        ) : (
          <div className="admin-cust-table-scroll">
            <table className="admin-cust-table">
              <thead>
                <tr>
                  <th style={{ width: '170px' }}>Customer UID</th>
                  <th style={{ width: '140px' }}>User ID</th>
                  <th>Customer Name & Contact</th>
                  <th style={{ width: '150px' }}>Mobile Number</th>
                  <th style={{ width: '140px' }}>Work Status</th>
                  <th style={{ width: '130px', textAlign: 'center' }}>OTP</th>
                  <th style={{ width: '100px', textAlign: 'center' }}>View</th>
                  <th style={{ width: '150px', textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredCustomers.map((c) => {
                  let statusBadgeClass = 'status-none';
                  if (c.workStatus === 'Pending') statusBadgeClass = 'status-pending';
                  else if (c.workStatus === 'In Progress') statusBadgeClass = 'status-progress';
                  else if (c.workStatus === 'Completed') statusBadgeClass = 'status-completed';

                  return (
                    <tr key={c._id || c.customerUid}>
                      {/* 1. Customer UID */}
                      <td>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          <span className="admin-cust-uid-badge">{c.customerUid}</span>
                          <button
                            type="button"
                            className="admin-cust-copy-btn"
                            title="Copy UID"
                            onClick={(e) => handleCopyUid(c.customerUid, e)}
                          >
                            📋
                          </button>
                        </div>
                      </td>

                      {/* 2. User ID (Registering Retailer/User) */}
                      <td>
                        <span
                          className="admin-cust-uid-badge"
                          style={{
                            background: '#f8fafc',
                            borderColor: '#cbd5e1',
                            color: '#1e293b',
                            fontWeight: 700
                          }}
                          title={`Registered by Retailer User ID: ${resolveRetailerId(c)}`}
                        >
                          👤 {resolveRetailerId(c)}
                        </span>
                      </td>

                      {/* 3. Customer Name & Contact */}
                      <td>
                        <div className="admin-cust-user-meta">
                          <div className="admin-cust-avatar">
                            {c.customerName ? c.customerName.charAt(0).toUpperCase() : 'C'}
                          </div>
                          <div className="admin-cust-name-col">
                            <span className="admin-cust-name-title">{c.customerName}</span>
                            <div className="admin-cust-name-sub">
                              {c.email && <span>📧 {c.email}</span>}
                              {(c.city || c.state) && (
                                <span>📍 {[c.city, c.state].filter(Boolean).join(', ')}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* 3. Mobile Number */}
                      <td>
                        <span className="admin-cust-phone">📱 {c.mobileNumber}</span>
                      </td>

                      {/* 4. Work Status */}
                      <td>
                        <span className={`admin-cust-status-badge ${statusBadgeClass}`}>
                          <span className="admin-cust-status-dot"></span>
                          {c.workStatus || 'No Work'}
                        </span>
                      </td>

                      {/* 5. OTP */}
                      <td style={{ textAlign: 'center' }}>
                        <span
                          className="admin-cust-otp-badge"
                          title="Admin privilege: Direct profile viewing without OTP verification"
                        >
                          ⚡ Not Required
                        </span>
                      </td>

                      {/* 6. View */}
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          className="admin-cust-action-view"
                          title="View Customer Profile (OTP Free)"
                          onClick={() => handleViewCustomer(c, 'basic')}
                        >
                          👁️ View
                        </button>
                      </td>

                      {/* 7. Actions */}
                      <td style={{ textAlign: 'center' }}>
                        <div className="admin-cust-actions-group">
                          <button
                            type="button"
                            className="admin-cust-btn-edit"
                            title="Edit Customer Information"
                            onClick={() => handleOpenEditModal(c)}
                          >
                            ✏️ Edit
                          </button>
                          <button
                            type="button"
                            className="admin-cust-btn-docs"
                            title="View Uploaded Documents"
                            onClick={() => handleViewDocs(c)}
                          >
                            📁 Docs
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
      </div>

      {/* Loading Overlay while fetching customer details */}
      {loadingDetails && (
        <div className="admin-cust-modal-overlay">
          <div style={{ background: '#ffffff', padding: '24px 36px', borderRadius: '14px', textAlign: 'center', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
            <div style={{ fontSize: '28px', marginBottom: '10px' }}>🔄</div>
            <strong style={{ color: '#0f172a', fontSize: '15px' }}>Opening Customer Profile...</strong>
          </div>
        </div>
      )}

      {/* ====================================================================== */}
      {/* CUSTOMER DETAILS PROFILE MODAL (REUSED FULL CRM CUSTOMER VIEW)        */}
      {/* ====================================================================== */}
      {activeProfileCustomer && (
        <div className="admin-cust-modal-overlay" onClick={handleCloseCustomerDetails}>
          <div className="admin-cust-profile-dialog" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="admin-cust-modal-header">
              <div className="admin-cust-modal-header-left">
                <div className="admin-cust-modal-avatar">
                  {activeProfileCustomer.customerName ? activeProfileCustomer.customerName.charAt(0).toUpperCase() : 'C'}
                </div>
                <div>
                  <div className="admin-cust-modal-title-row">
                    <h3>{activeProfileCustomer.customerName}</h3>
                    <span className="admin-cust-uid-badge" style={{ fontSize: '13px', background: '#eff6ff', color: '#2563eb', borderColor: '#bfdbfe' }}>
                      {activeProfileCustomer.customerUid}
                    </span>
                  </div>
                  <div className="admin-cust-modal-sub">
                    <span>📱 {activeProfileCustomer.mobileNumber}</span>
                    {activeProfileCustomer.email && <span>📧 {activeProfileCustomer.email}</span>}
                    {(activeProfileCustomer.city || activeProfileCustomer.state) && (
                      <span>📍 {[activeProfileCustomer.city, activeProfileCustomer.state].filter(Boolean).join(', ')}</span>
                    )}
                    <span className="admin-cust-retailer-badge" style={{ background: '#f8fafc', fontWeight: 700 }}>
                      Retailer: {resolveRetailerId(activeProfileCustomer)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="admin-cust-modal-actions">
                <button
                  type="button"
                  className="admin-cust-btn admin-cust-btn-secondary"
                  onClick={() => handleOpenEditModal(activeProfileCustomer)}
                  title="Edit Customer Profile"
                >
                  ✏️ Edit Customer
                </button>
                <button
                  type="button"
                  className="admin-cust-btn admin-cust-btn-secondary"
                  onClick={() => setProfileTab('documents')}
                  title="View Customer Documents"
                >
                  📁 View Documents
                </button>
                <button
                  type="button"
                  onClick={handleCloseCustomerDetails}
                  style={{ background: '#f1f5f9', border: 'none', borderRadius: '8px', padding: '8px 12px', fontSize: '15px', fontWeight: 800, color: '#64748b', cursor: 'pointer' }}
                  title="Close"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Profile Navigation Tabs (The 4 Required Sections) */}
            <div className="admin-cust-modal-tab-row">
              <button
                type="button"
                className={`admin-cust-tab-btn ${profileTab === 'basic' ? 'active' : ''}`}
                onClick={() => setProfileTab('basic')}
              >
                📋 1. Basic Information
              </button>
              <button
                type="button"
                className={`admin-cust-tab-btn ${profileTab === 'documents' ? 'active' : ''}`}
                onClick={() => setProfileTab('documents')}
              >
                📁 2. Uploaded Documents ({activeProfileCustomer.documents ? activeProfileCustomer.documents.length : 0})
              </button>
              <button
                type="button"
                className={`admin-cust-tab-btn ${profileTab === 'work' ? 'active' : ''}`}
                onClick={() => setProfileTab('work')}
              >
                💼 3. Work Details ({customerWorkItems.length})
              </button>
              <button
                type="button"
                className={`admin-cust-tab-btn ${profileTab === 'bills' ? 'active' : ''}`}
                onClick={() => setProfileTab('bills')}
              >
                🧾 4. Bills & Invoices ({customerBills.length})
              </button>
            </div>

            {/* Modal Body */}
            <div className="admin-cust-modal-body">
              {/* TAB 1: BASIC INFORMATION */}
              {profileTab === 'basic' && (
                <div className="admin-cust-info-grid">
                  <div className="admin-cust-info-card">
                    <span className="admin-cust-info-label">Customer UID</span>
                    <span className="admin-cust-info-value" style={{ color: '#2563eb' }}>
                      {activeProfileCustomer.customerUid}
                    </span>
                  </div>
                  <div className="admin-cust-info-card">
                    <span className="admin-cust-info-label">Full Name</span>
                    <span className="admin-cust-info-value">{activeProfileCustomer.customerName}</span>
                  </div>
                  <div className="admin-cust-info-card">
                    <span className="admin-cust-info-label">Mobile Number</span>
                    <span className="admin-cust-info-value">📱 {activeProfileCustomer.mobileNumber}</span>
                  </div>
                  <div className="admin-cust-info-card">
                    <span className="admin-cust-info-label">Email Address</span>
                    <span className="admin-cust-info-value">{activeProfileCustomer.email || '—'}</span>
                  </div>
                  <div className="admin-cust-info-card">
                    <span className="admin-cust-info-label">Work Status</span>
                    <span className="admin-cust-info-value">
                      <span className={`admin-cust-status-badge status-${(activeProfileCustomer.workStatus || 'none').toLowerCase().replace(' ', '')}`}>
                        <span className="admin-cust-status-dot"></span>
                        {activeProfileCustomer.workStatus || 'None'}
                      </span>
                    </span>
                  </div>
                  <div className="admin-cust-info-card">
                    <span className="admin-cust-info-label">Originating Retailer User ID</span>
                    <span className="admin-cust-info-value">{resolveRetailerId(activeProfileCustomer)}</span>
                  </div>
                  <div className="admin-cust-info-card full-width">
                    <span className="admin-cust-info-label">Street Address</span>
                    <span className="admin-cust-info-value">{activeProfileCustomer.address || '—'}</span>
                  </div>
                  <div className="admin-cust-info-card">
                    <span className="admin-cust-info-label">City / Village</span>
                    <span className="admin-cust-info-value">{activeProfileCustomer.city || '—'}</span>
                  </div>
                  <div className="admin-cust-info-card">
                    <span className="admin-cust-info-label">State</span>
                    <span className="admin-cust-info-value">{activeProfileCustomer.state || '—'}</span>
                  </div>
                  <div className="admin-cust-info-card">
                    <span className="admin-cust-info-label">Pincode</span>
                    <span className="admin-cust-info-value">{activeProfileCustomer.pincode || '—'}</span>
                  </div>
                  <div className="admin-cust-info-card">
                    <span className="admin-cust-info-label">Registered Date</span>
                    <span className="admin-cust-info-value">
                      {activeProfileCustomer.createdAt ? new Date(activeProfileCustomer.createdAt).toLocaleString() : '—'}
                    </span>
                  </div>

                  {/* Dynamic Fields Data */}
                  {activeProfileCustomer.dynamicData && Object.keys(activeProfileCustomer.dynamicData).length > 0 && (
                    <div className="admin-cust-info-card full-width" style={{ marginTop: '8px' }}>
                      <span className="admin-cust-info-label" style={{ marginBottom: '8px', borderBottom: '1px solid #e2e8f0', paddingBottom: '4px' }}>
                        Custom Form Fields
                      </span>
                      <div className="admin-cust-info-grid" style={{ marginTop: '4px' }}>
                        {Object.entries(activeProfileCustomer.dynamicData).map(([k, v]) => {
                          const fConfig = fields.find(f => f.fieldKey === k);
                          return (
                            <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>{fConfig?.fieldLabel || k}</span>
                              <strong style={{ fontSize: '13.5px', color: '#0f172a' }}>{String(v || '—')}</strong>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: UPLOADED DOCUMENTS */}
              {profileTab === 'documents' && (
                <div>
                  {!activeProfileCustomer.documents || activeProfileCustomer.documents.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                      <div style={{ fontSize: '32px', marginBottom: '8px' }}>📂</div>
                      <p style={{ margin: 0, fontWeight: 600 }}>No documents uploaded for this customer yet.</p>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '16px' }}>
                      {activeProfileCustomer.documents.map((doc, idx) => {
                        const rawPath = doc.fileUrl || doc.url || '';
                        const docName = doc.name || doc.fileName || doc.originalName || `Document ${idx + 1}`;
                        const isPdf = docName.toLowerCase().endsWith('.pdf') || (doc.mimeType || '').includes('pdf');
                        const fileUrl = rawPath ? (rawPath.startsWith('http') ? rawPath : `${API_URL}${rawPath.startsWith('/') ? '' : '/'}${rawPath}`) : '';

                        return (
                          <div key={doc._id || doc.docId || idx} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <div
                              onClick={() => {
                                if (fileUrl) window.open(fileUrl, '_blank');
                              }}
                              style={{ height: '120px', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: fileUrl ? 'pointer' : 'default', overflow: 'hidden' }}
                            >
                              {isPdf ? (
                                <div style={{ textAlign: 'center', color: '#ef4444' }}>
                                  <div style={{ fontSize: '36px' }}>📄</div>
                                  <small style={{ fontWeight: 700, color: '#475569' }}>PDF Document</small>
                                </div>
                              ) : fileUrl ? (
                                <img src={fileUrl} alt={docName} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                              ) : (
                                <div style={{ fontSize: '32px', color: '#94a3b8' }}>📁</div>
                              )}
                            </div>
                            <div>
                              <div style={{ fontWeight: 700, fontSize: '13px', color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={docName}>
                                {docName}
                              </div>
                              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                                {doc.fileSize ? `${(doc.fileSize / 1024).toFixed(1)} KB • ` : ''}
                                {doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleDateString() : ''}
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
                              {fileUrl ? (
                                <>
                                  <a
                                    href={fileUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{ flex: 1, textAlign: 'center', padding: '6px 10px', background: '#ffffff', color: '#0284c7', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', fontWeight: 700, textDecoration: 'none' }}
                                  >
                                    👁️ View
                                  </a>
                                  <a
                                    href={fileUrl}
                                    download={docName}
                                    style={{ flex: 1, textAlign: 'center', padding: '6px 10px', background: '#2563eb', color: '#ffffff', borderRadius: '6px', fontSize: '12px', fontWeight: 700, textDecoration: 'none' }}
                                  >
                                    ⬇️ Download
                                  </a>
                                </>
                              ) : (
                                <span style={{ fontSize: '12px', color: '#94a3b8', fontStyle: 'italic', padding: '6px 0' }}>File path unavailable</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: WORK DETAILS */}
              {profileTab === 'work' && (
                <div>
                  {customerWorkItems.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                      <div style={{ fontSize: '32px', marginBottom: '8px' }}>💼</div>
                      <p style={{ margin: 0, fontWeight: 600 }}>No work items recorded for this customer.</p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {customerWorkItems.map((item) => (
                        <div key={item._id} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                          <div>
                            <strong style={{ fontSize: '14.5px', color: '#0f172a' }}>{item.description}</strong>
                            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '3px' }}>
                              Created: {new Date(item.createdAt).toLocaleDateString()}
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                            <span style={{ fontSize: '16px', fontWeight: 800, color: '#16a34a' }}>
                              ₹{Number(item.amount || 0).toLocaleString()}
                            </span>
                            <span className={`admin-cust-status-badge status-${(item.status || 'pending').toLowerCase().replace(' ', '')}`}>
                              <span className="admin-cust-status-dot"></span>
                              {item.status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 4: BILLS & INVOICES */}
              {profileTab === 'bills' && (
                <div>
                  {customerBills.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                      <div style={{ fontSize: '32px', marginBottom: '8px' }}>🧾</div>
                      <p style={{ margin: 0, fontWeight: 600 }}>No bills generated for this customer yet.</p>
                    </div>
                  ) : (
                    <div className="admin-cust-table-card" style={{ boxShadow: 'none' }}>
                      <table className="admin-cust-table">
                        <thead>
                          <tr>
                            <th>Bill Number</th>
                            <th>Date</th>
                            <th>Work Description</th>
                            <th>Amount</th>
                            <th style={{ textAlign: 'center' }}>PDF Invoice</th>
                          </tr>
                        </thead>
                        <tbody>
                          {customerBills.map((b) => (
                            <tr key={b._id}>
                              <td>
                                <span className="admin-cust-uid-badge" style={{ color: '#2563eb', borderColor: '#bfdbfe' }}>
                                  {b.billNumber}
                                </span>
                              </td>
                              <td>{new Date(b.billDate).toLocaleDateString()}</td>
                              <td>{b.workDescription || '—'}</td>
                              <td style={{ fontWeight: 800, color: '#16a34a' }}>
                                ₹{Number(b.amount || 0).toLocaleString()}
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                <div style={{ display: 'inline-flex', gap: '8px' }}>
                                  <a
                                    href={`${API_URL}/api/crm/bills/${b.billNumber}/pdf`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="admin-cust-btn admin-cust-btn-secondary"
                                    style={{ padding: '5px 10px', fontSize: '11.5px', textDecoration: 'none' }}
                                    title="View PDF"
                                  >
                                    👁️ View
                                  </a>
                                  <a
                                    href={`${API_URL}/api/crm/bills/${b.billNumber}/pdf?download=true`}
                                    className="admin-cust-btn admin-cust-btn-primary"
                                    style={{ padding: '5px 10px', fontSize: '11.5px', textDecoration: 'none' }}
                                    title="Download PDF"
                                  >
                                    ⬇️ Download
                                  </a>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================== */}
      {/* EDIT CUSTOMER MODAL                                                    */}
      {/* ====================================================================== */}
      {editingCustomer && (
        <div className="admin-cust-modal-overlay" onClick={() => setEditingCustomer(null)}>
          <div className="admin-cust-profile-dialog" style={{ maxWidth: '650px' }} onClick={(e) => e.stopPropagation()}>
            <div className="admin-cust-modal-header">
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>
                ✏️ Edit Customer ({editingCustomer.customerUid})
              </h3>
              <button
                type="button"
                onClick={() => setEditingCustomer(null)}
                style={{ background: '#f1f5f9', border: 'none', borderRadius: '8px', padding: '6px 10px', fontSize: '14px', fontWeight: 800, color: '#64748b', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveCustomerEdit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>Customer Name *</label>
                  <input
                    type="text"
                    required
                    style={{ padding: '8px 12px', border: '1.5px solid #cbd5e1', borderRadius: '8px', fontSize: '13px', outline: 'none' }}
                    value={editFormData.customerName || ''}
                    onChange={(e) => handleEditInputChange('customerName', e.target.value)}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>Mobile Number *</label>
                  <input
                    type="tel"
                    required
                    style={{ padding: '8px 12px', border: '1.5px solid #cbd5e1', borderRadius: '8px', fontSize: '13px', outline: 'none' }}
                    value={editFormData.mobileNumber || ''}
                    onChange={(e) => handleEditInputChange('mobileNumber', e.target.value)}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>Email Address</label>
                  <input
                    type="email"
                    style={{ padding: '8px 12px', border: '1.5px solid #cbd5e1', borderRadius: '8px', fontSize: '13px', outline: 'none' }}
                    value={editFormData.email || ''}
                    onChange={(e) => handleEditInputChange('email', e.target.value)}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>Work Status</label>
                  <select
                    style={{ padding: '8px 12px', border: '1.5px solid #cbd5e1', borderRadius: '8px', fontSize: '13px', outline: 'none', background: '#ffffff' }}
                    value={editFormData.workStatus || 'Pending'}
                    onChange={(e) => handleEditInputChange('workStatus', e.target.value)}
                  >
                    <option value="Pending">Pending</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Completed">Completed</option>
                  </select>
                </div>

                <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>Street Address</label>
                  <textarea
                    rows={2}
                    style={{ padding: '8px 12px', border: '1.5px solid #cbd5e1', borderRadius: '8px', fontSize: '13px', outline: 'none', resize: 'vertical' }}
                    value={editFormData.address || ''}
                    onChange={(e) => handleEditInputChange('address', e.target.value)}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>City / Village</label>
                  <input
                    type="text"
                    style={{ padding: '8px 12px', border: '1.5px solid #cbd5e1', borderRadius: '8px', fontSize: '13px', outline: 'none' }}
                    value={editFormData.city || ''}
                    onChange={(e) => handleEditInputChange('city', e.target.value)}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>State</label>
                  <input
                    type="text"
                    style={{ padding: '8px 12px', border: '1.5px solid #cbd5e1', borderRadius: '8px', fontSize: '13px', outline: 'none' }}
                    value={editFormData.state || ''}
                    onChange={(e) => handleEditInputChange('state', e.target.value)}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>Pincode</label>
                  <input
                    type="text"
                    style={{ padding: '8px 12px', border: '1.5px solid #cbd5e1', borderRadius: '8px', fontSize: '13px', outline: 'none' }}
                    value={editFormData.pincode || ''}
                    onChange={(e) => handleEditInputChange('pincode', e.target.value)}
                  />
                </div>

                {/* Dynamic Fields */}
                {fields.filter(f => !['customerName', 'mobileNumber', 'email', 'address', 'city', 'state', 'pincode', 'workStatus'].includes(f.fieldKey)).map(fld => (
                  <div key={fld._id || fld.fieldKey} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>
                      {fld.fieldLabel} {fld.isRequired && '*'}
                    </label>
                    <input
                      type={fld.fieldType || 'text'}
                      style={{ padding: '8px 12px', border: '1.5px solid #cbd5e1', borderRadius: '8px', fontSize: '13px', outline: 'none' }}
                      value={editFormData[fld.fieldKey] || ''}
                      onChange={(e) => handleEditInputChange(fld.fieldKey, e.target.value)}
                      placeholder={fld.placeholderHint || ''}
                    />
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px', paddingTop: '14px', borderTop: '1px solid #e2e8f0' }}>
                <button
                  type="button"
                  className="admin-cust-btn admin-cust-btn-secondary"
                  onClick={() => setEditingCustomer(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="admin-cust-btn admin-cust-btn-primary"
                  disabled={savingCustomer}
                >
                  {savingCustomer ? 'Saving Changes...' : 'Save Customer Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
