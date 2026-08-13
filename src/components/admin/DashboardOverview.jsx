import React, { useEffect, useState } from 'react';
import { 
  Calendar, 
  Search, 
  Bell, 
  Clock, 
  MoreVertical,
  Wallet,
  UserCheck,
  ClipboardList,
  X,
  Loader2
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import BulkScheduleModal from './BulkScheduleModal';
import SingleScheduleModal from './SingleScheduleModal';
import DashboardAnnouncements from './DashboardAnnouncements';

const getLocalDateString = (d = new Date()) => {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const DashboardOverview = ({ setActiveTab }) => {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    todayLessons: 0,
    pendingPayments: 0,
    activeMembers: 0,
    monthlyIncome: 0
  });
  const [allLessons, setAllLessons] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Hızlı Seans Düş Modal State
  const [isDropSessionOpen, setIsDropSessionOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState(null);
  
  // Toplu Randevu Modal State
  const [isBulkScheduleOpen, setIsBulkScheduleOpen] = useState(false);
  const [isSingleScheduleOpen, setIsSingleScheduleOpen] = useState(false);

  // Hızlı Seans Düş Form State
  const [activePackages, setActivePackages] = useState([]);
  const [selectedPackageId, setSelectedPackageId] = useState('');
  const [dropDate, setDropDate] = useState(getLocalDateString());
  const [dropNotes, setDropNotes] = useState('');

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const today = getLocalDateString();
      const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

      const { data: pendingData } = await supabase
        .from('payments')
        .select('amount')
        .eq('status', 'pending');
      const pendingSum = pendingData?.reduce((acc, curr) => acc + Number(curr.amount), 0) || 0;

      const { count: membersCount } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'member');

      const { data: incomeData } = await supabase
        .from('payments')
        .select('amount')
        .eq('status', 'paid')
        .gte('payment_date', firstDayOfMonth);
      const monthlySum = incomeData?.reduce((acc, curr) => acc + Number(curr.amount), 0) || 0;

      const { data: rawLessonsData } = await supabase
        .from('lessons')
        .select(`
          *,
          attendance (
            status,
            profiles (
              full_name
            )
          ),
          trainer:profiles!lessons_trainer_id_fkey (
            full_name
          )
        `)
        .gte('lesson_date', today)
        .neq('status', 'cancelled')
        .order('lesson_date', { ascending: true })
        .order('start_time', { ascending: true });

      const activeFutureLessons = (rawLessonsData || []).map(lesson => ({
        ...lesson,
        attendance: (lesson.attendance || []).filter(a => a.status !== 'cancelled' && a.status !== 'compensation')
      })).filter(lesson => lesson.attendance.length > 0);

      const todayLessonsCount = activeFutureLessons.filter(l => l.lesson_date === today).length;

      const { data: packagesData } = await supabase
        .from('packages')
        .select(`
          id,
          profile_id,
          total_sessions,
          used_sessions,
          status,
          profiles (
            full_name
          )
        `)
        .eq('status', 'active');

      const validPackages = packagesData?.filter(p => p.total_sessions - p.used_sessions > 0) || [];

      setStats({
        todayLessons: todayLessonsCount,
        pendingPayments: pendingSum,
        activeMembers: membersCount || 0,
        monthlyIncome: monthlySum
      });
      setAllLessons(activeFutureLessons);
      setActivePackages(validPackages);

    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const handleDropSession = async (e) => {
    e.preventDefault();
    if (!selectedPackageId || !dropDate) {
      setModalError('Lütfen üye ve tarih seçin.');
      return;
    }

    setIsSubmitting(true);
    setModalError(null);

    try {
      const pkg = activePackages.find(p => p.id === selectedPackageId);
      if (!pkg) throw new Error('Paket bulunamadı.');

      const newUsedSessions = pkg.used_sessions + 1;
      const newStatus = newUsedSessions >= pkg.total_sessions ? 'completed' : 'active';

      const { error: packageError } = await supabase
        .from('packages')
        .update({ 
          used_sessions: newUsedSessions,
          status: newStatus
        })
        .eq('id', selectedPackageId);

      if (packageError) throw packageError;

      const { error: attendanceError } = await supabase
        .from('attendance')
        .insert({
          profile_id: pkg.profile_id,
          package_id: selectedPackageId,
          lesson_date: dropDate,
          status: 'attended',
          notes: dropNotes || null
        });

      if (attendanceError) throw attendanceError;

      setIsDropSessionOpen(false);
      setSelectedPackageId('');
      setDropNotes('');
      setDropDate(getLocalDateString());
      
      fetchDashboardData();

    } catch (err) {
      setModalError('İşlem sırasında bir hata oluştu: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(amount);
  };

  const filteredLessons = allLessons.filter(lesson => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    const matchName = lesson.name?.toLowerCase().includes(query);
    const matchTrainer = lesson.trainer?.full_name?.toLowerCase().includes(query);
    const matchMember = lesson.attendance?.some(a => a.profiles?.full_name?.toLowerCase().includes(query));
    return matchName || matchTrainer || matchMember;
  }).slice(0, searchQuery ? 20 : 5);

  return (
    <>
      <header className="content-header">
        <div className="search-bar">
          <Search size={18} className="search-icon" />
          <input 
            type="text" 
            placeholder="Üye veya ders ara..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="header-actions">
          <button className="notification-btn" onClick={() => setActiveTab && setActiveTab('notifications')}>
            <Bell size={20} />
            <span className="badge"></span>
          </button>
        </div>
      </header>

      <div className="dashboard-body">
        <DashboardAnnouncements />
        
        <div className="welcome-section">
          <h2>Hoş Geldiniz, {profile?.full_name?.split(' ')[0] || 'Elif'}</h2>
          <p>İşte stüdyonuzda bugün olup bitenler.</p>
        </div>

        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon-wrapper green">
              <Calendar size={24} />
            </div>
            <div className="stat-content">
              <span className="stat-label">Bugünkü Dersler</span>
              <span className="stat-value">{stats.todayLessons}</span>
            </div>
            <span className="stat-badge positive">+5%</span>
          </div>

          <div className="stat-card">
            <div className="stat-icon-wrapper orange">
              <ClipboardList size={24} />
            </div>
            <div className="stat-content">
              <span className="stat-label">Bekleyen Ödemeler</span>
              <span className="stat-value">{formatCurrency(stats.pendingPayments)}</span>
            </div>
            <span className="stat-badge negative">-2%</span>
          </div>

          <div className="stat-card">
            <div className="stat-icon-wrapper blue">
              <UserCheck size={24} />
            </div>
            <div className="stat-content">
              <span className="stat-label">Aktif Üyeler</span>
              <span className="stat-value">{stats.activeMembers}</span>
            </div>
            <span className="stat-badge positive">+12%</span>
          </div>

          <div className="stat-card">
            <div className="stat-icon-wrapper teal">
              <Wallet size={24} />
            </div>
            <div className="stat-content">
              <span className="stat-label">Aylık Gelir</span>
              <span className="stat-value">{formatCurrency(stats.monthlyIncome)}</span>
            </div>
            <span className="stat-badge positive">+8%</span>
          </div>
        </div>

        <div className="quick-actions-bar">
          <h3><Clock size={20} /> Hızlı İşlemler</h3>
          <div className="action-buttons">
            <button 
              className="action-btn"
              onClick={() => setIsDropSessionOpen(true)}
            >
              <Clock size={18} />
              <span>Hızlı Seans Düş</span>
            </button>
            <button 
              className="action-btn"
              onClick={() => setIsSingleScheduleOpen(true)}
            >
              <Calendar size={18} />
              <span>Tek Randevu Ekle</span>
            </button>
            <button 
              className="action-btn"
              onClick={() => setIsBulkScheduleOpen(true)}
            >
              <Calendar size={18} />
              <span>Toplu Randevu Oluştur</span>
            </button>
          </div>
        </div>

        <div className="upcoming-section">
          <div className="section-header">
            <h3>Yaklaşan Dersler</h3>
            <button className="view-all" onClick={() => setActiveTab && setActiveTab('schedule')}>
              Tümünü Gör
            </button>
          </div>
          
          <div className="table-container">
            <table className="lessons-table">
              <thead>
                <tr>
                  <th>DERS</th>
                  <th>ÜYE</th>
                  <th>EĞİTMEN</th>
                  <th>TARİH / SAAT</th>
                  <th>DURUM</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="6" className="loading-cell">Yükleniyor...</td></tr>
                ) : filteredLessons.length === 0 ? (
                  <tr><td colSpan="6" className="empty-cell">{searchQuery ? 'Aradığınız kriterlere uygun ders bulunamadı.' : 'Yaklaşan ders bulunamadı.'}</td></tr>
                ) : (
                  filteredLessons.map((lesson) => (
                    <tr key={lesson.id}>
                      <td>
                        <div className="lesson-info">
                          <span className="lesson-name">{lesson.name}</span>
                        </div>
                      </td>
                      <td className="member-name">
                        {lesson.attendance && lesson.attendance.length > 0 
                          ? lesson.attendance.map(a => a.profiles?.full_name).join(', ') 
                          : 'Kayıtlı üye yok'}
                      </td>
                      <td className="trainer-name">{lesson.trainer?.full_name || '-'}</td>
                      <td className="lesson-time">
                        <div style={{ fontWeight: '500', color: '#1e293b' }}>
                          {new Date(lesson.lesson_date).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                          {lesson.start_time.substring(0, 5)} - {lesson.end_time.substring(0, 5)}
                        </div>
                      </td>
                      <td>
                        <span className={`status-badge ${lesson.status.toLowerCase()}`}>
                          {lesson.status.toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {isDropSessionOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Hızlı Seans Düş</h2>
              <button className="close-modal-btn" onClick={() => setIsDropSessionOpen(false)}>
                <X size={24} />
              </button>
            </div>
            
            <form onSubmit={handleDropSession} className="modal-form">
              {modalError && <div className="modal-error">{modalError}</div>}
              
              <div className="form-group">
                <label>Üye ve Paket Seçimi</label>
                <select 
                  value={selectedPackageId} 
                  onChange={(e) => setSelectedPackageId(e.target.value)}
                  required
                >
                  <option value="">-- Üye Seçin --</option>
                  {activePackages.map(pkg => (
                    <option key={pkg.id} value={pkg.id}>
                      {pkg.profiles?.full_name} ({pkg.total_sessions - pkg.used_sessions} Seans Kaldı)
                    </option>
                  ))}
                </select>
                <small style={{ color: '#64748b', fontSize: '0.75rem', marginTop: '4px', display: 'block' }}>
                  Sadece aktif paketi olan üyeler listelenir.
                </small>
              </div>

              <div className="form-group">
                <label>Tarih</label>
                <input 
                  type="date" 
                  value={dropDate}
                  onChange={(e) => setDropDate(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label>Notlar (İsteğe bağlı)</label>
                <input 
                  type="text" 
                  placeholder="Örn: Reformer grup dersi" 
                  value={dropNotes}
                  onChange={(e) => setDropNotes(e.target.value)}
                />
              </div>

              <div className="modal-actions">
                <button 
                  type="button" 
                  className="btn-secondary"
                  onClick={() => setIsDropSessionOpen(false)}
                >
                  İptal
                </button>
                <button type="submit" className="btn-primary" disabled={isSubmitting}>
                  {isSubmitting ? <Loader2 className="animate-spin" size={18} /> : 'Seans Düş'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <BulkScheduleModal 
        isOpen={isBulkScheduleOpen} 
        onClose={() => setIsBulkScheduleOpen(false)} 
        onSuccess={fetchDashboardData}
      />

      <SingleScheduleModal 
        isOpen={isSingleScheduleOpen} 
        onClose={() => setIsSingleScheduleOpen(false)} 
        onSuccess={fetchDashboardData}
      />
    </>
  );
};

export default DashboardOverview;
