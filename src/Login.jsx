import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './Login.css';
import logoImg from './assets/logo.png';
import aepsBgImg from './assets/aeps_bg.png';

const API_URL = process.env.REACT_APP_API_URL || 'http:REACT_APP_API_URL';

const Login = () => {
  const navigate = useNavigate();
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [newsImage, setNewsImage] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [authStep, setAuthStep] = useState(1);
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [role, setRole] = useState('');

  const [newPassword, setNewPassword] = useState('');
  const [signUpData, setSignUpData] = useState({ userId: '', mobile: '', password: '', confirmPassword: '' });
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/api/news-images`)
      .then(res => res.json())
      .then(data => {
        if (data && data.length > 0) {
          setNewsImage(data[data.length - 1].img);
        }
      })
      .catch(err => console.error("Error fetching news image:", err));
  }, []);

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
        if (userId === 'admin' || (data.user && data.user.role === 'admin')) {
          localStorage.setItem('currentUser', userId);
          navigate('/admin-login');
          return;
        }

        if (data.user && data.user.mobile) {
          setMobile(data.user.mobile);
        }
        if (data.user && data.user.role) {
          setRole(data.user.role);
        }
        setAuthStep(2); // Proceed to OTP Step
      } else {
        alert(data.message || 'Invalid User ID or Password.');
      }
    } catch (error) {
      alert('Failed to connect to the server.');
    }
  };

  const handleSendOtp = async (e) => {
    if (e) e.preventDefault();
    if (mobile.length !== 10) return alert("Enter valid 10-digit mobile number");

    try {
      const response = await fetch(`${API_URL}/api/users/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile }),
      });
      const data = await response.json();
      if (response.ok) {
        setAuthStep(3);
        alert(data.message);
      } else {
        alert(data.message || 'Failed to send OTP');
      }
    } catch (error) {
      alert('Error connecting to server.');
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (otp.length !== 6) return alert("Enter valid 6-digit OTP");

    try {
      const response = await fetch(`${API_URL}/api/users/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile, otp }),
      });
      const data = await response.json();
      if (response.ok) {
        localStorage.setItem('currentUser', userId);
        if (role === 'admin' || userId === 'admin') {
          navigate('/admin-login');
        } else {
          navigate('/dashboard');
        }
      } else {
        alert(data.message || 'Invalid OTP');
      }
    } catch (error) {
      alert('Error verifying OTP.');
    }
  };

  const handleForgotPasswordClick = () => {
    setMobile('');
    setAuthStep(4);
  };

  const handleSendResetOtp = async (e) => {
    e.preventDefault();
    if (mobile.length !== 10) return alert("Enter valid 10-digit mobile number");

    try {
      const response = await fetch(`${API_URL}/api/users/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile }),
      });
      const data = await response.json();
      if (response.ok) {
        setAuthStep(5);
        alert(data.message);
      } else {
        alert(data.message || 'Failed to send OTP');
      }
    } catch (error) {
      alert('Error connecting to server.');
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (otp.length !== 6) return alert("Enter valid 6-digit OTP");
    if (newPassword.length < 6) return alert("Password must be at least 6 characters");

    try {
      const response = await fetch(`${API_URL}/api/users/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile, otp, newPassword }),
      });
      const data = await response.json();
      if (response.ok) {
        alert("Password Reset Successfully! You can now login.");
        setAuthStep(1);
        setPassword('');
        setOtp('');
      } else {
        alert(data.message || 'Failed to reset password');
      }
    } catch (error) {
      alert('Error resetting password.');
    }
  };

  const handleSignUpSubmit = async (e) => {
    e.preventDefault();
    if (signUpData.password !== signUpData.confirmPassword) {
      return alert("Passwords do not match!");
    }
    if (signUpData.password.length < 6) {
      return alert("Password must be at least 6 characters.");
    }
    try {
      const response = await fetch(`${API_URL}/api/users/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: signUpData.userId,
          mobile: signUpData.mobile,
          password: signUpData.password
        }),
      });
      const data = await response.json();
      if (response.ok) {
        alert("Password Set Successfully! You can now login.");
        setAuthStep(1);
        setUserId(signUpData.userId);
        setPassword('');
      } else {
        alert(data.message || 'Failed to set password.');
      }
    } catch (error) {
      alert('Error connecting to server.');
    }
  };

  return (
    <div className="login-wrapper">
      {/* Background Decorative Ambient Orbs */}
      <div className="ambient-orb orb-1"></div>
      <div className="ambient-orb orb-2"></div>
      <div className="ambient-orb orb-3"></div>

      <div className="login-card">

        {/* Left Side: Branding & News */}
        <div className="login-left">
          <div className="left-pattern-overlay"></div>

          <div className="brand-header">
            <span className="brand-welcome-tag">WELCOME TO</span>
            <h1
              onDoubleClick={() => navigate('/admin-login')}
              className="brand-title"
              title="Double-click to open Admin Panel"
            >
              MB <span className="brand-title-highlight">MITRA</span>
            </h1>
            <p className="brand-subtitle">
              Your Trusted Partner for<br />
              <b>Secure <span className="text-orange">&</span> Reliable Services</b>
            </p>
          </div>

          <div className="news-showcase">
            <div className="news-content">
              <img
                src={newsImage || aepsBgImg}
                alt="News Update"
                className="news-img"
                onError={(e) => {
                  if (e.target.src !== aepsBgImg) {
                    e.target.src = aepsBgImg;
                  }
                }}
              />
            </div>
          </div>

          <div className="features-row">
            <div className="feature-item">
              <div className="feature-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ff8800" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  <path d="M9 12l2 2 4-4" />
                </svg>
              </div>
              <span className="feature-title">Secure<br />Transactions</span>
              <span className="feature-desc">100% Safe & Encrypted</span>
            </div>
            <div className="feature-item">
              <div className="feature-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ff8800" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
              </div>
              <span className="feature-title">Fast<br />Processing</span>
              <span className="feature-desc">Instant & Reliable</span>
            </div>
            <div className="feature-item">
              <div className="feature-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ff8800" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <span className="feature-title">Trusted<br />Network</span>
              <span className="feature-desc">Wide Service Reach</span>
            </div>
          </div>
        </div>

        {/* Right Side: Login Form */}
        <div className="login-right">

          {/* Animated Background Icons */}
          <div className="floating-icons">
            <svg className="float-icon icon-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <svg className="float-icon icon-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <svg className="float-icon icon-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10" />
              <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" />
              <line x1="12" y1="18" x2="12" y2="22" />
              <line x1="12" y1="2" x2="12" y2="6" />
            </svg>
            <svg className="float-icon icon-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
              <line x1="12" y1="22.08" x2="12" y2="12" />
            </svg>
          </div>

          <div className="login-form-container">

            <div className="logo-wrapper">
              <img src={logoImg} alt="MB MITRA Logo" className="brand-logo" />
            </div>

            <h2 className="login-title">
              {authStep === 1 ? 'Login to your account' :
                authStep === 2 ? 'Two-Step Verification' :
                  authStep === 3 ? 'Verify OTP' :
                    authStep === 4 ? 'Reset Password' :
                      authStep === 5 ? 'Set New Password' : 'Set Your Password'}
            </h2>
            <div className="title-dots">
              <span className="dot dot-active"></span>
              <span className="dot"></span>
              <span className="dot"></span>
            </div>

            {/* STEP 1: LOGIN FORM */}
            {authStep === 1 && (
              <form onSubmit={handleLoginSubmit} className="modern-login-form" autoComplete="off">
                <div className="input-group">
                  <div className="input-with-icon">
                    <span className="input-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                      </svg>
                    </span>
                    <input
                      type="text"
                      value={userId}
                      onChange={e => setUserId(e.target.value)}
                      placeholder="User ID or Mobile Number"
                      autoComplete="off"
                      required
                    />
                  </div>
                </div>

                <div className="input-group">
                  <div className="input-with-icon">
                    <span className="input-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                    <span className="toggle-password" onClick={() => setShowPassword(!showPassword)} title={showPassword ? "Hide password" : "Show password"}>
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
                    </span>
                  </div>
                </div>

                <div className="form-options">
                  <label className="remember-me">
                    <input type="checkbox" defaultChecked />
                    <span className="custom-checkbox"></span>
                    Remember me
                  </label>
                  <span className="forgot-link" onClick={handleForgotPasswordClick}>Forgot Password?</span>
                </div>

                <button type="submit" className="login-submit-btn">
                  <span>Login</span>
                  <svg className="arrow-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </button>

                <div className="divider">
                  <span>or</span>
                </div>

                <div className="support-actions">
                  <button type="button" className="action-btn" onClick={() => setAuthStep(6)}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="8.5" cy="7" r="4" />
                      <line x1="20" y1="8" x2="20" y2="14" />
                      <line x1="17" y1="11" x2="23" y2="11" />
                    </svg>
                    Activate Account
                  </button>
                  <button type="button" className="action-btn" onClick={() => alert('Help support initialized.')}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
                      <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
                    </svg>
                    Help & Support
                  </button>
                </div>
              </form>
            )}

            {/* STEP 2: TWO-STEP VERIFICATION */}
            {authStep === 2 && (
              <form onSubmit={handleSendOtp} className="modern-login-form" autoComplete="off">
                <div className="input-group">
                  <div className="input-with-icon">
                    <span className="input-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                        <line x1="12" y1="18" x2="12.01" y2="18" />
                      </svg>
                    </span>
                    <input
                      type="text"
                      value={mobile}
                      onChange={e => setMobile(e.target.value)}
                      placeholder="Enter 10-digit Mobile Number"
                      autoComplete="off"
                      required
                    />
                  </div>
                </div>
                <button type="submit" className="login-submit-btn">
                  <span>Send OTP</span>
                  <svg className="arrow-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </button>
              </form>
            )}

            {/* STEP 3: VERIFY OTP */}
            {authStep === 3 && (
              <form onSubmit={handleVerifyOtp} className="modern-login-form" autoComplete="off">
                <div className="input-group">
                  <div className="input-with-icon">
                    <span className="input-icon">
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
                  <span className="forgot-link" onClick={handleSendOtp}>Resend OTP</span>
                  <span className="cancel-link" onClick={() => setAuthStep(1)}>Cancel</span>
                </div>
                <button type="submit" className="login-submit-btn">
                  <span>Verify & Proceed</span>
                  <svg className="arrow-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </button>
              </form>
            )}

            {/* STEP 4: FORGOT PASSWORD */}
            {authStep === 4 && (
              <form onSubmit={handleSendResetOtp} className="modern-login-form" autoComplete="off">
                <div className="input-group">
                  <div className="input-with-icon">
                    <span className="input-icon">
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
                <button type="submit" className="login-submit-btn">
                  <span>Send Reset OTP</span>
                  <svg className="arrow-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </button>
                <div className="form-options center">
                  <span className="forgot-link" onClick={() => setAuthStep(1)}>Back to Login</span>
                </div>
              </form>
            )}

            {/* STEP 5: SET NEW PASSWORD */}
            {authStep === 5 && (
              <form onSubmit={handleResetPassword} className="modern-login-form" autoComplete="off">
                <div className="input-group">
                  <div className="input-with-icon">
                    <span className="input-icon">
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
                <div className="input-group">
                  <div className="input-with-icon">
                    <span className="input-icon">
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
                    <span className="toggle-password" onClick={() => setShowPassword(!showPassword)}>
                      {showPassword ? '👁️' : '👁️‍🗨️'}
                    </span>
                  </div>
                </div>
                <button type="submit" className="login-submit-btn">
                  <span>Reset Password</span>
                  <svg className="arrow-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </button>
                <div className="form-options center">
                  <span className="cancel-link" onClick={() => setAuthStep(1)}>Cancel</span>
                </div>
              </form>
            )}

            {/* STEP 6: ACTIVATE ACCOUNT */}
            {authStep === 6 && (
              <form onSubmit={handleSignUpSubmit} className="modern-login-form" autoComplete="off">
                <div className="input-group">
                  <div className="input-with-icon">
                    <span className="input-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                      </svg>
                    </span>
                    <input
                      type="text"
                      value={signUpData.userId}
                      onChange={e => setSignUpData({ ...signUpData, userId: e.target.value })}
                      placeholder="Create New User ID"
                      autoComplete="off"
                      required
                    />
                  </div>
                </div>
                <div className="input-group">
                  <div className="input-with-icon">
                    <span className="input-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                        <line x1="12" y1="18" x2="12.01" y2="18" />
                      </svg>
                    </span>
                    <input
                      type="text"
                      value={signUpData.mobile}
                      onChange={e => setSignUpData({ ...signUpData, mobile: e.target.value })}
                      placeholder="Registered Mobile Number"
                      autoComplete="off"
                      required
                    />
                  </div>
                </div>
                <div className="input-group">
                  <div className="input-with-icon">
                    <span className="input-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                    </span>
                    <input
                      type={showPassword ? "text" : "password"}
                      value={signUpData.password}
                      onChange={e => setSignUpData({ ...signUpData, password: e.target.value })}
                      placeholder="New Password"
                      autoComplete="new-password"
                      required
                    />
                    <span className="toggle-password" onClick={() => setShowPassword(!showPassword)}>
                      {showPassword ? '👁️' : '👁️‍🗨️'}
                    </span>
                  </div>
                </div>
                <div className="input-group">
                  <div className="input-with-icon">
                    <span className="input-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                    </span>
                    <input
                      type={showConfirmPassword ? "text" : "password"}
                      value={signUpData.confirmPassword}
                      onChange={e => setSignUpData({ ...signUpData, confirmPassword: e.target.value })}
                      placeholder="Confirm Password"
                      autoComplete="new-password"
                      required
                    />
                    <span className="toggle-password" onClick={() => setShowConfirmPassword(!showConfirmPassword)}>
                      {showConfirmPassword ? '👁️' : '👁️‍🗨️'}
                    </span>
                  </div>
                </div>
                <button type="submit" className="login-submit-btn">
                  <span>Set Password</span>
                  <svg className="arrow-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </button>
                <div className="form-options center">
                  <span className="forgot-link" onClick={() => setAuthStep(1)}>Back to Login</span>
                </div>
              </form>
            )}

            <div className="login-footer">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shield-icon">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <path d="M9 12l2 2 4-4" />
              </svg>
              © {new Date().getFullYear()} MB Mitra. All rights reserved.<br />
              Secure. Reliable. <span className="text-orange">Always With You.</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default Login;
