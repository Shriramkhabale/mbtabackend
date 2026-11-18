import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Swal from 'sweetalert2';
import { apiFetch } from '../../utils/apiClient';
import { hasUserAccess, getStoredUserPermissions } from '../../utils/userPermissions';
import './EmployeeManagementView.css';

export default function EmployeeManagementView({ user, onBack, userPermissions }) {
  const effectivePermissions = useMemo(() => {
    return userPermissions || getStoredUserPermissions();
  }, [userPermissions]);
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

  // Main state
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL' | 'Active' | 'Inactive'

  // Dynamic Fields
  const [fields, setFields] = useState([]);
  const [loadingFields, setLoadingFields] = useState(false);

  // Modals state
  const [isAddEditModalOpen, setIsAddEditModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null); // null for Add, employee obj for Edit
  const [formData, setFormData] = useState({});
  const [formErrors, setFormErrors] = useState({});
  const [submittingForm, setSubmittingForm] = useState(false);

  // Profile View Modal
  const [viewingEmployee, setViewingEmployee] = useState(null);

  // Permissions Modal
  const [permEmployee, setPermEmployee] = useState(null);
  const [permCatalog, setPermCatalog] = useState([]);
  const [authorizedPermIds, setAuthorizedPermIds] = useState([]);
  const [assignedPerms, setAssignedPerms] = useState([]);
  const [expandedPermCats, setExpandedPermCats] = useState({});
  const [savingPerms, setSavingPerms] = useState(false);
  const [loadingPerms, setLoadingPerms] = useState(false);

  // Form Fields Builder Settings Modal
  const [isFieldsModalOpen, setIsFieldsModalOpen] = useState(false);
  const [newFieldData, setNewFieldData] = useState({
    name: '',
    label: '',
    type: 'text',
    required: false,
    options: '',
    placeholder: '',
    icon: '📝'
  });
  const [savingField, setSavingField] = useState(false);

  // Activity Logs Modal
  const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);
  const [activities, setActivities] = useState([]);
  const [loadingActivities, setLoadingActivities] = useState(false);
  const [activityFilterEmp, setActivityFilterEmp] = useState('ALL');
  const [activityFilterModule, setActivityFilterModule] = useState('ALL');
  const [activityFilterDate, setActivityFilterDate] = useState('');

  // Password Reset Modal
  const [pwdResetEmployee, setPwdResetEmployee] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [savingPwd, setSavingPwd] = useState(false);

  // 1. Fetch Employees
  const fetchEmployees = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ retailerId: activeRetailerId });
      if (statusFilter !== 'ALL') params.append('status', statusFilter);
      if (searchQuery.trim()) params.append('search', searchQuery.trim());

      const res = await apiFetch(`/api/crm/employees?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.employees)) {
          setEmployees(data.employees);
        } else if (Array.isArray(data)) {
          setEmployees(data);
        }
      }
    } catch (err) {
      console.error('Error fetching employees:', err);
    } finally {
      setLoading(false);
    }
  }, [activeRetailerId, statusFilter, searchQuery]);

  // 2. Fetch Form Fields
  const fetchFields = useCallback(async () => {
    try {
      setLoadingFields(true);
      const res = await apiFetch(`/api/crm/employees/fields?retailerId=${activeRetailerId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.fields)) {
          setFields(data.fields);
        }
      }
    } catch (err) {
      console.error('Error fetching employee fields:', err);
    } finally {
      setLoadingFields(false);
    }
  }, [activeRetailerId]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  useEffect(() => {
    fetchFields();
  }, [fetchFields]);

  // Compute KPI statistics
  const kpiStats = useMemo(() => {
    const total = employees.length;
    let active = 0;
    let inactive = 0;
    let loginAccess = 0;

    employees.forEach(emp => {
      if (emp.status === 'Active') {
        active++;
      } else {
        inactive++;
      }
      if (emp.loginEnabled && emp.status === 'Active') {
        loginAccess++;
      }
    });

    return { total, active, inactive, loginAccess };
  }, [employees]);

  // Open Add Employee Modal
  const handleOpenAddModal = () => {
    setEditingEmployee(null);
    const initialData = {
      fullName: '',
      mobileNumber: '',
      email: '',
      dob: '',
      gender: 'Male',
      address: '',
      city: '',
      state: 'Maharashtra',
      pinCode: '',
      joiningDate: new Date().toISOString().split('T')[0],
      designation: 'Staff',
      department: 'Customer Service',
      profilePhoto: '',
      emergencyContact: '',
      status: 'Active',
      loginEnabled: true,
      password: '',
      customFields: {}
    };

    // Prepopulate custom fields defaults
    fields.forEach(f => {
      if (!f.isDefault) {
        initialData.customFields[f.name] = '';
      }
    });

    setFormData(initialData);
    setFormErrors({});
    setIsAddEditModalOpen(true);
  };

  // Open Edit Employee Modal
  const handleOpenEditModal = (emp) => {
    setEditingEmployee(emp);
    const initialData = {
      fullName: emp.fullName || '',
      mobileNumber: emp.mobileNumber || '',
      email: emp.email || '',
      dob: emp.dob ? new Date(emp.dob).toISOString().split('T')[0] : '',
      gender: emp.gender || 'Male',
      address: emp.address || '',
      city: emp.city || '',
      state: emp.state || 'Maharashtra',
      pinCode: emp.pinCode || '',
      joiningDate: emp.joiningDate ? new Date(emp.joiningDate).toISOString().split('T')[0] : '',
      designation: emp.designation || 'Staff',
      department: emp.department || 'Operations',
      profilePhoto: emp.profilePhoto || '',
      emergencyContact: emp.emergencyContact || '',
      status: emp.status || 'Active',
      loginEnabled: emp.loginEnabled !== false,
      password: '', // Leave blank unless changing
      customFields: emp.customFields ? { ...emp.customFields } : {}
    };

    // Ensure all registered custom fields have a key
    fields.forEach(f => {
      if (!f.isDefault && initialData.customFields[f.name] === undefined) {
        initialData.customFields[f.name] = '';
      }
    });

    setFormData(initialData);
    setFormErrors({});
    setIsAddEditModalOpen(true);
  };

  // Form input change handlers
  const handleInputChange = (fieldKey, val, isCustom = false) => {
    if (isCustom) {
      setFormData(prev => ({
        ...prev,
        customFields: {
          ...prev.customFields,
          [fieldKey]: val
        }
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [fieldKey]: val
      }));
    }
    // Clear field error
    if (formErrors[fieldKey]) {
      setFormErrors(prev => {
        const copy = { ...prev };
        delete copy[fieldKey];
        return copy;
      });
    }
  };

  // Validate form submission
  const validateForm = () => {
    const errors = {};

    // Validate active fields based on retailer's field settings
    fields.forEach(f => {
      if (!f.enabled) return; // Ignore disabled/hidden fields

      let val;
      if (f.isDefault) {
        val = formData[f.name];
      } else {
        val = formData.customFields ? formData.customFields[f.name] : '';
      }

      if (f.required && (val === undefined || val === null || String(val).trim() === '')) {
        errors[f.name] = `${f.label} is required.`;
      }

      // Format validations
      if (val && String(val).trim()) {
        if (f.type === 'mobile' || f.name === 'mobileNumber' || f.name === 'emergencyContact') {
          const cleanMobile = String(val).replace(/\D/g, '');
          if (cleanMobile.length < 10) {
            errors[f.name] = 'Please enter a valid 10-digit mobile number.';
          }
        }
        if (f.type === 'email' || f.name === 'email') {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(String(val).trim())) {
            errors[f.name] = 'Please enter a valid email address.';
          }
        }
        if (f.name === 'pinCode') {
          const cleanPin = String(val).replace(/\D/g, '');
          if (cleanPin.length !== 6) {
            errors[f.name] = 'PIN code must be 6 digits.';
          }
        }
      }
    });

    // Password validation for new employees
    if (!editingEmployee && (!formData.password || String(formData.password).trim().length < 4)) {
      errors.password = 'Initial password must be at least 4 characters long.';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Submit Add / Edit Form
  const handleSubmitForm = async (e) => {
    e.preventDefault();
    if (!validateForm()) {
      Swal.fire({
        icon: 'warning',
        title: 'Validation Error',
        text: 'Please correct the highlighted fields before saving.',
        confirmButtonColor: '#4f46e5'
      });
      return;
    }

    try {
      setSubmittingForm(true);
      const payload = {
        ...formData,
        retailerId: activeRetailerId
      };

      let url = '/api/crm/employees';
      let method = 'POST';

      if (editingEmployee) {
        url = `/api/crm/employees/${editingEmployee._id || editingEmployee.employeeUid}`;
        method = 'PUT';
      }

      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (res.ok && data.success) {
        Swal.fire({
          icon: 'success',
          title: editingEmployee ? 'Employee Updated!' : 'Employee Added Successfully!',
          html: `<p style="font-size:14px; color:#334155;"><strong>${data.employee?.fullName || formData.fullName}</strong> (${data.employee?.employeeUid || 'Saved'}) is ready for use.</p>`,
          timer: 2000,
          showConfirmButton: false
        });
        setIsAddEditModalOpen(false);
        fetchEmployees();
      } else {
        Swal.fire({
          icon: 'error',
          title: 'Operation Failed',
          text: data.message || 'Failed to save employee profile.',
          confirmButtonColor: '#4f46e5'
        });
      }
    } catch (err) {
      console.error('Error saving employee:', err);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: err.message || 'An unexpected error occurred.',
        confirmButtonColor: '#4f46e5'
      });
    } finally {
      setSubmittingForm(false);
    }
  };

  // Toggle Employee Status (Active / Inactive)
  const handleToggleStatus = async (emp) => {
    const newStatus = emp.status === 'Active' ? 'Inactive' : 'Active';
    const confirm = await Swal.fire({
      title: `${newStatus === 'Active' ? 'Activate' : 'Deactivate'} Employee?`,
      text: `Do you want to mark ${emp.fullName} (${emp.employeeUid}) as ${newStatus}? ${newStatus === 'Inactive' ? 'Their login access will also be temporarily revoked.' : 'They will regain login access.'}`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: `Yes, ${newStatus}`,
      confirmButtonColor: newStatus === 'Active' ? '#10b981' : '#ef4444',
      cancelButtonText: 'Cancel'
    });

    if (!confirm.isConfirmed) return;

    try {
      const res = await apiFetch(`/api/crm/employees/${emp._id || emp.employeeUid}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ retailerId: activeRetailerId })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        Swal.fire({
          icon: 'success',
          title: `Account ${data.status}`,
          text: data.message,
          timer: 1500,
          showConfirmButton: false
        });
        fetchEmployees();
      } else {
        Swal.fire({
          icon: 'error',
          title: 'Update Failed',
          text: data.message || 'Could not change status.',
          confirmButtonColor: '#4f46e5'
        });
      }
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Error', text: err.message, confirmButtonColor: '#4f46e5' });
    }
  };

  // Open Permissions Modal
  const handleOpenPermissionsModal = async (emp) => {
    setPermEmployee(emp);
    setLoadingPerms(true);
    setExpandedPermCats({});
    try {
      const res = await apiFetch(`/api/crm/employees/${emp._id || emp.employeeUid}/permissions?retailerId=${activeRetailerId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setPermCatalog(data.catalog || []);
          setAuthorizedPermIds(data.authorizedPermissionIds || []);
          setAssignedPerms(data.assignedPermissions || []);
          // Expand all categories by default
          const exp = {};
          (data.catalog || []).forEach(cat => {
            exp[cat.id] = true;
          });
          setExpandedPermCats(exp);
        }
      }
    } catch (err) {
      console.error('Error fetching employee permissions:', err);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Failed to load service permissions catalog.',
        confirmButtonColor: '#4f46e5'
      });
    } finally {
      setLoadingPerms(false);
    }
  };

  // Toggle single permission
  const handleToggleSinglePerm = (permId) => {
    // If permission is not authorized for the parent retailer, prevent selection
    if (!authorizedPermIds.includes(permId)) {
      Swal.fire({
        icon: 'info',
        title: 'Permission Unavailable',
        text: 'This service is not enabled for your retailer account. Only services authorized for your shop can be delegated to employees.',
        confirmButtonColor: '#4f46e5'
      });
      return;
    }

    setAssignedPerms(prev => {
      if (prev.includes(permId)) {
        return prev.filter(p => p !== permId);
      } else {
        return [...prev, permId];
      }
    });
  };

  // Toggle entire category
  const handleToggleCategoryPerms = (category) => {
    const catItems = category?.items || category?.permissions || [];
    const availableCategoryPerms = catItems
      .map(i => i.id)
      .filter(id => (authorizedPermIds || []).includes(id));

    if (availableCategoryPerms.length === 0) {
      Swal.fire({
        icon: 'info',
        title: 'No Authorized Services',
        text: 'None of the services in this category are enabled for your shop account.',
        confirmButtonColor: '#4f46e5'
      });
      return;
    }

    const allChecked = availableCategoryPerms.every(id => (assignedPerms || []).includes(id));

    if (allChecked) {
      // Uncheck all in this category
      setAssignedPerms(prev => (prev || []).filter(id => !availableCategoryPerms.includes(id)));
    } else {
      // Check all available in this category
      setAssignedPerms(prev => Array.from(new Set([...(prev || []), ...availableCategoryPerms])));
    }
  };

  // Select all authorized permissions
  const handleSelectAllPerms = () => {
    setAssignedPerms([...authorizedPermIds]);
  };

  // Deselect all permissions
  const handleDeselectAllPerms = () => {
    setAssignedPerms([]);
  };

  // Save Permissions
  const handleSavePermissions = async () => {
    if (!permEmployee) return;
    try {
      setSavingPerms(true);
      const res = await apiFetch(`/api/crm/employees/${permEmployee._id || permEmployee.employeeUid}/permissions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          retailerId: activeRetailerId,
          permissions: assignedPerms
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        Swal.fire({
          icon: 'success',
          title: 'Permissions Saved!',
          text: data.message || 'Service permissions successfully updated.',
          timer: 1800,
          showConfirmButton: false
        });
        setPermEmployee(null);
        fetchEmployees();
      } else {
        Swal.fire({
          icon: 'error',
          title: 'Update Failed',
          text: data.message || 'Failed to update permissions.',
          confirmButtonColor: '#4f46e5'
        });
      }
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Error', text: err.message, confirmButtonColor: '#4f46e5' });
    } finally {
      setSavingPerms(false);
    }
  };

  // Open Activity Logs Modal
  const handleOpenActivityModal = async (emp = null) => {
    setIsActivityModalOpen(true);
    setLoadingActivities(true);
    const targetEmpUid = emp ? emp.employeeUid : 'ALL';
    setActivityFilterEmp(targetEmpUid);
    setActivityFilterModule('ALL');
    setActivityFilterDate('');

    await fetchActivities(targetEmpUid, 'ALL', '');
  };

  // Fetch Activities
  const fetchActivities = async (empUid = activityFilterEmp, mod = activityFilterModule, dt = activityFilterDate) => {
    try {
      setLoadingActivities(true);
      const params = new URLSearchParams({ retailerId: activeRetailerId });
      if (empUid && empUid !== 'ALL') params.append('employeeUid', empUid);
      if (mod && mod !== 'ALL') params.append('module', mod);
      if (dt) params.append('dateFrom', dt);

      const res = await apiFetch(`/api/crm/employees/activities?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.activities)) {
          setActivities(data.activities);
        }
      }
    } catch (err) {
      console.error('Error fetching employee activities:', err);
    } finally {
      setLoadingActivities(false);
    }
  };

  // Open Quick Password Reset Modal
  const handleOpenPasswordResetModal = (emp) => {
    setPwdResetEmployee(emp);
    setNewPassword('');
  };

  // Save Quick Password Reset
  const handleSavePasswordReset = async () => {
    if (!newPassword || newPassword.trim().length < 4) {
      Swal.fire({
        icon: 'warning',
        title: 'Password Too Short',
        text: 'Password must be at least 4 characters long.',
        confirmButtonColor: '#4f46e5'
      });
      return;
    }

    try {
      setSavingPwd(true);
      const res = await apiFetch(`/api/crm/employees/${pwdResetEmployee._id || pwdResetEmployee.employeeUid}/reset-password`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          retailerId: activeRetailerId,
          newPassword: newPassword.trim()
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        Swal.fire({
          icon: 'success',
          title: 'Password Updated!',
          text: `Password for ${pwdResetEmployee.fullName} has been changed.`,
          timer: 2000,
          showConfirmButton: false
        });
        setPwdResetEmployee(null);
      } else {
        Swal.fire({
          icon: 'error',
          title: 'Reset Failed',
          text: data.message || 'Could not reset password.',
          confirmButtonColor: '#4f46e5'
        });
      }
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Error', text: err.message, confirmButtonColor: '#4f46e5' });
    } finally {
      setSavingPwd(false);
    }
  };

  // Delete Employee
  const handleDeleteEmployee = async (emp) => {
    const confirm = await Swal.fire({
      title: 'Delete Employee Record?',
      html: `<p style="font-size:14px; color:#475569;">Are you sure you want to remove <strong>${emp.fullName}</strong> (${emp.employeeUid})?</p><p style="font-size:12px; color:#ef4444;">This action is permanent. Their login and access records will be removed.</p>`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Yes, Delete',
      confirmButtonColor: '#ef4444',
      cancelButtonText: 'Cancel'
    });

    if (!confirm.isConfirmed) return;

    try {
      const res = await apiFetch(`/api/crm/employees/${emp._id || emp.employeeUid}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ retailerId: activeRetailerId })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        Swal.fire({
          icon: 'success',
          title: 'Deleted',
          text: data.message,
          timer: 1500,
          showConfirmButton: false
        });
        fetchEmployees();
      } else {
        Swal.fire({
          icon: 'error',
          title: 'Delete Failed',
          text: data.message || 'Could not delete employee.',
          confirmButtonColor: '#4f46e5'
        });
      }
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Error', text: err.message, confirmButtonColor: '#4f46e5' });
    }
  };

  // Dynamic Field Builder Handlers
  const handleToggleFieldRequired = async (field) => {
    try {
      const res = await apiFetch(`/api/crm/employees/fields/${field._id}/toggle`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          retailerId: activeRetailerId,
          actionType: 'required'
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        fetchFields();
      }
    } catch (err) {
      console.error('Error toggling required:', err);
    }
  };

  const handleToggleFieldEnabled = async (field) => {
    try {
      const res = await apiFetch(`/api/crm/employees/fields/${field._id}/toggle`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          retailerId: activeRetailerId,
          actionType: 'enabled'
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        fetchFields();
      }
    } catch (err) {
      console.error('Error toggling enabled:', err);
    }
  };

  const handleAddCustomField = async (e) => {
    e.preventDefault();
    if (!newFieldData.name.trim() || !newFieldData.label.trim()) {
      Swal.fire({
        icon: 'warning',
        title: 'Missing Details',
        text: 'Please provide both Field Identifier and Field Label.',
        confirmButtonColor: '#4f46e5'
      });
      return;
    }

    try {
      setSavingField(true);
      let parsedOptions = [];
      if (['select', 'radio', 'checkbox'].includes(newFieldData.type)) {
        parsedOptions = newFieldData.options
          .split(',')
          .map(o => o.trim())
          .filter(Boolean);
      }

      const res = await apiFetch('/api/crm/employees/fields', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          retailerId: activeRetailerId,
          name: newFieldData.name.trim(),
          label: newFieldData.label.trim(),
          type: newFieldData.type,
          required: newFieldData.required,
          options: parsedOptions,
          placeholder: newFieldData.placeholder.trim(),
          icon: newFieldData.icon || '📝'
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        Swal.fire({
          icon: 'success',
          title: 'Field Added!',
          text: `Custom field "${newFieldData.label}" is now part of your employee forms.`,
          timer: 1600,
          showConfirmButton: false
        });
        setNewFieldData({
          name: '',
          label: '',
          type: 'text',
          required: false,
          options: '',
          placeholder: '',
          icon: '📝'
        });
        fetchFields();
      } else {
        Swal.fire({
          icon: 'error',
          title: 'Failed to Add Field',
          text: data.message || 'Error creating custom field.',
          confirmButtonColor: '#4f46e5'
        });
      }
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Error', text: err.message, confirmButtonColor: '#4f46e5' });
    } finally {
      setSavingField(false);
    }
  };

  const handleDeleteCustomField = async (field) => {
    if (field.isDefault) {
      Swal.fire({
        icon: 'info',
        title: 'Default Field',
        text: 'Default system fields cannot be deleted, but you can disable (hide) them or make them optional.',
        confirmButtonColor: '#4f46e5'
      });
      return;
    }

    const confirm = await Swal.fire({
      title: 'Delete Custom Field?',
      text: `Remove "${field.label}" (${field.name}) from employee forms? Existing values in employee profiles will be preserved.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Yes, Delete',
      confirmButtonColor: '#ef4444',
      cancelButtonText: 'Cancel'
    });

    if (!confirm.isConfirmed) return;

    try {
      const res = await apiFetch(`/api/crm/employees/fields/${field._id}?retailerId=${activeRetailerId}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (res.ok && data.success) {
        fetchFields();
      } else {
        Swal.fire({
          icon: 'error',
          title: 'Delete Failed',
          text: data.message,
          confirmButtonColor: '#4f46e5'
        });
      }
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Error', text: err.message, confirmButtonColor: '#4f46e5' });
    }
  };

  // Helper date formatter
  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
    } catch (_) {
      return dateStr;
    }
  };

  return (
    <div className="crm-emp-container">
      {/* 1. Header Banner */}
      <div className="crm-emp-header-card">
        <div className="crm-emp-header-left">
          {onBack && (
            <button
              type="button"
              className="crm-emp-back-btn"
              onClick={onBack}
              title="Return to CRM Suite"
            >
              ← Back to CRM Suite
            </button>
          )}

          <div className="crm-emp-title-wrap">
            <div className="crm-emp-icon-box">👔</div>
            <div>
              <h2>Employee Management</h2>
              <p>Manage employees, assign service permissions, provide login access, and track employee activities.</p>
            </div>
          </div>
        </div>

        <div className="crm-emp-header-actions">
          <button
            type="button"
            className="crm-emp-btn crm-emp-btn-secondary"
            onClick={() => handleOpenActivityModal(null)}
            title="View Employee Activity Logs"
          >
            📋 Activity Logs
          </button>

          <button
            type="button"
            className="crm-emp-btn crm-emp-btn-secondary"
            onClick={() => setIsFieldsModalOpen(true)}
            title="Configure Dynamic Form Fields"
          >
            ⚙️ Form Fields ({fields.filter(f => f.enabled).length})
          </button>

          {hasUserAccess(effectivePermissions, 'crm.employee.manage') && (
            <button
              type="button"
              className="crm-emp-btn crm-emp-btn-primary"
              onClick={handleOpenAddModal}
              title="Add New Employee"
            >
              + Add New Employee
            </button>
          )}
        </div>
      </div>

      {/* 2. KPI Summary Cards */}
      <div className="crm-emp-kpi-grid">
        <div className="crm-emp-kpi-card card-indigo">
          <div className="emp-kpi-icon">👥</div>
          <div className="emp-kpi-info">
            <span className="emp-kpi-label">Total Employees</span>
            <span className="emp-kpi-value">{kpiStats.total}</span>
            <span className="emp-kpi-sub">Registered Staff Members</span>
          </div>
        </div>

        <div className="crm-emp-kpi-card card-emerald">
          <div className="emp-kpi-icon">✅</div>
          <div className="emp-kpi-info">
            <span className="emp-kpi-label">Active Employees</span>
            <span className="emp-kpi-value" style={{ color: '#16a34a' }}>{kpiStats.active}</span>
            <span className="emp-kpi-sub">Currently Active Staff</span>
          </div>
        </div>

        <div className="crm-emp-kpi-card card-amber">
          <div className="emp-kpi-icon">⏸️</div>
          <div className="emp-kpi-info">
            <span className="emp-kpi-label">Inactive Accounts</span>
            <span className="emp-kpi-value" style={{ color: '#d97706' }}>{kpiStats.inactive}</span>
            <span className="emp-kpi-sub">Deactivated / Paused</span>
          </div>
        </div>

        <div className="crm-emp-kpi-card card-blue">
          <div className="emp-kpi-icon">🔐</div>
          <div className="emp-kpi-info">
            <span className="emp-kpi-label">Login Access</span>
            <span className="emp-kpi-value" style={{ color: '#0284c7' }}>{kpiStats.loginAccess}</span>
            <span className="emp-kpi-sub">Authorized Credentials</span>
          </div>
        </div>
      </div>

      {/* 3. Toolbar & Filters */}
      <div className="crm-emp-toolbar">
        <div className="crm-emp-search">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            placeholder="Search by UID (MBTAR...-EMP001), Name, Mobile, Designation, Department..."
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

        <div className="crm-emp-filters">
          <div className="emp-status-chips">
            <button
              type="button"
              className={`emp-filter-chip ${statusFilter === 'ALL' ? 'active' : ''}`}
              onClick={() => setStatusFilter('ALL')}
            >
              All ({kpiStats.total})
            </button>
            <button
              type="button"
              className={`emp-filter-chip ${statusFilter === 'Active' ? 'active' : ''}`}
              onClick={() => setStatusFilter('Active')}
            >
              Active ({kpiStats.active})
            </button>
            <button
              type="button"
              className={`emp-filter-chip ${statusFilter === 'Inactive' ? 'active' : ''}`}
              onClick={() => setStatusFilter('Inactive')}
            >
              Inactive ({kpiStats.inactive})
            </button>
          </div>
        </div>
      </div>

      {/* 4. Employee Table (Exact 9 Columns) */}
      <div className="crm-emp-table-card">
        <div className="emp-table-header-row">
          <h3 className="emp-table-title">Employee Roster</h3>
          <span className="emp-table-count-badge">
            {employees.length} {employees.length === 1 ? 'Employee' : 'Employees'} Listed
          </span>
        </div>

        <div className="crm-emp-table-wrap">
          <table className="crm-emp-table">
            <thead>
              <tr>
                {/* 1 */} <th>Employee UID</th>
                {/* 2 */} <th>Employee Name</th>
                {/* 3 */} <th>Mobile Number</th>
                {/* 4 */} <th>Designation</th>
                {/* 5 */} <th>Department</th>
                {/* 6 */} <th>Joining Date</th>
                {/* 7 */} <th style={{ textAlign: 'center' }}>Account Status</th>
                {/* 8 */} <th style={{ textAlign: 'center' }}>Assigned Services</th>
                {/* 9 */} <th style={{ textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="9" style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                    <div className="crm-spinner" />
                    <p style={{ marginTop: '10px' }}>Loading employee roster...</p>
                  </td>
                </tr>
              ) : employees.length === 0 ? (
                <tr>
                  <td colSpan="9" style={{ textAlign: 'center', padding: '50px 20px', color: '#64748b' }}>
                    <span style={{ fontSize: '36px', display: 'block', marginBottom: '8px' }}>👔</span>
                    <strong style={{ fontSize: '16px', color: '#0f172a' }}>No Employees Found</strong>
                    <p style={{ margin: '6px 0 16px 0', fontSize: '13px' }}>
                      {searchQuery
                        ? `No employees matched "${searchQuery}".`
                        : 'Add your staff members to assign permissions and grant login access.'}
                    </p>
                    <button
                      type="button"
                      className="crm-emp-btn crm-emp-btn-primary"
                      onClick={handleOpenAddModal}
                    >
                      + Add First Employee
                    </button>
                  </td>
                </tr>
              ) : (
                employees.map((emp) => {
                  const initial = (emp.fullName || 'E').charAt(0).toUpperCase();
                  const assignedCount = Array.isArray(emp.permissions) ? emp.permissions.length : 0;

                  return (
                    <tr key={emp._id || emp.employeeUid}>
                      {/* 1. Employee UID */}
                      <td>
                        <span
                          className="emp-uid-pill"
                          onClick={() => setViewingEmployee(emp)}
                          title="Click to view profile"
                        >
                          📋 {emp.employeeUid}
                        </span>
                      </td>

                      {/* 2. Employee Name */}
                      <td>
                        <div className="emp-name-cell">
                          <div className="emp-avatar">
                            {emp.profilePhoto ? (
                              <img src={emp.profilePhoto} alt={emp.fullName} onError={(e) => { e.target.style.display = 'none'; }} />
                            ) : (
                              initial
                            )}
                          </div>
                          <div className="emp-name-text">
                            <strong>{emp.fullName}</strong>
                            <small>{emp.email || 'No email provided'}</small>
                          </div>
                        </div>
                      </td>

                      {/* 3. Mobile Number */}
                      <td>
                        <span className="emp-phone-pill">📱 {emp.mobileNumber}</span>
                      </td>

                      {/* 4. Designation */}
                      <td>
                        <span className="emp-desig-tag">{emp.designation || 'Staff'}</span>
                      </td>

                      {/* 5. Department */}
                      <td>
                        <span className="emp-dept-text">{emp.department || 'Operations'}</span>
                      </td>

                      {/* 6. Joining Date */}
                      <td>
                        <span className="emp-date-text">{formatDate(emp.joiningDate)}</span>
                      </td>

                      {/* 7. Account Status */}
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          className={`emp-status-badge ${emp.status === 'Active' ? 'active' : 'inactive'}`}
                          onClick={() => handleToggleStatus(emp)}
                          title={`Click to ${emp.status === 'Active' ? 'deactivate' : 'activate'} this account`}
                        >
                          {emp.status === 'Active' ? '● Active' : '○ Inactive'}
                        </button>
                      </td>

                      {/* 8. Assigned Services */}
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          className="emp-services-badge"
                          onClick={() => handleOpenPermissionsModal(emp)}
                          title="Click to manage permissions"
                        >
                          🛡️ <span className="emp-services-count">{assignedCount}</span> Services
                        </button>
                      </td>

                      {/* 9. Actions */}
                      <td>
                        <div className="emp-actions-cell">
                          <button
                            type="button"
                            className="emp-action-btn view-btn"
                            onClick={() => setViewingEmployee(emp)}
                            title="View Full Profile"
                          >
                            👁️
                          </button>
                          <button
                            type="button"
                            className="emp-action-btn edit-btn"
                            onClick={() => handleOpenEditModal(emp)}
                            title="Edit Employee Information"
                          >
                            ✏️
                          </button>
                          <button
                            type="button"
                            className="emp-action-btn perm-btn"
                            onClick={() => handleOpenPermissionsModal(emp)}
                            title="Configure Service Permissions"
                          >
                            🛡️
                          </button>
                          <button
                            type="button"
                            className="emp-action-btn act-btn"
                            onClick={() => handleOpenActivityModal(emp)}
                            title="View Activity Logs"
                          >
                            📋
                          </button>
                          <button
                            type="button"
                            className="emp-action-btn"
                            onClick={() => handleOpenPasswordResetModal(emp)}
                            title="Reset Password / PIN"
                          >
                            🔑
                          </button>
                          <button
                            type="button"
                            className="emp-action-btn delete-btn"
                            onClick={() => handleDeleteEmployee(emp)}
                            title="Delete Employee Record"
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ======================================================================
          MODAL 1: ADD / EDIT EMPLOYEE
          ====================================================================== */}
      {isAddEditModalOpen && (
        <div className="crm-emp-modal-backdrop" onClick={() => setIsAddEditModalOpen(false)}>
          <div className="crm-emp-modal-card large-modal" onClick={(e) => e.stopPropagation()}>
            <div className="crm-emp-modal-header">
              <div className="modal-title-wrap">
                <span className="modal-icon">{editingEmployee ? '✏️' : '👔'}</span>
                <div>
                  <h3 className="crm-emp-modal-title">
                    {editingEmployee ? `Edit Employee: ${editingEmployee.fullName}` : 'Add New Employee'}
                  </h3>
                  <p className="crm-emp-modal-sub">
                    {editingEmployee
                      ? `UID: ${editingEmployee.employeeUid} · Configure employee details and access.`
                      : 'Create a retailer-private employee profile with sequential UID.'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="crm-emp-modal-close-btn"
                onClick={() => setIsAddEditModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitForm} className="crm-emp-modal-body">
              {/* Primary Personal Info */}
              <div className="emp-form-section-title">
                <span>👤</span> Personal & Identification Information
              </div>
              <div className="emp-form-grid">
                {/* Full Name */}
                <div className="emp-form-group">
                  <label className="emp-form-label">
                    Full Name <span className="emp-req-star">*</span>
                  </label>
                  <input
                    type="text"
                    className={`emp-form-input ${formErrors.fullName ? 'has-error' : ''}`}
                    placeholder="e.g. Ramesh Kumar Sharma"
                    value={formData.fullName || ''}
                    onChange={(e) => handleInputChange('fullName', e.target.value)}
                  />
                  {formErrors.fullName && <span className="emp-error-text">{formErrors.fullName}</span>}
                </div>

                {/* Mobile Number */}
                <div className="emp-form-group">
                  <label className="emp-form-label">
                    Mobile Number <span className="emp-req-star">*</span>
                  </label>
                  <input
                    type="tel"
                    maxLength="10"
                    className={`emp-form-input ${formErrors.mobileNumber ? 'has-error' : ''}`}
                    placeholder="10-digit mobile number"
                    value={formData.mobileNumber || ''}
                    onChange={(e) => handleInputChange('mobileNumber', e.target.value.replace(/\D/g, ''))}
                  />
                  {formErrors.mobileNumber && <span className="emp-error-text">{formErrors.mobileNumber}</span>}
                </div>

                {/* Email Address */}
                <div className="emp-form-group">
                  <label className="emp-form-label">
                    Email Address
                  </label>
                  <input
                    type="email"
                    className={`emp-form-input ${formErrors.email ? 'has-error' : ''}`}
                    placeholder="e.g. staff.member@gmail.com"
                    value={formData.email || ''}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                  />
                  {formErrors.email && <span className="emp-error-text">{formErrors.email}</span>}
                </div>

                {/* Date of Birth */}
                <div className="emp-form-group">
                  <label className="emp-form-label">
                    Date of Birth
                  </label>
                  <input
                    type="date"
                    className="emp-form-input"
                    value={formData.dob || ''}
                    onChange={(e) => handleInputChange('dob', e.target.value)}
                  />
                </div>

                {/* Gender */}
                <div className="emp-form-group">
                  <label className="emp-form-label">Gender</label>
                  <select
                    className="emp-form-select"
                    value={formData.gender || 'Male'}
                    onChange={(e) => handleInputChange('gender', e.target.value)}
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                {/* Emergency Contact */}
                <div className="emp-form-group">
                  <label className="emp-form-label">Emergency Contact Number</label>
                  <input
                    type="tel"
                    maxLength="10"
                    className={`emp-form-input ${formErrors.emergencyContact ? 'has-error' : ''}`}
                    placeholder="e.g. Parent / Spouse mobile"
                    value={formData.emergencyContact || ''}
                    onChange={(e) => handleInputChange('emergencyContact', e.target.value.replace(/\D/g, ''))}
                  />
                  {formErrors.emergencyContact && <span className="emp-error-text">{formErrors.emergencyContact}</span>}
                </div>

                {/* Address */}
                <div className="emp-form-group full-width">
                  <label className="emp-form-label">Residential Address</label>
                  <textarea
                    rows="2"
                    className="emp-form-textarea"
                    placeholder="House/Street, Landmark, Area..."
                    value={formData.address || ''}
                    onChange={(e) => handleInputChange('address', e.target.value)}
                  />
                </div>

                {/* City */}
                <div className="emp-form-group">
                  <label className="emp-form-label">City</label>
                  <input
                    type="text"
                    className="emp-form-input"
                    placeholder="e.g. Athani / Pune / Sangli"
                    value={formData.city || ''}
                    onChange={(e) => handleInputChange('city', e.target.value)}
                  />
                </div>

                {/* State */}
                <div className="emp-form-group">
                  <label className="emp-form-label">State</label>
                  <input
                    type="text"
                    className="emp-form-input"
                    placeholder="e.g. Maharashtra"
                    value={formData.state || ''}
                    onChange={(e) => handleInputChange('state', e.target.value)}
                  />
                </div>

                {/* PIN Code */}
                <div className="emp-form-group">
                  <label className="emp-form-label">PIN Code</label>
                  <input
                    type="text"
                    maxLength="6"
                    className={`emp-form-input ${formErrors.pinCode ? 'has-error' : ''}`}
                    placeholder="6-digit PIN"
                    value={formData.pinCode || ''}
                    onChange={(e) => handleInputChange('pinCode', e.target.value.replace(/\D/g, ''))}
                  />
                  {formErrors.pinCode && <span className="emp-error-text">{formErrors.pinCode}</span>}
                </div>

                {/* Profile Photo URL */}
                <div className="emp-form-group">
                  <label className="emp-form-label">Profile Photo URL (Optional)</label>
                  <input
                    type="url"
                    className="emp-form-input"
                    placeholder="https://... photo link"
                    value={formData.profilePhoto || ''}
                    onChange={(e) => handleInputChange('profilePhoto', e.target.value)}
                  />
                </div>
              </div>

              {/* Employment & Department Info */}
              <div className="emp-form-section-title">
                <span>🏢</span> Employment & Designation
              </div>
              <div className="emp-form-grid">
                {/* Joining Date */}
                <div className="emp-form-group">
                  <label className="emp-form-label">Joining Date</label>
                  <input
                    type="date"
                    className="emp-form-input"
                    value={formData.joiningDate || ''}
                    onChange={(e) => handleInputChange('joiningDate', e.target.value)}
                  />
                </div>

                {/* Designation */}
                <div className="emp-form-group">
                  <label className="emp-form-label">Designation / Role</label>
                  <select
                    className="emp-form-select"
                    value={formData.designation || 'Staff'}
                    onChange={(e) => handleInputChange('designation', e.target.value)}
                  >
                    <option value="Operator">Operator / Data Entry</option>
                    <option value="Staff">Staff Member</option>
                    <option value="Cashier">Cashier</option>
                    <option value="Executive">Executive</option>
                    <option value="Manager">Assistant Manager</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                {/* Department */}
                <div className="emp-form-group">
                  <label className="emp-form-label">Department</label>
                  <select
                    className="emp-form-select"
                    value={formData.department || 'Operations'}
                    onChange={(e) => handleInputChange('department', e.target.value)}
                  >
                    <option value="Customer Service">Customer Service</option>
                    <option value="Operations">Operations / Applications</option>
                    <option value="PAN & Identity">PAN & Identity Services</option>
                    <option value="Finance & Billing">Finance & Billing</option>
                    <option value="General Admin">General Admin</option>
                  </select>
                </div>

                {/* Account Status */}
                <div className="emp-form-group">
                  <label className="emp-form-label">Account Status</label>
                  <select
                    className="emp-form-select"
                    value={formData.status || 'Active'}
                    onChange={(e) => handleInputChange('status', e.target.value)}
                  >
                    <option value="Active">Active (Permitted to work)</option>
                    <option value="Inactive">Inactive (Suspended/Paused)</option>
                  </select>
                </div>
              </div>

              {/* Login Credentials */}
              <div className="emp-form-section-title">
                <span>🔐</span> Independent Employee Login Access
              </div>
              <div className="emp-form-grid">
                <div className="emp-form-group full-width">
                  <label className="emp-checkbox-item">
                    <input
                      type="checkbox"
                      checked={formData.loginEnabled !== false}
                      onChange={(e) => handleInputChange('loginEnabled', e.target.checked)}
                    />
                    <span><strong>Enable Independent Login</strong> (Allow employee to log into MB Mitra using Employee UID or Mobile Number)</span>
                  </label>
                </div>

                {formData.loginEnabled && (
                  <div className="emp-form-group full-width">
                    <label className="emp-form-label">
                      {editingEmployee ? 'Change Password / PIN (Leave empty to keep unchanged)' : 'Initial Password / Login PIN'}
                      {!editingEmployee && <span className="emp-req-star">*</span>}
                    </label>
                    <input
                      type="password"
                      className={`emp-form-input ${formErrors.password ? 'has-error' : ''}`}
                      placeholder={editingEmployee ? 'Enter new password only if changing' : 'Min 4 characters (e.g. 1234 or pass@123)'}
                      value={formData.password || ''}
                      onChange={(e) => handleInputChange('password', e.target.value)}
                    />
                    {formErrors.password && <span className="emp-error-text">{formErrors.password}</span>}
                  </div>
                )}
              </div>

              {/* Custom Dynamic Fields (Configured by Retailer) */}
              {fields.some(f => !f.isDefault && f.enabled) && (
                <>
                  <div className="emp-form-section-title">
                    <span>✨</span> Custom Shop Fields
                  </div>
                  <div className="emp-form-grid">
                    {fields
                      .filter(f => !f.isDefault && f.enabled)
                      .map(f => {
                        const val = formData.customFields ? formData.customFields[f.name] || '' : '';
                        const err = formErrors[f.name];

                        return (
                          <div
                            key={f._id || f.name}
                            className={`emp-form-group ${['textarea'].includes(f.type) ? 'full-width' : ''}`}
                          >
                            <label className="emp-form-label">
                              <span>{f.icon || '📝'}</span> {f.label}
                              {f.required && <span className="emp-req-star">*</span>}
                            </label>

                            {f.type === 'select' ? (
                              <select
                                className={`emp-form-select ${err ? 'has-error' : ''}`}
                                value={val}
                                onChange={(e) => handleInputChange(f.name, e.target.value, true)}
                              >
                                <option value="">Select {f.label}...</option>
                                {(f.options || []).map(opt => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                              </select>
                            ) : f.type === 'radio' ? (
                              <div className="emp-radio-group">
                                {(f.options || []).map(opt => (
                                  <label key={opt} className="emp-radio-item">
                                    <input
                                      type="radio"
                                      name={`custom_${f.name}`}
                                      value={opt}
                                      checked={val === opt}
                                      onChange={(e) => handleInputChange(f.name, e.target.value, true)}
                                    />
                                    <span>{opt}</span>
                                  </label>
                                ))}
                              </div>
                            ) : f.type === 'textarea' ? (
                              <textarea
                                rows="2"
                                className={`emp-form-textarea ${err ? 'has-error' : ''}`}
                                placeholder={f.placeholder || `Enter ${f.label}`}
                                value={val}
                                onChange={(e) => handleInputChange(f.name, e.target.value, true)}
                              />
                            ) : (
                              <input
                                type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                                className={`emp-form-input ${err ? 'has-error' : ''}`}
                                placeholder={f.placeholder || `Enter ${f.label}`}
                                value={val}
                                onChange={(e) => handleInputChange(f.name, e.target.value, true)}
                              />
                            )}
                            {err && <span className="emp-error-text">{err}</span>}
                          </div>
                        );
                      })}
                  </div>
                </>
              )}

              <div className="crm-emp-modal-footer">
                <button
                  type="button"
                  className="crm-emp-btn crm-emp-btn-secondary"
                  onClick={() => setIsAddEditModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="crm-emp-btn crm-emp-btn-primary"
                  disabled={submittingForm}
                >
                  {submittingForm ? 'Saving...' : editingEmployee ? 'Update Employee' : '✓ Save Employee'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================================
          MODAL 2: VIEW EMPLOYEE PROFILE
          ====================================================================== */}
      {viewingEmployee && (
        <div className="crm-emp-modal-backdrop" onClick={() => setViewingEmployee(null)}>
          <div className="crm-emp-modal-card view-modal" onClick={(e) => e.stopPropagation()}>
            <div className="crm-emp-modal-header">
              <div className="modal-title-wrap">
                <div className="emp-avatar" style={{ width: '44px', height: '44px', fontSize: '18px' }}>
                  {viewingEmployee.profilePhoto ? (
                    <img src={viewingEmployee.profilePhoto} alt={viewingEmployee.fullName} />
                  ) : (
                    (viewingEmployee.fullName || 'E').charAt(0).toUpperCase()
                  )}
                </div>
                <div>
                  <h3 className="crm-emp-modal-title">{viewingEmployee.fullName}</h3>
                  <p className="crm-emp-modal-sub">
                    UID: <strong>{viewingEmployee.employeeUid}</strong> · {viewingEmployee.designation || 'Staff'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="crm-emp-modal-close-btn"
                onClick={() => setViewingEmployee(null)}
              >
                ✕
              </button>
            </div>

            <div className="crm-emp-modal-body">
              <div className="emp-view-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px', fontSize: '13px' }}>
                <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '10px' }}>
                  <span style={{ fontSize: '11px', color: '#64748b', display: 'block', textTransform: 'uppercase', fontWeight: 700 }}>Mobile Number</span>
                  <strong style={{ color: '#0f172a' }}>📱 {viewingEmployee.mobileNumber}</strong>
                </div>

                <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '10px' }}>
                  <span style={{ fontSize: '11px', color: '#64748b', display: 'block', textTransform: 'uppercase', fontWeight: 700 }}>Email Address</span>
                  <strong style={{ color: '#0f172a' }}>✉️ {viewingEmployee.email || 'None'}</strong>
                </div>

                <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '10px' }}>
                  <span style={{ fontSize: '11px', color: '#64748b', display: 'block', textTransform: 'uppercase', fontWeight: 700 }}>Department</span>
                  <strong style={{ color: '#0f172a' }}>🏢 {viewingEmployee.department || 'Operations'}</strong>
                </div>

                <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '10px' }}>
                  <span style={{ fontSize: '11px', color: '#64748b', display: 'block', textTransform: 'uppercase', fontWeight: 700 }}>Joining Date</span>
                  <strong style={{ color: '#0f172a' }}>📅 {formatDate(viewingEmployee.joiningDate)}</strong>
                </div>

                <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '10px' }}>
                  <span style={{ fontSize: '11px', color: '#64748b', display: 'block', textTransform: 'uppercase', fontWeight: 700 }}>Account Status</span>
                  <span className={`emp-status-badge ${viewingEmployee.status === 'Active' ? 'active' : 'inactive'}`}>
                    {viewingEmployee.status === 'Active' ? '● Active' : '○ Inactive'}
                  </span>
                </div>

                <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '10px' }}>
                  <span style={{ fontSize: '11px', color: '#64748b', display: 'block', textTransform: 'uppercase', fontWeight: 700 }}>Login Enabled</span>
                  <strong style={{ color: viewingEmployee.loginEnabled !== false ? '#16a34a' : '#ef4444' }}>
                    {viewingEmployee.loginEnabled !== false ? '✓ Enabled' : '✕ Disabled'}
                  </strong>
                </div>

                <div style={{ gridColumn: 'span 2', background: '#f8fafc', padding: '12px', borderRadius: '10px' }}>
                  <span style={{ fontSize: '11px', color: '#64748b', display: 'block', textTransform: 'uppercase', fontWeight: 700 }}>Address</span>
                  <span style={{ color: '#0f172a' }}>
                    {viewingEmployee.address ? `${viewingEmployee.address}, ` : ''}
                    {viewingEmployee.city ? `${viewingEmployee.city}, ` : ''}
                    {viewingEmployee.state ? `${viewingEmployee.state} ` : ''}
                    {viewingEmployee.pinCode ? `– ${viewingEmployee.pinCode}` : ''}
                    {!viewingEmployee.address && !viewingEmployee.city && 'No address recorded.'}
                  </span>
                </div>

                <div style={{ gridColumn: 'span 2', background: '#eef2ff', padding: '12px', borderRadius: '10px', border: '1px solid #c7d2fe' }}>
                  <span style={{ fontSize: '11px', color: '#4338ca', display: 'block', textTransform: 'uppercase', fontWeight: 800 }}>Delegated Service Permissions ({viewingEmployee.permissions?.length || 0})</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                    {(viewingEmployee.permissions || []).length === 0 ? (
                      <em style={{ color: '#64748b', fontSize: '12px' }}>No permissions currently assigned.</em>
                    ) : (
                      (viewingEmployee.permissions || []).map(p => (
                        <span key={p} style={{ background: '#ffffff', color: '#3730a3', border: '1px solid #a5b4fc', padding: '3px 8px', borderRadius: '6px', fontSize: '11.5px', fontWeight: 700 }}>
                          ✓ {p}
                        </span>
                      ))
                    )}
                  </div>
                </div>

                {/* Custom Fields if present */}
                {viewingEmployee.customFields && Object.keys(viewingEmployee.customFields).length > 0 && (
                  <div style={{ gridColumn: 'span 2', background: '#f8fafc', padding: '12px', borderRadius: '10px' }}>
                    <span style={{ fontSize: '11px', color: '#64748b', display: 'block', textTransform: 'uppercase', fontWeight: 700, marginBottom: '6px' }}>Custom Fields</span>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                      {Object.entries(viewingEmployee.customFields).map(([k, v]) => (
                        <div key={k}>
                          <small style={{ color: '#64748b', textTransform: 'capitalize' }}>{k}:</small>{' '}
                          <strong style={{ color: '#0f172a' }}>{String(v) || '—'}</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="crm-emp-modal-footer">
              <button
                type="button"
                className="crm-emp-btn crm-emp-btn-secondary"
                onClick={() => {
                  setViewingEmployee(null);
                  handleOpenEditModal(viewingEmployee);
                }}
              >
                ✏️ Edit Profile
              </button>
              <button
                type="button"
                className="crm-emp-btn crm-emp-btn-primary"
                onClick={() => {
                  setViewingEmployee(null);
                  handleOpenPermissionsModal(viewingEmployee);
                }}
              >
                🛡️ Manage Permissions
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================================
          MODAL 3: MANAGE PERMISSIONS (Section 6 & 7)
          Strict Rule: Effective Permission = Parent Retailer Authorized Permissions AND Employee Assigned Permissions
          ====================================================================== */}
      {permEmployee && (
        <div className="crm-emp-modal-backdrop" onClick={() => setPermEmployee(null)}>
          <div className="crm-emp-modal-card large-modal" onClick={(e) => e.stopPropagation()}>
            <div className="crm-emp-modal-header">
              <div className="modal-title-wrap">
                <span className="modal-icon">🛡️</span>
                <div>
                  <h3 className="crm-emp-modal-title">
                    Service Permissions: {permEmployee.fullName}
                  </h3>
                  <p className="crm-emp-modal-sub">
                    UID: <strong>{permEmployee.employeeUid}</strong> · Delegate allowed tools and submodules.
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="crm-emp-modal-close-btn"
                onClick={() => setPermEmployee(null)}
              >
                ✕
              </button>
            </div>

            <div className="crm-emp-modal-body">
              {loadingPerms ? (
                <div style={{ textAlign: 'center', padding: '40px' }}>
                  <div className="crm-spinner" />
                  <p style={{ marginTop: '10px', color: '#64748b' }}>Checking retailer authorization catalog...</p>
                </div>
              ) : (
                <>
                  {/* Toolbar & Count */}
                  <div className="perm-toolbar-banner">
                    <div className="perm-toolbar-left">
                      <span className="perm-count-pill">
                        ✓ {assignedPerms.length} Selected / {authorizedPermIds.length} Allowed by Shop
                      </span>
                      <small style={{ color: '#4338ca', fontSize: '11.5px', marginLeft: '6px' }}>
                        (An employee cannot access services beyond your retailer account)
                      </small>
                    </div>

                    <div className="perm-toolbar-actions">
                      <button
                        type="button"
                        className="perm-action-pill"
                        onClick={handleSelectAllPerms}
                        title="Enable all authorized services"
                      >
                        ✓ Select All Allowed
                      </button>
                      <button
                        type="button"
                        className="perm-action-pill"
                        onClick={handleDeselectAllPerms}
                        title="Remove all permissions"
                      >
                        ✕ Deselect All
                      </button>
                    </div>
                  </div>

                  {/* Categories Accordion */}
                  {(permCatalog || []).map((cat) => {
                    const isExpanded = expandedPermCats[cat.id] !== false;
                    const catItems = cat?.items || cat?.permissions || [];
                    const authorizedItems = catItems.filter(i => (authorizedPermIds || []).includes(i.id));
                    const assignedInCat = catItems.filter(i => (assignedPerms || []).includes(i.id));

                    return (
                      <div key={cat.id} className="perm-category-card">
                        <div
                          className="perm-category-header"
                          onClick={() => {
                            setExpandedPermCats(prev => ({
                              ...prev,
                              [cat.id]: !isExpanded
                            }));
                          }}
                        >
                          <div className="perm-cat-title-wrap">
                            <span className="perm-cat-icon">{cat.icon || '📁'}</span>
                            <div>
                              <span className="perm-cat-name">{cat.title || cat.name}</span>
                              <span className="perm-cat-sub">
                                {assignedInCat.length} of {authorizedItems.length} active (Shop allowed: {authorizedItems.length}/{catItems.length})
                              </span>
                            </div>
                          </div>

                          <div className="perm-cat-actions" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              className="perm-cat-switch"
                              onClick={() => handleToggleCategoryPerms(cat)}
                              title="Toggle all permitted in this section"
                            >
                              {authorizedItems.length > 0 && assignedInCat.length === authorizedItems.length ? 'Deselect Category' : 'Select All Allowed'}
                            </button>
                            <span className={`perm-expand-arrow ${isExpanded ? 'open' : ''}`}>▼</span>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="perm-items-grid">
                            {catItems.map((item) => {
                              const isAuthorized = (authorizedPermIds || []).includes(item.id);
                              const isChecked = (assignedPerms || []).includes(item.id);

                              return (
                                <label
                                  key={item.id}
                                  className={`perm-item-label ${isChecked ? 'checked' : ''} ${!isAuthorized ? 'disabled' : ''}`}
                                  style={{
                                    opacity: isAuthorized ? 1 : 0.45,
                                    cursor: isAuthorized ? 'pointer' : 'not-allowed',
                                    background: !isAuthorized ? '#f1f5f9' : undefined
                                  }}
                                  title={!isAuthorized ? 'Service not enabled in your retailer profile.' : item.description}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    disabled={!isAuthorized}
                                    onChange={() => handleToggleSinglePerm(item.id)}
                                  />
                                  <div>
                                    <strong style={{ fontSize: '12.5px', display: 'block' }}>
                                      {item.label} {!isAuthorized && <small style={{ color: '#ef4444', fontWeight: 700 }}>(Shop Locked)</small>}
                                    </strong>
                                    <small style={{ color: '#64748b', fontSize: '10.5px' }}>{item.description}</small>
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </>
              )}
            </div>

            <div className="crm-emp-modal-footer">
              <button
                type="button"
                className="crm-emp-btn crm-emp-btn-secondary"
                onClick={() => setPermEmployee(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="crm-emp-btn crm-emp-btn-primary"
                onClick={handleSavePermissions}
                disabled={savingPerms || loadingPerms}
              >
                {savingPerms ? 'Saving Permissions...' : '✓ Save Service Permissions'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================================
          MODAL 4: DYNAMIC FORM FIELDS BUILDER SETTINGS (Section 4)
          ====================================================================== */}
      {isFieldsModalOpen && (
        <div className="crm-emp-modal-backdrop" onClick={() => setIsFieldsModalOpen(false)}>
          <div className="crm-emp-modal-card large-modal" onClick={(e) => e.stopPropagation()}>
            <div className="crm-emp-modal-header">
              <div className="modal-title-wrap">
                <span className="modal-icon">⚙️</span>
                <div>
                  <h3 className="crm-emp-modal-title">Dynamic Form Fields Settings</h3>
                  <p className="crm-emp-modal-sub">
                    Customize fields for employee registration. Toggle required status, hide/disable fields, or add custom fields.
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="crm-emp-modal-close-btn"
                onClick={() => setIsFieldsModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className="crm-emp-modal-body">
              {/* Add Custom Field Form */}
              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '14px', border: '1.5px solid #e2e8f0', marginBottom: '20px' }}>
                <strong style={{ fontSize: '13.5px', color: '#0f172a', display: 'block', marginBottom: '10px' }}>
                  + Add Custom Field for Your Shop
                </strong>
                <form onSubmit={handleAddCustomField}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '10px' }}>
                    <div>
                      <label style={{ fontSize: '11.5px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '3px' }}>
                        Field Identifier (Code) *
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. blood_group"
                        value={newFieldData.name}
                        onChange={(e) => setNewFieldData(prev => ({ ...prev, name: e.target.value.toLowerCase().replace(/\s+/g, '_') }))}
                        className="emp-form-input"
                        style={{ fontSize: '12px', padding: '8px' }}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: '11.5px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '3px' }}>
                        Field Label *
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Blood Group"
                        value={newFieldData.label}
                        onChange={(e) => setNewFieldData(prev => ({ ...prev, label: e.target.value }))}
                        className="emp-form-input"
                        style={{ fontSize: '12px', padding: '8px' }}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: '11.5px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '3px' }}>
                        Field Type
                      </label>
                      <select
                        value={newFieldData.type}
                        onChange={(e) => setNewFieldData(prev => ({ ...prev, type: e.target.value }))}
                        className="emp-form-select"
                        style={{ fontSize: '12px', padding: '8px' }}
                      >
                        <option value="text">Text Input</option>
                        <option value="number">Numeric</option>
                        <option value="date">Date</option>
                        <option value="select">Dropdown Menu</option>
                        <option value="radio">Radio Options</option>
                        <option value="textarea">Textarea (Multiline)</option>
                        <option value="file">File Upload / Link</option>
                      </select>
                    </div>
                  </div>

                  {['select', 'radio', 'checkbox'].includes(newFieldData.type) && (
                    <div style={{ marginBottom: '10px' }}>
                      <label style={{ fontSize: '11.5px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '3px' }}>
                        Comma-Separated Options
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. A+, B+, O+, AB+, O-"
                        value={newFieldData.options}
                        onChange={(e) => setNewFieldData(prev => ({ ...prev, options: e.target.value }))}
                        className="emp-form-input"
                        style={{ fontSize: '12px', padding: '8px' }}
                      />
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label className="emp-checkbox-item" style={{ fontSize: '12px' }}>
                      <input
                        type="checkbox"
                        checked={newFieldData.required}
                        onChange={(e) => setNewFieldData(prev => ({ ...prev, required: e.target.checked }))}
                      />
                      <span>Make this field Mandatory</span>
                    </label>

                    <button
                      type="submit"
                      className="crm-emp-btn crm-emp-btn-primary"
                      style={{ padding: '8px 16px', fontSize: '12.5px' }}
                      disabled={savingField}
                    >
                      {savingField ? 'Adding...' : '+ Add Field'}
                    </button>
                  </div>
                </form>
              </div>

              {/* Existing Form Fields List */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ fontSize: '13px', color: '#0f172a' }}>Form Fields Active Roster ({fields.length})</strong>
                <small style={{ color: '#64748b' }}>Toggle Required or Visibility per field</small>
              </div>

              <div className="field-settings-list">
                {loadingFields ? (
                  <div style={{ textAlign: 'center', padding: '24px' }}>
                    <div className="crm-spinner" />
                    <p style={{ marginTop: '8px', color: '#64748b', fontSize: '12px' }}>Loading form fields...</p>
                  </div>
                ) : fields.map((f) => (
                  <div key={f._id || f.name} className="field-setting-item">
                    <div className="field-info-left">
                      <span className="field-drag-icon">⋮⋮</span>
                      <div className="field-name-title">
                        <strong>{f.icon || '📝'} {f.label}</strong>
                        <small>{f.name}</small>
                        {f.isDefault && (
                          <span style={{ fontSize: '10px', color: '#6366f1', background: '#eef2ff', padding: '2px 6px', borderRadius: '4px', marginLeft: '6px' }}>
                            Default
                          </span>
                        )}
                      </div>
                      <span className="field-type-pill">{f.type}</span>
                    </div>

                    <div className="field-actions-right">
                      {/* Required / Optional Toggle */}
                      <button
                        type="button"
                        className={`field-req-tag ${f.required ? 'required' : 'optional'}`}
                        onClick={() => handleToggleFieldRequired(f)}
                        title="Click to toggle mandatory / optional"
                      >
                        {f.required ? '★ Mandatory' : '☆ Optional'}
                      </button>

                      {/* Enabled / Disabled Toggle */}
                      <button
                        type="button"
                        className={`field-toggle-btn ${f.enabled ? 'enabled' : 'disabled'}`}
                        onClick={() => handleToggleFieldEnabled(f)}
                        title="Click to show / hide this field"
                      >
                        {f.enabled ? '✓ Enabled' : '✕ Hidden'}
                      </button>

                      {/* Delete Custom Field */}
                      {!f.isDefault && (
                        <button
                          type="button"
                          className="emp-action-btn delete-btn"
                          onClick={() => handleDeleteCustomField(f)}
                          title="Delete Custom Field"
                          style={{ width: '28px', height: '28px' }}
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="crm-emp-modal-footer">
              <button
                type="button"
                className="crm-emp-btn crm-emp-btn-primary"
                onClick={() => setIsFieldsModalOpen(false)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================================
          MODAL 5: EMPLOYEE ACTIVITY LOGS (Section 8)
          ====================================================================== */}
      {isActivityModalOpen && (
        <div className="crm-emp-modal-backdrop" onClick={() => setIsActivityModalOpen(false)}>
          <div className="crm-emp-modal-card large-modal" onClick={(e) => e.stopPropagation()}>
            <div className="crm-emp-modal-header">
              <div className="modal-title-wrap">
                <span className="modal-icon">📋</span>
                <div>
                  <h3 className="crm-emp-modal-title">Employee Activity Audit Trail</h3>
                  <p className="crm-emp-modal-sub">
                    Track all employee actions, service operations, and record changes.
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="crm-emp-modal-close-btn"
                onClick={() => setIsActivityModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className="crm-emp-modal-body">
              {/* Filter Bar */}
              <div className="activity-filter-bar">
                <div>
                  <select
                    value={activityFilterEmp}
                    onChange={(e) => {
                      const val = e.target.value;
                      setActivityFilterEmp(val);
                      fetchActivities(val, activityFilterModule, activityFilterDate);
                    }}
                  >
                    <option value="ALL">All Employees</option>
                    {employees.map(e => (
                      <option key={e.employeeUid} value={e.employeeUid}>
                        {e.fullName} ({e.employeeUid})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <select
                    value={activityFilterModule}
                    onChange={(e) => {
                      const val = e.target.value;
                      setActivityFilterModule(val);
                      fetchActivities(activityFilterEmp, val, activityFilterDate);
                    }}
                  >
                    <option value="ALL">All Modules</option>
                    <option value="CRM">CRM Suite</option>
                    <option value="Money Transaction">Money Transaction</option>
                    <option value="Customer Management">Customer Management</option>
                    <option value="My Bill Book">My Bill Book</option>
                    <option value="PAN Card">PAN Card</option>
                    <option value="Offline Work">Offline Work</option>
                    <option value="Tools">Tools</option>
                  </select>
                </div>

                <div>
                  <input
                    type="date"
                    value={activityFilterDate}
                    onChange={(e) => {
                      const val = e.target.value;
                      setActivityFilterDate(val);
                      fetchActivities(activityFilterEmp, activityFilterModule, val);
                    }}
                  />
                </div>

                <button
                  type="button"
                  className="crm-emp-btn crm-emp-btn-secondary"
                  onClick={() => {
                    setActivityFilterEmp('ALL');
                    setActivityFilterModule('ALL');
                    setActivityFilterDate('');
                    fetchActivities('ALL', 'ALL', '');
                  }}
                  style={{ padding: '6px 12px', fontSize: '12px' }}
                >
                  Reset
                </button>
              </div>

              {/* Activities Table */}
              <div style={{ overflowX: 'auto' }}>
                <table className="activity-table">
                  <thead>
                    <tr>
                      <th>Time & Date</th>
                      <th>Employee</th>
                      <th>Module / Service</th>
                      <th>Action Taken</th>
                      <th>Status</th>
                      <th>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingActivities ? (
                      <tr>
                        <td colSpan="6" style={{ textAlign: 'center', padding: '30px' }}>
                          <div className="crm-spinner" />
                          <p style={{ marginTop: '8px', color: '#64748b' }}>Loading activity logs...</p>
                        </td>
                      </tr>
                    ) : activities.length === 0 ? (
                      <tr>
                        <td colSpan="6" style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                          No activity recorded matching the selected filter.
                        </td>
                      </tr>
                    ) : (
                      activities.map((act) => (
                        <tr key={act._id}>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            <strong style={{ display: 'block', color: '#0f172a' }}>{act.time}</strong>
                            <small style={{ color: '#64748b' }}>{formatDate(act.date)}</small>
                          </td>
                          <td>
                            <strong style={{ display: 'block', color: '#0f172a' }}>{act.employeeName}</strong>
                            <span style={{ fontSize: '11px', fontFamily: 'monospace', color: '#4f46e5' }}>{act.employeeUid}</span>
                          </td>
                          <td>
                            <span className="activity-badge">{act.serviceName}</span>
                            {act.moduleName && (
                              <small style={{ display: 'block', color: '#64748b', marginTop: '2px' }}>
                                {act.moduleName}
                              </small>
                            )}
                          </td>
                          <td>
                            <strong style={{ color: '#1e293b' }}>{act.action}</strong>
                            {act.recordId && (
                              <small style={{ display: 'block', fontFamily: 'monospace', color: '#64748b' }}>
                                Ref: {act.recordId}
                              </small>
                            )}
                          </td>
                          <td>
                            <span className={act.status === 'Success' ? 'activity-status-success' : 'activity-status-failed'}>
                              {act.status === 'Success' ? '✓ ' : '✕ '}
                              {act.status}
                            </span>
                          </td>
                          <td style={{ color: '#475569', fontSize: '12px' }}>
                            {act.details || '—'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="crm-emp-modal-footer">
              <button
                type="button"
                className="crm-emp-btn crm-emp-btn-primary"
                onClick={() => setIsActivityModalOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================================
          MODAL 6: QUICK PASSWORD RESET
          ====================================================================== */}
      {pwdResetEmployee && (
        <div className="crm-emp-modal-backdrop" onClick={() => setPwdResetEmployee(null)}>
          <div className="crm-emp-modal-card" style={{ maxWidth: '420px' }} onClick={(e) => e.stopPropagation()}>
            <div className="crm-emp-modal-header">
              <div className="modal-title-wrap">
                <span className="modal-icon">🔑</span>
                <div>
                  <h3 className="crm-emp-modal-title">Reset Password</h3>
                  <p className="crm-emp-modal-sub">{pwdResetEmployee.fullName} ({pwdResetEmployee.employeeUid})</p>
                </div>
              </div>
              <button
                type="button"
                className="crm-emp-modal-close-btn"
                onClick={() => setPwdResetEmployee(null)}
              >
                ✕
              </button>
            </div>

            <div className="crm-emp-modal-body">
              <div className="emp-form-group">
                <label className="emp-form-label">
                  New Password / PIN <span className="emp-req-star">*</span>
                </label>
                <input
                  type="password"
                  className="emp-form-input"
                  placeholder="Enter at least 4 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoFocus
                />
                <small style={{ color: '#64748b', marginTop: '4px' }}>
                  The employee can use this new password along with their Employee UID or Mobile Number to log in.
                </small>
              </div>
            </div>

            <div className="crm-emp-modal-footer">
              <button
                type="button"
                className="crm-emp-btn crm-emp-btn-secondary"
                onClick={() => setPwdResetEmployee(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="crm-emp-btn crm-emp-btn-primary"
                onClick={handleSavePasswordReset}
                disabled={savingPwd}
              >
                {savingPwd ? 'Updating...' : '✓ Reset Password'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
