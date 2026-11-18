import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import './Login.css';
import logoImg from '../../assets/logo.png';
import aepsBgImg from '../../assets/aeps_bg.png';
import { API_URL } from '../../utils/apiClient';

// eslint-disable-next-line no-unused-vars
const Toast = Swal.mixin({
  toast: true,
  position: 'top-end',
  showConfirmButton: false,
  timer: 5000,
  timerProgressBar: true
});

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [newsImagesList, setNewsImagesList] = useState(() => {
    try {
      const saved = localStorage.getItem('cached_news_images');
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  });
  const [currentNewsIndex, setCurrentNewsIndex] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const [authStep, setAuthStep] = useState(1);
  const [mobile, setMobile] = useState('');
  const [isEditingMobile, setIsEditingMobile] = useState(false);
  const [otp, setOtp] = useState('');
  const [role, setRole] = useState('');

  const maskMobileNumber = (phone) => {
    if (!phone) return '*******';
    const clean = phone.toString().replace(/\D/g, '');
    if (clean.length >= 10) {
      const last3 = clean.slice(-3);
      return `*******${last3}`;
    }
    if (clean.length > 3) {
      const last3 = clean.slice(-3);
      const maskedPart = '*'.repeat(clean.length - 3);
      return `${maskedPart}${last3}`;
    }
    return clean;
  };

  const [newPassword, setNewPassword] = useState('');
  const [signUpData, setSignUpData] = useState({
    fullName: '',
    mobile: '',
    shopName: '',
    email: '',
    businessAddress: '',
    password: '',
    confirmPassword: '',
    regOtp: '',
    isRegOtpSent: false,
    isRegOtpVerified: false
  });
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const [showRegisterConfirmPassword, setShowRegisterConfirmPassword] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/api/news-images`)
      .then(res => res.json())
      .then(data => {
        if (data && Array.isArray(data) && data.length > 0) {
          const urls = data.map(item => item.img).filter(Boolean);
          if (urls.length > 0) {
            setNewsImagesList(urls);
            try {
              localStorage.setItem('cached_news_images', JSON.stringify(urls));
            } catch (e) { }
          }
        }
      })
      .catch(err => console.error("Error fetching news images:", err));
  }, []);

  // Automatic Slideshow Timer for Multiple Uploaded Images
  useEffect(() => {
    if (newsImagesList.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentNewsIndex(prevIndex => (prevIndex + 1) % newsImagesList.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [newsImagesList]);

  const currentNewsImage = newsImagesList.length > 0
    ? newsImagesList[currentNewsIndex % newsImagesList.length]
    : aepsBgImg;

  const triggerAutoLoginOtp = async (userMobile) => {
    if (!userMobile || userMobile.length < 10) return;
    try {
      await fetch(`${API_URL}/api/users/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile: userMobile }),
      });
    } catch (e) {
      console.error("Auto OTP send error:", e);
    }
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch(`${API_URL}/api/users/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, password }),
      });
      const data = await response.json();
      if (response.ok) {
        const canonicalUserId = (data.user && data.user.userId) ? data.user.userId : userId;
        if (userId === 'admin' || (data.user && data.user.role === 'admin')) {
          localStorage.setItem('currentUser', canonicalUserId);
          navigate('/admin-login');
          return;
        }

        // Store canonical user ID so all features (Pay-In, Ledger, Wallet) have the canonical ID
        setUserId(canonicalUserId);
        localStorage.setItem('currentUser', canonicalUserId);
        if (data.user) {
          localStorage.setItem('user', JSON.stringify(data.user));
          if (Array.isArray(data.user.permissions)) {
            localStorage.setItem('userPermissions', JSON.stringify(data.user.permissions));
          }
          if (data.user.role) {
            localStorage.setItem('userRole', data.user.role);
          }
        }

        const targetMobile = (data.user && data.user.mobile) ? data.user.mobile : mobile;
        if (targetMobile) {
          setMobile(targetMobile);
          triggerAutoLoginOtp(targetMobile);
        }
        if (data.user && data.user.role) {
          setRole(data.user.role);
        }
        setAuthStep(2); // Proceed directly to 2FA OTP Step
      } else {
        Swal.fire({ icon: 'error', text: data.message || 'Invalid User ID or Password.', confirmButtonText: 'OK' });
      }
    } catch (error) {
      Swal.fire({ icon: 'error', text: 'Failed to connect to the server.', confirmButtonText: 'OK' });
    }
  };

  const handleSendOtp = async (e) => {
    if (e) e.preventDefault();
    if (mobile.length !== 10) return Swal.fire({ icon: 'warning', text: "Enter valid 10-digit mobile number", confirmButtonText: 'OK' });

    try {
      const response = await fetch(`${API_URL}/api/users/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile }),
      });
      const data = await response.json();
      if (response.ok) {
        setAuthStep(3);
        Swal.fire({ icon: 'success', text: data.message || 'OTP Sent Successfully!', confirmButtonText: 'OK' });
      } else {
        Swal.fire({ icon: 'error', text: data.message || 'Failed to send OTP', confirmButtonText: 'OK' });
      }
    } catch (error) {
      Swal.fire({ icon: 'error', text: 'Error connecting to server.', confirmButtonText: 'OK' });
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (otp.length !== 6) return Swal.fire({ icon: 'warning', text: "Enter valid 6-digit OTP", confirmButtonText: 'OK' });

    try {
      const response = await fetch(`${API_URL}/api/users/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile, otp }),
      });
      const data = await response.json();
      if (response.ok) {
        Swal.close();
        const storedUser = localStorage.getItem('currentUser') || (data.user && data.user.userId) || userId;
        localStorage.setItem('currentUser', storedUser);
        if (data.user) {
          localStorage.setItem('user', JSON.stringify(data.user));
          if (Array.isArray(data.user.permissions)) {
            localStorage.setItem('userPermissions', JSON.stringify(data.user.permissions));
          }
          if (data.user.role) {
            localStorage.setItem('userRole', data.user.role);
          }
        }
        if (data.sessionToken) {
          sessionStorage.setItem('sessionToken', data.sessionToken);
        }
        if (role === 'admin' || storedUser === 'admin') {
          navigate('/admin-login');
        } else if (data.sessionToken) {
          const returnTo = new URLSearchParams(location.search).get('returnTo');
          if (returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//')) {
            const resultPath = new URL(returnTo, window.location.origin);
            if (resultPath.origin === window.location.origin && resultPath.pathname === '/etds-result') {
              navigate(`${resultPath.pathname}${resultPath.search}`, { replace: true });
            } else {
              navigate('/dashboard');
            }
          } else {
            navigate('/dashboard');
          }
        } else {
          navigate('/dashboard');
        }
      } else {
        Swal.fire({ icon: 'error', text: data.message || 'Invalid OTP', confirmButtonText: 'OK' });
      }
    } catch (error) {
      Swal.fire({ icon: 'error', text: 'Error verifying OTP.', confirmButtonText: 'OK' });
    }
  };

  const handleForgotPasswordClick = () => {
    setMobile('');
    setAuthStep(4);
  };

  const handleSendResetOtp = async (e) => {
    e.preventDefault();
    if (mobile.length !== 10) return Swal.fire({ icon: 'warning', text: "Enter valid 10-digit mobile number", confirmButtonText: 'OK' });

    try {
      const response = await fetch(`${API_URL}/api/users/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile }),
      });
      const data = await response.json();
      if (response.ok) {
        setAuthStep(5);
        Swal.fire({ icon: 'success', text: data.message || 'Reset OTP sent!', confirmButtonText: 'OK' });
      } else {
        Swal.fire({ icon: 'error', text: data.message || 'Failed to send OTP', confirmButtonText: 'OK' });
      }
    } catch (error) {
      Swal.fire({ icon: 'error', text: 'Error connecting to server.', confirmButtonText: 'OK' });
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (otp.length !== 6) return Swal.fire({ icon: 'warning', text: "Enter valid 6-digit OTP", confirmButtonText: 'OK' });
    if (newPassword.length < 6) return Swal.fire({ icon: 'warning', text: "Password must be at least 6 characters", confirmButtonText: 'OK' });

    try {
      const response = await fetch(`${API_URL}/api/users/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile, otp, newPassword }),
      });
      const data = await response.json();
      if (response.ok) {
        Swal.fire({ icon: 'success', text: "Password Reset Successfully! You can now login.", confirmButtonText: 'OK' });
        setAuthStep(1);
        setPassword('');
        setOtp('');
      } else {
        Swal.fire({ icon: 'error', text: data.message || 'Failed to reset password', confirmButtonText: 'OK' });
      }
    } catch (error) {
      Swal.fire({ icon: 'error', text: 'Error resetting password.', confirmButtonText: 'OK' });
    }
  };

  const handleRegSendOtp = async (e) => {
    if (e) e.preventDefault();
    if (!signUpData.mobile || signUpData.mobile.length !== 10) {
      return Swal.fire({ icon: 'warning', text: "Please enter a valid 10-digit mobile number.", confirmButtonText: 'OK' });
    }

    try {
      const response = await fetch(`${API_URL}/api/users/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile: signUpData.mobile }),
      });
      const data = await response.json();
      if (response.ok) {
        setSignUpData(prev => ({ ...prev, isRegOtpSent: true }));
        Swal.fire({ icon: 'success', text: data.message || 'OTP Sent to Mobile Number!', confirmButtonText: 'OK' });
      } else {
        Swal.fire({ icon: 'error', text: data.message || 'Failed to send OTP', confirmButtonText: 'OK' });
      }
    } catch (error) {
      Swal.fire({ icon: 'error', text: 'Error connecting to server.', confirmButtonText: 'OK' });
    }
  };

  const handleRegVerifyOtp = async (e) => {
    if (e) e.preventDefault();
    if (!signUpData.regOtp || signUpData.regOtp.length !== 6) {
      return Swal.fire({ icon: 'warning', text: "Please enter valid 6-digit OTP.", confirmButtonText: 'OK' });
    }

    try {
      const response = await fetch(`${API_URL}/api/users/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile: signUpData.mobile, otp: signUpData.regOtp }),
      });
      const data = await response.json();
      if (response.ok) {
        setSignUpData(prev => ({ ...prev, isRegOtpVerified: true }));
        Swal.fire({ icon: 'success', text: 'Mobile Number Verified Successfully!', confirmButtonText: 'OK' });
      } else {
        Swal.fire({ icon: 'error', text: data.message || 'Invalid OTP', confirmButtonText: 'OK' });
      }
    } catch (error) {
      Swal.fire({ icon: 'error', text: 'Error verifying OTP.', confirmButtonText: 'OK' });
    }
  };

  const handleSignUpSubmit = async (e) => {
    e.preventDefault();
    const name = (signUpData.fullName || '').trim();
    const mob = (signUpData.mobile || '').trim();

    if (!name) {
      return Swal.fire({ icon: 'warning', text: "Please enter your Full Name (As per Aadhar Card).", confirmButtonText: 'OK' });
    }
    if (mob.length !== 10) {
      return Swal.fire({ icon: 'warning', text: "Please enter a valid 10-digit mobile number.", confirmButtonText: 'OK' });
    }
    if (!signUpData.shopName.trim()) {
      return Swal.fire({ icon: 'warning', text: "Please enter your Shop Name.", confirmButtonText: 'OK' });
    }
    if (!signUpData.businessAddress.trim()) {
      return Swal.fire({ icon: 'warning', text: "Please enter your Business Address.", confirmButtonText: 'OK' });
    }
    if (signUpData.password.length < 6) {
      return Swal.fire({ icon: 'warning', text: "Password must be at least 6 characters.", confirmButtonText: 'OK' });
    }
    if (signUpData.password !== signUpData.confirmPassword) {
      return Swal.fire({ icon: 'warning', text: "Passwords do not match!", confirmButtonText: 'OK' });
    }

    try {
      const response = await fetch(`${API_URL}/api/users/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: name,
          mobile: mob,
          shopName: signUpData.shopName.trim(),
          email: (signUpData.email || '').trim(),
          businessAddress: signUpData.businessAddress.trim(),
          password: signUpData.password
        }),
      });
      const data = await response.json();
      if (response.ok) {
        Swal.fire({
          icon: 'success',
          title: 'Registration Request Sent!',
          text: "Your account request has been sent to Admin for approval. You will be able to login once approved by admin.",
          confirmButtonText: 'OK',
          confirmButtonColor: '#1E6BFF'
        });
        setAuthStep(1);
        setPassword('');
        setSignUpData({ fullName: '', mobile: '', shopName: '', email: '', businessAddress: '', password: '', confirmPassword: '', regOtp: '', isRegOtpSent: false, isRegOtpVerified: false });
      } else {
        Swal.fire({ icon: 'error', text: data.message || 'Failed to submit registration.', confirmButtonText: 'OK' });
      }
    } catch (error) {
      Swal.fire({ icon: 'error', text: 'Error connecting to server.', confirmButtonText: 'OK' });
    }
  };

  return (
    <div className="login-wrapper">
      {/* Dynamic Blurred Background Image matching Admin Uploaded Photos */}
      <div
        className="dynamic-bg-blur"
        style={{ backgroundImage: `url(${currentNewsImage})` }}
      ></div>

      {/* Background Decorative Ambient Glows */}
      <div className="ambient-orb orb-1"></div>
      <div className="ambient-orb orb-2"></div>
      <div className="ambient-orb orb-3"></div>

      <div className={`login-card ${authStep === 6 ? 'register-mode' : ''}`}>

        {/* Left Side: Branding, Banner & Features */}
        <div className="login-left">
          <div className="left-pattern-overlay"></div>

          {/* Top Brand Header */}
          <div
            className="brand-header"
            onDoubleClick={() => navigate('/admin-login')}
            style={{ cursor: 'pointer', userSelect: 'none' }}
            title="Double-click to open Admin Login"
          >
            <h1
              className="brand-title"
              onDoubleClick={() => navigate('/admin-login')}
              title="Double-click to open Admin Login"
            >
              <span className="brand-orange">MB</span> <span className="brand-white">MITRA</span>
            </h1>
            <p className="brand-subtitle">
              Empowering Banking Services
            </p>
          </div>

          {/* Middle Showcase Box - Cycles through all uploaded images */}
          <div className="news-showcase-box">
            <img
              src={currentNewsImage}
              alt="News Update"
              className="news-showcase-img"
              onError={(e) => {
                if (e.target.src !== aepsBgImg) {
                  e.target.src = aepsBgImg;
                }
              }}
            />
            {newsImagesList.length > 1 && (
              <div className="carousel-dots-overlay">
                {newsImagesList.map((_, idx) => (
                  <span
                    key={idx}
                    className={`carousel-dot ${idx === (currentNewsIndex % newsImagesList.length) ? 'active' : ''}`}
                    onClick={() => setCurrentNewsIndex(idx)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Bottom 3 Feature Action Cards */}
          <div className="feature-cards-grid">
            <div className="feature-card">
              <div className="feature-card-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="5" width="20" height="14" rx="2" />
                  <line x1="2" y1="10" x2="22" y2="10" />
                </svg>
              </div>
              <div className="feature-card-text">
                <span className="feature-card-title">Money Transfer</span>
                <span className="feature-card-sub">Send & Receive Funds</span>
              </div>
            </div>

            <div className="feature-card">
              <div className="feature-card-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                  <line x1="12" y1="18" x2="12.01" y2="18" />
                </svg>
              </div>
              <div className="feature-card-text">
                <span className="feature-card-title">Recharge & Bill Pay</span>
                <span className="feature-card-sub">Mobile, DTH & Utility Payments</span>
              </div>
            </div>

            <div className="feature-card">
              <div className="feature-card-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  <path d="M9 12l2 2 4-4" />
                </svg>
              </div>
              <div className="feature-card-text">
                <span className="feature-card-title">Insurance & Loans</span>
                <span className="feature-card-sub">Access Financial Services</span>
              </div>
            </div>
          </div>

          {/* Left Panel Footer Info */}
          <div className="left-footer-info">
            <div className="footer-info-item">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
                <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
              </svg>
              <span>24x7 Support & Fast Settlements</span>
            </div>
            <div className="footer-info-item">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              <span>Trusted by <b>1 Million+</b> Agents</span>
            </div>
          </div>
        </div>

        {/* Right Side: Login Form Panel */}
        <div className={`login-right ${authStep === 6 ? 'register-mode-right' : ''}`}>
          <div className={`login-form-container ${authStep === 6 ? 'register-mode-container' : ''}`}>

            {/* Circular Orange Emblem Logo */}
            <div
              className="orange-logo-badge"
              onDoubleClick={() => navigate('/admin-login')}
              title="Double-click to open Admin Panel"
            >
              <img src={logoImg} alt="MB MITRA Logo" className="orange-badge-img" />
            </div>

            {/* Title & Subtitle */}
            <h2 className="welcome-title">
              {authStep === 1 ? 'Welcome Back!' :
                authStep === 2 ? 'Two-Step Verification' :
                  authStep === 3 ? 'Verify OTP' :
                    authStep === 4 ? 'Reset Password' :
                      authStep === 5 ? 'Set New Password' : 'Create Retailer Account'}
            </h2>
            <p className="welcome-subtitle">
              {authStep === 1 ? 'Sign in to your account' :
                authStep === 6 ? 'Fill in your details to get started with MB MITRA' : 'Please complete authentication step'}
            </p>

            {/* STEP 1: MAIN LOGIN FORM */}
            {authStep === 1 && (
              <form onSubmit={handleLoginSubmit} className="dark-login-form" autoComplete="off">
                <div className="dark-input-group">
                  <div
                    className="dark-input-wrapper"
                    onClick={(e) => { const inp = e.currentTarget.querySelector('input'); if (inp) inp.focus(); }}
                  >
                    <span className="dark-input-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                      </svg>
                    </span>
                    <input
                      type="text"
                      value={userId}
                      onChange={e => setUserId(e.target.value)}
                      placeholder="User ID"
                      autoComplete="off"
                      required
                    />
                  </div>
                </div>

                <div className="dark-input-group">
                  <div
                    className="dark-input-wrapper"
                    onClick={(e) => { const inp = e.currentTarget.querySelector('input'); if (inp) inp.focus(); }}
                  >
                    <span className="dark-input-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                    </span>
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Password"
                      autoComplete="new-password"
                      required
                    />
                    <span className="dark-password-toggle" onClick={() => setShowPassword(!showPassword)} title={showPassword ? "Hide password" : "Show password"}>
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        {showPassword ? (
                          <>
                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                            <line x1="1" y1="1" x2="23" y2="23" />
                          </>
                        ) : (
                          <>
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </>
                        )}
                      </svg>
                    </span>
                  </div>
                </div>

                <div className="forgot-password-row">
                  <span className="forgot-password-link" onClick={handleForgotPasswordClick}>
                    Forgot Password?
                  </span>
                </div>

                <button type="submit" className="blue-login-btn">
                  Login
                </button>

                <div className="register-prompt-row">
                  <span onDoubleClick={() => navigate('/admin-login')} style={{ cursor: 'pointer' }} title="Double-click to open Admin Login">New to MB MITRA? </span>
                  <span className="register-link" onClick={() => setAuthStep(6)}>
                    Register Now
                  </span>
                </div>
              </form>
            )}

            {/* STEP 2: TWO-STEP VERIFICATION (AUTO OTP SENT + DIRECT OTP INPUT) */}
            {authStep === 2 && (
              <form onSubmit={handleVerifyOtp} className="dark-login-form" autoComplete="off">
                <div className="two-step-card">
                  <div className="two-step-icon">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                      <path d="M9 12l2 2 4-4" />
                    </svg>
                  </div>
                  <div className="two-step-info">
                    <span className="two-step-label">OTP will be sent to registered mobile</span>
                    <span className="two-step-phone">
                      +91 {maskMobileNumber(mobile)}
                    </span>
                  </div>
                </div>

                <div className="dark-input-group">
                  <div className="dark-input-wrapper">
                    <span className="dark-input-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                        <line x1="12" y1="18" x2="12.01" y2="18" />
                      </svg>
                    </span>
                    <input
                      type="text"
                      value={isEditingMobile ? mobile : (mobile ? `+91 ${maskMobileNumber(mobile)}` : '')}
                      onChange={e => {
                        setIsEditingMobile(true);
                        setMobile(e.target.value.replace(/\D/g, ''));
                      }}
                      onFocus={() => setIsEditingMobile(true)}
                      placeholder="Enter 10-digit Mobile Number"
                      autoComplete="off"
                      required
                    />
                    <span
                      className="dark-password-toggle"
                      onClick={() => setIsEditingMobile(!isEditingMobile)}
                      title={isEditingMobile ? "Mask Mobile Number" : "Edit Mobile Number"}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </span>
                  </div>
                </div>

                {/* Direct OTP Input Field */}
                <div className="dark-input-group" style={{ marginTop: '12px' }}>
                  <div className="dark-input-wrapper">
                    <span className="dark-input-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
                      </svg>
                    </span>
                    <input
                      type="text"
                      maxLength="6"
                      value={otp}
                      onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                      placeholder="Enter 6-digit OTP"
                      autoComplete="off"
                      required
                      autoFocus
                    />
                  </div>
                </div>

                <div className="form-options">
                  <span className="forgot-password-link" onClick={() => triggerAutoLoginOtp(mobile)} style={{ cursor: 'pointer' }}>
                    Resend OTP
                  </span>
                  <span className="register-link" onClick={() => setAuthStep(1)} style={{ cursor: 'pointer' }}>
                    Back to Login
                  </span>
                </div>

                <button type="submit" className="blue-login-btn">
                  Verify & Proceed
                </button>
              </form>
            )}

            {/* STEP 3: VERIFY OTP */}
            {authStep === 3 && (
              <form onSubmit={handleVerifyOtp} className="dark-login-form" autoComplete="off">
                <div className="otp-sent-info">
                  <span>OTP sent to <strong>+91 {maskMobileNumber(mobile)}</strong></span>
                </div>
                <div className="dark-input-group">
                  <div className="dark-input-wrapper">
                    <span className="dark-input-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
                      </svg>
                    </span>
                    <input
                      type="text"
                      value={otp}
                      onChange={e => setOtp(e.target.value)}
                      placeholder="Enter 6-digit OTP"
                      autoComplete="off"
                      required
                    />
                  </div>
                </div>
                <div className="form-options">
                  <span className="forgot-password-link" onClick={handleSendOtp}>Resend OTP</span>
                  <span className="register-link" onClick={() => setAuthStep(1)}>Cancel</span>
                </div>
                <button type="submit" className="blue-login-btn">
                  Verify & Proceed
                </button>
              </form>
            )}

            {/* STEP 4: FORGOT PASSWORD */}
            {authStep === 4 && (
              <form onSubmit={handleSendResetOtp} className="dark-login-form" autoComplete="off">
                <div className="dark-input-group">
                  <div className="dark-input-wrapper">
                    <span className="dark-input-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                        <line x1="12" y1="18" x2="12.01" y2="18" />
                      </svg>
                    </span>
                    <input
                      type="text"
                      value={mobile}
                      onChange={e => setMobile(e.target.value)}
                      placeholder="Registered Mobile Number"
                      autoComplete="off"
                      required
                    />
                  </div>
                </div>
                <button type="submit" className="blue-login-btn">
                  Send Reset OTP
                </button>
                <div className="register-prompt-row">
                  <span className="register-link" onClick={() => setAuthStep(1)}>Back to Login</span>
                </div>
              </form>
            )}

            {/* STEP 5: SET NEW PASSWORD */}
            {authStep === 5 && (
              <form onSubmit={handleResetPassword} className="dark-login-form" autoComplete="off">
                <div className="otp-sent-info">
                  <span>Reset OTP sent to <strong>+91 {maskMobileNumber(mobile)}</strong></span>
                </div>
                <div className="dark-input-group">
                  <div className="dark-input-wrapper">
                    <span className="dark-input-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
                      </svg>
                    </span>
                    <input
                      type="text"
                      value={otp}
                      onChange={e => setOtp(e.target.value)}
                      placeholder="Enter 6-digit OTP"
                      autoComplete="off"
                      required
                    />
                  </div>
                </div>
                <div className="dark-input-group">
                  <div className="dark-input-wrapper">
                    <span className="dark-input-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                    </span>
                    <input
                      type={showPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      placeholder="New Password"
                      autoComplete="new-password"
                      required
                    />
                  </div>
                </div>
                <button type="submit" className="blue-login-btn">
                  Reset Password
                </button>
                <div className="register-prompt-row">
                  <span className="register-link" onClick={() => setAuthStep(1)}>Cancel</span>
                </div>
              </form>
            )}

            {/* STEP 6: REGISTRATION FORM MATCHING IMAGE 1 */}
            {authStep === 6 && (
              <form onSubmit={handleSignUpSubmit} className="dark-login-form reg-custom-scrollbar" autoComplete="off" style={{ maxHeight: '76vh', overflowY: 'auto', paddingRight: '4px', width: '100%' }}>
                
                {/* Section 1: Personal & Business Details */}
                <div className="reg-section-card">
                  <div className="reg-section-header">
                    <span className="reg-section-num">1</span>
                    <strong className="reg-section-title">1. Personal & Business Details</strong>
                  </div>

                  <div className="reg-grid-2col">
                    <div>
                      <label className="reg-field-label">Full Name (As per Aadhar Card)</label>
                      <div className="dark-input-wrapper">
                        <span className="dark-input-icon">
                          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                            <circle cx="12" cy="7" r="4" />
                          </svg>
                        </span>
                        <input
                          type="text"
                          value={signUpData.fullName}
                          onChange={e => setSignUpData({ ...signUpData, fullName: e.target.value })}
                          placeholder="Enter your full name"
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <label className="reg-field-label">Mobile Number</label>
                      <div className="dark-input-wrapper">
                        <span className="dark-input-icon">
                          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                          </svg>
                        </span>
                        <input
                          type="tel"
                          maxLength="10"
                          value={signUpData.mobile}
                          onChange={e => setSignUpData({ ...signUpData, mobile: e.target.value.replace(/\D/g, '') })}
                          placeholder="Enter 10 digit mobile number"
                          required
                        />
                      </div>
                    </div>
                  </div>

                  <div className="reg-grid-2col">
                    <div>
                      <label className="reg-field-label">Shop Name</label>
                      <div className="dark-input-wrapper">
                        <span className="dark-input-icon">
                          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                            <polyline points="9 22 9 12 15 12 15 22" />
                          </svg>
                        </span>
                        <input
                          type="text"
                          value={signUpData.shopName}
                          onChange={e => setSignUpData({ ...signUpData, shopName: e.target.value })}
                          placeholder="Enter your shop name"
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <label className="reg-field-label">E-Mail ID</label>
                      <div className="dark-input-wrapper">
                        <span className="dark-input-icon">
                          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                            <polyline points="22,6 12,13 2,6" />
                          </svg>
                        </span>
                        <input
                          type="email"
                          value={signUpData.email}
                          onChange={e => setSignUpData({ ...signUpData, email: e.target.value })}
                          placeholder="Enter your email address"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="reg-field-label">Business Address</label>
                    <div className="dark-input-wrapper">
                      <span className="dark-input-icon">
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                          <circle cx="12" cy="10" r="3" />
                        </svg>
                      </span>
                      <input
                        type="text"
                        value={signUpData.businessAddress}
                        onChange={e => setSignUpData({ ...signUpData, businessAddress: e.target.value })}
                        placeholder="Enter your complete business address"
                        required
                      />
                    </div>
                  </div>
                </div>

                {/* Section 2: Account Security */}
                <div className="reg-section-card">
                  <div className="reg-section-header">
                    <span className="reg-section-num">2</span>
                    <strong className="reg-section-title">2. Account Security</strong>
                  </div>

                  <div className="reg-grid-2col">
                    <div>
                      <label className="reg-field-label">Password</label>
                      <div className="dark-input-wrapper">
                        <span className="dark-input-icon">
                          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                          </svg>
                        </span>
                        <input
                          type={showRegisterPassword ? "text" : "password"}
                          value={signUpData.password}
                          onChange={e => setSignUpData({ ...signUpData, password: e.target.value })}
                          placeholder="Enter password"
                          required
                        />
                        <span
                          className="dark-password-toggle"
                          onClick={() => setShowRegisterPassword(!showRegisterPassword)}
                          title={showRegisterPassword ? "Hide password" : "Show password"}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            {showRegisterPassword ? (
                              <>
                                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                                <line x1="1" y1="1" x2="23" y2="23" />
                              </>
                            ) : (
                              <>
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                <circle cx="12" cy="12" r="3" />
                              </>
                            )}
                          </svg>
                        </span>
                      </div>
                    </div>

                    <div>
                      <label className="reg-field-label">Confirm Password</label>
                      <div className="dark-input-wrapper">
                        <span className="dark-input-icon">
                          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                          </svg>
                        </span>
                        <input
                          type={showRegisterConfirmPassword ? "text" : "password"}
                          value={signUpData.confirmPassword}
                          onChange={e => setSignUpData({ ...signUpData, confirmPassword: e.target.value })}
                          placeholder="Re-enter password"
                          required
                        />
                        <span
                          className="dark-password-toggle"
                          onClick={() => setShowRegisterConfirmPassword(!showRegisterConfirmPassword)}
                          title={showRegisterConfirmPassword ? "Hide password" : "Show password"}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            {showRegisterConfirmPassword ? (
                              <>
                                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                                <line x1="1" y1="1" x2="23" y2="23" />
                              </>
                            ) : (
                              <>
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                <circle cx="12" cy="12" r="3" />
                              </>
                            )}
                          </svg>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section 3: Mobile Verification */}
                <div className="reg-section-card">
                  <div className="reg-section-header">
                    <span className="reg-section-num">3</span>
                    <strong className="reg-section-title">3. Mobile Verification</strong>
                  </div>

                  <div className="reg-grid-otp" style={{ marginBottom: '8px' }}>
                    <div>
                      <label className="reg-field-label">Mobile Number</label>
                      <div className="dark-input-wrapper">
                        <span className="dark-input-icon">
                          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                          </svg>
                        </span>
                        <input
                          type="text"
                          readOnly
                          value={signUpData.mobile ? `+91 ${signUpData.mobile}` : '+91 Mobile Number'}
                          style={{ color: '#475569', fontWeight: 600 }}
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleRegSendOtp}
                      style={{
                        height: '40px',
                        background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '9px',
                        fontSize: '12px',
                        fontWeight: 800,
                        cursor: 'pointer',
                        boxShadow: '0 4px 10px rgba(234,88,12,0.3)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px'
                      }}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="22" y1="2" x2="11" y2="13" />
                        <polygon points="22 2 15 22 11 13 2 9 22 2" />
                      </svg>
                      Get OTP
                    </button>
                  </div>

                  {signUpData.isRegOtpSent && (
                    <div className="reg-grid-otp" style={{ marginTop: '8px' }}>
                      <div>
                        <label className="reg-field-label">Enter OTP</label>
                        <div className="dark-input-wrapper">
                          <span className="dark-input-icon">
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                            </svg>
                          </span>
                          <input
                            type="text"
                            maxLength="6"
                            value={signUpData.regOtp}
                            onChange={e => setSignUpData({ ...signUpData, regOtp: e.target.value.replace(/\D/g, '') })}
                            placeholder="Enter 6 digit OTP"
                          />
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleRegVerifyOtp}
                        disabled={signUpData.isRegOtpVerified}
                        style={{
                          height: '40px',
                          background: signUpData.isRegOtpVerified ? '#10b981' : '#2563eb',
                          color: 'white',
                          border: 'none',
                          borderRadius: '9px',
                          fontSize: '12px',
                          fontWeight: 800,
                          cursor: signUpData.isRegOtpVerified ? 'default' : 'pointer',
                          boxShadow: signUpData.isRegOtpVerified ? '0 4px 10px rgba(16,185,129,0.3)' : '0 4px 10px rgba(37,99,235,0.3)'
                        }}
                      >
                        {signUpData.isRegOtpVerified ? '✓ Verified' : 'Verify OTP'}
                      </button>
                    </div>
                  )}
                </div>

                {/* Submit Register Button */}
                <button
                  type="submit"
                  style={{
                    width: '100%',
                    height: '44px',
                    background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '10px',
                    fontSize: '14.5px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    boxShadow: '0 6px 16px rgba(234,88,12,0.35)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    transition: 'all 0.2s ease',
                    marginTop: '4px'
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="8.5" cy="7" r="4" />
                    <line x1="20" y1="8" x2="20" y2="14" />
                    <line x1="17" y1="11" x2="23" y2="11" />
                  </svg>
                  Register Account
                </button>

                <div style={{ textAlign: 'center', marginTop: '10px', fontSize: '11.5px', color: '#64748b', fontWeight: 500 }}>
                  🔒 Your personal and business data is 100% safe & encrypted.
                </div>

                <div className="register-prompt-row" style={{ marginTop: '10px', textAlign: 'center', fontSize: '12px' }}>
                  <span>Already have an account? </span>
                  <span className="register-link" onClick={() => setAuthStep(1)} style={{ cursor: 'pointer', fontWeight: 700, color: '#1e6bff' }}>Sign In</span>
                </div>
              </form>
            )}


            {/* Bottom Store Badges */}
            <div className="app-store-badges">
              <button type="button" className="store-badge-btn" onClick={() => Swal.fire({ icon: 'info', text: "Google Play app link coming soon", confirmButtonText: 'OK' })}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M3.609 1.814L13.792 12 3.61 22.186a1.99 1.99 0 0 1-.61-.914V2.727c0-.33.097-.648.609-.913zm11.6 11.6l2.84 2.841-11.83 6.702 8.99-9.543zm.001-2.828L6.22 1.042l11.83 6.703-2.84 2.841zm1.414 1.414l3.447 1.954c.732.415.732 1.092 0 1.507l-3.447 1.953-2.613-2.613 2.613-2.601z" />
                </svg>
                <div className="badge-text-group">
                  <span className="badge-sub">GET IT ON</span>
                  <span className="badge-title">Google Play</span>
                </div>
              </button>

              <button type="button" className="store-badge-btn" onClick={() => Swal.fire({ icon: 'info', text: "App Store app link coming soon", confirmButtonText: 'OK' })}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.83c.67-.82 1.13-1.96.99-3.11-1 .04-2.22.67-2.93 1.5-.64.74-1.2 1.92-1.05 3.05 1.12.09 2.27-.57 2.99-1.44z" />
                </svg>
                <div className="badge-text-group">
                  <span className="badge-sub">DOWNLOAD ON THE</span>
                  <span className="badge-title">App Store</span>
                </div>
              </button>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
};

export default Login;
