import React, { useState, useEffect } from 'react';
import Swal from 'sweetalert2';
import { API_URL } from '../../utils/apiClient';

const OfflineFormsManager = ({ hasStaffActionAccess = () => true }) => {
  const [tabsList, setTabsList] = useState([]);
  const [selectedTabId, setSelectedTabId] = useState('');
  const [loading, setLoading] = useState(true);
  const [showAddTabModal, setShowAddTabModal] = useState(false);

  const [newTabForm, setNewTabForm] = useState({
    id: '',
    label: '',
    icon: '📁',
    fee: 50,
    badge: 'Manual Processing',
    description: ''
  });

  const [newFieldForm, setNewFieldForm] = useState({
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

  // Drag and drop states for fields
  const [draggedFieldIndex, setDraggedFieldIndex] = useState(null);
  const [dragOverFieldIndex, setDragOverFieldIndex] = useState(null);

  // Load tabs
  const fetchTabs = async () => {
    try {
      const res = await fetch(`${API_URL}/api/offline-work/tabs`);
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        setTabsList(data);
        if (!selectedTabId || !data.some(t => t.id === selectedTabId)) {
          setSelectedTabId(data[0].id);
        }
      }
    } catch (err) {
      console.error('Error loading offline tabs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTabs();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const currentTab = tabsList.find(t => t.id === selectedTabId);

  // Save tabs config to backend
  const handleSaveConfig = async (overrideList) => {
    const listToSave = overrideList || tabsList;
    try {
      const res = await fetch(`${API_URL}/api/offline-work/tabs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tabs: listToSave })
      });
      const data = await res.json();
      if (data.success) {
        if (!overrideList) {
          Swal.fire({
            icon: 'success',
            title: 'Saved!',
            text: 'Offline Work forms configuration saved successfully.',
            timer: 1500,
            showConfirmButton: false
          });
        }
      }
    } catch (err) {
      console.error('Error saving offline tabs config:', err);
      Swal.fire({ icon: 'error', title: 'Error', text: 'Failed to save configuration.' });
    }
  };

  // Add new Tab
  const handleAddNewTab = () => {
    if (!newTabForm.label.trim()) {
      return Swal.fire({ icon: 'warning', text: 'Please enter a tab title / label.' });
    }
    const tabId = newTabForm.id.trim() || 'offline_' + newTabForm.label.toLowerCase().replace(/[^a-zA-Z0-9]/g, '_');
    if (tabsList.some(t => t.id === tabId)) {
      return Swal.fire({ icon: 'error', text: 'A service sub-tab with this ID already exists.' });
    }
    const newTab = {
      id: tabId,
      label: newTabForm.label.trim(),
      icon: newTabForm.icon || '📁',
      fee: Number(newTabForm.fee) || 0,
      badge: newTabForm.badge || 'Manual Processing',
      description: newTabForm.description || '',
      fields: []
    };
    const updated = [...tabsList, newTab];
    setTabsList(updated);
    setSelectedTabId(tabId);
    handleSaveConfig(updated);
    setNewTabForm({ id: '', label: '', icon: '📁', fee: 50, badge: 'Manual Processing', description: '' });
    setShowAddTabModal(false);
  };

  // Delete Tab
  const handleDeleteTab = async (tabId) => {
    if (tabsList.length <= 1) {
      return Swal.fire({ icon: 'warning', text: 'You cannot delete the last remaining service tab.' });
    }
    const confirmRes = await Swal.fire({
      title: 'Delete Service Tab?',
      text: 'Are you sure you want to delete this offline service sub-tab permanently?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Yes, Delete Tab',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#e11d48'
    });
    if (!confirmRes.isConfirmed) return;

    const updated = tabsList.filter(t => t.id !== tabId);
    setTabsList(updated);
    if (selectedTabId === tabId) {
      setSelectedTabId(updated[0].id);
    }
    await handleSaveConfig(updated);
    Swal.fire({ icon: 'success', title: 'Deleted!', text: 'Sub-tab removed.', timer: 1200, showConfirmButton: false });
  };

  // Update Tab Header details
  const handleUpdateTabHeader = (prop, value) => {
    const updated = tabsList.map(tab => {
      if (tab.id === selectedTabId) {
        return { ...tab, [prop]: value };
      }
      return tab;
    });
    setTabsList(updated);
    handleSaveConfig(updated);
  };

  // Add field to active tab
  const handleAddField = () => {
    if (!newFieldForm.label.trim()) {
      return Swal.fire({ icon: 'warning', text: 'Please enter a field label.' });
    }

    const fieldName = newFieldForm.name.trim() || 
      newFieldForm.label.toLowerCase().replace(/[^a-zA-Z0-9]/g, '_') + '_' + Date.now().toString().slice(-4);

    let parsedOptions = [];
    if (newFieldForm.type === 'select' && newFieldForm.optionsRaw) {
      parsedOptions = newFieldForm.optionsRaw.split(',').map(s => s.trim()).filter(Boolean);
    }

    const newFieldObj = {
      name: fieldName,
      label: newFieldForm.label.trim(),
      type: newFieldForm.type || 'text',
      placeholder: newFieldForm.placeholder || '',
      icon: newFieldForm.icon || '📝',
      required: Boolean(newFieldForm.required),
      hidden: Boolean(newFieldForm.hidden),
      gridSpan: Number(newFieldForm.gridSpan) || 1,
      options: parsedOptions
    };

    const updated = tabsList.map(tab => {
      if (tab.id === selectedTabId) {
        const fields = [...(tab.fields || []), newFieldObj];
        return { ...tab, fields };
      }
      return tab;
    });

    setTabsList(updated);
    handleSaveConfig(updated);

    setNewFieldForm({
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

    Swal.fire({ icon: 'success', title: 'Field Added!', text: `Field "${newFieldObj.label}" added to form.`, timer: 1200, showConfirmButton: false });
  };

  // Update existing field property
  const handleUpdateField = (fieldIndex, prop, value) => {
    const updated = tabsList.map(tab => {
      if (tab.id === selectedTabId) {
        const fields = [...(tab.fields || [])];
        fields[fieldIndex] = { ...fields[fieldIndex], [prop]: value };
        return { ...tab, fields };
      }
      return tab;
    });
    setTabsList(updated);
    handleSaveConfig(updated);
  };

  // Toggle field property (required / hidden)
  const handleToggleField = (fieldIndex, prop) => {
    const updated = tabsList.map(tab => {
      if (tab.id === selectedTabId) {
        const fields = [...(tab.fields || [])];
        fields[fieldIndex] = { ...fields[fieldIndex], [prop]: !fields[fieldIndex][prop] };
        return { ...tab, fields };
      }
      return tab;
    });
    setTabsList(updated);
    handleSaveConfig(updated);
  };

  // Move field up/down
  const handleMoveField = (fieldIndex, direction) => {
    const updated = tabsList.map(tab => {
      if (tab.id === selectedTabId) {
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
    setTabsList(updated);
    handleSaveConfig(updated);
  };

  // Delete field
  const handleDeleteField = async (fieldIndex) => {
    const confirmRes = await Swal.fire({
      title: 'Delete Input Field?',
      text: 'Are you sure you want to delete this input field from the offline form configuration?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Yes, Delete Field',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#e11d48'
    });
    if (!confirmRes.isConfirmed) return;

    const updated = tabsList.map(tab => {
      if (tab.id === selectedTabId) {
        const fields = [...(tab.fields || [])];
        fields.splice(fieldIndex, 1);
        return { ...tab, fields };
      }
      return tab;
    });
    setTabsList(updated);
    await handleSaveConfig(updated);
    Swal.fire({ icon: 'success', title: 'Deleted!', text: 'Input field removed.', timer: 1200, showConfirmButton: false });
  };

  // Drag and Drop handlers
  const handleFieldDragStart = (e, index) => {
    setDraggedFieldIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', String(index)); } catch (err) {}
  };

  const handleFieldDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverFieldIndex !== index) setDragOverFieldIndex(index);
  };

  const handleFieldDrop = (e, targetIndex) => {
    e.preventDefault();
    const fromIndex = draggedFieldIndex !== null ? draggedFieldIndex : parseInt(e.dataTransfer.getData('text/plain'), 10);
    if (isNaN(fromIndex) || fromIndex === null || fromIndex === targetIndex) {
      setDraggedFieldIndex(null);
      setDragOverFieldIndex(null);
      return;
    }
    const updated = tabsList.map(tab => {
      if (tab.id === selectedTabId) {
        const fields = [...(tab.fields || [])];
        const [movedField] = fields.splice(fromIndex, 1);
        fields.splice(targetIndex, 0, movedField);
        return { ...tab, fields };
      }
      return tab;
    });
    setTabsList(updated);
    handleSaveConfig(updated);
    setDraggedFieldIndex(null);
    setDragOverFieldIndex(null);
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
        <div style={{ fontSize: '32px', marginBottom: '10px' }}>⏳</div>
        <b>Loading Offline Forms Manager...</b>
      </div>
    );
  }

  return (
    <div className="admin-panel-grid" style={{ gridTemplateColumns: '1fr', gap: '20px' }}>
      <div className="pan-manager-card" style={{ background: '#ffffff', borderRadius: '16px', border: '1.5px solid #e2e8f0', padding: '24px', boxShadow: '0 4px 16px rgba(0,0,0,0.04)' }}>
        
        {/* Header Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px', borderBottom: '1.5px solid #ffedd5', paddingBottom: '16px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', boxShadow: '0 4px 12px rgba(234, 88, 12, 0.3)' }}>
              📁
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '20px', color: '#0f172a', fontWeight: 800, letterSpacing: '-0.3px' }}>
                Offline Work Forms & Sub-Tabs Manager
              </h3>
              <p style={{ margin: '3px 0 0', fontSize: '13px', color: '#64748b' }}>
                Configure dynamic offline work service tabs, fees, descriptions, and custom form input fields for retailers.
              </p>
            </div>
          </div>

          <button
            onClick={() => handleSaveConfig()}
            style={{ padding: '10px 20px', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: '#ffffff', border: 'none', borderRadius: '10px', fontSize: '13.5px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)' }}
          >
            <span>💾</span> Save All Form Changes
          </button>
        </div>

        {/* STEP 1: Select or Create Sub-Tab */}
        <div style={{ background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: '14px', padding: '18px 20px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#ea580c', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 900 }}>1</span>
              <h4 style={{ margin: 0, fontSize: '15.5px', fontWeight: 800, color: '#1e293b' }}>
                STEP 1: Select Offline Sub-Tab to Configure
              </h4>
            </div>

            <button
              onClick={() => setShowAddTabModal(!showAddTabModal)}
              style={{ padding: '8px 16px', background: showAddTabModal ? '#fee2e2' : '#e0f2fe', color: showAddTabModal ? '#dc2626' : '#0284c7', border: '1px solid ' + (showAddTabModal ? '#fca5a5' : '#bae6fd'), borderRadius: '10px', fontSize: '12.5px', fontWeight: 800, cursor: 'pointer' }}
            >
              {showAddTabModal ? '✕ Close Form' : '➕ Create New Service Sub-Tab'}
            </button>
          </div>

          {/* Add Sub-Tab Form */}
          {showAddTabModal && (
            <div style={{ background: '#ffffff', border: '1.5px solid #bae6fd', borderRadius: '12px', padding: '18px', marginBottom: '16px', boxShadow: '0 4px 12px rgba(2, 132, 199, 0.08)' }}>
              <h5 style={{ margin: '0 0 14px', color: '#0284c7', fontSize: '14px', fontWeight: 800 }}>
                ✨ Add a Brand New Offline Service Sub-Tab
              </h5>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 800, color: '#475569', marginBottom: '4px' }}>Tab Title / Label *</label>
                  <input
                    type="text"
                    placeholder="e.g. Affidavit / Notary Work"
                    value={newTabForm.label}
                    onChange={(e) => setNewTabForm({ ...newTabForm, label: e.target.value })}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 800, color: '#475569', marginBottom: '4px' }}>Icon Emoji</label>
                  <input
                    type="text"
                    placeholder="e.g. 📜 / 📁 / 🏛️"
                    value={newTabForm.icon}
                    onChange={(e) => setNewTabForm({ ...newTabForm, icon: e.target.value })}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 800, color: '#475569', marginBottom: '4px' }}>Fee Amount (₹)</label>
                  <input
                    type="number"
                    placeholder="50"
                    value={newTabForm.fee}
                    onChange={(e) => setNewTabForm({ ...newTabForm, fee: e.target.value })}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box', fontWeight: 800, color: '#ea580c' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 800, color: '#475569', marginBottom: '4px' }}>Badge Header</label>
                  <input
                    type="text"
                    placeholder="e.g. Legal Services"
                    value={newTabForm.badge}
                    onChange={(e) => setNewTabForm({ ...newTabForm, badge: e.target.value })}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
                  />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 800, color: '#475569', marginBottom: '4px' }}>Service Description / Subtitle</label>
                  <input
                    type="text"
                    placeholder="e.g. Complete manual preparation and processing of legal documents..."
                    value={newTabForm.description}
                    onChange={(e) => setNewTabForm({ ...newTabForm, description: e.target.value })}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
                  />
                </div>
              </div>
              <button
                onClick={handleAddNewTab}
                style={{ padding: '9px 18px', background: '#0284c7', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 800, cursor: 'pointer' }}
              >
                ➕ Save & Add New Tab
              </button>
            </div>
          )}

          {/* Sub-Tab Selection Pills Grid */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            {tabsList.map(tab => {
              const isActive = selectedTabId === tab.id;
              return (
                <div
                  key={tab.id}
                  onClick={() => setSelectedTabId(tab.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 16px',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    background: isActive ? 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)' : '#ffffff',
                    color: isActive ? '#ffffff' : '#334155',
                    border: isActive ? '1.5px solid #c2410c' : '1.5px solid #cbd5e1',
                    boxShadow: isActive ? '0 4px 12px rgba(234, 88, 12, 0.25)' : 'none',
                    fontWeight: 700,
                    fontSize: '13.5px',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <span style={{ fontSize: '16px' }}>{tab.icon || '📁'}</span>
                  <span>{tab.label}</span>
                  <span style={{
                    fontSize: '11px',
                    padding: '2px 8px',
                    borderRadius: '8px',
                    background: isActive ? 'rgba(255,255,255,0.25)' : '#f1f5f9',
                    color: isActive ? '#ffffff' : '#64748b',
                    fontWeight: 800
                  }}>
                    {tab.fields?.length || 0} fields
                  </span>
                  {tabsList.length > 1 && (
                    <button
                      type="button"
                      title="Delete this sub-tab"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteTab(tab.id);
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: isActive ? 'rgba(255,255,255,0.8)' : '#94a3b8',
                        cursor: 'pointer',
                        padding: '2px 4px',
                        fontSize: '12px'
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

        {/* STEP 2 & 3: Selected Tab Details & Field Builder */}
        {currentTab && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            
            {/* STEP 2: Configure Tab Info & Fee */}
            <div style={{ background: '#ffffff', border: '1.5px solid #fed7aa', borderRadius: '14px', padding: '18px 20px', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                <span style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#0284c7', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 900 }}>2</span>
                <h4 style={{ margin: 0, fontSize: '15.5px', fontWeight: 800, color: '#0f172a' }}>
                  STEP 2: Details & Application Fee for "{currentTab.label}"
                </h4>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 800, color: '#475569', marginBottom: '4px' }}>Tab Display Label</label>
                  <input
                    type="text"
                    value={currentTab.label || ''}
                    onChange={(e) => handleUpdateTabHeader('label', e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 800, color: '#475569', marginBottom: '4px' }}>Icon Emoji</label>
                  <input
                    type="text"
                    value={currentTab.icon || ''}
                    onChange={(e) => handleUpdateTabHeader('icon', e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 800, color: '#475569', marginBottom: '4px' }}>Application Fee (₹)</label>
                  <input
                    type="number"
                    value={currentTab.fee !== undefined ? currentTab.fee : ''}
                    onChange={(e) => handleUpdateTabHeader('fee', e.target.value === '' ? '' : Number(e.target.value))}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box', fontWeight: 800, color: '#ea580c' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 800, color: '#475569', marginBottom: '4px' }}>Badge Header</label>
                  <input
                    type="text"
                    value={currentTab.badge || ''}
                    onChange={(e) => handleUpdateTabHeader('badge', e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
                  />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 800, color: '#475569', marginBottom: '4px' }}>Subtitle Instructions / Description</label>
                  <input
                    type="text"
                    value={currentTab.description || ''}
                    onChange={(e) => handleUpdateTabHeader('description', e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
                  />
                </div>
              </div>
            </div>

            {/* STEP 3: Manage Form Fields */}
            <div style={{ background: '#ffffff', border: '1.5px solid #fdba74', borderRadius: '14px', padding: '18px 20px', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', borderBottom: '1.5px solid #ffedd5', paddingBottom: '14px', marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#9333ea', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 900 }}>3</span>
                  <h4 style={{ margin: 0, fontSize: '15.5px', fontWeight: 800, color: '#9a3412' }}>
                    STEP 3: Form Fields Builder for "{currentTab.label}"
                  </h4>
                </div>
                <span style={{ background: '#fff7ed', color: '#ea580c', border: '1px solid #fdba74', padding: '4px 12px', borderRadius: '12px', fontSize: '12px', fontWeight: 800 }}>
                  Active Tab: {currentTab.label}
                </span>
              </div>

              {/* Add New Field Box */}
              <div style={{ background: '#fffbf5', border: '1.5px dashed #ea580c', borderRadius: '14px', padding: '20px', marginBottom: '24px' }}>
                <h5 style={{ margin: '0 0 14px', color: '#ea580c', fontSize: '14.5px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  ➕ Add a New Form Input Field to "{currentTab.label}"
                </h5>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '16px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 800, color: '#475569', marginBottom: '4px' }}>Field Label (Displayed to Retailer) *</label>
                    <input
                      type="text"
                      placeholder="e.g. Applicant Aadhaar Number"
                      value={newFieldForm.label}
                      onChange={(e) => setNewFieldForm({ ...newFieldForm, label: e.target.value })}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 800, color: '#475569', marginBottom: '4px' }}>Input Type</label>
                    <select
                      value={newFieldForm.type}
                      onChange={(e) => setNewFieldForm({ ...newFieldForm, type: e.target.value })}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box', fontWeight: 600 }}
                    >
                      <option value="text">🔤 Text Input (Name, ID, Address)</option>
                      <option value="tel">📱 Mobile / Phone Number</option>
                      <option value="email">📧 Email Address</option>
                      <option value="date">📅 Date Picker (DOB / Date)</option>
                      <option value="select">🔽 Dropdown Selection Menu</option>
                      <option value="file">📁 Direct File / Photo Upload (Dropzone Space)</option>
                    </select>
                  </div>

                  {/* Dynamic Options if Dropdown */}
                  {newFieldForm.type === 'select' && (
                    <div style={{ gridColumn: '1 / -1', background: '#fff7ed', border: '1.5px solid #fdba74', padding: '12px 16px', borderRadius: '10px' }}>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#c2410c', marginBottom: '4px' }}>
                        🔽 Dropdown Options (Comma Separated) *
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Option 1, Option 2, Option 3, Other"
                        value={newFieldForm.optionsRaw}
                        onChange={(e) => setNewFieldForm({ ...newFieldForm, optionsRaw: e.target.value })}
                        style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1.5px solid #f97316', fontSize: '13px', boxSizing: 'border-box', fontWeight: 600 }}
                      />
                      <span style={{ fontSize: '11px', color: '#9a3412', marginTop: '4px', display: 'block' }}>
                        💡 Separate each choice with a comma.
                      </span>
                    </div>
                  )}

                  <div>
                    <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 800, color: '#475569', marginBottom: '4px' }}>Placeholder Hint Text</label>
                    <input
                      type="text"
                      placeholder="e.g. Enter 12-digit number..."
                      value={newFieldForm.placeholder}
                      onChange={(e) => setNewFieldForm({ ...newFieldForm, placeholder: e.target.value })}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 800, color: '#475569', marginBottom: '4px' }}>Icon Emoji</label>
                    <input
                      type="text"
                      placeholder="e.g. 🆔 / 📱 / 📜"
                      value={newFieldForm.icon}
                      onChange={(e) => setNewFieldForm({ ...newFieldForm, icon: e.target.value })}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
                    />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '16px', flexWrap: 'wrap' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', fontWeight: 800, color: '#ea580c', cursor: 'pointer', background: '#ffffff', padding: '6px 12px', border: '1.5px solid #fed7aa', borderRadius: '8px' }}>
                      <input
                        type="checkbox"
                        checked={newFieldForm.required}
                        onChange={(e) => setNewFieldForm({ ...newFieldForm, required: e.target.checked })}
                        style={{ accentColor: '#ea580c', cursor: 'pointer' }}
                      />
                      Mandatory / Required?
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', fontWeight: 800, color: '#0284c7', cursor: 'pointer', background: '#ffffff', padding: '6px 12px', border: '1.5px solid #bae6fd', borderRadius: '8px' }}>
                      <input
                        type="checkbox"
                        checked={newFieldForm.hidden}
                        onChange={(e) => setNewFieldForm({ ...newFieldForm, hidden: e.target.checked })}
                        style={{ accentColor: '#0284c7', cursor: 'pointer' }}
                      />
                      Hide Field?
                    </label>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleAddField}
                  style={{ padding: '10px 22px', background: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)', color: '#ffffff', border: 'none', borderRadius: '8px', fontSize: '13.5px', fontWeight: 800, cursor: 'pointer', boxShadow: '0 4px 12px rgba(234, 88, 12, 0.25)' }}
                >
                  ➕ Add Field to Form
                </button>
              </div>

              {/* Existing Form Fields Table */}
              <div style={{ background: '#ffffff', border: '1.5px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
                <div style={{ padding: '14px 18px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <b style={{ color: '#0f172a', fontSize: '14px' }}>
                    Configured Input Fields ({currentTab.fields?.length || 0})
                  </b>
                  <span style={{ fontSize: '12px', color: '#64748b' }}>
                    Drag ☰ handle or use ▲▼ arrows to reorder
                  </span>
                </div>

                {(!currentTab.fields || currentTab.fields.length === 0) ? (
                  <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8' }}>
                    No fields configured yet. Add a field above.
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                      <thead>
                        <tr style={{ background: '#f1f5f9', color: '#475569' }}>
                          <th style={{ padding: '10px 14px', width: '40px' }}>Order</th>
                          <th style={{ padding: '10px 14px', textAlign: 'left' }}>Field Label</th>
                          <th style={{ padding: '10px 14px', textAlign: 'left' }}>Input Type</th>
                          <th style={{ padding: '10px 14px', textAlign: 'left' }}>Placeholder</th>
                          <th style={{ padding: '10px 14px', textAlign: 'center' }}>Mandatory</th>
                          <th style={{ padding: '10px 14px', textAlign: 'center' }}>Visible</th>
                          <th style={{ padding: '10px 14px', textAlign: 'center' }}>Move</th>
                          <th style={{ padding: '10px 14px', textAlign: 'center' }}>Delete</th>
                        </tr>
                      </thead>
                      <tbody>
                        {currentTab.fields.map((field, idx) => {
                          const isDragTarget = dragOverFieldIndex === idx;
                          return (
                            <tr
                              key={field.name + '_' + idx}
                              draggable
                              onDragStart={(e) => handleFieldDragStart(e, idx)}
                              onDragOver={(e) => handleFieldDragOver(e, idx)}
                              onDrop={(e) => handleFieldDrop(e, idx)}
                              style={{
                                borderBottom: '1px solid #f1f5f9',
                                background: isDragTarget ? '#fff7ed' : '#ffffff',
                                transition: 'background 0.15s ease'
                              }}
                            >
                              <td style={{ padding: '10px 14px', textAlign: 'center', cursor: 'grab', color: '#94a3b8' }}>
                                ☰ {idx + 1}
                              </td>
                              <td style={{ padding: '10px 14px' }}>
                                <input
                                  type="text"
                                  value={field.label}
                                  onChange={(e) => handleUpdateField(idx, 'label', e.target.value)}
                                  style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12.5px', fontWeight: 700, width: '100%', boxSizing: 'border-box' }}
                                />
                              </td>
                              <td style={{ padding: '10px 14px' }}>
                                <select
                                  value={field.type || 'text'}
                                  onChange={(e) => handleUpdateField(idx, 'type', e.target.value)}
                                  style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px', fontWeight: 600 }}
                                >
                                  <option value="text">Text Input</option>
                                  <option value="tel">Mobile (Tel)</option>
                                  <option value="email">Email</option>
                                  <option value="date">Date Picker</option>
                                  <option value="select">Dropdown Menu</option>
                                  <option value="file">File Upload</option>
                                </select>
                              </td>
                              <td style={{ padding: '10px 14px' }}>
                                <input
                                  type="text"
                                  value={field.placeholder || ''}
                                  onChange={(e) => handleUpdateField(idx, 'placeholder', e.target.value)}
                                  style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px', width: '100%', boxSizing: 'border-box' }}
                                />
                              </td>
                              <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                                <button
                                  type="button"
                                  onClick={() => handleToggleField(idx, 'required')}
                                  style={{
                                    background: field.required ? '#fef2f2' : '#f8fafc',
                                    color: field.required ? '#ef4444' : '#64748b',
                                    border: `1px solid ${field.required ? '#fca5a5' : '#cbd5e1'}`,
                                    padding: '4px 8px',
                                    borderRadius: '6px',
                                    fontSize: '11px',
                                    fontWeight: 800,
                                    cursor: 'pointer'
                                  }}
                                >
                                  {field.required ? '🔴 REQUIRED' : '⚪ OPTIONAL'}
                                </button>
                              </td>
                              <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                                <button
                                  type="button"
                                  onClick={() => handleToggleField(idx, 'hidden')}
                                  style={{
                                    background: field.hidden ? '#fef2f2' : '#f0fdf4',
                                    color: field.hidden ? '#ef4444' : '#166534',
                                    border: `1px solid ${field.hidden ? '#fca5a5' : '#bbf7d0'}`,
                                    padding: '4px 8px',
                                    borderRadius: '6px',
                                    fontSize: '11px',
                                    fontWeight: 800,
                                    cursor: 'pointer'
                                  }}
                                >
                                  {field.hidden ? '🚫 HIDDEN' : '👁️ VISIBLE'}
                                </button>
                              </td>
                              <td style={{ padding: '10px 14px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                <button
                                  type="button"
                                  disabled={idx === 0}
                                  onClick={() => handleMoveField(idx, 'up')}
                                  style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '3px 7px', cursor: idx === 0 ? 'not-allowed' : 'pointer', marginRight: '4px' }}
                                >
                                  ▲
                                </button>
                                <button
                                  type="button"
                                  disabled={idx === currentTab.fields.length - 1}
                                  onClick={() => handleMoveField(idx, 'down')}
                                  style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '3px 7px', cursor: idx === currentTab.fields.length - 1 ? 'not-allowed' : 'pointer' }}
                                >
                                  ▼
                                </button>
                              </td>
                              <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteField(idx)}
                                  style={{ background: '#fff1f2', color: '#e11d48', border: '1px solid #fecdd3', padding: '5px 8px', borderRadius: '6px', fontSize: '11.5px', fontWeight: 800, cursor: 'pointer' }}
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
                )}
              </div>

            </div>

          </div>
        )}

      </div>
    </div>
  );
};

export default OfflineFormsManager;
