/**
 * Comprehensive Employee Permissions Definition & Authorization Filter
 * Implements Section 7 requirements:
 * "An employee can receive only those services that the parent retailer is already authorized to access.
 * Effective Permission = Parent Retailer Authorized Permissions AND Employee Assigned Permissions."
 */

const PERMISSION_CATALOG = [
  {
    id: 'dashboard',
    title: 'A. Dashboard',
    icon: '📊',
    description: 'Dashboard overview, statistics, and work summaries',
    requiredParentKeys: ['dashboardNavModule', 'dashboard.actionCards', 'dashboard.topTabs'],
    permissions: [
      { id: 'dashboard.view', label: 'View Dashboard', default: true },
      { id: 'dashboard.stats', label: 'View Dashboard Statistics', default: true },
      { id: 'dashboard.assignedWork', label: 'View Assigned Work', default: true },
      { id: 'dashboard.activitySummary', label: 'View Activity Summary', default: true }
    ]
  },
  {
    id: 'offlineWork',
    title: 'B. Offline Work',
    icon: '📁',
    description: 'Offline services, applications, and work status management',
    requiredParentKeys: ['offlineWork', 'offlineWork.view'],
    permissions: [
      { id: 'offlineWork.access', label: 'Access Offline Work', default: false },
      { id: 'offlineWork.view', label: 'View Offline Work', default: false },
      { id: 'offlineWork.add', label: 'Add Offline Work', default: false },
      { id: 'offlineWork.edit', label: 'Edit Offline Work', default: false },
      { id: 'offlineWork.status', label: 'Update Work Status', default: false },
      { id: 'offlineWork.history', label: 'View Work History', default: false }
    ]
  },
  {
    id: 'panCard',
    title: 'C. PAN Card Services',
    icon: '💳',
    description: 'PAN applications, document upload/download, and tracking',
    requiredParentKeys: ['panCard', 'pan.submissions'],
    permissions: [
      { id: 'pan.access', label: 'Access PAN Card Services', default: false },
      { id: 'pan.create', label: 'Create PAN Application', default: false },
      { id: 'pan.view', label: 'View PAN Applications', default: false },
      { id: 'pan.edit', label: 'Edit PAN Applications', default: false },
      { id: 'pan.upload', label: 'Upload Documents', default: false },
      { id: 'pan.download', label: 'Download Documents', default: false },
      { id: 'pan.status', label: 'Track Application Status', default: false }
    ]
  },
  {
    id: 'tools',
    title: 'D. Tools & Utilities',
    icon: '⚡',
    description: 'Card cutters, converters, image enhancers, and utilities',
    requiredParentKeys: ['toolsModule', 'tools.view'],
    permissions: [
      { id: 'tools.access', label: 'Access Tools', default: false },
      { id: 'tools.view', label: 'View Available Tools', default: false },
      { id: 'tools.use', label: 'Use Individual Tools', default: false },
      { id: 'tools.pdf', label: 'Access PDF Tools', default: false },
      { id: 'tools.other', label: 'Access Other Enabled Tools', default: false }
    ]
  },
  {
    id: 'crm',
    title: 'E. CRM Suite',
    icon: '👥',
    description: 'Customer relations, tasks, billing, banking, and remittances',
    requiredParentKeys: [
      'crm', 'crmModule', 'crmCore', 'customerManagement', 'myBillBook',
      'crmTask', 'crmPending', 'crmBillBook', 'crmCustomer', 'crmBank', 'crmMoney', 'crmEmployee'
    ], // General CRM availability
    permissions: [
      { id: 'crm.access', label: 'Access CRM Suite', default: false },
      { id: 'crm.dashboard', label: 'View CRM Dashboard', default: false },

      // Task
      { id: 'crm.task.access', label: 'Task: Access Module', default: false },
      { id: 'crm.task.add', label: 'Task: Add Task', default: false },
      { id: 'crm.task.edit', label: 'Task: Edit Task', default: false },
      { id: 'crm.task.delete', label: 'Task: Delete Task', default: false },

      // Pending Work
      { id: 'crm.pending.access', label: 'Pending Work: Access Module', default: false },
      { id: 'crm.pending.view', label: 'Pending Work: View List', default: false },
      { id: 'crm.pending.update', label: 'Pending Work: Update Status', default: false },

      // My Bill Book
      { id: 'crm.billbook.access', label: 'My Bill Book: Access Module', default: false },
      { id: 'crm.billbook.view', label: 'My Bill Book: View Ledger', default: false },
      { id: 'crm.billbook.add', label: 'My Bill Book: Add Billing Entries', default: false },
      { id: 'crm.billbook.edit', label: 'My Bill Book: Edit Billing Entries', default: false },

      // Customer Management
      { id: 'crm.customer.access', label: 'Customer Management: Access Module', default: false },
      { id: 'crm.customer.view', label: 'Customer Management: View Customers', default: false },
      { id: 'crm.customer.add', label: 'Customer Management: Add Customers', default: false },
      { id: 'crm.customer.edit', label: 'Customer Management: Edit Customers', default: false },

      // Bank Account Details
      { id: 'crm.bank.access', label: 'Bank Accounts: Access Module', default: false },
      { id: 'crm.bank.view', label: 'Bank Accounts: View Accounts', default: false },
      { id: 'crm.bank.add', label: 'Bank Accounts: Add Bank Accounts', default: false },
      { id: 'crm.bank.edit', label: 'Bank Accounts: Edit Bank Accounts', default: false },
      { id: 'crm.bank.delete', label: 'Bank Accounts: Delete Bank Accounts', default: false },

      // Money Transaction
      { id: 'crm.money.access', label: 'Money Transaction: Access Module', default: false },
      { id: 'crm.money.view', label: 'Money Transaction: View Transactions', default: false },
      { id: 'crm.money.add', label: 'Money Transaction: Add Transactions', default: false },
      { id: 'crm.money.status', label: 'Money Transaction: Update Status / UTR', default: false },
      { id: 'crm.money.reports', label: 'Money Transaction: View Financial Reports', default: false },
      { id: 'crm.money.pnl', label: 'Money Transaction: View Profit & Loss', default: false },

      // Employee Management
      { id: 'crm.employee.access', label: 'Employee Management: Access Module', default: false },
      { id: 'crm.employee.manage', label: 'Employee Management: Manage Other Employees', default: false }
    ]
  },
  {
    id: 'walletAndServices',
    title: 'F. Wallet & Other Services',
    icon: '💰',
    description: 'Wallet operations, balance, remittances, and quick navigation',
    requiredParentKeys: ['walletModule', 'quickLinksModule'],
    permissions: [
      { id: 'wallet.points', label: 'Wallet Points', default: false },
      { id: 'wallet.addAmount', label: 'Add Amount (Requisition)', default: false },
      { id: 'wallet.recharge', label: 'Recharge Service', default: false },
      { id: 'wallet.travels', label: 'Travels Booking', default: false },
      { id: 'wallet.dmt', label: 'DMT (Domestic Money Transfer)', default: false },
      { id: 'wallet.dth', label: 'DTH Recharge', default: false },
      { id: 'wallet.ledger', label: 'Wallet Ledger & History', default: false },
      { id: 'quicklinks.access', label: 'Quick Links Access', default: false }
    ]
  }
];

