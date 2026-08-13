-- 1. Profiles Table (Extends Supabase Auth users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  role TEXT DEFAULT 'member' CHECK (role IN ('admin', 'member', 'trainer')),
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Packages Table
CREATE TABLE IF NOT EXISTS packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  total_sessions INTEGER NOT NULL DEFAULT 0,
  used_sessions INTEGER NOT NULL DEFAULT 0,
  start_date DATE DEFAULT CURRENT_DATE,
  expiry_date DATE,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'expired')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Attendance Table
CREATE TABLE IF NOT EXISTS attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  package_id UUID REFERENCES packages(id) ON DELETE CASCADE,
  lesson_date TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'bekliyor' CHECK (status IN ('bekliyor', 'attended', 'cancelled', 'compensation')),
  notes TEXT,
  is_makeup BOOLEAN DEFAULT false,
  is_telafi BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Payments Table
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  package_id UUID REFERENCES packages(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('paid', 'pending')),
  payment_date TIMESTAMPTZ,
  next_payment_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Basic RLS Policies (Draft)
-- Updated RLS Policies

-- Helper function to check if user is admin (SECURITY DEFINER to avoid recursion)
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean AS $$
BEGIN
  RETURN (
    SELECT role = 'admin'
    FROM public.profiles
    WHERE id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to check if user is trainer (SECURITY DEFINER to avoid recursion)
CREATE OR REPLACE FUNCTION is_trainer()
RETURNS boolean AS $$
BEGIN
  RETURN (
    SELECT role = 'trainer'
    FROM public.profiles
    WHERE id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- GÜVENLİK YAMASI: Yetki Yükseltmeyi (Privilege Escalation) Önleme
-- Üyelerin kendi rollerini güncellemelerini engeller. Sadece adminler rol değiştirebilir.
CREATE OR REPLACE FUNCTION check_role_update() RETURNS trigger AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF NOT is_admin() THEN
      RAISE EXCEPTION 'Güvenlik İhlali: Rol değiştirme yetkiniz yok.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS prevent_role_escalation ON profiles;
CREATE TRIGGER prevent_role_escalation 
  BEFORE UPDATE ON profiles 
  FOR EACH ROW EXECUTE FUNCTION check_role_update();

-- Profiles: Users can view/update/insert their own, admins see all.
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Admins can view all profiles" ON profiles FOR SELECT USING (is_admin() OR is_trainer());

-- Packages: Members can see their own packages, Admins see all.
CREATE POLICY "Users can view own packages" ON packages FOR SELECT USING (auth.uid() = profile_id);
CREATE POLICY "Admins can manage all packages" ON packages FOR ALL USING (is_admin());
CREATE POLICY "Trainers can view all packages" ON packages FOR SELECT USING (is_trainer());

-- Payments: Members can see their own payments, Admins see all.
CREATE POLICY "Users can view own payments" ON payments FOR SELECT USING (auth.uid() = profile_id);
CREATE POLICY "Admins can manage all payments" ON payments FOR ALL USING (is_admin());

-- Attendance: Members can see their own attendance, Admins see all.
CREATE POLICY "Users can view own attendance" ON attendance FOR SELECT USING (auth.uid() = profile_id);
CREATE POLICY "Admins can manage all attendance" ON attendance FOR ALL USING (is_admin());
CREATE POLICY "Trainers can manage all attendance" ON attendance FOR ALL USING (is_trainer());

-- 5. Trigger for automatic profile creation
-- This function runs every time a new user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', 'Yeni Üye'),
    'member'
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to call the function after a user is created in auth.users
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 6. Repair Script (Run this manually in Supabase SQL Editor if needed)
/*
INSERT INTO public.profiles (id, full_name, role)
SELECT id, COALESCE(raw_user_meta_data->>'full_name', 'Mevcut Üye'), 'member'
FROM auth.users
WHERE id NOT IN (SELECT id FROM public.profiles);
-- 7. Trainers Table
CREATE TABLE IF NOT EXISTS trainers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  specialty TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Lessons Table
CREATE TABLE IF NOT EXISTS lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  trainer_id UUID REFERENCES trainers(id) ON DELETE SET NULL,
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  package_id UUID REFERENCES packages(id) ON DELETE CASCADE,
  lesson_date DATE NOT NULL DEFAULT CURRENT_DATE,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  max_capacity INTEGER DEFAULT 5,
  current_attendance INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled', 'bekliyor')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE trainers ENABLE ROW LEVEL SECURITY;
ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Anyone can view trainers" ON trainers FOR SELECT USING (true);
CREATE POLICY "Admins can manage trainers" ON trainers FOR ALL USING (is_admin());

CREATE POLICY "Anyone can view lessons" ON lessons FOR SELECT USING (true);
CREATE POLICY "Admins can manage lessons" ON lessons FOR ALL USING (is_admin());
CREATE POLICY "Trainers can manage lessons" ON lessons FOR ALL USING (is_trainer());

-- 9. Seed Data (Optional, run manually if needed)
/*
-- Trainers
INSERT INTO trainers (full_name, specialty) VALUES 
('Selin Aydın', 'Reformer Pilates'),
('Murat Can', 'Cadillac & Clinical');

-- Lessons for today
INSERT INTO lessons (name, trainer_id, start_time, end_time, current_attendance, max_capacity, status)
SELECT 'Reformer Pilates', id, '14:00', '15:00', 4, 5, 'active' FROM trainers WHERE full_name = 'Selin Aydın' LIMIT 1;

INSERT INTO lessons (name, trainer_id, start_time, end_time, current_attendance, max_capacity, status)
SELECT 'Cadillac Intro', id, '15:30', '16:30', 1, 1, 'bekliyor' FROM trainers WHERE full_name = 'Murat Can' LIMIT 1;
*/

-- 10. Push Subscriptions Table (Web Push & VAPID)
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can manage their own subscriptions" ON push_subscriptions 
  FOR ALL USING (auth.uid() = profile_id);

CREATE POLICY "Admins can view all subscriptions" ON push_subscriptions 
  FOR SELECT USING (is_admin());

-- ===================================================================
-- 11. OTOMATİK VE ZAMANLANMIŞ BİLDİRİMLER (pg_cron & pg_net)
-- ===================================================================
-- Not: Bu fonksiyonların çalışabilmesi için Supabase Dashboard > Database > Extensions
-- sekmesinden 'pg_net' ve 'pg_cron' eklentilerinin aktif (enabled) olduğundan emin olun.

-- A) DERS HATIRLATMASI (Başlamasına 2 saat kalan dersler için her saat başı çalışır)
CREATE OR REPLACE FUNCTION check_upcoming_lessons_and_notify()
RETURNS void AS $$
DECLARE
  lesson_rec RECORD;
  att_rec RECORD;
BEGIN
  FOR lesson_rec IN 
    SELECT l.id, l.name, l.start_time, l.lesson_date 
    FROM lessons l
    WHERE l.status = 'active'
      AND l.lesson_date = CURRENT_DATE
      AND l.start_time >= (CURRENT_TIME AT TIME ZONE 'Europe/Istanbul' + interval '1 hour 50 minutes')::time
      AND l.start_time <= (CURRENT_TIME AT TIME ZONE 'Europe/Istanbul' + interval '2 hour 10 minutes')::time
  LOOP
    -- Grup Dersi Kontrolü (Attendance Tablosu)
    FOR att_rec IN 
      SELECT profile_id FROM attendance WHERE lesson_id = lesson_rec.id AND status IN ('bekliyor', 'attended')
    LOOP
      -- 1. Veritabanına kaydet (Uygulama içi bildirim sayfasında görünmesi için)
      INSERT INTO notifications (profile_id, target_role, title, body, url)
      VALUES (
        att_rec.profile_id,
        'member',
        'Yaklaşan Dersiniz Var! ⏰',
        'Bugünkü ' || lesson_rec.start_time || ' ' || lesson_rec.name || ' dersiniz 2 saat sonra başlıyor.',
        '/'
      );

      -- 2. Telefona/Tarayıcıya anlık Push Gönder
      PERFORM net.http_post(
        url := 'https://llusbqcyxiisjpkzsieo.supabase.co/functions/v1/send-push',
        body := json_build_object(
          'profile_id', att_rec.profile_id,
          'title', 'Yaklaşan Dersiniz Var! ⏰',
          'body', 'Bugünkü ' || lesson_rec.start_time || ' ' || lesson_rec.name || ' dersiniz 2 saat sonra başlıyor.'
        )::jsonb,
        headers := json_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsdXNicWN5eGlpc2pwa3pzaWVvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NTQwODcsImV4cCI6MjA5MDAzMDA4N30.Gc-mj3qc4V3p4amSj-tFIdm2hc3PKTc1A9tmDQMUwQU',
          'x-webhook-secret', 'melike-pilates-guvenli-bildirim-anahtari'
        )::jsonb
      );
    END LOOP;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- B) ÖDEME UYARILARI (Her gün sabah 09:00'da çalışır)
CREATE OR REPLACE FUNCTION check_payments_and_notify()
RETURNS void AS $$
DECLARE
  pending_rec RECORD;
  overdue_count INTEGER := 0;
BEGIN
  -- 1. Üyelere: Ödeme tarihi yaklaşan veya bekleyen ödemeleri hatırlat
  FOR pending_rec IN 
    SELECT profile_id, amount, next_payment_date 
    FROM payments 
    WHERE status = 'pending' 
       OR (next_payment_date IS NOT NULL AND next_payment_date <= CURRENT_DATE + interval '3 days')
  LOOP
    -- 1. Veritabanına kaydet
    INSERT INTO notifications (profile_id, target_role, title, body, url)
    VALUES (
      pending_rec.profile_id,
      'member',
      'Bekleyen Ödeme Hatırlatması 💳',
      'Paketiniz için bekleyen ödemeniz bulunmaktadır. Detayları incelemek için uygulamaya göz atabilirsiniz.',
      '/'
    );

    -- 2. Anlık Push
    PERFORM net.http_post(
      url := 'https://llusbqcyxiisjpkzsieo.supabase.co/functions/v1/send-push',
      body := json_build_object(
        'profile_id', pending_rec.profile_id,
        'title', 'Bekleyen Ödeme Hatırlatması 💳',
        'body', 'Paketiniz için bekleyen ödemeniz bulunmaktadır. Detayları incelemek için uygulamaya göz atabilirsiniz.'
      )::jsonb,
      headers := json_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsdXNicWN5eGlpc2pwa3pzaWVvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NTQwODcsImV4cCI6MjA5MDAzMDA4N30.Gc-mj3qc4V3p4amSj-tFIdm2hc3PKTc1A9tmDQMUwQU',
        'x-webhook-secret', 'melike-pilates-guvenli-bildirim-anahtari'
      )::jsonb
    );
  END LOOP;

  -- 2. Yöneticilere: Geciken ödeme sayısı varsa toplu bildirim at
  SELECT COUNT(*) INTO overdue_count 
  FROM payments 
  WHERE status = 'pending' AND next_payment_date < CURRENT_DATE;

  IF overdue_count > 0 THEN
    -- 1. Admin için veritabanına kaydet
    INSERT INTO notifications (target_role, title, body, url)
    VALUES (
      'admin',
      'Gecikmiş Ödeme Hatırlatması ⚠️',
      overdue_count || ' üyenin ödeme tarihi geçti. Finans sekmesinden kontrol edebilirsiniz.',
      '/admin'
    );

    -- 2. Anlık Push
    PERFORM net.http_post(
      url := 'https://llusbqcyxiisjpkzsieo.supabase.co/functions/v1/send-push',
      body := json_build_object(
        'role', 'admin',
        'title', 'Gecikmiş Ödeme Hatırlatması ⚠️',
        'body', overdue_count || ' üyenin ödeme tarihi geçti. Finans sekmesinden kontrol edebilirsiniz.'
      )::jsonb,
      headers := json_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsdXNicWN5eGlpc2pwa3pzaWVvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NTQwODcsImV4cCI6MjA5MDAzMDA4N30.Gc-mj3qc4V3p4amSj-tFIdm2hc3PKTc1A9tmDQMUwQU',
        'x-webhook-secret', 'melike-pilates-guvenli-bildirim-anahtari'
      )::jsonb
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- C) CRON ZAMANLAYICILARI (pg_cron eklentisi gerektirir)
/*
-- Her saat başı ders kontrolü yapar
SELECT cron.schedule('check-upcoming-lessons', '0 * * * *', 'SELECT check_upcoming_lessons_and_notify()');

-- Her sabah 09:00'da ödeme kontrolü yapar
SELECT cron.schedule('check-payments-daily', '0 9 * * *', 'SELECT check_payments_and_notify()');
*/

