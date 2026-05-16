import { getLanguage, t } from './i18n.js';

export function uuid() {
  return crypto.randomUUID ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
      });
}

export function formatDuration(seconds, style = 'short') {
  if (!seconds || seconds < 0) return style === 'timer' ? '00:00:00' : '0m';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (style === 'timer') {
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }
  if (style === 'long') {
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function pad(n) { return String(n).padStart(2, '0'); }

function locale() {
  return ({ de: 'de-DE', en: 'en-US', fr: 'fr-FR' })[getLanguage()] || 'de-DE';
}

export function localeTag() {
  return locale();
}

export function formatDateDE(date) {
  const d = toTargetDate(date);
  return d.toLocaleDateString(locale(), {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    ...(hasOffset() ? { timeZone: 'UTC' } : {})
  });
}

export function formatDateShort(date) {
  const d = toTargetDate(date);
  return d.toLocaleDateString(locale(), {
    day: 'numeric', month: 'short',
    ...(hasOffset() ? { timeZone: 'UTC' } : {})
  });
}

export function formatDateFull(date) {
  const d = toTargetDate(date);
  return d.toLocaleDateString(locale(), {
    day: 'numeric', month: 'long', year: 'numeric',
    ...(hasOffset() ? { timeZone: 'UTC' } : {})
  });
}

export function formatTime(date) {
  const d = toTargetDate(date);
  return d.toLocaleTimeString(locale(), {
    hour: '2-digit', minute: '2-digit',
    ...(hasOffset() ? { timeZone: 'UTC' } : {})
  });
}

function toDate(v) {
  if (v instanceof Date) return v;
  return new Date(v);
}

function getUtcOffsetString() {
  const tz = localStorage.getItem('learn.tz_offset');
  return tz && /^[-+]\d{2}:\d{2}$/.test(tz) ? tz : null;
}

function parseOffsetMinutes(offset) {
  if (!offset) return null;
  const m = /^([+-])(\d{2}):(\d{2})$/.exec(offset);
  if (!m) return null;
  const sign = m[1] === '-' ? -1 : 1;
  return sign * (parseInt(m[2], 10) * 60 + parseInt(m[3], 10));
}

function hasOffset() {
  return !!getUtcOffsetString();
}

function toTargetDate(v) {
  const d = toDate(v);
  const offset = getUtcOffsetString();
  const mins = parseOffsetMinutes(offset);
  if (mins == null) return d;
  const utcMs = d.getTime() + d.getTimezoneOffset() * 60000;
  return new Date(utcMs + mins * 60000);
}

export function greeting(name) {
  const now = toTargetDate(new Date());
  const h = hasOffset() ? now.getUTCHours() : now.getHours();
  let g;
  if (h < 12) g = t('goodMorning');
  else if (h < 18) g = t('goodAfternoon');
  else g = t('goodEvening');
  return `${g}, ${name || 'Lukas'}`;
}

export function currentClock() {
  return formatTime(new Date());
}

export function isSameDay(a, b) {
  const da = toDate(a), db = toDate(b);
  return da.getFullYear() === db.getFullYear()
    && da.getMonth() === db.getMonth()
    && da.getDate() === db.getDate();
}

export function startOfDay(date) {
  const d = new Date(toDate(date));
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfDay(date) {
  const d = new Date(toDate(date));
  d.setHours(23, 59, 59, 999);
  return d;
}

export function daysUntil(isoDate) {
  const target = startOfDay(new Date(isoDate));
  const today  = startOfDay(new Date());
  return Math.ceil((target - today) / (1000 * 60 * 60 * 24));
}

export function getWeekMonday(date = new Date()) {
  const d = new Date(toDate(date));
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1 - day);
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date, n) {
  const d = new Date(toDate(date));
  d.setDate(d.getDate() + n);
  return d;
}

export function getWeekDays(weekMonday) {
  return Array.from({ length: 7 }, (_, i) => addDays(weekMonday, i));
}

export function getDayName(date, format = 'long') {
  return toDate(date).toLocaleDateString(locale(), { weekday: format });
}

export function isoDate(date = new Date()) {
  const d = toDate(date);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

let _phases = null;
export function setPhases(phases) { _phases = phases || null; }

export function applySubjectColors(subjects) {
  const root = document.documentElement;
  (subjects || []).forEach(s => {
    if (s.colorHex) root.style.setProperty(`--subject-${s.id}`, s.colorHex);
  });
}

export function getPhase(date = new Date()) {
  const d = toDate(date);
  const p1End = _phases?.p1End ? new Date(_phases.p1End) : new Date('2026-06-14');
  const p2End = _phases?.p2End ? new Date(_phases.p2End) : new Date('2026-06-30');
  if (d <= p1End) return { num: 1, label: t('phase1'), color: 'var(--subject-klr)' };
  if (d <= p2End) return { num: 2, label: t('phase2'), color: 'var(--subject-prog)' };
  return { num: 3, label: t('phase3'), color: 'var(--danger)' };
}

export function getStreak(sessions, dailyGoalMinutes) {
  if (!sessions.length) return 0;
  const byDay = groupByDay(sessions);
  const days = Object.keys(byDay).sort().reverse();
  let streak = 0;
  let check = startOfDay(new Date());
  for (let i = 0; i < 365; i++) {
    const key = isoDate(check);
    const daySeconds = (byDay[key] || []).reduce((s, x) => s + (x.durationSeconds || 0), 0);
    if (daySeconds >= dailyGoalMinutes * 60) {
      streak++;
      check = addDays(check, -1);
    } else if (streak === 0 && isSameDay(check, new Date())) {
      check = addDays(check, -1);
    } else {
      break;
    }
  }
  return streak;
}

export function groupByDay(sessions) {
  const map = {};
  sessions.forEach(s => {
    const key = isoDate(new Date(s.startedAt));
    if (!map[key]) map[key] = [];
    map[key].push(s);
  });
  return map;
}

export function getWeekSessions(sessions, weekMonday) {
  const start = startOfDay(weekMonday);
  const end = endOfDay(addDays(weekMonday, 6));
  return sessions.filter(s => {
    const t = new Date(s.startedAt);
    return t >= start && t <= end;
  });
}

export function getTodaySessions(sessions) {
  return sessions.filter(s => isSameDay(new Date(s.startedAt), new Date()));
}

export function getSubjectSessions(sessions, subjectId) {
  return sessions.filter(s => s.subjectId === subjectId);
}

export function sumDuration(sessions) {
  return sessions.reduce((t, s) => {
    if (s.tasks?.length) {
      const fromTasks = s.tasks.reduce((a, x) => a + (x.durationSeconds || 0), 0);
      if (fromTasks > 0) return t + fromTasks;
    }
    return t + (s.durationSeconds || 0);
  }, 0);
}

export function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export function throttle(fn, ms) {
  let last = 0;
  return (...args) => { const now = Date.now(); if (now - last >= ms) { last = now; fn(...args); } };
}

export function fuzzyMatch(needle, haystack) {
  if (!needle) return true;
  const n = needle.toLowerCase();
  const h = haystack.toLowerCase();
  let ni = 0;
  for (let hi = 0; hi < h.length && ni < n.length; hi++) {
    if (h[hi] === n[ni]) ni++;
  }
  return ni === n.length;
}

export function clamp(val, min, max) { return Math.min(Math.max(val, min), max); }

export function renderIcons(root = document) {
  if (window.lucide) window.lucide.createIcons({ nameAttr: 'data-lucide', root });
}

export function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToTime(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${pad(h)}:${pad(m)}`;
}

export function snapMinutes(mins, step = 15) {
  return Math.round(mins / step) * step;
}

export function playSound(type) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    if (type === 'start') {
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.15);
    } else {
      osc.frequency.setValueAtTime(660, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.2);
    }
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.25);
  } catch (_) {}
}

export function reviewDates(entry) {
  const INTERVALS = [1, 3, 7, 14];
  const created = new Date(entry.createdAt);
  const reviewCount = (entry.reviewedAt || []).length;
  if (reviewCount >= INTERVALS.length) return null;
  const due = addDays(created, INTERVALS[reviewCount]);
  return due;
}

export function isReviewDue(entry) {
  const due = reviewDates(entry);
  if (!due) return false;
  return due <= new Date();
}
