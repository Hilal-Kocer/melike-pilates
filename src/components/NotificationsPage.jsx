import React, { useState, useEffect } from 'react';
import { Bell, CheckCheck, Clock, CheckCircle2, AlertCircle, Calendar } from 'lucide-react';
import { supabase } from '../lib/supabase';
import './NotificationsPage.css';

export default function NotificationsPage({ profileId, role }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (profileId || role) {
      fetchNotifications();
    }
  }, [profileId, role]);

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(30);

      if (role === 'admin') {
        if (profileId) {
          query = query.or(`profile_id.eq.${profileId},target_role.eq.admin`);
        } else {
          query = query.eq('target_role', 'admin');
        }
      } else {
        if (profileId) {
          query = query.or(`profile_id.eq.${profileId},target_role.eq.member`);
        } else {
          query = query.eq('target_role', 'member');
        }
      }

      const { data, error } = await query;
      if (!error && data) {
        setNotifications(data);
      }
    } catch (err) {
      console.error('Bildirimler yüklenemedi:', err);
    } finally {
      setLoading(false);
    }
  };

  const markAllAsRead = async () => {
    const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id);
    if (unreadIds.length === 0) return;

    try {
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .in('id', unreadIds);

      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch (err) {
      console.error('Okundu işaretleme hatası:', err);
    }
  };

  const markSingleAsRead = async (id) => {
    try {
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', id);

      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    } catch (err) {
      console.error(err);
    }
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffHours = Math.round((now - date) / (1000 * 60 * 60));
    
    if (diffHours < 1) return 'Az önce';
    if (diffHours < 24) return `${diffHours} saat önce`;
    return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  if (loading) {
    return (
      <div className="notifications-container" style={{ textAlign: 'center', padding: '3rem' }}>
        <p style={{ color: '#64748b' }}>Bildirimler yükleniyor...</p>
      </div>
    );
  }

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <div className="notifications-container">
      <div className="notifications-header">
        <h2>
          <Bell className="header-icon" size={24} />
          <span>Bildirimlerim</span>
          {unreadCount > 0 && <span className="unread-badge" style={{ marginLeft: '6px' }}>{unreadCount} Yeni</span>}
        </h2>
        {unreadCount > 0 && (
          <button className="mark-read-btn" onClick={markAllAsRead}>
            <CheckCheck size={16} />
            <span>Tümünü Okundu İşaretle</span>
          </button>
        )}
      </div>

      {notifications.length > 0 ? (
        <div className="notifications-list">
          {notifications.map((item) => (
            <div 
              key={item.id} 
              className={`notification-item ${!item.is_read ? 'unread' : ''}`}
              onClick={() => !item.is_read && markSingleAsRead(item.id)}
            >
              <div className="notification-icon">
                <Bell size={20} />
              </div>
              <div className="notification-content">
                <div className="notification-title">
                  <span>{item.title}</span>
                  {!item.is_read && <span className="unread-badge">Yeni</span>}
                </div>
                <p className="notification-body">{item.body}</p>
                <div className="notification-footer">
                  <span className="notification-time">
                    <Clock size={13} />
                    {formatTime(item.created_at)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-notifications">
          <CheckCircle2 size={48} style={{ margin: '0 auto', color: '#10b981', opacity: 0.6 }} />
          <p>Şu an hiç yeni bildiriminiz bulunmuyor.</p>
        </div>
      )}
    </div>
  );
}
