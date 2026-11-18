import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import './AdminPanel.css';

import { API_URL } from './utils/apiClient';

const Toast = Swal.mixin({
  toast: true,
  position: 'top-end',
  showConfirmButton: false,
  showCloseButton: true,
  timer: 2000,
  timerProgressBar: false,
  background: '#ffffff',
  color: '#334155',
  iconColor: '#ea580c',
  didOpen: (toast) => {
    toast.onmouseenter = null;
    toast.onmouseleave = null;
  }
});

const AdminPanel = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('actionCards');

  // States for fetching data
  const [cards, setCards] = useState([]);
  const [topTabs, setTopTabs] = useState([]);
  const [sidebarMenus, setSidebarMenus] = useState([]);
  const [banners, setBanners] = useState([]);
  const [newsImages, setNewsImages] = useState([]);
  const [users, setUsers] = useState([]);

  // Form States
  const [cardForm, setCardForm] = useState({ title: '', imgFile: null, icon: '', isAeps: false, url: '' });
  const [tabForm, setTabForm] = useState({ label: '', order: 0, url: '' });

  const [editingCardId, setEditingCardId] = useState(null);
  const [editingTabId, setEditingTabId] = useState(null);
  const [menuForm, setMenuForm] = useState({ label: '', isActive: false, order: 0 });
  const [bannerForm, setBannerForm] = useState({ imgFile: null, fallbackIcon: '', fallbackPerson: '' });
  const [newsImageForm, setNewsImageForm] = useState({ imgFile: null });
  const [paymentRequisitions, setPaymentRequisitions] = useState([]);
  const [upiConfig, setUpiConfig] = useState(null);
  const [upiForm, setUpiForm] = useState({ upiId: '', qrCodeImgFile: null });
  const [userForm, setUserForm] = useState({ userId: '', email: '', mobile: '', role: 'customer' });
  const [userSearch, setUserSearch] = useState('');
  const [reqSearch, setReqSearch] = useState('');
  const [reqStatusFilter, setReqStatusFilter] = useState('All');
  const [showNotifications, setShowNotifications] = useState(false);

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

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = () => {
    fetch(`${API_URL}/api/action-cards`).then(r => r.json()).then(setCards);
    fetch(`${API_URL}/api/top-tabs`).then(r => r.json()).then(setTopTabs);
    fetch(`${API_URL}/api/sidebar-menus`).then(r => r.json()).then(setSidebarMenus);
    fetch(`${API_URL}/api/banners`).then(r => r.json()).then(setBanners);
    fetch(`${API_URL}/api/news-images`).then(r => r.json()).then(setNewsImages);
    fetch(`${API_URL}/api/users`).then(r => r.json()).then(setUsers);
    fetch(`${API_URL}/api/payment-requisitions`).then(r => r.json()).then(setPaymentRequisitions);
    fetch(`${API_URL}/api/upi-config`).then(r => r.json()).then(data => {
      setUpiConfig(data);
      if (data) setUpiForm({ upiId: data.upiId || '', qrCodeImgFile: null });
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
    if (!newsImageForm.imgFile) return alert("Please select an image first");
    const formData = new FormData();
    formData.append('image', newsImageForm.imgFile);
    await fetch(`${API_URL}/api/news-images`, { method: 'POST', body: formData });
    setNewsImageForm({ imgFile: null });
    fetchAll();
  };

  const updateUpiConfig = async () => {
    const formData = new FormData();
    formData.append('upiId', upiForm.upiId);
    if (upiForm.qrCodeImgFile) formData.append('qrCodeImg', upiForm.qrCodeImgFile);
    await fetch(`${API_URL}/api/upi-config`, { method: 'PUT', body: formData });
    fetchAll();
    alert('UPI Configuration Updated!');
  };

  const addUser = async () => {
    if (!userForm.userId) return Toast.fire({ icon: 'warning', title: 'User ID is required' });
    const response = await fetch(`${API_URL}/api/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userForm)
    });

    if (response.ok) {
      Toast.fire({ icon: 'success', title: 'User Created Successfully!' });
      setUserForm({ userId: '', email: '', mobile: '', role: 'customer' });
      fetchAll();
    } else {
      const data = await response.json();
      Toast.fire({ icon: 'error', title: data.message });
    }
  };

  const updateRequisition = async (id, status, reqAmount) => {
    let finalStatus = status;
    let approvedAmount = 0;

    if (status === 'Approved') {
      const { value: amountStr } = await Swal.fire({
        title: 'Approve Payment',
        text: `Enter approved amount (Requested: ₹${reqAmount})`,
        input: 'number',
        inputValue: reqAmount,
        showCancelButton: true,
        confirmButtonText: 'Approve',
        customClass: {
          popup: 'small-prompt-modal'
        },
        inputValidator: (value) => {
          if (!value) return 'You need to write something!'
        }
      });
      if (!amountStr) return; // cancelled

      approvedAmount = Number(amountStr);
      if (approvedAmount < reqAmount && approvedAmount > 0) {
        finalStatus = 'Partially Approved';
      }
    }

    await fetch(`${API_URL}/api/payment-requisitions/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: finalStatus, approvedAmount })
    });
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

  const startEditTab = (tab) => {
    setEditingTabId(tab._id);
    setTabForm({
      label: tab.label,
      order: tab.order,
      url: tab.url || ''
    });
  };

  const deleteItem = async (url, id) => {
    await fetch(`${url}/${id}`, { method: 'DELETE' });
    fetchAll();
  };

  const menuItems = [
    { id: 'actionCards', label: 'Action Cards', icon: '💳' },
    { id: 'topTabs', label: 'Top Tabs', icon: '📑' },
    { id: 'sidebarMenus', label: 'Sidebar Menus', icon: '☰' },
    { id: 'banners', label: 'Banners', icon: '🖼️' },
    { id: 'newsImages', label: 'Login News Images', icon: '📰' },
    { id: 'walletRequests', label: 'Wallet Requests', icon: '💼' },
    { id: 'users', label: 'User Management', icon: '👥' },
  ];

  return (
    <div className="admin-layout">
      {/* Vertical Sidebar */}
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <h2>Admin Panel</h2>
        </div>
        <nav className="admin-nav-vertical">
          {menuItems.map(item => (
            <button
              key={item.id}
              className={`admin-nav-btn ${activeTab === item.id ? 'active' : ''}`}
              onClick={() => setActiveTab(item.id)}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="admin-sidebar-footer">
          {/* Footer removed per user request */}
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="admin-main">
        <header className="admin-topbar">
          <h1>{menuItems.find(m => m.id === activeTab)?.label}</h1>
          <div className="admin-topbar-actions" style={{ display: 'flex', gap: '25px', alignItems: 'center' }}>
            <div className="notification-icon" style={{ cursor: 'pointer', fontSize: '22px', position: 'relative' }}>
              <div onClick={() => setShowNotifications(!showNotifications)}>
                🔔
                {paymentRequisitions.filter(req => req.status === 'Pending').length > 0 && (
                  <span style={{ position: 'absolute', top: '-5px', right: '-8px', background: '#ef4444', color: 'white', borderRadius: '50%', padding: '2px 6px', fontSize: '11px', fontWeight: 'bold', border: '2px solid white' }}>
                    {paymentRequisitions.filter(req => req.status === 'Pending').length}
                  </span>
                )}
              </div>

              {/* Notification Dropdown */}
              {showNotifications && (
                <div style={{ position: 'absolute', top: '40px', right: '-10px', width: '320px', background: 'white', borderRadius: '12px', boxShadow: '0 10px 40px rgba(0,0,0,0.1)', border: '1px solid #e2e8f0', zIndex: 1000, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ padding: '15px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h4 style={{ margin: 0, fontSize: '15px', color: '#1e293b' }}>Notifications</h4>
                    <span style={{ fontSize: '12px', color: '#3b82f6', cursor: 'pointer', fontWeight: '600' }} onClick={() => { setShowNotifications(false); setActiveTab('walletRequests'); }}>View All</span>
                  </div>
                  <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                    {paymentRequisitions.filter(req => req.status === 'Pending').length === 0 ? (
                      <div style={{ padding: '20px', textAlign: 'center', color: '#64748b', fontSize: '14px' }}>No new notifications</div>
                    ) : (
                      paymentRequisitions.filter(req => req.status === 'Pending').map(req => (
                        <div key={req._id} onClick={() => { setShowNotifications(false); setActiveTab('walletRequests'); }} style={{ padding: '15px 20px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', transition: 'background 0.2s', fontSize: '13px' }} onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'} onMouseLeave={(e) => e.currentTarget.style.background = 'white'}>
                          <div style={{ fontWeight: '600', color: '#1e293b', marginBottom: '4px' }}>Payment Request</div>
                          <div style={{ color: '#64748b' }}>User <strong style={{ color: '#3b82f6' }}>{req.userId}</strong> requested ₹{req.amount}</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="user-profile" style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', background: '#f4f7fe', padding: '8px 15px', borderRadius: '20px', fontWeight: '600', color: '#2b3674' }}>
              <span style={{ fontSize: '18px' }}>👨‍💼</span>
              <span>Admin Profile</span>
            </div>
            <button
              onClick={() => navigate('/')}
              style={{ padding: '8px 15px', background: '#fee2e2', color: '#ef4444', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '5px' }}
            >
              <span>🚪</span> Logout
            </button>
          </div>
        </header>

        <div className="admin-content-wrapper">

          {/* Action Cards Tab */}
          {activeTab === 'actionCards' && (
            <div className="admin-panel-grid">
              <div className="admin-card form-card">
                <h3>Add New Card</h3>
                <div className="modern-form">
                  <input type="text" placeholder="Title" value={cardForm.title} onChange={e => setCardForm({ ...cardForm, title: e.target.value })} />
                  <div className="file-upload-wrapper">
                    <input type="file" accept="image/*" onChange={e => setCardForm({ ...cardForm, imgFile: e.target.files[0] })} />
                  </div>
                  <input type="text" placeholder="Redirect URL (e.g. https://google.com)" value={cardForm.url} onChange={e => setCardForm({ ...cardForm, url: e.target.value })} />
                  <label className="modern-checkbox">
                    <input type="checkbox" checked={cardForm.isAeps} onChange={e => setCardForm({ ...cardForm, isAeps: e.target.checked })} />
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
                      <img src={c.img} alt="" className="item-thumb" />
                      <span className="item-name">{c.title}</span>
                      <div className="item-actions">
                        <button className="modern-edit-btn" onClick={() => startEditCard(c)} style={{ marginRight: '8px', background: '#3b82f6', color: 'white', border: 'none', padding: '8px 14px', borderRadius: '6px', cursor: 'pointer' }}>Edit</button>
                        <button className="modern-delete-btn" onClick={() => deleteItem('http:REACT_APP_API_URL/api/action-cards', c._id)}>Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Top Tabs Tab */}
          {activeTab === 'topTabs' && (
            <div className="admin-panel-grid">
              <div className="admin-card form-card">
                <h3>Add Top Tab</h3>
                <div className="modern-form">
                  <input type="text" placeholder="Label" value={tabForm.label} onChange={e => setTabForm({ ...tabForm, label: e.target.value })} />
                  <input type="text" placeholder="Redirect URL (e.g. https://google.com)" value={tabForm.url} onChange={e => setTabForm({ ...tabForm, url: e.target.value })} />
                  <input type="number" placeholder="Order" value={tabForm.order} onChange={e => setTabForm({ ...tabForm, order: e.target.value })} />
                  <button className="modern-submit-btn" onClick={() => addItem('http:REACT_APP_API_URL/api/top-tabs', tabForm, setTabForm, { label: '', order: 0, url: '' }, editingTabId, setEditingTabId)}>
                    {editingTabId ? 'Update Tab' : 'Add Tab'}
                  </button>
                  {editingTabId && (
                    <button className="modern-submit-btn" style={{ background: '#6b7280', marginTop: '5px' }} onClick={() => { setEditingTabId(null); setTabForm({ label: '', order: 0, url: '' }); }}>Cancel Edit</button>
                  )}
                </div>
              </div>
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
                        <button className="modern-edit-btn" onClick={() => startEditTab(t)} style={{ marginRight: '8px', background: '#3b82f6', color: 'white', border: 'none', padding: '8px 14px', borderRadius: '6px', cursor: 'pointer' }}>Edit</button>
                        <button className="modern-delete-btn" onClick={() => deleteItem('http:REACT_APP_API_URL/api/top-tabs', t._id)}>Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Sidebar Menu Tab */}
          {activeTab === 'sidebarMenus' && (
            <div className="admin-panel-grid">
              <div className="admin-card form-card">
                <h3>Add Sidebar Menu</h3>
                <div className="modern-form">
                  <input type="text" placeholder="Label (Leave empty for blank)" value={menuForm.label} onChange={e => setMenuForm({ ...menuForm, label: e.target.value })} />
                  <input type="number" placeholder="Order" value={menuForm.order} onChange={e => setMenuForm({ ...menuForm, order: e.target.value })} />
                  <label className="modern-checkbox">
                    <input type="checkbox" checked={menuForm.isActive} onChange={e => setMenuForm({ ...menuForm, isActive: e.target.checked })} />
                    <span>Is Active?</span>
                  </label>
                  <button className="modern-submit-btn" onClick={() => addItem('http:REACT_APP_API_URL/api/sidebar-menus', menuForm, setMenuForm, { label: '', isActive: false, order: 0 })}>Add Menu</button>
                </div>
              </div>
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
                      <span className="item-name">{m.label || '(Empty Block)'} {m.isActive && '★'}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Banners Tab */}
          {activeTab === 'banners' && (
            <div className="admin-panel-grid">
              <div className="admin-card form-card">
                <h3>Add Banner</h3>
                <div className="modern-form">
                  <div className="file-upload-wrapper">
                    <input type="file" accept="image/*" onChange={e => setBannerForm({ ...bannerForm, imgFile: e.target.files[0] })} />
                  </div>
                  <input type="text" placeholder="Fallback Icon (e.g. ✈️)" value={bannerForm.fallbackIcon} onChange={e => setBannerForm({ ...bannerForm, fallbackIcon: e.target.value })} />
                  <input type="text" placeholder="Fallback Person (e.g. 🧍)" value={bannerForm.fallbackPerson} onChange={e => setBannerForm({ ...bannerForm, fallbackPerson: e.target.value })} />
                  <button className="modern-submit-btn" onClick={addBanner}>Add Banner</button>
                </div>
              </div>
              <div className="admin-card list-card">
                <h3>Existing Banners</h3>
                <div className="modern-list">
                  {banners.map(b => (
                    <div className="list-item" key={b._id}>
                      <img src={b.img} alt="" className="item-thumb large" />
                      <button className="modern-delete-btn" onClick={() => deleteItem('http:REACT_APP_API_URL/api/banners', b._id)}>Delete</button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* News Images Tab */}
          {activeTab === 'newsImages' && (
            <div className="admin-panel-grid">
              <div className="admin-card form-card">
                <h3>Add Login News Image</h3>
                <div className="modern-form">
                  <div className="file-upload-wrapper">
                    <input type="file" accept="image/*" onChange={e => setNewsImageForm({ imgFile: e.target.files[0] })} />
                  </div>
                  <button className="modern-submit-btn" onClick={addNewsImage}>Upload Image</button>
                </div>
              </div>
              <div className="admin-card list-card">
                <h3>Existing News Images</h3>
                <div className="modern-list">
                  {newsImages.map(n => (
                    <div className="list-item" key={n._id}>
                      <img src={n.img} alt="" className="item-thumb portrait" />
                      <button className="modern-delete-btn" onClick={() => deleteItem('http:REACT_APP_API_URL/api/news-images', n._id)}>Delete</button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Wallet Requests Tab */}
          {activeTab === 'walletRequests' && (
            <div className="admin-panel-grid">
              <div className="admin-card form-card">
                <h3>UPI Scanner Config</h3>
                <div className="modern-form">
                  <input type="text" placeholder="UPI ID (e.g. mbmitra@upi)" value={upiForm.upiId} onChange={e => setUpiForm({ ...upiForm, upiId: e.target.value })} />
                  <div className="file-upload-wrapper">
                    <input type="file" accept="image/*" onChange={e => setUpiForm({ ...upiForm, qrCodeImgFile: e.target.files[0] })} />
                  </div>
                  {upiConfig?.qrCodeImg && <img src={upiConfig.qrCodeImg} alt="Current QR" style={{ width: '100px', borderRadius: '8px', border: '2px solid #ccc' }} />}
                  <button className="modern-submit-btn" onClick={updateUpiConfig}>Update UPI Config</button>
                </div>
              </div>
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
                              <strong>{req.userId}</strong><br />
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
                              {req.status === 'Pending' && (
                                <div style={{ display: 'flex', gap: '8px' }}>
                                  <button className="modern-submit-btn" style={{ padding: '6px 12px', background: '#22c55e', fontSize: '13px', margin: 0 }} onClick={() => updateRequisition(req._id, 'Approved', req.amount)}>Approve</button>
                                  <button className="modern-delete-btn" style={{ padding: '6px 12px', background: '#ef4444', fontSize: '13px', margin: 0 }} onClick={() => updateRequisition(req._id, 'Rejected', 0)}>Reject</button>
                                </div>
                              )}
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

          {/* User Management Tab */}
          {activeTab === 'users' && (
            <div className="admin-panel-grid">
              <div className="admin-card form-card">
                <h3>Create New User</h3>
                <form className="modern-form" autoComplete="off" onSubmit={(e) => e.preventDefault()}>
                  <input type="text" placeholder="User ID (e.g. MBM000012)" value={userForm.userId} onChange={e => setUserForm({ ...userForm, userId: e.target.value })} autoComplete="off" />
                  <input type="email" placeholder="Email Address" value={userForm.email} onChange={e => setUserForm({ ...userForm, email: e.target.value })} autoComplete="off" />
                  <input type="text" placeholder="Mobile Number (10 digits)" value={userForm.mobile} onChange={e => setUserForm({ ...userForm, mobile: e.target.value })} autoComplete="off" />
                  <button type="button" className="modern-submit-btn" onClick={addUser}>Create User</button>
                </form>
              </div>
              <div className="admin-card list-card" style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '2px solid #f3f4f6', paddingBottom: '10px' }}>
                  <h3 style={{ margin: 0, border: 'none', padding: 0 }}>Existing Users</h3>
                  <input
                    type="text"
                    placeholder="Search by ID or Mobile..."
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', outline: 'none', width: '200px' }}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '15px', overflowY: 'auto', maxHeight: '550px', paddingRight: '10px' }}>
                  {users.filter(u => u.userId.toLowerCase().includes(userSearch.toLowerCase()) || (u.mobile && u.mobile.includes(userSearch))).map(u => (
                    <div className="list-item" key={u._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <strong style={{ fontSize: '16px', color: '#1e293b' }}>👤 {u.userId}</strong>
                        <span style={{ fontSize: '13px', color: '#64748b' }}>📱 {u.mobile || 'No Mobile'}</span>
                      </div>
                      <button className="modern-delete-btn" onClick={() => deleteItem('http:REACT_APP_API_URL/api/users', u._id)} style={{ padding: '8px 12px', borderRadius: '8px' }}>Remove</button>
                    </div>
                  ))}
                  {users.length === 0 && <p style={{ color: '#888', padding: '20px' }}>No users found.</p>}
                </div>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
};

export default AdminPanel;
