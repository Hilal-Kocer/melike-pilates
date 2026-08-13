const url = 'https://llusbqcyxiisjpkzsieo.supabase.co/functions/v1/send-push';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsdXNicWN5eGlpc2pwa3pzaWVvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NTQwODcsImV4cCI6MjA5MDAzMDA4N30.Gc-mj3qc4V3p4amSj-tFIdm2hc3PKTc1A9tmDQMUwQU';

async function testPush() {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${anonKey}`
    },
    body: JSON.stringify({
      role: 'member', // Try to send to all members to see if it works
      title: 'Test',
      body: 'Test Body'
    })
  });
  
  console.log("Status:", res.status);
  const text = await res.text();
  console.log("Response Body:", text);
}

testPush();
