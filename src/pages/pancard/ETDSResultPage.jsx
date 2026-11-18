import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { API_URL } from '../../utils/apiClient';

const POLL_INTERVAL_MS = 4000;
const POLL_TIMEOUT_MS = 60000;

const ETDSResultPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [timedOut, setTimedOut] = useState(false);

  const params = new URLSearchParams(location.search);
  const publicRef = params.get('ref') || '';
  const callbackFailed = params.get('error') === 'callback_failed';

  useEffect(() => {
    const sessionToken = sessionStorage.getItem('sessionToken');
    if (!sessionToken) {
      const returnTo = `${location.pathname}${location.search}`;
      navigate(`/login?returnTo=${encodeURIComponent(returnTo)}`, { replace: true });
      return undefined;
    }

    if (!publicRef) {
      if (callbackFailed) {
        setError('The provider response could not be matched to a request. Contact support for assistance.');
      } else {
        setError('No transaction reference was provided.');
      }
      return undefined;
    }

    let active = true;
    let timer;
    const startedAt = Date.now();

    const checkStatus = async () => {
      try {
        const response = await fetch(`${API_URL}/api/etds/result/${encodeURIComponent(publicRef)}`, {
          headers: { Authorization: `Bearer ${sessionToken}` }
        });

        if (response.status === 401 || response.status === 403) {
          sessionStorage.removeItem('sessionToken');
          const returnTo = `${location.pathname}${location.search}`;
          navigate(`/login?returnTo=${encodeURIComponent(returnTo)}`, { replace: true });
          return;
        }
        if (response.status === 404) {
          setError('This transaction reference does not belong to the signed-in retailer.');
          return;
        }
        if (!response.ok) throw new Error('Could not retrieve the transaction status.');

        const data = await response.json();
        if (!active) return;
        setResult(data);

        if (['success', 'failed'].includes(data.status)) {
          navigate('/pancard?tab=history', { replace: true });
          return;
        }
        if (Date.now() - startedAt >= POLL_TIMEOUT_MS) {
          setTimedOut(true);
          return;
        }
        timer = setTimeout(checkStatus, POLL_INTERVAL_MS);
      } catch (requestError) {
        if (active) setError(requestError.message || 'Could not retrieve the transaction status.');
      }
    };

    checkStatus();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [callbackFailed, location.pathname, location.search, navigate, publicRef]);

  return (
    <main style={{
      maxWidth: '640px',
      margin: '12vh auto',
      padding: '28px',
      borderRadius: '16px',
      background: '#ffffff',
      boxShadow: '0 12px 36px rgba(15, 23, 42, 0.12)',
      color: '#1e293b',
      fontFamily: 'Arial, sans-serif'
    }}>
      <h1 style={{ marginTop: 0, color: '#c2410c', fontSize: '24px' }}>PAN Service Status</h1>
      {error ? (
        <p role="alert">{error}</p>
      ) : (
        <>
          <p>{result?.message || 'Checking your provider response…'}</p>
          {result?.status && <p><strong>Status:</strong> {result.status}</p>}
          {result?.serviceType && <p><strong>Service:</strong> {result.serviceType}</p>}
          {publicRef && <p><strong>Reference:</strong> {publicRef}</p>}
          {result?.createdAt && <p><strong>Submitted:</strong> {new Date(result.createdAt).toLocaleString()}</p>}
          {result?.updatedAt && <p><strong>Last updated:</strong> {new Date(result.updatedAt).toLocaleString()}</p>}
          {timedOut && (
            <p role="status">
              The provider has not returned a final status yet. Keep this reference and contact support if needed.
            </p>
          )}
        </>
      )}
    </main>
  );
};

export default ETDSResultPage;
