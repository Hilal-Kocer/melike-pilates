import React, { useState, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

const getLocalDateString = (d = new Date()) => {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const DAYS_OF_WEEK = [
  { id: 1, name: 'Pazartesi' },
  { id: 2, name: 'Salı' },
  { id: 3, name: 'Çarşamba' },
  { id: 4, name: 'Perşembe' },
  { id: 5, name: 'Cuma' },
  { id: 6, name: 'Cumartesi' },
  { id: 0, name: 'Pazar' }
];

const LESSON_TYPES = [
  { id: 'reformer', name: 'Reformer Pilates', capacity: 7 },
  { id: 'mat', name: 'Mat Pilates', capacity: 15 },
  { id: 'fonksiyonel', name: 'Fonksiyonel', capacity: 15 },
  { id: 'kardiyo', name: 'Kardiyo', capacity: 15 }
];

const BulkScheduleModal = ({ isOpen, onClose, onSuccess }) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState(null);
  
  const [activePackages, setActivePackages] = useState([]);
  const [loadingPackages, setLoadingPackages] = useState(false);
  const [trainers, setTrainers] = useState([]);
  const [selectedPackages, setSelectedPackages] = useState([]);
  const [selectedTrainerId, setSelectedTrainerId] = useState('');
  const [selectedDays, setSelectedDays] = useState([]);
  const [startTime, setStartTime] = useState('19:00');
  const [selectedLessonType, setSelectedLessonType] = useState(LESSON_TYPES[0]);
  const [attendanceData, setAttendanceData] = useState([]);

  useEffect(() => {
    if (isOpen) {
      fetchActivePackages();
      fetchTrainers();
      fetchAttendance();
    }
  }, [isOpen]);

  const fetchAttendance = async () => {
    try {
      const { data, error } = await supabase
        .from('attendance')
        .select('profile_id, package_id, status, is_makeup, notes, is_telafi');
      if (!error && data) setAttendanceData(data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchTrainers = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('role', ['admin', 'trainer'])
        .order('full_name');
      if (error) throw error;
      setTrainers(data || []);
    } catch (err) {
      console.error('Error fetching trainers:', err);
    }
  };

  const fetchActivePackages = async () => {
    try {
      setLoadingPackages(true);
      const { data: pkgs, error } = await supabase
        .from('packages')
        .select(`
          id, profile_id, total_sessions, used_sessions,
          profiles ( full_name )
        `)
        .eq('status', 'active');
        
      if (error) throw error;

      const { data: atts, error: attError } = await supabase
        .from('attendance')
        .select('id, profile_id, package_id, status, is_makeup, notes, is_telafi');

      if (attError) throw attError;
      if (atts) setAttendanceData(atts);

      const validPackages = (pkgs || []).map(p => {
        const memberAtts = (atts || []).filter(a => a.profile_id === p.profile_id);
        const waitingCount = memberAtts.filter(a => (a.package_id === p.id || !a.package_id) && a.status === 'bekliyor').length;
        const earnedMakeups = memberAtts.filter(a => a.status === 'compensation').length;
        const usedMakeups = memberAtts.filter(a => a.is_makeup === true && !(a.status === 'cancelled' && a.notes === 'Üye İptali / Erken İptal')).length;
        const makeupBalance = Math.max(0, earnedMakeups - usedMakeups);
        const remainingToPlan = Math.max(0, (p.total_sessions - p.used_sessions) + makeupBalance - waitingCount);
        return {
          ...p,
          remainingToPlan
        };
      }).filter(p => p.remainingToPlan > 0);

      setActivePackages(validPackages);
    } catch (err) {
      console.error('Error fetching packages:', err);
    } finally {
      setLoadingPackages(false);
    }
  };

  const toggleDaySelection = (dayId) => {
    if (selectedDays.includes(dayId)) {
      setSelectedDays(selectedDays.filter(d => d !== dayId));
    } else {
      setSelectedDays([...selectedDays, dayId]);
    }
  };

  const calculateEndTime = (startStr) => {
    const [h, m] = startStr.split(':');
    const d = new Date();
    d.setHours(parseInt(h), parseInt(m), 0);
    d.setHours(d.getHours() + 1);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const togglePackageSelection = (pkg) => {
    const isSelected = selectedPackages.some(p => p.id === pkg.id);
    if (isSelected) {
      setSelectedPackages(selectedPackages.filter(p => p.id !== pkg.id));
    } else {
      if (selectedPackages.length >= selectedLessonType.capacity) {
        setModalError(`Bu ders için en fazla ${selectedLessonType.capacity} üye seçebilirsiniz.`);
        return;
      }
      setSelectedPackages([...selectedPackages, pkg]);
      setModalError(null);
    }
  };

  const handleCreateBulkSchedule = async (e) => {
    e.preventDefault();
    if (selectedPackages.length === 0 || selectedDays.length === 0 || !startTime) {
      setModalError('Lütfen üye(ler), gün(ler) ve saat seçiniz.');
      return;
    }

    setIsSubmitting(true);
    setModalError(null);

    try {
      // Bulkschedule decides how many weeks forward based on the selected package with the LEAST remaining sessions.
      const remainingSessionsArray = selectedPackages.map(p => p.remainingToPlan !== undefined ? p.remainingToPlan : p.total_sessions - p.used_sessions);
      const minRemainingSessions = Math.min(...remainingSessionsArray);

      if (minRemainingSessions <= 0) throw new Error('Seçilen üyelerden birinin kalan seansı yok.');

      let scheduledCount = 0;
      let checkDate = new Date();
      const newLessons = [];
      const endTime = calculateEndTime(startTime);
      let maxIterations = 365; 
      
      while (scheduledCount < minRemainingSessions && maxIterations > 0) {
        if (selectedDays.includes(checkDate.getDay())) {
          newLessons.push({
            name: selectedLessonType.name,
            trainer_id: selectedTrainerId || null,
            lesson_date: getLocalDateString(checkDate),
            start_time: startTime,
            end_time: endTime,
            max_capacity: selectedLessonType.capacity,
            status: 'active'
          });
          scheduledCount++;
        }
        checkDate.setDate(checkDate.getDate() + 1);
        maxIterations--;
      }

      if (newLessons.length === 0) throw new Error('Hesaplanabilen bir tarih bulunamadı.');

      const scheduledDates = newLessons.map(l => l.lesson_date);

      // Check existing lessons for capacities
      const { data: existingLessons, error: findLessonsError } = await supabase
        .from('lessons')
        .select(`
          id, lesson_date, max_capacity,
          attendance ( id, status )
        `)
        .in('lesson_date', scheduledDates)
        .eq('start_time', startTime)
        .eq('name', selectedLessonType.name)
        .eq('status', 'active');
        
      if (findLessonsError) throw findLessonsError;

      // Validate capacities BEFORE inserting anything
      for (const lesson of newLessons) {
        const existing = existingLessons?.find(el => el.lesson_date === lesson.lesson_date);
        if (existing) {
          const activeAttendances = existing.attendance.filter(a => a.status !== 'cancelled').length;
          if (activeAttendances + selectedPackages.length > existing.max_capacity) {
             setModalError(`${lesson.lesson_date} tarihindeki ${selectedLessonType.name} dersinde sadece ${existing.max_capacity - activeAttendances} kişilik boş yer var. Toplu atama yapılamadı.`);
             setIsSubmitting(false);
             return;
          }
          lesson.existing_id = existing.id;
        }
      }

      const selectedProfileIds = selectedPackages.map(p => p.profile_id);

      const { data: existingConflicts, error: conflictError } = await supabase
        .from('attendance')
        .select(`
          profile_id,
          status,
          profiles ( full_name ),
          lessons!inner ( lesson_date, start_time, status )
        `)
        .in('profile_id', selectedProfileIds)
        .in('lessons.lesson_date', scheduledDates)
        .neq('status', 'cancelled')
        .neq('lessons.status', 'cancelled');

      if (conflictError) throw conflictError;

      if (existingConflicts && existingConflicts.length > 0) {
        for (const lesson of newLessons) {
          const conflictingMember = existingConflicts.find(att => 
            att.lessons &&
            att.lessons.lesson_date === lesson.lesson_date &&
            att.lessons.start_time &&
            att.lessons.start_time.substring(0, 5) === lesson.start_time.substring(0, 5)
          );
          if (conflictingMember) {
            const memberName = conflictingMember.profiles?.full_name || 'Seçilen üye';
            setModalError(`${memberName} isimli üyenin ${lesson.lesson_date} tarihinde saat ${lesson.start_time.substring(0,5)}'da zaten başka bir dersi bulunmaktadır! Toplu program oluşturulamadı.`);
            setIsSubmitting(false);
            return;
          }
        }
      }

      // 1. Insert Lessons
      const lessonsToInsert = newLessons.filter(l => !l.existing_id).map(l => {
          const { existing_id, ...rest } = l;
          return rest;
      });

      let allLessonIdsAndDates = [];

      if (lessonsToInsert.length > 0) {
        const { data: insertedLessons, error: insertError } = await supabase
          .from('lessons')
          .insert(lessonsToInsert)
          .select('id, lesson_date');

        if (insertError) throw insertError;
        allLessonIdsAndDates = [...insertedLessons];
      }

      newLessons.filter(l => l.existing_id).forEach(l => {
          allLessonIdsAndDates.push({ id: l.existing_id, lesson_date: l.lesson_date });
      });

      // 2. Insert Attendances for all selected packages into all created/found lessons
      const newAttendances = [];
      for (const lesson of allLessonIdsAndDates) {
        for (const pkg of selectedPackages) {
          const memberAtts = attendanceData.filter(a => a.profile_id === pkg.profile_id);
          const earlyCancels = memberAtts.filter(a => !a.is_telafi && a.status === 'cancelled' && a.notes === 'Üye İptali / Erken İptal').length;
          // Count used telafis from DB + the ones we just added in this loop
          const usedTelafisFromDb = memberAtts.filter(a => a.is_telafi === true && !(a.status === 'cancelled' && a.notes === 'Üye İptali / Erken İptal')).length;
          const usedTelafisThisRun = newAttendances.filter(a => a.profile_id === pkg.profile_id && a.is_telafi === true).length;
          const totalUsedTelafis = usedTelafisFromDb + usedTelafisThisRun;
          const shouldBeTelafi = earlyCancels > totalUsedTelafis;

          newAttendances.push({
            lesson_id: lesson.id,
            profile_id: pkg.profile_id,
            package_id: pkg.id,
            status: 'bekliyor',
            is_telafi: shouldBeTelafi
          });
        }
      }

      const { error: attendanceError } = await supabase
        .from('attendance')
        .insert(newAttendances);

      if (attendanceError) throw attendanceError;

      // Başarılı
      setSelectedPackages([]);
      setSelectedTrainerId('');
      setSelectedDays([]);
      setSelectedLessonType(LESSON_TYPES[0]);
      setStartTime('19:00');
      
      if (onSuccess) onSuccess();
      onClose();

    } catch (err) {
      setModalError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content bulk-schedule-modal">
        <div className="modal-header">
          <h2>Toplu Randevu Oluştur</h2>
          <button className="close-modal-btn" type="button" onClick={onClose}>
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleCreateBulkSchedule} className="modal-form">
          {modalError && <div className="modal-error">{modalError}</div>}
          
          <div className="form-group">
            <label>Üye(ler) Seçin (Maks {selectedLessonType.capacity})</label>
            <div className="member-multi-select" style={{ maxHeight: '150px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '0.5rem', padding: '0.5rem' }}>
              {loadingPackages ? (
                <div style={{ padding: '0.5rem', color: '#64748b', fontSize: '0.875rem' }}>Üyeler yükleniyor...</div>
              ) : activePackages.length === 0 ? (
                <div style={{ padding: '0.5rem', color: '#64748b', fontSize: '0.875rem' }}>Aktif paketi olan üye bulunamadı.</div>
              ) : (
                activePackages.map(pkg => {
                  const isSelected = selectedPackages.some(p => p.id === pkg.id);
                  return (
                    <div key={pkg.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem', borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }} onClick={() => togglePackageSelection(pkg)}>
                      <input 
                        type="checkbox" 
                        checked={isSelected}
                        onChange={() => {}} // Handle via div onClick
                        style={{ width: '16px', height: '16px' }}
                      />
                      <span style={{ fontSize: '0.875rem', color: '#1e293b' }}>
                        {pkg.profiles?.full_name} <span style={{ color: '#64748b' }}>({pkg.remainingToPlan !== undefined ? pkg.remainingToPlan : pkg.total_sessions - pkg.used_sessions} Seans Planlanabilir)</span>
                      </span>
                    </div>
                  );
                })
              )}
            </div>
            <small style={{ color: '#64748b', fontSize: '0.75rem', marginTop: '4px', display: 'block' }}>
              Seçilen üyelerden en az seansı olana göre hafta hesaplaması yapılır.
            </small>
          </div>

          <div className="form-group">
            <label>Eğitmen Seçimi (İsteğe Bağlı)</label>
            <select 
              value={selectedTrainerId} 
              onChange={(e) => setSelectedTrainerId(e.target.value)}
            >
              <option value="">-- Eğitmen Seçin --</option>
              {trainers.map(t => (
                <option key={t.id} value={t.id}>{t.full_name}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Ders Tipi</label>
            <select 
              value={selectedLessonType.id} 
              onChange={(e) => {
                const type = LESSON_TYPES.find(t => t.id === e.target.value);
                setSelectedLessonType(type);
                if (selectedPackages.length > type.capacity) {
                  setSelectedPackages([]);
                  setModalError(`Kapasite düştüğü için seçili üyeler sıfırlandı. Lütfen en fazla ${type.capacity} üye seçin.`);
                }
              }}
            >
              {LESSON_TYPES.map(t => (
                <option key={t.id} value={t.id}>{t.name} (Kapasite: {t.capacity})</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Sabit Günleri Seçin</label>
            <div className="days-selector">
              {DAYS_OF_WEEK.map(day => (
                <button
                  key={day.id}
                  type="button"
                  className={`day-btn ${selectedDays.includes(day.id) ? 'selected' : ''}`}
                  onClick={() => toggleDaySelection(day.id)}
                >
                  {day.name.substring(0, 3)}
                </button>
              ))}
            </div>
            <small style={{ color: '#64748b', fontSize: '0.75rem', marginTop: '4px', display: 'block' }}>
              Üyenin kalan seansı kadar ileriye dönük bu günlere otomatik kayıt açılır.
            </small>
          </div>

          <div className="form-group">
            <label>Saat</label>
            <input 
              type="time" 
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              required
            />
          </div>

          <div className="modal-actions">
            <button 
              type="button" 
              className="btn-secondary"
              onClick={onClose}
            >
              İptal
            </button>
            <button type="submit" className="btn-primary" disabled={isSubmitting || selectedDays.length === 0}>
              {isSubmitting ? <Loader2 className="animate-spin" size={18} /> : 'Takvime Diz'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default BulkScheduleModal;
