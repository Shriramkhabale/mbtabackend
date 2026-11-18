import React, { useState } from 'react';
import Swal from 'sweetalert2';
import { API_URL } from '../../utils/apiClient';

/**
 * Find an existing PAN using the applicant's Aadhaar number.
 *
 * Flow:
 *  1. Retailer enters a 12-digit Aadhaar number.
 *  2. Frontend calls backend proxy  POST /api/pancard/mpan-lookup
 *  3. Backend trims & uses PAN_API key from .env → calls mpan.in
 *  4. On success: wallet deducted (tabFee), PAN number displayed.
 *
 * Props:
 *  currentUser  – userId string (e.g. "MBTA0000101")
 *  walletBalance – current wallet balance (number)
 *  tabFee        – fee configured for this tab from backend (default 107)
 *  onSuccess     – callback to navigate away after success
 */
const FindPanByAadhaarForm = ({ currentUser, walletBalance = 0, tabFee = 107, onSuccess }) => {
  const [aadhaar, setAadhaar]   = useState('');
  const [loading, setLoading]   = useState(false);
  const [result,  setResult]    = useState(null);  // { pan, feeDeducted, newBalance }
  const [error,   setError]     = useState('');

  /* ── submit ── */
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setResult(null);

    const trimmed = aadhaar.trim();

    // Client-side validation
    if (!/^\d{12}$/.test(trimmed)) {
      setError('Please enter a valid 12-digit Aadhaar number.');
      return;
    }
    if (parseFloat(walletBalance) < tabFee) {
      setError(`Insufficient wallet balance. Required ₹${tabFee}, available ₹${parseFloat(walletBalance).toFixed(2)}.`);
      return;
    }

    // Confirm before deducting
    const confirmed = await Swal.fire({
      title: 'Confirm Find My PAN',
      html: `
        <div style="text-align:left;font-size:14px;line-height:1.8;background:#f8fafc;
                    padding:14px 16px;border-radius:10px;border:1px solid #e2e8f0">
          <p style="margin:0 0 6px"><b>Service:</b> Find My PAN by Aadhaar</p>
          <p style="margin:0 0 6px"><b>Aadhaar:</b> XXXX-XXXX-${trimmed.slice(-4)}</p>
          <p style="margin:0"><b>Fee Deducted:</b>
            <span style="color:#ea580c;font-weight:800"> ₹${tabFee}</span>
          </p>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: `Submit & Pay ₹${tabFee}`,
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#ea580c',
      cancelButtonColor: '#64748b',
    });

    if (!confirmed.isConfirmed) return;

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/pancard/mpan-lookup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aadhaarNumber: trimmed,
          userId: currentUser,
          tabFee: tabFee,          // backend deducts this from wallet
        }),
      });

      const data = await res.json();

      if (!data.success) {
        setError(data.message || 'PAN lookup failed. Please try again.');
        setLoading(false);
        return;
      }

      setResult(data);   // { pan, feeDeducted, newBalance, message }
      setAadhaar('');
    } catch (err) {
      setError('Network error. Please check your connection and try again.');
    }
    setLoading(false);
  };

  /* ── copy PAN ── */
  const handleCopy = () => {
    if (!result?.pan) return;
    const writeText = (text) => {
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).catch(fallback);
      } else {
        fallback();
      }
      function fallback() {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
    };
    writeText(result.pan);
    Swal.fire({
      icon: 'success',
      title: 'Copied!',
      text: `PAN ${result.pan} copied to clipboard.`,
      timer: 1500,
      showConfirmButton: false,
    });
  };

  /* ── render ── */
  return (
    <div style={{ gridColumn: '1 / -1' }}>

      {/* ── SUCCESS RESULT CARD ── */}
      {result ? (
        <div style={{
          background: 'linear-gradient(135deg,#f0fdf4 0%,#dcfce7 100%)',
          border: '1.5px solid #86efac',
          borderRadius: '16px',
          padding: '32px 28px',
          textAlign: 'center',
          boxShadow: '0 4px 20px rgba(22,163,74,0.1)',
        }}>
          {/* tick icon */}
          <div style={{
            width: '60px', height: '60px', borderRadius: '50%',
            background: 'linear-gradient(135deg,#16a34a,#15803d)',
            color: '#fff', fontSize: '28px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px', boxShadow: '0 4px 12px rgba(22,163,74,0.35)',
          }}>✓</div>

          <h4 style={{ margin: '0 0 6px', fontSize: '18px', color: '#15803d', fontWeight: 800 }}>
            PAN Found Successfully
          </h4>
          <p style={{ margin: '0 0 20px', color: '#4b5563', fontSize: '13px' }}>
            ₹{result.feeDeducted} deducted · Wallet balance: ₹{parseFloat(result.newBalance).toFixed(2)}
          </p>

          {/* PAN number pill */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '14px',
            background: '#fff', border: '2px solid #16a34a',
            borderRadius: '12px', padding: '14px 22px',
            boxShadow: '0 2px 8px rgba(22,163,74,0.15)', marginBottom: '24px',
            flexWrap: 'wrap', justifyContent: 'center',
          }}>
            <span style={{ fontSize: '12px', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              PAN Number
            </span>
            <span style={{
              fontSize: '24px', fontWeight: 900, letterSpacing: '4px',
              color: '#0f172a', fontFamily: 'monospace',
            }}>
              {result.pan}
            </span>
            <button
              type="button"
              onClick={handleCopy}
              style={{
                background: '#16a34a', color: '#fff', border: 'none',
                borderRadius: '8px', padding: '6px 14px',
                fontSize: '12px', fontWeight: 700, cursor: 'pointer',
              }}
            >
              📋 Copy
            </button>
          </div>

          {/* action buttons */}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => { setResult(null); setError(''); }}
              style={{
                background: 'linear-gradient(135deg,#0284c7,#0369a1)',
                color: '#fff', border: 'none', borderRadius: '8px',
                padding: '10px 22px', fontWeight: 700, fontSize: '13px', cursor: 'pointer',
              }}
            >
              🔍 New Lookup
            </button>
            {onSuccess && (
              <button
                type="button"
                onClick={onSuccess}
                style={{
                  background: 'linear-gradient(135deg,#64748b,#475569)',
                  color: '#fff', border: 'none', borderRadius: '8px',
                  padding: '10px 22px', fontWeight: 700, fontSize: '13px', cursor: 'pointer',
                }}
              >
                ◀ Back to Services
              </button>
            )}
          </div>
        </div>

      ) : (
        /* ── INPUT FORM (no nested <form> — this component lives inside PanCardView's outer form) ── */
        <div style={{ maxWidth: '500px' }}>

          <div className="form-group-pro">
            <label className="form-label-pro" htmlFor="mpan-aadhaar">
              Aadhaar Number <span className="req-star">*</span>
            </label>
            <input
              id="mpan-aadhaar"
              type="text"
              inputMode="numeric"
              maxLength={12}
              value={aadhaar}
              onChange={(e) => {
                setError('');
                // digits only
                setAadhaar(e.target.value.replace(/\D/g, '').slice(0, 12));
              }}
              placeholder="Enter 12-digit Aadhaar number"
              className="form-input-pro"
              autoComplete="off"
              style={{ letterSpacing: aadhaar.length ? '2px' : 'normal', fontFamily: 'monospace' }}
            />
            <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#64748b' }}>
              Enter the applicant's Aadhaar to fetch the linked PAN number. · Fee: <b>₹{tabFee}</b>
            </p>
          </div>

          {/* character count */}
          {aadhaar.length > 0 && aadhaar.length < 12 && (
            <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#94a3b8' }}>
              {12 - aadhaar.length} digit{12 - aadhaar.length !== 1 ? 's' : ''} remaining
            </p>
          )}

          {/* inline error */}
          {error && (
            <div style={{
              background: '#fef2f2', border: '1px solid #fca5a5',
              borderRadius: '8px', padding: '10px 14px',
              color: '#dc2626', fontSize: '13px', fontWeight: 600,
              marginTop: '10px',
            }}>
              ⚠️ {error}
            </div>
          )}

          <div style={{ marginTop: '20px' }}>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading || aadhaar.length !== 12}
              className="pancard-submit-btn"
            >
              {loading ? '⏳ Fetching PAN...' : '🔍 Fetch PAN Number'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default FindPanByAadhaarForm;
