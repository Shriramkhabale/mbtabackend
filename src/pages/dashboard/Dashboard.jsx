import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Swal from 'sweetalert2';
import './Dashboard.css';
import logoImg from '../../assets/logo.png';
import WalletModal from '../wallet/WalletModal';
import LedgerView from '../ledger/LedgerView';
import PanCardView from '../pancard/PanCardView';
import QuickLinksView from '../quicklinks/QuickLinksView';
import OfflineWorkView from '../offlinework/OfflineWorkView';
import ToolsView from '../tools/ToolsView';
import CrmView from '../crm/CrmView';
import NotificationBell from '../../context/NotificationBell';
import { API_URL } from '../../utils/apiClient';
import { DYNAMIC_LINK_MENUS, findDynamicMenu, getDynamicMenuForSidebarItem } from '../../utils/dynamicLinkMenus';
import { hasUserAccess, getStoredUserPermissions, getPanTabPermissionKey } from '../../utils/userPermissions';

// eslint-disable-next-line no-unused-vars
const Toast = Swal.mixin({
  toast: true,
  position: 'top-end',
  showConfirmButton: false,
  timer: 5000,
  timerProgressBar: true
});

const getMenuIcon = (label, url) => {
  if (!label && !url) return null;
  const dyn = (url ? findDynamicMenu(url) : null) || findDynamicMenu(label);
  if (dyn) {
    let colorClass = 'icon-teal';
    if (dyn.key === 'servicesLink') colorClass = 'icon-orange';
    else if (dyn.key === 'jobLinks') colorClass = 'icon-blue';
    else if (dyn.key === 'admitCard') colorClass = 'icon-purple';
    else if (dyn.key === 'formLinks') colorClass = 'icon-teal';
    else if (dyn.key === 'vedioLink') colorClass = 'icon-orange';
    else if (dyn.key === 'trainingLinks') colorClass = 'icon-blue';
    else if (dyn.key === 'productLinks') colorClass = 'icon-amber';
    else if (dyn.key === 'govtLinks') colorClass = 'icon-purple';
    else if (dyn.key === 'print') colorClass = 'icon-slate';
    else if (dyn.key === 'schorshipLinks') colorClass = 'icon-teal';
    return <span className={`icon-badge ${colorClass}`}>{dyn.icon}</span>;
  }
  const l = label.toLowerCase();
  if (l.includes('dash')) return <span className="icon-badge icon-orange">📊</span>;
  if (l.includes('adhar') || l.includes('aadhaar')) return <span className="icon-badge icon-purple">ID</span>;
  if (l.includes('pan')) return <span className="icon-badge icon-amber">💳</span>;
  if (l.includes('report') || l.includes('history')) return <span className="icon-badge icon-blue">📑</span>;
  if (l.includes('link') || l.includes('quick')) return <span className="icon-badge icon-teal">🔗</span>;
  if (l.includes('user') || l.includes('profile')) return <span className="icon-badge icon-teal">👤</span>;
  if (l.includes('setting')) return <span className="icon-badge icon-slate">⚙️</span>;
  if (l.includes('verify') || l.includes('verification')) return <span className="icon-badge icon-teal">✓</span>;
  if (l.includes('pdf')) return <span className="icon-badge icon-orange">📄</span>;
  if (l.includes('offline') || l.includes('work')) return <span className="icon-badge icon-blue">📁</span>;
  if (l.includes('crm')) return <span className="icon-badge icon-purple">👥</span>;
  return <span className="icon-badge icon-orange">⚡</span>;
};

const getTabIcon = (label) => {
  if (!label) return null;
  const l = label.toLowerCase();
  if (l.includes('wallet point') || (l.includes('wallet') && !l.includes('ledger'))) return <span className="tab-icon">💼</span>;
  if (l.includes('ledger') || l.includes('report')) return <span className="tab-icon">📒</span>;
  if (l.includes('dmt') || l.includes('transfer') || l.includes('money')) return <span className="tab-icon">💸</span>;
  if (l.includes('hotel')) return <span className="tab-icon">🏨</span>;
  if (l.includes('recharge') || l.includes('bill')) return <span className="tab-icon">📱</span>;
  if (l.includes('travel') || l.includes('flight') || l.includes('bus') || l.includes('train')) return <span className="tab-icon">✈️</span>;
  if (l.includes('aeps') || l.includes('withdraw')) return <span className="tab-icon">🏧</span>;
  if (l.includes('insurance')) return <span className="tab-icon">🛡️</span>;
  return <span className="tab-icon">🚀</span>;
};

const AccessRestrictedNotice = ({ title = 'Service', onBack }) => (
  <div style={{
    padding: '60px 24px',
    textAlign: 'center',
    background: '#ffffff',
    borderRadius: '18px',
    margin: '30px auto',
    maxWidth: '520px',
    boxShadow: '0 8px 30px rgba(0,0,0,0.06)',
    border: '1.5px solid #fed7aa'
  }}>
    <div style={{ fontSize: '50px', marginBottom: '14px' }}>🔒</div>
    <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#9a3412', marginBottom: '8px' }}>
      Access Restricted
    </h2>
    <p style={{ color: '#64748b', fontSize: '14px', lineHeight: '1.6', margin: '0 auto 22px' }}>
      You do not have permission to access <strong>{title}</strong>. If you need access to this service, please contact your administrator.
    </p>
    {onBack && (
      <button
        type="button"
        onClick={onBack}
        style={{
          padding: '10px 24px',
          borderRadius: '10px',
          background: 'linear-gradient(135deg, #ea580c, #c2410c)',
          color: '#ffffff',
          border: 'none',
          fontWeight: 800,
          cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(234, 88, 12, 0.25)'
        }}
      >
        ← Go to Dashboard
      </button>
    )}
  </div>
);

const Dashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const isLedgerRoute = location.pathname === '/ledger';
  const isWalletRoute = location.pathname === '/wallet';
  const isPanCardRoute = location.pathname === '/pancard' || location.pathname === '/pan-card';
  const isQuickLinksRoute = location.pathname === '/quick-links' || location.pathname === '/view-links';
  const isOfflineWorkRoute = location.pathname === '/offline-work' || location.pathname === '/offlinework';
  const isToolsRoute = location.pathname.toLowerCase() === '/tools';
  const isCrmRoute = location.pathname.toLowerCase() === '/crm' || location.pathname.toLowerCase().startsWith('/crm');

  const [userPermissions, setUserPermissions] = useState(getStoredUserPermissions);

  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('appTheme') || 'light';
  });

  const [actionCardsData, setActionCardsData] = useState([]);
  const [topTabsData, setTopTabsData] = useState([]);
  const [sidebarMenuData, setSidebarMenuData] = useState([]);
  const [bannersData, setBannersData] = useState([]);
  const [activeMenuId, setActiveMenuId] = useState(null);
  const [activeTabId, setActiveTabId] = useState(null);

  const activeDynLinkMenu = React.useMemo(() => {
    const std = findDynamicMenu(location.pathname);
    if (std) return std;
    const customMatch = (sidebarMenuData || []).find(m => {
      if (!m.url || !m.url.startsWith('/')) return false;
      const lowerUrl = (m.url || '').toLowerCase();
      const lowerLabel = (m.label || '').toLowerCase();
      if (lowerUrl.includes('offline') || lowerLabel.includes('offline') || lowerUrl.includes('pan') || lowerLabel.includes('pan') || lowerUrl.includes('tool') || lowerLabel.includes('tool') || lowerUrl.includes('crm') || lowerLabel.includes('crm')) {
        return false;
      }
      const cleanPath = location.pathname.toLowerCase().replace(/\/+$/, '');
      const cleanUrl = m.url.toLowerCase().replace(/\/+$/, '');
      return cleanPath === cleanUrl;
    });
    if (customMatch) {
      const customKey = customMatch.url.replace(/^\/+/, '').replace(/[^a-zA-Z0-9]/g, '');
      return {
        key: customKey,
        label: customMatch.label,
        icon: '🌐',
        route: customMatch.url
      };
    }
    return null;
  }, [location.pathname, sidebarMenuData]);
  const isDynLinkMenuRoute = Boolean(activeDynLinkMenu);
  const isStandaloneRoute = isLedgerRoute || isWalletRoute || isPanCardRoute || isQuickLinksRoute || isDynLinkMenuRoute || isOfflineWorkRoute || isToolsRoute || isCrmRoute;
  const [activeCardId, setActiveCardId] = useState(null);
  const [activeBannerId, setActiveBannerId] = useState(null);

  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showWallet, setShowWallet] = useState(false);
  const [walletTab, setWalletTab] = useState('directPayment');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Sync /wallet URL route with showWallet modal state
  useEffect(() => {
    if (location.pathname === '/wallet') {
      setShowWallet(true);
    } else {
      setShowWallet(false);
    }
  }, [location.pathname]);



  const [walletBalance, setWalletBalance] = useState(0);
  const [retailerName, setRetailerName] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('user') || '{}');
      return stored.fullName || stored.name || stored.shopName || '';
    } catch {
      return '';
    }
  });
  const [showBalance, setShowBalance] = useState(() => {
    return localStorage.getItem('showWalletBalance') === 'true';
  });
  const [marqueeText, setMarqueeText] = useState('WELCOME TO MB MITRA');

  useEffect(() => {
    fetch(`${API_URL}/api/site-settings/dashboard_marquee`)
      .then(res => res.json())
      .then(data => {
        if (data && data.success && data.value) {
          setMarqueeText(data.value);
        }
      })
      .catch(() => { });
  }, []);

  const toggleShowBalance = () => {
    setShowBalance(prev => {
      const nextState = !prev;
      localStorage.setItem('showWalletBalance', String(nextState));
      return nextState;
    });
  };



  useEffect(() => {
    // Fetch Action Cards
    fetch(`${API_URL}/api/action-cards`)
      .then(res => res.json())
      .then(data => {
        setActionCardsData(data);
        if (data.length > 0) setActiveCardId(data[0]._id || data[0].id);
      })
      .catch(err => console.error('Error fetching action-cards:', err));

    // Fetch Top Tabs
    fetch(`${API_URL}/api/top-tabs`)
      .then(res => res.json())
      .then(data => {
        let tabs = Array.isArray(data) ? [...data] : [];
        if (!tabs.some(t => t.label && t.label.toLowerCase().includes('wallet point'))) {
          tabs.unshift({ _id: 'tab_wallet_points', label: 'Wallet Points' });
        }
        if (!tabs.some(t => t.label && t.label.toLowerCase().includes('ledger'))) {
          const insertIdx = tabs.findIndex(t => t.label && t.label.toLowerCase().includes('wallet point')) + 1;
          tabs.splice(insertIdx > 0 ? insertIdx : 1, 0, { _id: 'tab_wallet_ledger', label: 'Wallet Ledger' });
        }
        setTopTabsData(tabs);
        if (tabs.length > 0) setActiveTabId(tabs[0]._id || tabs[0].id);
      })
      .catch(err => console.error('Error fetching top-tabs:', err));

    // Fetch Sidebar Menus
    fetch(`${API_URL}/api/sidebar-menus`)
      .then(res => res.json())
      .then(data => {
        let menus = Array.isArray(data) ? data.filter(m => {
          if (!m.label) return true;
          const l = m.label.toLowerCase();
          return !l.includes('wallet') && !l.includes('ledger') && !l.includes('report');
        }) : [];

        // Ensure Quick Links is present in the sidebar
        const hasQuick = menus.some(m => {
          if (!m.label) return false;
          const matched = getDynamicMenuForSidebarItem(m);
          if (matched) return false;
          const l = m.label.toLowerCase();
          const u = (m.url || '').toLowerCase();
          return l.includes('quick') || l === 'view links' || u === '/quick-links' || u === '/view-links';
        });

        if (!hasQuick) {
          const panIdx = menus.findIndex(m => m.label && m.label.toLowerCase().includes('pan'));
          const quickMenuItem = { _id: 'menu_quick_links', label: 'QUICK LINKS', url: '/quick-links', isActive: false, dynamicActive: true };
          if (panIdx >= 0) {
            menus.splice(panIdx + 1, 0, quickMenuItem);
          } else {
            menus.push(quickMenuItem);
          }
        }

        // Ensure CRM menu is present in sidebar
        const hasCrm = menus.some(m => {
          if (!m.label) return false;
          const l = m.label.toLowerCase();
          const u = (m.url || '').toLowerCase();
          return l.includes('crm') || u === '/crm';
        });
        if (!hasCrm) {
          menus.push({ _id: 'menu_crm_item', label: 'CRM', url: '/crm', isActive: true, dynamicActive: true });
        }

        // Ensure all 10 standard dynamic link menus are present (without duplicating)
        DYNAMIC_LINK_MENUS.forEach(dyn => {
          const exists = menus.some(m => {
            const matched = getDynamicMenuForSidebarItem(m);
            return matched && matched.key === dyn.key;
          });
          if (!exists) {
            menus.push({
              _id: `dyn_menu_${dyn.key}`,
              label: dyn.label,
              url: dyn.route,
              isActive: false,
              dynamicActive: true
            });
          }
        });

        // Identify any custom dynamic menus in database (items with route starting with / and not Pan/Dash/Quick)
        const customDynMenus = [];
        menus.forEach(m => {
          if (!m.label) return;
          const matchedStandard = getDynamicMenuForSidebarItem(m);
          if (matchedStandard) return;
          const l = m.label.toLowerCase();
          const u = (m.url || '').toLowerCase();
          const isPan = l.includes('pan');
          const isDash = l.includes('dash');
          const isTools = l.includes('tool');
          const isQuick = l.includes('quick') || l === 'view links' || u === '/quick-links' || u === '/view-links';
          if (!isPan && !isDash && !isQuick && !isTools && (m.url && m.url.startsWith('/'))) {
            const customKey = m.url.replace(/^\/+/, '').replace(/[^a-zA-Z0-9]/g, '');
            customDynMenus.push({
              key: customKey,
              label: m.label,
              icon: '🌐',
              route: m.url
            });
          }
        });

        // Deduplicate any menus that match standard or custom dynamic menus or quick links
        const seenKeys = new Set();
        const dedupedMenus = [];
        menus.forEach(m => {
          const matchedDyn = getDynamicMenuForSidebarItem(m, customDynMenus);
          if (matchedDyn) {
            if (!seenKeys.has(matchedDyn.key)) {
              seenKeys.add(matchedDyn.key);
              dedupedMenus.push({
                ...m,
                label: (m.label && m.label.trim()) ? m.label.trim() : matchedDyn.label,
                url: matchedDyn.route,
                isActive: m.isActive !== undefined ? Boolean(m.isActive) : true,
                dynamicActive: m.dynamicActive !== undefined ? Boolean(m.dynamicActive) : true
              });
            }
          } else {
            const l = (m.label || '').toLowerCase();
            const u = (m.url || '').toLowerCase();
            const isQuickItem = l.includes('quick') || l === 'view links' || u === '/quick-links' || u === '/view-links';
            if (isQuickItem) {
              if (!seenKeys.has('quickLinks')) {
                seenKeys.add('quickLinks');
                dedupedMenus.push({
                  ...m,
                  label: (m.label && m.label.trim()) ? m.label.trim() : 'QUICK LINKS',
                  url: '/quick-links',
                  isActive: m.isActive !== undefined ? Boolean(m.isActive) : true,
                  dynamicActive: m.dynamicActive !== undefined ? Boolean(m.dynamicActive) : true
                });
              }
            } else {
              dedupedMenus.push({
                ...m,
                dynamicActive: m.dynamicActive !== undefined ? Boolean(m.dynamicActive) : true
              });
            }
          }
        });

        setSidebarMenuData(dedupedMenus);
        const activeItem = dedupedMenus.find(m => m.isActive) || dedupedMenus[0];
        if (activeItem) {
          setActiveMenuId(activeItem._id || activeItem.id);
        }
      })
      .catch(err => console.error('Error fetching sidebar-menus:', err));

    // Fetch Banners
    fetch(`${API_URL}/api/banners`)
      .then(res => res.json())
      .then(data => {
        setBannersData(data);
        if (data.length > 0) setActiveBannerId(data[0]._id || data[0].id);
      })
      .catch(err => console.error('Error fetching banners:', err));



    // Fetch Global Search Links (Quick Links & PAN tabs)
    fetch(`${API_URL}/api/quick-links`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setQuickLinksData(data);
      })
      .catch(() => { });

    fetch(`${API_URL}/api/pancard/tabs`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setPanTabsData(data);
      })
      .catch(() => { });

    fetch(`${API_URL}/api/offline-work/tabs`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setOfflineTabsData(data);
      })
      .catch(() => { });

    // Setup an interval to periodically fetch wallet balance
    const currentUser = localStorage.getItem('currentUser');
    if (currentUser) {
      const fetchWalletBalance = () => {
        fetch(`${API_URL}/api/users/${currentUser}`)
          .then(res => res.json())
          .then(data => {
            if (data.walletBalance !== undefined) {
              setWalletBalance(data.walletBalance);
            }
            if (data.name) {
              setRetailerName(data.name);
            } else if (data.shopName) {
              setRetailerName(data.shopName);
            }
            if (Array.isArray(data.permissions)) {
              setUserPermissions(prev => {
                if (JSON.stringify(prev) === JSON.stringify(data.permissions)) return prev;
                return data.permissions;
              });
              localStorage.setItem('userPermissions', JSON.stringify(data.permissions));
            }
            if (data.role) {
              localStorage.setItem('userRole', data.role);
            }
          })
          .catch(err => console.error(err));
      };

      fetchWalletBalance(); // Initial fetch
      const interval = setInterval(fetchWalletBalance, 5000); // Poll every 5 seconds
      return () => clearInterval(interval);
    }
  }, []);

  // Global search state & refs
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [quickLinksData, setQuickLinksData] = useState([]);
  const [panTabsData, setPanTabsData] = useState([]);
  const [offlineTabsData, setOfflineTabsData] = useState([]);
  const searchContainerRef = useRef(null);
  const searchInputRef = useRef(null);

  // Focus input on expand & auto close on click outside
  useEffect(() => {
    if (isSearchExpanded && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isSearchExpanded]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target)) {
        setIsSearchExpanded(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Compute all searchable platform services
  const allSearchableServices = [
    // Top Tabs
    ...(topTabsData || []).map(tab => ({
      id: `tab_${tab._id || tab.id || tab.label}`,
      title: tab.label,
      category: 'Top Tab',
      icon: '🚀',
      action: () => {
        const l = (tab.label || '').toLowerCase();
        if (l.includes('wallet point')) {
          setWalletTab('directPayment');
          navigate('/wallet');
        } else if (l.includes('ledger') || l.includes('report')) {
          navigate('/ledger');
        } else {
          setActiveTabId(tab._id || tab.id);
          navigate('/dashboard');
        }
      }
    })),
    // Action Cards
    ...(actionCardsData || []).map(card => ({
      id: `card_${card._id || card.id || card.title}`,
      title: card.title || card.label,
      subtitle: card.category || card.desc,
      category: 'Action Service',
      icon: card.icon || '⚡',
      action: () => {
        if (card.url && card.url.startsWith('http')) {
          window.open(card.url, '_blank');
        } else if (card.url) {
          navigate(card.url);
        } else {
          setActiveCardId(card._id || card.id);
          navigate('/dashboard');
        }
      }
    })),
    // Sidebar Menus (including PAN, Dynamic links, Quick Links)
    ...(sidebarMenuData || []).map(menu => ({
      id: `menu_${menu._id || menu.id || menu.label}`,
      title: menu.label,
      category: 'Menu / Portal',
      icon: '📂',
      action: () => {
        if (menu.url) {
          navigate(menu.url);
        } else {
          setActiveMenuId(menu._id || menu.id);
          navigate('/dashboard');
        }
      }
    })),
    // Dynamic Menus direct entries
    ...DYNAMIC_LINK_MENUS
      .filter(dyn => hasUserAccess(userPermissions, `dyn.${dyn.key}`))
      .map(dyn => ({
        id: `dyn_${dyn.key}`,
        title: dyn.label,
        category: 'Service Category',
        icon: dyn.icon || '🔗',
        action: () => navigate(dyn.route)
      })),
    // PAN Card Services (Dynamic & Standard)
    ...(panTabsData.length > 0 ? panTabsData : [
      { id: 'find_pan_aadhaar', label: 'Find My PAN', icon: '🔍', description: 'Aadhaar to PAN lookup' },
      { id: 'epan_kyc', label: 'E-Pan Kyc', icon: '📲', description: 'Paperless E-Pan Kyc service' },
      { id: 'epan_correction_otp', label: 'E-Pan Correction', icon: '⚡', description: 'Paperless E-Pan Correction OTP Base' },
      { id: 'epan_sign_photo', label: 'EPan (Sign&Photo)', icon: '📸', description: 'Paperless E-Pan Photo & Sign upload' },
      { id: 'epan_correction_sign_photo', label: 'EPan Correction (Sign&Photo)', icon: '🖋️', description: 'Correction with signature & photo' },
      { id: 'manual_new_pan', label: 'Manual New PAN', icon: '📝', description: 'Manual Form 49A application' },
      { id: 'manual_pan_correction', label: 'Manual PAN Correction', icon: '📑', description: 'Manual Form CSF Correction' },
      { id: 'stamp_signature_merger', label: 'Crop Photo / Signature', icon: '✂️', description: 'Crop & Stamp Signature Merger Tool' },
      { id: 'history', label: 'PAN Application History', icon: '📋', description: 'Track submitted PAN applications' }
    ])
      .filter(pan => hasUserAccess(userPermissions, getPanTabPermissionKey(pan.id)))
      .map(pan => ({
        id: `pan_${pan.id || pan._id}`,
        title: pan.label || pan.title,
        subtitle: pan.description || pan.badge || 'PAN Card Service',
        category: 'PAN Card',
        icon: pan.icon || '💳',
        action: () => navigate(`/pancard?tab=${pan.id}`)
      })),
    // Quick Links & Dynamic Service Links
    ...(quickLinksData || []).map(link => ({
      id: `link_${link._id || link.id || link.title}`,
      title: link.title,
      subtitle: link.category ? `${link.category} • ${link.fee ? '₹' + link.fee : 'Free'}` : (link.fee ? '₹' + link.fee : 'Free'),
      category: link.menuKey ? 'Service Link' : 'Quick Link',
      icon: '🔗',
      action: () => {
        if (link.url) {
          window.open(link.url, '_blank', 'noopener,noreferrer');
        }
      }
    })),
    // Offline Work Services (Dynamic)
    ...(offlineTabsData || []).map(off => ({
      id: `offline_${off.id || off._id}`,
      title: off.label || off.title,
      subtitle: off.description || off.badge || 'Offline Work Service',
      category: 'Offline Work',
      icon: off.icon || '📁',
      action: () => navigate('/offline-work')
    }))
  ];

  // Filter matching services deduplicated by title and category
  const filteredServices = searchQuery.trim() === '' ? [] : allSearchableServices.filter((item, idx, self) => {
    const q = searchQuery.toLowerCase().trim();
    const titleMatch = item.title && item.title.toLowerCase().includes(q);
    const subMatch = item.subtitle && item.subtitle.toLowerCase().includes(q);
    const catMatch = item.category && item.category.toLowerCase().includes(q);
    const matches = titleMatch || subMatch || catMatch;
    if (!matches) return false;
    return idx === self.findIndex(t => (t.title || '').trim().toLowerCase() === (item.title || '').trim().toLowerCase());
  }).slice(0, 15); // Show top 15 matches

  return (
    <div className={`dashboard-container-new theme-${theme}`}>
      {/* Ambient Glowing Orbs */}
      <div className="ambient-orb orb-1"></div>
      <div className="ambient-orb orb-2"></div>
      <div className="ambient-orb orb-3"></div>

      {/* Top Header Bar */}
      <div className="dash-top-title">
        <div className="header-left-group" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            className="mobile-hamburger-btn"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label="Toggle Mobile Navigation"
          >
            {isMobileMenuOpen ? '✕' : '☰'}
          </button>
          <div className="header-brand-logo" onClick={() => { setIsMobileMenuOpen(false); navigate('/dashboard'); }} style={{ cursor: 'pointer' }}>
            <div className="header-logo-badge-round">
              <img src={logoImg} alt="MB MITRA" className="header-logo-img" onError={(e) => e.target.style.display = 'none'} />
            </div>
            <span className="brand-gold-text">MITRA</span>
          </div>
        </div>

        <div className="title-marquee-wrapper">
          <div className="title-marquee-text">
            {marqueeText || 'WELCOME TO MB MITRA'}
          </div>
        </div>

        <div className="header-right-controls">
          {/* Expandable Global Search */}
          <div className="global-header-search" ref={searchContainerRef}>
            <div className={`search-expand-wrapper ${isSearchExpanded ? 'expanded' : ''}`}>
              <button
                type="button"
                className="search-toggle-btn"
                onClick={() => {
                  setIsSearchExpanded(!isSearchExpanded);
                  if (isSearchExpanded) setSearchQuery('');
                }}
                title={isSearchExpanded ? 'Close search' : 'Search all services, forms, links...'}
                aria-label="Search services"
              >
                🔍
              </button>
              {isSearchExpanded && (
                <div className="search-input-field-wrap">
                  <input
                    ref={searchInputRef}
                    type="text"
                    className="search-expand-input"
                    placeholder="Search all services, forms, tabs..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setIsSearchExpanded(false);
                        setSearchQuery('');
                      }
                    }}
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      className="search-clear-btn"
                      onClick={() => setSearchQuery('')}
                      title="Clear search"
                    >
                      ✕
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Global Search Results Dropdown */}
            {isSearchExpanded && searchQuery.trim() !== '' && (
              <div className="global-search-results-dropdown">
                <div className="search-results-header">
                  <span>Found {filteredServices.length} result{filteredServices.length === 1 ? '' : 's'}</span>
                  <span className="search-results-hint">Click item to open</span>
                </div>
                {filteredServices.length === 0 ? (
                  <div className="search-no-results">
                    <span className="search-no-results-icon">🔍</span>
                    <span>No service found matching &quot;{searchQuery}&quot;</span>
                  </div>
                ) : (
                  <div className="search-results-list">
                    {filteredServices.map(item => (
                      <div
                        key={item.id}
                        className="search-result-item"
                        onClick={() => {
                          setIsSearchExpanded(false);
                          setSearchQuery('');
                          item.action();
                        }}
                      >
                        <span className="search-result-icon">{item.icon}</span>
                        <div className="search-result-info">
                          <div className="search-result-title">{item.title}</div>
                          {item.subtitle && <div className="search-result-subtitle">{item.subtitle}</div>}
                        </div>
                        <span className="search-result-tag">{item.category}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <NotificationBell dark={theme === 'dark'} />
          {hasUserAccess(userPermissions, 'walletModule') && hasUserAccess(userPermissions, 'wallet.balance') && (
            <div
              className="top-wallet-box"
              onClick={() => { setWalletTab('directPayment'); navigate('/wallet'); }}
              title="Click to view My Wallet & Load Wallet Requisition"
            >
              <span className="wallet-icon">💼</span>
              <span className="wallet-label-text">Wallet Balance:</span>
              <span className="wallet-amount-text">
                {showBalance ? `₹ ${parseFloat(walletBalance).toFixed(2)}` : '₹ •••••'}
              </span>
            </div>
          )}

          <button
            className="top-profile-btn"
            onClick={() => setShowProfileMenu(!showProfileMenu)}
          >
            <span className="profile-avatar-icon">👤</span>
            <span>{localStorage.getItem('currentUser') || 'My Profile'}</span>
            <span className="dropdown-caret">▼</span>
          </button>

          {showProfileMenu && (
            <div className="profile-dropdown-card">
              {hasUserAccess(userPermissions, 'walletModule') && hasUserAccess(userPermissions, 'wallet.balance') ? (
                <div className="dropdown-user-info">
                  {retailerName && (
                    <div style={{ padding: '4px 0 8px', fontSize: '13px', fontWeight: 700, color: '#ea580c' }}>
                      👤 {retailerName}
                    </div>
                  )}
                  <div className="user-info-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="user-info-label">Wallet Balance</span>
                    <span
                      style={{ cursor: 'pointer', fontSize: '15px' }}
                      onClick={toggleShowBalance}
                      title={showBalance ? "Hide Balance" : "Show Balance"}
                    >
                      {showBalance ? '🔒' : '👁️'}
                    </span>
                  </div>
                  <div className="user-info-amount">
                    {showBalance ? `₹ ${parseFloat(walletBalance).toFixed(2)}` : '₹ •••••'}
                  </div>
                </div>
              ) : retailerName ? (
                <div className="dropdown-user-info" style={{ paddingBottom: '8px' }}>
                  <div style={{ padding: '4px 0', fontSize: '13px', fontWeight: 700, color: '#ea580c' }}>
                    👤 {retailerName}
                  </div>
                </div>
              ) : null}
              {(hasUserAccess(userPermissions, 'walletModule') || hasUserAccess(userPermissions, 'ledgerModule') || hasUserAccess(userPermissions, 'ledger.view')) && (
                <div className="dropdown-divider"></div>
              )}
              {hasUserAccess(userPermissions, 'walletModule') && (
                <button
                  className="dropdown-action-item"
                  onClick={() => { setWalletTab('directPayment'); setShowProfileMenu(false); navigate('/wallet'); }}
                >
                  💼 Load Wallet / Request
                </button>
              )}
              {(hasUserAccess(userPermissions, 'ledgerModule') || hasUserAccess(userPermissions, 'ledger.view')) && (
                <button
                  className="dropdown-action-item"
                  onClick={() => { setShowProfileMenu(false); navigate('/ledger'); }}
                >
                  📒 Ledger
                </button>
              )}
              <div className="dropdown-divider"></div>
              <div className="dropdown-theme-section">
                <div style={{ padding: '4px 20px', fontSize: '11px', fontWeight: 800, color: theme === 'light' ? '#ea580c' : '#fb923c', letterSpacing: '0.5px' }}>THEME OPTIONS</div>
                <div className="theme-options-row">
                  <button
                    type="button"
                    className={`theme-option-btn ${theme === 'light' ? 'active' : ''}`}
                    onClick={() => { setTheme('light'); localStorage.setItem('appTheme', 'light'); }}
                  >
                    ☀️ White
                  </button>
                  <button
                    type="button"
                    className={`theme-option-btn ${theme === 'dark' ? 'active' : ''}`}
                    onClick={() => { setTheme('dark'); localStorage.setItem('appTheme', 'dark'); }}
                  >
                    🌙 Black
                  </button>
                </div>
              </div>
              <div className="dropdown-divider"></div>
              <button
                className="dropdown-action-item logout-btn"
                onClick={() => {
                  localStorage.removeItem('currentUser');
                  sessionStorage.removeItem('sessionToken');
                  navigate('/');
                }}
              >
                🚪 Logout
              </button>
            </div>
          )}
        </div>
      </div>

      {/* My Wallet Modal Overlay */}
      {!isWalletRoute && (
        <WalletModal
          isOpen={showWallet}
          onClose={() => { setShowWallet(false); navigate('/dashboard'); }}
          currentUser={localStorage.getItem('currentUser')}
          initialTab={walletTab}
          walletBalance={walletBalance}
          onBalanceUpdate={(newBal) => setWalletBalance(newBal)}
          theme={theme}
          userPermissions={userPermissions}
        />
      )}

      {/* Main Layout */}
      <div className="dash-main-new">
        {/* Mobile Backdrop Overlay */}
        {isMobileMenuOpen && (
          <div
            className="sidebar-mobile-backdrop"
            onClick={() => setIsMobileMenuOpen(false)}
          />
        )}

        {/* Left Glass Sidebar */}
        <div className={`sidebar-new ${isMobileMenuOpen ? 'mobile-open' : ''}`}>
          {/* Top Subtle Amber Wave Curve */}
          <svg className="sidebar-wave-overlay" viewBox="0 0 240 160" preserveAspectRatio="none">
            <defs>
              <linearGradient id="amberWaveGrad" x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#ea580c" stopOpacity="0.9" />
                <stop offset="50%" stopColor="#c2410c" stopOpacity="0.7" />
                <stop offset="100%" stopColor="#7c2d12" stopOpacity="0.2" />
              </linearGradient>
            </defs>
            <path
              d="M -10,120 C 50,90 100,50 140,30 C 180,10 210,5 250,-5"
              fill="none"
              stroke="url(#amberWaveGrad)"
              strokeWidth="3.5"
              strokeLinecap="round"
            />
          </svg>

          <div className="sidebar-brand-section">
            <div className="sidebar-logo-wrapper">
              <div className="logo-glowing-ring"></div>
              <img src={logoImg} alt="MB MITRA" className="sidebar-logo-img" onError={(e) => e.target.style.display = 'none'} />
            </div>
            <span className="sidebar-brand-title">MB MITRA</span>
          </div>

          <div className="sidebar-divider-title">
            <span>— • SERVICES • —</span>
          </div>

          <div className="sidebar-menu-new">
            {sidebarMenuData.filter((menu) => {
              if (!menu || !menu.label) return false;
              if (menu.isActive === false) return false; // Respect ON/OFF toggle from Admin Panel
              const matchedDyn = getDynamicMenuForSidebarItem(menu) || findDynamicMenu(menu.url || menu.label);
              if (matchedDyn) return false; // Hide all dynamic links from sidebar

              const l = menu.label.toLowerCase();
              const u = (menu.url || '').toLowerCase();
              const isDash = l.includes('dash');
              const isPan = l.includes('pan');
              const isOffline = l.includes('offline');
              const isTools = l.includes('tool') || u === '/tools';
              const isQuick = l.includes('quick') || l === 'view links' || u === '/quick-links' || u === '/view-links';
              const isCrm = l.includes('crm') || u === '/crm';
              const isWallet = l.includes('wallet') || u === '/wallet';
              const isLedger = l.includes('ledger') || l.includes('report') || u === '/ledger';

              // Check user service access permissions
              if (isPan && !hasUserAccess(userPermissions, 'panCard') && !hasUserAccess(userPermissions, 'pan.access')) return false;
              if (isOffline && !hasUserAccess(userPermissions, 'offlineWork') && !hasUserAccess(userPermissions, 'offlineWork.access')) return false;
              if (isTools && !hasUserAccess(userPermissions, 'toolsModule') && !hasUserAccess(userPermissions, 'tools.view') && !hasUserAccess(userPermissions, 'tools.access')) return false;
              if (isQuick && !hasUserAccess(userPermissions, 'quickLinksModule') && !hasUserAccess(userPermissions, 'quickLinks.view') && !hasUserAccess(userPermissions, 'quicklinks.access')) return false;
              if (isCrm && !hasUserAccess(userPermissions, 'crm') && !hasUserAccess(userPermissions, 'crm.access')) return false;
              if (isWallet && !hasUserAccess(userPermissions, 'walletModule') && !hasUserAccess(userPermissions, 'wallet.balance')) return false;
              if (isLedger && !hasUserAccess(userPermissions, 'ledgerModule') && !hasUserAccess(userPermissions, 'ledger.view') && !hasUserAccess(userPermissions, 'wallet.ledger')) return false;
              if (isDash && !hasUserAccess(userPermissions, 'dashboardNavModule') && !hasUserAccess(userPermissions, 'dashboard.view')) return false;
              // Render all active menus configured in Admin Panel's Sidebar Menus
              return true;
            }).map((menu) => {
              const menuId = menu._id || menu.id;
              const isPan = menu.label && menu.label.toLowerCase().includes('pan');
              const isDash = menu.label && menu.label.toLowerCase().includes('dash');
              const isOffline = menu.label && menu.label.toLowerCase().includes('offline');
              const isTools = menu.label && menu.label.toLowerCase().includes('tool');
              const isCrm = (menu.label && menu.label.toLowerCase().includes('crm')) || menu.url === '/crm';
              const matchedDyn = getDynamicMenuForSidebarItem(menu) || findDynamicMenu(menu.url || menu.label);
              const isQuick = !matchedDyn && (
                menu.url === '/quick-links' ||
                menu.url === '/view-links' ||
                (menu.label && (menu.label.toLowerCase().includes('quick') || menu.label.toLowerCase() === 'view links'))
              );
              const isDynSelected = matchedDyn && activeDynLinkMenu && matchedDyn.key === activeDynLinkMenu.key;
              const isUrlMatched = Boolean(menu.url && menu.url.trim() !== '' && location.pathname.toLowerCase() === menu.url.trim().toLowerCase());
              const isSelected = isDynSelected ? true : (isUrlMatched ? true : (isPan ? isPanCardRoute : (isOffline ? isOfflineWorkRoute : (isTools ? isToolsRoute : (isQuick ? isQuickLinksRoute : (isCrm ? isCrmRoute : (isDash ? !isStandaloneRoute : activeMenuId === menuId)))))));

              return (
                <div
                  key={menuId}
                  className={`menu-item-new ${isSelected ? 'active' : ''} ${!menu.label ? 'empty' : ''}`}
                  onClick={() => {
                    setActiveMenuId(menuId);
                    setIsMobileMenuOpen(false);
                    if (isTools || menu.url === '/tools') {
                      navigate('/tools');
                    } else if (isCrm || menu.url === '/crm') {
                      navigate('/crm');
                    } else if (matchedDyn) {
                      navigate(matchedDyn.route);
                    } else if (isPan) {
                      navigate('/pancard');
                    } else if (isOffline) {
                      navigate('/offline-work');
                    } else if (isQuick) {
                      navigate('/quick-links');
                    } else if (menu.url && menu.url.trim() !== '') {
                      const targetUrl = menu.url.trim();
                      if (targetUrl.startsWith('http://') || targetUrl.startsWith('https://')) {
                        window.open(targetUrl, '_blank');
                      } else {
                        navigate(targetUrl);
                      }
                    } else if (isDash) {
                      navigate('/dashboard');
                    } else if (menu.label && (menu.label.toLowerCase().includes('report') || menu.label.toLowerCase().includes('ledger'))) {
                      navigate('/ledger');
                    } else if (menu.label && menu.label.toLowerCase().includes('wallet')) {
                      navigate('/wallet');
                    }
                  }}
                >
                  {getMenuIcon(menu.label, menu.url)}
                  <span className="menu-label-text">{menu.label}</span>
                  <span className="active-chevron">›</span>
                </div>
              );
            })}
          </div>

          {/* Bottom Subtle Amber Wave Stroke Lines */}
          <svg className="sidebar-bottom-wave-overlay" viewBox="0 0 240 160" preserveAspectRatio="none">
            <defs>
              <linearGradient id="amberBottomWaveGrad" x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#ea580c" stopOpacity="0.9" />
                <stop offset="50%" stopColor="#c2410c" stopOpacity="0.7" />
                <stop offset="100%" stopColor="#7c2d12" stopOpacity="0.2" />
              </linearGradient>
            </defs>
            <path
              d="M 10,160 C 70,135 140,125 245,60"
              fill="none"
              stroke="url(#amberBottomWaveGrad)"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <path
              d="M 50,160 C 100,145 150,135 245,90"
              fill="none"
              stroke="url(#amberBottomWaveGrad)"
              strokeWidth="2"
              opacity="0.6"
              strokeLinecap="round"
            />
          </svg>
        </div>

        {/* Main Content Area */}
        <div className="content-area-new">

          {/* Top Header Tabs */}
          {hasUserAccess(userPermissions, 'dashboardNavModule') && (hasUserAccess(userPermissions, 'dashboard.topTabs') || hasUserAccess(userPermissions, 'dashboard.view') || hasUserAccess(userPermissions, 'dashboard.stats') || hasUserAccess(userPermissions, 'dashboard.assignedWork') || hasUserAccess(userPermissions, 'dashboard.activitySummary')) && topTabsData.length > 0 && (() => {
            const visibleTopTabs = topTabsData.filter((tab) => {
              const label = (tab.label || '').toLowerCase();
              const url = (tab.url || '').toLowerCase();
              if (label.includes('wallet point') && !hasUserAccess(userPermissions, 'wallet.points') && !hasUserAccess(userPermissions, 'walletModule')) return false;
              if (label.includes('add amount') && !hasUserAccess(userPermissions, 'wallet.addAmount') && !hasUserAccess(userPermissions, 'wallet.requisition') && !hasUserAccess(userPermissions, 'walletModule')) return false;
              if (label.includes('recharge') && !label.includes('dth') && !hasUserAccess(userPermissions, 'wallet.recharge') && !hasUserAccess(userPermissions, 'walletModule')) return false;
              if (label.includes('travel') && !hasUserAccess(userPermissions, 'wallet.travels') && !hasUserAccess(userPermissions, 'walletModule')) return false;
              if ((label.includes('dmt') || label.includes('money transfer')) && !hasUserAccess(userPermissions, 'wallet.dmt') && !hasUserAccess(userPermissions, 'walletModule')) return false;
              if (label.includes('dth') && !hasUserAccess(userPermissions, 'wallet.dth') && !hasUserAccess(userPermissions, 'walletModule')) return false;
              if ((label.includes('ledger') || label.includes('report')) && !hasUserAccess(userPermissions, 'wallet.ledger') && !hasUserAccess(userPermissions, 'ledgerModule') && !hasUserAccess(userPermissions, 'ledger.view')) return false;
              if ((label.includes('tool') || url.includes('/tools')) && !hasUserAccess(userPermissions, 'toolsModule') && !hasUserAccess(userPermissions, 'tools.view')) return false;
              if (label.includes('pan') && !hasUserAccess(userPermissions, 'panCard') && !hasUserAccess(userPermissions, 'pan.access')) return false;
              if (label.includes('offline') && !hasUserAccess(userPermissions, 'offlineWork') && !hasUserAccess(userPermissions, 'offlineWork.access')) return false;
              if (label.includes('wallet') && !label.includes('ledger') && !label.includes('point') && !hasUserAccess(userPermissions, 'walletModule')) return false;
              return true;
            });
            if (visibleTopTabs.length === 0) return null;
            return (
              <div className="top-tabs-new">
                {visibleTopTabs.map((tab) => {
                  const tabId = tab._id || tab.id;
                  const label = (tab.label || '').toLowerCase();
                  const isSelected = 
                    (isWalletRoute && label.includes('wallet')) ||
                    (isLedgerRoute && label.includes('ledger')) ||
                    (!isStandaloneRoute && activeTabId === tabId);

                  return (
                    <button
                      key={tabId}
                      className={`tab-btn-new ${isSelected ? 'active' : ''}`}
                      onClick={() => {
                        setActiveTabId(tabId);
                        if (label.includes('ledger') || label.includes('report')) {
                          navigate('/ledger');
                        } else if (label.includes('wallet')) {
                          navigate('/wallet');
                        } else {
                          navigate('/dashboard');
                          if (tab.url) window.open(tab.url, '_blank');
                        }
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      {getTabIcon(tab.label)}
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            );
          })()}

          {/* Action Cards Marquee Showcase (Only show on Dashboard, hide on Ledger & Wallet routes) */}
          {!isStandaloneRoute && hasUserAccess(userPermissions, 'dashboardNavModule') && (hasUserAccess(userPermissions, 'dashboard.actionCards') || hasUserAccess(userPermissions, 'dashboard.view') || hasUserAccess(userPermissions, 'dashboard.stats') || hasUserAccess(userPermissions, 'dashboard.assignedWork') || hasUserAccess(userPermissions, 'dashboard.activitySummary')) && (
            <div className="action-cards-container">
              <div className="action-cards-wrapper">
                <div className="action-cards-track-scroll">
                  {[...actionCardsData, ...actionCardsData].map((card, index) => {
                    const cardId = card._id || card.id;
                    const isSelected = activeCardId === cardId;
                    return (
                      <div key={(cardId || 'card') + '-' + index} className="action-card-new">
                        <div
                          className={`action-card-inner ${isSelected ? 'active' : ''}`}
                          style={{ cursor: 'pointer' }}
                          onClick={() => {
                            setActiveCardId(cardId);
                            if (card.url) window.open(card.url, '_blank');
                          }}
                        >
                          <img
                            src={card.img}
                            alt={card.title || 'Service'}
                            className="card-img"
                            onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
                          />

                          {card.isAeps ? (
                            <div className="card-fallback aeps-fallback" style={{ display: 'none' }}>
                              <div className="aeps-e">e</div>
                              <div className="aeps-text">A <span>P S</span></div>
                            </div>
                          ) : (
                            <div className="card-fallback" style={{ display: 'none' }}>{card.icon || '💳'}</div>
                          )}

                          <div className="card-hover-overlay">
                            <span className="card-open-btn">Open Service →</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Main Content Display: Ledger View, Wallet View, or Banner Showcase */}
          {isLedgerRoute ? (
            (!hasUserAccess(userPermissions, 'ledgerModule') && !hasUserAccess(userPermissions, 'ledger.view')) ? (
              <AccessRestrictedNotice title="Wallet Ledger" onBack={() => navigate('/dashboard')} />
            ) : (
              <LedgerView currentUser={localStorage.getItem('currentUser')} walletBalance={walletBalance} userPermissions={userPermissions} />
            )
          ) : isWalletRoute ? (
            !hasUserAccess(userPermissions, 'walletModule') ? (
              <AccessRestrictedNotice title="My Wallet" onBack={() => navigate('/dashboard')} />
            ) : (
              <WalletModal
                isOpen={true}
                inlineMode={true}
                onClose={() => navigate('/dashboard')}
                currentUser={localStorage.getItem('currentUser')}
                initialTab={walletTab}
                walletBalance={walletBalance}
                onBalanceUpdate={(newBal) => setWalletBalance(newBal)}
                theme={theme}
                userPermissions={userPermissions}
              />
            )
          ) : isPanCardRoute ? (
            !hasUserAccess(userPermissions, 'panCard') ? (
              <AccessRestrictedNotice title="PAN Card Services" onBack={() => navigate('/dashboard')} />
            ) : (
              <PanCardView
                currentUser={localStorage.getItem('currentUser')}
                walletBalance={walletBalance}
                onClose={() => navigate('/dashboard')}
                theme={theme}
                userPermissions={userPermissions}
              />
            )
          ) : isOfflineWorkRoute ? (
            !hasUserAccess(userPermissions, 'offlineWork') ? (
              <AccessRestrictedNotice title="Offline Work Services" onBack={() => navigate('/dashboard')} />
            ) : (
              <OfflineWorkView
                currentUser={localStorage.getItem('currentUser')}
                walletBalance={walletBalance}
                onClose={() => navigate('/dashboard')}
                theme={theme}
                userPermissions={userPermissions}
              />
            )
          ) : isQuickLinksRoute ? (() => {
            if (!hasUserAccess(userPermissions, 'quickLinksModule') && !hasUserAccess(userPermissions, 'quickLinks.view')) {
              return <AccessRestrictedNotice title="Quick Links" onBack={() => navigate('/dashboard')} />;
            }
            const quickItem = (sidebarMenuData || []).find(m => {
              const d = getDynamicMenuForSidebarItem(m);
              if (d) return false;
              const l = (m.label || '').toLowerCase();
              const u = (m.url || '').toLowerCase();
              return l.includes('quick') || l === 'view links' || u === '/quick-links' || u === '/view-links';
            });
            const quickTitle = (quickItem && quickItem.label && quickItem.label.trim()) || 'Available links';
            return (
              <QuickLinksView
                menuKey="quickLinks"
                pageTitle={quickTitle}
                pageSubtitle="Access important form links, video guides and portals instantly"
                theme={theme}
                currentUser={localStorage.getItem('currentUser')}
                walletBalance={walletBalance}
                onBalanceUpdate={(newBal) => setWalletBalance(newBal)}
                sidebarMenus={sidebarMenuData}
                userPermissions={userPermissions}
              />
            );
          })() : isToolsRoute ? (
            (!hasUserAccess(userPermissions, 'toolsModule') && !hasUserAccess(userPermissions, 'tools.view')) ? (
              <AccessRestrictedNotice title="Tools & AI Utilities" onBack={() => navigate('/dashboard')} />
            ) : (
              <ToolsView
                theme={theme}
                currentUser={localStorage.getItem('currentUser')}
                walletBalance={walletBalance}
                onBalanceUpdate={(newBal) => setWalletBalance(newBal)}
                onClose={() => navigate('/dashboard')}
                userPermissions={userPermissions}
              />
            )
          ) : isCrmRoute ? (
            (!hasUserAccess(userPermissions, 'crm') && !hasUserAccess(userPermissions, 'crm.access')) ? (
              <AccessRestrictedNotice title="CRM Suite" onBack={() => navigate('/dashboard')} />
            ) : (
              <CrmView
                theme={theme}
                currentUser={localStorage.getItem('currentUser')}
                walletBalance={walletBalance}
                onBalanceUpdate={(newBal) => setWalletBalance(newBal)}
                onClose={() => navigate('/dashboard')}
                userPermissions={userPermissions}
              />
            )
          ) : isDynLinkMenuRoute ? (() => {
            const dynPermKey = `dyn.${activeDynLinkMenu.key}`;
            if (!hasUserAccess(userPermissions, dynPermKey)) {
              return <AccessRestrictedNotice title={activeDynLinkMenu.label || 'Dynamic Portal'} onBack={() => navigate('/dashboard')} />;
            }
            const currentDynItem = (sidebarMenuData || []).find(m => {
              if (m.url && activeDynLinkMenu.route && m.url.toLowerCase().trim() === activeDynLinkMenu.route.toLowerCase().trim()) return true;
              const d = getDynamicMenuForSidebarItem(m);
              return d && d.key === activeDynLinkMenu.key;
            });
            const isMenuOff = currentDynItem && currentDynItem.dynamicActive === false;
            const dynTitle = (currentDynItem && currentDynItem.label && currentDynItem.label.trim()) || activeDynLinkMenu.label;

            if (isMenuOff) {
              return (
                <div style={{ padding: '60px 20px', textAlign: 'center', background: '#ffffff', borderRadius: '16px', margin: '20px', boxShadow: '0 4px 16px rgba(0,0,0,0.06)' }}>
                  <div style={{ fontSize: '48px', marginBottom: '14px' }}>🔒</div>
                  <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#1e293b', marginBottom: '8px' }}>
                    {dynTitle} is Currently Inactive
                  </h2>
                  <p style={{ color: '#64748b', fontSize: '14px', maxWidth: '420px', margin: '0 auto 20px' }}>
                    This menu section has been turned OFF by the administrator.
                  </p>
                  <button
                    onClick={() => navigate('/dashboard')}
                    style={{ padding: '10px 24px', borderRadius: '8px', background: '#3b82f6', color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer' }}
                  >
                    Go to Dashboard
                  </button>
                </div>
              );
            }

            return (
              <QuickLinksView
                menuKey={activeDynLinkMenu.key}
                pageTitle={dynTitle}
                pageSubtitle={`Available dynamic links and portals for ${dynTitle}`}
                theme={theme}
                currentUser={localStorage.getItem('currentUser')}
                walletBalance={walletBalance}
                onBalanceUpdate={(newBal) => setWalletBalance(newBal)}
                sidebarMenus={sidebarMenuData}
                userPermissions={userPermissions}
              />
            );
          })() : (
            bannersData.length > 0 && hasUserAccess(userPermissions, 'dashboardNavModule') && (hasUserAccess(userPermissions, 'dashboard.banners') || hasUserAccess(userPermissions, 'dashboard.view') || hasUserAccess(userPermissions, 'dashboard.stats') || hasUserAccess(userPermissions, 'dashboard.assignedWork') || hasUserAccess(userPermissions, 'dashboard.activitySummary')) && (
              <div className={`banner-area-new ${activeBannerId ? 'active' : ''}`}>
                {bannersData.map((banner) => {
                  const bannerId = banner._id || banner.id;
                  const isSelected = activeBannerId === bannerId;
                  return (
                    <div
                      key={bannerId}
                      className={`banner-item-wrapper ${isSelected ? 'active' : ''}`}
                      onClick={() => setActiveBannerId(bannerId)}
                      style={{ cursor: 'pointer' }}
                    >
                      <img
                        src={banner.img}
                        alt={banner.alt || 'Banner'}
                        className="banner-img"
                        onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
                      />
                      <div className="banner-fallback" style={{ display: 'none' }}>
                        <div className="sun-new"></div>
                        <div className="plane-shadow">{banner.fallbackIcon}</div>
                        <div className="person-shadow">{banner.fallbackPerson}</div>
                      </div>
                      <div className="banner-shine-overlay"></div>
                    </div>
                  );
                })}
              </div>
            )
          )}

        </div>
      </div>

    </div>
  );
};

export default Dashboard;
