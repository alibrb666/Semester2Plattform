import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

function createFallbackClient() {
  const ok = (data = null) => Promise.resolve({ data, error: null });
  const query = {
    select() { return this; },
    eq() { return this; },
    order() { return this; },
    limit() { return this; },
    delete() { return this; },
    single() { return ok(null); },
    upsert() { return ok(null); },
    insert() { return ok(null); },
    update() { return ok(null); },
    then(resolve, reject) { return ok([]).then(resolve, reject); }
  };
  return {
    from() { return query; },
    storage: {
      from() {
        return {
          async upload() { return { data: null, error: new Error('Supabase Storage nicht verfügbar (Fallback).') }; },
          async createSignedUrl() { return { data: null, error: new Error('Supabase Storage nicht verfügbar (Fallback).') }; }
        };
      }
    },
    auth: {
      async getSession() { return { data: { session: null }, error: null }; },
      async signInAnonymously() { return { data: { user: { id: 'local-anon', user_metadata: {} } }, error: null }; },
      async signOut() { return { error: null }; }
    }
  };
}

let supabase;
const isFallback = !supabaseUrl || !supabaseKey;
if (!supabaseUrl || !supabaseKey) {
  console.warn('[Supabase] ENV fehlt – Local-Fallback aktiv (ohne Cloud-Sync).');
  supabase = createFallbackClient();
} else {
  try {
    supabase = createClient(supabaseUrl, supabaseKey);
  } catch (e) {
    console.warn('[Supabase] Init fehlgeschlagen – Local-Fallback aktiv:', e?.message || e);
    supabase = createFallbackClient();
  }
}

export { supabase };
export const isSupabaseFallback = isFallback;
