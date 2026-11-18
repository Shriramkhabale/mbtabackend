import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import './AdminLogin.css';
import logoImg from '../../assets/logo.png';
import cityBg from '../../assets/city_bg.png';
import { API_URL } from '../../utils/apiClient';

const ADMIN_EMAIL = 'mbtravels08@gmail.com';
const ADMIN_PASSWORD = '123456';

const AdminLogin = () => {
  const navigate = useNavigate();

  // Unified form states
  const [identity, setIdentity] = useState('');
  const [password, setPassword] = useState('');

  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Unified Login Handler (Admin & Staff)
  const handleLogin = async (e) => {
    if (e) e.preventDefault();
    const cleanIdentity = identity.trim().toLowerCase();
    const cleanPass = password;

    if (!cleanIdentity) {
      return Swal.fire({ icon: 'warning', text: 'Please enter your Admin Email or Staff Username.', confirmButtonColor: '#ea580c' });
    }
    if (!cleanPass) {
      return Swal.fire({ icon: 'warning', text: 'Please enter your Password.', confirmButtonColor: '#ea580c' });
    }

    setIsLoading(true);

    // 1. Check Admin Credentials first
    if (cleanIdentity === ADMIN_EMAIL && cleanPass === ADMIN_PASSWORD) {
      sessionStorage.setItem('adminAuth', 'true');
      sessionStorage.setItem('currentUser', 'admin');
      sessionStorage.setItem('adminEmail', cleanIdentity);
      sessionStorage.setItem('userRole', 'admin');
      sessionStorage.removeItem('staffPermissions');
      sessionStorage.removeItem('staffName');

      localStorage.setItem('adminAuth', 'true');
      localStorage.setItem('currentUser', 'admin');
      localStorage.setItem('adminEmail', cleanIdentity);
      localStorage.setItem('userRole', 'admin');
      localStorage.removeItem('staffPermissions');
      localStorage.removeItem('staffName');

      // Acquire signed Admin session token for OTP-free customer management
      try {
        const tokenRes = await fetch(`${API_URL}/api/crm/admin/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: cleanIdentity, password: cleanPass })
        });
        const tokenData = await tokenRes.json();
        if (tokenData.success && tokenData.token) {
          sessionStorage.setItem('adminSessionToken', tokenData.token);
          localStorage.setItem('adminSessionToken', tokenData.token);
        }
      } catch (err) {
        console.warn('Admin session token pre-fetch deferred:', err);
      }

      Swal.fire({
        icon: 'success',
        title: 'Admin Access Granted',
        text: 'Welcome to MB MITRA Administrative Panel.',
        timer: 1600,
        showConfirmButton: false
      });

      setTimeout(() => {
        navigate('/admin-panel');
      }, 1000);
      return;
    }

    // 2. Check Staff Credentials via backend
    try {
      const response = await fetch(`${API_URL}/api/staff/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: cleanIdentity, password: cleanPass })
      });
      const data = await response.json();

      if (response.ok && data.success) {
        sessionStorage.setItem('adminAuth', 'true');
        sessionStorage.setItem('currentUser', data.staff.username);
        sessionStorage.setItem('staffName', data.staff.name);
        sessionStorage.setItem('userRole', 'staff');
        sessionStorage.setItem('staffPermissions', JSON.stringify(data.staff.permissions || []));

        localStorage.setItem('adminAuth', 'true');
        localStorage.setItem('currentUser', data.staff.username);
        localStorage.setItem('staffName', data.staff.name);
        localStorage.setItem('userRole', 'staff');
        localStorage.setItem('staffPermissions', JSON.stringify(data.staff.permissions || []));

        Swal.fire({
          icon: 'success',
          title: 'Staff Access Granted',
          text: `Welcome back, ${data.staff.name}!`,
          timer: 1600,
          showConfirmButton: false
        });

        setTimeout(() => {
          navigate('/admin-panel');
        }, 1000);
      } else {
        Swal.fire({
          icon: 'error',
          title: 'Authentication Failed',
          text: data.message || 'Invalid Email / Username or Password.',
          confirmButtonColor: '#ea580c'
        });
      }
    } catch (err) {
      console.error('Login error:', err);
      Swal.fire({
        icon: 'error',
        title: 'Server Error',
        text: 'Could not connect to authentication server.',
        confirmButtonColor: '#ea580c'
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="admin-login-wrapper" style={{ backgroundImage: `url(${cityBg})` }}>
      <div className="admin-login-overlay"></div>

      {/* Decorative Glow Orbs */}
      <div className="admin-orb admin-orb-1"></div>
      <div className="admin-orb admin-orb-2"></div>

      <div className="admin-login-card">
        {/* Header Branding */}
        <div className="admin-login-header">
          <div className="admin-badge-icon">
            <img src={logoImg} alt="MB MITRA Admin" className="admin-logo-img" />
          </div>
          <h1 className="admin-brand-title">
            <span className="brand-orange">MB</span> <span className="brand-white">MITRA</span>
          </h1>
          <span className="admin-security-tag">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            ADMIN & STAFF SECURITY PORTAL
          </span>
          <p className="admin-login-subtitle">
            Enter administrative or staff member credentials
          </p>
        </div>

        {/* UNIFIED LOGIN FORM */}
        <form className="admin-form-step" onSubmit={handleLogin} autoComplete="off">
          {/* Identity Field */}
          <div className="admin-input-group">
            <label htmlFor="admin-identity">Email Address / Username</label>
            <div className="admin-input-box">
              <span className="admin-input-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </span>
              <input
                id="admin-identity"
                type="text"
                placeholder="Enter Email or Staff Username"
                value={identity}
                onChange={(e) => setIdentity(e.target.value)}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck="false"
                required
              />
            </div>
          </div>

          {/* Password Field */}
          <div className="admin-input-group">
            <label htmlFor="admin-password">Password</label>
            <div className="admin-input-box">
              <span className="admin-input-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </span>
              <input
                id="admin-password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
              <button
                type="button"
                className="password-toggle-btn"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex="-1"
              >
                {showPassword ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <button type="submit" className="admin-primary-btn" disabled={isLoading}>
            {isLoading ? (
              <span className="btn-spinner"></span>
            ) : (
              <>
                <span>Login to Portal</span>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </>
            )}
          </button>
        </form>

        {/* Footer Back Link */}
        <div className="admin-login-footer">
          <button
            type="button"
            className="back-to-portal-link"
            onClick={() => navigate('/login')}
          >
            ← Return to MB MITRA Retailer Portal
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminLogin;