-- ===================================================================
-- 12. UYGULAMA İÇİ BİLDİRİM GEÇMİŞİ (NOTIFICATIONS TABLOSU)
-- ===================================================================
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  target_role TEXT, -- 'admin' veya 'member' (veya null)
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  url TEXT DEFAULT '/',
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view relevant notifications" ON notifications
  FOR SELECT USING (
    auth.uid() = profile_id OR 
    (target_role = 'admin' AND is_admin()) OR
    (target_role = 'member' AND NOT is_admin())
  );

CREATE POLICY "Users can update read status" ON notifications
  FOR UPDATE USING (
    auth.uid() = profile_id OR 
    (target_role = 'admin' AND is_admin())
  );

-- GÜVENLİK YAMASI: Sadece yetkili/ilgili kişiler bildirim atabilir
-- Üyeler sadece yöneticilere (target_role = 'admin') bildirim atabilir.
-- Admin ve Eğitmenler herkese bildirim atabilir.
CREATE POLICY "Anyone can insert notifications" ON notifications
  FOR INSERT WITH CHECK (
    is_admin() OR is_trainer() OR 
    (auth.uid() IS NOT NULL AND target_role = 'admin')
  );
-- ===================================================================
-- 13. RPC FUNCTIONS FOR ADMIN OPERATIONS
-- ===================================================================

