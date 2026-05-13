import { State } from '../state.js';
import { greeting, formatDateDE, getPhase, getStreak, getTodaySessions, getWeekSessions,
  getWeekMonday, getSubjectSessions, sumDuration, formatDuration, daysUntil,
  isSameDay, isReviewDue, groupByDay, renderIcons, uuid, addDays } from '../util.js';
import { SessionTracker } from '../components/sessionTracker.js';
import { renderHeatmap } from '../components/heatmap.js';
import { Modal } from '../components/modal.js';
import { Toast } from '../components/toast.js';
import { Storage } from '../storage.js';

export function renderDashboard(container) {
  const state    = State.get();
  const settings = State.getSettings();
  const sessions = State.getSessions();
  const subjects = State.getSubjects();
  const phase    = getPhase();
  const today    = getTodaySessions(sessions);
  const todaySec = sumDuration(today);
  const goal     = (settings.dailyGoalMinutes || 240) * 60;
  const streak   = getStreak(sessions, settings.dailyGoalMinutes || 240);
  const weekSess = getWeekSessions(sessions, getWeekMonday());
  const isWeekend = [0,6].includes(new Date().getDay());

  /* Subject week stats */
  const subjectStats = subjects.map(s => {
    const wSecs = sumDuration(weekSess.filter(x => x.subjectId === s.id));
    const goal  = (settings.weeklyGoals?.[s.id] || 360) * 60;
    return { ...s, wSecs, goal, pct: Math.min(100, Math.round(wSecs / goal * 100)) };
  });

  /* Smart suggestions */
  const suggestions = buildSuggestions(sessions, subjects, settings, weekSess, phase);

  /* Overdue error reviews */
  const dueErrors = State.getErrors().filter(isReviewDue).length;

  const isSunday = new Date().getDay() === 0;
  const hasReviewToday = State.getReviews().some(r => isSameDay(new Date(r.date), new Date()));

  const showDemoBanner = State.hasDemoEntries();

  container.innerHTML = `
    <div class="dashboard-view view">
      ${showDemoBanner ? `
      <div class="demo-mode-banner" id="demo-mode-banner" role="status">
        <span>Du nutzt gerade die Demo-Ansicht.</span>
        <button type="button" class="btn btn-secondary btn-sm" id="demo-banner-clear">Demo-Daten löschen</button>
      </div>` : ''}
      ${isSunday && !hasReviewToday ? `
      <div class="review-banner" id="review-banner">
        <div>
          <div class="review-banner-text">Zeit für den Wochenrückblick</div>
          <div class="review-banner-sub">Reflektiere die vergangene Woche und plane die nächste.</div>
        </div>
        <button class="btn btn-primary btn-sm" id="btn-review">Jetzt starten</button>
      </div>` : ''}

      <!-- Hero -->
      <section class="hero" aria-label="Begrüßung">
        <h1 class="hero-greeting">${greeting(settings.name)}</h1>
        <div class="hero-meta">
          <span class="hero-date">${formatDateDE(new Date())}</span>
          <span class="hero-phase" style="background:rgba(var(--phase-rgb,139,92,246),0.12);color:${phase.color};border-color:rgba(var(--phase-rgb,139,92,246),0.25)">
            ${phase.label}
          </span>
          <span class="hero-streak">🔥 ${streak} ${streak === 1 ? 'Tag' : 'Tage'} Streak</span>
        </div>
      </section>

      <!-- Row: Goal + Subject cards -->
      <div class="dash-row dash-row-2" style="grid-template-columns:1fr 2fr;align-items:start">
        <!-- Tagesziel -->
        <div class="card goal-card" style="flex-direction:column;gap:16px">
          <div class="section-title">Tagesziel</div>
          <div style="display:flex;align-items:center;gap:24px;flex-wrap:wrap">
            <div class="progress-ring-wrap" aria-label="Tagesziel: ${formatDuration(todaySec)} von ${formatDuration(goal)} gelernt">
              <svg class="progress-ring" viewBox="0 0 160 160" aria-hidden="true">
                <circle class="ring-track" cx="80" cy="80" r="63"/>
                <circle class="ring-fill" cx="80" cy="80" r="63"
                  style="stroke:${todaySec >= goal ? 'var(--success)' : 'var(--accent)'}"/>
              </svg>
              <div class="ring-content">
                <span class="ring-value">${formatDuration(todaySec)}</span>
                <span class="ring-label">/ ${formatDuration(goal)}</span>
              </div>
            </div>
            <div style="flex:1">
              <div class="goal-fach-pills">
                ${subjects.map(s => {
                  const sec = sumDuration(today.filter(x => x.subjectId === s.id));
                  return sec > 0 ? `<div class="goal-fach-pill">
                    <div class="goal-fach-dot" style="background:var(--subject-${s.id})"></div>
                    <span>${s.name.split(' ')[0]}</span>
                    <span style="color:var(--text-tertiary);font-size:11px">${formatDuration(sec)}</span>
                  </div>` : '';
                }).join('')}
                ${sumDuration(today) === 0 ? '<div style="font-size:13px;color:var(--text-tertiary)">Noch keine Session heute</div>' : ''}
              </div>
            </div>
          </div>
        </div>

        <!-- Quick-start grid -->
        <div class="dash-row dash-row-2" style="gap:12px">
          ${subjectStats.map(s => `
            <div class="card card-hover subject-card" data-start-subject="${s.id}"
              style="--subject-color:var(--subject-${s.id})"
              role="button" tabindex="0" aria-label="${s.name} – Session starten">
              <div class="subject-name" style="color:var(--subject-${s.id})">${s.name}</div>
              <div class="subject-week-hours">${formatDuration(s.wSecs)}</div>
              <div class="subject-week-label">diese Woche</div>
              <div class="subject-progress-wrap">
                <div class="subject-progress-bar">
                  <div class="subject-progress-fill" style="width:${s.pct}%;background:var(--subject-${s.id})"></div>
                </div>
                <span class="subject-progress-pct">${s.pct}%</span>
              </div>
            </div>`).join('')}
        </div>
      </div>

      <!-- Heatmap -->
      <section aria-label="Lernaktivität der letzten 90 Tage">
        <div class="section-header">
          <div class="section-title">Aktivität</div>
          <span style="font-size:12px;color:var(--text-tertiary)">letzte 90 Tage</span>
        </div>
        <div id="heatmap-root"></div>
      </section>

      <!-- Row: Recent sessions + Exam status -->
      <div class="dash-row dash-row-2" style="align-items:start">
        <!-- Recent sessions -->
        <section aria-label="Letzte Sessions">
          <div class="section-header">
            <div class="section-title">Letzte Sessions</div>
            <a href="#sessions" class="btn btn-ghost btn-sm" style="font-size:12px">Alle ansehen</a>
          </div>
          <div class="session-list" id="recent-sessions">
            ${buildRecentSessions(sessions, subjects)}
          </div>
        </section>

        <!-- Klausur status -->
        <section aria-label="Klausurübersicht">
          <div class="section-header">
            <div class="section-title">Klausuren</div>
          </div>
          <div class="exam-cards">
            ${subjects.map(s => buildExamCard(s, sessions)).join('')}
          </div>
        </section>
      </div>

      ${dueErrors > 0 ? `
      <div class="suggestion-item" role="alert">
        <i data-lucide="bell"></i>
        <span><strong>${dueErrors} Fehlerbuch-${dueErrors === 1 ? 'Eintrag' : 'Einträge'}</strong> ${dueErrors === 1 ? 'ist' : 'sind'} zur Wiederholung fällig.</span>
        <a href="#errors" class="btn btn-ghost btn-sm" style="margin-left:auto;font-size:12px">Öffnen</a>
      </div>` : ''}

      ${suggestions.length ? `
      <section aria-label="Hinweise">
        <div class="section-title" style="margin-bottom:12px">Hinweise</div>
        <div class="suggestions">${suggestions.map(s => `
          <div class="suggestion-item">
            <i data-lucide="lightbulb"></i>
            <span>${s}</span>
          </div>`).join('')}
        </div>
      </section>` : ''}
    </div>`;

  renderIcons(container);

  container.querySelector('#demo-banner-clear')?.addEventListener('click', () => {
    if (!State.hasDemoEntries()) return;
    State.removeDemoEntries();
    Storage.saveNow(State.get());
    Toast.success('Demo-Daten entfernt');
    renderDashboard(container);
  });

  /* Progress ring animation */
  const pct = Math.min(1, todaySec / goal);
  const circ = 2 * Math.PI * 63;
  const fill = container.querySelector('.ring-fill');
  if (fill) setTimeout(() => { fill.style.strokeDashoffset = circ * (1 - pct); }, 50);

  /* Heatmap */
  const heatRoot = container.querySelector('#heatmap-root');
  if (heatRoot) renderHeatmap(heatRoot, sessions, dayKey => {
    const daySess = sessions.filter(s => s.startedAt.startsWith(dayKey));
    if (!daySess.length) return;
    Modal.open({
      title: new Date(dayKey).toLocaleDateString('de-DE', { weekday:'long', day:'numeric', month:'long' }),
      body: `<div class="session-list">${buildRecentSessions(daySess, subjects, daySess.length)}</div>`
    });
    renderIcons(document.querySelector('.modal'));
  });

  /* Quick-start clicks */
  container.querySelectorAll('[data-start-subject]').forEach(card => {
    const id = card.dataset.startSubject;
    card.addEventListener('click', () => SessionTracker.openNewSession(id));
    card.addEventListener('keydown', e => { if (e.key === 'Enter') SessionTracker.openNewSession(id); });
  });

  /* Recent session clicks */
  container.querySelectorAll('.session-item').forEach(item => {
    item.addEventListener('click', () => {
      const sess = sessions.find(s => s.id === item.dataset.sessionId);
      if (!sess) return;
      const sub = subjects.find(s => s.id === sess.subjectId);
      import('../components/modal.js').then(({ Modal }) => {
        Modal.open({
          title: sub?.name || 'Session',
          body: `
            <div class="session-item" style="cursor:default">
              <div class="session-color-bar" style="background:var(--subject-${sess.subjectId})"></div>
              <div class="session-info">
                <div class="session-note" style="white-space:normal;overflow:visible">${sess.note || 'Keine Notiz'}</div>
                <div class="session-subject">${new Date(sess.startedAt).toLocaleDateString('de-DE',{weekday:'long',day:'numeric',month:'long'})} · ${new Date(sess.startedAt).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'})}</div>
              </div>
              <div class="session-meta">
                <div class="session-duration">${formatDuration(sess.durationSeconds)}</div>
                ${sess.rating ? `<div>${'★'.repeat(sess.rating)}</div>` : ''}
              </div>
            </div>
            ${sess.tags?.length ? `<div style="display:flex;gap:6px;flex-wrap:wrap">${sess.tags.map(t=>`<span class="badge badge-muted">${t}</span>`).join('')}</div>` : ''}
          `
        });
        renderIcons(document.querySelector('.modal'));
      });
    });
  });

  /* Weekly review */
  container.querySelector('#btn-review')?.addEventListener('click', () => openReviewModal());

  /* Refresh on session saved */
  document.addEventListener('session:saved', () => renderDashboard(container), { once: true });
}

