import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { ChevronRight, ChevronLeft, Calendar } from 'lucide-react';
import './DashboardAnnouncements.css';

const DashboardAnnouncements = () => {
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  const fetchAnnouncements = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('announcements')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5); // Son 5 duyuruyu göster

      if (error) throw error;
      setAnnouncements(data || []);
    } catch (err) {
      console.error('Duyurular yüklenirken hata:', err);
    } finally {
      setLoading(false);
    }
  };

  const nextSlide = () => {
    setCurrentIndex((prevIndex) => 
      prevIndex === announcements.length - 1 ? 0 : prevIndex + 1
    );
  };

  const prevSlide = () => {
    setCurrentIndex((prevIndex) => 
      prevIndex === 0 ? announcements.length - 1 : prevIndex - 1
    );
  };

  // Otomatik kaydırma (opsiyonel)
  useEffect(() => {
    if (announcements.length <= 1) return;
    const interval = setInterval(() => {
      nextSlide();
    }, 5000);
    return () => clearInterval(interval);
  }, [announcements.length, currentIndex]);

  if (loading || announcements.length === 0) return null;

  const currentAnnouncement = announcements[currentIndex];

  return (
    <div className="dashboard-announcements">
      <div className="announcement-slider">
        
        {/* Sol ok (birden fazla duyuru varsa) */}
        {announcements.length > 1 && (
          <button className="slider-btn prev-btn" onClick={prevSlide}>
            <ChevronLeft size={24} />
          </button>
        )}

        <div className="announcement-slide-content">
          {currentAnnouncement.image_url && (
            <div className="announcement-slide-image">
              <img src={currentAnnouncement.image_url} alt={currentAnnouncement.title} />
            </div>
          )}
          <div className="announcement-slide-text">
            <span className="announcement-badge">YENİ DUYURU</span>
            <h3>{currentAnnouncement.title}</h3>
            <p>{currentAnnouncement.content}</p>
            <div className="announcement-meta">
              <Calendar size={14} />
              {new Date(currentAnnouncement.created_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })}
            </div>
          </div>
        </div>

        {/* Sağ ok (birden fazla duyuru varsa) */}
        {announcements.length > 1 && (
          <button className="slider-btn next-btn" onClick={nextSlide}>
            <ChevronRight size={24} />
          </button>
        )}

        {/* Dots */}
        {announcements.length > 1 && (
          <div className="slider-dots">
            {announcements.map((_, index) => (
              <span 
                key={index} 
                className={`dot ${index === currentIndex ? 'active' : ''}`}
                onClick={() => setCurrentIndex(index)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default DashboardAnnouncements;
