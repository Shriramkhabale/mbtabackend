import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Swal from 'sweetalert2';
import { API_URL, apiFetch } from '../../utils/apiClient';
import { hasUserAccess, getStoredUserPermissions } from '../../utils/userPermissions';
import './CustomerManagementView.css';

export default function CustomerManagementView({ user, onBack, userPermissions }) {
  const effectivePermissions = useMemo(() => {
    return userPermissions || getStoredUserPermissions();
  }, [userPermissions]);
  // Resolve canonical Retailer / User ID (e.g. MBTAR000010101)
  const activeUserId = useMemo(() => {
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
      if (stored.username && stored.username !== 'user') return stored.username;
    } catch (_) {}
    return 'MBTAR000010101';
  }, [user]);

  // Data states
  const [customers, setCustomers] = useState([]);
  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Customer Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [formData, setFormData] = useState({});
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [savingCustomer, setSavingCustomer] = useState(false);

  // Customer Details Profile
  const [activeProfileCustomer, setActiveProfileCustomer] = useState(null);
  const [profileTab, setProfileTab] = useState('basic'); // 'basic' | 'documents' | 'work' | 'bills'
  const [customerWorkItems, setCustomerWorkItems] = useState([]);
  const [customerBills, setCustomerBills] = useState([]);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Work Form & Modal
  const [showAddWorkModal, setShowAddWorkModal] = useState(false);
  const [workForm, setWorkForm] = useState({ description: '', amount: '', status: 'Pending' });
  const [submittingWork, setSubmittingWork] = useState(false);

  // Bill Generation Modal
  const [selectedWorkForBill, setSelectedWorkForBill] = useState(null);
  const [billAmountInput, setBillAmountInput] = useState('');
  const [generatingBill, setGeneratingBill] = useState(false);

  // Upload Additional Documents Modal
  const [uploadingDocs, setUploadingDocs] = useState(false);
  const [profileDocFiles, setProfileDocFiles] = useState([]);

  // OTP Viewing Verification Modal State
  const [otpModalCustomer, setOtpModalCustomer] = useState(null);
  const [otpMaskedMobile, setOtpMaskedMobile] = useState('');
  const [otpInput, setOtpInput] = useState('');
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [otpError, setOtpError] = useState('');
  const [otpResendTimer, setOtpResendTimer] = useState(0);
  const [verifiedCustomerTokens, setVerifiedCustomerTokens] = useState({});

  // Dynamic Customer Form Fields Management Modal
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

  // Fetch form fields configuration
  const fetchFields = useCallback(async () => {
    try {
      const res = await apiFetch('/api/crm/fields');
      const data = await res.json();
      if (data.success && Array.isArray(data.fields)) {
        setFields(data.fields);
      }
    } catch (err) {
      console.error('Error fetching CRM form fields:', err);
    }
  }, []);

  // Fetch customer list
  const fetchCustomers = useCallback(async () => {
    try {
      setLoading(true);
      const query = new URLSearchParams();
      if (searchQuery.trim()) query.append('search', searchQuery.trim());
      if (statusFilter !== 'ALL') query.append('status', statusFilter);

      const res = await apiFetch(`/api/crm/customers?${query.toString()}`);
      const data = await res.json();
      if (data.success) {
        setCustomers(data.customers || []);
      }
    } catch (err) {
      console.error('Error fetching customers:', err);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, statusFilter]);

  // Initial load
  useEffect(() => {
    fetchFields();
  }, [fetchFields]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  // OTP Resend Countdown Timer
  useEffect(() => {
    let interval = null;
    if (otpResendTimer > 0 && otpModalCustomer) {
      interval = setInterval(() => {
        setOtpResendTimer((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [otpResendTimer, otpModalCustomer]);

  // Load detailed profile for a customer (Documents, Work, Bills) - OTP Protected
  const loadCustomerDetails = async (customer, verificationToken) => {
    try {
      setLoadingDetails(true);
      const token = verificationToken || verifiedCustomerTokens[customer.customerUid];
      const headers = token ? { 'x-customer-verification-token': token } : {};
      const res = await apiFetch(`/api/crm/customers/${customer._id || customer.customerUid}`, { headers });
      const data = await res.json();
      if (data.success) {
        setActiveProfileCustomer(data.customer);
        setCustomerWorkItems(data.workItems || []);
        setCustomerBills(data.bills || []);
      } else {
        Swal.fire({
          icon: 'error',
          title: 'Verification Required',
          text: data.message || 'OTP verification required to view customer details.'
        });
      }
    } catch (err) {
      console.error('Error loading customer details:', err);
    } finally {
      setLoadingDetails(false);
    }
  };

  // Close Customer View and Invalidate Session
  const handleCloseCustomerDetails = async () => {
    const uid = activeProfileCustomer?.customerUid;
    if (uid) {
      try {
        await apiFetch(`/api/crm/customers/${uid}/invalidate-verification`, { method: 'POST' });
      } catch (e) {
        // ignore
      }
      setVerifiedCustomerTokens((prev) => {
        const next = { ...prev };
        delete next[uid];
        return next;
      });
    }
    setActiveProfileCustomer(null);
  };

  // Send OTP to customer's mobile
  const handleSendOtp = async (customer) => {
    try {
      setSendingOtp(true);
      setOtpError('');
      const res = await apiFetch(`/api/crm/customers/${customer._id || customer.customerUid}/send-otp`, {
        method: 'POST'
      });
      const data = await res.json();
      if (data.success) {
        setOtpMaskedMobile(data.maskedMobile || '');
        setOtpResendTimer(60);
        Swal.fire({
          toast: true,
          position: 'top-end',
          icon: 'success',
          title: data.message || 'OTP sent successfully to customer mobile!',
          showConfirmButton: false,
          timer: 2000
        });
      } else {
        setOtpError(data.message || 'Failed to dispatch OTP SMS.');
      }
    } catch (err) {
      console.error('Error sending OTP:', err);
      setOtpError('Network error while requesting OTP.');
    } finally {
      setSendingOtp(false);
    }
  };

  // Initiate View with OTP Check
  const handleInitiateView = async (customer) => {
    const existingToken = verifiedCustomerTokens[customer.customerUid];
    if (existingToken) {
      await loadCustomerDetails(customer, existingToken);
      return;
    }
    setOtpModalCustomer(customer);
    setOtpInput('');
    setOtpError('');
    const cleanMobile = String(customer.mobileNumber || '').trim().replace(/^\+91/, '').replace(/^0/, '');
    setOtpMaskedMobile(cleanMobile.length > 4 ? `******${cleanMobile.slice(-4)}` : cleanMobile);
    await handleSendOtp(customer);
  };

  // Verify OTP & Open Customer View
  const handleVerifyOtp = async (e) => {
    if (e) e.preventDefault();
    if (!otpModalCustomer || !otpInput || otpInput.trim().length !== 6) {
      setOtpError('Please enter a complete 6-digit OTP.');
      return;
    }

    try {
      setVerifyingOtp(true);
      setOtpError('');
      const res = await apiFetch(`/api/crm/customers/${otpModalCustomer._id || otpModalCustomer.customerUid}/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otp: otpInput.trim() })
      });
      const data = await res.json();
      if (data.success && data.verificationToken) {
        const token = data.verificationToken;
        const targetCustomer = otpModalCustomer;
        setVerifiedCustomerTokens((prev) => ({
          ...prev,
          [targetCustomer.customerUid]: token
        }));
        setOtpModalCustomer(null);
        setOtpInput('');
        Swal.fire({
          toast: true,
          position: 'top-end',
          icon: 'success',
          title: 'OTP Verified successfully!',
          showConfirmButton: false,
          timer: 1400
        });
        await loadCustomerDetails(targetCustomer, token);
      } else {
        setOtpError(data.message || 'Invalid OTP. Please try again.');
      }
    } catch (err) {
      console.error('Error verifying OTP:', err);
      setOtpError('Network error while verifying OTP.');
    } finally {
      setVerifyingOtp(false);
    }
  };

  const handleCloseOtpModal = () => {
    setOtpModalCustomer(null);
    setOtpInput('');
    setOtpError('');
    setOtpResendTimer(0);
  };

  // Open Add Customer Modal
  const handleOpenAddModal = () => {
    setEditingCustomer(null);
    const initial = {};
    fields.forEach(f => {
      initial[f.name] = '';
    });
    setFormData(initial);
    setSelectedFiles([]);
    setShowAddModal(true);
  };

  // Open Edit Customer Modal
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
      workStatus: customer.workStatus || 'No Active Work',
      ...(customer.dynamicData || {})
    };
    setFormData(initial);
    setSelectedFiles([]);
    setShowAddModal(true);
  };

  // Handle Form Input Change
  const handleInputChange = (fieldName, value) => {
    setFormData(prev => ({ ...prev, [fieldName]: value }));
  };

  // Handle File Selection
  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    setSelectedFiles(prev => [...prev, ...files]);
  };

  const handleRemoveSelectedFile = (idx) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== idx));
  };

  // Save Customer (Add or Edit)
  const handleSaveCustomer = async (e) => {
    if (e) e.preventDefault();

    // 1. Validate mandatory fields from active fields configuration
    for (const field of fields) {
      if (!field.hidden && field.required) {
        const val = formData[field.name];
        if (val === undefined || val === null || String(val).trim() === '') {
          Swal.fire({
            icon: 'warning',
            title: 'Required Field Missing',
            text: `Please enter "${field.label}" before saving.`,
            confirmButtonColor: '#ea580c'
          });
          return;
        }
      }
    }

    try {
      setSavingCustomer(true);
      const postData = new FormData();

      // Separate core fields vs dynamicData
      const coreKeys = ['customerName', 'mobileNumber', 'email', 'address', 'city', 'state', 'pincode', 'workStatus'];
      const dynamicPayload = {};

      Object.keys(formData).forEach(key => {
        if (coreKeys.includes(key)) {
          postData.append(key, formData[key] || '');
        } else {
          dynamicPayload[key] = formData[key];
        }
      });

      postData.append('dynamicData', JSON.stringify(dynamicPayload));
      postData.append('createdBy', editingCustomer?.createdBy || activeUserId);

      // Append documents
      selectedFiles.forEach(file => {
        postData.append('documents', file);
      });

      const url = editingCustomer
        ? `${API_URL}/api/crm/customers/${editingCustomer._id}`
        : `${API_URL}/api/crm/customers`;

      const method = editingCustomer ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        body: postData
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to save customer');
      }

      setShowAddModal(false);
      setSelectedFiles([]);
      await fetchCustomers();

      if (editingCustomer && activeProfileCustomer?._id === editingCustomer._id) {
        await loadCustomerDetails(data.customer);
      }

      Swal.fire({
        icon: 'success',
        title: editingCustomer ? 'Customer Updated' : 'Customer Registered!',
        html: editingCustomer
          ? `Customer details updated successfully.`
          : `Customer created successfully with unique UID:<br/><strong style="font-size: 1.25rem; color: #ea580c; display: block; margin-top: 8px;">${data.customer.customerUid}</strong>`,
        confirmButtonColor: '#ea580c'
      });
    } catch (err) {
      console.error('Save customer error:', err);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: err.message || 'Could not save customer.',
        confirmButtonColor: '#ea580c'
      });
    } finally {
      setSavingCustomer(false);
    }
  };

  // Upload Additional Documents from Profile View
  const handleUploadAdditionalDocs = async () => {
    if (!profileDocFiles || profileDocFiles.length === 0) return;

    try {
      setUploadingDocs(true);
      const postData = new FormData();
      profileDocFiles.forEach(file => {
        postData.append('documents', file);
      });

      const res = await fetch(`${API_URL}/api/crm/customers/${activeProfileCustomer._id}/documents`, {
        method: 'POST',
        body: postData
      });
      const data = await res.json();

      if (data.success) {
        setProfileDocFiles([]);
        setActiveProfileCustomer(prev => ({
          ...prev,
          documents: data.documents
        }));
        Swal.fire({
          icon: 'success',
          title: 'Documents Uploaded',
          text: data.message,
          timer: 1500,
          showConfirmButton: false
        });
      } else {
        throw new Error(data.message);
      }
    } catch (err) {
      Swal.fire({
        icon: 'error',
        title: 'Upload Error',
        text: err.message,
        confirmButtonColor: '#ea580c'
      });
    } finally {
      setUploadingDocs(false);
    }
  };

  // Remove Document from Customer Profile
  const handleRemoveDoc = async (docId) => {
    const confirm = await Swal.fire({
      title: 'Remove Document?',
      text: 'Do you want to permanently delete this document?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Yes, Remove',
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#64748b'
    });

    if (!confirm.isConfirmed) return;

    try {
      const res = await apiFetch(`/api/crm/customers/${activeProfileCustomer._id}/documents/${docId}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        setActiveProfileCustomer(prev => ({
          ...prev,
          documents: data.documents
        }));
        Swal.fire({
          icon: 'success',
          title: 'Removed',
          text: 'Document removed.',
          timer: 1200,
          showConfirmButton: false
        });
      }
    } catch (err) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: err.message,
        confirmButtonColor: '#ea580c'
      });
    }
  };

  // Add Work Item
  const handleAddWork = async (e) => {
    if (e) e.preventDefault();
    if (!workForm.description.trim()) {
      Swal.fire({ icon: 'warning', title: 'Work Description Required', text: 'Please enter a description for the work.' });
      return;
    }

    try {
      setSubmittingWork(true);
      const res = await apiFetch(`/api/crm/customers/${activeProfileCustomer.customerUid}/work`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: workForm.description.trim(),
          amount: Number(workForm.amount || 0),
          status: workForm.status,
          createdBy: activeUserId
        })
      });
      const data = await res.json();
      if (data.success) {
        setShowAddWorkModal(false);
        setWorkForm({ description: '', amount: '', status: 'Pending' });
        // Reload details & customer list
        await loadCustomerDetails(activeProfileCustomer);
        await fetchCustomers();
        Swal.fire({
          icon: 'success',
          title: 'Work Added',
          text: 'Work item recorded successfully.',
          timer: 1400,
          showConfirmButton: false
        });
      } else {
        throw new Error(data.message);
      }
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Error', text: err.message, confirmButtonColor: '#ea580c' });
    } finally {
      setSubmittingWork(false);
    }
  };

  // Update Work Status
  const handleUpdateWorkStatus = async (workId, newStatus) => {
    try {
      const res = await apiFetch(`/api/crm/customers/${activeProfileCustomer.customerUid}/work/${workId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      const data = await res.json();
      if (data.success) {
        await loadCustomerDetails(activeProfileCustomer);
        await fetchCustomers();
      }
    } catch (err) {
      console.error('Update work status error:', err);
    }
  };

  // Open Generate Bill Modal
  const handleOpenGenerateBillModal = (work) => {
    setSelectedWorkForBill(work);
    setBillAmountInput(work.amount !== undefined ? String(work.amount) : '0');
  };

  // Submit Final Bill Generation
  const handleGenerateBill = async () => {
    if (!selectedWorkForBill) return;

    const enteredAmount = Number(billAmountInput);
    if (isNaN(enteredAmount) || enteredAmount < 0) {
      Swal.fire({ icon: 'warning', title: 'Invalid Amount', text: 'Please enter a valid bill amount.' });
      return;
    }

    try {
      setGeneratingBill(true);
      const res = await apiFetch(`/api/crm/customers/${activeProfileCustomer.customerUid}/bills`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workId: selectedWorkForBill.workId,
          amount: enteredAmount,
          createdBy: activeUserId
        })
      });

      const data = await res.json();
      if (data.success && data.bill) {
        setSelectedWorkForBill(null);
        await loadCustomerDetails(activeProfileCustomer);
        setProfileTab('bills'); // switch to bills tab
        
        Swal.fire({
          icon: 'success',
          title: 'Bill Generated Successfully!',
          html: `
            <div style="text-align: left; background: #fff7ed; padding: 14px; border-radius: 10px; border: 1.5px solid #fed7aa; margin-top: 10px;">
              <div><strong>Bill Number:</strong> ${data.bill.billNumber}</div>
              <div><strong>Customer UID:</strong> ${data.bill.customerUid}</div>
              <div><strong>Work:</strong> ${data.bill.workDescription}</div>
              <div><strong>Total Amount:</strong> ₹${data.bill.totalAmount}</div>
            </div>
          `,
          showCancelButton: true,
          confirmButtonText: '⬇️ Download Bill PDF',
          cancelButtonText: 'Done',
          confirmButtonColor: '#ea580c',
          cancelButtonColor: '#64748b'
        }).then((result) => {
          if (result.isConfirmed) {
            window.open(`${API_URL}/api/crm/bills/${data.bill.billNumber}/pdf`, '_blank');
          }
        });
      } else {
        throw new Error(data.message || 'Could not generate bill');
      }
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Bill Generation Failed', text: err.message, confirmButtonColor: '#ea580c' });
    } finally {
      setGeneratingBill(false);
    }
  };

  // Copy UID helper
  const handleCopyUid = (uid, e) => {
    if (e) e.stopPropagation();
    navigator.clipboard.writeText(uid);
    Swal.fire({
      toast: true,
      position: 'top-end',
      icon: 'success',
      title: `UID ${uid} copied!`,
      showConfirmButton: false,
      timer: 1200
    });
  };

  // Field management handlers
  const handleStartEditField = (field) => {
    setEditingFieldId(field._id);
    setFieldForm({
      label: field.label || '',
      type: field.type || 'text',
      placeholder: field.placeholder || '',
      icon: field.icon || '📝',
      required: Boolean(field.required),
      hidden: Boolean(field.hidden),
      options: Array.isArray(field.options) ? field.options.join(', ') : (field.options || '')
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
        res = await apiFetch('/api/crm/fields/' + editingFieldId, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        res = await apiFetch('/api/crm/fields', {
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
          title: editingFieldId ? 'Field updated successfully!' : 'New field added!',
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
      console.error('Error saving field:', err);
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
      const res = await apiFetch('/api/crm/fields/' + field._id + '/toggle-visibility', {
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
      const res = await apiFetch('/api/crm/fields/' + field._id + '/toggle-required', {
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
    const confirm = await Swal.fire({
      title: 'Delete Field?',
      html: 'Are you sure you want to remove <strong>' + field.label + '</strong>?<br/><small style="color:#64748b;">Note: Previously saved customer data for this field will remain safe in the database.</small>',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      confirmButtonText: 'Yes, Delete Field',
      cancelButtonText: 'Cancel'
    });

    if (!confirm.isConfirmed) return;

    try {
      const res = await apiFetch('/api/crm/fields/' + field._id, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        Swal.fire({
          toast: true,
          position: 'top-end',
          icon: 'success',
          title: 'Field deleted',
          showConfirmButton: false,
          timer: 1400
        });
        if (editingFieldId === field._id) {
          handleCancelEditField();
        }
        await fetchFields();
      } else {
        Swal.fire({
          icon: 'error',
          title: 'Failed',
          text: data.message || 'Could not delete field'
        });
      }
    } catch (err) {
      console.error('Error deleting field:', err);
    }
  };

  const handleMoveField = async (index, direction) => {
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= fields.length) return;

    const reordered = [...fields];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(targetIdx, 0, moved);

    setFields(reordered);

    try {
      const orderedIds = reordered.map(f => f._id);
      await apiFetch('/api/crm/fields/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds })
      });
      await fetchFields();
    } catch (err) {
      console.error('Error reordering fields:', err);
      await fetchFields();
    }
  };

  // Summary counts
  const stats = useMemo(() => {
    const total = customers.length;
    const pending = customers.filter(c => c.workStatus === 'Pending').length;
    const inProgress = customers.filter(c => c.workStatus === 'In Progress').length;
    const completed = customers.filter(c => c.workStatus === 'Completed').length;
    return { total, pending, inProgress, completed };
  }, [customers]);

  return (
    <div className="crm-cust-container">
      {/* Top Breadcrumb & Header */}
      <div className="crm-cust-header-card">
        <div className="crm-cust-header-top">
          <div className="crm-cust-badge-row">
            <button type="button" className="crm-cust-back-btn" onClick={onBack}>
              ← Back to CRM Suite
            </button>
            <span className="crm-cust-tag">CRM Directory</span>
          </div>
          <div className="crm-cust-top-actions">
            <button
              type="button"
              className="crm-cust-fields-btn"
              onClick={() => {
                handleCancelEditField();
                setShowFieldsModal(true);
              }}
              title="Configure Dynamic Customer Form Fields"
            >
              <span>⚙️</span> Customer Form Fields
            </button>
            {hasUserAccess(effectivePermissions, 'crm.customer.add') && (
              <button
                type="button"
                className="crm-cust-add-btn"
                onClick={handleOpenAddModal}
              >
                <span>➕</span> Add New Customer
              </button>
            )}
          </div>
        </div>

        <div className="crm-cust-header-intro">
          <h2>Customer Management</h2>
          <p>
            Manage comprehensive client records, document attachments, customer work orders, and generate official bills.
          </p>
        </div>

        {/* Stats Strip */}
        <div className="crm-cust-stats-strip">
          <div className="crm-cust-stat-pill">
            <span className="stat-label">Total Customers:</span>
            <span className="stat-num">{stats.total}</span>
          </div>
          <div className="crm-cust-stat-pill stat-amber">
            <span className="stat-label">Pending Work:</span>
            <span className="stat-num">{stats.pending}</span>
          </div>
          <div className="crm-cust-stat-pill stat-blue">
            <span className="stat-label">In Progress:</span>
            <span className="stat-num">{stats.inProgress}</span>
          </div>
          <div className="crm-cust-stat-pill stat-green">
            <span className="stat-label">Completed Work:</span>
            <span className="stat-num">{stats.completed}</span>
          </div>
        </div>
      </div>

      {/* Toolbar: Search and Filter Tabs */}
      <div className="crm-cust-toolbar">
        <div className="crm-cust-search-wrap">
          <span className="crm-cust-search-icon">🔍</span>
          <input
            type="text"
            className="crm-cust-search-input"
            placeholder="Search by Customer UID (MBTAC0000...), Name, Mobile, Email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="crm-cust-search-clear"
              onClick={() => setSearchQuery('')}
            >
              ✕
            </button>
          )}
        </div>

        <div className="crm-cust-filter-tabs">
          {[
            { id: 'ALL', label: 'All Customers' },
            { id: 'Pending', label: '⏳ Pending' },
            { id: 'In Progress', label: '⚡ In Progress' },
            { id: 'Completed', label: '✅ Completed' },
            { id: 'No Active Work', label: '📁 No Work' }
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              className={`crm-cust-filter-tab ${statusFilter === tab.id ? 'active' : ''}`}
              onClick={() => setStatusFilter(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Customer List Table */}
      <div className="crm-cust-table-card">
        {loading ? (
          <div className="crm-cust-empty">
            <div className="crm-cust-spinner"></div>
            <p>Loading customers from database...</p>
          </div>
        ) : customers.length === 0 ? (
          <div className="crm-cust-empty">
            <span style={{ fontSize: '42px', marginBottom: '12px' }}>👥</span>
            <h3>No Customer Records Found</h3>
            <p>
              {searchQuery || statusFilter !== 'ALL'
                ? 'No customers match your active search or status filters.'
                : 'Click "Add New Customer" above to register your first client with automatic UID generation.'}
            </p>
            {!searchQuery && statusFilter === 'ALL' && (
              <button
                type="button"
                className="crm-cust-add-btn"
                style={{ marginTop: '16px' }}
                onClick={handleOpenAddModal}
              >
                ➕ Register First Customer
              </button>
            )}
          </div>
        ) : (
          <div className="crm-cust-table-responsive">
            <table className="crm-cust-table">
              <thead>
                <tr>
                  <th style={{ width: '180px' }}>Customer UID</th>
                  <th>Customer Name & Contact</th>
                  <th style={{ width: '150px' }}>Mobile Number</th>
                  <th style={{ width: '150px' }}>Work Status</th>
                  <th style={{ width: '130px', textAlign: 'center' }}>OTP</th>
                  <th style={{ width: '110px', textAlign: 'center' }}>View</th>
                  <th style={{ width: '160px', textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => {
                  let statusClass = 'status-none';
                  if (c.workStatus === 'Pending') statusClass = 'status-pending';
                  else if (c.workStatus === 'In Progress') statusClass = 'status-progress';
                  else if (c.workStatus === 'Completed') statusClass = 'status-completed';

                  const isVerified = Boolean(verifiedCustomerTokens[c.customerUid]);

                  return (
                    <tr key={c._id || c.customerUid} className="crm-cust-row">
                      {/* 1. Customer UID */}
                      <td>
                        <div className="crm-uid-cell">
                          <span className="crm-uid-badge">{c.customerUid}</span>
                          <button
                            type="button"
                            className="crm-uid-copy-btn"
                            title="Copy UID"
                            onClick={(e) => handleCopyUid(c.customerUid, e)}
                          >
                            📋
                          </button>
                        </div>
                      </td>

                      {/* 2. Customer Name & Contact */}
                      <td>
                        <div className="crm-name-cell">
                          <span className="crm-name-title">{c.customerName}</span>
                          {c.email && <span className="crm-name-email">📧 {c.email}</span>}
                          {(c.city || c.state) && (
                            <span className="crm-name-location">
                              📍 {[c.city, c.state].filter(Boolean).join(', ')}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 3. Mobile Number */}
                      <td>
                        <span className="crm-phone-pill">
                          📱 {c.mobileNumber}
                        </span>
                      </td>

                      {/* 4. Work Status */}
                      <td>
                        <span className={`crm-status-pill ${statusClass}`}>
                          <span className="status-dot"></span>
                          {c.workStatus || 'No Active Work'}
                        </span>
                      </td>

                      {/* 5. OTP */}
                      <td style={{ textAlign: 'center' }}>
                        {isVerified ? (
                          <span className="crm-otp-pill verified" title="OTP Verified for this viewing session">
                            ✅ Verified
                          </span>
                        ) : (
                          <span className="crm-otp-pill required" title="Verification required on View">
                            🔒 Required
                          </span>
                        )}
                      </td>

                      {/* 6. View */}
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          className="crm-action-btn view-btn"
                          title="Verify OTP & View Customer"
                          onClick={() => handleInitiateView(c)}
                        >
                          👁️ View
                        </button>
                      </td>

                      {/* 7. Actions */}
                      <td style={{ textAlign: 'center' }}>
                        {isVerified ? (
                          <div className="crm-actions-group">
                            {hasUserAccess(effectivePermissions, 'crm.customer.edit') && (
                              <button
                                type="button"
                                className="crm-action-btn edit-btn"
                                title="Edit Customer Information"
                                onClick={() => handleOpenEditModal(c)}
                              >
                                ✏️ Edit
                              </button>
                            )}
                            <button
                              type="button"
                              className="crm-action-btn docs-btn"
                              title="View Customer Documents"
                              onClick={() => {
                                setProfileTab('documents');
                                handleInitiateView(c);
                              }}
                            >
                              📁 Docs
                            </button>
                          </div>
                        ) : (
                          <span
                            className="crm-actions-lock-indicator"
                            title="Complete OTP verification via View to access Edit & Documents"
                          >
                            🔒 In View
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ======================================================================
          MODAL 1: ADD / EDIT CUSTOMER (Dynamic Fields Engine)
          ====================================================================== */}
      {showAddModal && (
        <div className="crm-modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="crm-modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="crm-dialog-header">
              <div className="crm-dialog-title-wrap">
                <span className="crm-dialog-icon">👤</span>
                <div>
                  <h3>{editingCustomer ? 'Edit Customer Details' : 'Register New Customer'}</h3>
                  <p>
                    {editingCustomer
                      ? `Updating records for UID: ${editingCustomer.customerUid}`
                      : 'Fill in details below. Unique UID will be assigned sequentially.'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="crm-dialog-close"
                onClick={() => setShowAddModal(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveCustomer} className="crm-dialog-body">
              {/* Dynamic Fields Grid */}
              <div className="crm-form-grid">
                {fields
                  .filter(f => !f.hidden)
                  .map((field) => {
                    const val = formData[field.name] !== undefined ? formData[field.name] : '';

                    return (
                      <div
                        key={field.name}
                        className={`crm-form-group ${field.type === 'textarea' ? 'span-full' : ''}`}
                      >
                        <label className="crm-form-label">
                          {field.icon && <span style={{ marginRight: '5px' }}>{field.icon}</span>}
                          {field.label}
                          {field.required && <span className="req-asterisk"> *</span>}
                        </label>

                        {field.type === 'textarea' ? (
                          <textarea
                            className="crm-form-control"
                            rows={3}
                            placeholder={field.placeholder || `Enter ${field.label}`}
                            value={val}
                            onChange={(e) => handleInputChange(field.name, e.target.value)}
                            required={field.required}
                          />
                        ) : field.type === 'select' ? (
                          <select
                            className="crm-form-control"
                            value={val}
                            onChange={(e) => handleInputChange(field.name, e.target.value)}
                            required={field.required}
                          >
                            <option value="">-- Select {field.label} --</option>
                            {(field.options || []).map((opt, i) => (
                              <option key={i} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type={field.type === 'number' ? 'number' : field.type === 'email' ? 'email' : field.type === 'tel' ? 'tel' : field.type === 'date' ? 'date' : 'text'}
                            className="crm-form-control"
                            placeholder={field.placeholder || `Enter ${field.label}`}
                            value={val}
                            onChange={(e) => handleInputChange(field.name, e.target.value)}
                            required={field.required}
                          />
                        )}
                      </div>
                    );
                  })}
              </div>

              {/* Document Attachments Dropzone */}
              <div className="crm-upload-section">
                <label className="crm-form-label">
                  📁 Attach Customer Documents (PDF, JPG, PNG)
                </label>
                <div className="crm-dropzone">
                  <input
                    type="file"
                    id="customer-docs-upload"
                    multiple
                    accept=".pdf,.jpg,.jpeg,.png,.webp"
                    onChange={handleFileSelect}
                    style={{ display: 'none' }}
                  />
                  <label htmlFor="customer-docs-upload" className="crm-dropzone-inner">
                    <span style={{ fontSize: '28px' }}>📂</span>
                    <span className="dropzone-text">Click or Drag to Upload Documents</span>
                    <span className="dropzone-sub">Supports PDF, JPG, PNG up to 15MB each</span>
                  </label>
                </div>

                {/* Selected Files List */}
                {selectedFiles.length > 0 && (
                  <div className="crm-selected-files-list">
                    <span className="selected-files-header">
                      Ready to upload ({selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''}):
                    </span>
                    {selectedFiles.map((f, i) => (
                      <div key={i} className="crm-file-pill">
                        <span className="file-name">📄 {f.name}</span>
                        <span className="file-size">({(f.size / 1024).toFixed(0)} KB)</span>
                        <button
                          type="button"
                          className="file-remove-btn"
                          onClick={() => handleRemoveSelectedFile(i)}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Dialog Actions */}
              <div className="crm-dialog-footer">
                <button
                  type="button"
                  className="crm-btn-secondary"
                  onClick={() => setShowAddModal(false)}
                  disabled={savingCustomer}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="crm-btn-primary"
                  disabled={savingCustomer}
                >
                  {savingCustomer ? 'Saving Record...' : editingCustomer ? '✓ Save Changes' : '➕ Register Customer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================================
          MODAL 2: CUSTOMER DETAILS PROFILE (4 Organized Sections)
          ====================================================================== */}
      {activeProfileCustomer && (
        <div className="crm-modal-overlay" onClick={handleCloseCustomerDetails}>
          <div className="crm-profile-dialog" onClick={(e) => e.stopPropagation()}>
            {/* Profile Header */}
            <div className="crm-profile-header">
              <div className="profile-header-left">
                <div className="profile-avatar">
                  {activeProfileCustomer.customerName ? activeProfileCustomer.customerName.charAt(0).toUpperCase() : 'C'}
                </div>
                <div>
                  <div className="profile-title-row">
                    <h3>{activeProfileCustomer.customerName}</h3>
                    <span className="crm-uid-large">
                      {activeProfileCustomer.customerUid}
                    </span>
                  </div>
                  <div className="profile-sub-row">
                    <span>📱 {activeProfileCustomer.mobileNumber}</span>
                    {activeProfileCustomer.email && <span>📧 {activeProfileCustomer.email}</span>}
                    {(activeProfileCustomer.city || activeProfileCustomer.state) && (
                      <span>📍 {[activeProfileCustomer.city, activeProfileCustomer.state].filter(Boolean).join(', ')}</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="crm-profile-header-actions">
                <button
                  type="button"
                  className="crm-profile-act-btn"
                  onClick={() => handleOpenEditModal(activeProfileCustomer)}
                  title="Edit Customer Information"
                >
                  ✏️ Edit Customer
                </button>
                <button
                  type="button"
                  className="crm-profile-act-btn"
                  onClick={() => setProfileTab('documents')}
                  title="View Customer Documents"
                >
                  📁 View Documents
                </button>
                <button
                  type="button"
                  className="crm-dialog-close"
                  onClick={handleCloseCustomerDetails}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Profile Navigation Tabs (The 4 Required Sections) */}
            <div className="crm-profile-tabs">
              <button
                type="button"
                className={`crm-tab-btn ${profileTab === 'basic' ? 'active' : ''}`}
                onClick={() => setProfileTab('basic')}
              >
                📋 1. Basic Information
              </button>
              <button
                type="button"
                className={`crm-tab-btn ${profileTab === 'documents' ? 'active' : ''}`}
                onClick={() => setProfileTab('documents')}
              >
                📁 2. Customer Documents ({activeProfileCustomer.documents ? activeProfileCustomer.documents.length : 0})
              </button>
              <button
                type="button"
                className={`crm-tab-btn ${profileTab === 'work' ? 'active' : ''}`}
                onClick={() => setProfileTab('work')}
              >
                ⚡ 3. Work Details ({customerWorkItems.length})
              </button>
              <button
                type="button"
                className={`crm-tab-btn ${profileTab === 'bills' ? 'active' : ''}`}
                onClick={() => setProfileTab('bills')}
              >
                🧾 4. Generated Bills ({customerBills.length})
              </button>
            </div>

            {/* Profile Tab Body */}
            <div className="crm-profile-body">
              {loadingDetails ? (
                <div className="crm-cust-empty">
                  <div className="crm-cust-spinner"></div>
                  <p>Loading customer profile data...</p>
                </div>
              ) : (
                <>
                  {/* TAB 1: BASIC INFORMATION */}
                  {profileTab === 'basic' && (
                    <div className="crm-tab-pane">
                      <div className="crm-info-card">
                        <div className="info-card-header">
                          <h4>Client Profile & Dynamic Attributes</h4>
                          <button
                            type="button"
                            className="crm-action-btn edit-btn"
                            onClick={() => {
                              handleOpenEditModal(activeProfileCustomer);
                            }}
                          >
                            ✏️ Edit Information
                          </button>
                        </div>

                        <div className="crm-info-grid">
                          <div className="crm-info-item highlight">
                            <span className="info-label">Customer UID</span>
                            <span className="info-val" style={{ color: '#ea580c', fontWeight: 800 }}>
                              {activeProfileCustomer.customerUid}
                            </span>
                          </div>

                          <div className="crm-info-item">
                            <span className="info-label">Customer Name</span>
                            <span className="info-val">{activeProfileCustomer.customerName}</span>
                          </div>

                          <div className="crm-info-item">
                            <span className="info-label">Mobile Number</span>
                            <span className="info-val">📱 {activeProfileCustomer.mobileNumber}</span>
                          </div>

                          <div className="crm-info-item">
                            <span className="info-label">Email Address</span>
                            <span className="info-val">{activeProfileCustomer.email || 'Not provided'}</span>
                          </div>

                          <div className="crm-info-item">
                            <span className="info-label">City</span>
                            <span className="info-val">{activeProfileCustomer.city || 'Not specified'}</span>
                          </div>

                          <div className="crm-info-item">
                            <span className="info-label">State</span>
                            <span className="info-val">{activeProfileCustomer.state || 'Not specified'}</span>
                          </div>

                          <div className="crm-info-item">
                            <span className="info-label">PIN Code</span>
                            <span className="info-val">{activeProfileCustomer.pincode || 'Not specified'}</span>
                          </div>

                          <div className="crm-info-item">
                            <span className="info-label">Current Work Status</span>
                            <span className="info-val" style={{ fontWeight: 800 }}>
                              {activeProfileCustomer.workStatus || 'No Active Work'}
                            </span>
                          </div>

                          <div className="crm-info-item span-full">
                            <span className="info-label">Address</span>
                            <span className="info-val">{activeProfileCustomer.address || 'Not specified'}</span>
                          </div>

                          {/* Dynamic Custom Fields */}
                          {activeProfileCustomer.dynamicData && Object.keys(activeProfileCustomer.dynamicData).length > 0 && (
                            <>
                              <div className="span-full" style={{ borderTop: '1px dashed #fed7aa', margin: '8px 0 4px', paddingTop: '10px' }}>
                                <span style={{ fontSize: '12px', fontWeight: 800, color: '#9a3412', textTransform: 'uppercase' }}>
                                  Custom Form Fields
                                </span>
                              </div>
                              {Object.entries(activeProfileCustomer.dynamicData).map(([key, value]) => {
                                const fieldConfig = fields.find(f => f.name === key);
                                const label = fieldConfig ? fieldConfig.label : key;
                                return (
                                  <div key={key} className="crm-info-item">
                                    <span className="info-label">{label}</span>
                                    <span className="info-val">{String(value || 'N/A')}</span>
                                  </div>
                                );
                              })}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TAB 2: CUSTOMER DOCUMENTS */}
                  {profileTab === 'documents' && (
                    <div className="crm-tab-pane">
                      <div className="crm-docs-header">
                        <div>
                          <h4>Associated Customer Documents</h4>
                          <p>Securely linked to Customer UID: <strong>{activeProfileCustomer.customerUid}</strong></p>
                        </div>

                        {/* Upload trigger */}
                        <div className="docs-upload-trigger">
                          <input
                            type="file"
                            id="add-more-docs-input"
                            multiple
                            accept=".pdf,.jpg,.jpeg,.png,.webp"
                            style={{ display: 'none' }}
                            onChange={(e) => {
                              setProfileDocFiles(Array.from(e.target.files));
                            }}
                          />
                          <label htmlFor="add-more-docs-input" className="crm-btn-primary" style={{ cursor: 'pointer' }}>
                            📂 Select New Documents
                          </label>
                        </div>
                      </div>

                      {/* Staged files ready to upload */}
                      {profileDocFiles.length > 0 && (
                        <div className="crm-staged-upload-box">
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <span style={{ fontWeight: 800, color: '#ea580c', fontSize: '13px' }}>
                              Files selected for upload ({profileDocFiles.length}):
                            </span>
                            <button
                              type="button"
                              className="crm-btn-primary"
                              onClick={handleUploadAdditionalDocs}
                              disabled={uploadingDocs}
                              style={{ padding: '6px 14px', fontSize: '12px' }}
                            >
                              {uploadingDocs ? 'Uploading...' : '⬆️ Upload Now'}
                            </button>
                          </div>
                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            {profileDocFiles.map((f, idx) => (
                              <span key={idx} className="crm-file-pill">
                                📄 {f.name} ({(f.size / 1024).toFixed(0)} KB)
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Uploaded Documents Grid */}
                      {!activeProfileCustomer.documents || activeProfileCustomer.documents.length === 0 ? (
                        <div className="crm-cust-empty">
                          <span style={{ fontSize: '38px', marginBottom: '10px' }}>📁</span>
                          <h4>No Documents Uploaded Yet</h4>
                          <p>Click "Select New Documents" above to attach client ID proofs, forms, or registrations.</p>
                        </div>
                      ) : (
                        <div className="crm-docs-grid">
                          {activeProfileCustomer.documents.map((doc) => {
                            const isPdf = doc.fileName?.toLowerCase().endsWith('.pdf') || doc.mimeType?.includes('pdf');
                            return (
                              <div key={doc.docId} className="crm-doc-card">
                                <div className="doc-icon-wrap">
                                  {isPdf ? '📄' : '🖼️'}
                                </div>
                                <div className="doc-info-wrap">
                                  <span className="doc-title" title={doc.name}>{doc.name}</span>
                                  <span className="doc-meta">
                                    {(doc.fileSize / 1024).toFixed(1)} KB • {new Date(doc.uploadedAt).toLocaleDateString()}
                                  </span>
                                </div>
                                <div className="doc-actions-wrap">
                                  <a
                                    href={`${API_URL}${doc.fileUrl}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="doc-action-btn view"
                                    title="View / Preview Document"
                                  >
                                    👁️
                                  </a>
                                  <a
                                    href={`${API_URL}${doc.fileUrl}`}
                                    download={doc.name}
                                    className="doc-action-btn download"
                                    title="Download Document"
                                  >
                                    ⬇️
                                  </a>
                                  <button
                                    type="button"
                                    className="doc-action-btn delete"
                                    title="Remove Document"
                                    onClick={() => handleRemoveDoc(doc.docId)}
                                  >
                                    🗑️
                                  </button>
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
                    <div className="crm-tab-pane">
                      <div className="crm-work-header">
                        <div>
                          <h4>Customer Service Work Records</h4>
                          <p>Track tasks, statuses, amounts, and trigger final bills upon completion.</p>
                        </div>
                        <button
                          type="button"
                          className="crm-btn-primary"
                          onClick={() => setShowAddWorkModal(true)}
                        >
                          ➕ Add Work Record
                        </button>
                      </div>

                      {customerWorkItems.length === 0 ? (
                        <div className="crm-cust-empty">
                          <span style={{ fontSize: '38px', marginBottom: '10px' }}>⚡</span>
                          <h4>No Work Records Recorded</h4>
                          <p>Click "Add Work Record" to register an active service order or task for this customer.</p>
                        </div>
                      ) : (
                        <div className="crm-work-list">
                          {customerWorkItems.map((item) => (
                            <div key={item.workId} className="crm-work-card">
                              <div className="work-card-top">
                                <div className="work-card-desc-group">
                                  <span className="work-card-desc">{item.description}</span>
                                  <span className="work-card-date">
                                    📅 Recorded: {new Date(item.createdAt).toLocaleDateString()}
                                  </span>
                                </div>
                                <div className="work-card-amount-group">
                                  <span className="work-amount-label">Agreed Amount:</span>
                                  <span className="work-amount-val">₹{Number(item.amount || 0).toLocaleString('en-IN')}</span>
                                </div>
                              </div>

                              <div className="work-card-bottom">
                                <div className="work-status-controls">
                                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748b' }}>
                                    Status:
                                  </span>
                                  {['Pending', 'In Progress', 'Completed'].map(st => (
                                    <button
                                      key={st}
                                      type="button"
                                      className={`work-status-toggle ${item.status === st ? 'active ' + st.toLowerCase().replace(' ', '-') : ''}`}
                                      onClick={() => handleUpdateWorkStatus(item.workId, st)}
                                    >
                                      {st === 'Pending' ? '⏳' : st === 'In Progress' ? '⚡' : '✅'} {st}
                                    </button>
                                  ))}
                                </div>

                                <div className="work-billing-action">
                                  {item.billed ? (
                                    <span className="work-billed-badge">
                                      ✓ Billed: {item.billNumber}
                                    </span>
                                  ) : item.status === 'Completed' ? (
                                    <button
                                      type="button"
                                      className="crm-btn-generate-bill"
                                      onClick={() => handleOpenGenerateBillModal(item)}
                                    >
                                      🧾 Generate Bill
                                    </button>
                                  ) : (
                                    <span className="work-not-billed-notice">
                                      Mark "Completed" to Bill
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 4: GENERATED BILLS */}
                  {profileTab === 'bills' && (
                    <div className="crm-tab-pane">
                      <div className="crm-bills-header">
                        <div>
                          <h4>Customer Official Bills & Invoices</h4>
                          <p>Permanent PDF bills generated for completed services. Preserved and verifiable.</p>
                        </div>
                      </div>

                      {customerBills.length === 0 ? (
                        <div className="crm-cust-empty">
                          <span style={{ fontSize: '38px', marginBottom: '10px' }}>🧾</span>
                          <h4>No Bills Generated Yet</h4>
                          <p>When service work is marked "Completed" in Work Details, click "Generate Bill" to issue a professional invoice.</p>
                        </div>
                      ) : (
                        <div className="crm-bills-grid">
                          {customerBills.map((b) => (
                            <div key={b.billNumber} className="crm-bill-card">
                              <div className="bill-card-header">
                                <div className="bill-num-badge">{b.billNumber}</div>
                                <span className="bill-date">
                                  📅 {new Date(b.billDate).toLocaleDateString()}
                                </span>
                              </div>

                              <div className="bill-card-body">
                                <div className="bill-row">
                                  <span className="bill-label">Customer UID:</span>
                                  <span className="bill-val font-bold" style={{ color: '#ea580c' }}>{b.customerUid}</span>
                                </div>
                                <div className="bill-row">
                                  <span className="bill-label">Customer Name:</span>
                                  <span className="bill-val">{b.customerName}</span>
                                </div>
                                <div className="bill-row">
                                  <span className="bill-label">Work Description:</span>
                                  <span className="bill-val desc-truncate">{b.workDescription}</span>
                                </div>
                                <div className="bill-total-strip">
                                  <span>Total Bill Amount:</span>
                                  <span className="bill-amount-large">₹{Number(b.totalAmount || b.amount || 0).toLocaleString('en-IN')}</span>
                                </div>
                              </div>

                              <div className="bill-card-footer">
                                <a
                                  href={`${API_URL}/api/crm/bills/${b.billNumber}/pdf`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="bill-action-btn view-pdf"
                                >
                                  👁️ View PDF
                                </a>
                                <a
                                  href={`${API_URL}/api/crm/bills/${b.billNumber}/pdf`}
                                  download={`Bill_${b.billNumber}.pdf`}
                                  className="bill-action-btn download-pdf"
                                >
                                  ⬇️ Download Bill
                                </a>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ======================================================================
          MODAL 3: ADD WORK ITEM MODAL
          ====================================================================== */}
      {showAddWorkModal && (
        <div className="crm-modal-overlay" onClick={() => setShowAddWorkModal(false)}>
          <div className="crm-modal-dialog small" onClick={(e) => e.stopPropagation()}>
            <div className="crm-dialog-header">
              <div className="crm-dialog-title-wrap">
                <span className="crm-dialog-icon">⚡</span>
                <div>
                  <h3>Add Work Record</h3>
                  <p>Customer UID: {activeProfileCustomer?.customerUid}</p>
                </div>
              </div>
              <button
                type="button"
                className="crm-dialog-close"
                onClick={() => setShowAddWorkModal(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddWork} className="crm-dialog-body">
              <div className="crm-form-group">
                <label className="crm-form-label">
                  Work / Service Description *
                </label>
                <input
                  type="text"
                  className="crm-form-control"
                  placeholder="e.g. Identity Card Processing, Documentation Service..."
                  value={workForm.description}
                  onChange={(e) => setWorkForm(prev => ({ ...prev, description: e.target.value }))}
                  required
                />
              </div>

              <div className="crm-form-group">
                <label className="crm-form-label">
                  Service Amount (₹) *
                </label>
                <input
                  type="number"
                  className="crm-form-control"
                  placeholder="e.g. 2500"
                  value={workForm.amount}
                  onChange={(e) => setWorkForm(prev => ({ ...prev, amount: e.target.value }))}
                  required
                />
              </div>

              <div className="crm-form-group">
                <label className="crm-form-label">Work Status</label>
                <select
                  className="crm-form-control"
                  value={workForm.status}
                  onChange={(e) => setWorkForm(prev => ({ ...prev, status: e.target.value }))}
                >
                  <option value="Pending">⏳ Pending</option>
                  <option value="In Progress">⚡ In Progress</option>
                  <option value="Completed">✅ Completed</option>
                </select>
              </div>

              <div className="crm-dialog-footer">
                <button
                  type="button"
                  className="crm-btn-secondary"
                  onClick={() => setShowAddWorkModal(false)}
                  disabled={submittingWork}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="crm-btn-primary"
                  disabled={submittingWork}
                >
                  {submittingWork ? 'Saving Work...' : '✓ Add Work'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================================
          MODAL 4: GENERATE BILL MODAL
          ====================================================================== */}
      {selectedWorkForBill && (
        <div className="crm-modal-overlay" onClick={() => setSelectedWorkForBill(null)}>
          <div className="crm-modal-dialog small" onClick={(e) => e.stopPropagation()}>
            <div className="crm-dialog-header">
              <div className="crm-dialog-title-wrap">
                <span className="crm-dialog-icon">🧾</span>
                <div>
                  <h3>Generate Customer Bill</h3>
                  <p>Issue final PDF bill for completed service.</p>
                </div>
              </div>
              <button
                type="button"
                className="crm-dialog-close"
                onClick={() => setSelectedWorkForBill(null)}
              >
                ✕
              </button>
            </div>

            <div className="crm-dialog-body">
              <div className="crm-bill-summary-box">
                <div className="summary-line">
                  <strong>Customer UID:</strong> <span>{activeProfileCustomer?.customerUid}</span>
                </div>
                <div className="summary-line">
                  <strong>Customer Name:</strong> <span>{activeProfileCustomer?.customerName}</span>
                </div>
                <div className="summary-line">
                  <strong>Work Description:</strong> <span>{selectedWorkForBill.description}</span>
                </div>
              </div>

              <div className="crm-form-group" style={{ marginTop: '16px' }}>
                <label className="crm-form-label">
                  Final Bill Amount (₹) *
                </label>
                <input
                  type="number"
                  className="crm-form-control"
                  value={billAmountInput}
                  onChange={(e) => setBillAmountInput(e.target.value)}
                  style={{ fontSize: '18px', fontWeight: 800, color: '#ea580c' }}
                  required
                />
                <span style={{ fontSize: '11.5px', color: '#64748b', display: 'block', marginTop: '5px' }}>
                  💡 The bill will be generated exactly for this entered amount. No additional taxes or charges are added.
                </span>
              </div>

              <div className="crm-dialog-footer">
                <button
                  type="button"
                  className="crm-btn-secondary"
                  onClick={() => setSelectedWorkForBill(null)}
                  disabled={generatingBill}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="crm-btn-primary"
                  onClick={handleGenerateBill}
                  disabled={generatingBill}
                >
                  {generatingBill ? 'Generating PDF Bill...' : '✓ Generate & Save Bill'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Modal 5: Dynamic Customer Form Fields Builder (User Panel) */}
      {showFieldsModal && (
        <div className="crm-modal-overlay" onClick={() => setShowFieldsModal(false)}>
          <div className="crm-modal-dialog wide" onClick={(e) => e.stopPropagation()}>
            <div className="crm-dialog-header">
              <div className="crm-dialog-title-wrap">
                <span className="crm-dialog-icon">⚙️</span>
                <div>
                  <h3>Customer Management — Dynamic Form Fields Builder</h3>
                  <p>
                    Manage fields displayed in the Customer Registration & Profile forms. Mark mandatory, toggle visibility, add custom fields.
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="crm-dialog-close"
                onClick={() => setShowFieldsModal(false)}
              >
                ✕
              </button>
            </div>

            <div className="crm-dialog-body" style={{ maxHeight: '78vh', overflowY: 'auto' }}>
              {/* Quick summary stats strip */}
              <div className="crm-field-stats-strip">
                <div className="crm-field-dir-tag">
                  📋 Customer Form Fields Directory: <span className="field-count-pill">{fields.length} Fields</span>
                </div>
                <div className="crm-field-stat-badges">
                  <span className="crm-field-badge green">
                    👁️ {fields.filter(f => !f.hidden).length} Displayed
                  </span>
                  <span className="crm-field-badge red">
                    🔴 {fields.filter(f => f.required).length} Mandatory
                  </span>
                  <span className="crm-field-badge gray">
                    🙈 {fields.filter(f => f.hidden).length} Hidden
                  </span>
                </div>
              </div>

              {/* Add / Edit Field Box */}
              <div className="crm-field-builder-card">
                <div className="crm-field-builder-header">
                  <h4>{editingFieldId ? '✏️ Edit Customer Form Field' : '➕ Add New Field to Customer Form'}</h4>
                  {editingFieldId && (
                    <span className="crm-editing-pill">Editing Active Field</span>
                  )}
                </div>

                <form onSubmit={handleSaveField} className="crm-field-form">
                  <div className="crm-field-form-grid">
                    <div className="crm-field-input-group">
                      <label>Field Label (Displayed to Retailer) *</label>
                      <input
                        type="text"
                        placeholder="e.g. GST Number, Company Name, PAN"
                        value={fieldForm.label}
                        onChange={(e) => setFieldForm(prev => ({ ...prev, label: e.target.value }))}
                        required
                      />
                    </div>

                    <div className="crm-field-input-group">
                      <label>Input Type</label>
                      <select
                        value={fieldForm.type}
                        onChange={(e) => setFieldForm(prev => ({ ...prev, type: e.target.value }))}
                      >
                        <option value="text">Text Input (Name, City, GST, PAN, etc.)</option>
                        <option value="tel">Mobile Number (10 digits)</option>
                        <option value="email">Email Address</option>
                        <option value="number">Number</option>
                        <option value="textarea">Multiline Textarea / Address</option>
                        <option value="date">Date Picker</option>
                        <option value="select">Dropdown / Select</option>
                        <option value="file">File Upload</option>
                      </select>
                    </div>

                    <div className="crm-field-input-group">
                      <label>Placeholder Hint</label>
                      <input
                        type="text"
                        placeholder="e.g. Enter 15-digit GSTIN"
                        value={fieldForm.placeholder}
                        onChange={(e) => setFieldForm(prev => ({ ...prev, placeholder: e.target.value }))}
                      />
                    </div>

                    <div className="crm-field-input-group" style={{ maxWidth: '140px' }}>
                      <label>Icon Emoji</label>
                      <input
                        type="text"
                        placeholder="e.g. 🏢"
                        value={fieldForm.icon}
                        onChange={(e) => setFieldForm(prev => ({ ...prev, icon: e.target.value }))}
                      />
                    </div>
                  </div>

                  {fieldForm.type === 'select' && (
                    <div className="crm-field-input-group" style={{ marginTop: '10px' }}>
                      <label>Dropdown Options (comma separated)</label>
                      <input
                        type="text"
                        placeholder="e.g. Retail, Wholesale, Distributor, Corporate"
                        value={fieldForm.options}
                        onChange={(e) => setFieldForm(prev => ({ ...prev, options: e.target.value }))}
                      />
                    </div>
                  )}

                  <div className="crm-field-checks-row">
                    <label className="crm-field-checkbox-label">
                      <input
                        type="checkbox"
                        checked={fieldForm.required}
                        onChange={(e) => setFieldForm(prev => ({ ...prev, required: e.target.checked }))}
                      />
                      <span>Mandatory / Required Field (*)?</span>
                    </label>

                    <label className="crm-field-checkbox-label">
                      <input
                        type="checkbox"
                        checked={fieldForm.hidden}
                        onChange={(e) => setFieldForm(prev => ({ ...prev, hidden: e.target.checked }))}
                      />
                      <span>Hide Field from User Form?</span>
                    </label>

                    <div className="crm-field-form-actions">
                      {editingFieldId && (
                        <button
                          type="button"
                          className="crm-field-btn-cancel"
                          onClick={handleCancelEditField}
                          disabled={savingField}
                        >
                          Cancel
                        </button>
                      )}
                      <button
                        type="submit"
                        className="crm-field-btn-submit"
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
              <div className="crm-fields-table-wrapper">
                <div className="crm-fields-table-header">
                  <h4>Configured Customer Form Fields ({fields.length})</h4>
                  <span className="crm-fields-table-sub">
                    Changes apply immediately to Customer Registration & Profile views.
                  </span>
                </div>

                <div className="crm-table-scroll">
                  <table className="crm-fields-table">
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
                            No form fields configured. Please add one above.
                          </td>
                        </tr>
                      ) : (
                        fields.map((f, idx) => (
                          <tr key={f._id || f.name} className={f.hidden ? 'row-hidden' : ''}>
                            <td style={{ textAlign: 'center' }}>
                              <div className="crm-order-cell">
                                <span className="crm-order-num">#{idx + 1}</span>
                                <div className="crm-order-arrows">
                                  <button
                                    type="button"
                                    className="crm-arrow-btn"
                                    title="Move Up"
                                    disabled={idx === 0}
                                    onClick={() => handleMoveField(idx, -1)}
                                  >
                                    ⬆️
                                  </button>
                                  <button
                                    type="button"
                                    className="crm-arrow-btn"
                                    title="Move Down"
                                    disabled={idx === fields.length - 1}
                                    onClick={() => handleMoveField(idx, 1)}
                                  >
                                    ⬇️
                                  </button>
                                </div>
                              </div>
                            </td>
                            <td>
                              <div className="crm-field-label-cell">
                                <span className="crm-field-cell-icon">{f.icon || '📝'}</span>
                                <span className="crm-field-cell-name">{f.label}</span>
                              </div>
                            </td>
                            <td>
                              <code className="crm-field-key-badge">{f.name}</code>
                            </td>
                            <td>
                              <span className="crm-field-type-pill">{f.type || 'text'}</span>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <button
                                type="button"
                                className={'crm-toggle-pill ' + (f.hidden ? 'pill-hidden' : 'pill-visible')}
                                onClick={() => handleToggleFieldVisibility(f)}
                                title={f.hidden ? 'Click to Show Field' : 'Click to Hide Field'}
                              >
                                {f.hidden ? '🙈 HIDDEN' : '👁️ DISPLAYED'}
                              </button>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <button
                                type="button"
                                className={'crm-toggle-pill ' + (f.required ? 'pill-required' : 'pill-optional')}
                                onClick={() => handleToggleFieldRequired(f)}
                                title={f.required ? 'Click to make Optional' : 'Click to make Mandatory'}
                              >
                                {f.required ? '🔴 MANDATORY (*)' : '⚪ OPTIONAL'}
                              </button>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <div className="crm-field-action-btns">
                                <button
                                  type="button"
                                  className="crm-field-edit-btn"
                                  onClick={() => handleStartEditField(f)}
                                  title="Edit Field Properties"
                                >
                                  ✏️ Edit
                                </button>
                                <button
                                  type="button"
                                  className="crm-field-delete-btn"
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

            <div className="crm-dialog-footer">
              <button
                type="button"
                className="crm-btn-primary"
                onClick={() => setShowFieldsModal(false)}
              >
                ✓ Done / Close Builder
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ======================================================================
          OTP VERIFICATION MODAL FOR VIEWING CUSTOMER
          ====================================================================== */}
      {otpModalCustomer && (
        <div className="crm-modal-overlay" onClick={handleCloseOtpModal}>
          <div className="crm-modal-dialog small" onClick={(e) => e.stopPropagation()}>
            <div className="crm-dialog-header">
              <div className="crm-dialog-title-wrap">
                <span className="crm-dialog-icon">🔐</span>
                <div>
                  <h3>Customer View Verification</h3>
                  <p>OTP verification required to access customer profile & documents</p>
                </div>
              </div>
              <button
                type="button"
                className="crm-dialog-close"
                onClick={handleCloseOtpModal}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleVerifyOtp} className="crm-dialog-body">
              <div className="crm-otp-info-box">
                <div className="crm-otp-target-customer">
                  <div className="target-icon">👤</div>
                  <div>
                    <strong className="target-name">{otpModalCustomer.customerName}</strong>
                    <div className="target-uid">UID: <code>{otpModalCustomer.customerUid}</code></div>
                  </div>
                </div>

                <div className="crm-otp-sent-notice">
                  {sendingOtp ? (
                    <span className="otp-sending-msg">
                      <span className="crm-cust-spinner-inline" /> Generating and dispatching OTP via SMS...
                    </span>
                  ) : (
                    <span>
                      📲 6-digit OTP has been sent to customer's registered mobile:{' '}
                      <strong style={{ color: '#ea580c' }}>
                        {otpMaskedMobile || (otpModalCustomer.mobileNumber ? '******' + String(otpModalCustomer.mobileNumber).slice(-4) : '******')}
                      </strong>
                    </span>
                  )}
                </div>
              </div>

              {otpError && (
                <div className="crm-otp-error-banner">
                  ⚠️ {otpError}
                </div>
              )}

              <div className="crm-form-group" style={{ textAlign: 'center', marginTop: '10px' }}>
                <label className="crm-form-label" style={{ justifyContent: 'center', fontSize: '13px', fontWeight: 700 }}>
                  Enter 6-Digit OTP Code *
                </label>
                <div className="crm-otp-input-wrap">
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    className="crm-otp-digit-input"
                    placeholder="• • • • • •"
                    value={otpInput}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                      setOtpInput(val);
                      if (otpError) setOtpError('');
                    }}
                    autoFocus
                    required
                  />
                </div>
                <span style={{ fontSize: '11.5px', color: '#64748b', display: 'block', marginTop: '6px' }}>
                  OTP is valid for 5 minutes.
                </span>
              </div>

              <div className="crm-otp-resend-row">
                {otpResendTimer > 0 ? (
                  <span className="otp-timer-text">
                    ⏱️ Resend OTP in <strong>{otpResendTimer}s</strong>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="crm-otp-resend-btn"
                    onClick={() => handleSendOtp(otpModalCustomer)}
                    disabled={sendingOtp || verifyingOtp}
                  >
                    🔄 Resend OTP Code
                  </button>
                )}
              </div>

              <div className="crm-dialog-footer">
                <button
                  type="button"
                  className="crm-btn-secondary"
                  onClick={handleCloseOtpModal}
                  disabled={verifyingOtp}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="crm-btn-primary"
                  disabled={verifyingOtp || otpInput.trim().length !== 6 || sendingOtp}
                >
                  {verifyingOtp ? 'Verifying...' : '✓ Verify & View Customer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