-- Güvenli Üye Silme Fonksiyonu (auth.users tablosundan siler)
-- SECURITY DEFINER yetkisiyle çalışır, böylece auth.users'a erişebilir.
CREATE OR REPLACE FUNCTION delete_user(target_user_id UUID)
RETURNS void AS $$
BEGIN
  -- Sadece adminlerin çalıştırabilmesi için kontrol
  IF (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin' THEN
    -- auth.users tablosundan kullanıcıyı sil. 
    -- Bu işlem on delete cascade ile profiles ve diğer tabloları da temizler.
    DELETE FROM auth.users WHERE id = target_user_id;
  ELSE
    RAISE EXCEPTION 'Bu işlem için yetkiniz yok.';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ===================================================================
-- 14. STAFF CHAT
-- ===================================================================

CREATE TABLE IF NOT EXISTS staff_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE staff_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view messages" ON staff_messages FOR SELECT USING (is_admin() OR is_trainer());
CREATE POLICY "Staff can insert messages" ON staff_messages FOR INSERT WITH CHECK (is_admin() OR is_trainer());


-- ===================================================================
-- 15. ANNOUNCEMENTS (DUYURU PANOSU)
-- ===================================================================

CREATE TABLE IF NOT EXISTS announcements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  image_url TEXT,
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

-- Herkes duyuruları okuyabilir (Admin, Member, Trainer dahil olmak üzere kayıtlı kullanıcılar)
CREATE POLICY "Everyone can view announcements" ON announcements
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Sadece admin duyuru oluşturabilir, silebilir, güncelleyebilir
CREATE POLICY "Admins can insert announcements" ON announcements
  FOR INSERT WITH CHECK (is_admin());

CREATE POLICY "Admins can update announcements" ON announcements
  FOR UPDATE USING (is_admin());

CREATE POLICY "Admins can delete announcements" ON announcements
  FOR DELETE USING (is_admin());

