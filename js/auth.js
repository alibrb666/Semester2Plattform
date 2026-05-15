import { supabase } from './supabase.js';

const USER_KEY = 'learn.user_id';
const AUTH_MODE_KEY = 'learn.auth_mode';
const USERNAME_KEY = 'learn.username';

async function usernameToId(username) {
  const name = String(username || 'Nutzer').trim() || 'Nutzer';
  const data = new TextEncoder().encode(`lernplattform:${name}`);
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes.slice(0, 16)].map(b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20,32)}`;
}

export const Auth = {
  async signInWithUsername(name) {
    const username = String(name || '').trim();
    if (!username) throw new Error('Bitte Username eingeben.');
    const id = await usernameToId(username);
    localStorage.setItem(USER_KEY, id);
    localStorage.setItem(USERNAME_KEY, username);
    localStorage.setItem(AUTH_MODE_KEY, 'username');

    const { data: profile } = await supabase.from('profiles').select('id').eq('id', id).single();
    if (!profile) {
      await supabase.from('profiles').upsert({
        id,
        name: username,
        settings: { name: username },
        updated_at: new Date().toISOString()
      });
    }

    return { id, user_metadata: { name: username }, isUsernameUser: true };
  },

  async getOrCreateUser(name) {
    const savedId = localStorage.getItem(USER_KEY);

    if (savedId) {
      const { data } = await supabase.auth.getSession();
      if (data?.session) return data.session.user;

      // Session abgelaufen – neu anonym einloggen
      const { data: d2, error } = await supabase.auth.signInAnonymously();
      if (error) throw error;
      localStorage.setItem(USER_KEY, d2.user.id);
      return d2.user;
    }

    // Neuer User – anonym registrieren
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) throw error;

    localStorage.setItem(USER_KEY, data.user.id);
    await supabase.from('profiles').upsert({
      id: data.user.id,
      name: name || 'Nutzer',
      settings: {}
    });

    return data.user;
  },

  async getCurrentUser() {
    if (localStorage.getItem(AUTH_MODE_KEY) === 'username') {
      const id = localStorage.getItem(USER_KEY);
      const name = localStorage.getItem(USERNAME_KEY) || 'Nutzer';
      if (id) return { id, user_metadata: { name }, isUsernameUser: true };
    }
    const { data } = await supabase.auth.getSession();
    return data?.session?.user || null;
  },

  signOut() {
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(AUTH_MODE_KEY);
    localStorage.removeItem(USERNAME_KEY);
    return supabase.auth.signOut();
  }
};
