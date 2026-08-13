import React, { useState, useEffect } from 'react';
import { Bell, BellOff, CheckCircle2, AlertCircle } from 'lucide-react';
import { subscribeToPush, unsubscribeFromPush, checkSubscriptionStatus } from '../lib/pushNotifications';

export default function NotificationToggle({ profileId }) {
  const [status, setStatus] = useState({ isSupported: false, isSubscribed: false, permission: 'default' });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    checkStatus();
  }, [profileId]);

  const checkStatus = async () => {
    const currentStatus = await checkSubscriptionStatus();
    setStatus(currentStatus);
  };

  const handleToggle = async () => {
    if (!profileId) return;
    setLoading(true);
    setMessage(null);

    try {
      if (status.isSubscribed) {
        await unsubscribeFromPush(profileId);
        setMessage({ type: 'info', text: 'Bildirimler kapatıldı.' });
      } else {
        await subscribeToPush(profileId);
        setMessage({ type: 'success', text: 'Bildirimler başarıyla açıldı!' });
      }
      await checkStatus();
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: err.message || 'Bildirim ayarı değiştirilemedi.' });
    } finally {
      setLoading(false);
      setTimeout(() => setMessage(null), 4000);
    }
  };

  if (!status.isSupported) {
    return null; // Tarayıcı desteklemiyorsa butonu gösterme
  }

  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <button
        onClick={handleToggle}
        disabled={loading || status.permission === 'denied'}
        title={
          status.permission === 'denied'
            ? 'Tarayıcı ayarlarından bildirimlere izin vermelisiniz.'
            : status.isSubscribed
            ? 'Bildirimleri Kapat'
            : 'Bildirimleri Aç'
        }
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '8px 12px',
          borderRadius: '20px',
          border: 'none',
          backgroundColor: status.isSubscribed ? '#10b981' : '#f3f4f6',
          color: status.isSubscribed ? '#ffffff' : '#374151',
          cursor: loading || status.permission === 'denied' ? 'not-allowed' : 'pointer',
          fontWeight: '500',
          fontSize: '0.875rem',
          transition: 'all 0.2s ease',
          boxShadow: status.isSubscribed ? '0 2px 8px rgba(16, 185, 129, 0.3)' : 'none'
        }}
      >
        {status.isSubscribed ? <Bell size={18} /> : <BellOff size={18} />}
        <span>{loading ? 'İşleniyor...' : status.isSubscribed ? 'Bildirimler Açık' : 'Bildirimleri Aç'}</span>
      </button>

      {message && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: '8px',
            padding: '8px 12px',
            borderRadius: '8px',
            backgroundColor: message.type === 'error' ? '#fee2e2' : message.type === 'success' ? '#d1fae5' : '#e5e7eb',
            color: message.type === 'error' ? '#991b1b' : message.type === 'success' ? '#065f46' : '#1f2937',
            fontSize: '0.75rem',
            whiteSpace: 'nowrap',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            zIndex: 50,
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
          }}
        >
          {message.type === 'error' ? <AlertCircle size={14} /> : <CheckCircle2 size={14} />}
          <span>{message.text}</span>
        </div>
      )}
    </div>
  );
}
