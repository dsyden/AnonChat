import { createClient } from '@supabase/supabase-js';

// ------------------------------------------------------------------
// CONFIGURATION
// Replace these with your project details from the Supabase Dashboard
// Settings -> API
// ------------------------------------------------------------------

// Vite uses import.meta.env for environment variables
const SUPABASE_URL = (import.meta.env?.VITE_SUPABASE_URL as string | undefined);
const SUPABASE_ANON_KEY = (import.meta.env?.VITE_SUPABASE_ANON_KEY as string | undefined);

export const isSupabaseConfigured = 
  SUPABASE_URL !== 'YOUR_SUPABASE_URL_HERE' && 
  SUPABASE_ANON_KEY !== 'YOUR_SUPABASE_ANON_KEY_HERE' &&
  SUPABASE_URL !== '' &&
  SUPABASE_ANON_KEY !== '';

if (!isSupabaseConfigured) {
  console.warn('⚠️ Supabase credentials missing! Application will default to setup mode.');
}

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('[Supabase] ❌ Missing credentials!');
  console.error('[Supabase] URL:', SUPABASE_URL || 'NOT SET');
  console.error('[Supabase] Key:', SUPABASE_ANON_KEY ? 'Set (hidden)' : 'NOT SET');
  console.error('[Supabase] Make sure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in Vercel environment variables');
}

export const supabase = createClient(
  SUPABASE_URL || 'https://placeholder.supabase.co',
  SUPABASE_ANON_KEY || 'placeholder-key',
  {
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

// Log connection status for debugging
console.log('[Supabase] Initialized');
console.log('[Supabase] URL:', SUPABASE_URL ? `✅ ${SUPABASE_URL.substring(0, 30)}...` : '❌ Missing');
console.log('[Supabase] Anon Key:', SUPABASE_ANON_KEY ? '✅ Set' : '❌ Missing');

// Test Supabase connection and Realtime availability
if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  (async () => {
    try {
      console.log('[Supabase] ✅ Client initialized successfully');
      
      // Check if Realtime is available
      const realtime = supabase.realtime;
      console.log('[Supabase] Realtime available:', !!realtime);
      
      // Try to get connection status
      setTimeout(() => {
        const isConnected = realtime.isConnected();
        console.log('[Supabase] Realtime connection status:', isConnected ? '✅ Connected' : '❌ Not connected');
        if (!isConnected) {
          console.warn('[Supabase] ⚠️ Realtime not connected. This may cause issues.');
          console.warn('[Supabase] Make sure Realtime is enabled in:');
          console.warn('[Supabase]   1. Supabase Dashboard → Settings → API → Enable Realtime');
          console.warn('[Supabase]   2. Supabase Dashboard → Database → Replication (if using table-based)');
        }
      }, 1000);
    } catch (err: any) {
      console.warn('[Supabase] ⚠️ Client initialization issue:', err?.message);
    }
  })();
}