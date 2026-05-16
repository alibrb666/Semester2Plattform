import { supabase } from './supabase.js';
import { t } from './i18n.js';

const USER_KEY = 'learn.user_id';
const AUTH_MODE_KEY = 'learn.auth_mode';
const USERNAME_KEY = 'learn.username';
const PROFILE_KEY = 'learn.profiles';

async function usernameToId(username) {
  const name = String(username || 'Nutzer').trim() || 'Nutzer';
  const data = new TextEncoder().encode(`lernplattform:${name}`);
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes.slice(0, 16)].map(b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20,32)}`;
}

async function hashPin(userId, pin) {
  const clean = String(pin || '').trim();
  if (!/^\d{4}$/.test(clean)) throw new Error(t('pinRequired'));
  const data = new TextEncoder().encode(`lernplattform-pin:${userId}:${clean}`);
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
  return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
}

function readProfiles() {
  try { return JSON.parse(localStorage.getItem(PROFILE_KEY) || '[]'); }
  catch { return []; }
}

function writeProfiles(profiles) {
  const clean = profiles
    .filter(p => p?.id && p?.name)
    .map(p => ({
      id: p.id,
      name: p.name,
      pinHash: p.pinHash || null,
      language: p.language || 'de',
      lastUsedAt: p.lastUsedAt || null
    }));
  localStorage.setItem(PROFILE_KEY, JSON.stringify(clean));
}

function upsertLocalProfile(profile) {
  const profiles = readProfiles();
  const idx = profiles.findIndex(p => p.id === profile.id);
  const next = { ...(idx >= 0 ? profiles[idx] : {}), ...profile, lastUsedAt: new Date().toISOString() };
  if (idx >= 0) profiles[idx] = next;
  else profiles.push(next);
  writeProfiles(profiles);
  return next;
}

function readLocalStateNameById(userId) {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(`learn.v1:${userId}`);
    if (!raw) return null;
    const data = JSON.parse(raw);
    const name = String(data?.settings?.name || '').trim();
    return name || null;
  } catch {
    return null;
  }
}

function recoverProfilesFromLocalStates(existing = []) {
  const profiles = [...existing];
  const ids = new Set(profiles.map(p => p.id));
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith('learn.v1:')) continue;
      const id = k.slice('learn.v1:'.length);
      if (!id || ids.has(id)) continue;
      const name = readLocalStateNameById(id);
      if (!name) continue;
      profiles.push({
        id,
        name,
        pinHash: null,
        language: 'de',
        lastUsedAt: null
      });
      ids.add(id);
    }
  } catch (_) {}
  return profiles;
}

function mergeProfiles(base = [], incoming = []) {
  const map = new Map();
  [...base, ...incoming].forEach(p => {
    if (!p?.id || !p?.name) return;
    const prev = map.get(p.id) || {};
    map.set(p.id, {
      id: p.id,
      name: p.name || prev.name || 'Nutzer',
      pinHash: p.pinHash ?? prev.pinHash ?? null,
      language: p.language || prev.language || 'de',
      lastUsedAt: p.lastUsedAt || prev.lastUsedAt || null
    });
  });
  return [...map.values()];
}

export const Auth = {
  listProfiles() {
    let profiles = readProfiles();
    profiles = recoverProfilesFromLocalStates(profiles);
    const savedId = localStorage.getItem(USER_KEY);
    const savedName = localStorage.getItem(USERNAME_KEY);
    if (savedId && savedName && !profiles.some(p => p.id === savedId)) {
      profiles.push({ id: savedId, name: savedName, pinHash: null, language: localStorage.getItem('learn.language') || 'de', lastUsedAt: new Date().toISOString() });
    }
    writeProfiles(profiles);
    return profiles.sort((a, b) => String(b.lastUsedAt || '').localeCompare(String(a.lastUsedAt || '')));
  },

  async syncProfilesFromCloud() {
    const local = this.listProfiles();
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id,name,updated_at,settings')
        .order('updated_at', { ascending: false })
        .limit(300);
      if (error || !Array.isArray(data)) return local;
      const cloud = data
        .filter(p => p?.id && p?.name)
        .map(p => ({
          id: p.id,
          name: p.name,
          pinHash: null,
          language: p?.settings?.language || 'de',
          lastUsedAt: p.updated_at || null
        }));
      const merged = mergeProfiles(local, cloud);
      writeProfiles(merged);
      return merged.sort((a, b) => String(b.lastUsedAt || '').localeCompare(String(a.lastUsedAt || '')));
    } catch {
      return local;
    }
  },

  async signInWithUsername(name, options = {}) {
    const username = String(name || '').trim();
    if (!username) throw new Error(t('nameRequired'));
    const id = await usernameToId(username);
    const language = options.language || 'de';
    const pinHash = options.pin ? await hashPin(id, options.pin) : options.pinHash || null;
    const existing = readProfiles().find(p => p.id === id);
    if (existing?.pinHash) {
      if (!pinHash) throw new Error(t('profileExists'));
      if (existing.pinHash !== pinHash) throw new Error(t('wrongPin'));
    } else if (existing && pinHash) {
      // Upgrade legacy profiles without PIN when the user logs in with one.
      existing.pinHash = pinHash;
    }
    localStorage.setItem(USER_KEY, id);
    localStorage.setItem(USERNAME_KEY, username);
    localStorage.setItem(AUTH_MODE_KEY, 'username');
    upsertLocalProfile({ id, name: username, pinHash: existing?.pinHash || pinHash || null, language });

    const { data: profile } = await supabase.from('profiles').select('id').eq('id', id).single();
    if (!profile) {
      await supabase.from('profiles').upsert({
        id,
        name: username,
        settings: { name: username, language },
        updated_at: new Date().toISOString()
      });
    }

    return { id, user_metadata: { name: username }, isUsernameUser: true };
  },

  async unlockProfile(profile, pin) {
    if (!profile?.id) throw new Error('Profil fehlt.');
    if (profile.pinHash) {
      const actual = await hashPin(profile.id, pin);
      if (actual !== profile.pinHash) throw new Error(t('wrongPin'));
    }
    localStorage.setItem(USER_KEY, profile.id);
    localStorage.setItem(USERNAME_KEY, profile.name);
    localStorage.setItem(AUTH_MODE_KEY, 'username');
    upsertLocalProfile(profile);
    return { id: profile.id, user_metadata: { name: profile.name }, isUsernameUser: true };
  },

  async setProfilePin(profile, pin) {
    if (!profile?.id) throw new Error('Profil fehlt.');
    const pinHash = await hashPin(profile.id, pin);
    return upsertLocalProfile({ ...profile, pinHash });
  },

  updateLocalProfile(patch) {
    const id = patch?.id || localStorage.getItem(USER_KEY);
    if (!id) return null;
    const current = readProfiles().find(p => p.id === id) || { id, name: localStorage.getItem(USERNAME_KEY) || 'Nutzer' };
    return upsertLocalProfile({ ...current, ...patch, id });
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
