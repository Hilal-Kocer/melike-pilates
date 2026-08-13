import React, { useState, useEffect } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  Calendar as CalendarIcon,
  Clock,
  X,
  CheckCircle,
  AlertTriangle,
  Trash2,
  Loader2,
  CalendarRange
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { sendNotification } from '../../lib/sendNotification';
import './ScheduleCalendar.css';
import BulkScheduleModal from './BulkScheduleModal';
import SingleScheduleModal from './SingleScheduleModal';

const DAYS_OF_WEEK = [
  { id: 1, name: 'Pazartesi' },
  { id: 2, name: 'Salı' },
  { id: 3, name: 'Çarşamba' },
  { id: 4, name: 'Perşembe' },
  { id: 5, name: 'Cuma' },
  { id: 6, name: 'Cumartesi' },
  { id: 0, name: 'Pazar' }
];

const ScheduleCalendar = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [lessons, setLessons] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modal State
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [isSingleModalOpen, setIsSingleModalOpen] = useState(false);

  // Lesson Manage Modal State
  const [selectedLesson, setSelectedLesson] = useState(null);
  const [isManageModalOpen, setIsManageModalOpen] = useState(false);
  const [isManaging, setIsManaging] = useState(false);
  const [manageError, setManageError] = useState(null);

  useEffect(() => {
    fetchLessons();
  }, [currentDate]);

  const getLocalDateString = (d) => {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const getWeekStartAndEnd = (date) => {
    const curr = new Date(date);
    curr.setHours(0, 0, 0, 0); // Normalize time
    const dayOfWeek = curr.getDay() === 0 ? 7 : curr.getDay(); // Make Monday 1, Sunday 7
    
    const start = new Date(curr);
    start.setDate(curr.getDate() - dayOfWeek + 1); // Monday
    
    const end = new Date(start);
    end.setDate(start.getDate() + 6); // Sunday
    
    return {
      startStr: getLocalDateString(start),
      endStr: getLocalDateString(end),
      startDateObj: start
    };
  };

  const handleManageAttendance = async (attendanceRecord, action) => {
    if (!attendanceRecord || !selectedLesson) return;
    setIsManaging(true);
    setManageError(null);

    try {
      if (action === 'toggle_telafi') {
        const { error: attError } = await supabase
          .from('attendance')
          .update({ is_telafi: !attendanceRecord.is_telafi })
          .eq('id', attendanceRecord.id);
        if (attError) throw attError;
      } else if (action === 'toggle_inisiyatif') {
        const { error: attError } = await supabase
          .from('attendance')
          .update({ is_makeup: !attendanceRecord.is_makeup })
          .eq('id', attendanceRecord.id);
        if (attError) throw attError;
      } else if (action === 'delete') {
        const { error } = await supabase
          .from('attendance')
          .delete()
          .eq('id', attendanceRecord.id);
        if (error) throw error;

      } else if (action === 'undo') {
        // 1. Fetch current package
        const { data: pkgData, error: pkgFetchError } = await supabase
          .from('packages')
          .select('id, used_sessions, total_sessions')
          .eq('id', attendanceRecord.package_id)
          .single();
          
        if (pkgFetchError) throw pkgFetchError;

        // If it was attended or cancelled, we must refund the session
        let newUsedSessions = pkgData.used_sessions;
        if (attendanceRecord.status === 'attended' || attendanceRecord.status === 'cancelled') {
          newUsedSessions = Math.max(0, pkgData.used_sessions - 1);
        }

        const newStatus = newUsedSessions >= pkgData.total_sessions ? 'completed' : 'active';

        const { error: pkgUpdateError } = await supabase
          .from('packages')
          .update({ used_sessions: newUsedSessions, status: newStatus })
          .eq('id', attendanceRecord.package_id);
          
        if (pkgUpdateError) throw pkgUpdateError;

        const { error: attError } = await supabase
          .from('attendance')
          .update({ status: 'bekliyor', notes: null })
          .eq('id', attendanceRecord.id);
          
        if (attError) throw attError;

      } else {
        // 'complete', 'noshow', or 'compensation'
        const { data: pkgData, error: pkgFetchError } = await supabase
          .from('packages')
          .select('id, used_sessions, total_sessions')
          .eq('id', attendanceRecord.package_id)
          .single();
          
        if (pkgFetchError) throw pkgFetchError;
        
        let newUsedSessions = pkgData.used_sessions;
        // Only increment if it's complete or noshow
        if (action === 'complete' || action === 'noshow') {
           newUsedSessions += 1;
        }
        
        const newPkgStatus = newUsedSessions >= pkgData.total_sessions ? 'completed' : 'active';

        const { error: pkgUpdateError } = await supabase
          .from('packages')
          .update({ used_sessions: newUsedSessions, status: newPkgStatus })
          .eq('id', attendanceRecord.package_id);
          
        if (pkgUpdateError) throw pkgUpdateError;

        let attendanceStatus = 'bekliyor';
        let notesStr = '';
        if (action === 'complete') { attendanceStatus = 'attended'; notesStr = 'Katıldı'; }
        if (action === 'noshow') { attendanceStatus = 'cancelled'; notesStr = 'Gelmedi'; }
        if (action === 'compensation') { attendanceStatus = 'compensation'; notesStr = 'İptal / İnisiyatif Hakkı Verildi'; }
        if (action === 'telafi_hakki') { attendanceStatus = 'cancelled'; notesStr = 'Üye İptali / Erken İptal'; }

        const { error: attError } = await supabase
          .from('attendance')
          .update({ status: attendanceStatus, notes: notesStr })
          .eq('id', attendanceRecord.id);
          
        if (attError) throw attError;

        // Anlık Push Bildirimleri Gönder
        if (action === 'noshow' || action === 'compensation' || action === 'telafi_hakki') {
          await sendNotification({
            profileId: attendanceRecord.profile_id,
            title: 'Ders Durumu Güncellendi',
            body: `${selectedLesson?.lesson_date || ''} tarihli dersiniz hocanız tarafından "${notesStr}" olarak güncellendi.`
          });
        } else if (action === 'complete') {
          const remaining = pkgData.total_sessions - newUsedSessions;
          if (remaining <= 1) {
            await sendNotification({
              profileId: attendanceRecord.profile_id,
              title: 'Paketiniz Bitiyor!',
              body: `Mevcut paketinizde yalnızca ${remaining} dersiniz kaldı. Yenilemek için iletişime geçebilirsiniz.`
            });
          }
        }
      }

      await fetchLessons();
      
      const freshLesson = await supabase
        .from('lessons')
        .select(`
          id, name, lesson_date, start_time, end_time, status, max_capacity,
          trainer:profiles!lessons_trainer_id_fkey ( full_name ),
          attendance (
            id, status, notes, profile_id, package_id, is_makeup, is_telafi,
            profiles ( full_name )
          )
        `)
        .eq('id', selectedLesson.id)
        .single();
        
      if (freshLesson.data) {
        setSelectedLesson(freshLesson.data);
      } else {
        setIsManageModalOpen(false);
      }

    } catch (err) {
      setManageError(err.message);
    } finally {
      setIsManaging(false);
    }
  };

  const fetchLessons = async () => {
    setLoading(true);
    try {
      const { startStr, endStr } = getWeekStartAndEnd(currentDate);
      
      const { data, error } = await supabase
        .from('lessons')
        .select(`
          id, name, lesson_date, start_time, end_time, status, max_capacity,
          trainer:profiles!lessons_trainer_id_fkey ( full_name ),
          attendance (
            id, status, notes, profile_id, package_id, is_makeup, is_telafi,
            profiles ( full_name )
          )
        `)
        .gte('lesson_date', startStr)
        .lte('lesson_date', endStr)
        .order('start_time', { ascending: true });

      if (error) throw error;
      setLessons(data || []);
    } catch (err) {
      console.error('Error fetching lessons:', err);
    } finally {
      setLoading(false);
    }
  };

  const nextWeek = () => {
    const next = new Date(currentDate);
    next.setDate(currentDate.getDate() + 7);
    setCurrentDate(next);
  };

  const prevWeek = () => {
    const prev = new Date(currentDate);
    prev.setDate(currentDate.getDate() - 7);
    setCurrentDate(prev);
  };

  const { startDateObj } = getWeekStartAndEnd(currentDate);
  const weekStartStr = new Date(startDateObj).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });
  
  const endObj = new Date(startDateObj);
  endObj.setDate(startDateObj.getDate() + 6);
  const weekEndStr = endObj.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });

  return (
    <div className="schedule-container">
      <div className="schedule-header">
        <div className="calendar-nav">
          <button className="nav-btn" onClick={prevWeek}>
            <ChevronLeft size={20} />
          </button>
          <h2 className="week-title">{weekStartStr} - {weekEndStr}</h2>
          <button className="nav-btn" onClick={nextWeek}>
            <ChevronRight size={20} />
          </button>
        </div>
        
        <div className="calendar-actions" style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn-secondary" onClick={() => setIsSingleModalOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0', background: 'white', color: '#1e293b', fontWeight: '500', cursor: 'pointer' }}>
            <Plus size={18} />
            <span>Tek Randevu Ekle</span>
          </button>
          <button className="btn-primary" onClick={() => setIsBulkModalOpen(true)}>
            <CalendarIcon size={18} />
            <span>Toplu Randevu</span>
          </button>
        </div>
      </div>

      <div className="calendar-grid">
        {DAYS_OF_WEEK.map((day) => {
          const dayDate = new Date(startDateObj);
          const dayIndex = day.id === 0 ? 6 : day.id - 1; 
          dayDate.setDate(dayDate.getDate() + dayIndex);
          const dateStr = getLocalDateString(dayDate);
          
          const dayLessons = lessons.filter(l => l.lesson_date === dateStr);

          return (
            <div key={day.id} className="calendar-day-column">
              <div className="day-header">
                <span className="day-name">{day.name}</span>
                <span className="day-date">{dayDate.getDate()}</span>
              </div>
              <div className="day-content">
                {loading ? (
                  <div className="loading-small">Yükleniyor...</div>
                ) : dayLessons.length === 0 ? (
                  <div className="empty-day">Ders Yok</div>
                ) : (
                  dayLessons.map(lesson => (
                    <div 
                      key={lesson.id} 
                      className={`lesson-card status-${lesson.status}`}
                      onClick={() => {
                        setSelectedLesson(lesson);
                        setIsManageModalOpen(true);
                        setManageError(null);
                      }}
                    >
                      <div className="lesson-time">
                        <Clock size={12} />
                        <span>{lesson.start_time.substring(0, 5)} - {lesson.end_time.substring(0, 5)}</span>
                      </div>
                      <div className="lesson-name" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {lesson.attendance && lesson.attendance.some(att => att.is_makeup) && (
                          <span style={{ display: 'flex', alignItems: 'center', backgroundColor: '#fef3c7', padding: '2px', borderRadius: '4px' }} title="Bu bir inisiyatif dersidir">
                            🔄
                          </span>
                        )}
                        {lesson.attendance && lesson.attendance.some(att => att.is_telafi) && (
                          <span style={{ display: 'flex', alignItems: 'center', backgroundColor: '#e0f2fe', color: '#0284c7', padding: '2px 6px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 'bold' }} title="Bu ders iptal edilen hakkın telafisidir">
                            TELAFİ
                          </span>
                        )}
                        {lesson.name}
                      </div>
                      <div className="lesson-members-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '0.5rem' }}>
                        {lesson.attendance && lesson.attendance.map(att => {
                          const isLate = att.status === 'cancelled' && (att.notes === 'Üye İptali / Geç İptal' || att.notes === 'Geç iptal / Gelmedi');
                          const isNoShow = att.status === 'cancelled' && att.notes === 'Gelmedi';
                          const isEarly = att.status === 'cancelled' && att.notes === 'Üye İptali / Erken İptal';
                          return (
                          <div key={att.id} style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ textDecoration: att.status === 'cancelled' ? 'line-through' : 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              👤 {att.profiles?.full_name}
                              {att.is_telafi && <span style={{ color: '#0284c7', backgroundColor: '#e0f2fe', padding: '2px 4px', borderRadius: '4px', fontSize: '0.6rem', fontWeight: 'bold' }}>TELAFİ</span>}
                            </span>
                            {isLate && <span style={{ color: '#ef4444', fontSize: '0.65rem', fontWeight: 'bold' }}>GEÇ İPTAL</span>}
                            {isNoShow && <span style={{ color: '#ef4444', fontSize: '0.65rem', fontWeight: 'bold' }}>GELMEDİ</span>}
                            {isEarly && <span style={{ color: '#f59e0b', fontSize: '0.65rem', fontWeight: 'bold' }}>İPTAL</span>}
                            {!isLate && !isNoShow && !isEarly && (
                              <span className={`status-dot ${att.status}`} style={{
                                width: '8px', height: '8px', borderRadius: '50%',
                                backgroundColor: att.status === 'attended' ? '#10b981' : att.status === 'cancelled' ? '#ef4444' : '#cbd5e1'
                              }}></span>
                            )}
                          </div>
                        )})}
                      </div>
                      {lesson.trainer?.full_name && (
                        <div className="lesson-trainer" style={{ fontSize: '0.75rem', color: '#8b5cf6', marginTop: '0.25rem' }}>
                          👩‍🏫 {lesson.trainer.full_name}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      <BulkScheduleModal 
        isOpen={isBulkModalOpen} 
        onClose={() => setIsBulkModalOpen(false)} 
        onSuccess={fetchLessons}
      />

      <SingleScheduleModal 
        isOpen={isSingleModalOpen} 
        onClose={() => setIsSingleModalOpen(false)} 
        onSuccess={fetchLessons}
      />

      {/* DERS YÖNETİM MODALI */}
      {isManageModalOpen && selectedLesson && (
        <div className="modal-overlay">
          <div className="modal-content manage-lesson-modal">
            <div className="modal-header">
              <h2>Ders Yönetimi</h2>
              <button className="close-modal-btn" onClick={() => setIsManageModalOpen(false)}>
                <X size={24} />
              </button>
            </div>
            
            <div className="manage-lesson-body">
              {manageError && <div className="modal-error">{manageError}</div>}
              
              <div className="lesson-summary">
                <h3>{selectedLesson.name}</h3>
                <p>👤 <strong>Kapasite:</strong> {selectedLesson.attendance?.length || 0} / {selectedLesson.max_capacity}</p>
                <p>🕒 <strong>Tarih/Saat:</strong> {selectedLesson.lesson_date} | {selectedLesson.start_time.substring(0,5)} - {selectedLesson.end_time.substring(0,5)}</p>
              </div>

              <div className="manage-members-list" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {selectedLesson.attendance && selectedLesson.attendance.length > 0 ? (
                  selectedLesson.attendance.map(att => (
                    <div key={att.id} className="member-manage-row" style={{ background: '#f8fafc', padding: '1rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                        <strong>👤 {att.profiles?.full_name}</strong>
                        <span className={`status-badge ${att.status}`}>{att.status.toUpperCase()}</span>
                      </div>
                      
                      {att.status === 'bekliyor' ? (
                        <div className="manage-actions-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: '0.5rem' }}>
                          <button 
                            className="manage-btn btn-complete" style={{ padding: '0.5rem', justifyContent: 'center' }}
                            disabled={isManaging}
                            onClick={() => handleManageAttendance(att, 'complete')}
                          >
                            <CheckCircle size={16} />
                            <div className="btn-text">
                              <strong>Katıldı</strong>
                            </div>
                          </button>

                          <button 
                            className="manage-btn btn-noshow" style={{ padding: '0.5rem', justifyContent: 'center' }}
                            disabled={isManaging}
                            onClick={() => handleManageAttendance(att, 'noshow')}
                          >
                            <AlertTriangle size={16} />
                            <div className="btn-text">
                              <strong>Gelmedi (Yanar)</strong>
                            </div>
                          </button>
                          
                          <button 
                            className="manage-btn" style={{ padding: '0.5rem', justifyContent: 'center', backgroundColor: '#e0f2fe', color: '#0284c7', border: 'none', borderRadius: '0.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer' }}
                            disabled={isManaging}
                            onClick={() => handleManageAttendance(att, 'telafi_hakki')}
                            title="Üye erken iptal etti, paketten seans düşülmeyecek, telafi hakkı kazanacak."
                          >
                            <CalendarRange size={16} />
                            <div className="btn-text">
                              <strong>Telafi</strong>
                            </div>
                          </button>

                          <button 
                            className="manage-btn" style={{ padding: '0.5rem', justifyContent: 'center', backgroundColor: '#fef3c7', color: '#d97706', border: 'none', borderRadius: '0.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer' }}
                            disabled={isManaging}
                            onClick={() => handleManageAttendance(att, 'compensation')}
                            title="Üye derse gelmedi ama paketten seans düşülmeyecek, inisiyatif verilecek."
                          >
                            <CalendarIcon size={16} />
                            <div className="btn-text">
                              <strong>İnisiyatif</strong>
                            </div>
                          </button>

                          <button 
                            className="manage-btn btn-delete" style={{ padding: '0.5rem', justifyContent: 'center' }}
                            disabled={isManaging}
                            onClick={() => handleManageAttendance(att, 'delete')}
                            title="Dersi tamamen listeden siler."
                          >
                            <Trash2 size={16} />
                            <div className="btn-text">
                              <strong>Sil</strong>
                            </div>
                          </button>
                        </div>
                      ) : (
                        <div className="lesson-already-processed" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem', fontSize: '0.875rem', backgroundColor: '#f1f5f9', borderRadius: '0.5rem' }}>
                          <span style={{ color: '#64748b' }}>
                            {att.status === 'cancelled' 
                              ? (att.notes === 'Üye İptali / Geç İptal' || att.notes === 'Geç iptal / Gelmedi' ? 'Geç İptal (Hakkı Yandı)' : att.notes === 'Gelmedi' ? 'Gelmedi (Hakkı Yandı)' : 'Erken İptal (Hakkı Korundu)')
                              : `İşlem tamamlandı (${att.status.toUpperCase()})`}
                          </span>
                          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <button 
                              onClick={() => handleManageAttendance(att, 'undo')}
                              disabled={isManaging}
                              style={{ padding: '4px 12px', background: 'white', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold', color: '#475569' }}
                            >
                              Geri Al
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="empty-day" style={{ marginTop: '0' }}>Bu derste kayıtlı üye yok.</div>
                )}
              </div>

              {isManaging && (
                <div className="loading-overlay-inline">
                  <Loader2 className="animate-spin" size={24} /> İşlem yapılıyor...
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ScheduleCalendar;
