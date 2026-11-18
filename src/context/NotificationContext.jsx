import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { apiFetch } from '../utils/apiClient';
import { createNotificationSocket } from '../utils/socketClient';

const NotificationContext = createContext(null);

export const NotificationProvider = ({ children }) => {
  const location = useLocation();
  const [notifications, setNotifications] = useState([]);
  const [connectionState, setConnectionState] = useState('connecting');

  useEffect(() => {
    const userId = localStorage.getItem('currentUser');
    if (!userId) {
      setNotifications([]);
      setConnectionState('offline');
      return undefined;
    }

    const role = userId.toLowerCase() === 'admin' ? 'admin' : '';
    let active = true;
    const query = role ? `role=${role}` : `userId=${encodeURIComponent(userId)}`;

    apiFetch(`/api/notifications?${query}`)
      .then(response => response.ok ? response.json() : Promise.reject(new Error('Unable to load notifications')))
      .then(data => {
        if (active && data.success) setNotifications(data.notifications || []);
      })
      .catch(error => console.error('Notification history error:', error));

    const socket = createNotificationSocket(userId, role);
    socket.on('connect', () => active && setConnectionState('connected'));
    socket.on('disconnect', () => active && setConnectionState('offline'));
    socket.on('connect_error', error => {
      console.error('Notification socket error:', error.message);
      if (active) setConnectionState('offline');
    });
    socket.on('notification:new', notification => {
      if (!active) return;
      setNotifications(previous => [notification, ...previous.filter(item => item._id !== notification._id)].slice(0, 50));
    });

    return () => {
      active = false;
      socket.disconnect();
    };
  }, [location.pathname]);

  const markRead = async (notificationId) => {
    setNotifications(previous => previous.map(item => item._id === notificationId ? { ...item, readAt: new Date().toISOString() } : item));
    try {
      await apiFetch(`/api/notifications/${notificationId}/read`, { method: 'PATCH' });
    } catch (error) {
      console.error('Notification read update error:', error);
    }
  };

  const markAllRead = async () => {
    const userId = localStorage.getItem('currentUser');
    if (!userId) return;
    const role = userId.toLowerCase() === 'admin' ? 'admin' : '';
    try {
      const response = await apiFetch('/api/notifications/read-all', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(role ? { role } : { userId })
      });
      if (!response.ok) throw new Error('Unable to mark notifications as read');
      setNotifications([]);
    } catch (error) {
      console.error('Notification read-all update error:', error);
    }
  };

  const value = useMemo(() => ({
    notifications,
    unreadCount: notifications.filter(item => !item.readAt).length,
    connectionState,
    markRead,
    markAllRead
  }), [notifications, connectionState]);

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) throw new Error('useNotifications must be used inside NotificationProvider');
  return context;
};
