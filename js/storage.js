const KEY = 'learn.v1';
const CURRENT_VERSION = 1;
let _saveTimer = null;

export const Storage = {
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data.version || data.version < CURRENT_VERSION) {
        return this.migrate(data, data.version || 0);
      }
      return data;
    } catch (e) {
      console.error('[Storage] load failed:', e);
      return null;
    }
  },

  save(data) {
    if (_saveTimer) clearTimeout(_saveTimer);
    _saveTimer = setTimeout(() => this._write(data), 500);
  },

  saveNow(data) {
    if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = null; }
    this._write(data);
  },

  _write(data) {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e) {
      if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
        console.warn('[Storage] Quota exceeded – trimming old sessions');
        try {
          const trimmed = { ...data, sessions: (data.sessions || []).slice(-200) };
          localStorage.setItem(KEY, JSON.stringify(trimmed));
        } catch (_) {}
      }
    }
  },

  clear() {
    if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = null; }
    localStorage.removeItem(KEY);
  },

  migrate(data, fromVersion) {
    if (fromVersion < 1) {
      data.version = 1;
      data.settings = { name:'Lukas', theme:'dark', sidebarCollapsed:false,
        dailyGoalMinutes:240, weeklyGoals:{klr:360,math:390,prog:360,kbs:300},
        soundEnabled:true, notificationsEnabled:false, streakFreezeUsed:false, ...data.settings };
      data.subjects    = data.subjects    || [];
      data.sessions    = data.sessions    || [];
      data.scheduleBlocks = data.scheduleBlocks || [];
      data.errorLog    = data.errorLog    || [];
      data.mocks       = data.mocks       || [];
      data.weeklyReviews = data.weeklyReviews || [];
      data.achievements = data.achievements || { longestStreak:0, totalHours:0 };
    }
    return data;
  }
};
