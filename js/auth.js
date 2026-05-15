import { supabase } from './supabase.js';

function credentials(username, pin) {
  const u = username.toLowerCase().trim();
  return {
    email: u + '@lernplattform.local',
    password: 'LP_' + pin + '_' + u
  };
}

export const Auth = {
  async signUp(username, pin) {
    const { email, password } = credentials(username, pin);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name: username.trim() } }
    });
    if (error) throw error;
    if (data.user) {
      await supabase.from('profiles').upsert({
        id: data.user.id,
        name: username.trim(),
        settings: {},
        updated_at: new Date().toISOString()
      });
    }
    return data;
  },

  async signIn(username, pin) {
    const { email, password } = credentials(username, pin);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      if (error.message.toLowerCase().includes('invalid login credentials')) {
        throw new Error('Benutzername oder PIN falsch.');
      }
      throw error;
    }
    return data;
  },

  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  async getUser() {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  },

  async getSession() {
    const { data: { session } } = await supabase.auth.getSession();
    return session;
  },

  onAuthStateChange(callback) {
    return supabase.auth.onAuthStateChange((event, session) => {
      callback(event, session);
    });
  }
};
