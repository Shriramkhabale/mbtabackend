export const DYNAMIC_LINK_MENUS = [
  { key: 'servicesLink', label: 'SERVICES LINK', icon: '🛠️', route: '/services-link' },
  { key: 'jobLinks', label: 'JOB LINKS', icon: '💼', route: '/job-links' },
  { key: 'admitCard', label: 'ADMIT CARD', icon: '🎫', route: '/admit-card' },
  { key: 'formLinks', label: 'FORM LINKS', icon: '📋', route: '/form-links' },
  { key: 'vedioLink', label: 'VEDIO LINK', icon: '🎥', route: '/vedio-link' },
  { key: 'trainingLinks', label: 'TRAINING LINKS', icon: '🎓', route: '/training-links' },
  { key: 'productLinks', label: 'PRODUCT LINKS', icon: '📦', route: '/product-links' },
  { key: 'govtLinks', label: 'GOVT LINKS', icon: '🏛️', route: '/govt-links' },
  { key: 'print', label: 'PRINT', icon: '🖨️', route: '/print' },
  { key: 'schorshipLinks', label: 'SCHORSHIP LINKS', icon: '📜', route: '/schorship-links' },
];

export const ALL_LINK_MENUS = [
  { key: 'quickLinks', label: 'Quick Links', icon: '🔗', route: '/quick-links' },
  ...DYNAMIC_LINK_MENUS
];

// Storage key for custom icons if needed
const CUSTOM_ICONS_KEY = 'mb_custom_menu_icons';

export const getCustomMenuIcons = () => {
  try {
    return JSON.parse(localStorage.getItem(CUSTOM_ICONS_KEY) || '{}');
  } catch (e) {
    return {};
  }
};

export const setCustomMenuIcon = (key, icon) => {
  try {
    const existing = getCustomMenuIcons();
    existing[key] = icon;
    localStorage.setItem(CUSTOM_ICONS_KEY, JSON.stringify(existing));
  } catch (e) {}
};

export const toMenuKey = (str) => {
  if (!str) return '';
  return String(str)
    .trim()
    .replace(/^\/+/, '')
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, '');
};

export const findDynamicMenu = (term, customMenus = []) => {
  if (!term) return null;
  const raw = String(term).trim().toLowerCase();
  const t = raw.split('?')[0].replace(/\/+$/, '');
  const tNoSlash = t.replace(/^\/+/, '');
  if (t.includes('offline') || t.includes('pan') || t.includes('tool')) return null;

  // Check custom dynamic menus first if passed
  if (Array.isArray(customMenus) && customMenus.length > 0) {
    const matchedCustom = customMenus.find(m => {
      const r = m.route || m.url || '';
      const routeNoSlash = r.toLowerCase().replace(/^\/+/, '');
      return (
        (m.key && m.key.toLowerCase() === t) ||
        (m.label && m.label.toLowerCase() === t) ||
        (r && r.toLowerCase() === t) ||
        (tNoSlash && routeNoSlash && routeNoSlash === tNoSlash)
      );
    });
    if (matchedCustom) return matchedCustom;
  }

  return DYNAMIC_LINK_MENUS.find(m => {
    const routeNoSlash = m.route.toLowerCase().replace(/^\/+/, '');
    if (
      m.key.toLowerCase() === t ||
      m.label.toLowerCase() === t ||
      m.route.toLowerCase() === t ||
      (tNoSlash && routeNoSlash === tNoSlash)
    ) {
      return true;
    }
    if (m.key === 'vedioLink') {
      return (
        t === 'vedio' || 
        t === 'video' || 
        t === 'vedio link' || 
        t === 'video link' || 
        t === 'vedio links' || 
        t === 'video links' || 
        t === '/vedio-link' || 
        t === '/video-link' || 
        t === '/vedio-links' || 
        t === '/video-links' ||
        tNoSlash === 'vedio-link' ||
        tNoSlash === 'video-link' ||
        tNoSlash === 'vedio-links' ||
        tNoSlash === 'video-links'
      );
    }
    if (m.key === 'schorshipLinks') {
      return (
        t === 'scholarship links' || 
        t === 'scholarship' || 
        t === 'scholarship link' || 
        t === '/scholarship-links' || 
        t === '/schorship-links' ||
        t === 'schorship links' || 
        t === 'schorship link' ||
        tNoSlash === 'scholarship-links' ||
        tNoSlash === 'schorship-links'
      );
    }
    if (m.key === 'jobLinks') return t === 'job link' || t === 'job links' || t === '/job-links' || tNoSlash === 'job-links';
    if (m.key === 'formLinks') return t === 'form link' || t === 'form links' || t === '/form-links' || tNoSlash === 'form-links';
    if (m.key === 'servicesLink') return t === 'services' || t === 'service link' || t === 'services link' || t === '/services-link' || tNoSlash === 'services-link';
    if (m.key === 'trainingLinks') return t === 'training link' || t === 'training links' || t === '/training-links' || tNoSlash === 'training-links';
    if (m.key === 'productLinks') return t === 'product link' || t === 'product links' || t === '/product-links' || tNoSlash === 'product-links';
    if (m.key === 'govtLinks') return t === 'govt link' || t === 'govt links' || t === 'government links' || t === '/govt-links' || tNoSlash === 'govt-links';
    if (m.key === 'print') return t === 'print' || t === '/print' || tNoSlash === 'print';
    if (m.key === 'admitCard') return t === 'admit card' || t === '/admit-card' || tNoSlash === 'admit-card';
    return false;
  });
};

export const getDynamicMenuForSidebarItem = (menuItem, customMenus = []) => {
  if (!menuItem) return null;
  const lowerUrl = (menuItem.url || '').toLowerCase();
  const lowerLabel = (menuItem.label || '').toLowerCase();
  if (lowerUrl.includes('offline') || lowerLabel.includes('offline') || lowerUrl.includes('pan') || lowerLabel.includes('pan') || lowerUrl.includes('tool') || lowerLabel.includes('tool')) {
    return null;
  }
  if (menuItem.url) {
    const byUrl = findDynamicMenu(menuItem.url, customMenus);
    if (byUrl) return byUrl;
  }
  if (menuItem.label) {
    const byLabel = findDynamicMenu(menuItem.label, customMenus);
    if (byLabel) return byLabel;
  }
  return null;
};

