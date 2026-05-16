import { supabase } from './supabase.js';
import * as scheduleSync from './scheduleSync.js';

const COLOR_MAP = {
  'var(--subject-klr)':  '#10B981',
  'var(--subject-math)': '#8B5CF6',
  'var(--subject-prog)': '#06B6D4',
  'var(--subject-kbs)':  '#F59E0B'
};
function resolveColor(c) { return COLOR_MAP[c] || c || '#8B5CF6'; }

const QUEUE_KEY = 'learn.sync_queue';
const APP_DATA_KEY = '__appData';

/* ── Offline queue ─────────────────────────────────────────── */
function getQueue() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch { return []; }
}
function saveQueue(q) {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch {}
}
function enqueue(entry, userId) {
  const q = getQueue();
  q.push({ ...entry, userId, qid: crypto.randomUUID(), ts: Date.now() });
  saveQueue(q);
}

async function processEntry(entry, userId) {
  userId = entry.userId || userId;
  const { type, data } = entry;
  switch (type) {
    case 'upsert-session':     await supabase.from('sessions').upsert(sessionToRow(data, userId)); break;
    case 'upsert-todo':        await supabase.from('todos').upsert(todoToRow(data, userId)); break;
    case 'upsert-error':       await supabase.from('error_log').upsert(errorToRow(data, userId)); break;
    case 'upsert-mock':        await supabase.from('mocks').upsert(mockToRow(data, userId)); break;
    case 'upsert-subject':     await supabase.from('subjects').upsert(subjectToRow(data, userId)); break;
    case 'upsert-review':      await supabase.from('weekly_reviews').upsert(reviewToRow(data, userId)); break;
    case 'delete-session':     await supabase.from('sessions').delete().eq('id', data.id).eq('user_id', userId); break;
    case 'delete-todo':        await supabase.from('todos').delete().eq('id', data.id).eq('user_id', userId); break;
    case 'delete-error':       await supabase.from('error_log').delete().eq('id', data.id).eq('user_id', userId); break;
    case 'delete-mock':        await supabase.from('mocks').delete().eq('id', data.id).eq('user_id', userId); break;
    case 'delete-subject':     await supabase.from('subjects').delete().eq('id', data.id).eq('user_id', userId); break;
    case 'upsert-settings':    await upsertProfileSettings(userId, data); break;
    case 'upsert-profile-data': await upsertProfileState(userId, data); break;
    default: break;
  }
}

export async function flushQueue(userId) {
  if (!navigator.onLine || !userId) return;
  const q = getQueue();
  if (!q.length) return;
  const remaining = [];
  for (const entry of q) {
    if (entry.userId && entry.userId !== userId) {
      remaining.push(entry);
      continue;
    }
    try { await processEntry(entry, userId); }
    catch { remaining.push(entry); }
  }
  saveQueue(remaining);
}

/* ── Row mappers: state → Supabase ────────────────────────── */
function sessionToRow(s, userId) {
  return {
    id: s.id,
    user_id: userId,
    subject_id: s.subjectId || null,
    started_at: s.startedAt || null,
    ended_at: s.endedAt || null,
    duration_seconds: s.durationSeconds || 0,
    note: s.note || null,
    tags: s.tags || [],
    rating: s.rating || 0,
    tasks: s.tasks || [],
    is_demo: s.isDemo || false
  };
}

function todoToRow(t, userId) {
  return {
    id: t.id,
    user_id: userId,
    subject_id: t.subjectId || null,
    title: t.title || '',
    due_date: t.dueDate || null,
    priority: t.priority || 'medium',
    done: t.done || false,
    done_at: t.doneAt || null,
    note: t.note || null,
    created_at: t.createdAt || new Date().toISOString()
  };
}

function errorToRow(e, userId) {
  return {
    id: e.id,
    user_id: userId,
    subject_id: e.subjectId || null,
    topic: e.topic || null,
    category: e.category || 'concept',
    description: e.description || '',
    resolution: e.resolution || '',
    reviewed_at: e.reviewedAt || [],
    repeated: e.repeated || 0,
    created_at: e.createdAt || new Date().toISOString(),
    is_demo: e.isDemo || false
  };
}

function mockToRow(m, userId) {
  return {
    id: m.id,
    user_id: userId,
    subject_id: m.subjectId || null,
    date: m.takenAt || m.date || null,
    score: m.score ?? null,
    max_score: m.maxScore ?? null,
    note: m.note || m.notes || '',
    is_demo: m.isDemo || false
  };
}

