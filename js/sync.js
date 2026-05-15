import { supabase } from './supabase.js';

const COLOR_MAP = {
  'var(--subject-klr)':  '#10B981',
  'var(--subject-math)': '#8B5CF6',
  'var(--subject-prog)': '#06B6D4',
  'var(--subject-kbs)':  '#F59E0B'
};
function resolveColor(c) { return COLOR_MAP[c] || c || '#8B5CF6'; }

const QUEUE_KEY = 'learn.sync_queue';

/* ── Offline queue ─────────────────────────────────────────── */
function getQueue() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch { return []; }
}
function saveQueue(q) {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch {}
}
function enqueue(entry) {
  const q = getQueue();
  q.push({ ...entry, qid: crypto.randomUUID(), ts: Date.now() });
  saveQueue(q);
}

async function processEntry(entry, userId) {
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
    case 'upsert-settings':    await upsertProfile(userId, data); break;
    default: break;
  }
}

export async function flushQueue(userId) {
  if (!navigator.onLine || !userId) return;
  const q = getQueue();
  if (!q.length) return;
  const remaining = [];
  for (const entry of q) {
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
    question: e.question || null,
    answer: e.answer || null,
    note: e.note || null,
    difficulty: e.difficulty || null,
    source: e.source || null,
    created_at: e.createdAt || new Date().toISOString(),
    is_demo: e.isDemo || false
  };
}

function mockToRow(m, userId) {
  return {
    id: m.id,
    user_id: userId,
    subject_id: m.subjectId || null,
    taken_at: m.takenAt || m.date || null,
    score: m.score ?? null,
    max_score: m.maxScore ?? null,
    duration_minutes: m.durationMinutes ?? null,
    notes: m.notes || null,
    is_demo: m.isDemo || false
  };
}

function subjectToRow(s, userId) {
  return {
    id: s.id,
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
    week_start: r.weekStart || null,
    notes: r.notes || null,
    rating: r.rating ?? null,
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
    note: r.note || '',
    createdAt: r.created_at
  };
}

function rowToError(r) {
  return {
    id: r.id,
    subjectId: r.subject_id,
    topic: r.topic || '',
    question: r.question || '',
    answer: r.answer || '',
    note: r.note || '',
    difficulty: r.difficulty || '',
    source: r.source || '',
    createdAt: r.created_at,
    isDemo: r.is_demo || false
  };
}

function rowToMock(r) {
  return {
    id: r.id,
    subjectId: r.subject_id,
    takenAt: r.taken_at,
    date: r.taken_at,
    score: r.score ?? null,
    maxScore: r.max_score ?? null,
    durationMinutes: r.duration_minutes ?? null,
    notes: r.notes || '',
    isDemo: r.is_demo || false
  };
}

function rowToSubject(r) {
  return {
    id: r.id,
    name: r.name || '',
    colorHex: r.color_hex || null,
    examDate: r.exam_date || null,
    color: r.color_hex ? r.color_hex : `var(--subject-${r.id})`
  };
}

function rowToReview(r) {
  return {
    id: r.id,
    weekStart: r.week_start,
    notes: r.notes || '',
    rating: r.rating ?? null,
    createdAt: r.created_at
  };
}

/* ── Profile (settings) ────────────────────────────────────── */
async function upsertProfile(userId, settings) {
  await supabase.from('profiles').upsert({
    id: userId,
    name: settings.name || '',
    settings,
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

    const settings = profile?.settings
      ? { ...defaultState.settings, ...profile.settings, name: profile.name || defaultState.settings.name }
      : defaultState.settings;

    return {
      ...defaultState,
      settings,
      subjects,
      sessions:      (sessionsRaw || []).map(rowToSession),
      todos:         (todosRaw    || []).map(rowToTodo),
      errorLog:      (errorsRaw   || []).map(rowToError),
      mocks:         (mocksRaw    || []).map(rowToMock),
      weeklyReviews: (reviewsRaw  || []).map(rowToReview)
    };
  } finally {
    setSyncing(false);
  }
}

/* ── Individual push operations ────────────────────────────── */
async function push(type, data, userId) {
  if (!userId) return;
  if (!navigator.onLine) { enqueue({ type, data }); return; }
  setSyncing(true);
  try {
    await processEntry({ type, data }, userId);
  } catch (err) {
    console.warn(`[Sync] ${type} failed, queuing:`, err.message);
    enqueue({ type, data });
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
      ...(localState.subjects || []).map(s => supabase.from('subjects').upsert(subjectToRow(s, userId)))
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
