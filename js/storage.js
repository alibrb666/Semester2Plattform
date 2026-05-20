const KEY = 'learn.v1';
const CURRENT_VERSION = 2;
const BACKUP_PREFIX = 'learn.v1.backup';
const BACKUP_INDEX_PREFIX = 'learn.v1.backup_index';
const MAX_BACKUPS = 5;
const BACKUP_INTERVAL_MS = 2 * 60 * 1000;
let _saveTimer = null;
let _userId = null;
let _lastBackupAt = 0;

function storageKey() {
  return _userId ? `${KEY}:${_userId}` : KEY;
}

function backupIndexKey() {
  return _userId ? `${BACKUP_INDEX_PREFIX}:${_userId}` : BACKUP_INDEX_PREFIX;
}

function backupDataKey(ts) {
  return _userId ? `${BACKUP_PREFIX}:${_userId}:${ts}` : `${BACKUP_PREFIX}:${ts}`;
}

export const Storage = {
  setUserId(userId) {
    _userId = userId || null;
  },

  load(options = {}) {
    const { allowLegacy = true } = options;
    try {
      const raw = localStorage.getItem(storageKey()) || (allowLegacy && _userId ? localStorage.getItem(KEY) : null);
      if (!raw) return this._loadLatestBackup();
      const data = JSON.parse(raw);
      if (!data.version || data.version < CURRENT_VERSION) {
        const migrated = this.migrate(data, data.version || 0);
        this.saveNow(migrated);
        return migrated;
      }
      return data;
    } catch (e) {
      console.error('[Storage] load failed:', e);
      return this._loadLatestBackup();
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
      const raw = JSON.stringify(data);
      localStorage.setItem(storageKey(), raw);
      this._writeBackup(raw);
    } catch (e) {
      if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
        console.warn('[Storage] Quota exceeded – trimming old sessions');
        try {
          const trimmed = { ...data, sessions: (data.sessions || []).slice(-200) };
          const raw = JSON.stringify(trimmed);
          localStorage.setItem(storageKey(), raw);
          this._writeBackup(raw);
        } catch (_) {}
      }
    }
  },

  _writeBackup(rawState) {
    const now = Date.now();
    if (now - _lastBackupAt < BACKUP_INTERVAL_MS) return;
    _lastBackupAt = now;
    try {
      const idxKey = backupIndexKey();
      const idx = JSON.parse(localStorage.getItem(idxKey) || '[]');
      const next = [...idx, now].slice(-MAX_BACKUPS);
      localStorage.setItem(backupDataKey(now), rawState);
      localStorage.setItem(idxKey, JSON.stringify(next));
      const stale = idx.slice(0, Math.max(0, idx.length - (MAX_BACKUPS - 1)));
      stale.forEach(ts => localStorage.removeItem(backupDataKey(ts)));
    } catch (e) {
      console.warn('[Storage] backup write skipped:', e?.message || e);
    }
  },

  _loadLatestBackup() {
    try {
      const idx = JSON.parse(localStorage.getItem(backupIndexKey()) || '[]');
      const latest = idx[idx.length - 1];
      if (!latest) return null;
      const raw = localStorage.getItem(backupDataKey(latest));
      if (!raw) return null;
      const data = JSON.parse(raw);
      console.warn('[Storage] Main state missing/broken, restored latest local backup.');
      return data;
    } catch {
      return null;
    }
  },

  clear() {
    if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = null; }
    localStorage.removeItem(storageKey());
    try {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (
          k === KEY ||
          k === BACKUP_INDEX_PREFIX ||
          k === 'learn.sync_queue' ||
          k === 'learn.profiles' ||
          k === 'learn.blocked_profile_ids' ||
          k.startsWith(`${KEY}:`) ||
          k.startsWith(`${BACKUP_PREFIX}:`) ||
          k.startsWith(`${BACKUP_INDEX_PREFIX}:`)
        ) keys.push(k);
      }
      keys.forEach(k => localStorage.removeItem(k));
    } catch (_) {}
    try {
      const idx = JSON.parse(localStorage.getItem(backupIndexKey()) || '[]');
      idx.forEach(ts => localStorage.removeItem(backupDataKey(ts)));
      localStorage.removeItem(backupIndexKey());
      _lastBackupAt = 0;
    } catch (_) {}
    try {
      localStorage.removeItem('learn.v1.scheduleCache');
      localStorage.removeItem('learn.v1.eventSubjectMap');
    } catch (_) {}
  },

  migrate(data, fromVersion) {
    if (fromVersion < 1) {
      data.version = 1;
      data.settings = { name:'Lukas', theme:'light', sidebarCollapsed:false,
        dailyGoalMinutes:240, weeklyGoals:{klr:360,math:390,prog:360,kbs:300},
        soundEnabled:true, notificationsEnabled:false, streakFreezeUsed:false, language:'de', ...data.settings };
      data.subjects    = data.subjects    || [];
      data.sessions    = data.sessions    || [];
      data.scheduleBlocks = data.scheduleBlocks || [];
      data.errorLog    = data.errorLog    || [];
      data.mocks       = data.mocks       || [];
      data.materials   = data.materials   || [];
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
        source: 'manual',
        icsUrl: '',
        icsFileName: null,
        lastSyncedAt: null,
        lastError: null,
        eventCount: 0
      };
    }
    if (!Array.isArray(data.materials)) data.materials = [];
    data.settings = { language: 'de', ...(data.settings || {}) };
    return data;
  }
};
