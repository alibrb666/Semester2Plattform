import { Storage } from './storage.js';
import * as Sync from './sync.js';

let _state = {};
let _userId = null;
const _subs = new Set();

export const State = {
  init(data) { _state = data; },
  get() { return _state; },

  setUserId(id) { _userId = id; },
  getUserId()   { return _userId; },

  set(patch) {
    _state = { ..._state, ...patch };
    Storage.save(_state);
    _subs.forEach(fn => fn(_state));
  },

  update(key, updater) {
    const val = typeof updater === 'function' ? updater(_state[key]) : updater;
    this.set({ [key]: val });
  },

  subscribe(fn) {
    _subs.add(fn);
    return () => _subs.delete(fn);
  },

  /* Convenience getters */
  getSettings()     { return _state.settings       || {}; },
  getSessions()     { return _state.sessions        || []; },
  getSubjects()     { return _state.subjects        || []; },
  getBlocks()       { return _state.scheduleBlocks  || []; },
  getErrors()       { return _state.errorLog        || []; },
  getMocks()        { return _state.mocks           || []; },
  getReviews()      { return _state.weeklyReviews   || []; },
  getAchievements() { return _state.achievements    || {}; },
  getTodos()        { return _state.todos           || []; },

  getSubject(id) { return this.getSubjects().find(s => s.id === id); },

  addSession(session) {
    this.set({ sessions: [...this.getSessions(), session] });
    Sync.pushSession(session, _userId);
  },
  updateSession(id, patch) {
    this.set({ sessions: this.getSessions().map(s => s.id === id ? { ...s, ...patch } : s) });
    const updated = this.getSessions().find(s => s.id === id);
    if (updated) Sync.pushSession(updated, _userId);
  },
  removeSession(id) {
    this.set({ sessions: this.getSessions().filter(s => s.id !== id) });
    Sync.deleteSession(id, _userId);
  },

  addError(entry) {
    this.set({ errorLog: [...this.getErrors(), entry] });
    Sync.pushError(entry, _userId);
  },
  updateError(id, patch) {
    this.set({ errorLog: this.getErrors().map(e => e.id === id ? { ...e, ...patch } : e) });
    const updated = this.getErrors().find(e => e.id === id);
    if (updated) Sync.pushError(updated, _userId);
  },
  removeError(id) {
    this.set({ errorLog: this.getErrors().filter(e => e.id !== id) });
    Sync.deleteError(id, _userId);
  },

  addMock(mock) {
    this.set({ mocks: [...this.getMocks(), mock] });
    Sync.pushMock(mock, _userId);
  },
  updateMock(id, patch) {
    this.set({ mocks: this.getMocks().map(m => m.id === id ? { ...m, ...patch } : m) });
    const updated = this.getMocks().find(m => m.id === id);
    if (updated) Sync.pushMock(updated, _userId);
  },
  removeMock(id) {
    this.set({ mocks: this.getMocks().filter(m => m.id !== id) });
    Sync.deleteMock(id, _userId);
  },

  addTodo(todo) {
    this.set({ todos: [...this.getTodos(), todo] });
    Sync.pushTodo(todo, _userId);
  },
  updateTodo(id, patch) {
    this.set({ todos: this.getTodos().map(t => t.id === id ? { ...t, ...patch } : t) });
    const updated = this.getTodos().find(t => t.id === id);
    if (updated) Sync.pushTodo(updated, _userId);
  },
  removeTodo(id) {
    this.set({ todos: this.getTodos().filter(t => t.id !== id) });
    Sync.deleteTodo(id, _userId);
  },

  addSubject(subj) {
    this.set({ subjects: [...this.getSubjects(), subj] });
    Sync.pushSubject(subj, _userId);
  },
  updateSubject(id, patch) {
    this.set({ subjects: this.getSubjects().map(s => s.id === id ? { ...s, ...patch } : s) });
    const updated = this.getSubjects().find(s => s.id === id);
    if (updated) Sync.pushSubject(updated, _userId);
  },
  removeSubject(id) {
    this.set({ subjects: this.getSubjects().filter(s => s.id !== id) });
    Sync.deleteSubject(id, _userId);
  },

  updateSettings(patch) {
    this.set({ settings: { ...this.getSettings(), ...patch } });
    Sync.pushSettings(this.getSettings(), _userId);
  },

  addWeeklyReview(review) {
    this.set({ weeklyReviews: [...this.getReviews(), review] });
    Sync.pushReview(review, _userId);
  },

  updateAchievements(patch) {
    this.set({ achievements: { ...this.getAchievements(), ...patch } });
    // Achievements stored in localStorage only (no Supabase table)
  },

  /* Schedule blocks — localStorage only, no Supabase */
  addBlock(block)           { this.set({ scheduleBlocks: [...this.getBlocks(), block] }); },
  updateBlock(id, patch)    { this.set({ scheduleBlocks: this.getBlocks().map(b => b.id === id ? { ...b, ...patch } : b) }); },
  removeBlock(id)           { this.set({ scheduleBlocks: this.getBlocks().filter(b => b.id !== id) }); },

  /* Schedule prefs — localStorage only */
  patchSchedulePrefs(patch) {
    const st = this.get();
    this.set({
      ...st,
      schedulePrefs: {
        source: 'manual', icsUrl: '', icsFileName: null,
        lastSyncedAt: null, lastError: null, eventCount: 0, syncIntervalMinutes: 60,
        ...(st.schedulePrefs || {}),
        ...patch
      }
    });
  },

  removeDemoEntries() {
    const removed = {
      sessions: this.getSessions().filter(s => !s.isDemo),
      errorLog: this.getErrors().filter(e => !e.isDemo),
      mocks: this.getMocks().filter(m => !m.isDemo)
    };
    this.set(removed);
    // No Supabase delete needed — demo entries were never pushed (isDemo=true filtered in push)
  },

  hasDemoEntries() {
    return this.getSessions().some(s => s.isDemo)
      || this.getErrors().some(e => e.isDemo)
      || this.getMocks().some(m => m.isDemo);
  }
};
