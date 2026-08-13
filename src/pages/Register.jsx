import React, { useState } from 'react';
import { Leaf, Eye, EyeOff, User, Loader2 } from 'lucide-react';
import { useNavigate, Link } from 'react-router';
import { supabase } from '../lib/supabase';
import './Register.css';
import bgImage from '../assets/login-bg.jpeg';

const Register = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // 1. Sign up user with metadata
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
          }
        }
      });

      if (authError) throw authError;

      if (authData.user) {
        // Otomatik girişi iptal etmek için hemen çıkış yapıyoruz
        await supabase.auth.signOut();
        
        setSuccess(true);
        setError(null);
        // Reset form
        setFullName('');
        setEmail('');
        setPassword('');
        // Yönlendirmeyi kaldırdık, kullanıcı kendi linke tıklayacak
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container" style={{ backgroundImage: `url(${bgImage})` }}>
      <div className="auth-left">
        <div className="overlay"></div>
        <div className="quote-container">
          <p className="quote">
            "Kendine iyi bakmak, hayat kaliteni belirler. Bugün bir adım at."
          </p>
          <p className="quote-author">— Me-Like Pilates</p>
        </div>
      </div>
      
      <div className="auth-right">
        <div className="auth-form-wrapper">
          <div className="logo-section" onClick={() => navigate('/login')} style={{ cursor: 'pointer' }}>
            <div className="logo-icon">
              <Leaf size={32} color="#10b981" fill="#10b981" />
            </div>
            <span className="logo-text">Me-Like Pilates</span>
          </div>

          <h1 className="welcome-title">Kayıt Ol</h1>
          <p className="welcome-subtitle">
            Me-Like Pilates ailesine katılmak için bilgilerinizi girin.
          </p>

          {error && <div className="error-alert">{error}</div>}
          {success && (
            <div className="success-alert">
              Kaydınız başarıyla oluşturuldu! Aşağıdaki "Giriş Yap" bağlantısına tıklayarak giriş yapabilirsiniz.
            </div>
          )}

          <form className="auth-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="fullName">Ad Soyad</label>
              <div className="input-with-icon">
                <input
                  type="text"
                  id="fullName"
                  placeholder="Adınız Soyadınız"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>
            </div>

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
              <label htmlFor="password">Şifre</label>
              <div className="password-input-wrapper">
                <input
                  type={showPassword ? "text" : "password"}
                  id="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
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

            <button type="submit" className="auth-button" disabled={loading}>
              {loading ? <Loader2 className="animate-spin" size={20} /> : 'Hesap Oluştur'}
            </button>
          </form>

          <p className="footer-text">
            Zaten bir hesabınız var mı? <Link to="/login">Giriş Yap</Link>
          </p>

          <footer className="auth-footer">
             <a href="#privacy">Gizlilik Politikası</a>
             <a href="#terms">Kullanım Şartları</a>
          </footer>
        </div>
      </div>
    </div>
  );
};

export default Register;
