import { uuid, isoDate, addDays } from './util.js';

export function generateDemoData(baseState) {
  const today = new Date();
  const sessions = [];
  const errorLog = [];
  const mocks = [];

  const subjects = ['klr', 'math', 'prog', 'kbs'];
  const notes = {
    klr:  ['BAB Kostenstellenrechnung', 'Nachkalkulation Schema', 'Äquivalenzziffernkalkulation', 'Kostenträgerrechnung', 'Deckungsbeitragsrechnung', 'Plankostenrechnung'],
    math: ['Vollständige Induktion', 'Folgen und Reihen', 'Differentialrechnung Anwendungen', 'Integralrechnung', 'Lineare Algebra – Eigenwerte', 'Taylor-Reihen'],
    prog: ['Rekursion – Backtracking', 'Sortieralgorithmen Vergleich', 'Graphen BFS/DFS', 'Dynamische Programmierung', 'Design Patterns', 'Unit-Tests schreiben'],
    kbs:  ['OSI-Modell Schichten', 'TCP/IP Grundlagen', 'Scheduling-Algorithmen', 'Deadlocks & Semaphoren', 'Speicherverwaltung', 'RAID-Level']
  };
  const tags = [['Theorie'], ['Übung'], ['Wiederholung'], ['Theorie','Übung'], ['Mock'], ['Übung','Wiederholung']];

  for (let dayOffset = -21; dayOffset <= 0; dayOffset++) {
    const date = addDays(today, dayOffset);
    if (date.getDay() === 0 && dayOffset < -14) continue;

    const numSessions = Math.floor(Math.random() * 3) + (Math.abs(dayOffset) < 7 ? 2 : 1);
    for (let i = 0; i < numSessions; i++) {
      const subj = subjects[Math.floor(Math.random() * subjects.length)];
      const dur = (Math.floor(Math.random() * 5) + 1) * 1800 + Math.floor(Math.random() * 1800);
      const hour = 8 + Math.floor(Math.random() * 12);
      const startDate = new Date(date);
      startDate.setHours(hour, Math.floor(Math.random() * 4) * 15, 0, 0);
      const endDate = new Date(startDate.getTime() + dur * 1000);
      sessions.push({
        id: uuid(),
        subjectId: subj,
        startedAt: startDate.toISOString(),
        endedAt: endDate.toISOString(),
        durationSeconds: dur,
        note: notes[subj][Math.floor(Math.random() * notes[subj].length)],
        tags: tags[Math.floor(Math.random() * tags.length)],
        rating: Math.floor(Math.random() * 2) + 3
      });
    }
  }

  const errorData = [
    { subjectId:'math', topic:'Vollständige Induktion', category:'concept', description:'Induktionsschritt falsch angesetzt – n+1 wurde direkt eingesetzt statt Voraussetzung zu nutzen.', resolution:'Immer: Zeige P(n)→P(n+1). Die Induktionsvoraussetzung P(n) MUSS im Schritt genutzt werden.' },
    { subjectId:'klr', topic:'BAB Umlage', category:'calculation', description:'Hilfskostenstellen-Umlage in falscher Reihenfolge abgerechnet. Gegenseitige Leistungsverflechtung nicht berücksichtigt.', resolution:'Stufenleiterverfahren: Reihenfolge fix (absteigend nach Leistungsabgabe), kein Rückstrom.' },
    { subjectId:'prog', topic:'Rekursionsabbruch', category:'fluke', description:'Base-Case vergessen bei Fibonacci-Implementierung → StackOverflow.', resolution:'Immer zuerst Base-Case definieren, dann rekursiven Schritt. Für n<=1 direkt return n.' },
    { subjectId:'kbs', topic:'Deadlock-Bedingungen', category:'understanding', description:'Nicht alle vier Bedingungen aufzählen können unter Stress.', resolution:'Eselsbrücke MEZU: Mutual exclusion, Exklusiv-Haltung, Zirkularwartung, Unverdrängtheit.' },
    { subjectId:'math', topic:'Ableitung Produkt/Quotient', category:'fluke', description:'Quotientenregel falsch herum gerechnet (Zähler·Nenner statt (Zähler\'·Nenner − Zähler·Nenner\')/Nenner²).', resolution:'Merksatz: Strich-unten mal oben minus unten mal Strich-oben, durch unten-zum-Quadrat.' },
  ];

  const base = addDays(today, -14);
  errorData.forEach((e, i) => {
    const created = addDays(base, i * 2);
    const reviewed = i < 2 ? [addDays(created, 1).toISOString()] : [];
    errorLog.push({ id: uuid(), ...e, createdAt: created.toISOString(), reviewedAt: reviewed, repeated: i === 2 ? 1 : 0 });
  });

  ['klr','math','prog','kbs'].forEach(subj => {
    const n = 2;
    for (let i = 0; i < n; i++) {
      const maxScore = 100;
      const base_score = 55 + i * 12 + Math.floor(Math.random() * 8);
      const score = Math.min(98, base_score);
      const date = addDays(today, -(n - i) * 7);
      mocks.push({
        id: uuid(), subjectId: subj,
        date: date.toISOString(),
        score, maxScore,
        note: i === 0 ? 'Erste Proberunde – Zeitmanagement noch schwierig' : 'Deutlich besser, Rechenaufgaben sicher'
      });
    }
  });

  return {
    ...baseState,
    sessions,
    errorLog,
    mocks,
    achievements: { longestStreak: 7, totalHours: Math.round(sessions.reduce((s,x) => s + x.durationSeconds, 0) / 3600 * 10) / 10 }
  };
}
