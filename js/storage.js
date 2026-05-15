const KEY = 'learn.v1';
const CURRENT_VERSION = 2;
const DEFAULT_ICS_URL = 'https://calendar.google.com/calendar/ical/b4a4464084327a2a90ac105b62cd75812d520f372be512c64711d5a3a4848151%40group.calendar.google.com/public/basic.ics';
let _saveTimer = null;

export const Storage = {
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data.version || data.version < CURRENT_VERSION) {
        const migrated = this.migrate(data, data.version || 0);
        this.saveNow(migrated);
        return migrated;
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
    try {
      localStorage.removeItem('learn.v1.scheduleCache');
      localStorage.removeItem('learn.v1.eventSubjectMap');
    } catch (_) {}
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
    if (fromVersion < 2) {
      const sessions = data.sessions || [];
      const needsTaskMigration = sessions.some(s => !Array.isArray(s.tasks) || s.tasks.length === 0);
      if (needsTaskMigration) {
        try {
          const json = JSON.stringify(data);
          const blob = new Blob([json], { type: 'application/json' });
          const url  = URL.createObjectURL(blob);
          const a    = document.createElement('a');
          a.href = url;
          a.download = `lernplattform-v1-backup-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`;
          a.rel = 'noopener';
          a.click();
          URL.revokeObjectURL(url);
        } catch (e) {
          console.warn('[Storage] v1 backup download skipped:', e);
        }
      }

      data.sessions = sessions.map(s => {
        if (Array.isArray(s.tasks) && s.tasks.length) return s;
        const dur = Math.round(Number(s.durationSeconds) || 0);
        const ended = s.endedAt || s.startedAt || new Date().toISOString();
        const started = s.startedAt || ended;
        const tid = (typeof crypto !== 'undefined' && crypto.randomUUID)
          ? crypto.randomUUID()
          : `t-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        const title = (typeof s.note === 'string' && s.note.trim()) ? s.note.trim().slice(0, 50) : 'Allgemein';
        return {
          ...s,
          durationSeconds: dur,
          tasks: [{
            id: tid,
            title,
            status: 'done',
            durationSeconds: dur,
            activeStartedAt: null,
            segments: [{ startedAt: started, endedAt: ended, seconds: dur }],
            createdAt: started,
            completedAt: ended,
            note: ''
          }]
        };
      });
      data.version = 2;
    }
    if (!data.schedulePrefs) {
      data.schedulePrefs = {
        source: 'ics-url',
        icsUrl: DEFAULT_ICS_URL,
        icsFileName: null,
        lastSyncedAt: null,
        lastError: null,
        eventCount: 0
      };
    }
    return data;
  }
};
