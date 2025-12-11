import { createClient } from '@supabase/supabase-js';

// ------------------------------------------------------------------
// CONFIGURATION
// Replace these with your project details from the Supabase Dashboard
// Settings -> API
// ------------------------------------------------------------------

// Vite uses import.meta.env for environment variables
const SUPABASE_URL = (import.meta.env?.VITE_SUPABASE_URL as string | undefined) || 'https://uzvawldmzgyykdtcwicp.supabase.co';
const SUPABASE_ANON_KEY = (import.meta.env?.VITE_SUPABASE_ANON_KEY as string | undefined) || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV6dmF3bGRtemd5eWtkdGN3aWNwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU0ODA1ODUsImV4cCI6MjA4MTA1NjU4NX0.gJM53NY-RDomu0zgObHMKxhPD66kABJ6u_35hwxWUmI';

export const isSupabaseConfigured = 
  SUPABASE_URL !== 'YOUR_SUPABASE_URL_HERE' && 
  SUPABASE_ANON_KEY !== 'YOUR_SUPABASE_ANON_KEY_HERE' &&
  SUPABASE_URL !== '' &&
  SUPABASE_ANON_KEY !== '';

if (!isSupabaseConfigured) {
  console.warn('⚠️ Supabase credentials missing! Application will default to setup mode.');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);