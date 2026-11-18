/**
 * User Permissions Utility
 * Centralizes permission checks and alias mappings for Retailer / User accounts.
 */

export const PERMISSION_ALIASES = {
  // PAN Card aliases
  'pancard': 'panCard',
  'pan_card': 'panCard',
  'pan.new': 'pan.manualNew',
  'pan_manual': 'pan.manualNew',
  'pan.manual_new': 'pan.manualNew',
  'manual_new_pan': 'pan.manualNew',
  'pan.epan_kyc': 'pan.epanKyc',
  'epan_kyc': 'pan.epanKyc',
  'pan.epan_correction_otp': 'pan.epanCorrectionOtp',
  'epan_correction_otp': 'pan.epanCorrectionOtp',
  'pan.epan_sign_photo': 'pan.epanSignPhoto',
  'epan_sign_photo': 'pan.epanSignPhoto',
  'pan.epan_correction_sign_photo': 'pan.epanCorrectionSignPhoto',
  'epan_correction_sign_photo': 'pan.epanCorrectionSignPhoto',
  'pan.correction': 'pan.correction',
  'pan_correction': 'pan.correction',
  'epan_correction': 'pan.correction',
  'manual_pan_correction': 'pan.correction',
  'pan.findPan': 'pan.findPan',
  'pan_find': 'pan.findPan',
  'find_pan_aadhaar': 'pan.findPan',
  'pan.merger': 'pan.merger',
  'stamp_signature_merger': 'pan.merger',
  'pan.submissions': 'pan.submissions',
  'pan.history': 'pan.submissions',
  'pan_history': 'pan.submissions',
  'history': 'pan.submissions',

  // Quick Links & Portals aliases
  'view_quick_links_dashboard': 'quickLinks.view',
  'quick_links': 'quickLinksModule',
  'quicklinks': 'quickLinksModule',

  // Wallet aliases
  'instant_upi_qr_code_topup': 'wallet.upiPayment',
  'wallet_upi': 'wallet.upiPayment',
  'wallet_balance': 'wallet.balance',
  'wallet_requisition': 'wallet.requisition',
  'requisition': 'wallet.requisition',
  'wallet_payout': 'wallet.payout',
  'payout': 'wallet.payout',
  'wallet_history': 'wallet.history',
  'wallet': 'walletModule',

  // Ledger aliases
  'ledger_view': 'ledger.view',
  'ledger': 'ledgerModule',

  // Dynamic menus aliases
  'services_link': 'dyn.servicesLink',
  'servicesLink': 'dyn.servicesLink',
  'job_links': 'dyn.jobLinks',
  'jobLinks': 'dyn.jobLinks',
  'admit_card': 'dyn.admitCard',
  'admitCard': 'dyn.admitCard',
  'form_links': 'dyn.formLinks',
  'formLinks': 'dyn.formLinks',
  'vedio_link': 'dyn.vedioLink',
  'vedioLink': 'dyn.vedioLink',
  'video_link': 'dyn.vedioLink',
  'videoLink': 'dyn.vedioLink',
  'training_links': 'dyn.trainingLinks',
  'trainingLinks': 'dyn.trainingLinks',
  'product_links': 'dyn.productLinks',
  'productLinks': 'dyn.productLinks',
  'govt_links': 'dyn.govtLinks',
  'govtLinks': 'dyn.govtLinks',
  'print': 'dyn.print',
  'schorship_links': 'dyn.schorshipLinks',
  'schorshipLinks': 'dyn.schorshipLinks',
  'scholarship_links': 'dyn.schorshipLinks',
  'scholarshipLinks': 'dyn.schorshipLinks',

  // Offline Work aliases
  'offline_work': 'offlineWork',
  'offlineWork': 'offlineWork',
  'offlinework': 'offlineWork',

  // Tools aliases
  'tools': 'toolsModule',
  'tool': 'toolsModule',
  'tools_module': 'toolsModule',
  'toolsModule': 'toolsModule',
  'tools.view': 'tools.view',
  'tools_view': 'tools.view',
  'tools.aadhar': 'tools.aadharCutter',
  'tools.all_id': 'tools.allIdCutter',
  'tools.background': 'tools.bgRemover',
  'tools.signature': 'tools.signValidation',
  'tools.ocr': 'tools.ocrConverter',
  'tools.enhance': 'tools.imageEnhancer',
  'tools.ration': 'tools.rationCutter',
  'tools.pan': 'tools.panCutter',
  'tools.voter': 'tools.voterCutter',

  // CRM Suite & Post-Tools Aliases
  'crm': 'crm',
  'crmModule': 'crm',
  'crm_suite': 'crm',
  'crmCore': 'crm.access',
  'crmTask': 'crm.task.access',
  'crmPending': 'crm.pending.access',
  'crmBillBook': 'crm.billbook.access',
  'crmCustomer': 'crm.customer.access',
  'customerManagement': 'crm.customer.access',
  'customer_management': 'crm.customer.access',
  'crmBank': 'crm.bank.access',
  'crmMoney': 'crm.money.access',
  'crmEmployee': 'crm.employee.access'
};

