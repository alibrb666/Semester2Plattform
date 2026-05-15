import { supabase } from './supabase.js';

const USER_KEY = 'learn.user_id';

export const Auth = {
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
    const { data } = await supabase.auth.getSession();
    return data?.session?.user || null;
  },

  signOut() {
    localStorage.removeItem(USER_KEY);
    return supabase.auth.signOut();
  }
};
