import React, { useState, useEffect } from 'react';
import Swal from 'sweetalert2';
import './QuickLinksView.css';
import { API_URL } from '../../utils/apiClient';
import { ALL_LINK_MENUS, DYNAMIC_LINK_MENUS, getDynamicMenuForSidebarItem, getCustomMenuIcons } from '../../utils/dynamicLinkMenus';
import { hasUserAccess, getStoredUserPermissions } from '../../utils/userPermissions';

const QuickLinksView = ({ 
  theme = 'light', 
  currentUser: propCurrentUser, 
  walletBalance: propWalletBalance, 
  onBalanceUpdate,
  menuKey = 'quickLinks',
  pageTitle = 'Available links',
  pageSubtitle = 'Access useful forms, portals, guidelines, and video tutorials',
  sidebarMenus: propSidebarMenus,
  userPermissions: propUserPermissions
}) => {
  const effectivePermissions = propUserPermissions || getStoredUserPermissions();
  const [selectedCategory, setSelectedCategory] = useState(menuKey || 'quickLinks');
  const [menuTabs, setMenuTabs] = useState(ALL_LINK_MENUS);
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingLinkId, setProcessingLinkId] = useState(null);
  const [activeVideoModal, setActiveVideoModal] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  const updateMenuTabsFromMenus = React.useCallback((menus) => {
    if (!Array.isArray(menus)) return;
    const customIcons = getCustomMenuIcons();

    const allMenus = [];
    const seenKeys = new Set();

    menus.forEach(sm => {
      if (!sm || !sm.label) return;
      const l = sm.label.toLowerCase();
      const u = (sm.url || '').toLowerCase();
      const isQuick = l.includes('quick') || l === 'view links' || u === '/quick-links' || u === '/view-links';

      if (isQuick) {
        if (!seenKeys.has('quickLinks')) {
          seenKeys.add('quickLinks');
          allMenus.push({
            key: 'quickLinks',
            label: (sm.label && sm.label.trim()) ? sm.label.trim() : 'Quick Links',
            icon: customIcons['quickLinks'] || sm.icon || '🔗',
            route: '/quick-links',
            dynamicActive: sm.dynamicActive !== undefined ? Boolean(sm.dynamicActive) : true
          });
        }
        return;
      }

      // Standard dynamic menu match
      const matchedDyn = DYNAMIC_LINK_MENUS.find(dyn => {
        if (sm.url && dyn.route && sm.url.toLowerCase().trim() === dyn.route.toLowerCase().trim()) return true;
        const d = getDynamicMenuForSidebarItem(sm);
        return d && d.key === dyn.key;
      });

      if (matchedDyn) {
        if (!seenKeys.has(matchedDyn.key)) {
          seenKeys.add(matchedDyn.key);
          allMenus.push({
            ...matchedDyn,
            label: (sm.label && sm.label.trim()) ? sm.label.trim() : matchedDyn.label,
            icon: customIcons[matchedDyn.key] || matchedDyn.icon || '🌐',
            dynamicActive: sm.dynamicActive !== undefined ? Boolean(sm.dynamicActive) : true
          });
        }
        return;
      }

      // Custom dynamic menu match
      const isPan = l.includes('pan');
      const isDash = l.includes('dash');
      const isWallet = l.includes('wallet');
      const isLedger = l.includes('ledger') || l.includes('report');
      if (!isPan && !isDash && !isWallet && !isLedger && sm.url && sm.url.startsWith('/')) {
        const key = sm.url.replace(/^\/+/, '').replace(/[^a-zA-Z0-9]/g, '');
        if (key && !seenKeys.has(key)) {
          seenKeys.add(key);
          allMenus.push({
            key,
            label: sm.label.trim(),
            icon: customIcons[key] || '🌐',
            route: sm.url,
            dynamicActive: sm.dynamicActive !== undefined ? Boolean(sm.dynamicActive) : true
          });
        }
      }
    });

    // Fallbacks if quickLinks or standard dynamic menus are missing from menus
    if (!seenKeys.has('quickLinks')) {
      allMenus.unshift({
        key: 'quickLinks',
        label: 'Quick Links',
        icon: customIcons['quickLinks'] || '🔗',
        route: '/quick-links',
        dynamicActive: true
      });
      seenKeys.add('quickLinks');
    }
    DYNAMIC_LINK_MENUS.forEach(dyn => {
      if (!seenKeys.has(dyn.key)) {
        allMenus.push({
          ...dyn,
          icon: customIcons[dyn.key] || dyn.icon || '🌐',
          dynamicActive: true
        });
        seenKeys.add(dyn.key);
      }
    });

    // Filter only active dynamic menus (ON in Dynamic Menus) for user panel display AND allowed for user
    const activeOnly = allMenus.filter(m => {
      if (m.dynamicActive === false) return false;
      if (m.key === 'quickLinks') {
        return hasUserAccess(effectivePermissions, 'quickLinksModule') && hasUserAccess(effectivePermissions, 'quickLinks.view');
      }
      return hasUserAccess(effectivePermissions, `dyn.${m.key}`);
    });
    setMenuTabs(activeOnly);

    // If currently selected tab was turned OFF by admin or restricted, fall back to first active menu
    if (activeOnly.length > 0 && selectedCategory && !activeOnly.some(m => m.key === selectedCategory)) {
      setSelectedCategory(activeOnly[0].key);
    }
  }, [selectedCategory, effectivePermissions]);

  // Sync when propSidebarMenus changes from parent
  useEffect(() => {
    if (Array.isArray(propSidebarMenus) && propSidebarMenus.length > 0) {
      updateMenuTabsFromMenus(propSidebarMenus);
    }
  }, [propSidebarMenus, updateMenuTabsFromMenus]);

  // Load sidebar menus dynamically on mount as fallback
  useEffect(() => {
    fetch(`${API_URL}/api/sidebar-menus`)
      .then(res => res.json())
      .then(menus => updateMenuTabsFromMenus(menus))
      .catch(err => console.error('Error fetching dynamic sidebar menus in QuickLinksView:', err));
  }, [updateMenuTabsFromMenus]);

  // Sync internal selectedCategory if menuKey prop changes from parent
  useEffect(() => {
    if (menuKey) {
      setSelectedCategory(menuKey);
    }
  }, [menuKey]);

  // Reset search when switching tab
  useEffect(() => {
    setSearchQuery('');
  }, [selectedCategory]);

  // Filter links in real-time as user types in search bar
  const filteredLinks = React.useMemo(() => {
    if (!searchQuery.trim()) return links;
    const q = searchQuery.toLowerCase().trim();
    return links.filter(item => {
      const titleMatch = item.title && item.title.toLowerCase().includes(q);
      const categoryMatch = item.category && item.category.toLowerCase().includes(q);
      return titleMatch || categoryMatch;
    });
  }, [links, searchQuery]);

  const activeUser = propCurrentUser || (typeof localStorage !== 'undefined' ? localStorage.getItem('currentUser') : null);

  const getFullMediaUrl = (urlOrFile) => {
    if (!urlOrFile) return '';
    if (urlOrFile.startsWith('http://') || urlOrFile.startsWith('https://')) return urlOrFile;
    const clean = urlOrFile.startsWith('/') ? urlOrFile : `/${urlOrFile}`;
    return `${API_URL}${clean}`;
  };

  const getYouTubeEmbedUrl = (url) => {
    if (!url) return null;
    const ytMatch = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
    return ytMatch ? `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1` : null;
  };

  const isVideoItem = (item) => {
    if (!item) return false;
    if (item.videoSource === 'device') return true;
    if (item.videoFile && item.videoFile.trim() !== '') return true;
    if (menuKey === 'vedioLink') return true;
    if (item.category === 'video') return true;
    const u = (item.url || '').toLowerCase();
    return u.includes('/uploads/videos/') || u.endsWith('.mp4') || u.endsWith('.webm') || u.endsWith('.mov') || u.includes('youtube.com') || u.includes('youtu.be');
  };

  const openVideoOrLink = (targetItem, data = {}) => {
    const rawUrl = data.videoFile || data.url || targetItem.videoFile || targetItem.url;
    if (!rawUrl || rawUrl === '#') return;

    const fullUrl = getFullMediaUrl(rawUrl);
    const isDeviceVideo = Boolean(
      (data.videoSource === 'device' || targetItem.videoSource === 'device') ||
      data.videoFile ||
      targetItem.videoFile ||
      rawUrl.includes('/uploads/videos/') ||
      rawUrl.match(/\.(mp4|webm|mov|mkv)($|\?)/i)
    );
    const ytEmbed = getYouTubeEmbedUrl(rawUrl);

    // If it's a video item (device video or YouTube/video URL), open in modal player
    if (isVideoItem(targetItem) || isDeviceVideo || ytEmbed) {
      setActiveVideoModal({
        title: targetItem.title || 'Video Player',
        videoUrl: fullUrl,
        embedUrl: ytEmbed,
        isDevice: isDeviceVideo,
        rawUrl
      });
      return;
    }

    // Otherwise, normal web link -> open in new window
    if (fullUrl.startsWith('http://') || fullUrl.startsWith('https://')) {
      window.open(fullUrl, '_blank', 'noopener,noreferrer');
    } else {
      window.open(fullUrl, '_blank');
    }
  };

  useEffect(() => {
    setLoading(true);
    const queryParam = selectedCategory ? `?menuKey=${encodeURIComponent(selectedCategory)}` : '';
    fetch(`${API_URL}/api/quick-links${queryParam}`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setLinks(data.filter(item => item.isActive !== false));
        } else {
          setLinks([]);
        }
        setLoading(false);
      })
      .catch(err => {
        console.error('Error fetching quick links:', err);
        setLinks([]);
        setLoading(false);
      });
  }, [selectedCategory]);

  const handleLinkClick = async (item) => {
    if (!item) return;
    const feeAmount = Number(item.fee) || 0;
    const itemId = item._id || item.id;

    // Free link -> open immediately
    if (feeAmount <= 0) {
      openVideoOrLink(item);
      return;
    }

    // Paid link requires logged-in user to deduct from wallet
    if (!activeUser) {
      return Swal.fire({
        icon: 'warning',
        title: 'Login Required',
        text: 'Please log in to your account to access this link.'
      });
    }

    const confirmRes = await Swal.fire({
      title: 'Visiting Fee Confirmation',
      html: `
        <div style="text-align: center; margin-top: 6px;">
          <div style="font-size: 15px; font-weight: 700; color: #1e293b; margin-bottom: 8px;">
            ${item.title}
          </div>
          <div style="background: #fff7ed; border: 1.5px solid #fed7aa; border-radius: 12px; padding: 12px; margin: 12px 0;">
            <div style="font-size: 13px; color: #9a3412; font-weight: 600;">Visiting Fee to Access:</div>
            <div style="font-size: 26px; font-weight: 900; color: #ea580c; margin-top: 4px;">
              ₹${feeAmount.toFixed(2)}
            </div>
            <div style="font-size: 12px; color: #64748b; margin-top: 6px;">
              This amount will be deducted directly from your wallet balance.
            </div>
          </div>
        </div>
      `,
      icon: 'info',
      showCancelButton: true,
      confirmButtonText: `💳 Pay ₹${feeAmount.toFixed(2)} & Visit`,
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#ea580c',
      cancelButtonColor: '#64748b',
      reverseButtons: true
    });

    if (!confirmRes.isConfirmed) return;

    setProcessingLinkId(itemId);
    try {
      const res = await fetch(`${API_URL}/api/quick-links/visit/${itemId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: activeUser })
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to process visiting fee deduction.');
      }

      // Update wallet balance in Dashboard state & window event
      if (typeof onBalanceUpdate === 'function' && data.walletBalance !== undefined) {
        onBalanceUpdate(data.walletBalance);
      }
      if (typeof window !== 'undefined' && data.walletBalance !== undefined) {
        window.dispatchEvent(new CustomEvent('walletUpdated', { detail: data.walletBalance }));
      }

      // Show brief success toast
      Swal.fire({
        icon: 'success',
        title: 'Fee Paid Successfully!',
        text: `₹${feeAmount.toFixed(2)} deducted. Accessing now...`,
        timer: 1500,
        showConfirmButton: false,
        toast: true,
        position: 'top-end'
      });

      openVideoOrLink(item, data);
    } catch (err) {
      console.error('Error visiting quick link:', err);
      Swal.fire({
        icon: 'error',
        title: 'Payment Failed',
        text: err.message || 'Could not deduct visiting fee from wallet.'
      });
    } finally {
      setProcessingLinkId(null);
    }
  };

  return (
    <div className={`quick-links-container theme-${theme}`}>
      <div className="quick-links-header">
        <h2 className="quick-links-title">{pageTitle}</h2>
        <p className="quick-links-subtitle">{pageSubtitle}</p>

        {/* Search Bar below QUICK LINKS title/subtitle as shown in Photo 1 */}
        <div className="quick-links-search-bar-wrap">
          <span className="quick-links-search-icon">🔍</span>
          <input
            type="text"
            className="quick-links-search-input"
            placeholder={`Search in ${(menuTabs.find(m => m.key === selectedCategory)?.label || pageTitle || 'QUICK LINKS').toUpperCase()}...`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="quick-links-search-clear-btn"
              onClick={() => setSearchQuery('')}
              title="Clear search"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Link Menu Tabs Bar (QUICK LINKS + All dynamic service links in top tab button format) */}
      <div className="quick-links-tabs-bar">
        {menuTabs.map((menuItem) => {
          const isSelected = selectedCategory === menuItem.key;
          return (
            <button
              key={menuItem.key}
              type="button"
              className={`quick-links-tab-pill ${isSelected ? 'active' : ''}`}
              onClick={() => setSelectedCategory(menuItem.key)}
            >
              <span className="tab-pill-icon">{menuItem.icon}</span>
              <span className="tab-pill-label">{menuItem.label.toUpperCase()}</span>
            </button>
          );
        })}
      </div>

      {menuTabs.length === 0 ? (
        <div style={{ padding: '60px 20px', textAlign: 'center', background: '#ffffff', borderRadius: '16px', margin: '20px auto', maxWidth: '540px', boxShadow: '0 4px 16px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: '48px', marginBottom: '14px' }}>🔒</div>
          <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#1e293b', marginBottom: '8px' }}>
            Services Access Restricted
          </h3>
          <p style={{ color: '#64748b', fontSize: '14px', margin: '0 auto' }}>
            You do not have access to these services. Please contact your administrator to grant access.
          </p>
        </div>
      ) : loading ? (
        <div className="quick-links-loading">
          Loading quick links...
        </div>
      ) : links.length === 0 ? (
        <div className="quick-links-empty">
          No links available right now.
        </div>
      ) : filteredLinks.length === 0 ? (
        <div className="quick-links-empty">
          No links found matching "{searchQuery}".
        </div>
      ) : (
        <div className="quick-links-grid">
          {filteredLinks.map((item) => {
            const itemId = item._id || item.id;
            const hasPhoto = Boolean(item.img && item.img.trim() !== '');
            const feeVal = Number(item.fee) || 0;
            const isProcessing = processingLinkId === itemId;

            return (
              <div
                key={itemId}
                className={`quick-link-card ${hasPhoto ? 'has-img' : 'no-img'} ${isProcessing ? 'is-loading' : ''}`}
                onClick={() => handleLinkClick(item)}
                title={feeVal > 0 ? `Pay ₹${feeVal} & Open: ${item.title}` : `Open: ${item.title}`}
              >
                {/* Fee badge on top-left */}
                {feeVal > 0 ? (
                  <span className="quick-link-fee-badge paid">
                    🔒 ₹{feeVal}
                  </span>
                ) : (
                  <span className="quick-link-fee-badge free">
                    FREE
                  </span>
                )}

                {/* Photo fully covering the entire card box */}
                {hasPhoto ? (
                  <>
                    <img
                      src={item.img}
                      alt={item.title}
                      className="quick-link-bg-img"
                      onError={(e) => {
                        e.target.style.display = 'none';
                        if (e.target.nextSibling) e.target.nextSibling.style.display = 'none';
                      }}
                    />
                    <div className="quick-link-card-overlay" />
                  </>
                ) : (
                  <div className="quick-link-icon-fallback">
                    {item.icon || '🔗'}
                  </div>
                )}

                {item.category && item.category !== 'link' && (
                  <span className="quick-link-badge-type">{item.category}</span>
                )}

                <div className="quick-link-title-text">
                  {isProcessing ? '⏳ Processing...' : item.title}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Video Player Modal */}
      {activeVideoModal && (
        <div 
          className="video-player-modal-backdrop" 
          onClick={() => setActiveVideoModal(null)}
        >
          <div 
            className="video-player-modal-card" 
            onClick={(e) => e.stopPropagation()}
          >
            <div className="video-player-modal-header">
              <div className="video-player-modal-title">
                <span>🎥</span>
                <span>{activeVideoModal.title}</span>
              </div>
              <div className="video-player-modal-actions">
                <a
                  href={activeVideoModal.videoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="video-player-modal-btn"
                  title="Open video in new tab"
                >
                  ↗ Open in New Tab
                </a>
                <button
                  type="button"
                  className="video-player-modal-close"
                  onClick={() => setActiveVideoModal(null)}
                  title="Close player"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="video-player-modal-body">
              {activeVideoModal.embedUrl ? (
                <iframe
                  src={activeVideoModal.embedUrl}
                  title={activeVideoModal.title}
                  style={{ width: '100%', height: '480px', border: 'none' }}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <video
                  src={activeVideoModal.videoUrl}
                  controls
                  autoPlay
                  className="video-player-modal-video"
                >
                  Your browser does not support the video tag.
                </video>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QuickLinksView;
