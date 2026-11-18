import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from './NotificationContext';

const NotificationBell = ({ dark = false }) => {
  const [open, setOpen] = useState(false);
  const { notifications, unreadCount, connectionState, markRead, markAllRead } = useNotifications();
  const navigate = useNavigate();

  const handleNotificationClick = (notification) => {
    markRead(notification._id);
    setOpen(false);

    const receiptUrl = notification.data?.receiptUrl || notification.receiptUrl;
    if (receiptUrl) {
      window.open(receiptUrl, '_blank');
    }

    const text = `${notification.title || ''} ${notification.message || ''}`.toLowerCase();
    if (text.includes('pan') || text.includes('receipt') || text.includes('application')) {
      navigate('/pancard?tab=history');
    }
  };

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        aria-label="Open notifications"
        title={connectionState === 'connected' ? 'Notifications live' : 'Notifications reconnecting'}
        onClick={() => setOpen(value => !value)}
        style={{ border: 0, background: 'transparent', color: dark ? '#f8fafc' : '#1e293b', cursor: 'pointer', fontSize: '22px', position: 'relative', padding: '4px' }}
      >
        🔔
        {unreadCount > 0 && <span style={{ position: 'absolute', top: '-3px', right: '-6px', minWidth: '17px', height: '17px', borderRadius: '10px', background: '#ef4444', color: '#fff', fontSize: '10px', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #fff' }}>{unreadCount > 99 ? '99+' : unreadCount}</span>}
      </button>

      {open && (
        <div style={{ position: 'absolute', top: '38px', right: 0, width: '350px', maxWidth: 'calc(100vw - 24px)', background: '#1e2228', color: '#f8fafc', border: '1.5px solid #ea580c', borderRadius: '14px', boxShadow: '0 18px 45px rgba(0,0,0,0.8), 0 0 20px rgba(234, 88, 12, 0.2)', zIndex: 100000, overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid rgba(234, 88, 12, 0.25)', background: '#16191d' }}>
            <strong style={{ fontSize: '14px', color: '#fb923c' }}>Notifications</strong>
            <button type="button" onClick={markAllRead} style={{ border: 0, background: 'transparent', color: '#38bdf8', cursor: 'pointer', fontSize: '12px', fontWeight: 700 }}>Mark all read</button>
          </div>
          <div style={{ maxHeight: '340px', overflowY: 'auto' }}>
            {notifications.length === 0 ? (
              <div style={{ padding: '24px 15px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>No notifications yet</div>
            ) : notifications.map(notification => {
              const receiptUrl = notification.data?.receiptUrl || notification.receiptUrl;
              return (
                <div
                  key={notification._id}
                  onClick={() => handleNotificationClick(notification)}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '12px 16px', border: 0, borderBottom: '1px solid rgba(255, 255, 255, 0.06)', background: notification.readAt ? '#1a1d22' : 'rgba(234, 88, 12, 0.12)', cursor: 'pointer', transition: 'background 0.2s' }}
                >
                  <div style={{ fontWeight: 700, fontSize: '13px', marginBottom: '4px', color: '#f8fafc' }}>{notification.title}</div>
                  <div style={{ color: '#cbd5e1', fontSize: '12px', lineHeight: 1.4 }}>{notification.message}</div>
                  {receiptUrl && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        markRead(notification._id);
                        window.open(receiptUrl, '_blank');
                      }}
                      style={{
                        marginTop: '8px',
                        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '5px 12px',
                        fontSize: '11px',
                        fontWeight: '800',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)'
                      }}
                    >
                      📥 Download Approved Receipt
                    </button>
                  )}
                  <div style={{ color: '#64748b', fontSize: '10px', marginTop: '6px' }}>{new Date(notification.createdAt).toLocaleString()}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;

