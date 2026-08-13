import React, { useState, useEffect } from 'react';
import { Leaf, Eye, EyeOff, Loader2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import './Login.css';
import bgImage from '../assets/login-bg.jpeg';

const Login = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expandedSection, setExpandedSection] = useState(null);

  const toggleSection = (section) => {
    setExpandedSection(prev => prev === section ? null : section);
  };
  const { user, profile, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  // Redirect after user is fully loaded
  useEffect(() => {
    if (!authLoading && user) {
      if (profile) {
        if (profile.role === 'admin' || profile.role === 'trainer') {
          navigate('/admin', { replace: true });
        } else {
          navigate('/dashboard', { replace: true });
        }
      } else {
        // If user is loaded but profile is null, there's a real issue.
        // But let's set a small timeout before showing the error to avoid flashing during race conditions.
        const timer = setTimeout(() => {
          if (!profile) {
            setError('Profil bilgileriniz yüklenemedi. Veritabanı yapılandırmanızı kontrol edin.');
          }
        }, 1500);
        return () => clearTimeout(timer);
      }
    }
  }, [user, profile, authLoading, navigate]);

  if (authLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-gray-50">
        <Loader2 className="animate-spin text-emerald-500" size={48} />
      </div>
    );
  }

  // If we have user but waiting for redirect, don't show the login form
  if (user && profile) {
    return null; 
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      console.log('Login: Attempting signInWithPassword...');
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      console.log('Login: signInWithPassword response received', { hasUser: !!data.user, error: authError });

      if (authError) throw authError;

      if (data.user) {
        console.log('Login: Success logged in Login component');
      }
    } catch (err) {
      console.error('Login: Error caught in handleSubmit:', err);
      setError(err.message);
    } finally {
      console.log('Login: Setting loading false');
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-left" style={{ backgroundImage: `url(${bgImage})` }}>
        <div className="overlay"></div>

      </div>
      
      <div className="login-right">
        <div className="login-form-wrapper">
          <div className="logo-section">
            <div className="logo-icon">
              <Leaf size={32} color="#10b981" fill="#10b981" />
            </div>
            <span className="logo-text">Me-Like Pilates</span>
          </div>

          <h1 className="welcome-title">Hoş Geldiniz</h1>
          <p className="welcome-subtitle">
            Pilates yolculuğunuza devam etmek için giriş yapın.
          </p>

          {error && <div className="error-alert">{error}</div>}

          <form className="login-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input
                type="email"
                id="email"
                placeholder="adiniz@ornek.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <div className="label-row">
                <label htmlFor="password">Şifre</label>
                <Link to="/forgot-password" size={16} className="forgot-link">Şifremi Unuttum</Link>
              </div>
              <div className="password-input-wrapper">
                <input
                  type={showPassword ? "text" : "password"}
                  id="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="toggle-password"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            <div className="form-options">
              <label className="checkbox-container">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                Beni Hatırla
              </label>
            </div>

            <button type="submit" className="login-button" disabled={loading}>
              {loading ? <Loader2 className="animate-spin" size={20} /> : 'Giriş Yap'}
            </button>
          </form>

          <p className="register-text">
            Henüz bir hesabınız yok mu? <Link to="/register">Kayıt Ol</Link>
          </p>

          <div className="footer-section">
            <footer className="login-footer">
              <a href="#lessons" onClick={(e) => { e.preventDefault(); toggleSection('lessons'); }} className={expandedSection === 'lessons' ? 'active-link' : ''}>Dersler</a>
              <a href="#trainers" onClick={(e) => { e.preventDefault(); toggleSection('trainers'); }} className={expandedSection === 'trainers' ? 'active-link' : ''}>Eğitmenler</a>
              <a href="#about" onClick={(e) => { e.preventDefault(); toggleSection('about'); }} className={expandedSection === 'about' ? 'active-link' : ''}>Hakkımızda</a>
            </footer>
            
            <div className={`lessons-tags-container ${expandedSection === 'lessons' ? 'show' : ''}`}>
              <span className="lesson-tag">Reformer Pilates</span>
              <span className="lesson-tag">Mat Pilates</span>
              <span className="lesson-tag">Hamile Pilates</span>
            </div>

            <div className={`lessons-tags-container ${expandedSection === 'trainers' ? 'show' : ''}`}>
              <span className="lesson-tag">Eğitmen 1</span>
              <span className="lesson-tag">Eğitmen 2</span>
              <span className="lesson-tag">Eğitmen 3</span>
            </div>

            <div className={`lessons-tags-container ${expandedSection === 'about' ? 'show' : ''}`}>
              <p className="about-text">
                Me-Like Pilates; bedeninizi ve zihninizi güçlendirip dengeye kavuşturmak için profesyonel eğitmenler eşliğinde, size en uygun butik pilates deneyimini sunar. Sağlıklı bir yaşam için ilk adımı bizimle atın.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
