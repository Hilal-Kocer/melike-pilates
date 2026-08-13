import React, { useState, useEffect } from 'react';
import { 
  LogOut, 
  Info, 
  User, 
  CalendarRange, 
  History, 
  Home, 
  CreditCard, 
  Bell 
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import MemberCalendar from '../components/member/MemberCalendar';
import NotificationToggle from '../components/NotificationToggle';
import { sendNotification } from '../lib/sendNotification';
import NotificationsPage from '../components/NotificationsPage';
import DashboardAnnouncements from '../components/admin/DashboardAnnouncements';
import './MemberDashboard.css';

const getLocalDateString = (d = new Date()) => {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const MemberDashboard = () => {
  const { user, signOut } = useAuth();
  
  const [activePackage, setActivePackage] = useState(null);
  const [nextLesson, setNextLesson] = useState(null);
  const [upcomingLessons, setUpcomingLessons] = useState([]);
  const [pastLessons, setPastLessons] = useState([]);
  const [pastPackages, setPastPackages] = useState([]);
  const [payments, setPayments] = useState([]);
  const [historyCount, setHistoryCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [telafiBalance, setTelafiBalance] = useState(0);
  const [makeupBalance, setMakeupBalance] = useState(0);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [historyTab, setHistoryTab] = useState('lessons'); // 'lessons' or 'packages'
  
  // Cancel Modal State
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [lessonToCancel, setLessonToCancel] = useState(null);
  const [cancelType, setCancelType] = useState('early'); // 'early' or 'late'
  const [isCancelling, setIsCancelling] = useState(false);
  
  // Navigation State
  const [activeTab, setActiveTab] = useState('home'); // 'home', 'calendar', 'payments', 'notifications'

  // Dynamic user details
  const memberName = user?.user_metadata?.full_name || "Üye";
  const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(memberName)}&background=10b981&color=fff`;

  useEffect(() => {
    if (!user) return;

    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        
        // 1. Fetch Active Packages
        const { data: userPackages, error: packageError } = await supabase
          .from('packages')
          .select('*')
          .eq('profile_id', user.id);

        const activePackages = userPackages?.filter(p => p.status === 'active') || [];
        const activePackageIds = activePackages.map(p => p.id);

        if (activePackages.length > 0) {
          setActivePackage(activePackages[0]);
        } else {
          setActivePackage(null);
        }

        // 2. Fetch Next Lesson (Bulletproof method: Checking both lessons and attendance tables)
        const today = getLocalDateString();
        
        let allUpcomingLessons = [];

        // Check 1: Lessons assigned directly via lessons.profile_id
        const { data: directLessons, error: directErr } = await supabase
          .from('lessons')
          .select('*, trainer:profiles!lessons_trainer_id_fkey(full_name)')
          .eq('profile_id', user.id)
          .gte('lesson_date', today)
          .eq('status', 'active');
          
        if (!directErr && directLessons) {
          allUpcomingLessons = [...allUpcomingLessons, ...directLessons];
        }

        // Check 2: Lessons assigned via attendance table
        const { data: myAttendances, error: myAttError } = await supabase
          .from('attendance')
          .select(`
            id, package_id, status, notes, is_makeup, is_telafi,
            lessons (
              id, name, lesson_date, start_time, end_time,
              trainer:profiles!lessons_trainer_id_fkey ( full_name )
            )
          `)
          .eq('profile_id', user.id);

        if (!myAttError && myAttendances) {
          const earlyCancels = myAttendances.filter(att => !att.is_telafi && att.status === 'cancelled' && att.notes === 'Üye İptali / Erken İptal').length;
          const usedTelafis = myAttendances.filter(att => att.is_telafi === true && !(att.status === 'cancelled' && att.notes === 'Üye İptali / Erken İptal')).length;
          setTelafiBalance(Math.max(0, earlyCancels - usedTelafis));

          const earnedMakeups = myAttendances.filter(att => att.status === 'compensation').length;
          const usedMakeups = myAttendances.filter(att => att.is_makeup === true && !(att.status === 'cancelled' && att.notes === 'Üye İptali / Erken İptal')).length;
          setMakeupBalance(Math.max(0, earnedMakeups - usedMakeups));

          const attendedLessons = myAttendances
            .filter(att => {
              if (!att.lessons || att.lessons.lesson_date < today) return false;
              if (att.status === 'cancelled' || att.lessons.status === 'cancelled') return false;
              if (att.package_id && activePackageIds.length > 0 && !activePackageIds.includes(att.package_id)) return false;
              return true;
            })
            .map(att => ({ ...att.lessons, is_makeup: att.is_makeup, is_telafi: att.is_telafi, attendance_id: att.id, package_id: att.package_id, attendance_status: att.status, attendance_notes: att.notes }));
          
          allUpcomingLessons = [...allUpcomingLessons, ...attendedLessons];
        }

        // Deduplicate and Sort
        if (allUpcomingLessons.length > 0) {
          const uniqueLessons = Array.from(new Map(allUpcomingLessons.map(item => [item.id, item])).values());
          
          uniqueLessons.sort((a, b) => {
             if (a.lesson_date === b.lesson_date) {
                 return a.start_time.localeCompare(b.start_time);
             }
             return a.lesson_date.localeCompare(b.lesson_date);
          });
          
          const upcomingActive = uniqueLessons.filter(l => l.attendance_status !== 'cancelled' && l.status !== 'cancelled');
          setNextLesson(upcomingActive.length > 0 ? upcomingActive[0] : null);
          setUpcomingLessons(upcomingActive);
        } else {
          setNextLesson(null);
          setUpcomingLessons([]);
        }

        // 3. Fetch Past Lessons & History Count
        const { data: pastData, error: pastError } = await supabase
          .from('attendance')
          .select(`
            id, status, notes, is_makeup, is_telafi,
            lessons (
              id, name, lesson_date, start_time, end_time,
              trainer:profiles!lessons_trainer_id_fkey ( full_name )
            )
          `)
          .eq('profile_id', user.id)
          .in('status', ['attended', 'cancelled']);

        if (!pastError && pastData) {
          const validPast = pastData.filter(att => att.lessons).map(att => ({ ...att.lessons, is_makeup: att.is_makeup, is_telafi: att.is_telafi, attendance_status: att.status, attendance_notes: att.notes }));
          // Sort past lessons descending
          validPast.sort((a, b) => {
             if (a.lesson_date === b.lesson_date) return b.start_time.localeCompare(a.start_time);
             return b.lesson_date.localeCompare(a.lesson_date);
          });
          setPastLessons(validPast);
          setHistoryCount(validPast.length);
        }

        // 4. Fetch Past Packages
        const { data: pastPkgs, error: pkgsError } = await supabase
          .from('packages')
          .select('*')
          .eq('profile_id', user.id)
          .in('status', ['completed', 'expired'])
          .order('created_at', { ascending: false });

        if (!pkgsError && pastPkgs) {
          setPastPackages(pastPkgs);
        }

        // 5. Fetch Payments
        const { data: paymentsData, error: paymentsError } = await supabase
          .from('payments')
          .select('*')
          .eq('profile_id', user.id)
          .order('created_at', { ascending: false });

        if (!paymentsError && paymentsData) {
          setPayments(paymentsData);
        }

      } catch (err) {
        console.error("Error fetching dashboard data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, [user]);

  // Calculations for progress
  const totalClasses = activePackage ? activePackage.total_sessions : 12; // Fallback to 12 if no package
  const usedClasses = activePackage ? activePackage.used_sessions : 0;
  const remainingClasses = activePackage ? totalClasses - usedClasses : 0;
  const progressPercent = totalClasses > 0 ? (usedClasses / totalClasses) * 100 : 0;

  // Format date helper
  const formatLessonDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' });
  };

  const isToday = (dateString) => {
    if (!dateString) return false;
    const today = getLocalDateString();
    return dateString === today;
  };

  const getRelativeDayName = (dateString) => {
    if (!dateString) return '';
    const today = new Date();
    today.setHours(0,0,0,0);
    const lessonDate = new Date(dateString);
    lessonDate.setHours(0,0,0,0);
    
    const diffTime = lessonDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    const shortDate = lessonDate.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
    
    if (diffDays === 0) return `BUGÜN, ${shortDate}`;
    if (diffDays === 1) return `YARIN, ${shortDate}`;
    
    const dayName = lessonDate.toLocaleDateString('tr-TR', { weekday: 'long' }).toUpperCase();
    return `${shortDate} ${dayName}`;
  };

  const openCancelModal = (lesson) => {
    // Limit: Day before lesson at 19:00 local time
    const [year, month, day] = lesson.lesson_date.split('-');
    const lessonDate = new Date(year, month - 1, day);
    const limitDate = new Date(lessonDate);
    limitDate.setDate(limitDate.getDate() - 1);
    limitDate.setHours(19, 0, 0, 0);

    const now = new Date();
    setLessonToCancel(lesson);
    setCancelType(now > limitDate ? 'late' : 'early');
    setCancelModalOpen(true);
  };

  const handleConfirmCancel = async () => {
    if (!lessonToCancel) return;
    
    setIsCancelling(true);
    try {
      if (cancelType === 'early') {
        if (lessonToCancel.attendance_id) {
          const { error: attError } = await supabase
            .from('attendance')
            .update({ status: 'cancelled', notes: 'Üye İptali / Erken İptal' })
            .eq('id', lessonToCancel.attendance_id);
          if (attError) throw attError;
        }
      } else {
        // Late cancel
        if (lessonToCancel.attendance_id) {
          const { error: attError } = await supabase
            .from('attendance')
            .update({ status: 'cancelled', notes: 'Üye İptali / Geç İptal' })
            .eq('id', lessonToCancel.attendance_id);
            
          if (attError) throw attError;
          
          if (lessonToCancel.package_id) {
            const { data: pkgData, error: pkgFetchError } = await supabase
              .from('packages')
              .select('id, used_sessions, total_sessions')
              .eq('id', lessonToCancel.package_id)
              .single();
              
            if (!pkgFetchError && pkgData) {
              const newUsed = pkgData.used_sessions + 1;
              const newStatus = newUsed >= pkgData.total_sessions ? 'completed' : 'active';
              
              await supabase
                .from('packages')
                .update({ used_sessions: newUsed, status: newStatus })
                .eq('id', lessonToCancel.package_id);
            }
          }
        }
      }
      
      // Yöneticilere / Hocalara anlık bildirim fırlat
      await sendNotification({
        role: 'admin',
        title: 'Ders İptal / Telafi Talebi',
        body: `${memberName}, ${formatLessonDate(lessonToCancel?.lesson_date)} tarihindeki ${lessonToCancel?.start_time || ''} dersine katılamayacağını bildirdi.`
      });

      alert("Dersiniz başarıyla iptal edildi ve yöneticinize bildirim iletildi.");
      await new Promise(r => setTimeout(r, 500));
      window.location.reload();
    } catch (error) {
      console.error("Cancel error:", error);
      alert("İptal işlemi sırasında bir hata oluştu: " + error.message);
    } finally {
      setIsCancelling(false);
      setCancelModalOpen(false);
      setLessonToCancel(null);
    }
  };

  return (
    <div className="member-dashboard-container">
      {/* Header */}
      <header className="member-header">
        <div className="header-user-info">
          <img src={avatarUrl} alt="User Avatar" className="user-avatar" />
          <div className="user-text">
            <p className="welcome-text">Hoş geldin,</p>
            <h1 className="user-name">{memberName}</h1>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <NotificationToggle profileId={user?.id} />
          <button className="settings-btn" aria-label="Çıkış Yap" onClick={signOut} title="Çıkış Yap">
            <LogOut size={22} color="#ef4444" />
          </button>
        </div>
      </header>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '2rem' }}>Yükleniyor...</div>
      ) : (
        <div style={{ paddingBottom: '80px' }}>
          {activeTab === 'home' && (
            <>
          <DashboardAnnouncements />
          
          {/* Class Status */}
          <section className="dashboard-card status-card">
            <div className="status-header">
              <h2 className="status-title">Ders Durumu</h2>
              {activePackage ? (
                <span className="badge-active">Aktif Paket</span>
              ) : (
                <span className="badge-active" style={{ backgroundColor: '#f1f5f9', color: '#64748b' }}>Paket Yok</span>
              )}
            </div>
            
            <div className="status-count-row">
              <div className="count-numbers">
                <span className="count-current">{remainingClasses}</span>
                <span className="count-total">/ {totalClasses} Ders</span>
              </div>
              <span className="count-label">Kalan Ders Sayısı</span>
            </div>

            <div className="progress-bar-container">
              <div className="progress-bar-fill" style={{ width: `${progressPercent}%` }}></div>
            </div>

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '14px', paddingTop: '12px', borderTop: '1px solid #f1f5f9' }}>
              <div style={{ backgroundColor: telafiBalance > 0 ? '#e0f2fe' : '#f8fafc', color: telafiBalance > 0 ? '#0284c7' : '#64748b', padding: '6px 12px', borderRadius: '8px', fontSize: '0.85rem', fontWeight: '600', border: telafiBalance > 0 ? '1px solid #bae6fd' : '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                🌟 Kalan Telafi Hakkı: <strong>{telafiBalance}</strong>
              </div>
              {makeupBalance > 0 && (
                <div style={{ backgroundColor: '#fef3c7', color: '#d97706', padding: '6px 12px', borderRadius: '8px', fontSize: '0.85rem', fontWeight: '600', border: '1px solid #fde68a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  🎁 Kalan İnisiyatif Hakkı: <strong>{makeupBalance}</strong>
                </div>
              )}
            </div>

            <div className="status-info">
              <Info size={16} />
              <span>Paket bitimine {remainingClasses} dersiniz kaldı.</span>
            </div>
          </section>

          {/* Next Class */}
          <div className="section-header">
            <h2 className="section-title">Sıradaki Ders</h2>
            {upcomingLessons.length > 1 && (
              <button 
                className="see-all-link" 
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#10b981', fontWeight: '500' }}
                onClick={() => setIsModalOpen(true)}
              >
                Tümünü Gör
              </button>
            )}
          </div>

          <section className="dashboard-card next-class-card">
            {nextLesson ? (
              <>
                <div className="class-title-row">
                  <h3 className="class-name">{nextLesson.name || "Ders"}</h3>
                  <div className="class-time-block">
                    <div className="class-day">{getRelativeDayName(nextLesson.lesson_date)}</div>
                    <div className="class-time">{nextLesson.start_time?.substring(0, 5)}</div>
                  </div>
                </div>
                
                <div className="instructor-info">
                  <User size={16} />
                  <span>{nextLesson.trainer?.full_name || nextLesson.trainers?.full_name || "Eğitmen Atanmadı"}</span>
                </div>

                <div className="class-bottom-row">
                  <div className="class-date-info">
                    <CalendarRange size={16} />
                    <span>{formatLessonDate(nextLesson.lesson_date)}</span>
                  </div>
                  {nextLesson.attendance_id && (
                    <button 
                      onClick={() => openCancelModal(nextLesson)}
                      style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem', borderRadius: '4px', backgroundColor: '#fee2e2', color: '#ef4444', border: 'none', cursor: 'pointer', fontWeight: '600' }}
                    >
                      İptal Et
                    </button>
                  )}
                </div>
              </>
            ) : (
              <div style={{ padding: '1rem 0', color: '#64748b', fontSize: '0.875rem' }}>
                Yaklaşan planlanmış bir dersiniz bulunmuyor.
              </div>
            )}
          </section>

          {/* History Card */}
          <section 
            className="dashboard-card history-card" 
            onClick={() => setIsHistoryModalOpen(true)}
            style={{ cursor: 'pointer', transition: 'transform 0.2s' }}
            onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
            onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
          >
            <div className="history-icon-wrapper">
              <History size={28} />
            </div>
            <div className="history-label">GEÇMİŞ</div>
            <div className="history-value">{historyCount} Tamamlanan</div>
          </section>
          </>
        )}

        {activeTab === 'calendar' && (
          <MemberCalendar upcomingLessons={upcomingLessons} pastLessons={pastLessons} />
        )}
          
          {activeTab === 'payments' && (
            <div className="payments-container" style={{ padding: '0 1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h2 style={{ color: '#1e293b', fontSize: '1.25rem', fontWeight: 'bold' }}>Ödemelerim</h2>
              </div>
              
              {payments.length > 0 ? (
                payments.map(payment => (
                  <div key={payment.id} className="dashboard-card next-class-card" style={{ marginBottom: '1rem', padding: '1rem 1.5rem', borderLeft: `6px solid ${payment.status === 'paid' ? '#10b981' : '#f59e0b'}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <h3 className="class-name" style={{ marginBottom: '0.25rem', fontSize: '1.1rem', color: '#334155' }}>
                          Paket Ödemesi
                        </h3>
                        <div style={{ color: '#64748b', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          <CalendarRange size={14} />
                          {formatLessonDate(payment.payment_date || payment.created_at)}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#1e293b', marginBottom: '0.35rem' }}>
                          {new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(payment.amount)}
                        </div>
                        <span style={{ 
                          fontSize: '0.75rem', 
                          fontWeight: 'bold', 
                          color: payment.status === 'paid' ? '#10b981' : '#f59e0b', 
                          backgroundColor: payment.status === 'paid' ? '#ecfdf5' : '#fef3c7', 
                          padding: '4px 8px', 
                          borderRadius: '4px',
                          display: 'inline-block'
                        }}>
                          {payment.status === 'paid' ? 'ÖDENDİ' : 'BEKLİYOR'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                  <CreditCard size={48} style={{ margin: '0 auto 1rem auto', opacity: 0.5 }} />
                  <p>Henüz bir ödeme kaydınız bulunmuyor.</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'notifications' && (
            <NotificationsPage profileId={user?.id} role="member" />
          )}
        </div>
      )}

      {/* Bottom Navigation */}
      <nav className="bottom-nav">
        <button className={`member-nav-item ${activeTab === 'home' ? 'active' : ''}`} onClick={() => setActiveTab('home')}>
          <Home size={24} />
          <span>Ana Sayfa</span>
        </button>
        <button className={`member-nav-item ${activeTab === 'calendar' ? 'active' : ''}`} onClick={() => setActiveTab('calendar')}>
          <CalendarRange size={24} />
          <span>Takvim</span>
        </button>
        <button className={`member-nav-item ${activeTab === 'payments' ? 'active' : ''}`} onClick={() => setActiveTab('payments')}>
          <CreditCard size={24} />
          <span>Ödemeler</span>
        </button>
        <button className={`member-nav-item ${activeTab === 'notifications' ? 'active' : ''}`} onClick={() => setActiveTab('notifications')}>
          <Bell size={24} />
          <span>Bildirim</span>
          <span className="nav-badge"></span>
        </button>
      </nav>

      {/* All Upcoming Lessons Modal */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal-content all-lessons-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Tüm Yaklaşan Dersler</h2>
              <button className="close-modal-btn" onClick={() => setIsModalOpen(false)}>
                &times;
              </button>
            </div>
            <div className="all-lessons-body">
              {upcomingLessons.length > 0 ? (
                upcomingLessons.map(lesson => (
                  <div key={lesson.id} className="dashboard-card next-class-card" style={{ marginBottom: '1rem', paddingLeft: '1.5rem', borderLeft: (lesson.attendance_status === 'cancelled' || lesson.status === 'cancelled') ? '6px solid #ef4444' : '6px solid #10b981' }}>
                    <div className="class-title-row">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <h3 className="class-name">{lesson.name || "Ders"}</h3>
                        {lesson.is_telafi && <span style={{ backgroundColor: '#e0f2fe', color: '#0284c7', fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>TELAFİ</span>}
                        {lesson.is_makeup && <span style={{ backgroundColor: '#fef3c7', color: '#d97706', fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>İNİSİYATİF</span>}
                      </div>
                      <div className="class-time-block">
                        <div className="class-day">{getRelativeDayName(lesson.lesson_date)}</div>
                        <div className="class-time">{lesson.start_time?.substring(0, 5)}</div>
                      </div>
                    </div>
                    
                    <div className="instructor-info">
                      <User size={16} />
                      <span>{lesson.trainer?.full_name || lesson.trainers?.full_name || "Eğitmen Atanmadı"}</span>
                    </div>

                    <div className="class-bottom-row" style={{ borderTop: 'none', paddingTop: 0 }}>
                      <div className="class-date-info">
                        <CalendarRange size={16} />
                        <span>{formatLessonDate(lesson.lesson_date)}</span>
                      </div>
                      {lesson.attendance_status === 'cancelled' || lesson.status === 'cancelled' ? (
                        <span style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem', borderRadius: '4px', backgroundColor: '#fee2e2', color: '#ef4444', fontWeight: '600' }}>
                          {(lesson.attendance_notes === 'Üye İptali / Geç İptal' || lesson.attendance_notes === 'Geç iptal / Gelmedi' || lesson.attendance_notes === 'Gelmedi') 
                            ? (lesson.attendance_notes === 'Gelmedi' ? 'GELMEDİ' : 'GEÇ İPTAL') 
                            : 'İPTAL EDİLDİ'}
                        </span>
                      ) : lesson.attendance_id && (
                        <button 
                          onClick={() => openCancelModal(lesson)}
                          style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem', borderRadius: '4px', backgroundColor: '#fee2e2', color: '#ef4444', border: 'none', cursor: 'pointer', fontWeight: '600' }}
                        >
                          İptal Et
                        </button>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                  Planlanmış başka dersiniz bulunmuyor.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Past Lessons Modal */}
      {isHistoryModalOpen && (
        <div className="modal-overlay" onClick={() => setIsHistoryModalOpen(false)}>
          <div className="modal-content all-lessons-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2>Geçmiş Kayıtlarım</h2>
                <button className="close-modal-btn" onClick={() => setIsHistoryModalOpen(false)}>
                  &times;
                </button>
              </div>
              
              <div className="history-tabs" style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid #e2e8f0' }}>
                <button 
                  className={`history-tab-btn ${historyTab === 'lessons' ? 'active' : ''}`}
                  onClick={() => setHistoryTab('lessons')}
                  style={{ 
                    background: 'none', border: 'none', padding: '0.5rem 0', cursor: 'pointer',
                    fontWeight: '600', fontSize: '0.875rem',
                    color: historyTab === 'lessons' ? '#10b981' : '#64748b',
                    borderBottom: historyTab === 'lessons' ? '2px solid #10b981' : '2px solid transparent'
                  }}
                >
                  Geçmiş Derslerim
                </button>
                <button 
                  className={`history-tab-btn ${historyTab === 'packages' ? 'active' : ''}`}
                  onClick={() => setHistoryTab('packages')}
                  style={{ 
                    background: 'none', border: 'none', padding: '0.5rem 0', cursor: 'pointer',
                    fontWeight: '600', fontSize: '0.875rem',
                    color: historyTab === 'packages' ? '#10b981' : '#64748b',
                    borderBottom: historyTab === 'packages' ? '2px solid #10b981' : '2px solid transparent'
                  }}
                >
                  Eski Paketlerim
                </button>
              </div>
            </div>
            
            <div className="all-lessons-body">
              {historyTab === 'lessons' && (
                pastLessons.length > 0 ? (
                  pastLessons.map(lesson => (
                    <div key={lesson.id} className="dashboard-card next-class-card past-lesson-card" style={{ marginBottom: '1rem', paddingLeft: '1.5rem', borderLeft: (lesson.attendance_status === 'cancelled' || lesson.status === 'cancelled') ? '6px solid #ef4444' : '6px solid #94a3b8' }}>
                      <div className="class-title-row">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <h3 className="class-name" style={{ color: '#64748b' }}>{lesson.name || "Ders"}</h3>
                          {lesson.is_telafi && <span style={{ backgroundColor: '#e0f2fe', color: '#0284c7', fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>TELAFİ</span>}
                          {lesson.is_makeup && <span style={{ backgroundColor: '#fef3c7', color: '#d97706', fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>İNİSİYATİF</span>}
                        </div>
                        <div className="class-time-block">
                          <div className="class-time" style={{ color: '#94a3b8' }}>{lesson.start_time?.substring(0, 5)}</div>
                        </div>
                      </div>
                      
                      <div className="instructor-info" style={{ color: '#94a3b8' }}>
                        <User size={16} />
                        <span>{lesson.trainer?.full_name || lesson.trainers?.full_name || "Eğitmen Atanmadı"}</span>
                      </div>

                      <div className="class-bottom-row" style={{ borderTop: 'none', paddingTop: 0 }}>
                        <div className="class-date-info">
                          <CalendarRange size={16} color="#94a3b8" />
                          <span style={{ color: '#94a3b8' }}>{formatLessonDate(lesson.lesson_date)}</span>
                        </div>
                        {lesson.attendance_status === 'cancelled' || lesson.status === 'cancelled' ? (
                          <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#ef4444', backgroundColor: '#fee2e2', padding: '4px 8px', borderRadius: '4px' }}>
                            {(lesson.attendance_notes === 'Üye İptali / Geç İptal' || lesson.attendance_notes === 'Geç iptal / Gelmedi' || lesson.attendance_notes === 'Gelmedi') 
                              ? (lesson.attendance_notes === 'Gelmedi' ? 'GELMEDİ' : 'GEÇ İPTAL') 
                              : 'İPTAL EDİLDİ'}
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#10b981', backgroundColor: '#ecfdf5', padding: '4px 8px', borderRadius: '4px' }}>TAMAMLANDI</span>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                    Henüz tamamlanmış bir dersiniz bulunmuyor.
                  </div>
                )
              )}

              {historyTab === 'packages' && (
                pastPackages.length > 0 ? (
                  pastPackages.map(pkg => (
                    <div key={pkg.id} className="dashboard-card next-class-card past-lesson-card" style={{ marginBottom: '1rem', paddingLeft: '1.5rem', borderLeft: '6px solid #94a3b8' }}>
                      <div className="class-title-row">
                        <h3 className="class-name" style={{ color: '#64748b' }}>Paket Geçmişi</h3>
                      </div>
                      
                      <div className="instructor-info" style={{ color: '#94a3b8', margin: '0.5rem 0' }}>
                        <Info size={16} />
                        <span>Toplam {pkg.total_sessions} seanslık paket</span>
                      </div>

                      <div className="class-bottom-row" style={{ borderTop: 'none', paddingTop: 0, marginTop: '1rem' }}>
                        <div className="class-date-info">
                          <CalendarRange size={16} color="#94a3b8" />
                          <span style={{ color: '#94a3b8' }}>{formatLessonDate(pkg.created_at)}</span>
                        </div>
                        <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: pkg.status === 'completed' ? '#10b981' : '#f59e0b', backgroundColor: pkg.status === 'completed' ? '#ecfdf5' : '#fef3c7', padding: '4px 8px', borderRadius: '4px' }}>
                          {pkg.status === 'completed' ? 'TAMAMLANDI' : 'SÜRESİ DOLDU'}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                    Eski bir paketiniz bulunmuyor.
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      )}

      {/* Cancel Lesson Modal */}
      {cancelModalOpen && lessonToCancel && (
        <div className="modal-overlay" onClick={() => !isCancelling && setCancelModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <h2>Ders İptali</h2>
            </div>
            <div className="modal-body" style={{ padding: '1.5rem', lineHeight: '1.5', color: '#334155' }}>
              <p style={{ marginBottom: '1rem' }}>
                <strong>{formatLessonDate(lessonToCancel.lesson_date)}</strong> tarihindeki <strong>{lessonToCancel.start_time?.substring(0, 5)}</strong> dersinizi iptal etmek üzeresiniz.
              </p>
              
              {cancelType === 'early' ? (
                <div style={{ padding: '1rem', backgroundColor: '#d1fae5', color: '#065f46', borderRadius: '0.5rem', fontSize: '0.875rem' }}>
                  Erken iptal işlemi yapıyorsunuz. (Dersinize 1 günden fazla var veya iptal sınırı olan saat 19:00'ı henüz geçmedi).<br/><br/>
                  <strong>Bu işlem sonucunda ders hakkınız yanmayacaktır.</strong>
                </div>
              ) : (
                <div style={{ padding: '1rem', backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: '0.5rem', fontSize: '0.875rem' }}>
                  <strong>DİKKAT: GEÇ İPTAL</strong><br/>
                  Dersinize 1 gün kala saat 19:00'ı geçtiğiniz için kurallar gereği bu dersi iptal ederseniz <strong>1 ders hakkınız YANACAKTIR.</strong>
                </div>
              )}
            </div>
            <div className="modal-footer" style={{ padding: '1rem 1.5rem', display: 'flex', gap: '1rem', justifyContent: 'flex-end', borderTop: '1px solid #e2e8f0' }}>
              <button 
                className="btn-secondary" 
                onClick={() => setCancelModalOpen(false)}
                disabled={isCancelling}
                style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer' }}
              >
                Vazgeç
              </button>
              <button 
                className="btn-primary" 
                onClick={handleConfirmCancel}
                disabled={isCancelling}
                style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', border: 'none', background: '#ef4444', color: 'white', cursor: 'pointer', fontWeight: '500' }}
              >
                {isCancelling ? 'İşleniyor...' : 'Evet, İptal Et'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MemberDashboard;
