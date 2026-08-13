import { supabase } from './supabase';

/**
 * Supabase send-push Edge Function'ını çağırarak bildirim fırlatır.
 * @param {Object} params
 * @param {string} [params.profileId] - Tek bir üye veya yöneticiye göndermek için
 * @param {string[]} [params.profileIds] - Birden fazla kullanıcıya göndermek için
 * @param {string} [params.role] - Belirli bir role ('admin' veya 'member') göndermek için
 * @param {string} params.title - Bildirim başlığı
 * @param {string} params.body - Bildirim mesajı
 * @param {string} [params.url] - Tıklandığında açılacak sayfa linki (örn: '/')
 */
export async function sendNotification({ profileId, profileIds, role, title, body, url }) {
  try {
    const payload = { title, body, url: url || '/' };
    if (profileId) payload.profile_id = profileId;
    if (profileIds) payload.profile_ids = profileIds;
    if (role) payload.role = role;

    // 1. Veritabanı bildirim geçmişine kaydet
    const dbPayload = { title, body, url: url || '/' };
    if (profileId) dbPayload.profile_id = profileId;
    if (role) dbPayload.target_role = role;

    const { error: dbError } = await supabase.from('notifications').insert(dbPayload);
    if (dbError) console.error('DB bildirim log hatası:', dbError);

    // 2. Anlık push bildirimi fırlat
    const { data, error } = await supabase.functions.invoke('send-push', {
      body: payload
    });

    console.log('Bildirim Gönderme Sonucu (Edge Function):', { data, error });

    if (error) {
      let errorDetails = error.message || String(error);
      try {
        if (error.context && typeof error.context.json === 'function') {
          const bodyJson = await error.context.json();
          errorDetails = bodyJson;
        }
      } catch (_) {}
      console.error('Bildirim gönderme hatası:', errorDetails);
      return { success: false, error: errorDetails };
    }

    return data;
  } catch (err) {
    console.error('sendNotification beklenmeyen hata:', err);
    return { success: false, error: err };
  }
}
