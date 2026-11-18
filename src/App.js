import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/login/Login';
import Dashboard from './pages/dashboard/Dashboard';
import AdminPanel from './pages/admin/AdminPanel';
import AdminLogin from './pages/admin/AdminLogin';
import ETDSResultPage from './pages/pancard/ETDSResultPage';
import { NotificationProvider } from './context/NotificationContext';
import './App.css';

function App() {
  return (
    <Router>
      <NotificationProvider>
        <div className="App">
          <Routes>
            <Route path="/" element={<Navigate to="/login" />} />
            <Route path="/login" element={<Login />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/ledger" element={<Dashboard />} />
            <Route path="/wallet" element={<Dashboard />} />
            <Route path="/pancard" element={<Dashboard />} />
            <Route path="/pan-card" element={<Dashboard />} />
            <Route path="/quick-links" element={<Dashboard />} />
            <Route path="/view-links" element={<Dashboard />} />
            <Route path="/services-link" element={<Dashboard />} />
            <Route path="/job-links" element={<Dashboard />} />
            <Route path="/admit-card" element={<Dashboard />} />
            <Route path="/form-links" element={<Dashboard />} />
            <Route path="/vedio-link" element={<Dashboard />} />
            <Route path="/video-link" element={<Dashboard />} />
            <Route path="/video-links" element={<Dashboard />} />
            <Route path="/training-links" element={<Dashboard />} />
            <Route path="/product-links" element={<Dashboard />} />
            <Route path="/govt-links" element={<Dashboard />} />
            <Route path="/print" element={<Dashboard />} />
            <Route path="/schorship-links" element={<Dashboard />} />
            <Route path="/scholarship-links" element={<Dashboard />} />
            <Route path="/offline-work" element={<Dashboard />} />
            <Route path="/offlinework" element={<Dashboard />} />
            <Route path="/tools" element={<Dashboard />} />
            <Route path="/crm" element={<Dashboard />} />
            <Route path="/crm/*" element={<Dashboard />} />
            <Route path="/admin-login" element={<AdminLogin />} />
            <Route path="/admin-panel" element={<AdminPanel />} />
            <Route path="/etds-result" element={<ETDSResultPage />} />
            <Route path="/admin" element={<Navigate to="/admin-login" />} />
            <Route path="*" element={<Dashboard />} />
          </Routes>
        </div>
      </NotificationProvider>
    </Router>
  );
}

export default App;
