import { supabase } from './supabase';

// VAPID Public Key'i Uint8Array formatına çeviren yardımcı fonksiyon
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Kullanıcıdan bildirim izni ister ve aboneliği Supabase'e kaydeder.
 * @param {string} profileId - Üye veya yöneticinin Supabase profile ID'si
 */
export async function subscribeToPush(profileId) {
  if (!profileId) {
    throw new Error('Kullanıcı ID (profileId) gerekli.');
  }

  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('Bu tarayıcı anlık bildirimleri desteklemiyor.');
  }

  const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!vapidPublicKey) {
    throw new Error('VITE_VAPID_PUBLIC_KEY tanımlanmamış.');
  }

  // 1. Tarayıcıdan bildirim izni iste
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Bildirim izni verilmedi.');
  }

  // 2. Service Worker'ın hazır olmasını bekle
  const registration = await navigator.serviceWorker.ready;

  // 3. Push Manager'a abone ol
  const convertedVapidKey = urlBase64ToUint8Array(vapidPublicKey);
  let subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: convertedVapidKey
    });
  }

  const subData = subscription.toJSON();

  // 4. Supabase veritabanına kaydet (endpoint benzersizdir)
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert({
      profile_id: profileId,
      endpoint: subData.endpoint,
      p256dh: subData.keys.p256dh,
      auth: subData.keys.auth
    }, { onConflict: 'endpoint' });

  if (error) {
    console.error('Supabase abonelik kayıt hatası:', error);
    throw error;
  }

  return true;
}

/**
 * Kullanıcının bildirim aboneliğini iptal eder ve veritabanından siler.
 * @param {string} profileId - Kullanıcının profile ID'si
 */
export async function unsubscribeFromPush(profileId) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();

  if (subscription) {
    const endpoint = subscription.endpoint;
    await subscription.unsubscribe();

    if (profileId) {
      await supabase
        .from('push_subscriptions')
        .delete()
        .eq('endpoint', endpoint);
    }
  }
  return true;
}

/**
 * Mevcut bildirim izni ve abonelik durumunu kontrol eder.
 */
export async function checkSubscriptionStatus() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { isSupported: false, isSubscribed: false, permission: 'denied' };
  }

  const permission = Notification.permission;
  if (permission !== 'granted') {
    return { isSupported: true, isSubscribed: false, permission };
  }

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();

  return {
    isSupported: true,
    isSubscribed: !!subscription,
    permission
  };
}
