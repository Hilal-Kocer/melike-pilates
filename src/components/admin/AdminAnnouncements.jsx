import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Image as ImageIcon, Loader2, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import './AdminAnnouncements.css';

const AdminAnnouncements = () => {
  const { profile } = useAuth();
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [file, setFile] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  const fetchAnnouncements = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('announcements')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAnnouncements(data || []);
    } catch (err) {
      console.error('Duyurular yüklenirken hata:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;

    setIsSubmitting(true);
    try {
      let imageUrl = null;

      if (file) {
        // Upload image to Supabase Storage
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('announcements')
          .upload(filePath, file);

        if (uploadError) {
          throw new Error('Fotoğraf yüklenemedi. "announcements" adlı bucket oluşturulmamış olabilir. Hata: ' + uploadError.message);
        }

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
          .from('announcements')
          .getPublicUrl(filePath);
          
        imageUrl = publicUrl;
      }

      // Insert into database
      const { error: insertError } = await supabase
        .from('announcements')
        .insert({
          title: title.trim(),
          content: content.trim(),
          image_url: imageUrl,
          created_by: profile.id
        });

      if (insertError) throw insertError;

      // Reset form and refresh
      setTitle('');
      setContent('');
      setFile(null);
      setIsModalOpen(false);
      fetchAnnouncements();
      
    } catch (err) {
      console.error('Duyuru eklenirken hata:', err);
      alert(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Bu duyuruyu silmek istediğinize emin misiniz?')) return;

    try {
      const { error } = await supabase
        .from('announcements')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setAnnouncements(prev => prev.filter(a => a.id !== id));
    } catch (err) {
      console.error('Duyuru silinirken hata:', err);
      alert('Duyuru silinemedi!');
    }
  };

  if (loading) {
    return <div className="announcements-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <Loader2 className="animate-spin" size={40} color="#10b981" />
    </div>;
  }

  return (
    <div className="announcements-container">
      <div className="announcements-header">
        <h1>Duyuru Panosu Yönetimi</h1>
        <button className="add-btn" onClick={() => setIsModalOpen(true)}>
          <Plus size={20} />
          Yeni Duyuru Ekle
        </button>
      </div>

      {announcements.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b', background: 'white', borderRadius: '12px' }}>
          Henüz hiç duyuru eklenmemiş. Yeni bir etkinlik veya kampanya duyurusu ekleyerek üyelerinizi bilgilendirebilirsiniz.
        </div>
      ) : (
        <div className="announcements-grid">
          {announcements.map((announcement) => (
            <div key={announcement.id} className="announcement-card">
              {announcement.image_url ? (
                <img src={announcement.image_url} alt={announcement.title} className="announcement-image" />
              ) : (
                <div className="announcement-image-placeholder">
                  <ImageIcon size={40} opacity={0.5} />
                </div>
              )}
              <div className="announcement-content">
                <h3 className="announcement-title">{announcement.title}</h3>
                <span className="announcement-date">
                  {new Date(announcement.created_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
                </span>
                <p className="announcement-text">{announcement.content.substring(0, 100)}{announcement.content.length > 100 ? '...' : ''}</p>
                
                <div className="announcement-actions">
                  <button className="delete-btn" onClick={() => handleDelete(announcement.id)}>
                    <Trash2 size={16} />
                    Sil
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Yeni Duyuru Modalı */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Yeni Duyuru Ekle</h2>
              <button className="close-btn" onClick={() => setIsModalOpen(false)}>
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Başlık</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Örn: 29 Ekim Özel Pilates Etkinliği"
                  required
                />
              </div>

              <div className="form-group">
                <label>Duyuru İçeriği</label>
                <textarea 
                  className="form-textarea" 
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Duyuru metnini buraya yazın..."
                  required
                />
              </div>

              <div className="form-group">
                <label>Fotoğraf (İsteğe Bağlı)</label>
                <input 
                  type="file" 
                  className="file-input" 
                  accept="image/jpeg, image/png, image/webp"
                  onChange={handleFileChange}
                />
              </div>

              <div className="modal-actions">
                <button type="button" className="cancel-btn" onClick={() => setIsModalOpen(false)}>
                  İptal
                </button>
                <button type="submit" className="save-btn" disabled={isSubmitting || !title.trim() || !content.trim()}>
                  {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : 'Duyuruyu Yayınla'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminAnnouncements;
