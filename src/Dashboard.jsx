import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import './Dashboard.css';
import logoImg from './assets/logo.png';

const API_URL = process.env.REACT_APP_API_URL || 'http:REACT_APP_API_URL';

const Toast = Swal.mixin({
  toast: true,
  position: 'top-end',
  showConfirmButton: false,
  timer: 3000,
  timerProgressBar: true,
  background: '#ffffff',
  color: '#334155',
  iconColor: '#ea580c',
  customClass: {
    popup: 'small-toast-popup'
  }
});

// actionCardsData is now fetched dynamically
// All data is now fetched dynamically

const Dashboard = () => {
  const navigate = useNavigate();
  const [actionCardsData, setActionCardsData] = useState([]);
  const [topTabsData, setTopTabsData] = useState([]);
  const [sidebarMenuData, setSidebarMenuData] = useState([]);
  const [bannersData, setBannersData] = useState([]);

  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showWallet, setShowWallet] = useState(false);
  const [walletTab, setWalletTab] = useState('paymentForm'); // 'paymentForm' or 'upiScanner'
  const [upiConfig, setUpiConfig] = useState(null);

  const getTodayDate = () => {
    const today = new Date();
    const offset = today.getTimezoneOffset();
    const localDate = new Date(today.getTime() - (offset * 60 * 1000));
    return localDate.toISOString().split('T')[0];
  };

  const [paymentForm, setPaymentForm] = useState({
    userId: localStorage.getItem('currentUser') || '',
    amount: '',
    referenceNumber: '',
    paymentDate: getTodayDate(),
    remarks: ''
  });
  const [walletBalance, setWalletBalance] = useState(0);
  const [showBalance, setShowBalance] = useState(false);

  const scrollRef = React.useRef(null);

  useEffect(() => {
    // Fetch Action Cards
    fetch(`${API_URL}/api/action-cards`)
      .then(res => res.json())
      .then(data => setActionCardsData(data));

    // Fetch Top Tabs
    fetch(`${API_URL}/api/top-tabs`)
      .then(res => res.json())
      .then(data => setTopTabsData(data));

    // Fetch Sidebar Menus
    fetch(`${API_URL}/api/sidebar-menus`)
      .then(res => res.json())
      .then(data => setSidebarMenuData(data));

    // Fetch Banners
    fetch(`${API_URL}/api/banners`)
      .then(res => res.json())
      .then(data => setBannersData(data));

    // Fetch UPI Config
    fetch(`${API_URL}/api/upi-config`)
      .then(res => res.json())
      .then(data => setUpiConfig(data));

    // Setup an interval to periodically fetch wallet balance
    const currentUser = localStorage.getItem('currentUser');
    if (currentUser) {
      const fetchWalletBalance = () => {
        fetch(`${API_URL}/api/users/${currentUser}`)
          .then(res => res.json())
          .then(data => {
            if (data.walletBalance !== undefined) {
              setWalletBalance(data.walletBalance);
            }
            if (data.retailerId) {
              setPaymentForm(prev => ({ ...prev, referenceNumber: data.retailerId }));
            }
          })
          .catch(err => console.error(err));
      };

      fetchWalletBalance(); // Initial fetch
      const interval = setInterval(fetchWalletBalance, 5000); // Poll every 5 seconds
      return () => clearInterval(interval);
    }
  }, []);

  const [carouselIndex, setCarouselIndex] = useState(0);
  const [itemsPerView, setItemsPerView] = useState(4);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth <= 768) setItemsPerView(1);
      else if (window.innerWidth <= 1024) setItemsPerView(2);
      else setItemsPerView(3);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (actionCardsData.length === 0) return;

    // Max index depends on how many fit in view and total cards
    const maxIndex = Math.max(0, actionCardsData.length - itemsPerView);
    if (maxIndex === 0) {
      setCarouselIndex(0);
      return;
    }

    const interval = setInterval(() => {
      setCarouselIndex(prev => prev >= maxIndex ? 0 : prev + 1);
    }, 3000);
    return () => clearInterval(interval);
  }, [itemsPerView, actionCardsData]);

  const handlePaymentSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch(`${API_URL}/api/payment-requisitions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(paymentForm)
      });
      if (response.ok) {
        setShowWallet(false);
        Toast.fire({ icon: 'success', title: 'Payment requisition submitted successfully!' });
        setPaymentForm(prev => ({
          userId: localStorage.getItem('currentUser') || '',
          amount: '',
          referenceNumber: prev.referenceNumber, // keep the fetched retailer ID
          paymentDate: getTodayDate(),
          remarks: ''
        }));
      } else {
        Toast.fire({ icon: 'error', title: 'Failed to submit requisition.' });
      }
    } catch (err) {
      Toast.fire({ icon: 'error', title: 'Error submitting requisition.' });
    }
  };

  return (
    <div className="dashboard-container-new">
      <div className="dash-top-title" style={{ display: 'flex', justifyContent: 'center', position: 'relative' }}>
        <h2>WEL COME TO MITRA</h2>
        <div style={{ position: 'absolute', right: '30px', top: '12px' }}>
          <button
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            style={{ padding: '8px 20px', background: 'white', color: '#4318ff', border: '1px solid #4318ff', borderRadius: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', fontWeight: '700', fontFamily: 'Inter, sans-serif' }}
          >
            <span style={{ fontSize: '18px' }}>👤</span> {localStorage.getItem('currentUser') || 'My Profile'}
          </button>

          {showProfileMenu && (
            <div style={{ position: 'absolute', top: '50px', right: '0', background: 'white', borderRadius: '12px', boxShadow: '0 10px 30px rgba(0,0,0,0.1)', padding: '10px 0', minWidth: '220px', zIndex: 1000, border: '1px solid #e2e8f0' }}>
              <div style={{ padding: '10px 20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '14px', color: '#64748b', fontWeight: '600' }}>Wallet Balance</span>
                  <button onClick={() => setShowBalance(!showBalance)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px' }}>
                    {showBalance ? '🔒' : '👁️'}
                  </button>
                </div>
                <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#111827', marginTop: '5px' }}>
                  {showBalance ? `₹ ${parseFloat(walletBalance).toFixed(2)}` : '₹ •••••'}
                </div>
              </div>
              <div style={{ height: '1px', background: '#e2e8f0', margin: '5px 0' }}></div>
              <button
                onClick={() => { setShowWallet(true); setShowProfileMenu(false); }}
                style={{ width: '100%', padding: '12px 20px', background: 'transparent', border: 'none', textAlign: 'left', cursor: 'pointer', fontSize: '15px', color: '#2b3674', fontWeight: '600', fontFamily: 'Inter' }}
                onMouseOver={(e) => { e.target.style.background = '#f4f7fe'; e.target.style.color = '#4318ff'; }}
                onMouseOut={(e) => { e.target.style.background = 'transparent'; e.target.style.color = '#2b3674'; }}
              >
                💼 Load Wallet
              </button>
              <div style={{ height: '1px', background: '#e2e8f0', margin: '5px 0' }}></div>
              <button
                onClick={() => { localStorage.removeItem('currentUser'); navigate('/'); }}
                style={{ width: '100%', padding: '12px 20px', background: 'transparent', border: 'none', textAlign: 'left', cursor: 'pointer', fontSize: '15px', color: '#ef4444', fontWeight: '600', fontFamily: 'Inter' }}
                onMouseOver={(e) => e.target.style.background = '#fee2e2'}
                onMouseOut={(e) => e.target.style.background = 'transparent'}
              >
                🚪 Logout
              </button>
            </div>
          )}
        </div>
      </div>

      {showWallet && (
        <div className="wallet-overlay">
          <div className="wallet-modal">
            <div className="wallet-header">
              <h3>My Wallet</h3>
              <button className="close-wallet-btn" onClick={() => setShowWallet(false)}>×</button>
            </div>
            <div className="wallet-tabs">
              <button className={walletTab === 'paymentForm' ? 'active' : ''} onClick={() => setWalletTab('paymentForm')}>Payment Requisition</button>
              <button className={walletTab === 'upiScanner' ? 'active' : ''} onClick={() => setWalletTab('upiScanner')}>UPI Scanner</button>
            </div>
            <div className="wallet-content">
              {walletTab === 'paymentForm' && (
                <form className="wallet-form" onSubmit={handlePaymentSubmit}>
                  <div className="form-group">
                    <label>User ID</label>
                    <input
                      type="text"
                      required
                      value={paymentForm.userId}
                      readOnly
                      style={{ backgroundColor: '#f1f5f9', color: '#1b2559', fontWeight: '600', cursor: 'not-allowed' }}
                    />
                  </div>
                  <div className="form-group">
                    <label>Amount (₹)</label>
                    <input type="number" required value={paymentForm.amount} onChange={e => setPaymentForm({ ...paymentForm, amount: e.target.value })} placeholder="0.00" />
                  </div>
                  <div className="form-group">
                    <label>Payment Date</label>
                    <input type="date" required value={paymentForm.paymentDate} onChange={e => setPaymentForm({ ...paymentForm, paymentDate: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label>Remarks (Optional)</label>
                    <input type="text" value={paymentForm.remarks} onChange={e => setPaymentForm({ ...paymentForm, remarks: e.target.value })} placeholder="Any additional info..." />
                  </div>
                  <button type="submit" className="wallet-submit-btn">Submit Request</button>
                </form>
              )}
              {walletTab === 'upiScanner' && (
                <div className="wallet-upi-scanner">
                  {upiConfig?.qrCodeImg ? (
                    <>
                      <img src={upiConfig.qrCodeImg} alt="UPI QR Code" className="upi-qr-img" />
                      {upiConfig.upiId && <p className="upi-id-text">UPI ID: <strong>{upiConfig.upiId}</strong></p>}
                      <p className="upi-scan-instruction">Scan with any UPI app to pay</p>
                    </>
                  ) : (
                    <p className="no-upi-config">UPI Scanner is not configured yet.</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="dash-header-new">
        <div className="header-left-new" style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div style={{ width: '45px', height: '45px', borderRadius: '12px', background: 'linear-gradient(135deg, #4318ff 0%, #11047a 100%)', display: 'flex', justifyContent: 'center', alignItems: 'center', boxShadow: '0px 8px 15px rgba(67, 24, 255, 0.2)' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="3" y="3" width="7" height="7" rx="2" fill="white" />
              <rect x="14" y="3" width="7" height="7" rx="2" fill="white" fillOpacity="0.5" />
              <rect x="3" y="14" width="7" height="7" rx="2" fill="white" fillOpacity="0.5" />
              <rect x="14" y="14" width="7" height="7" rx="2" fill="white" />
            </svg>
          </div>
          <span style={{ fontSize: '18px', fontWeight: '700', color: '#2b3674' }}>Quick Access</span>
        </div>

        <div className="header-right-new">
          <div className="top-tabs-new">
            {topTabsData.map((tab) => (
              <button
                key={tab._id || tab.id}
                className="tab-btn-new"
                onClick={() => tab.url ? window.open(tab.url, '_blank') : null}
                style={{ cursor: tab.url ? 'pointer' : 'default' }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="yellow-divider"></div>

      {/* Main Layout */}
      <div className="dash-main-new">

        {/* Left Sidebar */}
        <div className="sidebar-new">
          <div className="sidebar-logo-container">
            <div className="sidebar-logo-outer">
              <img src={logoImg} alt="MB MITRA" className="sidebar-logo-img" onError={(e) => e.target.style.display = 'none'} />
            </div>
          </div>

          <div className="sidebar-menu-new">
            {sidebarMenuData.map((menu) => (
              <div
                key={menu._id || menu.id}
                className={`menu-item-new ${menu.isActive ? 'active' : ''} ${!menu.label ? 'empty' : ''}`}
              >
                {menu.label}
              </div>
            ))}
          </div>
        </div>

        {/* Right Content */}
        <div className="content-area-new">

          {/* Action Cards */}
          <div className="action-cards-container" style={{ paddingBottom: '15px' }}>
            <div className="action-cards-wrapper">
              <div
                className="action-cards-track"
                style={{ transform: `translateX(-${carouselIndex * (100 / itemsPerView)}%)` }}
              >
                {actionCardsData.map((card, index) => (
                  <div key={card._id || card.id || index} className="action-card-new">
                    <div
                      className="action-card-inner"
                      style={{ cursor: card.url ? 'pointer' : 'default' }}
                      onClick={() => card.url ? window.open(card.url, '_blank') : null}
                    >
                      <img
                        src={card.img}
                        alt={card.title}
                        className="card-img"
                        onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
                      />

                      {card.isAeps ? (
                        <div className="card-fallback aeps-fallback" style={{ display: 'none' }}>
                          <div className="aeps-e">e</div>
                          <div className="aeps-text">A <span>P S</span></div>
                        </div>
                      ) : (
                        <div className="card-fallback" style={{ display: 'none' }}>{card.icon}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Banner Area */}
          <div className="banner-area-new">
            {bannersData.map((banner) => (
              <div key={banner._id || banner.id} style={{ width: '100%', height: '100%', position: 'absolute' }}>
                <img
                  src={banner.img}
                  alt={banner.alt}
                  className="banner-img"
                  onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
                />
                <div className="banner-fallback" style={{ display: 'none' }}>
                  <div className="sun-new"></div>
                  <div className="plane-shadow">{banner.fallbackIcon}</div>
                  <div className="person-shadow">{banner.fallbackPerson}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
};

export default Dashboard;
