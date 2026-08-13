import React, { useEffect, useState } from 'react';
import { Search, Plus, MoreHorizontal, Filter, ListFilter, X, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import './MembersList.css';

const MembersList = () => {
  const { profile } = useAuth();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('Hepsi');
  const [sortType, setSortType] = useState('newest');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState(null);
  
  // Form State
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [selectedPackage, setSelectedPackage] = useState('8');
  const [price, setPrice] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('paid');
  const [nextPaymentDate, setNextPaymentDate] = useState('');

  // Action Menu States
  const [activeDropdownId, setActiveDropdownId] = useState(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  useEffect(() => {
    fetchMembers();
  }, []);

  const fetchMembers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select(`
          id,
          full_name,
          phone,
          created_at,
          packages (
            id,
            total_sessions,
            used_sessions,
            status,
            created_at
          ),
          payments (
            id,
            payment_date,
            status
          )
        `)
        .eq('role', 'member')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch attendance to calculate makeup balance
      const { data: attendanceData, error: attendanceError } = await supabase
        .from('attendance')
        .select('profile_id, package_id, status, is_makeup, notes, is_telafi');

      if (attendanceError) throw attendanceError;

      // İş mantığı ile veriyi düzenle
      const formattedMembers = data.map(member => {
        // En güncel paketi bul (created_at'e göre)
        const sortedPackages = member.packages?.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        const activePackage = sortedPackages?.[0] || null;

        // Son ödemeyi bul (sadece ödenmiş olanlar)
        const paidPayments = member.payments?.filter(p => p.status === 'paid').sort((a, b) => new Date(b.payment_date) - new Date(a.payment_date));
        const lastPayment = paidPayments?.[0] || null;

        let statusText = 'Yok';
        let statusColor = 'gray';
        
        if (activePackage) {
          if (activePackage.status === 'active') {
            statusText = 'Aktif';
            statusColor = 'success';
          } else if (activePackage.status === 'completed' || activePackage.status === 'expired') {
            statusText = 'Dolmuş';
            statusColor = 'danger';
          } else if (activePackage.status === 'frozen') { // Opsiyonel
            statusText = 'Dondurulmuş';
            statusColor = 'warning';
          }
        }

        const remainingSessions = activePackage ? activePackage.total_sessions - activePackage.used_sessions : 0;
        const totalSessions = activePackage ? activePackage.total_sessions : 0;
        const progressPercentage = totalSessions > 0 ? (remainingSessions / totalSessions) * 100 : 0;

        // İsmin baş harflerini al
        const initials = member.full_name?.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'ÜY';

        // Calculate makeup balance
        const memberAtts = attendanceData?.filter(att => att.profile_id === member.id) || [];
        const earnedMakeups = memberAtts.filter(att => att.status === 'compensation').length;
        const usedMakeups = memberAtts.filter(att => att.is_makeup === true && !(att.status === 'cancelled' && att.notes === 'Üye İptali / Erken İptal')).length;
        const makeupBalance = Math.max(0, earnedMakeups - usedMakeups);

        const activePackageIds = (member.packages || []).filter(p => p.status === 'active').map(p => p.id);
        const activeAtts = memberAtts.filter(att => activePackageIds.includes(att.package_id));
        const earlyCancels = activeAtts.filter(att => !att.is_telafi && att.status === 'cancelled' && att.notes === 'Üye İptali / Erken İptal').length;
        const usedTelafis = activeAtts.filter(att => att.is_telafi === true && !(att.status === 'cancelled' && att.notes === 'Üye İptali / Erken İptal')).length;
        const telafiBalance = Math.max(0, earlyCancels - usedTelafis);

        return {
          id: member.id,
          name: member.full_name,
          initials,
          packageText: activePackage ? `${activePackage.total_sessions} Seans Paket` : 'Paket Yok',
          remainingSessions,
          totalSessions,
          progressPercentage,
          lastPaymentDate: lastPayment ? new Date(lastPayment.payment_date).toLocaleDateString('tr-TR') : '-',
          statusText,
          statusColor,
          makeupBalance,
          telafiBalance,
          rawMember: member // raw data kept for dropdown if needed
        };
      });

      setMembers(formattedMembers);
    } catch (error) {
      console.error('Error fetching members:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!event.target.closest('.actions-cell')) {
        setActiveDropdownId(null);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const openAction = (action, member) => {
    setSelectedMember(member);
    setActiveDropdownId(null);
    if (action === 'edit') {
      setEditName(member.name);
      setEditPhone(member.rawMember?.phone || '');
      setIsEditModalOpen(true);
    } else if (action === 'delete') {
      setIsDeleteModalOpen(true);
    } else if (action === 'details') {
      setIsDetailsModalOpen(true);
    } else if (action === 'package') {
      setSelectedMemberId(member.id);
      setIsModalOpen(true);
    }
  };

  const handleEditMember = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setModalError(null);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .update({ full_name: editName, phone: editPhone })
        .eq('id', selectedMember.id)
        .select()
        .single();
        
      if (error) throw error;
      
      setIsEditModalOpen(false);
      fetchMembers();
    } catch (err) {
      setModalError('Güncelleme hatası (Supabase RLS Yetkisi Eksik): ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteMember = async () => {
    setIsSubmitting(true);
    setModalError(null);
    try {
      // Doğrudan Supabase RPC fonksiyonunu çağırarak auth.users tablosundan siler
      const { error } = await supabase.rpc('delete_user', {
        target_user_id: selectedMember.id
      });
        
      if (error) throw error;
      
      setIsDeleteModalOpen(false);
      fetchMembers();
    } catch (err) {
      setModalError('Üye silme hatası (Supabase RPC yetkisi veya fonksiyonu eksik olabilir): ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeletePackage = async (packageId) => {
    if (!window.confirm('Bu paketi silmek istediğinize emin misiniz? (Paketle ilişkili ders kayıtları varsa onlar da silinebilir)')) return;
    
    try {
      const { error } = await supabase
        .from('packages')
        .delete()
        .eq('id', packageId);
        
      if (error) throw error;
      
      setSelectedMember(prev => ({
        ...prev,
        rawMember: {
          ...prev.rawMember,
          packages: prev.rawMember.packages.filter(p => p.id !== packageId)
        }
      }));
      
      fetchMembers();
    } catch (err) {
      alert('Paket silinirken hata oluştu: ' + err.message);
    }
  };

  const handleAssignPackage = async (e) => {
    e.preventDefault();
    if (!selectedMemberId || !price) {
      setModalError('Lütfen tüm alanları doldurun.');
      return;
    }

    setIsSubmitting(true);
    setModalError(null);

    try {
      // 1. Paket ekle
      const { data: packageData, error: packageError } = await supabase
        .from('packages')
        .insert({
          profile_id: selectedMemberId,
          total_sessions: parseInt(selectedPackage),
          used_sessions: 0,
          status: 'active'
        })
        .select()
        .single();

      if (packageError) throw packageError;

      // 2. Ödeme ekle
      const { error: paymentError } = await supabase
        .from('payments')
        .insert({
          profile_id: selectedMemberId,
          package_id: packageData.id,
          amount: parseFloat(price),
          status: paymentStatus,
          payment_date: paymentStatus === 'paid' ? new Date().toISOString() : null,
          next_payment_date: paymentStatus === 'pending' && nextPaymentDate ? nextPaymentDate : null
        });

      if (paymentError) throw paymentError;

      // Başarılı
      setIsModalOpen(false);
      setSelectedMemberId('');
      setPrice('');
      setNextPaymentDate('');
      fetchMembers(); // Listeyi güncelle

    } catch (err) {
      setModalError('İşlem sırasında bir hata oluştu: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filtreleme
  const filteredMembers = members.filter(member => {
    const searchLower = (searchTerm || '').toLowerCase();
    const nameMatch = (member.name || '').toLowerCase().includes(searchLower);
    const packageMatch = (member.packageText || '').toLowerCase().includes(searchLower);
    const matchesSearch = nameMatch || packageMatch;
    
    const matchesStatus = statusFilter === 'Hepsi' || member.statusText === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Sıralama
  const sortedMembers = [...filteredMembers].sort((a, b) => {
    switch (sortType) {
      case 'nameAsc':
        return (a.name || '').localeCompare(b.name || '');
      case 'nameDesc':
        return (b.name || '').localeCompare(a.name || '');
      case 'sessionsAsc':
        return a.remainingSessions - b.remainingSessions;
      case 'sessionsDesc':
        return b.remainingSessions - a.remainingSessions;
      case 'newest':
      default:
        return new Date(b.rawMember?.created_at || 0) - new Date(a.rawMember?.created_at || 0);
    }
  });

  return (
    <div className="members-list-container">
      {/* Header */}
      <header className="members-header">
        <h1>Üye Yönetimi</h1>
        <div className="header-right">
          <button 
            className="btn-primary add-member-btn" 
            onClick={() => setIsModalOpen(true)}
          >
            <Plus size={18} />
            <span>Yeni Paket Ekle</span>
          </button>
          <div className="admin-profile-summary">
            <div className="admin-info">
              <span className="admin-name">{profile?.full_name || 'Admin Kullanıcı'}</span>
              <span className="admin-title">{profile?.role === 'trainer' ? 'Eğitmen' : 'Stüdyo Sahibi'}</span>
            </div>
            <div className="admin-avatar">
              {profile?.full_name?.charAt(0) || 'A'}
            </div>
          </div>
        </div>
      </header>

      {/* Toolbar */}
      <div className="members-toolbar">
        <div className="search-box">
          <Search size={18} className="search-icon" />
          <input 
            type="text" 
            placeholder="İsim veya paket ara..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="filters">
          <div className="status-dropdown">
            <span>Durum:</span>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="Hepsi">Hepsi</option>
              <option value="Aktif">Aktif</option>
              <option value="Dolmuş">Dolmuş</option>
            </select>
          </div>
          <div className="status-dropdown">
            <span>Sırala:</span>
            <select value={sortType} onChange={(e) => setSortType(e.target.value)}>
              <option value="newest">Kayıt (Yeni - Eski)</option>
              <option value="nameAsc">İsim (A - Z)</option>
              <option value="nameDesc">İsim (Z - A)</option>
              <option value="sessionsAsc">Kalan Seans (En Az)</option>
              <option value="sessionsDesc">Kalan Seans (En Çok)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="table-wrapper">
        <table className="members-table">
          <thead>
            <tr>
              <th>İSİM</th>
              <th>PAKET</th>
              <th>KALAN SEANS</th>
              <th>SON ÖDEME</th>
              <th>DURUM</th>
              <th>İŞLEM</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="6" className="loading-cell">Yükleniyor...</td></tr>
            ) : sortedMembers.length === 0 ? (
              <tr><td colSpan="6" className="empty-cell">Sonuç bulunamadı.</td></tr>
            ) : (
              sortedMembers.map(member => (
                <tr key={member.id}>
                  <td data-label="İSİM">
                    <div className="member-name-cell">
                      <div className={`member-avatar color-${(member.name.length % 5) + 1}`}>
                        {member.initials}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span className="member-fullname">{member.name}</span>
                        {member.makeupBalance > 0 && (
                          <span style={{ backgroundColor: '#fef2f2', color: '#ef4444', fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', fontWeight: '700', width: 'fit-content' }}>
                            {member.makeupBalance} İnisiyatif Bekliyor
                          </span>
                        )}
                        {member.telafiBalance > 0 && (
                          <span style={{ backgroundColor: '#e0f2fe', color: '#0284c7', fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', fontWeight: '700', width: 'fit-content' }}>
                            {member.telafiBalance} Telafi Bekliyor
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td data-label="PAKET" className="package-text">{member.packageText}</td>
                  <td data-label="KALAN SEANS">
                    <div className="sessions-progress-wrapper">
                      <div className="progress-track">
                        <div 
                          className={`progress-bar-fill ${member.statusColor}`} 
                          style={{ width: `${member.progressPercentage}%` }}
                        ></div>
                      </div>
                      <span className="sessions-text">
                        {member.remainingSessions}/{member.totalSessions}
                      </span>
                    </div>
                  </td>
                  <td data-label="SON ÖDEME" className="date-text">{member.lastPaymentDate}</td>
                  <td data-label="DURUM">
                    <span className={`status-badge ${member.statusColor}`}>
                      {member.statusText}
                    </span>
                  </td>
                  <td data-label="İŞLEM" className="actions-cell" style={{ position: 'relative' }}>
                    <button 
                      className="action-menu-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveDropdownId(activeDropdownId === member.id ? null : member.id);
                      }}
                    >
                      <MoreHorizontal size={18} />
                    </button>
                    {activeDropdownId === member.id && (
                      <div className="action-dropdown">
                        <button onClick={() => openAction('details', member)}>Detayları Gör</button>
                        <button onClick={() => openAction('edit', member)}>Profili Düzenle</button>
                        <button onClick={() => openAction('package', member)}>Yeni Paket Tanımla</button>
                        <div className="dropdown-divider"></div>
                        <button onClick={() => openAction('delete', member)} className="delete-action">Üyeyi Sil</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="pagination-footer">
        <span className="showing-text">
          1-{sortedMembers.length} of {members.length} üyeden gösteriliyor
        </span>
        <div className="pagination-controls">
          <button className="page-btn disabled">&lt;</button>
          <button className="page-btn active">1</button>
          <button className="page-btn">2</button>
          <button className="page-btn">3</button>
          <button className="page-btn">&gt;</button>
        </div>
      </div>

      {/* Package Assignment Modal */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Yeni Kayıt / Paket Ekle</h2>
              <button className="close-modal-btn" onClick={() => setIsModalOpen(false)}>
                <X size={24} />
              </button>
            </div>
            
            <form onSubmit={handleAssignPackage} className="modal-form">
              {modalError && <div className="modal-error">{modalError}</div>}
              
              <div className="form-group">
                <label>Üye Seçimi</label>
                <select 
                  value={selectedMemberId} 
                  onChange={(e) => setSelectedMemberId(e.target.value)}
                  required
                >
                  <option value="">-- Üye Seçin --</option>
                  {members.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Paket Tipi</label>
                <select 
                  value={selectedPackage} 
                  onChange={(e) => setSelectedPackage(e.target.value)}
                >
                  <option value="8">8 Seans Paket</option>
                  <option value="12">12 Seans Paket</option>
                </select>
              </div>

              <div className="form-group">
                <label>Tutar (₺)</label>
                <input 
                  type="number" 
                  placeholder="Örn: 1500" 
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  required
                  min="0"
                />
              </div>

              <div className="form-group">
                <label>Ödeme Durumu</label>
                <select 
                  value={paymentStatus} 
                  onChange={(e) => setPaymentStatus(e.target.value)}
                >
                  <option value="paid">Ödendi (Nakit/Kredi Kartı)</option>
                  <option value="pending">Bekliyor (Sonra Ödeyecek)</option>
                </select>
              </div>

              {paymentStatus === 'pending' && (
                <div className="form-group">
                  <label>Son Ödeme Tarihi</label>
                  <input 
                    type="date"
                    value={nextPaymentDate}
                    onChange={(e) => setNextPaymentDate(e.target.value)}
                    required
                  />
                </div>
              )}

              <div className="modal-actions">
                <button 
                  type="button" 
                  className="btn-secondary"
                  onClick={() => setIsModalOpen(false)}
                >
                  İptal
                </button>
                <button type="submit" className="btn-primary" disabled={isSubmitting}>
                  {isSubmitting ? <Loader2 className="animate-spin" size={18} /> : 'Kaydet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Profile Modal */}
      {isEditModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Profili Düzenle</h2>
              <button className="close-modal-btn" onClick={() => setIsEditModalOpen(false)}><X size={24} /></button>
            </div>
            <form onSubmit={handleEditMember} className="modal-form">
              {modalError && <div className="modal-error">{modalError}</div>}
              <div className="form-group">
                <label>Ad Soyad</label>
                <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} required />
              </div>
              <div className="form-group">
                <label>Telefon</label>
                <input type="text" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} placeholder="05XX XXX XX XX" />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setIsEditModalOpen(false)}>İptal</button>
                <button type="submit" className="btn-primary" disabled={isSubmitting}>
                  {isSubmitting ? <Loader2 className="animate-spin" size={18} /> : 'Kaydet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <h2>Üyeyi Sil</h2>
              <button className="close-modal-btn" onClick={() => setIsDeleteModalOpen(false)}><X size={24} /></button>
            </div>
            <div className="modal-body" style={{ padding: '20px', textAlign: 'center' }}>
              {modalError && <div className="modal-error" style={{ marginBottom: '15px' }}>{modalError}</div>}
              <p style={{ marginBottom: '10px', fontSize: '1rem', color: '#1e293b' }}>
                <strong>{selectedMember?.name}</strong> isimli üyeyi ve geçmiş tüm verilerini sistemden kalıcı olarak silmek istediğinize emin misiniz?
              </p>
              <p style={{ color: '#ef4444', fontSize: '0.875rem', fontWeight: '500' }}>Bu işlem geri alınamaz!</p>
            </div>
            <div className="modal-actions" style={{ padding: '20px', borderTop: '1px solid #f1f5f9' }}>
              <button type="button" className="btn-secondary" onClick={() => setIsDeleteModalOpen(false)}>İptal</button>
              <button type="button" className="btn-primary" style={{ backgroundColor: '#ef4444' }} onClick={handleDeleteMember} disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="animate-spin" size={18} /> : 'Evet, Üyeyi Sil'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Details Modal */}
      {isDetailsModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '450px' }}>
            <div className="modal-header">
              <h2>Üye Detayları</h2>
              <button className="close-modal-btn" onClick={() => setIsDetailsModalOpen(false)}><X size={24} /></button>
            </div>
            <div className="modal-body" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
                <div className={`member-avatar color-${(selectedMember?.name?.length % 5) + 1 || 1}`} style={{ width: '56px', height: '56px', fontSize: '1.25rem' }}>
                  {selectedMember?.initials}
                </div>
                <div>
                  <h3 style={{ margin: 0, color: '#0f172a', fontSize: '1.125rem' }}>{selectedMember?.name}</h3>
                  <div style={{ color: '#64748b', fontSize: '0.875rem', marginTop: '4px' }}>{selectedMember?.rawMember?.phone || 'Telefon Kayıtlı Değil'}</div>
                </div>
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                <div style={{ backgroundColor: '#f8fafc', padding: '12px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '4px', fontWeight: '600', textTransform: 'uppercase' }}>Durum</div>
                  <span className={`status-badge ${selectedMember?.statusColor}`} style={{ margin: 0 }}>{selectedMember?.statusText}</span>
                </div>
                <div style={{ backgroundColor: '#f8fafc', padding: '12px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '4px', fontWeight: '600', textTransform: 'uppercase' }}>Paket</div>
                  <div style={{ color: '#0f172a', fontWeight: '500' }}>{selectedMember?.packageText}</div>
                </div>
                <div style={{ backgroundColor: '#f8fafc', padding: '12px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '4px', fontWeight: '600', textTransform: 'uppercase' }}>Kalan Seans</div>
                  <div style={{ color: '#0f172a', fontWeight: '500' }}>{selectedMember?.remainingSessions} / {selectedMember?.totalSessions}</div>
                </div>
                <div style={{ backgroundColor: '#f8fafc', padding: '12px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '4px', fontWeight: '600', textTransform: 'uppercase' }}>Son Ödeme</div>
                  <div style={{ color: '#0f172a', fontWeight: '500' }}>{selectedMember?.lastPaymentDate}</div>
                </div>
              </div>

              {(selectedMember?.makeupBalance > 0 || selectedMember?.telafiBalance > 0) && (
                <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fee2e2', padding: '12px', borderRadius: '8px', marginBottom: '16px' }}>
                  <h4 style={{ margin: '0 0 8px 0', color: '#991b1b', fontSize: '0.875rem' }}>Bekleyen Haklar</h4>
                  {selectedMember?.makeupBalance > 0 && <div style={{ color: '#ef4444', fontSize: '0.875rem', marginBottom: '4px' }}>• {selectedMember?.makeupBalance} Adet İnisiyatif Kullanımı Bekliyor</div>}
                  {selectedMember?.telafiBalance > 0 && <div style={{ color: '#0284c7', fontSize: '0.875rem' }}>• {selectedMember?.telafiBalance} Adet Telafi Dersi Bekliyor</div>}
                </div>
              )}

              {selectedMember?.rawMember?.packages?.length > 0 && (
                <div style={{ marginTop: '24px' }}>
                  <h4 style={{ margin: '0 0 12px 0', color: '#0f172a', fontSize: '1rem' }}>Tanımlı Paketler</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {selectedMember.rawMember.packages.map(pkg => (
                      <div key={pkg.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                        <div>
                          <div style={{ fontWeight: '500', color: '#0f172a', fontSize: '0.875rem' }}>{pkg.total_sessions} Seanslık Paket</div>
                          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
                            Kullanılan: {pkg.used_sessions} / {pkg.total_sessions} 
                            {pkg.status === 'active' ? ' (Aktif)' : ' (Bitmiş)'}
                          </div>
                        </div>
                        <button 
                          onClick={() => handleDeletePackage(pkg.id)}
                          style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer', padding: '4px 8px', borderRadius: '4px' }}
                          onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#fef2f2'}
                          onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                          Sil
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="modal-actions" style={{ padding: '20px', borderTop: '1px solid #f1f5f9' }}>
              <button type="button" className="btn-secondary" onClick={() => setIsDetailsModalOpen(false)}>Kapat</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MembersList;