function shortHash(input) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function subjectRowId(s, userId) {
  const base = String(userId || '').replace(/-/g, '').padEnd(32, '0').slice(0, 24);
  const hex = `${base}${shortHash(s.id || s.slug || s.name || 'subject')}`;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function subjectToRow(s, userId) {
  return {
    id: subjectRowId(s, userId),
    user_id: userId,
    slug: s.id,
    name: s.name || '',
    color: resolveColor(s.colorHex || s.color),
    color_hex: resolveColor(s.colorHex || s.color),
    exam_date: s.examDate || null,
    weekly_goal_minutes: s.weeklyGoalMinutes || 360
  };
}

function reviewToRow(r, userId) {
  return {
    id: r.id,
    user_id: userId,
    date: r.date || r.weekStart || r.createdAt || new Date().toISOString(),
    good: r.good || '',
    gap: r.gap || '',
    created_at: r.createdAt || new Date().toISOString()
  };
}

/* ── Row mappers: Supabase → state ────────────────────────── */
function rowToSession(r) {
  return {
    id: r.id,
    subjectId: r.subject_id,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    durationSeconds: r.duration_seconds || 0,
    note: r.note || '',
    tags: r.tags || [],
    rating: r.rating || 0,
    tasks: r.tasks || [],
    isDemo: r.is_demo || false
  };
}

function rowToTodo(r) {
  return {
    id: r.id,
    subjectId: r.subject_id,
    title: r.title || '',
    dueDate: r.due_date || null,
    priority: r.priority || 'medium',
    done: r.done || false,
    doneAt: r.done_at || null,
    note: r.note || '',
    createdAt: r.created_at
  };
}

function rowToError(r) {
  return {
    id: r.id,
    subjectId: r.subject_id,
    topic: r.topic || '',
    category: r.category || 'concept',
    description: r.description || '',
    resolution: r.resolution || '',
    reviewedAt: r.reviewed_at || [],
    repeated: r.repeated || 0,
    createdAt: r.created_at,
    isDemo: r.is_demo || false
  };
}

function rowToMock(r) {
  return {
    id: r.id,
    subjectId: r.subject_id,
    takenAt: r.date,
    date: r.date,
    score: r.score ?? null,
    maxScore: r.max_score ?? null,
    note: r.note || '',
    isDemo: r.is_demo || false
  };
}

function rowToSubject(r) {
  const slug = r.slug || r.id;
  return {
    id: slug,
    name: r.name || '',
    colorHex: r.color_hex || null,
    examDate: r.exam_date || null,
    color: r.color_hex ? r.color_hex : `var(--subject-${slug})`
  };
}

function rowToReview(r) {
  return {
    id: r.id,
    date: r.date,
    good: r.good || '',
    gap: r.gap || '',
    createdAt: r.created_at
  };
}

/* ── Profile (settings) ────────────────────────────────────── */
function splitProfileSettings(raw = {}) {
  const { [APP_DATA_KEY]: appData = {}, ...settings } = raw || {};
  return { settings, appData };
}

function buildAppData(state) {
  const mockPdfById = {};
  (state.mocks || []).forEach(m => {
    if (m?.id && m?.pdfAttachment?.dataUrl) mockPdfById[m.id] = m.pdfAttachment;
  });
  return {
    schedulePrefs: state.schedulePrefs || null,
    scheduleBlocks: state.scheduleBlocks || [],
    achievements: state.achievements || {},
    materials: state.materials || [],
    mockPdfById,
    scheduleCache: scheduleSync.loadCache(),
    eventSubjectMap: scheduleSync.loadOverrides()
  };
}

async function upsertProfileSettings(userId, settings) {
  const current = await supabase.from('profiles').select('settings').eq('id', userId).single();
  const appData = current.data?.settings?.[APP_DATA_KEY] || {};
  await supabase.from('profiles').upsert({
    id: userId,
    name: settings.name || '',
    settings: { ...settings, [APP_DATA_KEY]: appData },
    updated_at: new Date().toISOString()
  });
}

async function upsertProfileState(userId, state) {
  const settings = state.settings || {};
  await supabase.from('profiles').upsert({
    id: userId,
    name: settings.name || '',
    settings: { ...settings, [APP_DATA_KEY]: buildAppData(state) },
    updated_at: new Date().toISOString()
  });
}

/* ── Load all data ─────────────────────────────────────────── */
export async function loadAllData(userId, defaultState) {
  setSyncing(true);
  try {
    const [
      { data: sessionsRaw },
      { data: todosRaw },
      { data: errorsRaw },
      { data: mocksRaw },
      { data: reviewsRaw },
      { data: subjectsRaw },
      { data: profile }
    ] = await Promise.all([
      supabase.from('sessions').select('*').eq('user_id', userId).order('started_at', { ascending: false }),
      supabase.from('todos').select('*').eq('user_id', userId),
      supabase.from('error_log').select('*').eq('user_id', userId),
      supabase.from('mocks').select('*').eq('user_id', userId),
      supabase.from('weekly_reviews').select('*').eq('user_id', userId),
      supabase.from('subjects').select('*').eq('user_id', userId),
      supabase.from('profiles').select('*').eq('id', userId).single()
    ]);

    const remoteSubjects = (subjectsRaw || []).map(rowToSubject);
    const subjects = remoteSubjects.length ? remoteSubjects : defaultState.subjects;

    // If no subjects in DB yet, seed them
    if (!remoteSubjects.length && defaultState.subjects?.length) {
      try {
        const results = await Promise.all(
          defaultState.subjects.map(s => supabase.from('subjects').upsert(subjectToRow(s, userId)))
        );
        results.forEach(({ error }) => { if (error) console.warn('[Sync] subjects:', error.message); });
      } catch (e) {
        console.warn('[Sync] subjects exception:', e);
      }
    }

    const { settings: profileSettings, appData } = splitProfileSettings(profile?.settings || {});

    if (appData.scheduleCache) {
      scheduleSync.saveCache(appData.scheduleCache.events || [], appData.scheduleCache.lastSyncedAt || null);
    }
    if (appData.eventSubjectMap) {
      scheduleSync.saveOverrides(appData.eventSubjectMap);
    }

    const hasProfileSettings = Object.keys(profileSettings || {}).length > 0;
    const settings = hasProfileSettings
      ? { ...defaultState.settings, ...profileSettings, name: profile.name || profileSettings.name || defaultState.settings.name }
      : defaultState.settings;

    const mockPdfById = appData.mockPdfById || {};
    const mocks = (mocksRaw || []).map(rowToMock).map(m => ({
      ...m,
      pdfAttachment: mockPdfById[m.id] || null
    }));

    return {
      ...defaultState,
      settings,
      subjects,
      schedulePrefs: appData.schedulePrefs || defaultState.schedulePrefs,
      scheduleBlocks: appData.scheduleBlocks || defaultState.scheduleBlocks || [],
      achievements: appData.achievements || defaultState.achievements || {},
      materials: appData.materials || defaultState.materials || [],
      sessions:      (sessionsRaw || []).map(rowToSession),
      todos:         (todosRaw    || []).map(rowToTodo),
      errorLog:      (errorsRaw   || []).map(rowToError),
      mocks,
      weeklyReviews: (reviewsRaw  || []).map(rowToReview)
    };
  } finally {
    setSyncing(false);
  }
}

/* ── Individual push operations ────────────────────────────── */
async function push(type, data, userId) {
  if (!userId) return;
  if (!navigator.onLine) { enqueue({ type, data }, userId); return; }
  setSyncing(true);
  try {
    await processEntry({ type, data }, userId);
  } catch (err) {
    console.warn(`[Sync] ${type} failed, queuing:`, err.message);
    enqueue({ type, data }, userId);
  } finally {
    setSyncing(false);
  }
}

export const pushSession  = (s, uid) => push('upsert-session', s, uid);
export const pushTodo     = (t, uid) => push('upsert-todo', t, uid);
export const pushError    = (e, uid) => push('upsert-error', e, uid);
export const pushMock     = (m, uid) => push('upsert-mock', m, uid);
export const pushSubject  = (s, uid) => push('upsert-subject', s, uid);
export const pushReview   = (r, uid) => push('upsert-review', r, uid);
export const pushSettings = (settings, uid) => push('upsert-settings', settings, uid);
export const pushProfileState = (state, uid) => push('upsert-profile-data', state, uid);

export const deleteSession = (id, uid) => push('delete-session', { id }, uid);
export const deleteTodo    = (id, uid) => push('delete-todo', { id }, uid);
export const deleteError   = (id, uid) => push('delete-error', { id }, uid);
export const deleteMock    = (id, uid) => push('delete-mock', { id }, uid);
export const deleteSubject = (id, uid) => push('delete-subject', { id }, uid);

/* ── Migration: push existing localStorage data ────────────── */
export async function migrateLocalData(localState, userId) {
  setSyncing(true);
  try {
    const batches = [
      ...(localState.sessions || []).filter(s => !s.isDemo).map(s => supabase.from('sessions').upsert(sessionToRow(s, userId))),
      ...(localState.todos    || []).map(t => supabase.from('todos').upsert(todoToRow(t, userId))),
      ...(localState.errorLog || []).filter(e => !e.isDemo).map(e => supabase.from('error_log').upsert(errorToRow(e, userId))),
      ...(localState.mocks    || []).filter(m => !m.isDemo).map(m => supabase.from('mocks').upsert(mockToRow(m, userId))),
      ...(localState.subjects || []).map(s => supabase.from('subjects').upsert(subjectToRow(s, userId))),
      supabase.from('profiles').upsert({
        id: userId,
        name: localState.settings?.name || '',
        settings: { ...(localState.settings || {}), [APP_DATA_KEY]: buildAppData(localState) },
        updated_at: new Date().toISOString()
      })
    ];
    // Run in chunks to avoid overwhelming the API
    const CHUNK = 20;
    for (let i = 0; i < batches.length; i += CHUNK) {
      await Promise.all(batches.slice(i, i + CHUNK));
    }
  } finally {
    setSyncing(false);
  }
}

/* ── Sync indicator ────────────────────────────────────────── */
let _syncCount = 0;
function setSyncing(on) {
  _syncCount = Math.max(0, _syncCount + (on ? 1 : -1));
  const dot = document.getElementById('sync-dot');
  if (dot) dot.dataset.active = _syncCount > 0 ? 'true' : 'false';
}

/* ── Offline banner ────────────────────────────────────────── */
export function initOfflineHandling(userId) {
  const updateBanner = () => {
    const banner = document.getElementById('offline-banner');
    if (banner) banner.hidden = navigator.onLine;
  };
  updateBanner();
  window.addEventListener('online', () => {
    updateBanner();
    flushQueue(userId);
  });
  window.addEventListener('offline', updateBanner);
}
