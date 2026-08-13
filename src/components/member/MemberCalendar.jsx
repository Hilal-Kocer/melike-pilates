import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Clock, User } from 'lucide-react';
import './MemberCalendar.css';

const getLocalDateString = (d = new Date()) => {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const DAYS_OF_WEEK = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

const MemberCalendar = ({ upcomingLessons, pastLessons }) => {
  const [currentDate, setCurrentDate] = useState(new Date());

  // Bütün dersleri birleştir ve tekilleştir
  const allLessons = Array.from(new Map([...upcomingLessons, ...pastLessons].map(item => [item.id, item])).values());

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const getDaysInMonth = (year, month) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (year, month) => {
    const day = new Date(year, month, 1).getDay();
    return day === 0 ? 6 : day - 1; // Pazartesi'yi 0 yap
  };

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);

  const monthName = currentDate.toLocaleDateString('tr-TR', { month: 'long' });

  const days = [];
  for (let i = 0; i < firstDay; i++) {
    days.push(null);
  }
  for (let i = 1; i <= daysInMonth; i++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
    days.push(dateStr);
  }

  const todayStr = getLocalDateString();

  return (
    <div className="member-calendar-container">
      <div className="calendar-header">
        <button className="nav-btn" onClick={prevMonth}><ChevronLeft size={20} /></button>
        <h2>{monthName} {year}</h2>
        <button className="nav-btn" onClick={nextMonth}><ChevronRight size={20} /></button>
      </div>

      <div className="calendar-grid">
        {DAYS_OF_WEEK.map((day, idx) => (
          <div key={idx} className="weekday-header">{day}</div>
        ))}
        
        {days.map((dateStr, idx) => {
          if (!dateStr) return <div key={`empty-${idx}`} className="calendar-day empty"></div>;
          
          const dayLessons = allLessons.filter(l => l.lesson_date === dateStr);
          const isToday = dateStr === todayStr;
          
          return (
            <div 
              key={dateStr} 
              className={`calendar-day ${isToday ? 'today' : ''}`}
            >
              <div className="day-number">{parseInt(dateStr.split('-')[2])}</div>
              
              <div className="day-lessons-container">
                {dayLessons.map((l, i) => {
                   let itemClass = 'upcoming'; 
                   const isCancelled = l.attendance_status === 'cancelled' || l.status === 'cancelled';
                   const isLateCancel = isCancelled && (l.attendance_notes === 'Üye İptali / Geç İptal' || l.attendance_notes === 'Geç iptal / Gelmedi');
                   const isNoShow = isCancelled && l.attendance_notes === 'Gelmedi';
                   
                   if (isCancelled) itemClass = 'cancelled';
                   else if (l.is_makeup) itemClass = 'makeup';
                   else if (l.lesson_date < todayStr) itemClass = 'past';
                   
                   return (
                     <div key={i} className={`inline-lesson-item ${itemClass}`}>
                       <div className="inline-time">{l.start_time?.substring(0, 5)}</div>
                       <div className="inline-name" style={{ whiteSpace: 'normal' }}>
                         <div style={{ fontWeight: 600 }}>
                           {l.name || "Grup Dersi"}
                           {l.is_makeup && !isCancelled && <span className="inline-makeup-badge">İnisiyatif</span>}
                         </div>
                         {isCancelled && (
                           <div style={{ fontSize: '0.65rem', fontWeight: 700, marginTop: '2px', opacity: 0.95 }}>
                             {isLateCancel ? "• Geç İptal" : isNoShow ? "• Gelmedi" : "• İptal Edildi"}
                           </div>
                         )}
                       </div>
                     </div>
                   );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MemberCalendar;