// Map each module to its sub-permissions
export const MODULE_SUB_MAP = {
  offlineWork: [
    'offlineWork.access',
    'offlineWork.view',
    'offlineWork.add',
    'offlineWork.edit',
    'offlineWork.status',
    'offlineWork.submit',
    'offlineWork.history'
  ],
  panCard: [
    'pan.access',
    'pan.create',
    'pan.view',
    'pan.edit',
    'pan.upload',
    'pan.download',
    'pan.status',
    'pan.manualNew',
    'pan.epanKyc',
    'pan.epanCorrectionOtp',
    'pan.epanSignPhoto',
    'pan.epanCorrectionSignPhoto',
    'pan.correction',
    'pan.findPan',
    'pan.merger',
    'pan.submissions'
  ],
  toolsModule: [
    'tools.access',
    'tools.view',
    'tools.use',
    'tools.pdf',
    'tools.other',
    'tools.aadharCutter',
    'tools.allIdCutter',
    'tools.bgRemover',
    'tools.signValidation',
    'tools.autoCrop',
    'tools.ocrConverter',
    'tools.imageEnhancer',
    'tools.rationCutter',
    'tools.panCutter',
    'tools.voterCutter',
    'tools.pdf2Html'
  ],
  dynamicMenus: [
    'dyn.servicesLink', 'dyn.jobLinks', 'dyn.admitCard', 'dyn.formLinks',
    'dyn.vedioLink', 'dyn.trainingLinks', 'dyn.productLinks', 'dyn.govtLinks',
    'dyn.print', 'dyn.schorshipLinks'
  ],
  quickLinksModule: ['quickLinks.view', 'quickLinks.open', 'quickLinks.search', 'quicklinks.access'],
  walletModule: [
    'wallet.balance',
    'wallet.upiPayment',
    'wallet.payout',
    'wallet.requisition',
    'wallet.history',
    'wallet.points',
    'wallet.addAmount',
    'wallet.recharge',
    'wallet.travels',
    'wallet.dmt',
    'wallet.dth',
    'wallet.ledger'
  ],
  ledgerModule: ['ledger.view', 'ledger.filter', 'ledger.exportPdf', 'wallet.ledger'],
  dashboardNavModule: [
    'dashboard.actionCards',
    'dashboard.topTabs',
    'dashboard.banners',
    'dashboard.view',
    'dashboard.stats',
    'dashboard.assignedWork',
    'dashboard.activitySummary'
  ],
  crm: [
    'crm.access',
    'crm.dashboard',
    'crm.task.access',
    'crm.task.add',
    'crm.task.edit',
    'crm.task.delete',
    'crm.pending.access',
    'crm.pending.view',
    'crm.pending.update',
    'crm.billbook.access',
    'crm.billbook.view',
    'crm.billbook.add',
    'crm.billbook.edit',
    'crm.customer.access',
    'crm.customer.view',
    'crm.customer.add',
    'crm.customer.edit',
    'crm.bank.access',
    'crm.bank.view',
    'crm.bank.add',
    'crm.bank.edit',
    'crm.bank.delete',
    'crm.money.access',
    'crm.money.view',
    'crm.money.add',
    'crm.money.status',
    'crm.money.reports',
    'crm.money.pnl',
    'crm.employee.access',
    'crm.employee.manage'
  ],
  crmCore: ['crm.access', 'crm.dashboard'],
  crmTask: ['crm.task.access', 'crm.task.add', 'crm.task.edit', 'crm.task.delete'],
  crmPending: ['crm.pending.access', 'crm.pending.view', 'crm.pending.update'],
  crmBillBook: ['crm.billbook.access', 'crm.billbook.view', 'crm.billbook.add', 'crm.billbook.edit'],
  crmCustomer: ['crm.customer.access', 'crm.customer.view', 'crm.customer.add', 'crm.customer.edit', 'customerManagement'],
  crmBank: ['crm.bank.access', 'crm.bank.view', 'crm.bank.add', 'crm.bank.edit', 'crm.bank.delete'],
  crmMoney: ['crm.money.access', 'crm.money.view', 'crm.money.add', 'crm.money.status', 'crm.money.reports', 'crm.money.pnl'],
  crmEmployee: ['crm.employee.access', 'crm.employee.manage'],
  profileModule: ['profile.view', 'profile.receipts', 'profile.certificate', 'profile.password']
};

