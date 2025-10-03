import { createClient, SupabaseClient } from '@supabase/supabase-js';

// These should be in your .env file (Vite exposes them as import.meta.env)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

let _supabase: SupabaseClient | null = null;
if (supabaseUrl && supabaseKey) {
  _supabase = createClient(supabaseUrl, supabaseKey);
} else {
  // Avoid throwing during module evaluation — log a clear warning instead.
  // This keeps the dev server running even if .env isn't loaded for some reason.
  // When running in production, ensure these env vars are provided.
  // eslint-disable-next-line no-console
  console.warn('[supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Supabase client not initialized.');
}

export const supabase: SupabaseClient | null = _supabase;

// Type definitions to match your schema
export type User = {
  id: string;
  username: string;
  created_at: string;
};

export type Score = {
  id: string;
  user_id: string;
  username: string;
  score: number;
  created_at: string;
};


