import React, { useState, useEffect, useMemo } from 'react';
import { apiFetch } from '../../utils/apiClient';
import { hasUserAccess, getStoredUserPermissions } from '../../utils/userPermissions';
import CustomerManagementView from './CustomerManagementView';
import MyBillBookView from './MyBillBookView';
import BankAccountDetailsView from './BankAccountDetailsView';
import MoneyTransactionView from './MoneyTransactionView';
import EmployeeManagementView from './EmployeeManagementView';
import './CrmView.css';

// Fallback initial cards if network is delayed (7 Total CRM Cards)
const FALLBACK_CRM_CARDS = [
  {
    _id: 'task_fallback',
    cardId: 'task',
    title: 'Task',
    subtitle: 'Organize daily to-dos, assignments, and follow-ups.',
    icon: '📋',
    badge: 'Tasks',
    color: '#3b82f6',
    url: '/crm/task',
    isActive: true,
    order: 0
  },
  {
    _id: 'pending_fallback',
    cardId: 'pending_work',
    title: 'Pending Work',
    subtitle: 'Monitor, track, and clear customer pending applications.',
    icon: '⏳',
    badge: 'Pending',
    color: '#f59e0b',
    url: '/crm/pending-work',
    isActive: true,
    order: 1
  },
  {
    _id: 'bill_fallback',
    cardId: 'my_bill_book',
    title: 'My Bill Book',
    subtitle: 'Digital billing, invoice records, and ledger management.',
    icon: '📖',
    badge: 'Billing',
    color: '#10b981',
    url: '/crm/my-bill-book',
    isActive: true,
    order: 2
  },
  {
    _id: 'cust_fallback',
    cardId: 'customer_management',
    title: 'Customer Management',
    subtitle: 'Customer directory, contact details, and client profiles.',
    icon: '👥',
    badge: 'Clients',
    color: '#8b5cf6',
    url: '/crm/customer-management',
    isActive: true,
    order: 3
  },
  {
    _id: 'bank_fallback',
    cardId: 'bank_account_details',
    title: 'Bank Account Details',
    subtitle: 'Manage bank accounts and account information.',
    icon: '🏦',
    badge: 'Banking',
    color: '#0284c7',
    url: '/crm/bank-accounts',
    isActive: true,
    order: 4
  },
  {
    _id: 'money_fallback',
    cardId: 'money_transaction',
    title: 'Money Transaction',
    subtitle: 'Manage cash, online payments, commissions, and financial transactions.',
    icon: '💸',
    badge: 'Transactions',
    color: '#059669',
    url: '/crm/money-transactions',
    isActive: true,
    order: 5
  },
  {
    _id: 'emp_fallback',
    cardId: 'employee_management',
    title: 'Employee Management',
    subtitle: 'Manage employees, assign service permissions, provide login access, and track employee activities.',
    icon: '👔',
    badge: 'Staff & Team',
    color: '#6366f1',
    url: '/crm/employee-management',
    isActive: true,
    order: 6
  }
];