/**
 * Normalizes an array of permission IDs, expanding aliases.
 */
export const normalizePermissions = (rawPermissions) => {
  if (!Array.isArray(rawPermissions)) return [];
  const normalized = new Set();

  rawPermissions.forEach(p => {
    if (!p || typeof p !== 'string') return;
    const trimmed = p.trim();
    if (!trimmed) return;

    const mapped = PERMISSION_ALIASES[trimmed] || trimmed;
    normalized.add(mapped);

    // If an alias matched, also add the alias itself for backwards compatibility
    if (PERMISSION_ALIASES[trimmed]) {
      normalized.add(PERMISSION_ALIASES[trimmed]);
    }
  });

  return Array.from(normalized);
};

/**
 * Retrieves the currently active user's permissions from localStorage or memory.
 */
export const getStoredUserPermissions = () => {
  try {
    const raw = localStorage.getItem('userPermissions');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return normalizePermissions(parsed);
    }
    const userJson = localStorage.getItem('user');
    if (userJson) {
      const u = JSON.parse(userJson);
      if (Array.isArray(u.permissions)) return normalizePermissions(u.permissions);
    }
  } catch (e) {
    console.warn('Error reading stored user permissions:', e);
  }
  return [];
};

/**
 * Core permission check:
 * Returns true if the user is allowed to access the specified module or sub-permission.
 *
 * Rules:
 * 1. Admin always has full access.
 * 2. If user permissions contain 'none', access is completely revoked.
 * 3. If user permissions array is empty (unconfigured / default), user has full access.
 * 4. If user permissions has explicit items:
 *    - Direct match on permId returns true.
 *    - If checking a sub-permission and parent module is allowed, returns true.
 *    - If checking a parent module and ANY of its sub-permissions is allowed, returns true.
 */