/**
 * Returns all permission IDs authorized to the given retailer User record.
 * Admins have all permissions.
 * Retailers have all permissions present in their `permissions` array or default permissions.
 */
function getRetailerAuthorizedPermissionIds(retailerUser) {
  if (!retailerUser) return [];

  // Admin has access to everything
  if (retailerUser.role === 'admin') {
    return PERMISSION_CATALOG.flatMap(c => c.permissions.map(p => p.id));
  }

  const userPerms = Array.isArray(retailerUser.permissions) ? retailerUser.permissions : [];

  if (userPerms.includes('none')) {
    return [];
  }

  // If user has default permissions (empty array), grant all
  if (userPerms.length === 0) {
    return PERMISSION_CATALOG.flatMap(c => c.permissions.map(p => p.id));
  }

  const authorizedIds = new Set();

  PERMISSION_CATALOG.forEach(category => {
    const catPermIds = category.permissions.map(p => p.id);
    const hasAnyGranular = catPermIds.some(pid => userPerms.includes(pid));

    if (hasAnyGranular) {
      catPermIds.forEach(pid => {
        if (userPerms.includes(pid)) {
          authorizedIds.add(pid);
        }
      });
    } else {
      const hasCategoryAccess = category.requiredParentKeys.some(key => userPerms.includes(key)) ||
        userPerms.includes(category.id);
      if (hasCategoryAccess) {
        catPermIds.forEach(pid => authorizedIds.add(pid));
      }
    }
  });

  return Array.from(authorizedIds);
}

/**
 * Sanitizes requested permissions for an employee against parent retailer's permissions.
 * STRICT ENFORCEMENT: An employee cannot receive any permission the retailer does not hold.
 */
function sanitizeEmployeePermissions(requestedPermissions = [], retailerUser) {
  if (!Array.isArray(requestedPermissions)) return [];
  const allowedSet = new Set(getRetailerAuthorizedPermissionIds(retailerUser));
  return requestedPermissions.filter(pid => allowedSet.has(pid));
}

/**
 * Check if a single permission is granted to an employee
 */
function hasPermission(employee, permissionId) {
  if (!employee) return false;
  if (!Array.isArray(employee.permissions)) return false;
  return employee.permissions.includes(permissionId);
}

module.exports = {
  PERMISSION_CATALOG,
  getRetailerAuthorizedPermissionIds,
  sanitizeEmployeePermissions,
  hasPermission
};
