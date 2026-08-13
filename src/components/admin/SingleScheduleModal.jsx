import React, { useState, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

const getLocalDateString = (d = new Date()) => {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const LESSON_TYPES = [
  { id: 'reformer', name: 'Reformer Pilates', capacity: 7 },
  { id: 'mat', name: 'Mat Pilates', capacity: 15 },
  { id: 'fonksiyonel', name: 'Fonksiyonel', capacity: 15 },
  { id: 'kardiyo', name: 'Kardiyo', capacity: 15 }
];

const SingleScheduleModal = ({ isOpen, onClose, onSuccess }) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState(null);
  
  const [activePackages, setActivePackages] = useState([]);
  const [loadingPackages, setLoadingPackages] = useState(false);
  const [trainers, setTrainers] = useState([]);
  const [attendanceData, setAttendanceData] = useState([]);
  const [selectedPackages, setSelectedPackages] = useState([]);
  const [selectedTrainerId, setSelectedTrainerId] = useState('');
  const [selectedDate, setSelectedDate] = useState(getLocalDateString());
  const [startTime, setStartTime] = useState('19:00');
  const [selectedLessonType, setSelectedLessonType] = useState(LESSON_TYPES[0]);
  const [isMakeup, setIsMakeup] = useState(false);
  const [isTelafiModal, setIsTelafiModal] = useState(false);

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

  const handleCreateSingleSchedule = async (e) => {
    e.preventDefault();
    if (selectedPackages.length === 0 || !selectedDate || !startTime) {
      setModalError('Lütfen üye(ler), tarih ve saat seçiniz.');
      return;
    }

    setIsSubmitting(true);
    setModalError(null);

    try {
      const selectedProfileIds = selectedPackages.map(p => p.profile_id);
      
      const { data: existingConflict, error: conflictError } = await supabase
        .from('attendance')
        .select(`
          profile_id,
          status,
          profiles ( full_name ),
          lessons!inner ( lesson_date, start_time, status )
        `)
        .in('profile_id', selectedProfileIds)
        .eq('lessons.lesson_date', selectedDate)
        .neq('status', 'cancelled')
        .neq('lessons.status', 'cancelled');

      if (conflictError) throw conflictError;

      if (existingConflict && existingConflict.length > 0) {
        const conflictingMember = existingConflict.find(att => 
          att.lessons && att.lessons.start_time && att.lessons.start_time.substring(0, 5) === startTime.substring(0, 5)
        );
        if (conflictingMember) {
          const memberName = conflictingMember.profiles?.full_name || 'Seçilen üye';
          setModalError(`${memberName} isimli üyenin ${selectedDate} tarihinde saat ${startTime.substring(0,5)}'da zaten başka bir dersi bulunmaktadır!`);
          setIsSubmitting(false);
          return;
        }
      }

      const endTime = calculateEndTime(startTime);

      // Check if a lesson of the same type already exists at this date and time
      let targetLessonId;
      const { data: existingLessons, error: existingError } = await supabase
        .from('lessons')
        .select(`
          id, max_capacity,
          attendance ( id, status )
        `)
        .eq('lesson_date', selectedDate)
        .eq('start_time', startTime)
        .eq('name', selectedLessonType.name)
        .eq('status', 'active');

      if (existingError) throw existingError;

      if (existingLessons && existingLessons.length > 0) {
        const existingLesson = existingLessons[0];
        const activeAttendances = existingLesson.attendance.filter(a => a.status !== 'cancelled').length;
        
        if (activeAttendances + selectedPackages.length > existingLesson.max_capacity) {
          setModalError(`Bu saatteki ${selectedLessonType.name} dersinde sadece ${existingLesson.max_capacity - activeAttendances} kişilik boş yer var.`);
          setIsSubmitting(false);
          return;
        }
        targetLessonId = existingLesson.id;
      } else {
        const newLesson = {
          name: selectedLessonType.name,
          trainer_id: selectedTrainerId || null,
          lesson_date: selectedDate,
          start_time: startTime,
          end_time: endTime,
          max_capacity: selectedLessonType.capacity,
          status: 'active'
        };

        const { data: insertedLesson, error: insertError } = await supabase
          .from('lessons')
          .insert([newLesson])
          .select()
          .single();

        if (insertError) throw insertError;
        targetLessonId = insertedLesson.id;
      }

      const newAttendances = selectedPackages.map(pkg => {
        const memberAtts = attendanceData.filter(a => a.profile_id === pkg.profile_id);
        const earlyCancels = memberAtts.filter(a => !a.is_telafi && a.status === 'cancelled' && a.notes === 'Üye İptali / Erken İptal').length;
        const usedTelafis = memberAtts.filter(a => a.is_telafi === true && !(a.status === 'cancelled' && a.notes === 'Üye İptali / Erken İptal')).length;
        const shouldBeTelafi = earlyCancels > usedTelafis;

        return {
          lesson_id: targetLessonId,
          profile_id: pkg.profile_id,
          package_id: pkg.id,
          status: 'bekliyor',
          is_makeup: isMakeup,
          is_telafi: isTelafiModal || shouldBeTelafi
        };
      });

      const { error: attendanceError } = await supabase
        .from('attendance')
        .insert(newAttendances);

      if (attendanceError) throw attendanceError;

      // Başarılı
      setSelectedPackages([]);
      setSelectedTrainerId('');
      setSelectedLessonType(LESSON_TYPES[0]);
      setStartTime('19:00');
      setSelectedDate(getLocalDateString());
      setIsMakeup(false);
      setIsTelafiModal(false);
      
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
          <h2>Tek Randevu Ekle</h2>
          <button className="close-modal-btn" type="button" onClick={onClose}>
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleCreateSingleSchedule} className="modal-form">
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
                  
                  // Compute makeup balance for this member
                  const memberAtts = attendanceData.filter(att => att.profile_id === pkg.profile_id);
                  const earnedMakeups = memberAtts.filter(att => att.status === 'compensation').length;
                  const usedMakeups = memberAtts.filter(att => att.is_makeup === true && !(att.status === 'cancelled' && att.notes === 'Üye İptali / Erken İptal')).length;
                  const makeupBalance = Math.max(0, earnedMakeups - usedMakeups);
                  
                  const earlyCancels = memberAtts.filter(att => !att.is_telafi && att.status === 'cancelled' && att.notes === 'Üye İptali / Erken İptal').length;
                  const usedTelafis = memberAtts.filter(att => att.is_telafi === true && !(att.status === 'cancelled' && att.notes === 'Üye İptali / Erken İptal')).length;
                  const telafiBalance = Math.max(0, earlyCancels - usedTelafis);
                  
                  return (
                    <div key={pkg.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', backgroundColor: isSelected ? '#f8fafc' : 'white' }} onClick={() => togglePackageSelection(pkg)}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
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
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
                        {makeupBalance > 0 && (
                          <span style={{ backgroundColor: '#fef2f2', color: '#ef4444', fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', fontWeight: '700' }}>
                            {makeupBalance} İnisiyatif Hak.
                          </span>
                        )}
                        {telafiBalance > 0 && (
                          <span style={{ backgroundColor: '#e0f2fe', color: '#0284c7', fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', fontWeight: '700' }}>
                            {telafiBalance} Telafi Hak.
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            
            {/* Inisiyatif ve Telafi Dersi Checkboxları */}
            {selectedPackages.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.75rem' }}>
                <div style={{ padding: '0.75rem', backgroundColor: isMakeup ? '#ecfdf5' : '#f8fafc', border: isMakeup ? '1px solid #10b981' : '1px solid #e2e8f0', borderRadius: '0.5rem', display: 'flex', alignItems: 'flex-start', gap: '0.5rem', cursor: 'pointer' }} onClick={() => setIsMakeup(!isMakeup)}>
                  <input 
                    type="checkbox" 
                    checked={isMakeup}
                    readOnly
                    style={{ width: '16px', height: '16px', marginTop: '2px' }}
                  />
                  <div>
                    <div style={{ fontSize: '0.875rem', fontWeight: '600', color: isMakeup ? '#10b981' : '#334155' }}>Bu bir İnisiyatif Dersidir</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
                      İşaretlerseniz, takvimde inisiyatif dersi olarak görünür.
                    </div>
                  </div>
                </div>

                <div style={{ padding: '0.75rem', backgroundColor: isTelafiModal ? '#e0f2fe' : '#f8fafc', border: isTelafiModal ? '1px solid #0284c7' : '1px solid #e2e8f0', borderRadius: '0.5rem', display: 'flex', alignItems: 'flex-start', gap: '0.5rem', cursor: 'pointer' }} onClick={() => setIsTelafiModal(!isTelafiModal)}>
                  <input 
                    type="checkbox" 
                    checked={isTelafiModal}
                    readOnly
                    style={{ width: '16px', height: '16px', marginTop: '2px' }}
                  />
                  <div>
                    <div style={{ fontSize: '0.875rem', fontWeight: '600', color: isTelafiModal ? '#0284c7' : '#334155' }}>Bu bir Telafi Dersidir</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
                      İşaretlerseniz, takvimde telafi dersi olarak görünür. (Sistem hakları olan üyeler için bunu zaten otomatik yapar).
                    </div>
                  </div>
                </div>
              </div>
            )}
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
                // Eğer seçilen üye sayısı yeni kapasiteden büyükse üyeleri sıfırla
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
            <label>Tarih</label>
            <input 
              type="date" 
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              required
            />
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
            <button type="submit" className="btn-primary" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="animate-spin" size={18} /> : 'Takvime Ekle'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SingleScheduleModal;
