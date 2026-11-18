/**
 * Centralized API Client and Base URL Resolver
 * 
 * Supports:
 *  1. Explicitly configured REACT_APP_API_URL (e.g. http://localhost:5000 for local dev)
 *  2. Relative routing in production (/api) when REACT_APP_API_URL is empty or not configured
 *  3. Zero-config fallback to http://localhost:5000 during local browser development
 */

export const getApiBaseUrl = () => {
  const configuredUrl = process.env.REACT_APP_API_URL;

  // 1. If explicitly set and non-empty, use it
  if (configuredUrl && configuredUrl.trim()) {
    return configuredUrl.trim().replace(/\/$/, '');
  }

  // 2. Check browser runtime environment
  const isBrowser = typeof window !== 'undefined';
  const hostname = (isBrowser && window.location.hostname) || 'localhost';

  // 3. In production (non-localhost hostname), use empty string for relative /api routing
  // This allows Hostinger Nginx reverse-proxy to route /api requests cleanly to the Node backend
  if (isBrowser && hostname !== 'localhost' && hostname !== '127.0.0.1') {
    return '';
  }

  // 4. Default for local development on localhost
  return `http://${hostname}:5000`;
};

export const API_URL = getApiBaseUrl();

export const apiFetch = (path, options) => {
  const base = getApiBaseUrl();
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return fetch(`${base}${cleanPath}`, options);
};
