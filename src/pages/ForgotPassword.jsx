import React, { useState } from 'react';
import { Leaf, ArrowLeft, Mail, Loader2 } from 'lucide-react';
import { useNavigate, Link } from 'react-router';
import { supabase } from '../lib/supabase';
import './ForgotPassword.css';
import bgImage from '../assets/login-bg.jpeg';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (resetError) throw resetError;

      setIsSubmitted(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-left" style={{ backgroundImage: `url(${bgImage})` }}>
        <div className="overlay"></div>
        <div className="quote-container">
          <p className="quote">
            "Zihnini serbest bırak, bedenine güven. Her şey bir nefesle başlar."
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

          {!isSubmitted ? (
            <>
              <h1 className="welcome-title">Şifremi Unuttum</h1>
              <p className="welcome-subtitle">
                Email adresinizi girin, size şifre sıfırlama bağlantısı gönderelim.
              </p>

              {error && <div className="error-alert">{error}</div>}

              <form className="auth-form" onSubmit={handleSubmit}>
                <div className="form-group">
                  <label htmlFor="email">Email Adresi</label>
                  <input
                    type="email"
                    id="email"
                    placeholder="adiniz@ornek.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>

                <button type="submit" className="auth-button" disabled={loading}>
                  {loading ? <Loader2 className="animate-spin" size={20} /> : 'Sıfırlama Bağlantısı Gönder'}
                </button>
              </form>
            </>
          ) : (
            <div className="success-message">
              <div className="success-icon">
                <Mail size={48} color="#10b981" />
              </div>
              <h2 className="welcome-title">Bağlantı Gönderildi</h2>
              <p className="welcome-subtitle">
                <strong>{email}</strong> adresine şifre sıfırlama talimatlarını içeren bir e-posta gönderdik. Lütfen kutunuzu kontrol edin.
              </p>
              <button 
                className="auth-button secondary"
                onClick={() => setIsSubmitted(false)}
              >
                Yeniden Dene
              </button>
            </div>
          )}

          <div className="back-to-login">
            <Link to="/login" className="back-link">
              <ArrowLeft size={18} />
              Giriş Sayfasına Dön
            </Link>
          </div>

          <footer className="auth-footer">
             <a href="#help">Destek Al</a>
             <a href="#about">Me-Like Pilates Hakkında</a>
          </footer>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