export default function CrmView({
  theme = 'light',
  user,
  currentUser = user,
  walletBalance,
  onBalanceUpdate,
  onClose,
  userPermissions
}) {
  const [cards, setCards] = useState(FALLBACK_CRM_CARDS);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCard, setSelectedCard] = useState(null);
  const [activeSubView, setActiveSubView] = useState(() => {
    if (typeof window !== 'undefined') {
      const path = window.location.pathname.toLowerCase();
      const perms = getStoredUserPermissions();
      if (path.includes('customer') && hasUserAccess(perms, 'crm.customer.access')) return 'customer_management';
      if (path.includes('bill') && hasUserAccess(perms, 'crm.billbook.access')) return 'my_bill_book';
      if (path.includes('bank') && hasUserAccess(perms, 'crm.bank.access')) return 'bank_account_details';
      if ((path.includes('money') || path.includes('transaction')) && hasUserAccess(perms, 'crm.money.access')) return 'money_transaction';
      if (path.includes('employee') && hasUserAccess(perms, 'crm.employee.access')) return 'employee_management';
    }
    return null;
  });

  // Fetch dynamic cards from backend API
  const fetchCrmCards = async () => {
    try {
      const res = await apiFetch('/api/crm/cards');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setCards(data);
        }
      }
    } catch (err) {
      console.warn('Using fallback CRM cards:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCrmCards();
  }, []);

  const effectivePermissions = useMemo(() => {
    return userPermissions || getStoredUserPermissions();
  }, [userPermissions]);

  // Filter only active cards (configured in Admin Panel) that user has permission to see, and search matches
  const activeCards = useMemo(() => {
    return cards
      .filter((card) => card.isActive !== false)
      .filter((card) => {
        const cid = (card.cardId || '').toLowerCase();
        const ctitle = (card.title || '').toLowerCase();

        if (cid === 'task' || ctitle.includes('task')) {
          return hasUserAccess(effectivePermissions, 'crm.task.access');
        }
        if (cid === 'pending_work' || ctitle.includes('pending')) {
          return hasUserAccess(effectivePermissions, 'crm.pending.access');
        }
        if (cid === 'my_bill_book' || ctitle.includes('bill')) {
          return hasUserAccess(effectivePermissions, 'crm.billbook.access');
        }
        if (cid === 'customer_management' || ctitle.includes('customer')) {
          return hasUserAccess(effectivePermissions, 'crm.customer.access');
        }
        if (cid === 'bank_account_details' || ctitle.includes('bank')) {
          return hasUserAccess(effectivePermissions, 'crm.bank.access');
        }
        if (cid === 'money_transaction' || ctitle.includes('money') || ctitle.includes('transaction')) {
          return hasUserAccess(effectivePermissions, 'crm.money.access');
        }
        if (cid === 'employee_management' || ctitle.includes('employee')) {
          return hasUserAccess(effectivePermissions, 'crm.employee.access');
        }
        return true;
      })
      .filter((card) => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (
          (card.title || '').toLowerCase().includes(q) ||
          (card.subtitle || '').toLowerCase().includes(q) ||
          (card.badge || '').toLowerCase().includes(q)
        );
      });
  }, [cards, searchQuery, effectivePermissions]);

  const handleCardClick = (card) => {
    const cid = (card.cardId || '').toLowerCase();
    const ctitle = (card.title || '').toLowerCase();

    if (cid === 'customer_management' || ctitle.includes('customer')) {
      if (!hasUserAccess(effectivePermissions, 'crm.customer.access')) return;
      setActiveSubView('customer_management');
      return;
    }
    if (cid === 'my_bill_book' || ctitle.includes('bill')) {
      if (!hasUserAccess(effectivePermissions, 'crm.billbook.access')) return;
      setActiveSubView('my_bill_book');
      return;
    }
    if (cid === 'bank_account_details' || ctitle.includes('bank')) {
      if (!hasUserAccess(effectivePermissions, 'crm.bank.access')) return;
      setActiveSubView('bank_account_details');
      return;
    }
    if (cid === 'money_transaction' || ctitle.includes('money') || ctitle.includes('transaction')) {
      if (!hasUserAccess(effectivePermissions, 'crm.money.access')) return;
      setActiveSubView('money_transaction');
      return;
    }
    if (cid === 'employee_management' || ctitle.includes('employee')) {
      if (!hasUserAccess(effectivePermissions, 'crm.employee.access')) return;
      setActiveSubView('employee_management');
      return;
    }
    setSelectedCard(card);
  };

  if (activeSubView === 'customer_management' && hasUserAccess(effectivePermissions, 'crm.customer.access')) {
    return (
      <CustomerManagementView
        user={currentUser}
        userPermissions={effectivePermissions}
        onBack={() => setActiveSubView(null)}
      />
    );
  }

  if (activeSubView === 'my_bill_book' && hasUserAccess(effectivePermissions, 'crm.billbook.access')) {
    return (
      <MyBillBookView
        user={currentUser}
        userPermissions={effectivePermissions}
        onBack={() => setActiveSubView(null)}
      />
    );
  }

  if (activeSubView === 'bank_account_details' && hasUserAccess(effectivePermissions, 'crm.bank.access')) {
    return (
      <BankAccountDetailsView
        user={currentUser}
        userPermissions={effectivePermissions}
        onBack={() => setActiveSubView(null)}
        onNavigateToMoneyTxn={() => setActiveSubView('money_transaction')}
      />
    );
  }

  if (activeSubView === 'money_transaction' && hasUserAccess(effectivePermissions, 'crm.money.access')) {
    return (
      <MoneyTransactionView
        user={currentUser}
        userPermissions={effectivePermissions}
        onBack={() => setActiveSubView(null)}
        onNavigateToBankAccounts={() => setActiveSubView('bank_account_details')}
        onNavigateToBillBook={() => setActiveSubView('my_bill_book')}
      />
    );
  }

  if (activeSubView === 'employee_management' && hasUserAccess(effectivePermissions, 'crm.employee.access')) {
    return (
      <EmployeeManagementView
        user={currentUser}
        userPermissions={effectivePermissions}
        onBack={() => setActiveSubView(null)}
      />
    );
  }

  return (
    <div className={`crm-view-container theme-${theme}`}>
      {/* CRM Header Banner */}
      <div className="crm-header-card">
        <div className="crm-header-left">
          <div className="crm-header-icon-box">👥</div>
          <div className="crm-header-text">
            <h2>
              CRM — Customer Relationship & Operations
              <span className="crm-header-badge">CRM Suite</span>
            </h2>
            <p>
              Manage tasks, pending works, digital bill books, customers, bank accounts, transactions, and employees seamlessly.
            </p>
          </div>
        </div>

        <div className="crm-header-actions">
          {onClose && (
            <button
              type="button"
              className="crm-back-btn"
              onClick={onClose}
              title="Return to Dashboard"
            >
              ← Back to Dashboard
            </button>
          )}
        </div>
      </div>

      {/* Toolbar: Search & Statistics */}
      <div className="crm-toolbar">
        <div className="crm-search-box">
          <span className="crm-search-icon">🔍</span>
          <input
            type="text"
            className="crm-search-input"
            placeholder="Search CRM modules (e.g. Task, Pending, Bill Book, Customer)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="crm-toolbar-stats">
          <span className="crm-count-pill">
            ✓ {activeCards.length} Modules Available
          </span>
        </div>
      </div>

      {/* Cards Grid */}
      {loading ? (
        <div className="crm-loading-state">
          <div className="crm-state-icon">⏳</div>
          <h3 className="crm-state-title">Loading CRM Modules...</h3>
          <p className="crm-state-desc">Fetching dynamic card configurations.</p>
        </div>
      ) : activeCards.length === 0 ? (
        <div className="crm-empty-state">
          <div className="crm-state-icon">📂</div>
          <h3 className="crm-state-title">No CRM Cards Available</h3>
          <p className="crm-state-desc">
            {searchQuery
              ? `No modules matched your search "${searchQuery}".`
              : 'Cards enabled in the Admin Panel will appear here.'}
          </p>
        </div>
      ) : (
        <div className="crm-cards-grid">
          {activeCards.map((card) => {
            const cardAccent = card.color || '#ea580c';
            return (
              <div
                key={card._id || card.cardId}
                className="crm-card-item"
                style={{ '--card-accent': cardAccent }}
                onClick={() => handleCardClick(card)}
                title={`Click to open ${card.title}`}
              >
                <div>
                  <div className="crm-card-top">
                    <div
                      className="crm-card-icon-wrap"
                      style={{
                        background: `${cardAccent}18`,
                        borderColor: `${cardAccent}40`
                      }}
                    >
                      <span style={{ fontSize: '24px' }}>{card.icon || '📋'}</span>
                    </div>

                    {card.badge && (
                      <span
                        className="crm-card-badge"
                        style={{
                          background: `${cardAccent}15`,
                          color: cardAccent
                        }}
                      >
                        {card.badge}
                      </span>
                    )}
                  </div>

                  <div className="crm-card-body">
                    <h3 className="crm-card-title">{card.title}</h3>
                    <p className="crm-card-desc">
                      {card.subtitle || 'Click to access this CRM operations module.'}
                    </p>
                  </div>
                </div>

                <div className="crm-card-footer">
                  <span className="crm-card-action-text" style={{ color: cardAccent }}>
                    Open Module
                    <span className="crm-card-chevron">→</span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Interactive Module Modal (Basic Navigation Structure) */}
      {selectedCard && (
        <div className="crm-modal-backdrop" onClick={() => setSelectedCard(null)}>
          <div className="crm-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="crm-modal-header">
              <div className="crm-modal-title-wrap">
                <div
                  className="crm-modal-icon"
                  style={{ background: selectedCard.color || '#ea580c' }}
                >
                  {selectedCard.icon || '📋'}
                </div>
                <div>
                  <h3 className="crm-modal-title">{selectedCard.title}</h3>
                  <p className="crm-modal-sub">CRM Operation Workspace</p>
                </div>
              </div>
              <button
                type="button"
                className="crm-modal-close-btn"
                onClick={() => setSelectedCard(null)}
                title="Close"
              >
                ✕
              </button>
            </div>

            <div className="crm-modal-body">
              {selectedCard.badge && (
                <span
                  className="crm-modal-badge"
                  style={{
                    color: selectedCard.color || '#ea580c',
                    borderColor: `${selectedCard.color || '#ea580c'}55`,
                    background: `${selectedCard.color || '#ea580c'}15`
                  }}
                >
                  {selectedCard.badge}
                </span>
              )}

              <p className="crm-modal-body-desc">
                {selectedCard.subtitle || `Access and manage ${selectedCard.title} operations.`}
              </p>

              <div className="crm-modal-info-box">
                <span style={{ fontSize: '24px' }}>💡</span>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '13px', color: '#0f172a' }}>
                    Module Navigation Initialized
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '3px' }}>
                    This card is dynamically managed via Admin Panel. Workflows for{' '}
                    <strong>{selectedCard.title}</strong> can be integrated or configured with custom URLs.
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'center', gap: '10px' }}>
                <button
                  type="button"
                  className="crm-modal-btn-primary"
                  onClick={() => setSelectedCard(null)}
                >
                  ✓ Close Preview
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
