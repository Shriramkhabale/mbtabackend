import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import QRCode from 'qrcode';
import Swal from 'sweetalert2';
import { hasUserAccess, getStoredUserPermissions } from '../../utils/userPermissions';
import './WalletModal.css';
import { API_URL } from '../../utils/apiClient';

const Toast = Swal.mixin({
  toast: true,
  position: 'top-end',
  showConfirmButton: false,
  timer: 5000,
  timerProgressBar: true
});

// Precision-Crafted Inline SVG Icons
const WalletIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4" />
    <path d="M4 6v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2H4z" />
    <circle cx="16.5" cy="13.5" r="1.5" fill="currentColor" />
  </svg>
);

const DirectPayIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="5" width="20" height="14" rx="2" />
    <line x1="2" y1="10" x2="22" y2="10" />
    <line x1="6" y1="15" x2="10" y2="15" />
  </svg>
);

const PayoutIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
  </svg>
);

const RequisitionIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
    <path d="M9 14l2 2 4-4" />
  </svg>
);

const HistoryIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 8v4l3 3" />
    <circle cx="12" cy="12" r="9" />
  </svg>
);

const BoltIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);

const LockIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

const PhoneIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
    <line x1="12" y1="18" x2="12.01" y2="18" strokeWidth="3" />
  </svg>
);

const BankIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="3" y1="21" x2="21" y2="21" />
    <line x1="3" y1="10" x2="21" y2="10" />
    <polyline points="5 6 12 3 19 6" />
    <line x1="4" y1="10" x2="4" y2="21" />
    <line x1="9" y1="10" x2="9" y2="21" />
    <line x1="15" y1="10" x2="15" y2="21" />
    <line x1="20" y1="10" x2="20" y2="21" />
  </svg>
);

const ArrowLeftIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="19" y1="12" x2="5" y2="12" />
    <polyline points="12 19 5 12 12 5" />
  </svg>
);

const CloseIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const SendIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

const PlusIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const WalletModal = ({ isOpen, onClose, currentUser, initialTab = 'directPayment', walletBalance = 0, onBalanceUpdate, inlineMode = false, theme = 'light', userPermissions }) => {
  const effectivePermissions = useMemo(
    () => userPermissions || getStoredUserPermissions(),
    [userPermissions]
  );

  const canAccessWalletTab = useCallback((tab) => {
    if (tab === 'directPayment') return hasUserAccess(effectivePermissions, 'wallet.upiPayment');
    if (tab === 'payout') return hasUserAccess(effectivePermissions, 'wallet.payout');
    if (tab === 'requisition') return hasUserAccess(effectivePermissions, 'wallet.requisition');
    if (tab === 'history' || tab === 'payInHistory' || tab === 'payOutHistory') return hasUserAccess(effectivePermissions, 'wallet.history');
    return true;
  }, [effectivePermissions]);

  const getFirstAllowedTab = useCallback(() => {
    if (canAccessWalletTab('directPayment')) return 'directPayment';
    if (canAccessWalletTab('requisition')) return 'requisition';
    if (canAccessWalletTab('payout')) return 'payout';
    if (canAccessWalletTab('history')) return 'history';
    return 'directPayment';
  }, [canAccessWalletTab]);

  const [activeTab, setActiveTab] = useState(() => {
    if (initialTab && initialTab !== 'ledger' && canAccessWalletTab(initialTab)) {
      return initialTab;
    }
    return getFirstAllowedTab();
  });
  const currentTheme = theme || localStorage.getItem('appTheme') || 'light';
  const wasOpenRef = useRef(false);
  const onBalanceUpdateRef = useRef(onBalanceUpdate);

  useEffect(() => {
    onBalanceUpdateRef.current = onBalanceUpdate;
  }, [onBalanceUpdate]);

  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      const requestedTab = initialTab && initialTab !== 'ledger' ? initialTab : 'directPayment';
      setActiveTab(canAccessWalletTab(requestedTab) ? requestedTab : getFirstAllowedTab());
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, initialTab, canAccessWalletTab, getFirstAllowedTab]);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const kycParam = urlParams.get('kyc');
    if (kycParam === 'success') {
      setRequiresOnboarding(false);
      Toast.fire({ icon: 'success', title: 'PaySprint KYC verified! You can now add funds.' });
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  // Requisition Form state
  const getTodayDate = () => {
    const today = new Date();
    const offset = today.getTimezoneOffset();
    const localDate = new Date(today.getTime() - (offset * 60 * 1000));
    return localDate.toISOString().split('T')[0];
  };

  const [reqForm, setReqForm] = useState({
    userId: currentUser || '',
    amount: '',
    referenceNumber: '',
    paymentDate: getTodayDate(),
    remarks: '',
    paymentMode: 'NetBanking'
  });

  const [isSubmittingReq, setIsSubmittingReq] = useState(false);

  // Direct Payment (Pay-In) state
  const [directPaymentAmount, setDirectPaymentAmount] = useState('');
  const [directPaymentGateway, setDirectPaymentGateway] = useState('PaySprint');
  const [directPaymentMethod, setDirectPaymentMethod] = useState('UPI');
  const [checkoutData, setCheckoutData] = useState(null); // { txnId, amount, qrCodeUrl, upiLink, checkoutUrl }
  const [ekqrQrCodeUrl, setEkqrQrCodeUrl] = useState('');
  const [ekqrQrError, setEkqrQrError] = useState('');
  const [paymentSuccessData, setPaymentSuccessData] = useState(null);
  const [isProcessingDirect, setIsProcessingDirect] = useState(false);
  const [isVerifyingNow, setIsVerifyingNow] = useState(false);
  const [timeLeft, setTimeLeft] = useState(300);
  const [requiresOnboarding, setRequiresOnboarding] = useState(false);
  const [isOnboardingGenerating, setIsOnboardingGenerating] = useState(false);

  // Pay-Out (Settlement) state
  const [beneficiaries, setBeneficiaries] = useState([]);
  const [selectedBeneId, setSelectedBeneId] = useState('');
  const [payoutAmount, setPayoutAmount] = useState('');
  const [payoutMode, setPayoutMode] = useState('IMPS');
  const [isProcessingPayout, setIsProcessingPayout] = useState(false);
  const [showAddBeneForm, setShowAddBeneForm] = useState(false);
  const [payoutSuccessData, setPayoutSuccessData] = useState(null);

  // Add Beneficiary Form
  const [newBeneForm, setNewBeneForm] = useState({
    beneficiaryName: '',
    bankName: '',
    accountNumber: '',
    confirmAccountNumber: '',
    ifsc: '',
    accountType: 'PRIMARY'
  });
  const [isAddingBene, setIsAddingBene] = useState(false);

  // Pay-In, Pay-Out, and service-charge transaction history state
  const [userTransactions, setUserTransactions] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [historySubTab, setHistorySubTab] = useState('payIn');

  const handlePaymentSuccess = useCallback((amount, txnId, newBal) => {
    const gateway = checkoutData?.gateway || directPaymentGateway;
    setCheckoutData(null);
    setDirectPaymentAmount('');
    if (onBalanceUpdate && newBal !== undefined) {
      onBalanceUpdate(newBal);
    }
    setPaymentSuccessData({
      amount: parseFloat(amount).toFixed(2),
      txnId: txnId,
      gateway,
      walletBalance: parseFloat(newBal || walletBalance).toFixed(2),
      time: new Date().toLocaleTimeString()
    });
    Swal.fire({
      icon: 'success',
      title: 'Payment Verified!',
      text: `₹${parseFloat(amount).toFixed(2)} credited to your wallet. Ref: ${txnId}`,
      confirmButtonColor: '#16a34a'
    });
  }, [checkoutData, directPaymentGateway, onBalanceUpdate, walletBalance]);

  // Sync currentUser with forms and fetch details on mount
  useEffect(() => {
    if (!isOpen) return;

    if (currentUser) {
      fetch(`${API_URL}/api/users/${currentUser}`)
        .then(res => res.json())
        .then(data => {
          if (data.retailerId) {
            setReqForm(prev => ({ ...prev, referenceNumber: data.retailerId, userId: currentUser }));
          }
          if (data.walletBalance !== undefined && onBalanceUpdate) {
            onBalanceUpdate(data.walletBalance);
          }
        })
        .catch(err => console.error("Error loading user info:", err));

      // Fetch Beneficiaries for Pay-Out
      fetch(`${API_URL}/api/payout/beneficiary/list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser })
      })
        .then(res => res.json())
        .then(resData => {
          if (resData.success && Array.isArray(resData.data)) {
            setBeneficiaries(resData.data);
            if (resData.data.length > 0 && !selectedBeneId) {
              setSelectedBeneId(resData.data[0].beneId);
            }
          }
        })
        .catch(err => console.warn('Error fetching beneficiaries:', err));
    }
  }, [isOpen, currentUser, onBalanceUpdate]);

  useEffect(() => {
    if (!isOpen || !currentUser) return undefined;

    let isSubscribed = true;
    fetch(`${API_URL}/api/qr-payment/reconcile/${encodeURIComponent(currentUser)}`, {
      method: 'POST'
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok || !data.success) {
          throw new Error(data.message || 'Could not reconcile QR payments.');
        }
        if (isSubscribed && data.walletBalance !== undefined && onBalanceUpdateRef.current) {
          onBalanceUpdateRef.current(data.walletBalance);
        }
      })
      .catch((error) => {
        console.error('Error reconciling QR wallet payments:', error);
      });

    return () => { isSubscribed = false; };
  }, [isOpen, currentUser]);

  // Fetch user transaction history when History tab is activated
  useEffect(() => {
    if (isOpen && currentUser && (activeTab === 'history' || activeTab === 'payInHistory' || activeTab === 'payOutHistory')) {
      setLoadingHistory(true);
      fetch(`${API_URL}/api/wallet-transactions/user/${encodeURIComponent(currentUser)}`)
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) {
            setUserTransactions(data);
          } else {
            setUserTransactions([]);
          }
          setLoadingHistory(false);
        })
        .catch(err => {
          console.error("Error loading user transactions:", err);
          setLoadingHistory(false);
        });
    }
  }, [isOpen, currentUser, activeTab]);

  // Timer countdown for active checkout
  useEffect(() => {
    if (!checkoutData) return;
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [checkoutData]);

  useEffect(() => {
    let isSubscribed = true;
    setEkqrQrCodeUrl('');
    setEkqrQrError('');

    if (checkoutData?.gateway !== 'EkQR') return () => { isSubscribed = false; };

    const upiLink = checkoutData.upiIntent?.bhim_link;
    if (typeof upiLink !== 'string' || !/^upi:\/\/pay\?/i.test(upiLink)) {
      setEkqrQrError('The provider did not return a standard UPI QR payment link.');
      return () => { isSubscribed = false; };
    }

    QRCode.toDataURL(upiLink, {
      width: 280,
      margin: 2,
      errorCorrectionLevel: 'M'
    }).then((dataUrl) => {
      if (isSubscribed) setEkqrQrCodeUrl(dataUrl);
    }).catch((error) => {
      console.error('Unable to generate EkQR payment QR code:', error);
      if (isSubscribed) setEkqrQrError('Could not generate the payment QR code. Please open the provider checkout instead.');
    });

    return () => { isSubscribed = false; };
  }, [checkoutData]);

  // Polling for PaySprint payment status check
  useEffect(() => {
    if (!checkoutData || !checkoutData.txnId) return;

    let isSubscribed = true;
    const interval = setInterval(async () => {
      if (!isSubscribed) return;
      try {
        const statusPath = checkoutData.gateway === 'EkQR'
          ? 'qr-payment'
          : 'direct-payment';
        const res = await fetch(`${API_URL}/api/${statusPath}/check-status/${checkoutData.txnId}`);
        const data = await res.json();
        if (data && data.success && data.status === 'Success') {
          if (!isSubscribed) return;
          clearInterval(interval);
          handlePaymentSuccess(checkoutData.amount, checkoutData.txnId, data.walletBalance);
        } else if (data && data.status === 'Failed') {
          if (!isSubscribed) return;
          clearInterval(interval);
          setCheckoutData(null);
          Toast.fire({ icon: 'error', title: 'Payment was not completed.' });
        }
      } catch (err) {
        console.warn('Status poll warning:', err.message);
      }
    }, 3000);

    return () => {
      isSubscribed = false;
      clearInterval(interval);
    };
  }, [checkoutData, handlePaymentSuccess]);

  const formatTime = (secs) => {
    const mins = Math.floor(secs / 60);
    const remSecs = secs % 60;
    return `${String(mins).padStart(2, '0')}:${String(remSecs).padStart(2, '0')}`;
  };

  if (!isOpen) return null;

  // Handle Requisition Form Submit
  const handleRequisitionSubmit = async (e) => {
    e.preventDefault();
    if (!reqForm.amount || Number(reqForm.amount) <= 0) {
      Toast.fire({ icon: 'error', title: 'Please enter a valid payment amount.' });
      return;
    }

    setIsSubmittingReq(true);
    try {
      const response = await fetch(`${API_URL}/api/payment-requisitions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqForm)
      });

      setIsSubmittingReq(false);
      if (response.ok) {
        Swal.fire({
          icon: 'success',
          title: 'Requisition Submitted!',
          text: `Your requisition request of ₹${parseFloat(reqForm.amount).toFixed(2)} has been submitted for approval.`,
          confirmButtonColor: '#ea580c'
        });
        setReqForm(prev => ({
          ...prev,
          amount: '',
          remarks: ''
        }));
        onClose();
      } else {
        Toast.fire({ icon: 'error', title: 'Failed to submit requisition.' });
      }
    } catch (err) {
      setIsSubmittingReq(false);
      Toast.fire({ icon: 'error', title: 'Error submitting requisition request.' });
    }
  };

  // Handle Direct Payment (Pay-In) Initiate
  const handleDirectPaymentSubmit = async (e) => {
    e.preventDefault();
    if (!directPaymentAmount || Number(directPaymentAmount) <= 0) {
      Toast.fire({ icon: 'error', title: 'Please enter a valid top-up amount.' });
      return;
    }

    setIsProcessingDirect(true);
    try {
      const endpoint = directPaymentGateway === 'EkQR'
        ? 'qr-payment'
        : 'direct-payment';
      const res = await fetch(`${API_URL}/api/${endpoint}/initiate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser,
          amount: Number(directPaymentAmount),
          paymentMethod: directPaymentMethod
        })
      });

      const data = await res.json();
      setIsProcessingDirect(false);
      if (data.success) {
        setCheckoutData({
          txnId: data.txnId,
          amount: Number(directPaymentAmount),
          qrCodeUrl: data.qrCodeUrl,
          upiLink: data.upiLink,
          checkoutUrl: data.checkoutUrl,
          paymentMethod: directPaymentMethod,
          gateway: data.gateway || directPaymentGateway,
          upiIntent: data.upiIntent || {}
        });
        setTimeLeft(300);
      } else if (data.message === 'ONBOARDING_REQUIRED') {
        setRequiresOnboarding(true);
      } else {
        Toast.fire({ icon: 'error', title: data.message || 'Payment initiation failed.' });
      }
    } catch (err) {
      setIsProcessingDirect(false);
      Toast.fire({ icon: 'error', title: 'Failed to initiate direct payment.' });
    }
  };

  // Handle Onboarding Click
  const handleOnboardClick = async () => {
    setIsOnboardingGenerating(true);
    const url = `${API_URL}/api/paysprint/onboard/generate-url`;
    console.log("Hitting URL:", url, "with userId:", currentUser);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser })
      });
      console.log("Response status:", res.status, res.statusText);
      const data = await res.json();
      console.log("Response data captured:", data);
      setIsOnboardingGenerating(false);
      
      if (data.success && data.onboardUrl) {
        window.open(data.onboardUrl, '_blank');
      } else if (data.success || data.message === 'User is already onboarded.') {
        setRequiresOnboarding(false);
        Toast.fire({ icon: 'success', title: 'PaySprint KYC verified! Wallet unlocked.' });
      } else {
        Toast.fire({ icon: 'error', title: data.message || 'Failed to generate onboarding URL.' });
      }
    } catch (err) {
      console.error("Error during fetch:", err);
      setIsOnboardingGenerating(false);
      Toast.fire({ icon: 'error', title: 'Network error generating onboarding URL.' });
    }
  };

  // Manual Check PaySprint Payment Status
  const handleManualCheckStatus = async () => {
    if (!checkoutData || !checkoutData.txnId) return;
    setIsVerifyingNow(true);
    try {
      const statusPath = checkoutData.gateway === 'EkQR'
        ? 'qr-payment'
        : 'direct-payment';
      const statusRes = await fetch(`${API_URL}/api/${statusPath}/check-status/${checkoutData.txnId}`);
      const statusData = await statusRes.json();
      setIsVerifyingNow(false);

      if (statusData && statusData.success && statusData.status === 'Success') {
        handlePaymentSuccess(checkoutData.amount, checkoutData.txnId, statusData.walletBalance);
      } else if (statusData && statusData.status === 'Failed') {
        setCheckoutData(null);
        Toast.fire({ icon: 'error', title: 'Payment was not completed.' });
      } else {
        Toast.fire({
          icon: 'info',
          title: statusData.message || 'Payment awaiting completion. Please scan and authorize in your UPI app.'
        });
      }
    } catch (err) {
      setIsVerifyingNow(false);
      Toast.fire({ icon: 'error', title: 'Error checking payment status.' });
    }
  };

  // Handle Add Beneficiary
  const handleAddBeneficiarySubmit = async (e) => {
    e.preventDefault();
    if (!newBeneForm.beneficiaryName || !newBeneForm.accountNumber || !newBeneForm.ifsc) {
      Toast.fire({ icon: 'error', title: 'Please fill in all bank account details.' });
      return;
    }
    if (newBeneForm.accountNumber !== newBeneForm.confirmAccountNumber) {
      Toast.fire({ icon: 'error', title: 'Account numbers do not match.' });
      return;
    }

    setIsAddingBene(true);
    try {
      const res = await fetch(`${API_URL}/api/payout/beneficiary/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser,
          beneficiaryName: newBeneForm.beneficiaryName,
          bankName: newBeneForm.bankName || 'Bank',
          accountNumber: newBeneForm.accountNumber,
          ifsc: newBeneForm.ifsc,
          accountType: newBeneForm.accountType
        })
      });
      const data = await res.json();
      setIsAddingBene(false);

      if (data.success && data.data) {
        Toast.fire({ icon: 'success', title: data.message || 'Beneficiary added successfully!' });
        setBeneficiaries(prev => [data.data, ...prev]);
        setSelectedBeneId(data.data.beneId);
        setShowAddBeneForm(false);
        setNewBeneForm({
          beneficiaryName: '',
          bankName: '',
          accountNumber: '',
          confirmAccountNumber: '',
          ifsc: '',
          accountType: 'PRIMARY'
        });
      } else {
        Toast.fire({ icon: 'error', title: data.message || 'Failed to add beneficiary.' });
      }
    } catch (err) {
      setIsAddingBene(false);
      Toast.fire({ icon: 'error', title: 'Network error adding beneficiary.' });
    }
  };

  // Handle Pay-Out (Disbursement / Bank Transfer)
  const handlePayoutSubmit = async (e) => {
    e.preventDefault();
    const transferAmt = Number(payoutAmount);
    if (!transferAmt || transferAmt <= 0) {
      Toast.fire({ icon: 'error', title: 'Please enter a valid payout amount.' });
      return;
    }
    if (!selectedBeneId) {
      Toast.fire({ icon: 'error', title: 'Please select a beneficiary bank account.' });
      return;
    }
    if (transferAmt > walletBalance) {
      Toast.fire({ icon: 'error', title: `Insufficient balance! Current: ₹${walletBalance.toFixed(2)}` });
      return;
    }

    const selectedBene = beneficiaries.find(b => b.beneId === selectedBeneId);

    const result = await Swal.fire({
      title: 'Confirm PaySprint Payout',
      html: `Transfer <strong>₹${transferAmt.toFixed(2)}</strong> via PaySprint <strong>${payoutMode}</strong> to:<br/><br/>
             <strong>${selectedBene?.beneficiaryName || 'Beneficiary'}</strong><br/>
             A/C: <code>${selectedBene?.accountNumber || ''}</code> | IFSC: <code>${selectedBene?.ifsc || ''}</code>`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Yes, Transfer Now',
      confirmButtonColor: '#ea580c',
      cancelButtonColor: '#64748b'
    });

    if (!result.isConfirmed) return;

    setIsProcessingPayout(true);
    try {
      const res = await fetch(`${API_URL}/api/payout/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser,
          beneId: selectedBeneId,
          amount: transferAmt,
          mode: payoutMode,
          pipe: selectedBene?.pipe || 'bank2'
        })
      });

      const data = await res.json();
      setIsProcessingPayout(false);

      if (data.success) {
        if (onBalanceUpdate && data.walletBalance !== undefined) {
          onBalanceUpdate(data.walletBalance);
        }
        setPayoutSuccessData({
          amount: transferAmt.toFixed(2),
          refId: data.refId,
          ackno: data.ackno || data.refId,
          mode: payoutMode,
          beneficiary: selectedBene,
          walletBalance: data.walletBalance !== undefined ? data.walletBalance.toFixed(2) : (walletBalance - transferAmt).toFixed(2),
          status: data.status,
          time: new Date().toLocaleTimeString()
        });
        setPayoutAmount('');
        Swal.fire({
          icon: 'success',
          title: 'PaySprint Payout Processed!',
          text: data.message || `₹${transferAmt.toFixed(2)} transfer initiated. Ref: ${data.refId}`,
          confirmButtonColor: '#16a34a'
        });
      } else {
        Swal.fire({
          icon: 'error',
          title: 'Payout Failed',
          text: data.message || 'Unable to complete payout transaction.',
          confirmButtonColor: '#ef4444'
        });
      }
    } catch (err) {
      setIsProcessingPayout(false);
      Toast.fire({ icon: 'error', title: 'Network error executing payout.' });
    }
  };

  const modalContent = (
    <div className={`wallet-modal-card ${inlineMode ? 'inline-mode' : ''} theme-${currentTheme}`}>
      
      {/* Modern Ultra-Sleek Header */}
      <div className="wallet-modal-header">
        <div className="wallet-header-left">
          <div className="wallet-title-cluster">
            <div className="wallet-header-icon-badge">
              <WalletIcon />
            </div>
            <div>
              <h3 className="wallet-modal-title">PaySprint Wallet System</h3>
              <div className="wallet-modal-subtitle">
                <span>Current Balance:</span>
                <span className="header-balance-badge">₹{parseFloat(walletBalance || 0).toFixed(2)}</span>
                <span className="badge-paysprint-live">⚡ PaySprint LIVE</span>
              </div>
            </div>
          </div>
        </div>

        <div className="wallet-header-actions">
          {inlineMode && (
            <button
              type="button"
              className="wallet-back-btn"
              onClick={onClose}
              title="Back to Dashboard"
            >
              <ArrowLeftIcon />
              <span>Back to Dashboard</span>
            </button>
          )}
          <button className="close-wallet-btn" onClick={onClose} title="Close Modal">
            <CloseIcon />
          </button>
        </div>
      </div>

      {/* Segmented Pill Navigation Tabs: Pay-In, Pay-Out, Requisition */}
      <div className="wallet-tabs-container">
        <div className="wallet-tabs-bar">
          {canAccessWalletTab('directPayment') && (
            <button
              type="button"
              className={`wallet-tab-btn ${activeTab === 'directPayment' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('directPayment');
                setPaymentSuccessData(null);
              }}
            >
              <DirectPayIcon />
              <span>Pay-In (Add Funds)</span>
            </button>
          )}
          {canAccessWalletTab('payout') && (
            <button
              type="button"
              className={`wallet-tab-btn ${activeTab === 'payout' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('payout');
                setPayoutSuccessData(null);
              }}
            >
              <PayoutIcon />
              <span>Pay-Out (Bank Transfer)</span>
            </button>
          )}
          {canAccessWalletTab('requisition') && (
            <button
              type="button"
              className={`wallet-tab-btn ${activeTab === 'requisition' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('requisition');
                setPaymentSuccessData(null);
              }}
            >
              <RequisitionIcon />
              <span>Requisition</span>
            </button>
          )}
          {canAccessWalletTab('history') && (
            <button
              type="button"
              className={`wallet-tab-btn ${(activeTab === 'history' || activeTab === 'payInHistory' || activeTab === 'payOutHistory') ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('history');
                setPaymentSuccessData(null);
              }}
            >
              <HistoryIcon />
              <span>History</span>
            </button>
          )}
        </div>
      </div>

      {/* Modal Scrollable Content Body */}
      <div className="wallet-modal-body">
        
        {!canAccessWalletTab(activeTab) && (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: '#64748b' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>🔒</div>
            <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#1e293b', marginBottom: '6px' }}>Service Access Restricted</h3>
            <p style={{ fontSize: '14px', maxWidth: '380px', margin: '0 auto' }}>You do not have administrative permission to access this wallet service.</p>
          </div>
        )}

        {/* TAB 1: PAY-IN (DIRECT PAYMENT) */}
        {canAccessWalletTab(activeTab) && activeTab === 'directPayment' && (
          <div className="form-card-box">
            
            {/* 1. PAYMENT SUCCESS RECEIPT SCREEN */}
            {paymentSuccessData ? (
              <div className="payment-success-card">
                <div className="success-icon-badge">
                  <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                </div>
                <h3 className="success-card-title">
                  {paymentSuccessData.gateway === 'EkQR' ? 'QR Payment Verified!' : 'PaySprint Transaction Verified!'}
                </h3>
                <div className="success-card-amount">₹{paymentSuccessData.amount}</div>
                <div className="success-card-badge">✓ Credited to your wallet</div>

                <div className="success-details-list">
                  <div className="success-detail-row">
                    <span>Transaction Reference:</span>
                    <strong>{paymentSuccessData.txnId}</strong>
                  </div>
                  <div className="success-detail-row">
                    <span>Updated Wallet Balance:</span>
                    <strong className="text-balance-green">₹{paymentSuccessData.walletBalance}</strong>
                  </div>
                  <div className="success-detail-row">
                    <span>Payment Time:</span>
                    <span>{paymentSuccessData.time}</span>
                  </div>
                  <div className="success-detail-row">
                    <span>Gateway Status:</span>
                    <span className="badge-confirmed">✓ Confirmed by {paymentSuccessData.gateway === 'EkQR' ? 'QR payment provider' : 'PaySprint'}</span>
                  </div>
                </div>

                <div className="success-card-actions">
                  <button
                    type="button"
                    className="btn-success-topup-more"
                    onClick={() => {
                      setPaymentSuccessData(null);
                      setCheckoutData(null);
                      setDirectPaymentAmount('');
                    }}
                  >
                    + Add More Funds
                  </button>
                  {inlineMode && (
                    <button
                      type="button"
                      className="btn-success-dashboard"
                      onClick={onClose}
                    >
                      Back to Dashboard
                    </button>
                  )}
                </div>
              </div>
            ) : requiresOnboarding ? (
              /* ONBOARDING REQUIRED SCREEN */
              <div className="qr-expired-card" style={{ padding: '30px', textAlign: 'center' }}>
                <div className="expired-icon-badge" style={{ color: '#ea580c', borderColor: '#ea580c' }}>
                  <LockIcon />
                </div>
                <h3 className="expired-card-title">PaySprint KYC Required</h3>
                <p className="expired-card-sub" style={{ marginBottom: '20px' }}>
                  You must complete your PaySprint Merchant Onboarding and e-KYC before you can add funds to your wallet.
                </p>
                <button
                  type="button"
                  className="form-submit-btn-primary"
                  onClick={handleOnboardClick}
                  disabled={isOnboardingGenerating}
                >
                  {isOnboardingGenerating ? 'Generating Link...' : 'Complete KYC to Unlock Wallet ↗'}
                </button>
                <button
                  type="button"
                  className="btn-restart-payment"
                  style={{ marginTop: '15px' }}
                  onClick={() => setRequiresOnboarding(false)}
                >
                  Cancel
                </button>
              </div>
            ) : !checkoutData ? (
              /* 2. TOP-UP AMOUNT INPUT FORM */
              <>
                <div className="form-section-header">
                  <div className="section-header-icon">
                    <BoltIcon />
                  </div>
                  <div className="section-header-text">
                    <div className="section-title">
                      {directPaymentGateway === 'EkQR' ? 'QR Code Add Funds' : 'Instant Pay-In / UPI Collection'}
                    </div>
                    <div className="section-desc">
                      {directPaymentGateway === 'EkQR'
                        ? 'Create a secure QR checkout order and verify payment with the provider.'
                        : 'Generate a dynamic PaySprint QR code. Transactions reflect in the live PaySprint dashboard.'}
                    </div>
                  </div>
                </div>

                <form onSubmit={handleDirectPaymentSubmit}>
                  {/* Quick Amount Chips */}
                  <div className="form-group-pro">
                    <label className="pro-label">Quick Amount Selection</label>
                    <div className="quick-amounts-row">
                      {[500, 1000, 2000, 5000].map(amt => (
                        <button
                          key={amt}
                          type="button"
                          className={`quick-amount-btn ${Number(directPaymentAmount) === amt ? 'selected' : ''}`}
                          onClick={() => setDirectPaymentAmount(String(amt))}
                        >
                          + ₹{amt.toLocaleString()}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Amount Input */}
                  <div className="form-group-pro">
                    <label className="pro-label">Enter Amount (₹)</label>
                    <div className="input-with-icon-wrapper">
                      <input
                        type="number"
                        required
                        min="1"
                        className="form-input-pro amount-input"
                        placeholder="e.g. 1000"
                        value={directPaymentAmount}
                        onChange={e => setDirectPaymentAmount(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="form-group-pro">
                    <label className="pro-label">Add-Funds Option</label>
                    <div className="payment-methods-grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                      <button
                        type="button"
                        className={`pm-card pm-card-button ${directPaymentGateway === 'PaySprint' ? 'selected' : ''}`}
                        onClick={() => setDirectPaymentGateway('PaySprint')}
                      >
                        <div className="pm-icon"><PhoneIcon /></div>
                        <div className="pm-info">
                          <span className="pm-name">PaySprint UPI</span>
                          <span className="pm-sub">Current payment option</span>
                        </div>
                      </button>
                      <button
                        type="button"
                        className={`pm-card pm-card-button ${directPaymentGateway === 'EkQR' ? 'selected' : ''}`}
                        onClick={() => setDirectPaymentGateway('EkQR')}
                      >
                        <div className="pm-icon"><BoltIcon /></div>
                        <div className="pm-info">
                          <span className="pm-name">QR Code Payment</span>
                          <span className="pm-sub">EkQR secure checkout</span>
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* PaySprint payment channel selector */}
                  {directPaymentGateway === 'PaySprint' && <div className="form-group-pro">
                    <label className="pro-label">Payment Channel</label>
                    <div className="payment-methods-grid">
                      <div
                        className={`pm-card ${directPaymentMethod === 'UPI' ? 'selected' : ''}`}
                        onClick={() => setDirectPaymentMethod('UPI')}
                      >
                        <div className="pm-icon"><PhoneIcon /></div>
                        <div className="pm-info">
                          <span className="pm-name">PaySprint Dynamic UPI</span>
                          <span className="pm-sub">GPay, PhonePe, Paytm, BHIM</span>
                        </div>
                      </div>

                      <div
                        className={`pm-card ${directPaymentMethod === 'NetBanking' ? 'selected' : ''}`}
                        onClick={() => setDirectPaymentMethod('NetBanking')}
                      >
                        <div className="pm-icon"><BankIcon /></div>
                        <div className="pm-info">
                          <span className="pm-name">NetBanking</span>
                          <span className="pm-sub">Instant Bank Transfer</span>
                        </div>
                      </div>

                      <div
                        className={`pm-card ${directPaymentMethod === 'Card' ? 'selected' : ''}`}
                        onClick={() => setDirectPaymentMethod('Card')}
                      >
                        <div className="pm-icon"><DirectPayIcon /></div>
                        <div className="pm-info">
                          <span className="pm-name">Cards</span>
                          <span className="pm-sub">Debit & Credit</span>
                        </div>
                      </div>
                    </div>
                  </div>}

                  <button
                    type="submit"
                    disabled={isProcessingDirect}
                    className="form-submit-btn-primary"
                  >
                    {isProcessingDirect ? (
                      <span className="btn-loading-state">
                        <span className="btn-spinner"></span> Generating {directPaymentGateway === 'EkQR' ? 'QR payment' : 'PaySprint QR'}...
                      </span>
                    ) : (
                      <>
                        <BoltIcon />
                        <span>
                          {directPaymentGateway === 'EkQR' ? 'Create QR Payment' : 'Generate PaySprint QR'}
                          {' '} (₹{directPaymentAmount ? Number(directPaymentAmount).toLocaleString() : '0.00'})
                        </span>
                      </>
                    )}
                  </button>
                </form>
              </>
            ) : timeLeft <= 0 ? (
              /* 3. QR EXPIRED SCREEN */
              <div className="qr-expired-card">
                <div className="expired-icon-badge">⏳</div>
                <h3 className="expired-card-title">QR Session Expired</h3>
                <p className="expired-card-sub">The 5-minute dynamic payment session has expired. Please initiate a new top-up request.</p>
                <button
                  type="button"
                  className="btn-restart-payment"
                  onClick={() => {
                    setCheckoutData(null);
                    setDirectPaymentAmount('');
                  }}
                >
                  🔄 Start New Payment
                </button>
              </div>
            ) : (
              /* 4. ACTIVE QR CHECKOUT VIEW */
              <div className="qr-checkout-container">
                <div className="qr-checkout-header">
                  <div className="qr-checkout-badge">
                    <span>{checkoutData.gateway === 'EkQR' ? 'QR Code Payment Checkout' : 'PaySprint Live UPI Dynamic Collection'}</span>
                  </div>
                  <div className="qr-checkout-amount">
                    ₹{Number(checkoutData.amount).toFixed(2)}
                  </div>
                  <div className="qr-checkout-ref">
                    Ref ID: <strong>{checkoutData.txnId}</strong>
                  </div>
                </div>

                <div className="qr-display-box">
                  {checkoutData.qrCodeUrl ? (
                    <img src={checkoutData.qrCodeUrl} alt="Payment QR Code" className="qr-image" />
                  ) : checkoutData.gateway === 'EkQR' && ekqrQrCodeUrl ? (
                    <img src={ekqrQrCodeUrl} alt="Scan to pay with any UPI app" className="qr-image" />
                  ) : checkoutData.gateway === 'EkQR' && !ekqrQrError ? (
                    <div className="qr-placeholder">Preparing your payment QR code...</div>
                  ) : checkoutData.checkoutUrl ? (
                    <div className="qr-placeholder" style={{ padding: '20px' }}>
                      <p>{checkoutData.gateway === 'EkQR' ? ekqrQrError || 'Your QR payment order is ready. Open the secure checkout to view the QR code.' : 'Payment checkout generated successfully.'}</p>
                      <a href={checkoutData.checkoutUrl} target="_blank" rel="noopener noreferrer" className="form-submit-btn-primary" style={{ display: 'inline-block', marginTop: '10px', textDecoration: 'none' }}>
                        {checkoutData.gateway === 'EkQR' ? 'Open QR Payment Page ↗' : 'Open PaySprint Checkout ↗'}
                      </a>
                    </div>
                  ) : (
                    <div className="qr-placeholder">Generating PaySprint QR...</div>
                  )}
                  <div className="qr-scan-hint">
                    📱 Scan with <strong>Google Pay, PhonePe, Paytm, BHIM</strong> or any UPI App
                  </div>
                </div>

                {checkoutData.upiLink && (
                  <a
                    href={checkoutData.upiLink}
                    className="upi-intent-button"
                  >
                    <span>📲 Pay Directly via UPI App</span>
                  </a>
                )}
                <div className="qr-status-pulse">
                  <span className="pulse-indicator"></span>
                  <span>Awaiting {checkoutData.gateway === 'EkQR' ? 'QR payment' : 'PaySprint'} confirmation ({formatTime(timeLeft)})</span>
                </div>

                <div className="qr-action-buttons">
                  <button
                    type="button"
                    className="qr-check-status-btn"
                    onClick={handleManualCheckStatus}
                    disabled={isVerifyingNow}
                  >
                    {isVerifyingNow ? (
                      <>
                        <span className="btn-spinner" style={{ width: 14, height: 14 }}></span>
                        <span>Verifying payment...</span>
                      </>
                    ) : (
                      <>
                        <span>🔄</span>
                        <span>Check Payment Status</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    className="qr-cancel-btn"
                    onClick={() => setCheckoutData(null)}
                  >
                    Cancel & Change Amount
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: PAY-OUT (BANK TRANSFER / SETTLEMENT) */}
        {canAccessWalletTab(activeTab) && activeTab === 'payout' && (
          <div className="form-card-box">
            
            {payoutSuccessData ? (
              <div className="payment-success-card">
                <div className="success-icon-badge">
                  <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                </div>
                <h3 className="success-card-title">PaySprint Payout Processed!</h3>
                <div className="success-card-amount">₹{payoutSuccessData.amount}</div>
                <div className="success-card-badge">✓ Transferred via PaySprint {payoutSuccessData.mode}</div>

                <div className="success-details-list">
                  <div className="success-detail-row">
                    <span>Reference ID:</span>
                    <strong>{payoutSuccessData.refId}</strong>
                  </div>
                  <div className="success-detail-row">
                    <span>Bank Ack No / UTR:</span>
                    <strong>{payoutSuccessData.ackno}</strong>
                  </div>
                  <div className="success-detail-row">
                    <span>Beneficiary:</span>
                    <span>{payoutSuccessData.beneficiary?.beneficiaryName} ({payoutSuccessData.beneficiary?.accountNumber})</span>
                  </div>
                  <div className="success-detail-row">
                    <span>Remaining Wallet Balance:</span>
                    <strong className="text-balance-green">₹{payoutSuccessData.walletBalance}</strong>
                  </div>
                  <div className="success-detail-row">
                    <span>Status:</span>
                    <span className="badge-confirmed">✓ Recorded on PaySprint Dashboard</span>
                  </div>
                </div>

                <div className="success-card-actions">
                  <button
                    type="button"
                    className="btn-success-topup-more"
                    onClick={() => {
                      setPayoutSuccessData(null);
                      setPayoutAmount('');
                    }}
                  >
                    + New Payout Transfer
                  </button>
                  {inlineMode && (
                    <button
                      type="button"
                      className="btn-success-dashboard"
                      onClick={onClose}
                    >
                      Back to Dashboard
                    </button>
                  )}
                </div>
              </div>
            ) : showAddBeneForm ? (
              /* ADD NEW BENEFICIARY FORM */
              <>
                <div className="form-section-header">
                  <div className="section-header-icon">
                    <BankIcon />
                  </div>
                  <div className="section-header-text">
                    <div className="section-title">Add Bank Beneficiary</div>
                    <div className="section-desc">Register recipient bank account for instant PaySprint IMPS/NEFT transfers</div>
                  </div>
                </div>

                <form onSubmit={handleAddBeneficiarySubmit}>
                  <div className="form-group-pro">
                    <label className="pro-label">Account Holder Name</label>
                    <input
                      type="text"
                      required
                      className="form-input-pro"
                      placeholder="e.g. Rahul Sharma"
                      value={newBeneForm.beneficiaryName}
                      onChange={e => setNewBeneForm({ ...newBeneForm, beneficiaryName: e.target.value })}
                    />
                  </div>

                  <div className="form-grid-two-col">
                    <div className="form-group-pro">
                      <label className="pro-label">Bank Name</label>
                      <input
                        type="text"
                        required
                        className="form-input-pro"
                        placeholder="e.g. State Bank of India"
                        value={newBeneForm.bankName}
                        onChange={e => setNewBeneForm({ ...newBeneForm, bankName: e.target.value })}
                      />
                    </div>
                    <div className="form-group-pro">
                      <label className="pro-label">IFSC Code</label>
                      <input
                        type="text"
                        required
                        className="form-input-pro"
                        placeholder="e.g. SBIN0001234"
                        style={{ textTransform: 'uppercase' }}
                        value={newBeneForm.ifsc}
                        onChange={e => setNewBeneForm({ ...newBeneForm, ifsc: e.target.value.toUpperCase() })}
                      />
                    </div>
                  </div>

                  <div className="form-grid-two-col">
                    <div className="form-group-pro">
                      <label className="pro-label">Account Number</label>
                      <input
                        type="text"
                        required
                        className="form-input-pro"
                        placeholder="Enter account number"
                        value={newBeneForm.accountNumber}
                        onChange={e => setNewBeneForm({ ...newBeneForm, accountNumber: e.target.value })}
                      />
                    </div>
                    <div className="form-group-pro">
                      <label className="pro-label">Confirm Account Number</label>
                      <input
                        type="text"
                        required
                        className="form-input-pro"
                        placeholder="Re-enter account number"
                        value={newBeneForm.confirmAccountNumber}
                        onChange={e => setNewBeneForm({ ...newBeneForm, confirmAccountNumber: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="payout-form-actions">
                    <button
                      type="submit"
                      disabled={isAddingBene}
                      className="form-submit-btn-primary"
                    >
                      {isAddingBene ? 'Saving Beneficiary...' : 'Verify & Add Account'}
                    </button>
                    <button
                      type="button"
                      className="qr-cancel-btn"
                      onClick={() => setShowAddBeneForm(false)}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </>
            ) : (
              /* PAYOUT TRANSFER FORM */
              <>
                <div className="form-section-header">
                  <div className="section-header-icon">
                    <PayoutIcon />
                  </div>
                  <div className="section-header-text">
                    <div className="section-title">PaySprint Bank Pay-Out (Settlement)</div>
                    <div className="section-desc">Transfer wallet funds directly to your verified bank account via PaySprint IMPS/NEFT</div>
                  </div>
                </div>

                <form onSubmit={handlePayoutSubmit}>
                  {/* Beneficiary Selector */}
                  <div className="form-group-pro">
                    <div className="bene-header-row">
                      <label className="pro-label">Select Beneficiary Bank Account</label>
                      <button
                        type="button"
                        className="btn-add-bene-toggle"
                        onClick={() => setShowAddBeneForm(true)}
                      >
                        <PlusIcon /> Add Bank Account
                      </button>
                    </div>

                    {beneficiaries.length === 0 ? (
                      <div className="no-bene-box" onClick={() => setShowAddBeneForm(true)}>
                        <p>No saved bank accounts found.</p>
                        <span className="link-add-bene">+ Click here to add your Bank Account</span>
                      </div>
                    ) : (
                      <div className="bene-cards-list">
                        {beneficiaries.map(bene => (
                          <div
                            key={bene.beneId}
                            className={`bene-card ${selectedBeneId === bene.beneId ? 'selected' : ''}`}
                            onClick={() => setSelectedBeneId(bene.beneId)}
                          >
                            <div className="bene-card-radio">
                              <input
                                type="radio"
                                name="beneSelect"
                                checked={selectedBeneId === bene.beneId}
                                onChange={() => setSelectedBeneId(bene.beneId)}
                              />
                            </div>
                            <div className="bene-card-info">
                              <div className="bene-card-name">{bene.beneficiaryName}</div>
                              <div className="bene-card-bank">{bene.bankName} • {bene.accountNumber}</div>
                              <div className="bene-card-ifsc">IFSC: {bene.ifsc}</div>
                            </div>
                            <div className="bene-card-badge">✓ Verified</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Transfer Amount */}
                  <div className="form-group-pro">
                    <div className="label-row">
                      <label className="pro-label">Transfer Amount (₹)</label>
                      <span className="balance-hint-badge">
                        Available: ₹{parseFloat(walletBalance || 0).toFixed(2)}
                      </span>
                    </div>
                    <div className="input-with-icon-wrapper">
                      <input
                        type="number"
                        required
                        min="1"
                        max={walletBalance}
                        className="form-input-pro amount-input"
                        placeholder="e.g. 2000"
                        value={payoutAmount}
                        onChange={e => setPayoutAmount(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Transfer Mode */}
                  <div className="form-group-pro">
                    <label className="pro-label">Transfer Mode</label>
                    <div className="payout-modes-grid">
                      <div
                        className={`payout-mode-card ${payoutMode === 'IMPS' ? 'selected' : ''}`}
                        onClick={() => setPayoutMode('IMPS')}
                      >
                        <div className="pm-mode-title">⚡ IMPS (Instant 24x7)</div>
                        <div className="pm-mode-sub">Real-time credit to beneficiary account</div>
                      </div>
                      <div
                        className={`payout-mode-card ${payoutMode === 'NEFT' ? 'selected' : ''}`}
                        onClick={() => setPayoutMode('NEFT')}
                      >
                        <div className="pm-mode-title">🏦 NEFT</div>
                        <div className="pm-mode-sub">Batch processing settlement</div>
                      </div>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isProcessingPayout || beneficiaries.length === 0 || !payoutAmount || Number(payoutAmount) > walletBalance}
                    className="form-submit-btn-primary"
                  >
                    {isProcessingPayout ? (
                      <span className="btn-loading-state">
                        <span className="btn-spinner"></span> Processing PaySprint Transfer...
                      </span>
                    ) : (
                      <>
                        <PayoutIcon />
                        <span>Transfer ₹{payoutAmount ? Number(payoutAmount).toLocaleString() : '0.00'} to Bank</span>
                      </>
                    )}
                  </button>
                </form>
              </>
            )}
          </div>
        )}

        {/* TAB 3: REQUISITION */}
        {canAccessWalletTab(activeTab) && activeTab === 'requisition' && (
          <div className="form-card-box">
            <div className="form-section-header">
              <div className="section-header-icon">
                <RequisitionIcon />
              </div>
              <div className="section-header-text">
                <div className="section-title">Submit Payment Requisition</div>
                <div className="section-desc">Submit offline bank deposit, NEFT/RTGS, or manual slip for approval</div>
              </div>
            </div>

            <form onSubmit={handleRequisitionSubmit}>
              
              <div className="form-group-pro" style={{ marginBottom: '16px' }}>
                <div className="label-row">
                  <label className="pro-label">User ID</label>
                  <span className="badge-readonly">
                    <LockIcon /> Auto-filled
                  </span>
                </div>
                <div className="input-with-icon-wrapper">
                  <input
                    type="text"
                    required
                    value={reqForm.userId}
                    readOnly
                    className="form-input-pro readonly-input"
                  />
                </div>
              </div>

              <div className="form-grid-two-col">
                {/* Amount (₹) */}
                <div className="form-group-pro">
                  <label className="pro-label">Amount (₹)</label>
                  <div className="input-with-icon-wrapper">
                    <input
                      type="number"
                      required
                      min="1"
                      className="form-input-pro amount-input"
                      placeholder="Enter amount"
                      value={reqForm.amount}
                      onChange={e => setReqForm({ ...reqForm, amount: e.target.value })}
                    />
                  </div>
                </div>

                {/* Payment Date */}
                <div className="form-group-pro">
                  <label className="pro-label">Payment Date</label>
                  <div className="input-with-icon-wrapper">
                    <input
                      type="date"
                      required
                      className="form-input-pro date-input-pro"
                      value={reqForm.paymentDate}
                      onChange={e => setReqForm({ ...reqForm, paymentDate: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              {/* Quick Amount Options */}
              <div className="form-group-pro">
                <label className="pro-label">Quick Amount Options</label>
                <div className="quick-amounts-row">
                  {[1000, 2000, 5000, 10000].map(amt => (
                    <button
                      key={amt}
                      type="button"
                      className={`quick-amount-btn ${Number(reqForm.amount) === amt ? 'selected' : ''}`}
                      onClick={() => setReqForm({ ...reqForm, amount: String(amt) })}
                    >
                      + ₹{amt.toLocaleString()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Remarks (Optional) */}
              <div className="form-group-pro">
                <label className="pro-label">Remarks / UTR Number (Optional)</label>
                <div className="input-with-icon-wrapper">
                  <input
                    type="text"
                    className="form-input-pro"
                    placeholder="Bank reference, UTR, or deposit transaction ID..."
                    value={reqForm.remarks}
                    onChange={e => setReqForm({ ...reqForm, remarks: e.target.value })}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmittingReq}
                className="form-submit-btn-primary"
              >
                {isSubmittingReq ? (
                  <span className="btn-loading-state">
                    <span className="btn-spinner"></span> Submitting Request...
                  </span>
                ) : (
                  <>
                    <SendIcon />
                    <span>{reqForm.amount ? `Submit ₹${Number(reqForm.amount).toLocaleString()} Requisition Request` : 'Submit Requisition Request'}</span>
                  </>
                )}
              </button>
            </form>
          </div>
        )}

        {/* TAB 4: HISTORY */}
        {canAccessWalletTab(activeTab) && (activeTab === 'history' || activeTab === 'payInHistory' || activeTab === 'payOutHistory') && (
          <div className="form-card-box">
            <div className="form-section-header" style={{ marginBottom: '16px' }}>
              <div className="section-header-icon" style={{ background: historySubTab === 'payIn' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)', borderColor: historySubTab === 'payIn' ? 'rgba(34, 197, 94, 0.35)' : 'rgba(239, 68, 68, 0.35)', color: historySubTab === 'payIn' ? '#22c55e' : '#ef4444' }}>
                <HistoryIcon />
              </div>
              <div className="section-header-text">
                <div className="section-title">Wallet Transaction History</div>
                <div className="section-desc">View Pay-In top-ups, Pay-Out bank transfers, and service charges</div>
              </div>
            </div>

            {/* Separate wallet top-ups, payouts, and service charges */}
            <div className="history-subtabs-row">
              <button
                type="button"
                className={`history-subtab-btn ${historySubTab === 'payIn' ? 'active-payin' : ''}`}
                onClick={() => setHistorySubTab('payIn')}
              >
                <span className="subtab-icon"><BoltIcon /></span>
                <span>Pay-In History</span>
              </button>
              <button
                type="button"
                className={`history-subtab-btn ${historySubTab === 'payOut' ? 'active-payout' : ''}`}
                onClick={() => setHistorySubTab('payOut')}
              >
                <span className="subtab-icon"><PayoutIcon /></span>
                <span>Pay-Out History</span>
              </button>
              <button
                type="button"
                className={`history-subtab-btn ${historySubTab === 'serviceCharges' ? 'active-payout' : ''}`}
                onClick={() => setHistorySubTab('serviceCharges')}
              >
                <span className="subtab-icon">🧾</span>
                <span>Service Charges</span>
              </button>
            </div>

            <div className="history-filter-bar">
              <input
                type="text"
                className="form-input-pro history-search-input"
                placeholder={`Search ${historySubTab === 'payIn' ? 'Pay-In' : historySubTab === 'payOut' ? 'Pay-Out' : 'service charge'} reference, description...`}
                value={historySearch}
                onChange={e => setHistorySearch(e.target.value)}
              />
              <button
                type="button"
                className="history-refresh-btn"
                onClick={() => {
                  if (currentUser) {
                    setLoadingHistory(true);
                    fetch(`${API_URL}/api/wallet-transactions/user/${encodeURIComponent(currentUser)}`)
                      .then(res => res.json())
                      .then(data => {
                        if (Array.isArray(data)) setUserTransactions(data);
                        setLoadingHistory(false);
                      })
                      .catch(() => setLoadingHistory(false));
                  }
                }}
              >
                🔄 Refresh
              </button>
            </div>

            {loadingHistory ? (
              <div className="history-loading-box">
                <span className="btn-spinner" style={{ width: 22, height: 22, borderColor: 'rgba(234, 88, 12, 0.3)', borderTopColor: '#ea580c' }}></span>
                <span>Loading transaction history...</span>
              </div>
            ) : (() => {
              const filteredTxs = userTransactions.filter(tx => {
                if (historySubTab === 'payIn') return tx.transactionType === 'Credit';
                if (tx.transactionType !== 'Debit') return false;
                const isPayout = /^payout transfer to\b/i.test(tx.description || '');
                return historySubTab === 'payOut' || !isPayout;
              }).filter(tx => {
                if (!historySearch) return true;
                const q = historySearch.toLowerCase();
                return (tx.description || '').toLowerCase().includes(q) ||
                       (tx.referenceNumber || '').toLowerCase().includes(q) ||
                       (tx.amount != null && tx.amount.toString().includes(q)) ||
                       (tx.status || '').toLowerCase().includes(q);
              });

              if (filteredTxs.length === 0) {
                const historyLabel = historySubTab === 'payIn'
                  ? 'Pay-In'
                  : historySubTab === 'payOut' ? 'Pay-Out' : 'Service Charge';
                return (
                  <div className="history-empty-box">
                    <div className="history-empty-icon">{historySubTab === 'payIn' ? '📥' : historySubTab === 'payOut' ? '📤' : '🧾'}</div>
                    <div className="history-empty-title">No {historyLabel} Transactions Found</div>
                    <div className="history-empty-sub">
                      {historySubTab === 'payIn'
                        ? 'Top-up your wallet using Pay-In to see credited transactions here'
                        : historySubTab === 'payOut'
                          ? 'Transfer funds to bank accounts using Pay-Out to see debited transactions here'
                          : 'PAN applications, Find My PAN lookups, and other service fees appear here'}
                    </div>
                  </div>
                );
              }

              return (
                <div className="history-table-container">
                  <table className="history-table">
                    <thead>
                      <tr>
                        <th>Date & Time</th>
                        <th>Description / Ref</th>
                        <th>Type</th>
                        <th>Amount (₹)</th>
                        <th>Balance After</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTxs.map((tx, idx) => {
                        const isCredit = tx.transactionType === 'Credit';
                        return (
                          <tr key={tx._id || idx}>
                            <td>
                              <div className="tx-date-main">{new Date(tx.createdAt).toLocaleDateString()}</div>
                              <div className="tx-time-sub">{new Date(tx.createdAt).toLocaleTimeString()}</div>
                            </td>
                            <td>
                              <div className="tx-desc-title">{tx.description || (isCredit ? 'Pay-In Wallet Top-up' : 'Pay-Out Bank Transfer')}</div>
                              <div className="tx-ref-code">Ref: {tx.referenceNumber || 'N/A'}</div>
                            </td>
                            <td>
                              <span className={isCredit ? 'badge-credit-pill' : 'badge-debit-pill'}>
                                {isCredit ? '+ CREDIT' : '- DEBIT'}
                              </span>
                            </td>
                            <td>
                              <span className={isCredit ? 'tx-amount-green' : 'tx-amount-red'}>
                                {isCredit ? '+' : '-'} ₹{parseFloat(tx.amount || 0).toFixed(2)}
                              </span>
                            </td>
                            <td>
                              <span className="tx-bal-code">₹{parseFloat(tx.balanceAfter || 0).toFixed(2)}</span>
                            </td>
                            <td>
                              <span className={`tx-status-pill ${tx.status === 'Success' ? 'status-success' : tx.status === 'Pending' ? 'status-pending' : 'status-failed'}`}>
                                {tx.status === 'Success' ? '✓ SUCCESS' : tx.status === 'Pending' ? '⏳ PENDING' : (tx.status || 'FAILED')}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </div>
        )}

      </div>
    </div>
  );

  if (inlineMode) {
    return (
      <div className={`wallet-inline-container theme-${currentTheme}`}>
        {modalContent}
      </div>
    );
  }

  return (
    <div className={`wallet-modal-overlay theme-${currentTheme}`}>
      {modalContent}
    </div>
  );
};

export default WalletModal;
