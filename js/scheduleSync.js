/**
 * ICS-Kalender-Sync (Google / Rapla) + lokaler Cache & Fach-Overrides.
 * Cache: localStorage learn.v1.scheduleCache
 * Overrides: localStorage learn.v1.eventSubjectMap (uid → subjectId)
 */

const CACHE_KEY = 'learn.v1.scheduleCache';
const OVERRIDE_KEY = 'learn.v1.eventSubjectMap';

const HEURISTICS = [
  [/klr|kosten|finanzbuch|fibu|kostenrechnung/i, 'klr'],
  [/mathe|mathematik|algebra|logik/i, 'math'],
  [/prog|programmierung|java|software/i, 'prog'],
  [/kbs|betriebssystem|rechnerarchitektur|grundlagen\s*it/i, 'kbs']
];

export function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return { events: [], lastSyncedAt: null };
    return JSON.parse(raw);
  } catch {
    return { events: [], lastSyncedAt: null };
  }
}

export function saveCache(events, lastSyncedAt) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ events: events || [], lastSyncedAt: lastSyncedAt || null }));
  } catch (e) {
    console.warn('[scheduleSync] cache write failed', e);
  }
}

export function loadOverrides() {
  try {
    const raw = localStorage.getItem(OVERRIDE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveOverrides(map) {
  localStorage.setItem(OVERRIDE_KEY, JSON.stringify(map || {}));
}

export function setEventSubjectOverride(eventId, subjectId) {
  const m = loadOverrides();
  if (!subjectId) delete m[eventId];
  else m[eventId] = subjectId;
  saveOverrides(m);
}

export function inferSubjectId(title, description = '') {
  const hay = `${title || ''} ${description || ''}`;
  for (const [re, id] of HEURISTICS) {
    if (re.test(hay)) return id;
  }
  return null;
}

export function enrichEvent(ev, overrides) {
  const sid = overrides[ev.id] || inferSubjectId(ev.title, ev.description);
  const color = sid ? `var(--subject-${sid})` : 'rgba(148,163,184,0.35)';
  return { ...ev, subjectId: sid || null, color };
}

export async function fetchIcsText(url) {
  let text;
  try {
    const r = await fetch(url, { mode: 'cors', cache: 'no-store' });
    if (r.ok) text = await r.text();
  } catch (_) { /* CORS */ }
  if (!text) {
    try {
      const proxied = `https://corsproxy.io/?${encodeURIComponent(url)}`;
      const r2 = await fetch(proxied, { cache: 'no-store' });
      if (r2.ok) text = await r2.text();
    } catch (_) {}
  }
  if (!text) {
    const err = new Error('FETCH_FAILED');
    err.code = 'FETCH_FAILED';
    throw err;
  }
  return text;
}

export function parseIcsToEvents(icsText, sourceTag) {
  if (!window.ICAL) {
    const e = new Error('ICAL_MISSING');
    e.code = 'ICAL_MISSING';
    throw e;
  }
  const jcal = ICAL.parse(icsText);
  const root = new ICAL.Component(jcal);
  const vevents = root.getAllSubcomponents('vevent');
  const out = [];
  for (const vc of vevents) {
    try {
      const ev = new ICAL.Event(vc);
      if (!ev.startDate) continue;
      const start = ev.startDate.toJSDate();
      const end = ev.endDate ? ev.endDate.toJSDate() : new Date(start.getTime() + 60 * 60 * 1000);
      const uid = (ev.uid && String(ev.uid)) || `${start.toISOString()}-${ev.summary || 'evt'}`;
      out.push({
        id: uid,
        title: ev.summary || 'Termin',
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        location: ev.location || '',
        description: String(vc.getFirstPropertyValue('description') || ''),
        source: sourceTag || 'ics-url',
        subjectId: null,
        color: null
      });
    } catch (_) { /* skip broken */ }
  }
  return out;
}

export function filterEventsForRange(events, rangeStart, rangeEnd) {
  const t0 = rangeStart.getTime();
  const t1 = rangeEnd.getTime();
  return (events || []).filter(e => {
    const t = new Date(e.startsAt).getTime();
    return t >= t0 && t <= t1;
  });
}

const SIX_H = 6 * 60 * 60 * 1000;

export function shouldAutoSync(lastSyncedAt) {
  if (!lastSyncedAt) return true;
  return Date.now() - new Date(lastSyncedAt).getTime() > SIX_H;
}
