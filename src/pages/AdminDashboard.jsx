import React, { useState } from 'react';
import { 
  LayoutDashboard, 
  Users, 
  Calendar, 
  CreditCard, 
  LogOut,
  Leaf,
  Bell,
  Menu,
  X,
  Megaphone
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import DashboardOverview from '../components/admin/DashboardOverview';
import MembersList from '../components/admin/MembersList';
import ScheduleCalendar from '../components/admin/ScheduleCalendar';
import FinanceOverview from '../components/admin/FinanceOverview';
import NotificationToggle from '../components/NotificationToggle';
import NotificationsPage from '../components/NotificationsPage';
import StaffChat from '../components/admin/StaffChat';
import AdminAnnouncements from '../components/admin/AdminAnnouncements';
import './AdminDashboard.css';

const AdminDashboard = () => {
  const { user, profile, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setIsMobileMenuOpen(false); // Close menu on tab click
  };

  return (
    <div className="admin-layout">
      {/* Mobile Header */}
      <div className="mobile-header">
        <div className="logo" style={{ padding: 0 }}>
          <Leaf className="logo-icon" size={24} />
          <div className="logo-text">
            <h1>Me-Like Pilates</h1>
          </div>
        </div>
        <button 
          className="mobile-menu-btn" 
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        >
          {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Overlay */}
      {isMobileMenuOpen && (
        <div className="sidebar-overlay" onClick={() => setIsMobileMenuOpen(false)}></div>
      )}

      {/* Sidebar */}
      <aside className={`sidebar ${isMobileMenuOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="logo">
            <Leaf className="logo-icon" size={24} />
            <div className="logo-text">
              <h1>Me-Like Pilates</h1>
              <span>Admin Paneli</span>
            </div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <button 
            className={`admin-nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => handleTabChange('dashboard')}
          >
            <LayoutDashboard size={20} />
            <span>Dashboard</span>
          </button>
          <button 
            className={`admin-nav-item ${activeTab === 'members' ? 'active' : ''}`}
            onClick={() => handleTabChange('members')}
          >
            <Users size={20} />
            <span>Üye Yönetimi</span>
          </button>
          <button 
            className={`admin-nav-item ${activeTab === 'schedule' ? 'active' : ''}`}
            onClick={() => handleTabChange('schedule')}
          >
            <Calendar size={20} />
            <span>Ders Programı</span>
          </button>
          {profile?.role === 'admin' && (
            <>
              <button 
                className={`admin-nav-item ${activeTab === 'finance' ? 'active' : ''}`}
                onClick={() => handleTabChange('finance')}
              >
                <CreditCard size={20} />
                <span>Finans</span>
              </button>
              <button 
                className={`admin-nav-item ${activeTab === 'announcements' ? 'active' : ''}`}
                onClick={() => handleTabChange('announcements')}
              >
                <Megaphone size={20} />
                <span>Duyuru Panosu</span>
              </button>
            </>
          )}
          <button 
            className={`admin-nav-item ${activeTab === 'notifications' ? 'active' : ''}`}
            onClick={() => handleTabChange('notifications')}
          >
            <Bell size={20} />
            <span>Bildirimler</span>
          </button>
        </nav>

        <div className="sidebar-footer" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ padding: '0 12px', display: 'flex', justifyContent: 'center' }}>
            <NotificationToggle profileId={user?.id || profile?.id} />
          </div>
          <div className="user-profile">
            <div className="avatar">
              {profile?.full_name?.charAt(0) || 'A'}
            </div>
            <div className="user-info">
              <span className="user-name">{profile?.full_name || (profile?.role === 'trainer' ? 'Eğitmen' : 'Yönetici')}</span>
              <span className="user-role">{profile?.role === 'trainer' ? 'Eğitmen' : 'Yönetici'}</span>
            </div>
            <button 
              onClick={() => signOut()} 
              className="logout-btn" 
              title="Çıkış Yap"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <LogOut size={18} className="settings-icon" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className={`main-content ${activeTab === 'members' ? 'no-padding' : ''}`}>
        {activeTab === 'dashboard' && <DashboardOverview setActiveTab={setActiveTab} />}
        {activeTab === 'members' && <MembersList />}
        {activeTab === 'schedule' && <ScheduleCalendar />}
        {profile?.role === 'admin' && activeTab === 'finance' && <FinanceOverview setActiveTab={setActiveTab} />}
        {profile?.role === 'admin' && activeTab === 'announcements' && <AdminAnnouncements />}
        {activeTab === 'notifications' && <NotificationsPage profileId={user?.id || profile?.id} role="admin" />}
      </main>
      
      {/* Staff Chat Widget */}
      <StaffChat />
    </div>
  );
};

export default AdminDashboard;
