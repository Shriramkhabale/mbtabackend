import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Swal from 'sweetalert2';
import { apiFetch } from '../../utils/apiClient';
import { hasUserAccess, getStoredUserPermissions } from '../../utils/userPermissions';
import './BankAccountDetailsView.css';

const POPULAR_BANKS = [
  'State Bank of India (SBI)',
  'HDFC Bank',
  'ICICI Bank',
  'Axis Bank',
  'Punjab National Bank (PNB)',
  'Bank of Baroda',
  'Canara Bank',
  'Union Bank of India',
  'Kotak Mahindra Bank',
  'IndusInd Bank',
  'IDFC FIRST Bank',
  'Yes Bank',
  'Federal Bank',
  'Central Bank of India',
  'Indian Bank'
];

export default function BankAccountDetailsView({ user, onBack, onNavigateToMoneyTxn, userPermissions }) {
  const effectivePermissions = useMemo(() => {
    return userPermissions || getStoredUserPermissions();
  }, [userPermissions]);

  // Data state
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('ALL');

  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [saving, setSaving] = useState(false);

  // View details modal
  const [viewingAccount, setViewingAccount] = useState(null);
  const [revealFullAccount, setRevealFullAccount] = useState(false);

  // Form State
  const initialForm = {
    bankName: '',
    accountHolderName: '',
    accountNumber: '',
    confirmAccountNumber: '',
    ifscCode: '',
    branchName: '',
    accountType: 'Savings',
    upiId: '',
    accountNickname: '',
    isDefault: false
  };
  const [formData, setFormData] = useState(initialForm);
  const [formErrors, setFormErrors] = useState({});

  // Dynamic Bank Form Fields State
  const [fields, setFields] = useState([]);
  const [showFieldsModal, setShowFieldsModal] = useState(false);
  const [fieldForm, setFieldForm] = useState({
    label: '',
    type: 'text',
    placeholder: '',
    icon: '📝',
    required: false,
    hidden: false,
    options: ''
  });
  const [editingFieldId, setEditingFieldId] = useState(null);
  const [savingField, setSavingField] = useState(false);

  // Resolve active Retailer User ID
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

  // Fetch bank accounts
  const fetchAccounts = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiFetch(`/api/crm/bank-accounts?retailerId=${encodeURIComponent(activeRetailerId)}`, {
        headers: {
          'x-retailer-id': activeRetailerId,
          'x-user-id': activeRetailerId
        }
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.accounts)) {
        setAccounts(data.accounts);
      } else {
        setAccounts([]);
      }
    } catch (err) {
      console.error('Error fetching bank accounts:', err);
    } finally {
      setLoading(false);
    }
  }, [activeRetailerId]);

  // Fetch dynamic bank form fields configuration
  const fetchFields = useCallback(async () => {
    try {
      const res = await apiFetch('/api/crm/bank-fields');
      const data = await res.json();
      if (data.success && Array.isArray(data.fields)) {
        setFields(data.fields);
      }
    } catch (err) {
      console.error('Error fetching bank form fields:', err);
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
    fetchFields();
  }, [fetchAccounts, fetchFields]);

  // Field Builder Handlers
  const handleSaveField = async (e) => {
    if (e) e.preventDefault();
    if (!fieldForm.label || !fieldForm.label.trim()) {
      Swal.fire({
        icon: 'warning',
        title: 'Label Required',
        text: 'Please enter a field label.'
      });
      return;
    }

    try {
      setSavingField(true);
      const payload = {
        label: fieldForm.label.trim(),
        type: fieldForm.type,
        placeholder: (fieldForm.placeholder || '').trim(),
        icon: (fieldForm.icon || '📝').trim() || '📝',
        required: Boolean(fieldForm.required),
        hidden: Boolean(fieldForm.hidden),
        options: fieldForm.type === 'select'
          ? (fieldForm.options || '').split(',').map(s => s.trim()).filter(Boolean)
          : []
      };

      let res;
      if (editingFieldId) {
        res = await apiFetch('/api/crm/bank-fields/' + editingFieldId, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        res = await apiFetch('/api/crm/bank-fields', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }

      const data = await res.json();
      if (data.success) {
        Swal.fire({
          toast: true,
          position: 'top-end',
          icon: 'success',
          title: editingFieldId ? 'Field updated successfully!' : 'New bank field added!',
          showConfirmButton: false,
          timer: 1600
        });
        handleCancelEditField();
        await fetchFields();
      } else {
        Swal.fire({
          icon: 'error',
          title: 'Operation Failed',
          text: data.message || 'Could not save form field.'
        });
      }
    } catch (err) {
      console.error('Error saving bank field:', err);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Server error while saving field.'
      });
    } finally {
      setSavingField(false);
    }
  };

  const handleToggleFieldVisibility = async (field) => {
    try {
      const res = await apiFetch('/api/crm/bank-fields/' + field._id + '/toggle-visibility', {
        method: 'PATCH'
      });
      const data = await res.json();
      if (data.success) {
        Swal.fire({
          toast: true,
          position: 'top-end',
          icon: 'success',
          title: 'Field is now ' + (data.field.hidden ? 'Hidden' : 'Visible'),
          showConfirmButton: false,
          timer: 1400
        });
        await fetchFields();
      }
    } catch (err) {
      console.error('Error toggling visibility:', err);
    }
  };

  const handleToggleFieldRequired = async (field) => {
    try {
      const res = await apiFetch('/api/crm/bank-fields/' + field._id + '/toggle-required', {
        method: 'PATCH'
      });
      const data = await res.json();
      if (data.success) {
        Swal.fire({
          toast: true,
          position: 'top-end',
          icon: 'success',
          title: 'Field is now ' + (data.field.required ? 'Mandatory (*)' : 'Optional'),
          showConfirmButton: false,
          timer: 1400
        });
        await fetchFields();
      }
    } catch (err) {
      console.error('Error toggling required:', err);
    }
  };

  const handleDeleteField = async (field) => {
    const result = await Swal.fire({
      title: 'Delete this field?',
      text: `Are you sure you want to remove "${field.label}"?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#e11d48',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Yes, Delete Field',
      cancelButtonText: 'Cancel'
    });

    if (!result.isConfirmed) return;

    try {
      const res = await apiFetch('/api/crm/bank-fields/' + field._id, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        Swal.fire({
          toast: true,
          position: 'top-end',
          icon: 'success',
          title: 'Field removed successfully.',
          showConfirmButton: false,
          timer: 1500
        });
        if (editingFieldId === field._id) {
          handleCancelEditField();
        }
        await fetchFields();
      } else {
        Swal.fire({
          icon: 'error',
          title: 'Delete Failed',
          text: data.message || 'Could not delete form field.'
        });
      }
    } catch (err) {
      console.error('Error deleting field:', err);
    }
  };

  const handleMoveField = async (index, direction) => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= fields.length) return;

    const newFields = [...fields];
    const temp = newFields[index];
    newFields[index] = newFields[targetIndex];
    newFields[targetIndex] = temp;
    setFields(newFields);

    try {
      const orderedIds = newFields.map(f => f._id);
      await apiFetch('/api/crm/bank-fields/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds })
      });
    } catch (err) {
      console.error('Error reordering fields:', err);
      await fetchFields();
    }
  };

  const handleEditField = (field) => {
    setEditingFieldId(field._id);
    setFieldForm({
      label: field.label,
      type: field.type || 'text',
      placeholder: field.placeholder || '',
      icon: field.icon || '📝',
      required: Boolean(field.required),
      hidden: Boolean(field.hidden),
      options: Array.isArray(field.options) ? field.options.join(', ') : ''
    });
  };

  const handleCancelEditField = () => {
    setEditingFieldId(null);
    setFieldForm({
      label: '',
      type: 'text',
      placeholder: '',
      icon: '📝',
      required: false,
      hidden: false,
      options: ''
    });
  };

  // Filter accounts
  const filteredAccounts = useMemo(() => {
    return accounts.filter((acc) => {
      if (filterType !== 'ALL' && acc.accountType !== filterType) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        (acc.bankName || '').toLowerCase().includes(q) ||
        (acc.accountHolderName || '').toLowerCase().includes(q) ||
        (acc.accountNickname || '').toLowerCase().includes(q) ||
        (acc.ifscCode || '').toLowerCase().includes(q) ||
        (acc.branchName || '').toLowerCase().includes(q) ||
        (acc.accountNumber || '').includes(q)
      );
    });
  }, [accounts, filterType, searchQuery]);

  // Open modal for add
  const handleOpenAdd = () => {
    setEditingAccount(null);
    const initialValues = {
      ...initialForm,
      isDefault: accounts.length === 0
    };
    fields.forEach(f => {
      if (initialValues[f.name] === undefined) {
        initialValues[f.name] = '';
      }
    });
    setFormData(initialValues);
    setFormErrors({});
    setShowModal(true);
  };

  // Open modal for edit
  const handleOpenEdit = (acc) => {
    setEditingAccount(acc);
    const editValues = {
      bankName: acc.bankName || '',
      accountHolderName: acc.accountHolderName || '',
      accountNumber: acc.accountNumber || '',
      confirmAccountNumber: acc.accountNumber || '',
      ifscCode: acc.ifscCode || '',
      branchName: acc.branchName || '',
      accountType: acc.accountType || 'Savings',
      upiId: acc.upiId || '',
      accountNickname: acc.accountNickname || '',
      isDefault: Boolean(acc.isDefault)
    };
    if (acc.dynamicData && typeof acc.dynamicData === 'object') {
      Object.assign(editValues, acc.dynamicData);
    }
    fields.forEach(f => {
      if (editValues[f.name] === undefined) {
        editValues[f.name] = '';
      }
    });
    setFormData(editValues);
    setFormErrors({});
    setShowModal(true);
  };

  // Validate Form
  const validateForm = () => {
    const errors = {};
    const visibleFields = fields.length > 0 ? fields.filter(f => !f.hidden) : [];

    if (visibleFields.length > 0) {
      visibleFields.forEach(f => {
        if (f.required) {
          const val = formData[f.name];
          if (val === undefined || val === null || String(val).trim() === '') {
            errors[f.name] = `${f.label} is required`;
          }
        }
      });
    } else {
      if (!formData.bankName.trim()) errors.bankName = 'Bank name is required';
      if (!formData.accountHolderName.trim()) errors.accountHolderName = 'Account holder name is required';
      if (!formData.accountNumber.trim()) errors.accountNumber = 'Account number is required';
      if (!formData.ifscCode.trim()) errors.ifscCode = 'IFSC code is required';
    }

    const isAccNumVisible = visibleFields.some(f => f.name === 'accountNumber');
    if (isAccNumVisible || visibleFields.length === 0) {
      const acc = String(formData.accountNumber || '').trim();
      if (acc) {
        if (!/^\d{8,22}$/.test(acc)) {
          errors.accountNumber = 'Must be 8 to 22 numeric digits';
        }
        if (!editingAccount && formData.confirmAccountNumber !== undefined && acc !== String(formData.confirmAccountNumber || '').trim()) {
          errors.confirmAccountNumber = 'Account numbers do not match';
        }
      }
    }

    const isIfscVisible = visibleFields.some(f => f.name === 'ifscCode');
    if (isIfscVisible || visibleFields.length === 0) {
      const ifsc = String(formData.ifscCode || '').trim().toUpperCase();
      if (ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) {
        errors.ifscCode = 'Invalid IFSC format (e.g. SBIN0001234, HDFC0000123)';
      }
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Save Account (Add or Edit)
  const handleSaveAccount = async (e) => {
    if (e) e.preventDefault();
    if (!validateForm()) return;

    try {
      setSaving(true);
      const url = editingAccount
        ? `/api/crm/bank-accounts/${editingAccount._id}`
        : '/api/crm/bank-accounts';
      const method = editingAccount ? 'PUT' : 'POST';

      const coreKeys = ['bankName', 'accountHolderName', 'accountNumber', 'confirmAccountNumber', 'ifscCode', 'branchName', 'accountType', 'upiId', 'accountNickname', 'isDefault'];
      const dynamicData = {};
      Object.keys(formData).forEach(k => {
        if (!coreKeys.includes(k) && k !== 'retailerId' && k !== 'dynamicData') {
          dynamicData[k] = formData[k];
        }
      });

      const payload = {
        ...formData,
        bankName: (formData.bankName || '').trim(),
        accountHolderName: (formData.accountHolderName || '').trim(),
        accountNumber: (formData.accountNumber || '').trim(),
        confirmAccountNumber: (formData.confirmAccountNumber || '').trim(),
        ifscCode: (formData.ifscCode || '').trim().toUpperCase(),
        branchName: (formData.branchName || '').trim(),
        accountType: formData.accountType || 'Savings',
        upiId: (formData.upiId || '').trim(),
        accountNickname: (formData.accountNickname || '').trim(),
        dynamicData,
        retailerId: activeRetailerId
      };

      const res = await apiFetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'x-retailer-id': activeRetailerId,
          'x-user-id': activeRetailerId
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (data.success) {
        setShowModal(false);
        await fetchAccounts();
        Swal.fire({
          icon: 'success',
          title: editingAccount ? 'Bank Account Updated' : 'Bank Account Added',
          text: data.message || 'Bank account details saved successfully.',
          timer: 1500,
          showConfirmButton: false
        });
      } else {
        Swal.fire({
          icon: 'error',
          title: 'Operation Failed',
          text: data.message || 'Could not save bank account.'
        });
      }
    } catch (err) {
      console.error('Error saving bank account:', err);
      Swal.fire({
        icon: 'error',
        title: 'Network Error',
        text: 'Failed to communicate with the server.'
      });
    } finally {
      setSaving(false);
    }
  };

  // Delete Account (with transaction check)
  const handleDeleteAccount = async (acc) => {
    const confirm = await Swal.fire({
      title: `Delete ${acc.bankName}?`,
      text: 'Are you sure you want to delete this bank account? Historical transactions will remain preserved.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Yes, Delete',
      cancelButtonText: 'Cancel'
    });

    if (!confirm.isConfirmed) return;

    try {
      const res = await apiFetch(`/api/crm/bank-accounts/${acc._id}`, {
        method: 'DELETE',
        headers: {
          'x-retailer-id': activeRetailerId,
          'x-user-id': activeRetailerId
        }
      });
      const data = await res.json();
      if (data.success) {
        await fetchAccounts();
        Swal.fire({
          icon: 'success',
          title: 'Deleted',
          text: data.message,
          timer: 1500,
          showConfirmButton: false
        });
      } else {
        Swal.fire({
          icon: 'error',
          title: 'Cannot Delete Account',
          text: data.message || 'This account cannot be deleted.'
        });
      }
    } catch (err) {
      console.error('Error deleting account:', err);
      Swal.fire({ icon: 'error', title: 'Error', text: 'Server error while deleting account.' });
    }
  };

  // Set as Default Account
  const handleSetDefault = async (acc) => {
    try {
      const res = await apiFetch(`/api/crm/bank-accounts/${acc._id}/default`, {
        method: 'PATCH',
        headers: {
          'x-retailer-id': activeRetailerId,
          'x-user-id': activeRetailerId
        }
      });
      const data = await res.json();
      if (data.success) {
        await fetchAccounts();
        Swal.fire({
          toast: true,
          position: 'top-end',
          icon: 'success',
          title: `${acc.bankName} set as default account`,
          showConfirmButton: false,
          timer: 1500
        });
      }
    } catch (err) {
      console.error('Error setting default account:', err);
    }
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
      timer: 1200
    });
  };

  return (
    <div className="crm-bank-container">
      {/* 1. Header Banner */}
      <div className="crm-bank-header-card">
        <div className="crm-bank-header-left">
          <button type="button" className="crm-bank-back-btn" onClick={onBack}>
            ← Back to CRM Suite
          </button>
          <div className="crm-bank-title-wrap">
            <div className="crm-bank-icon-box">🏦</div>
            <div>
              <h2>Bank Account Details</h2>
              <p>Manage your linked settlement and commercial bank accounts for financial transactions.</p>
            </div>
          </div>
        </div>

        <div className="crm-bank-header-actions">
          {onNavigateToMoneyTxn && (
            <button
              type="button"
              className="crm-bank-btn crm-bank-btn-secondary"
              onClick={onNavigateToMoneyTxn}
            >
              <span>💸</span> Money Transaction
            </button>
          )}
          <button
            type="button"
            className="crm-bank-btn crm-bank-btn-fields"
            onClick={() => {
              handleCancelEditField();
              setShowFieldsModal(true);
            }}
            title="Configure Dynamic Bank Account Form Fields"
          >
            <span>⚙️</span> Bank Form Fields
          </button>
          {hasUserAccess(effectivePermissions, 'crm.bank.add') && (
            <button
              type="button"
              className="crm-bank-btn crm-bank-btn-primary"
              onClick={handleOpenAdd}
            >
              <span>➕</span> Add New Bank Account
            </button>
          )}
        </div>
      </div>

      {/* 2. Top Summary KPI Cards */}
      <div className="crm-bank-kpi-grid">
        <div className="crm-bank-kpi-card card-blue">
          <div className="kpi-icon">🏛️</div>
          <div className="kpi-info">
            <span className="kpi-label">Total Accounts</span>
            <h3 className="kpi-value">{loading ? '...' : accounts.length}</h3>
            <span className="kpi-sub">Linked to your retailer profile</span>
          </div>
        </div>

        <div className="crm-bank-kpi-card card-emerald">
          <div className="kpi-icon">⭐</div>
          <div className="kpi-info">
            <span className="kpi-label">Default Account</span>
            <h3 className="kpi-value" style={{ fontSize: '16px', fontWeight: 800 }}>
              {loading
                ? '...'
                : accounts.find(a => a.isDefault)?.bankName || 'Not Set'}
            </h3>
            <span className="kpi-sub">
              {accounts.find(a => a.isDefault)?.maskedAccountNumber || 'Select default below'}
            </span>
          </div>
        </div>

        <div className="crm-bank-kpi-card card-purple">
          <div className="kpi-icon">🔒</div>
          <div className="kpi-info">
            <span className="kpi-label">Data Privacy</span>
            <h3 className="kpi-value" style={{ fontSize: '15px', color: '#6b21a8' }}>
              Retailer Confidential
            </h3>
            <span className="kpi-sub">Scoped exclusively to ID: {activeRetailerId}</span>
          </div>
        </div>
      </div>

      {/* 3. Toolbar & Filters */}
      <div className="crm-bank-toolbar">
        <div className="crm-bank-search">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            placeholder="Search by Bank Name, Account Holder, IFSC, Branch..."
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

        <div className="crm-bank-filters">
          <button
            type="button"
            className={`filter-chip ${filterType === 'ALL' ? 'active' : ''}`}
            onClick={() => setFilterType('ALL')}
          >
            All Accounts ({accounts.length})
          </button>
          <button
            type="button"
            className={`filter-chip ${filterType === 'Savings' ? 'active' : ''}`}
            onClick={() => setFilterType('Savings')}
          >
            Savings
          </button>
          <button
            type="button"
            className={`filter-chip ${filterType === 'Current' ? 'active' : ''}`}
            onClick={() => setFilterType('Current')}
          >
            Current
          </button>
        </div>
      </div>

      {/* 4. Accounts Cards / Table Layout */}
      {loading ? (
        <div className="crm-bank-loading-state">
          <div className="crm-spinner" />
          <p>Loading your bank accounts...</p>
        </div>
      ) : filteredAccounts.length === 0 ? (
        <div className="crm-bank-empty-state">
          <span className="empty-icon">🏦</span>
          <h3>No Bank Accounts Found</h3>
          <p>
            {searchQuery
              ? `No accounts matched your search "${searchQuery}".`
              : 'Add your first bank account to enable seamless Money Transaction debits.'}
          </p>
          <button
            type="button"
            className="crm-bank-btn crm-bank-btn-primary"
            style={{ marginTop: '16px' }}
            onClick={handleOpenAdd}
          >
            ➕ Add Bank Account Now
          </button>
        </div>
      ) : (
        <div className="crm-bank-grid">
          {filteredAccounts.map((acc) => (
            <div
              key={acc._id}
              className={`crm-bank-card-item ${acc.isDefault ? 'is-default' : ''}`}
            >
              {acc.isDefault && (
                <div className="bank-default-badge">
                  ⭐ DEFAULT ACCOUNT
                </div>
              )}

              <div className="bank-card-header">
                <div className="bank-name-group">
                  <div className="bank-logo-badge">
                    {acc.bankName ? acc.bankName.charAt(0).toUpperCase() : 'B'}
                  </div>
                  <div>
                    <h4 className="bank-name-title">{acc.bankName}</h4>
                    {acc.accountNickname && (
                      <span className="bank-nickname-pill">“{acc.accountNickname}”</span>
                    )}
                    <span className="bank-type-badge">{acc.accountType}</span>
                  </div>
                </div>

                <div className="bank-card-menu">
                  {!acc.isDefault && (
                    <button
                      type="button"
                      className="bank-set-default-btn"
                      onClick={() => handleSetDefault(acc)}
                      title="Set as default account"
                    >
                      Make Default
                    </button>
                  )}
                </div>
              </div>

              <div className="bank-card-details">
                <div className="detail-row">
                  <span className="detail-label">Account Holder:</span>
                  <span className="detail-val holder-val">{acc.accountHolderName}</span>
                </div>

                <div className="detail-row">
                  <span className="detail-label">Account Number:</span>
                  <div className="acc-num-wrap">
                    <span className="detail-val mono-val">{acc.maskedAccountNumber}</span>
                    <button
                      type="button"
                      className="copy-mini-btn"
                      title="Copy Account Number"
                      onClick={(e) => handleCopyText(acc.accountNumber, 'Account Number', e)}
                    >
                      📋
                    </button>
                  </div>
                </div>

                <div className="detail-row">
                  <span className="detail-label">IFSC Code:</span>
                  <div className="acc-num-wrap">
                    <span className="detail-val ifsc-val">{acc.ifscCode}</span>
                    <button
                      type="button"
                      className="copy-mini-btn"
                      title="Copy IFSC"
                      onClick={(e) => handleCopyText(acc.ifscCode, 'IFSC Code', e)}
                    >
                      📋
                    </button>
                  </div>
                </div>

                {acc.branchName && (
                  <div className="detail-row">
                    <span className="detail-label">Branch:</span>
                    <span className="detail-val">{acc.branchName}</span>
                  </div>
                )}

                {acc.upiId && (
                  <div className="detail-row">
                    <span className="detail-label">UPI ID:</span>
                    <span className="detail-val upi-val">{acc.upiId}</span>
                  </div>
                )}
              </div>

              <div className="bank-card-footer">
                {hasUserAccess(effectivePermissions, 'crm.bank.view') && (
                  <button
                    type="button"
                    className="bank-action-btn btn-view"
                    onClick={() => {
                      setViewingAccount(acc);
                      setRevealFullAccount(false);
                    }}
                    title="View Account Details"
                  >
                    👁️ View Details
                  </button>
                )}
                {hasUserAccess(effectivePermissions, 'crm.bank.edit') && (
                  <button
                    type="button"
                    className="bank-action-btn btn-edit"
                    onClick={() => handleOpenEdit(acc)}
                    title="Edit Account Details"
                  >
                    ✏️ Edit
                  </button>
                )}
                {hasUserAccess(effectivePermissions, 'crm.bank.delete') && (
                  <button
                    type="button"
                    className="bank-action-btn btn-delete"
                    onClick={() => handleDeleteAccount(acc)}
                    title="Delete Account"
                  >
                    🗑️ Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ======================================================================
          MODAL: ADD / EDIT BANK ACCOUNT
          ====================================================================== */}
      {showModal && (
        <div className="crm-modal-backdrop" onClick={() => setShowModal(false)}>
          <div className="crm-modal-card bank-modal" onClick={(e) => e.stopPropagation()}>
            <div className="crm-modal-header">
              <div className="modal-title-wrap">
                <span className="modal-icon">🏦</span>
                <div>
                  <h3 className="crm-modal-title">
                    {editingAccount ? 'Edit Bank Account' : 'Add New Bank Account'}
                  </h3>
                  <p className="crm-modal-sub">
                    {editingAccount
                      ? 'Update account information for this bank record.'
                      : 'Provide accurate account details for ledger and transaction linking.'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="crm-modal-close-btn"
                onClick={() => setShowModal(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveAccount} className="crm-modal-body">
              <div className="form-grid">
                {/* Dynamically Render Configured Bank Form Fields */}
                {(fields.length > 0 ? fields.filter(f => !f.hidden) : [
                  { name: 'bankName', label: 'Bank Name', type: 'text', required: true, icon: '🏦', placeholder: 'e.g. State Bank of India, HDFC Bank, ICICI Bank' },
                  { name: 'accountHolderName', label: 'Account Holder Name', type: 'text', required: true, icon: '👤', placeholder: 'Exact name as in bank passbook / statement' },
                  { name: 'accountNumber', label: 'Account Number', type: 'text', required: true, icon: '🔢', placeholder: 'Enter 8 to 22 digit account number' },
                  { name: 'ifscCode', label: 'IFSC Code', type: 'text', required: true, icon: '🏛️', placeholder: 'e.g. SBIN0001234' },
                  { name: 'accountType', label: 'Account Type', type: 'select', required: false, icon: '💳', options: ['Savings', 'Current', 'Other'] },
                  { name: 'branchName', label: 'Branch Name', type: 'text', required: false, icon: '📍', placeholder: 'e.g. Athani City Branch' },
                  { name: 'upiId', label: 'UPI ID', type: 'text', required: false, icon: '⚡', placeholder: 'e.g. shopname@okaxis' },
                  { name: 'accountNickname', label: 'Account Nickname', type: 'text', required: false, icon: '🏷️', placeholder: 'e.g. Shop Primary Cash Account / Settlement Account' }
                ]).map((field) => {
                  const isFullWidth = field.name === 'bankName' || field.name === 'accountHolderName' || field.name === 'accountNickname' || field.type === 'textarea';
                  const val = formData[field.name] !== undefined ? formData[field.name] : '';

                  if (field.name === 'bankName') {
                    return (
                      <div key={field.name} className={`form-group ${isFullWidth ? 'full-width' : ''}`}>
                        <label className="form-label">
                          {field.icon && <span style={{ marginRight: '6px' }}>{field.icon}</span>}
                          {field.label} {field.required && <span className="req-star">*</span>}
                        </label>
                        <input
                          type="text"
                          className={`form-input ${formErrors.bankName ? 'has-error' : ''}`}
                          placeholder={field.placeholder || "e.g. State Bank of India, HDFC Bank, ICICI Bank"}
                          list="popular-banks-list"
                          value={val}
                          onChange={(e) => {
                            setFormData({ ...formData, [field.name]: e.target.value });
                            if (formErrors[field.name]) setFormErrors({ ...formErrors, [field.name]: null });
                          }}
                        />
                        <datalist id="popular-banks-list">
                          {POPULAR_BANKS.map((b) => (
                            <option key={b} value={b} />
                          ))}
                        </datalist>
                        {formErrors[field.name] && <span className="error-text">{formErrors[field.name]}</span>}
                      </div>
                    );
                  }

                  if (field.name === 'accountNumber') {
                    return (
                      <React.Fragment key={field.name}>
                        <div className="form-group">
                          <label className="form-label">
                            {field.icon && <span style={{ marginRight: '6px' }}>{field.icon}</span>}
                            {field.label} {field.required && <span className="req-star">*</span>}
                          </label>
                          <input
                            type="password"
                            className={`form-input ${formErrors.accountNumber ? 'has-error' : ''}`}
                            placeholder={field.placeholder || "Enter 8 to 22 digit account number"}
                            value={val}
                            onChange={(e) => {
                              const clean = e.target.value.replace(/\D/g, '');
                              setFormData({ ...formData, [field.name]: clean });
                              if (formErrors[field.name]) setFormErrors({ ...formErrors, [field.name]: null });
                            }}
                          />
                          {formErrors[field.name] && (
                            <span className="error-text">{formErrors[field.name]}</span>
                          )}
                        </div>

                        <div className="form-group">
                          <label className="form-label">
                            Confirm Account Number {field.required && <span className="req-star">*</span>}
                          </label>
                          <input
                            type="text"
                            className={`form-input ${formErrors.confirmAccountNumber ? 'has-error' : ''}`}
                            placeholder="Re-enter account number"
                            value={formData.confirmAccountNumber || ''}
                            onChange={(e) => {
                              const clean = e.target.value.replace(/\D/g, '');
                              setFormData({ ...formData, confirmAccountNumber: clean });
                              if (formErrors.confirmAccountNumber) {
                                setFormErrors({ ...formErrors, confirmAccountNumber: null });
                              }
                            }}
                          />
                          {formErrors.confirmAccountNumber && (
                            <span className="error-text">{formErrors.confirmAccountNumber}</span>
                          )}
                        </div>
                      </React.Fragment>
                    );
                  }

                  if (field.name === 'ifscCode') {
                    return (
                      <div key={field.name} className="form-group">
                        <label className="form-label">
                          {field.icon && <span style={{ marginRight: '6px' }}>{field.icon}</span>}
                          {field.label} {field.required && <span className="req-star">*</span>}
                        </label>
                        <input
                          type="text"
                          className={`form-input ifsc-input ${formErrors.ifscCode ? 'has-error' : ''}`}
                          placeholder={field.placeholder || "e.g. SBIN0001234"}
                          maxLength={11}
                          value={val}
                          onChange={(e) => {
                            const clean = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
                            setFormData({ ...formData, [field.name]: clean });
                            if (formErrors[field.name]) setFormErrors({ ...formErrors, [field.name]: null });
                          }}
                        />
                        {formErrors[field.name] && (
                          <span className="error-text">{formErrors[field.name]}</span>
                        )}
                      </div>
                    );
                  }

                  if (field.type === 'select') {
                    const selectOptions = (field.options && field.options.length > 0)
                      ? field.options
                      : (field.name === 'accountType' ? ['Savings', 'Current', 'Other'] : []);

                    return (
                      <div key={field.name} className={`form-group ${isFullWidth ? 'full-width' : ''}`}>
                        <label className="form-label">
                          {field.icon && <span style={{ marginRight: '6px' }}>{field.icon}</span>}
                          {field.label} {field.required && <span className="req-star">*</span>}
                        </label>
                        <select
                          className={`form-input ${formErrors[field.name] ? 'has-error' : ''}`}
                          value={val}
                          onChange={(e) => {
                            setFormData({ ...formData, [field.name]: e.target.value });
                            if (formErrors[field.name]) setFormErrors({ ...formErrors, [field.name]: null });
                          }}
                        >
                          <option value="">-- Select {field.label} --</option>
                          {selectOptions.map((opt, i) => (
                            <option key={i} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                        {formErrors[field.name] && <span className="error-text">{formErrors[field.name]}</span>}
                      </div>
                    );
                  }

                  if (field.type === 'textarea') {
                    return (
                      <div key={field.name} className="form-group full-width">
                        <label className="form-label">
                          {field.icon && <span style={{ marginRight: '6px' }}>{field.icon}</span>}
                          {field.label} {field.required && <span className="req-star">*</span>}
                        </label>
                        <textarea
                          rows={3}
                          className={`form-input ${formErrors[field.name] ? 'has-error' : ''}`}
                          placeholder={field.placeholder || `Enter ${field.label}`}
                          value={val}
                          onChange={(e) => {
                            setFormData({ ...formData, [field.name]: e.target.value });
                            if (formErrors[field.name]) setFormErrors({ ...formErrors, [field.name]: null });
                          }}
                        />
                        {formErrors[field.name] && <span className="error-text">{formErrors[field.name]}</span>}
                      </div>
                    );
                  }

                  // Default for text, tel, email, number, date
                  return (
                    <div key={field.name} className={`form-group ${isFullWidth ? 'full-width' : ''}`}>
                      <label className="form-label">
                        {field.icon && <span style={{ marginRight: '6px' }}>{field.icon}</span>}
                        {field.label} {field.required && <span className="req-star">*</span>}
                      </label>
                      <input
                        type={field.type === 'number' ? 'number' : field.type === 'email' ? 'email' : field.type === 'tel' ? 'tel' : field.type === 'date' ? 'date' : 'text'}
                        className={`form-input ${formErrors[field.name] ? 'has-error' : ''}`}
                        placeholder={field.placeholder || `Enter ${field.label}`}
                        value={val}
                        onChange={(e) => {
                          setFormData({ ...formData, [field.name]: e.target.value });
                          if (formErrors[field.name]) setFormErrors({ ...formErrors, [field.name]: null });
                        }}
                      />
                      {formErrors[field.name] && <span className="error-text">{formErrors[field.name]}</span>}
                    </div>
                  );
                })}

                {/* Default Account Checkbox */}
                <div className="form-group full-width">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={formData.isDefault}
                      onChange={(e) => setFormData({ ...formData, isDefault: e.target.checked })}
                    />
                    <span>Set this as my Default Bank Account for settlements & transfers</span>
                  </label>
                </div>
              </div>

              <div className="crm-modal-footer">
                <button
                  type="button"
                  className="crm-bank-btn crm-bank-btn-secondary"
                  onClick={() => setShowModal(false)}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="crm-bank-btn crm-bank-btn-primary"
                  disabled={saving}
                >
                  {saving ? 'Saving...' : editingAccount ? '✓ Update Account' : '✓ Save Bank Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================================
          MODAL: VIEW DETAILS
          ====================================================================== */}
      {viewingAccount && (
        <div className="crm-modal-backdrop" onClick={() => setViewingAccount(null)}>
          <div className="crm-modal-card bank-view-modal" onClick={(e) => e.stopPropagation()}>
            <div className="crm-modal-header">
              <div className="modal-title-wrap">
                <span className="modal-icon">🏛️</span>
                <div>
                  <h3 className="crm-modal-title">{viewingAccount.bankName}</h3>
                  <p className="crm-modal-sub">Account Details & Linked Settlement Specs</p>
                </div>
              </div>
              <button
                type="button"
                className="crm-modal-close-btn"
                onClick={() => setViewingAccount(null)}
              >
                ✕
              </button>
            </div>

            <div className="crm-modal-body">
              <div className="view-details-grid">
                <div className="view-detail-card">
                  <span className="v-label">Account Holder Name</span>
                  <span className="v-val">{viewingAccount.accountHolderName}</span>
                </div>

                <div className="view-detail-card">
                  <span className="v-label">Account Number</span>
                  <div className="v-val-row">
                    <span className="v-val mono-val">
                      {revealFullAccount ? viewingAccount.accountNumber : viewingAccount.maskedAccountNumber}
                    </span>
                    <button
                      type="button"
                      className="reveal-toggle-btn"
                      onClick={() => setRevealFullAccount(!revealFullAccount)}
                    >
                      {revealFullAccount ? '🙈 Hide' : '👁️ Reveal'}
                    </button>
                  </div>
                </div>

                <div className="view-detail-card">
                  <span className="v-label">IFSC Code</span>
                  <span className="v-val ifsc-val">{viewingAccount.ifscCode}</span>
                </div>

                <div className="view-detail-card">
                  <span className="v-label">Account Type</span>
                  <span className="v-val">{viewingAccount.accountType}</span>
                </div>

                <div className="view-detail-card">
                  <span className="v-label">Branch Name</span>
                  <span className="v-val">{viewingAccount.branchName || '—'}</span>
                </div>

                <div className="view-detail-card">
                  <span className="v-label">UPI ID</span>
                  <span className="v-val">{viewingAccount.upiId || '—'}</span>
                </div>

                <div className="view-detail-card">
                  <span className="v-label">Status</span>
                  <span className="v-val" style={{ color: '#16a34a', fontWeight: 700 }}>
                    Active {viewingAccount.isDefault ? '• Default Account' : ''}
                  </span>
                </div>

                <div className="view-detail-card">
                  <span className="v-label">Retailer ID Scope</span>
                  <span className="v-val mono-val">{viewingAccount.retailerId || activeRetailerId}</span>
                </div>

                {/* Custom Dynamic Fields in View Modal */}
                {viewingAccount.dynamicData && typeof viewingAccount.dynamicData === 'object' && (
                  Object.keys(viewingAccount.dynamicData).map(key => {
                    const fieldConfig = fields.find(f => f.name === key);
                    const label = fieldConfig ? fieldConfig.label : key;
                    const val = viewingAccount.dynamicData[key];
                    if (val === undefined || val === null || val === '') return null;
                    return (
                      <div key={key} className="view-detail-card">
                        <span className="v-label">{label}</span>
                        <span className="v-val">{String(val)}</span>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="crm-modal-footer">
                <button
                  type="button"
                  className="crm-bank-btn crm-bank-btn-secondary"
                  onClick={() => setViewingAccount(null)}
                >
                  Close
                </button>
                <button
                  type="button"
                  className="crm-bank-btn crm-bank-btn-primary"
                  onClick={() => {
                    const acc = viewingAccount;
                    setViewingAccount(null);
                    handleOpenEdit(acc);
                  }}
                >
                  ✏️ Edit Account
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================================
          MODAL: DYNAMIC BANK FORM FIELDS BUILDER
          ====================================================================== */}
      {showFieldsModal && (
        <div className="crm-modal-backdrop" onClick={() => setShowFieldsModal(false)}>
          <div
            className="crm-modal-card crm-bank-fields-modal"
            style={{ maxWidth: '960px', width: '95%' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="crm-modal-header">
              <div className="modal-title-wrap">
                <span className="modal-icon">⚙️</span>
                <div>
                  <h3 className="crm-modal-title">Bank Account Details — Dynamic Form Fields Builder</h3>
                  <p className="crm-modal-sub">
                    Manage fields displayed in Bank Account creation & editing forms. Mark mandatory, toggle visibility, add custom fields.
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="crm-modal-close-btn"
                onClick={() => setShowFieldsModal(false)}
              >
                ✕
              </button>
            </div>

            <div className="crm-modal-body" style={{ maxHeight: '78vh', overflowY: 'auto' }}>
              {/* Quick summary stats strip */}
              <div className="crm-bank-field-stats-strip">
                <div className="crm-bank-field-dir-tag">
                  📋 Bank Form Fields Directory: <span className="bank-field-count-pill">{fields.length} Fields</span>
                </div>
                <div className="crm-bank-field-stat-badges">
                  <span className="crm-bank-field-badge green">
                    👁️ {fields.filter(f => !f.hidden).length} Displayed
                  </span>
                  <span className="crm-bank-field-badge red">
                    🔴 {fields.filter(f => f.required).length} Mandatory
                  </span>
                  <span className="crm-bank-field-badge gray">
                    🙈 {fields.filter(f => f.hidden).length} Hidden
                  </span>
                </div>
              </div>

              {/* Add / Edit Field Box */}
              <div className="crm-bank-field-builder-card">
                <div className="crm-bank-field-builder-header">
                  <h4>{editingFieldId ? '✏️ Edit Bank Form Field' : '➕ Add New Field to Bank Form'}</h4>
                  {editingFieldId && (
                    <span className="crm-bank-editing-pill">Editing Active Field</span>
                  )}
                </div>

                <form onSubmit={handleSaveField} className="crm-bank-field-form">
                  <div className="crm-bank-field-form-grid">
                    <div className="crm-bank-field-input-group">
                      <label>Field Label (Displayed to Retailer) *</label>
                      <input
                        type="text"
                        placeholder="e.g. SWIFT Code, MICR, Branch Phone"
                        value={fieldForm.label}
                        onChange={(e) => setFieldForm(prev => ({ ...prev, label: e.target.value }))}
                        required
                      />
                    </div>

                    <div className="crm-bank-field-input-group">
                      <label>Input Type</label>
                      <select
                        value={fieldForm.type}
                        onChange={(e) => setFieldForm(prev => ({ ...prev, type: e.target.value }))}
                      >
                        <option value="text">Text Input (Branch, Code, etc.)</option>
                        <option value="tel">Phone / Mobile Number</option>
                        <option value="email">Email Address</option>
                        <option value="number">Number</option>
                        <option value="textarea">Multiline Textarea / Address</option>
                        <option value="date">Date Picker</option>
                        <option value="select">Dropdown / Select</option>
                      </select>
                    </div>

                    <div className="crm-bank-field-input-group">
                      <label>Placeholder Hint</label>
                      <input
                        type="text"
                        placeholder="e.g. Enter SWIFT code"
                        value={fieldForm.placeholder}
                        onChange={(e) => setFieldForm(prev => ({ ...prev, placeholder: e.target.value }))}
                      />
                    </div>

                    <div className="crm-bank-field-input-group" style={{ maxWidth: '140px' }}>
                      <label>Icon Emoji</label>
                      <input
                        type="text"
                        placeholder="e.g. 🏦"
                        value={fieldForm.icon}
                        onChange={(e) => setFieldForm(prev => ({ ...prev, icon: e.target.value }))}
                      />
                    </div>
                  </div>

                  {fieldForm.type === 'select' && (
                    <div className="crm-bank-field-input-group" style={{ marginTop: '10px' }}>
                      <label>Dropdown Options (comma separated)</label>
                      <input
                        type="text"
                        placeholder="e.g. Savings, Current, Overdraft, Cash Credit"
                        value={fieldForm.options}
                        onChange={(e) => setFieldForm(prev => ({ ...prev, options: e.target.value }))}
                      />
                    </div>
                  )}

                  <div className="crm-bank-field-checks-row">
                    <label className="crm-bank-field-checkbox-label">
                      <input
                        type="checkbox"
                        checked={fieldForm.required}
                        onChange={(e) => setFieldForm(prev => ({ ...prev, required: e.target.checked }))}
                      />
                      <span>Mandatory / Required Field (*)?</span>
                    </label>

                    <label className="crm-bank-field-checkbox-label">
                      <input
                        type="checkbox"
                        checked={fieldForm.hidden}
                        onChange={(e) => setFieldForm(prev => ({ ...prev, hidden: e.target.checked }))}
                      />
                      <span>Hide Field from User Form?</span>
                    </label>

                    <div className="crm-bank-field-form-actions">
                      {editingFieldId && (
                        <button
                          type="button"
                          className="crm-bank-field-btn-cancel"
                          onClick={handleCancelEditField}
                          disabled={savingField}
                        >
                          Cancel
                        </button>
                      )}
                      <button
                        type="submit"
                        className="crm-bank-field-btn-submit"
                        disabled={savingField}
                      >
                        {savingField
                          ? 'Saving...'
                          : editingFieldId
                            ? '✓ Update Field'
                            : '➕ Add Field to Form'}
                      </button>
                    </div>
                  </div>
                </form>
              </div>

              {/* Configured Fields Table */}
              <div className="crm-bank-fields-table-wrapper">
                <div className="crm-bank-fields-table-header">
                  <h4>Configured Bank Form Fields ({fields.length})</h4>
                  <span className="crm-bank-fields-table-sub">
                    Changes apply immediately to Bank Account creation & editing views.
                  </span>
                </div>

                <div className="crm-bank-table-scroll">
                  <table className="crm-bank-fields-table">
                    <thead>
                      <tr>
                        <th style={{ width: '85px', textAlign: 'center' }}>Order</th>
                        <th>Field Label</th>
                        <th>Field Key</th>
                        <th>Input Type</th>
                        <th style={{ textAlign: 'center' }}>Visibility</th>
                        <th style={{ textAlign: 'center' }}>Requirement</th>
                        <th style={{ textAlign: 'center', width: '130px' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fields.length === 0 ? (
                        <tr>
                          <td colSpan="7" style={{ textAlign: 'center', padding: '32px', color: '#64748b' }}>
                            No bank form fields configured. Please add one above.
                          </td>
                        </tr>
                      ) : (
                        fields.map((f, idx) => (
                          <tr key={f._id || f.name} className={f.hidden ? 'row-hidden' : ''}>
                            <td style={{ textAlign: 'center' }}>
                              <div className="crm-bank-order-cell">
                                <span className="crm-bank-order-num">#{idx + 1}</span>
                                <div className="crm-bank-order-arrows">
                                  <button
                                    type="button"
                                    className="crm-bank-arrow-btn"
                                    onClick={() => handleMoveField(idx, 'up')}
                                    disabled={idx === 0}
                                    title="Move Up"
                                  >
                                    ▲
                                  </button>
                                  <button
                                    type="button"
                                    className="crm-bank-arrow-btn"
                                    onClick={() => handleMoveField(idx, 'down')}
                                    disabled={idx === fields.length - 1}
                                    title="Move Down"
                                  >
                                    ▼
                                  </button>
                                </div>
                              </div>
                            </td>
                            <td>
                              <div className="crm-bank-field-label-cell">
                                <span className="crm-bank-field-cell-icon">{f.icon || '📝'}</span>
                                <span className="crm-bank-field-cell-name">{f.label}</span>
                              </div>
                            </td>
                            <td>
                              <code className="crm-bank-field-key-badge">{f.name}</code>
                            </td>
                            <td>
                              <span className="crm-bank-field-type-pill">{f.type || 'text'}</span>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <button
                                type="button"
                                className={`crm-bank-toggle-pill ${f.hidden ? 'pill-hidden' : 'pill-visible'}`}
                                onClick={() => handleToggleFieldVisibility(f)}
                                title={f.hidden ? 'Click to Show Field' : 'Click to Hide Field'}
                              >
                                {f.hidden ? '🙈 HIDDEN' : '👁️ DISPLAYED'}
                              </button>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <button
                                type="button"
                                className={`crm-bank-toggle-pill ${f.required ? 'pill-required' : 'pill-optional'}`}
                                onClick={() => handleToggleFieldRequired(f)}
                                title={f.required ? 'Click to make Optional' : 'Click to make Mandatory'}
                              >
                                {f.required ? '🔴 MANDATORY (*)' : '⚪ OPTIONAL'}
                              </button>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <div className="crm-bank-field-action-btns">
                                <button
                                  type="button"
                                  className="crm-bank-field-edit-btn"
                                  onClick={() => handleEditField(f)}
                                  title="Edit Field Configuration"
                                >
                                  ✏️ Edit
                                </button>
                                <button
                                  type="button"
                                  className="crm-bank-field-delete-btn"
                                  onClick={() => handleDeleteField(f)}
                                  title="Delete Field"
                                >
                                  🗑️
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
            </div>

            <div className="crm-modal-footer">
              <button
                type="button"
                className="crm-bank-btn crm-bank-btn-primary"
                onClick={() => setShowFieldsModal(false)}
              >
                ✓ Done Configuring
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
