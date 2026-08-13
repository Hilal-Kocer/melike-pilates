import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import webPush from "npm:web-push@3.6.7"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webPush.setVapidDetails(
    "mailto:iletisim@zenflowpilates.com",
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  )
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      throw new Error("VAPID_PUBLIC_KEY veya VAPID_PRIVATE_KEY secret olarak ayarlanmamış.")
    }

    const { profile_id, profile_ids, role, title, body, url } = await req.json()

    if (!title || !body) {
      return new Response(JSON.stringify({ error: "title ve body parametreleri zorunludur." }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const authHeader = req.headers.get('Authorization')
    const webhookSecret = req.headers.get('x-webhook-secret')
    
    // Supabase Service Role client oluştur (RLS aşmak için)
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )
    
    // Doğrulama kontrolü: Webhook Secret veya Geçerli Supabase JWT
    let isAuthenticated = false;
    
    if (webhookSecret && Deno.env.get("WEBHOOK_SECRET") && webhookSecret === Deno.env.get("WEBHOOK_SECRET")) {
      isAuthenticated = true; // Veritabanı cron job'larından gelen güvenli istek
    } else if (authHeader) {
      const token = authHeader.replace('Bearer ', '')
      // Gelen token'ın geçerli bir kullanıcı olup olmadığını doğrula
      const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
      if (user && !authError) {
        isAuthenticated = true; // Uygulama içinden gelen yetkili kullanıcı
      }
    }

    if (!isAuthenticated) {
      return new Response(JSON.stringify({ error: "Yetkisiz erişim (Unauthorized)" }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let targetProfileIds: string[] = []

    if (profile_id) {
      targetProfileIds.push(profile_id)
    } else if (profile_ids && Array.isArray(profile_ids)) {
      targetProfileIds = [...profile_ids]
    } else if (role) {
      // Belirli role sahip tüm kullanıcıları bul (örn: 'admin')
      const { data: profiles, error: roleError } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('role', role)

      if (!roleError && profiles) {
        targetProfileIds = profiles.map(p => p.id)
      }
    }

    if (targetProfileIds.length === 0) {
      return new Response(JSON.stringify({ message: "Hedef kullanıcı bulunamadı." }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Hedef kullanıcıların aboneliklerini çek
    const { data: subscriptions, error: subError } = await supabaseAdmin
      .from("push_subscriptions")
      .select("*")
      .in("profile_id", targetProfileIds)

    if (subError || !subscriptions || subscriptions.length === 0) {
      return new Response(JSON.stringify({ message: "Bu kullanıcılar için aktif bildirim aboneliği bulunamadı.", sentCount: 0 }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const payload = JSON.stringify({ title, body, url: url || "/" })
    let successCount = 0
    let failCount = 0

    // Bildirimleri paralel gönder
    const sendPromises = subscriptions.map(async (sub) => {
      const pushSub = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth }
      }

      try {
        await webPush.sendNotification(pushSub, payload)
        successCount++
      } catch (err: any) {
        failCount++
        console.error(`Push gönderim hatası (${sub.endpoint}):`, err?.statusCode || err?.message)
        // Eğer abonelik iptal edilmiş veya geçersizse (404/410), veritabanından temizle
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          await supabaseAdmin.from("push_subscriptions").delete().eq("id", sub.id)
        }
      }
    })

    await Promise.all(sendPromises)

    return new Response(JSON.stringify({ 
      success: true, 
      sentCount: successCount, 
      failedCount: failCount,
      totalSubscriptions: subscriptions.length 
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err: any) {
    console.error("Edge Function Error:", err)
    return new Response(JSON.stringify({ error: err.message || String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
