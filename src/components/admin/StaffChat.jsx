import React, { useState, useEffect, useRef } from 'react';
import { MessageCircle, X, Send, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import './StaffChat.css';

const StaffChat = () => {
  const { profile } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);

  const messagesEndRef = useRef(null);
  
  const notificationSound = useRef(
    typeof Audio !== 'undefined' 
      ? new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3') 
      : null
  );

  const isOpenRef = useRef(isOpen);

  useEffect(() => {
    isOpenRef.current = isOpen;
    if (isOpen) {
      setHasUnread(false);
      localStorage.setItem('staffChatLastRead', new Date().toISOString());
      scrollToBottom();
    }
  }, [isOpen]);

  const canViewChat = profile?.role === 'admin' || profile?.role === 'trainer';

  const fetchMessages = async () => {
    try {
      const { data, error } = await supabase
        .from('staff_messages')
        .select(`
          id,
          message,
          created_at,
          sender_id,
          profiles (full_name)
        `)
        .order('created_at', { ascending: true })
        .limit(100);

      if (error) throw error;
      setMessages(data || []);
      
      // İlk yüklemede okunmamış var mı kontrol et
      if (data && data.length > 0) {
        const lastMsg = data[data.length - 1];
        const lastRead = localStorage.getItem('staffChatLastRead');
        
        if (lastMsg.sender_id !== profile?.id) {
          if (!lastRead || new Date(lastMsg.created_at) > new Date(lastRead)) {
            if (!isOpenRef.current) {
              setHasUnread(true);
            }
          }
        }
      }

      if (isOpenRef.current) scrollToBottom();
    } catch (err) {
      console.error('Mesajlar yüklenirken hata:', err);
    }
  };

  useEffect(() => {
    if (!canViewChat) return;

    fetchMessages();

    const channel = supabase
      .channel('staff_messages_channel')
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'staff_messages' 
      }, async (payload) => {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', payload.new.sender_id)
          .single();

        const newMsg = {
          ...payload.new,
          profiles: profileData
        };

        setMessages(prev => [...prev, newMsg]);
        
        if (isOpenRef.current) {
          localStorage.setItem('staffChatLastRead', new Date().toISOString());
          scrollToBottom();
        } else {
          if (payload.new.sender_id !== profile?.id) {
            setHasUnread(true);
            if (notificationSound.current) {
              notificationSound.current.play().catch(e => console.log('Ses çalınamadı:', e));
            }
          }
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [canViewChat, profile?.id]);

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !profile) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('staff_messages')
        .insert({
          sender_id: profile.id,
          message: newMessage.trim()
        });

      if (error) throw error;
      setNewMessage('');
      localStorage.setItem('staffChatLastRead', new Date().toISOString());
    } catch (err) {
      console.error('Mesaj gönderilemedi:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (dateStr) => {
    const d = new Date(dateStr);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

  if (!canViewChat) return null;

  return (
    <div className="staff-chat-widget">
      {isOpen && (
        <div className="chat-window">
          <div className="chat-header">
            <h3><MessageCircle size={18} /> Personel Sohbeti</h3>
            <button className="close-chat-btn" onClick={() => setIsOpen(false)}>
              <X size={20} />
            </button>
          </div>
          
          <div className="chat-messages">
            {messages.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#94a3b8', marginTop: '20px', fontSize: '0.875rem' }}>
                İlk mesajı siz gönderin!
              </div>
            ) : (
              messages.map(msg => {
                const isOwn = msg.sender_id === profile?.id;
                return (
                  <div key={msg.id} className={`message-bubble-wrapper ${isOwn ? 'own-message' : 'other-message'}`}>
                    {!isOwn && (
                      <span className="message-sender">{msg.profiles?.full_name || 'Personel'}</span>
                    )}
                    <div className="message-bubble">
                      {msg.message}
                      <span className="message-time">{formatTime(msg.created_at)}</span>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="chat-input-area">
            <form onSubmit={handleSendMessage} className="chat-form">
              <input
                type="text"
                className="chat-input"
                placeholder="Mesaj yazın..."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                maxLength={500}
              />
              <button type="submit" className="send-msg-btn" disabled={!newMessage.trim() || loading}>
                {loading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
              </button>
            </form>
          </div>
        </div>
      )}

      {!isOpen && (
        <button className="chat-toggle-btn" onClick={() => setIsOpen(true)}>
          <MessageCircle size={28} />
          {hasUnread && (
            <span className="unread-badge" style={{ zIndex: 999 }}>!</span>
          )}
        </button>
      )}
    </div>
  );
};

export default StaffChat;
