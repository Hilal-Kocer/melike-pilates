import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://llusbqcyxiisjpkzsieo.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsdXNicWN5eGlpc2pwa3pzaWVvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NTQwODcsImV4cCI6MjA5MDAzMDA4N30.Gc-mj3qc4V3p4amSj-tFIdm2hc3PKTc1A9tmDQMUwQU';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkAll() {
  const { data: atts, error } = await supabase
    .from('attendance')
    .select('id, profile_id, lesson_id, status, is_telafi, created_at, profiles(full_name)')
    // I can't filter by lesson_date easily if it's not present or if it's on lessons
    // Let's just get the latest attendances
    .order('created_at', { ascending: false })
    .limit(10);
    
  console.log("Latest Attendances:", JSON.stringify(atts, null, 2));
}

checkAll();
