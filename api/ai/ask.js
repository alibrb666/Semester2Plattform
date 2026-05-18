function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function getBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return {};
}

function norm(s) {
  return String(s || '').toLowerCase().trim();
}

function extractCount(text, fallback = 5, min = 1, max = 20) {
  const m = text.match(/\b(\d{1,2})\b/);
  if (!m) return fallback;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function sessionSeconds(s) {
  const fromTasks = Array.isArray(s?.tasks)
    ? s.tasks.reduce((a, t) => a + (Number(t?.durationSeconds) || 0), 0)
    : 0;
  return fromTasks > 0 ? fromTasks : (Number(s?.durationSeconds) || 0);
}

function fmtDuration(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function fmtDate(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
}

function pickSubject(questionLower, subjects) {
  const hit = (subjects || []).find(s => {
    const name = String(s?.name || '').toLowerCase();
    const id = String(s?.id || '').toLowerCase();
    return (name && questionLower.includes(name)) || (id && questionLower.includes(id));
  });
  return hit || null;
}

const INTENTS = {
  FEATURE_HELP: 'feature_help',
  RECENT_SESSIONS: 'recent_sessions',
  LEARNED_SUMMARY: 'learned_summary',
  WEAK_AREAS: 'weak_areas',
  TODAY_PLAN: 'today_plan',
  FALLBACK: 'fallback'
};

function buildAppHelp(questionLower) {
  const help = [
    {
      keys: ['session', 'sessions', 'lernen starten', 'tracker', 'stoppen', 'pausieren'],
      text: 'Session-Feature: Unten rechts im Session-Widget starten/pausieren/stoppen. Nach Stop kannst du Notiz, Tags und Rating speichern.'
    },
    {
      keys: ['statistik', 'statistics', 'chart', 'auswertung'],
      text: 'Statistik-Feature: In der Ansicht "Statistics" siehst du Wochenvergleich, Tageszeit-Muster, Soll/Ist und Session-Längen.'
    },
    {
      keys: ['todo', 'aufgabe', 'tasks'],
      text: 'Todo-Feature: In "Todos" Aufgaben anlegen und abhaken. Offene Todos kannst du für Lernplanung nutzen.'
    },
    {
      keys: ['material', 'pdf', 'dokument'],
      text: 'Material-Feature: In "Materials" Einträge mit optionalem PDF anlegen. PDFs können dort direkt in der Vorschau geöffnet werden.'
    },
    {
      keys: ['mock', 'probeklausur'],
      text: 'Mock-Feature: In "Mocks" Ergebnisse eintragen und Trends verfolgen.'
    },
    {
      keys: ['stundenplan', 'schedule', 'kalender', 'ics'],
      text: 'Schedule-Feature: In "Schedule" manuelle Blöcke oder ICS-Termine nutzen und Fächer zuordnen.'
    }
  ];
  const hits = help.filter(h => h.keys.some(k => questionLower.includes(k)));
  if (!hits.length) {
    return 'Ich kann App-Features erklären (Sessions, Statistics, Todos, Materials, Mocks, Schedule). Sag mir einfach welches Feature du meinst.';
  }
  return hits.map(h => `- ${h.text}`).join('\n');
}

function detectIntent(q) {
  const isHelp = /(wie|wo|feature|funktion|hilfe|how|where|nutze|benutze)/.test(q);
  const isRecentSessions = /(letzte|last|älter|older|sessions|sessionen|verlauf)/.test(q) && /(session|sessions)/.test(q);
  const isWeakAreas = /(schwach|weak|problem|lücke|gap|schwerpunkte?)/.test(q);
  const isTodayPlan = /(heute|today|plan|empfehl|vorschlag|was soll ich lernen)/.test(q);
  const isLearned = /(was .*gelernt|gelernt hab|gelernt habe|what .*learned|fortschritt|statistik|statistics|zusammenfassung)/.test(q);
  if (isHelp) return INTENTS.FEATURE_HELP;
  if (isRecentSessions) return INTENTS.RECENT_SESSIONS;
  if (isWeakAreas) return INTENTS.WEAK_AREAS;
  if (isTodayPlan) return INTENTS.TODAY_PLAN;
  if (isLearned) return INTENTS.LEARNED_SUMMARY;
  return INTENTS.FALLBACK;
}

function answerFromInternalData(question, internalData) {
  const q = norm(question);
  const subjects = Array.isArray(internalData?.subjects) ? internalData.subjects : [];
  const sessions = Array.isArray(internalData?.sessions) ? internalData.sessions : [];
  const todos = Array.isArray(internalData?.todos) ? internalData.todos : [];
  const mocks = Array.isArray(internalData?.mocks) ? internalData.mocks : [];
  const intent = detectIntent(q);

  const subject = pickSubject(q, subjects);
  const subjectIds = new Set(subject ? [subject.id] : subjects.map(s => s.id));
  const filteredSessions = sessions
    .filter(s => !subject || s?.subjectId === subject.id)
    .sort((a, b) => new Date(b?.startedAt || 0) - new Date(a?.startedAt || 0));
  const isSubjectOnlyQuery = !!subject && intent === INTENTS.FALLBACK;
  const effectiveIntent = isSubjectOnlyQuery ? INTENTS.LEARNED_SUMMARY : intent;

  if (effectiveIntent === INTENTS.FEATURE_HELP) {
    return {
      text: [
        'Intent: feature_help',
        'Interne App-Hilfe:',
        buildAppHelp(q),
        '',
        'Hinweis: Diese Antwort basiert nur auf App-Funktionen, nicht auf externem Wissen.'
      ].join('\n')
    };
  }

  if (effectiveIntent === INTENTS.RECENT_SESSIONS) {
    const count = extractCount(q, 5);
    const rows = filteredSessions.slice(0, count);
    if (!rows.length) {
      return {
        text: `Intent: recent_sessions\nIch finde keine Sessions${subject ? ` für ${subject.name}` : ''}.`
      };
    }
    const lines = rows.map((s, i) => {
      const sub = subjects.find(x => x.id === s.subjectId);
      return `${i + 1}. ${sub?.name || s.subjectId || 'Allgemein'} · ${fmtDate(s.startedAt)} · ${fmtDuration(sessionSeconds(s))}${s.note ? ` · "${s.note}"` : ''}`;
    });
    return {
      text: `Intent: recent_sessions\nLetzte ${rows.length} Sessions${subject ? ` (${subject.name})` : ''}:\n${lines.join('\n')}\n\nHinweis: Antwort nur aus deinen internen App-Daten.`
    };
  }

  if (effectiveIntent === INTENTS.LEARNED_SUMMARY) {
    const sec = filteredSessions.reduce((a, s) => a + sessionSeconds(s), 0);
    const tags = new Map();
    filteredSessions.forEach(s => (s.tags || []).forEach(t => tags.set(t, (tags.get(t) || 0) + 1)));
    const topTags = [...tags.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const last = filteredSessions[0] || null;
    const relevantMocks = mocks.filter(m => subject ? m?.subjectId === subject.id : subjectIds.has(m?.subjectId));
    const openTodos = todos.filter(t => !t?.done && (!subject || t?.subjectId === subject.id));
    const closedTodos = todos.filter(t => t?.done && (!subject || t?.subjectId === subject.id));

    if (!filteredSessions.length && !relevantMocks.length) {
      return {
        text: `Für ${subject?.name || 'diesen Bereich'} sind noch keine Lern-Daten vorhanden.`
      };
    }

    const lines = [
      'Intent: learned_summary',
      `Lern-Überblick${subject ? ` für ${subject.name}` : ''}:`,
      `- Sessions: ${filteredSessions.length}`,
      `- Lernzeit gesamt: ${fmtDuration(sec)}`,
      `- Letzte Session: ${last ? `${fmtDate(last.startedAt)} (${fmtDuration(sessionSeconds(last))})` : '-'}`,
      `- Mocks: ${relevantMocks.length}`,
      `- Todos: ${closedTodos.length} erledigt, ${openTodos.length} offen`
    ];
    if (topTags.length) lines.push(`- Häufige Lernarten: ${topTags.map(([k, v]) => `${k} (${v})`).join(', ')}`);
    if (last?.note) lines.push(`- Letzte Notiz: "${last.note}"`);
    lines.push('\nHinweis: Antwort nur aus deinen internen App-Daten.');
    return { text: lines.join('\n') };
  }

  if (effectiveIntent === INTENTS.WEAK_AREAS) {
    if (!subjects.length || !sessions.length) {
      return { text: 'Intent: weak_areas\nNoch nicht genug Daten für eine Schwächen-Analyse.' };
    }
    const bySubject = subjects.map(s => {
      const ss = sessions.filter(x => x?.subjectId === s.id);
      const total = ss.reduce((a, x) => a + sessionSeconds(x), 0);
      const last = ss.sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt))[0];
      return { id: s.id, name: s.name, total, count: ss.length, lastAt: last?.startedAt || null };
    }).filter(x => x.count > 0);
    const ranked = bySubject.sort((a, b) => a.total - b.total).slice(0, 3);
    if (!ranked.length) return { text: 'Intent: weak_areas\nKeine Fach-Sessions vorhanden.' };
    return {
      text: [
        'Intent: weak_areas',
        'Potenzielle Schwachbereiche (geringste Lernzeit):',
        ...ranked.map((x, i) => `${i + 1}. ${x.name} · ${fmtDuration(x.total)} · ${x.count} Sessions · letzte: ${fmtDate(x.lastAt)}`),
        '',
        'Hinweis: Antwort nur aus deinen internen App-Daten.'
      ].join('\n')
    };
  }

  if (effectiveIntent === INTENTS.TODAY_PLAN) {
    const openTodos = todos.filter(t => !t?.done);
    const weakFirst = subjects.map(s => {
      const total = sessions.filter(x => x.subjectId === s.id).reduce((a, x) => a + sessionSeconds(x), 0);
      return { ...s, total };
    }).sort((a, b) => a.total - b.total).slice(0, 2);
    const todoLines = openTodos.slice(0, 3).map((t, i) => {
      const sub = subjects.find(s => s.id === t.subjectId);
      return `${i + 1}. Todo: ${t.title}${sub ? ` (${sub.name})` : ''}`;
    });
    const weakLines = weakFirst.map((s, i) => `${i + 1}. Fokusfach: ${s.name} (${fmtDuration(s.total)} bisher)`);
    return {
      text: [
        'Intent: today_plan',
        'Lernvorschlag für heute:',
        ...(todoLines.length ? todoLines : ['1. Keine offenen Todos gefunden.']),
        ...weakLines,
        '',
        'Hinweis: Antwort nur aus deinen internen App-Daten.'
      ].join('\n')
    };
  }

  return {
    text: [
      'Intent: fallback',
      'Ich arbeite nur mit deinen internen App-Daten.',
      'Du kannst mich z. B. fragen:',
      '- "Was habe ich in Mathe gelernt?"',
      '- "Zeig mir meine letzten 5 Sessions"',
      '- "Wie nutze ich das Session-Feature?"'
    ].join('\n')
  };
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
    const body = getBody(req);
    const question = String(body?.question || '').trim();
    if (!question) return json(res, 400, { error: 'Missing question' });
    const text = answerFromInternalData(question, body?.internalData || {}).text;
    return json(res, 200, { ok: true, text });
  } catch (err) {
    return json(res, 500, { error: String(err?.message || err) });
  }
};
