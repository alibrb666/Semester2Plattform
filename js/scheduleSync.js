/**
 * ICS-Kalender-Sync (Google / Rapla) + lokaler Cache & Fach-Overrides.
 * Cache: localStorage learn.v1.scheduleCache
 * Overrides: localStorage learn.v1.eventSubjectMap (uid → subjectId)
 */

const CACHE_KEY = 'learn.v1.scheduleCache';
const OVERRIDE_KEY = 'learn.v1.eventSubjectMap';
let _userId = null;

function key(base) {
  return _userId ? `${base}:${_userId}` : base;
}

export function setUserId(userId) {
  _userId = userId || null;
}

const HEURISTICS = [
  [/klr|kosten|finanzbuch|fibu|kostenrechnung/i, 'klr'],
  [/mathe|mathematik|algebra|logik/i, 'math'],
  [/prog|programmierung|java|software/i, 'prog'],
  [/kbs|betriebssystem|rechnerarchitektur|grundlagen\s*it/i, 'kbs']
];

export function loadCache() {
  try {
    const raw = localStorage.getItem(key(CACHE_KEY)) || (_userId ? localStorage.getItem(CACHE_KEY) : null);
    if (!raw) return { events: [], lastSyncedAt: null };
    return JSON.parse(raw);
  } catch {
    return { events: [], lastSyncedAt: null };
  }
}

export function saveCache(events, lastSyncedAt) {
  try {
    localStorage.setItem(key(CACHE_KEY), JSON.stringify({ events: events || [], lastSyncedAt: lastSyncedAt || null }));
  } catch (e) {
    console.warn('[scheduleSync] cache write failed', e);
  }
}

export function loadOverrides() {
  try {
    const raw = localStorage.getItem(key(OVERRIDE_KEY)) || (_userId ? localStorage.getItem(OVERRIDE_KEY) : null);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveOverrides(map) {
  localStorage.setItem(key(OVERRIDE_KEY), JSON.stringify(map || {}));
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

const CORS_PROXIES = [
  url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  url => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  url => `https://cors-anywhere.herokuapp.com/${url}`,
];

export function normalizeIcsUrl(rawUrl) {
  const raw = String(rawUrl || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (url.hostname === 'calendar.google.com' && url.pathname === '/calendar/embed') {
      const src = url.searchParams.get('src');
      if (src) {
        return `https://calendar.google.com/calendar/ical/${encodeURIComponent(src)}/public/basic.ics`;
      }
    }
  } catch (_) {}
  return raw;
}

export async function fetchIcsText(url) {
  const fetchUrl = normalizeIcsUrl(url);
  // 1. Direkter Fetch
  try {
    const r = await fetch(fetchUrl, { mode: 'cors', cache: 'no-store' });
    if (r.ok) {
      const text = await r.text();
      if (text.includes('BEGIN:VCALENDAR')) return text;
    }
  } catch (_) {}

  // 2. Proxy-Fallback-Kette
  for (const proxyFn of CORS_PROXIES) {
    try {
      const r = await fetch(proxyFn(fetchUrl), {
        cache: 'no-store',
        headers: { 'Accept': 'text/calendar, text/plain, */*' }
      });
      if (r.ok) {
        const text = await r.text();
        if (text.includes('BEGIN:VCALENDAR')) return text;
      }
    } catch (_) {}
  }

  const err = new Error('FETCH_FAILED');
  err.code = 'FETCH_FAILED';
  throw err;
}

export function parseIcsToEvents(icsText, sourceTag) {
  if (!window.ICAL) {
    const e = new Error('ICAL_MISSING');
    e.code = 'ICAL_MISSING';
    throw e;
  }

  const jcal = ICAL.parse(icsText);
  const root  = new ICAL.Component(jcal);
  const out   = [];

  // Zeitfenster: 6 Monate zurück bis 6 Monate voraus
  const rangeStart = ICAL.Time.now();
  rangeStart.addDuration(ICAL.Duration.fromSeconds(-180 * 24 * 3600));
  const rangeEnd = ICAL.Time.now();
  rangeEnd.addDuration(ICAL.Duration.fromSeconds(180 * 24 * 3600));

  const vevents = root.getAllSubcomponents('vevent');

  for (const vc of vevents) {
    try {
      const ev = new ICAL.Event(vc);

      if (ev.isRecurring()) {
        const expand = new ICAL.RecurExpansion({
          component: vc,
          dtstart: ev.startDate
        });

        let next;
        let count = 0;
        const MAX = 200;

        while ((next = expand.next()) && count < MAX) {
          count++;
          if (next.compare(rangeEnd) > 0) break;
          if (next.compare(rangeStart) < 0) continue;

          const occurrence = ev.getOccurrenceDetails(next);
          const start = occurrence.startDate.toJSDate();
          const end   = occurrence.endDate
            ? occurrence.endDate.toJSDate()
            : new Date(start.getTime() + 60 * 60 * 1000);

          out.push({
            id: `${ev.uid}-${next.toICALString()}`,
            title: ev.summary || 'Termin',
            startsAt: start.toISOString(),
            endsAt:   end.toISOString(),
            location: ev.location || '',
            description: String(vc.getFirstPropertyValue('description') || ''),
            source: sourceTag || 'ics-url',
            subjectId: null,
            color: null
          });
        }
      } else {
        if (!ev.startDate) continue;
        const start = ev.startDate.toJSDate();
        const end   = ev.endDate
          ? ev.endDate.toJSDate()
          : new Date(start.getTime() + 60 * 60 * 1000);

        const startIcal = ev.startDate;
        if (startIcal.compare(rangeEnd) > 0) continue;
        if (ev.endDate && ev.endDate.compare(rangeStart) < 0) continue;

        out.push({
          id: String(ev.uid || `${start.toISOString()}-${ev.summary}`),
          title: ev.summary || 'Termin',
          startsAt: start.toISOString(),
          endsAt:   end.toISOString(),
          location: ev.location || '',
          description: String(vc.getFirstPropertyValue('description') || ''),
          source: sourceTag || 'ics-url',
          subjectId: null,
          color: null
        });
      }
    } catch (err) {
      console.warn('[scheduleSync] Überspringe Event:', err);
    }
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

export function shouldAutoSync(lastSyncedAt, intervalMinutes = 360) {
  if (!lastSyncedAt) return true;
  const intervalMs = intervalMinutes * 60 * 1000;
  return Date.now() - new Date(lastSyncedAt).getTime() > intervalMs;
}
