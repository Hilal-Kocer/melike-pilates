import React, { useState, useEffect } from 'react';
import { 
  Bell, 
  Banknote, 
  ClipboardList, 
  CheckCircle2,
  CheckCircle,
  Loader2
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';
import { supabase } from '../../lib/supabase';
import './FinanceOverview.css';

const MONTH_NAMES = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

const FinanceOverview = ({ setActiveTab }) => {
  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState([]);
  const [chartData, setChartData] = useState([]);
  const [isProcessing, setIsProcessing] = useState(null);

  useEffect(() => {
    fetchFinanceData();
  }, []);

  const fetchFinanceData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('payments')
        .select(`
          id, amount, status, payment_date, created_at, next_payment_date,
          profiles ( full_name )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPayments(data || []);
      
      // Calculate Chart Data (Last 6 Months)
      calculateChartData(data || []);
    } catch (err) {
      console.error('Error fetching finance data:', err);
    } finally {
      setLoading(false);
    }
  };

  const calculateChartData = (allPayments) => {
    const paidPayments = allPayments.filter(p => p.status === 'paid' && p.payment_date);
    
    // Get last 6 months
    const data = [];
    const now = new Date();
    
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthLabel = MONTH_NAMES[d.getMonth()];
      
      const monthSum = paidPayments.filter(p => {
        const pd = new Date(p.payment_date);
        return pd.getMonth() === d.getMonth() && pd.getFullYear() === d.getFullYear();
      }).reduce((sum, curr) => sum + Number(curr.amount), 0);

      data.push({
        name: monthLabel,
        Kazanck: monthSum
      });
    }
    setChartData(data);
  };

  const handleMarkAsPaid = async (paymentId) => {
    setIsProcessing(paymentId);
    try {
      const { error } = await supabase
        .from('payments')
        .update({ 
          status: 'paid', 
          payment_date: new Date().toISOString() 
        })
        .eq('id', paymentId);
        
      if (error) throw error;
      
      await fetchFinanceData(); // Refresh data
    } catch (err) {
      console.error('Error updating payment:', err);
      alert('Ödeme güncellenirken bir hata oluştu.');
    } finally {
      setIsProcessing(null);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('tr-TR', { 
      style: 'currency', 
      currency: 'TRY',
      maximumFractionDigits: 0
    }).format(amount);
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    const d = new Date(dateString);
    return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
  };

  // Derived State
  const paidPayments = payments.filter(p => p.status === 'paid');
  const pendingPayments = payments.filter(p => p.status === 'pending');
  
  const totalIncome = paidPayments.reduce((sum, curr) => sum + Number(curr.amount), 0);
  const pendingAmount = pendingPayments.reduce((sum, curr) => sum + Number(curr.amount), 0);
  
  // Custom Tooltip for Chart
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div style={{ backgroundColor: '#fff', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
          <p style={{ margin: 0, fontWeight: 600, color: '#0f172a' }}>{label}</p>
          <p style={{ margin: 0, color: '#10b981', fontWeight: 700 }}>
            {formatCurrency(payload[0].value)}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="finance-overview">
      <div className="finance-header">
        <h1>Finans ve Ödemeler</h1>
        <div className="finance-header-actions">
          <button className="notification-btn" onClick={() => setActiveTab && setActiveTab('notifications')}>
            <Bell size={24} />
            <span className="notification-dot"></span>
          </button>
          <div className="current-date">
            {formatDate(new Date())}
          </div>
        </div>
      </div>

      <div className="finance-stats-grid">
        <div className="finance-stat-card">
          <div className="stat-card-header">
            <span>Toplam Gelir</span>
            <Banknote className="icon-green" size={24} />
          </div>
          <h2>{formatCurrency(totalIncome)}</h2>
          <span className="stat-trend positive">
            📈 Tüm zamanların geliri
          </span>
        </div>

        <div className="finance-stat-card">
          <div className="stat-card-header">
            <span>Bekleyen Ödemeler</span>
            <ClipboardList className="icon-orange" size={24} />
          </div>
          <h2>{formatCurrency(pendingAmount)}</h2>
          <span className="stat-trend warning">
            🕒 {pendingPayments.length} Kişi Bekliyor
          </span>
        </div>

        <div className="finance-stat-card">
          <div className="stat-card-header">
            <span>Tamamlanan İşlemler</span>
            <CheckCircle2 className="icon-blue" size={24} />
          </div>
          <h2>{paidPayments.length}</h2>
          <span className="stat-trend neutral">
            📅 Toplam işlem sayısı
          </span>
        </div>
      </div>

      <div className="finance-main-content">
        
        {/* LEFT COLUMN */}
        <div className="finance-left-column">
          
          {/* CHART */}
          <div className="chart-section">
            <div className="section-header">
              <div>
                <h3>Gelir Grafiği</h3>
                <span className="section-subtitle">Son 6 aylık kazanç performansı</span>
              </div>
              <span className="year-badge">{new Date().getFullYear()}</span>
            </div>
            
            <div style={{ width: '100%', height: 300 }}>
              <ResponsiveContainer>
                <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#64748b', fontSize: 12, fontWeight: 600 }}
                    dy={10}
                  />
                  <YAxis hide domain={['dataMin - 1000', 'dataMax + 2000']} />
                  <Tooltip content={<CustomTooltip />} />
                  <Line 
                    type="monotone" 
                    dataKey="Kazanck" 
                    stroke="#10b981" 
                    strokeWidth={4}
                    dot={false}
                    activeDot={{ r: 6, fill: '#10b981', stroke: '#fff', strokeWidth: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* RECENT TRANSACTIONS TABLE */}
          <div className="transactions-section">
            <div className="section-header">
              <h3>Son İşlemler</h3>
            </div>
            
            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
                <Loader2 className="animate-spin" size={32} color="#94a3b8" />
              </div>
            ) : paidPayments.length === 0 ? (
              <div className="empty-state-text">Henüz tamamlanan bir ödeme bulunmuyor.</div>
            ) : (
              <table className="transactions-table">
                <thead>
                  <tr>
                    <th>ÜYE</th>
                    <th>TARİH</th>
                    <th>TUTAR</th>
                    <th>DURUM</th>
                  </tr>
                </thead>
                <tbody>
                  {paidPayments.slice(0, 10).map((payment) => (
                    <tr key={payment.id}>
                      <td>
                        <div className="member-cell">
                          <div className="member-avatar">
                            {payment.profiles?.full_name?.charAt(0) || 'Ü'}
                          </div>
                          <span>{payment.profiles?.full_name || 'Bilinmeyen Üye'}</span>
                        </div>
                      </td>
                      <td className="date-cell">{formatDate(payment.payment_date || payment.created_at)}</td>
                      <td className="amount-cell">{formatCurrency(payment.amount)}</td>
                      <td>
                        <span className="status-badge-finance completed">Tamamlandı</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="finance-right-column">
          
          <div className="pending-payments-section">
            <div className="section-header" style={{ marginBottom: 0 }}>
              <h3>Bekleyen Ödemeler</h3>
              <span className="record-count-badge">{pendingPayments.length} Kayıt</span>
            </div>
            
            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
                <Loader2 className="animate-spin" size={24} color="#94a3b8" />
              </div>
            ) : pendingPayments.length === 0 ? (
              <div className="empty-state-text">Bekleyen ödeme bulunmuyor.</div>
            ) : (
              <div className="pending-list">
                {pendingPayments.map((payment) => {
                  // Determine status text
                  let statusText = 'Bekliyor';
                  let statusClass = '';
                  
                  if (payment.next_payment_date) {
                    const nextDate = new Date(payment.next_payment_date);
                    const today = new Date();
                    today.setHours(0,0,0,0);
                    
                    const diffTime = today - nextDate;
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    
                    if (diffDays > 0) {
                      statusText = `${diffDays} gün gecikti`;
                      statusClass = 'late';
                    } else if (diffDays === 0) {
                      statusText = 'Bugün son gün';
                    }
                  }

                  return (
                    <div key={payment.id} className="pending-card">
                      <div className="pending-card-header">
                        <div className="pending-user">
                          <div className="member-avatar">
                            {payment.profiles?.full_name?.charAt(0) || 'Ü'}
                          </div>
                          <div className="pending-user-info">
                            <h4>{payment.profiles?.full_name || 'Bilinmeyen Üye'}</h4>
                          </div>
                        </div>
                        <div className="pending-amount">
                          {formatCurrency(payment.amount)}
                        </div>
                      </div>
                      <div className="pending-card-footer">
                        <span className={`pending-status-text ${statusClass}`}>
                          {statusText}
                        </span>
                        <button 
                          className="btn-mark-paid"
                          onClick={() => handleMarkAsPaid(payment.id)}
                          disabled={isProcessing === payment.id}
                        >
                          {isProcessing === payment.id ? (
                            <Loader2 className="animate-spin" size={16} />
                          ) : (
                            <CheckCircle size={16} />
                          )}
                          Ödendi
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            
            {pendingPayments.length > 5 && (
              <button className="btn-view-all">Tümünü Görüntüle</button>
            )}
          </div>
          
        </div>
      </div>
    </div>
  );
};

export default FinanceOverview;