function buildRecentSessions(sessions, subjects, limit = 5) {
  const recent = [...sessions].sort((a,b) => new Date(b.startedAt) - new Date(a.startedAt)).slice(0, limit);
  if (!recent.length) return `<div class="empty-state" style="padding:24px">
    <i data-lucide="timer" style="width:36px;height:36px"></i>
    <div class="empty-title">Noch keine Sessions</div>
    <div class="empty-sub">Starte deine erste Lernsession mit dem Widget unten rechts.</div>
  </div>`;
  return recent.map(s => {
    const sub = subjects.find(x => x.id === s.subjectId);
    const date = new Date(s.startedAt);
    const dateStr = isSameDay(date, new Date()) ? 'Heute' : isSameDay(date, new Date(Date.now()-86400000)) ? 'Gestern' : date.toLocaleDateString('de-DE',{day:'numeric',month:'short'});
    return `<div class="session-item" data-session-id="${s.id}" role="button" tabindex="0">
      <div class="session-color-bar" style="background:var(--subject-${s.subjectId})"></div>
      <div class="session-info">
        <div class="session-subject">${sub?.name || ''}</div>
        <div class="session-note">${s.note || 'Keine Notiz'}</div>
      </div>
      <div class="session-meta">
        <div class="session-duration">${formatDuration(s.durationSeconds)}</div>
        <div class="session-date">${dateStr}</div>
      </div>
    </div>`;
  }).join('');
}

