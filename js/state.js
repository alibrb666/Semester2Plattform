import { Storage } from './storage.js';

let _state = {};
const _subs = new Set();

export const State = {
  init(data) { _state = data; },
  get() { return _state; },

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
  getSettings()  { return _state.settings  || {}; },
  getSessions()  { return _state.sessions  || []; },
  getSubjects()  { return _state.subjects  || []; },
  getBlocks()    { return _state.scheduleBlocks || []; },
  getErrors()    { return _state.errorLog  || []; },
  getMocks()     { return _state.mocks     || []; },
  getReviews()   { return _state.weeklyReviews || []; },
  getAchievements() { return _state.achievements || {}; },

  getSubject(id) { return this.getSubjects().find(s => s.id === id); },

  addSession(session) {
    this.set({ sessions: [...this.getSessions(), session] });
  },
  addError(entry) {
    this.set({ errorLog: [...this.getErrors(), entry] });
  },
  addMock(mock) {
    this.set({ mocks: [...this.getMocks(), mock] });
  },
  addBlock(block) {
    this.set({ scheduleBlocks: [...this.getBlocks(), block] });
  },
  updateBlock(id, patch) {
    this.set({ scheduleBlocks: this.getBlocks().map(b => b.id === id ? { ...b, ...patch } : b) });
  },
  removeBlock(id) {
    this.set({ scheduleBlocks: this.getBlocks().filter(b => b.id !== id) });
  },
  updateError(id, patch) {
    this.set({ errorLog: this.getErrors().map(e => e.id === id ? { ...e, ...patch } : e) });
  },
  removeError(id) {
    this.set({ errorLog: this.getErrors().filter(e => e.id !== id) });
  },
  updateSession(id, patch) {
    this.set({ sessions: this.getSessions().map(s => s.id === id ? { ...s, ...patch } : s) });
  },
  removeSession(id) {
    this.set({ sessions: this.getSessions().filter(s => s.id !== id) });
  },
  updateMock(id, patch) {
    this.set({ mocks: this.getMocks().map(m => m.id === id ? { ...m, ...patch } : m) });
  },
  removeMock(id) {
    this.set({ mocks: this.getMocks().filter(m => m.id !== id) });
  },
  updateSettings(patch) {
    this.set({ settings: { ...this.getSettings(), ...patch } });
  },
  addWeeklyReview(review) {
    this.set({ weeklyReviews: [...this.getReviews(), review] });
  },
  updateAchievements(patch) {
    this.set({ achievements: { ...this.getAchievements(), ...patch } });
  }
};