export const hasUserAccess = (userOrPermissions, permissionId, userRole = null) => {
  if (!permissionId) return true;

  // Determine user role
  const role = (
    userRole ||
    (userOrPermissions && typeof userOrPermissions === 'object' && !Array.isArray(userOrPermissions) ? userOrPermissions.role : null) ||
    (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('userRole') : null) ||
    (typeof localStorage !== 'undefined' ? localStorage.getItem('userRole') : null) ||
    ''
  ).toLowerCase();

  const currentUsername = (
    (userOrPermissions && typeof userOrPermissions === 'object' && !Array.isArray(userOrPermissions) ? userOrPermissions.userId : null) ||
    (typeof localStorage !== 'undefined' ? localStorage.getItem('currentUser') : null) ||
    ''
  ).toLowerCase();

  if (role === 'admin' || currentUsername === 'admin') {
    return true;
  }

  // Extract raw permissions array
  let perms = [];
  if (Array.isArray(userOrPermissions)) {
    perms = userOrPermissions;
  } else if (userOrPermissions && Array.isArray(userOrPermissions.permissions)) {
    perms = userOrPermissions.permissions;
  } else {
    perms = getStoredUserPermissions();
  }

  const normalized = normalizePermissions(perms);

  const isEmployee = role === 'employee' ||
    (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('userRole') === 'employee') ||
    (typeof localStorage !== 'undefined' && localStorage.getItem('userRole') === 'employee') ||
    (typeof localStorage !== 'undefined' && (localStorage.getItem('currentUser') || '').includes('-EMP'));

  // If explicitly revoked / restricted to none
  if (normalized.includes('none')) {
    return false;
  }

  // If user is an employee and has empty permissions, they get NO access
  if (isEmployee && normalized.length === 0) {
    return false;
  }

  // If unconfigured (no permissions set in DB yet), default to full access only for non-employees
  if (normalized.length === 0) {
    return !isEmployee;
  }

  const target = PERMISSION_ALIASES[permissionId] || permissionId;

  // 1. Direct match
  if (normalized.includes(target)) {
    return true;
  }

  // 2. If target is a parent module, check if ANY sub-permission of that module is granted
  const subs = MODULE_SUB_MAP[target];
  if (subs && subs.some(subId => normalized.includes(subId))) {
    return true;
  }

  // 3. If target is a sub-permission, check if its parent module is granted (non-employees only)
  if (!isEmployee) {
    for (const [parentId, subList] of Object.entries(MODULE_SUB_MAP)) {
      if (subList.includes(target) && normalized.includes(parentId)) {
        // If the user's permissions array contains ANY sub-permission of this module,
        // then granular permissions are active and an unchecked sub-permission must NOT be granted!
        const hasGranularSubs = subList.some(subId => normalized.includes(subId));
        if (!hasGranularSubs) {
          return true;
        }
      }
    }
  }

  // 4. For tools: grant access by default to all active users unless explicitly revoked
  if (target === 'tools' || target === 'toolsModule' || target.startsWith('tools.')) {
    if (!normalized.includes('!tools') && !normalized.includes('none')) {
      return true;
    }
  }

  return false;
};

/**
 * Maps a PAN Card sub-tab ID to its normalized user permission key.
 */
export const getPanTabPermissionKey = (tabId) => {
  if (!tabId) return 'panCard';
  const clean = String(tabId).replace(/^pan_/, '').toLowerCase().trim();
  if (clean === 'manual_new_pan' || clean === 'manualnew' || clean === 'pan.manualnew') return 'pan.manualNew';
  if (clean === 'epan_kyc' || clean === 'epankyc' || clean === 'pan.epankyc') return 'pan.epanKyc';
  if (clean === 'epan_correction_otp' || clean === 'epancorrectionotp' || clean === 'pan.epancorrectionotp') return 'pan.epanCorrectionOtp';
  if (clean === 'epan_sign_photo' || clean === 'epansignphoto' || clean === 'pan.epansignphoto') return 'pan.epanSignPhoto';
  if (clean === 'epan_correction_sign_photo' || clean === 'epancorrectionsignphoto' || clean === 'pan.epancorrectionsignphoto') return 'pan.epanCorrectionSignPhoto';
  if (clean === 'epan_correction' || clean === 'manual_pan_correction' || clean === 'correction' || clean === 'pan.correction') return 'pan.correction';
  if (clean === 'find_pan_aadhaar' || clean === 'findpan' || clean === 'pan.findpan') return 'pan.findPan';
  if (clean === 'stamp_signature_merger' || clean === 'merger' || clean === 'pan.merger') return 'pan.merger';
  if (clean === 'history' || clean === 'submissions' || clean === 'pan.submissions') return 'pan.submissions';
  return `pan.${clean}`;
};