function buildExamCard(subject, sessions) {
  const days = daysUntil(subject.examDate);
  const total = sumDuration(getSubjectSessions(sessions, subject.id));
  const mocks = State.getMocks().filter(m => m.subjectId === subject.id).length;
  const cls = days <= 2 ? 'critical' : days <= 7 ? 'urgent' : '';
  return `<div class="card exam-card ${cls}" style="border-top:2px solid var(--subject-${subject.id})">
    <div class="exam-days" style="color:${cls?'':'var(--text-primary)'}">${days}</div>
    <div class="exam-name">${subject.name}</div>
    <div class="exam-stats">${formatDuration(total)} · ${mocks} Mocks</div>
  </div>`;
}

function buildSuggestions(sessions, subjects, settings, weekSessions, phase) {
  const tips = [];
  if (tips.length >= 2) return tips;

  /* Check for subjects not studied in > 3 days */
  subjects.forEach(s => {
    if (tips.length >= 2) return;
    const subjSess = getSubjectSessions(sessions, s.id);
    if (!subjSess.length) return;
    const last = new Date(subjSess.sort((a,b) => new Date(b.startedAt)-new Date(a.startedAt))[0].startedAt);
    const diff = Math.floor((Date.now() - last) / 86400000);
    if (diff >= 3) tips.push(`Letzte ${s.name}-Session war vor ${diff} Tagen – Vergessenskurve steigt.`);
  });

  /* Check week balance */
  if (tips.length < 2) {
    const weekGoals = settings.weeklyGoals || {};
    let overFilled = null, underFilled = null;
    subjects.forEach(s => {
      const actual = sumDuration(weekSessions.filter(x => x.subjectId === s.id));
      const goal   = (weekGoals[s.id] || 360) * 60;
      if (actual > goal * 1.2) overFilled = s.name.split(' ')[0];
      if (actual < goal * 0.4) underFilled = s.name.split(' ')[0];
    });
    if (overFilled && underFilled) {
      tips.push(`${overFilled} übererfüllt diese Woche – ${underFilled} liegt deutlich zurück.`);
    }
  }

  if (phase.num === 1 && tips.length < 2) {
    tips.push('Phase 1 – jetzt Grundlagen festigen. Die 24h-Wiederholungsregel ist besonders wirksam.');
  }

  return tips.slice(0, 2);
}

