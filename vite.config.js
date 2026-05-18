import { defineConfig } from 'vite'

function icsProxyPlugin() {
  const handler = async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname !== '/api/ics') return false;

      const target = url.searchParams.get('url');
      if (!target) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: 'Missing url query parameter' }));
        return true;
      }
      let parsed;
      try { parsed = new URL(target); } catch {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: 'Invalid target URL' }));
        return true;
      }
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: 'Only http/https targets are allowed' }));
        return true;
      }

      const upstream = await fetch(parsed.toString(), {
        headers: { Accept: 'text/calendar, text/plain, */*' },
      });
      const text = await upstream.text();
      if (!upstream.ok) {
        res.statusCode = upstream.status;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: `Upstream returned ${upstream.status}` }));
        return true;
      }

      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(text);
      return true;
    } catch (err) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: String(err?.message || err) }));
      return true;
    }
  };

  return {
    name: 'ics-proxy',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const handled = await handler(req, res);
        if (!handled) next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const handled = await handler(req, res);
        if (!handled) next();
      });
    },
  };
}

function aiAskPlugin() {
  const json = (res, status, payload) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(payload));
  };

  const readBody = req => new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });

  const norm = s => String(s || '').toLowerCase().trim();
  const extractCount = (text, fallback = 5, min = 1, max = 20) => {
    const m = String(text || '').match(/\b(\d{1,2})\b/);
    if (!m) return fallback;
    const n = Number(m[1]);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
  };
  const sessionSeconds = s => {
    const fromTasks = Array.isArray(s?.tasks) ? s.tasks.reduce((a, t) => a + (Number(t?.durationSeconds) || 0), 0) : 0;
    return fromTasks > 0 ? fromTasks : (Number(s?.durationSeconds) || 0);
  };
  const fmtDuration = seconds => {
    const sec = Math.max(0, Math.round(Number(seconds) || 0));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };
  const fmtDate = iso => {
    if (!iso) return '-';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
  };
  const pickSubject = (q, subjects = []) => subjects.find(s => {
    const name = String(s?.name || '').toLowerCase();
    const id = String(s?.id || '').toLowerCase();
    return (name && q.includes(name)) || (id && q.includes(id));
  }) || null;

  const buildAppHelp = q => {
    const help = [
      { keys: ['session', 'sessions', 'tracker'], text: 'Session-Feature: Unten rechts im Session-Widget starten/pausieren/stoppen.' },
      { keys: ['statistik', 'statistics', 'chart'], text: 'Statistics: Wochenvergleich, Tageszeit-Muster, Soll/Ist, Session-Längen.' },
      { keys: ['todo', 'aufgabe'], text: 'Todos: Aufgaben anlegen, abhaken und für Planung nutzen.' },
      { keys: ['material', 'pdf'], text: 'Materials: Einträge mit optionalem PDF anlegen und Vorschau öffnen.' },
      { keys: ['mock', 'probeklausur'], text: 'Mocks: Ergebnisse eintragen und Trend sehen.' },
      { keys: ['stundenplan', 'schedule', 'ics'], text: 'Schedule: Blöcke und ICS-Termine verwalten.' }
    ];
    const hits = help.filter(h => h.keys.some(k => q.includes(k)));
    if (!hits.length) return 'Ich kann App-Features erklären: Sessions, Statistics, Todos, Materials, Mocks, Schedule.';
    return hits.map(h => `- ${h.text}`).join('\n');
  };

  const answer = (question, internalData = {}) => {
    const q = norm(question);
    const subjects = Array.isArray(internalData?.subjects) ? internalData.subjects : [];
    const sessions = Array.isArray(internalData?.sessions) ? internalData.sessions : [];
    const todos = Array.isArray(internalData?.todos) ? internalData.todos : [];
    const mocks = Array.isArray(internalData?.mocks) ? internalData.mocks : [];
    const subject = pickSubject(q, subjects);
    const filteredSessions = sessions
      .filter(s => !subject || s?.subjectId === subject.id)
      .sort((a, b) => new Date(b?.startedAt || 0) - new Date(a?.startedAt || 0));

    if (/(wie|wo|feature|funktion|hilfe|how|where|nutze|benutze)/.test(q)) {
      return `Intent: feature_help\nInterne App-Hilfe:\n${buildAppHelp(q)}\n\nHinweis: nur interne App-Daten.`;
    }
    if (/(letzte|last|älter|older|sessions|sessionen|verlauf)/.test(q) && /(session|sessions)/.test(q)) {
      const count = extractCount(q, 5);
      const rows = filteredSessions.slice(0, count);
      if (!rows.length) return `Intent: recent_sessions\nKeine Sessions${subject ? ` für ${subject.name}` : ''}.`;
      return `Intent: recent_sessions\nLetzte ${rows.length} Sessions${subject ? ` (${subject.name})` : ''}:\n` + rows.map((s, i) => {
        const sub = subjects.find(x => x.id === s.subjectId);
        return `${i + 1}. ${sub?.name || s.subjectId || 'Allgemein'} · ${fmtDate(s.startedAt)} · ${fmtDuration(sessionSeconds(s))}${s.note ? ` · "${s.note}"` : ''}`;
      }).join('\n');
    }
    if (/(was .*gelernt|gelernt hab|gelernt habe|what .*learned|fortschritt|statistik|statistics|zusammenfassung)/.test(q) || subject) {
      const sec = filteredSessions.reduce((a, s) => a + sessionSeconds(s), 0);
      const last = filteredSessions[0] || null;
      const relMocks = mocks.filter(m => !subject || m?.subjectId === subject.id);
      const openTodos = todos.filter(t => !t?.done && (!subject || t?.subjectId === subject.id));
      const doneTodos = todos.filter(t => t?.done && (!subject || t?.subjectId === subject.id));
      return [
        'Intent: learned_summary',
        `Lern-Überblick${subject ? ` für ${subject.name}` : ''}:`,
        `- Sessions: ${filteredSessions.length}`,
        `- Lernzeit gesamt: ${fmtDuration(sec)}`,
        `- Letzte Session: ${last ? `${fmtDate(last.startedAt)} (${fmtDuration(sessionSeconds(last))})` : '-'}`,
        `- Mocks: ${relMocks.length}`,
        `- Todos: ${doneTodos.length} erledigt, ${openTodos.length} offen`,
        '',
        'Hinweis: Antwort nur aus internen App-Daten.'
      ].join('\n');
    }
    return [
      'Intent: fallback',
      'Ich arbeite nur mit internen App-Daten.',
      '- "Was habe ich in Mathe gelernt?"',
      '- "Zeig mir meine letzten 5 Sessions"',
      '- "Wie nutze ich das Session-Feature?"'
    ].join('\n');
  };

  const handler = async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname !== '/api/ai/ask') return false;
      if (req.method !== 'POST') {
        json(res, 405, { error: 'Method not allowed' });
        return true;
      }
      const body = await readBody(req);
      const question = String(body?.question || '').trim();
      if (!question) {
        json(res, 400, { error: 'Missing question' });
        return true;
      }
      const text = answer(question, body?.internalData || {});
      json(res, 200, { ok: true, text });
      return true;
    } catch (err) {
      json(res, 500, { error: String(err?.message || err) });
      return true;
    }
  };

  return {
    name: 'ai-ask-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const handled = await handler(req, res);
        if (!handled) next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const handled = await handler(req, res);
        if (!handled) next();
      });
    }
  };
}

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/Semester2Plattform/' : '/',
  plugins: [icsProxyPlugin(), aiAskPlugin()],
  build: {
    outDir: 'dist',
    assetsDir: 'assets'
  },
  envDir: '.',
})
