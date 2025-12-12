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

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

// Log connection status for debugging
console.log('[Supabase] Initialized with URL:', SUPABASE_URL ? '✅ Set' : '❌ Missing');
console.log('[Supabase] Anon Key:', SUPABASE_ANON_KEY ? '✅ Set' : '❌ Missing');