function openReviewModal() {
  const subjects = State.getSubjects();
  const weekSess = getWeekSessions(State.getSessions(), getWeekMonday(addDays(new Date(), -7)));
  const errors = State.getErrors().filter(e => isSameDay(new Date(e.createdAt), new Date()) || true).slice(0,3);
  const mocks  = State.getMocks().filter(m => {
    const d = new Date(m.date);
    return d >= new Date(Date.now() - 7*86400000);
  });

  const body = `
    <div style="display:flex;flex-direction:column;gap:20px">
      <div>
        <div class="detail-section-title">Lernzeit diese Woche</div>
        <div style="margin-top:8px">
          ${subjects.map(s => {
            const secs = sumDuration(weekSess.filter(x => x.subjectId === s.id));
            const goal = (State.getSettings().weeklyGoals?.[s.id] || 360) * 60;
            const pct  = Math.min(100, Math.round(secs/goal*100));
            return `<div class="review-fach-row">
              <div class="review-fach-name" style="color:var(--subject-${s.id})">${s.name.split(' ')[0]}</div>
              <div class="review-fach-time">${formatDuration(secs)}</div>
              <div class="review-fach-bar"><div class="review-fach-fill" style="width:${pct}%;background:var(--subject-${s.id})"></div></div>
              <div class="review-fach-pct">${pct}%</div>
            </div>`;
          }).join('')}
        </div>
      </div>
      ${mocks.length ? `<div>
        <div class="detail-section-title">Mocks dieser Woche</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px">
          ${mocks.map(m => `<span class="badge badge-accent">${m.subjectId.toUpperCase()} ${m.score}/${m.maxScore}</span>`).join('')}
        </div>
      </div>` : ''}
      <div class="field">
        <label for="rv-good">Was lief gut?</label>
        <textarea class="textarea" id="rv-good" rows="2" placeholder="…"></textarea>
      </div>
      <div class="field">
        <label for="rv-gap">Welche 3 Lücken nächste Woche schließen?</label>
        <textarea class="textarea" id="rv-gap" rows="2" placeholder="…"></textarea>
      </div>
    </div>`;

  const modal = Modal.open({
    title: 'Wochenrückblick',
    body,
    footer: `<button class="btn btn-ghost" id="rv-skip">Überspringen</button>
             <button class="btn btn-primary" id="rv-save">Speichern</button>`
  });

  modal.el.querySelector('#rv-skip')?.addEventListener('click', () => modal.close());
  modal.el.querySelector('#rv-save')?.addEventListener('click', () => {
    const good = modal.el.querySelector('#rv-good')?.value;
    const gap  = modal.el.querySelector('#rv-gap')?.value;
    State.addWeeklyReview({ id: uuid(), date: new Date().toISOString(), good, gap });
    Toast.success('Wochenrückblick gespeichert');
    modal.close();
  });

  renderIcons(modal.el);
}
