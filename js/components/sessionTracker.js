import { State } from '../state.js';
import { uuid, formatDuration, playSound, renderIcons } from '../util.js';
import { Modal } from './modal.js';
import { Toast } from './toast.js';
import { launchConfetti } from './confetti.js';

const STORAGE_KEY = 'learn.active_session';

let _timer     = null;
let _notifTimer = null;

/* ── Persistence ──────────────────────────────────────────────── */
function loadActive() {
  try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY)); } catch { return null; }
}
function saveActive(s) {
  if (s) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  else   sessionStorage.removeItem(STORAGE_KEY);
}

/* ── Time helpers ─────────────────────────────────────────────── */
function getTaskElapsed(task) {
  if (!task) return 0;
  let secs = task.durationSeconds || 0;
  if (task.status === 'active' && task.activeStartedAt) {
    secs += (Date.now() - new Date(task.activeStartedAt).getTime()) / 1000;
  }
  return Math.floor(secs);
}

function getSessionElapsed(session) {
  if (!session?.tasks?.length) return 0;
  return session.tasks.reduce((sum, t) => sum + getTaskElapsed(t), 0);
}

function makeTask(title) {
  return {
    id: uuid(),
    title: (title || 'Allgemein').trim(),
    status: 'pending',
    durationSeconds: 0,
    activeStartedAt: null,
    segments: [],
    createdAt: new Date().toISOString(),
    completedAt: null,
    note: ''
  };
}

function closeActiveSegment(task, endISO, addedSecs) {
  if (!task.activeStartedAt || addedSecs <= 0) return task;
  const seg = { startedAt: task.activeStartedAt, endedAt: endISO, seconds: Math.round(addedSecs) };
  return { ...task, segments: [...(task.segments || []), seg] };
}

/* ── SessionTracker ───────────────────────────────────────────── */
export const SessionTracker = {
  _session: null,
  _widget:  null,
  _widgetClickBound: false,

  init() {
    this._widget = document.getElementById('session-widget');
    if (!this._widget) return;

    if (!this._widgetClickBound) {
      this._widgetClickBound = true;
      this._widget.addEventListener('click', e => this._handleClick(e));
    }

    this._session = loadActive();
    if (this._session && !Array.isArray(this._session.tasks)) {
      saveActive(null);
      this._session = null;
    }
    /* Resume tick for any active task */
    if (this._session?.tasks?.find(t => t.status === 'active')) {
      this._startTick();
    }
    this._render();
    document.dispatchEvent(new CustomEvent('session:statechange', { detail: this._session }));
  },

  getSession()  { return this._session; },
  isActive()    { return !!(this._session && this._session.status !== 'paused'); },
  isPaused()    { return !!(this._session && this._session.status === 'paused'); },

  /** Gesamtlaufzeit in Sekunden (inkl. aktiver Task) — für Focus Mode & Anzeigen */
  getTotalElapsedSeconds() {
    return Math.floor(getSessionElapsed(this._session));
  },

  updateSessionNote(note) {
    if (!this._session) return;
    this._session = { ...this._session, note: note ?? '' };
    saveActive(this._session);
  },

  /* ── Public API ── */

  openNewSession(presetSubjectId) {
    this._openNewSessionModal(presetSubjectId);
  },

  start(subjectId, taskTitles = []) {
    if (this._session) return;
    const tasks = taskTitles.length
      ? taskTitles.map(t => makeTask(t))
      : [makeTask('Allgemein')];

    tasks[0].status = 'active';
    tasks[0].activeStartedAt = new Date().toISOString();

    this._session = {
      id: uuid(),
      subjectId,
      startedAt: new Date().toISOString(),
      status: 'active',
      note: '',
      tasks
    };
    saveActive(this._session);
    this._render();
    this._startTick();
    this._scheduleNotification();

    const settings = State.getSettings();
    if (settings.soundEnabled) playSound('start');
    document.dispatchEvent(new CustomEvent('session:statechange', { detail: this._session }));
    document.dispatchEvent(new CustomEvent('session:started',     { detail: this._session }));
  },

  switchTask(taskId) {
    if (!this._session) return;
    const nowMs  = Date.now();
    const nowISO = new Date().toISOString();

    this._session = {
      ...this._session,
      status: 'active',
      tasks: this._session.tasks.map(t => {
        if (t.status === 'active') {
          const addedSecs = t.activeStartedAt
            ? (nowMs - new Date(t.activeStartedAt).getTime()) / 1000 : 0;
          const closed = closeActiveSegment(t, nowISO, addedSecs);
          return { ...closed, status: 'paused', durationSeconds: (t.durationSeconds || 0) + addedSecs, activeStartedAt: null };
        }
        if (t.id === taskId && t.status !== 'done') {
          return { ...t, status: 'active', activeStartedAt: nowISO };
        }
        return t;
      })
    };
    saveActive(this._session);
    this._render();
    if (!_timer) this._startTick();
  },

  completeTask(taskId) {
    if (!this._session) return;
    const nowMs  = Date.now();
    const nowISO = new Date().toISOString();

    this._session = {
      ...this._session,
      tasks: this._session.tasks.map(t => {
        if (t.id === taskId) {
          const addedSecs = (t.status === 'active' && t.activeStartedAt)
            ? (nowMs - new Date(t.activeStartedAt).getTime()) / 1000 : 0;
          const closed = (t.status === 'active' && t.activeStartedAt)
            ? closeActiveSegment(t, nowISO, addedSecs)
            : t;
          return { ...closed, status: 'done', durationSeconds: (t.durationSeconds || 0) + addedSecs, activeStartedAt: null, completedAt: nowISO };
        }
        return t;
      })
    };

    /* If no other task is active, switch to next pending */
    const hasActive = this._session.tasks.some(t => t.status === 'active');
    if (!hasActive) {
      const next = this._session.tasks.find(t => t.status === 'pending');
      if (next) {
        this.switchTask(next.id);
        return;
      }
      /* All done — pause session */
      this._session = { ...this._session, status: 'paused' };
      clearInterval(_timer); _timer = null;
    }
    saveActive(this._session);
    this._render();
  },

  addTask(title) {
    if (!this._session || !title?.trim()) return;
    const task = makeTask(title);
    this._session = { ...this._session, tasks: [...this._session.tasks, task] };
    saveActive(this._session);
    this._render();
  },

  pause() {
    if (!this._session || this._session.status === 'paused') return;
    const nowMs = Date.now();
    const nowISO = new Date(nowMs).toISOString();

    this._session = {
      ...this._session,
      status: 'paused',
      tasks: this._session.tasks.map(t => {
        if (t.status === 'active') {
          const addedSecs = t.activeStartedAt
            ? (nowMs - new Date(t.activeStartedAt).getTime()) / 1000 : 0;
          const closed = closeActiveSegment(t, nowISO, addedSecs);
          return { ...closed, status: 'paused', durationSeconds: (t.durationSeconds || 0) + addedSecs, activeStartedAt: null };
        }
        return t;
      })
    };
    clearInterval(_timer); _timer = null;
    saveActive(this._session);
    this._render();
    document.dispatchEvent(new CustomEvent('session:statechange', { detail: this._session }));
  },

  resume() {
    if (!this._session || this._session.status !== 'paused') return;

    const lastPaused = [...this._session.tasks].reverse().find(t => t.status === 'paused');
    const firstPending = this._session.tasks.find(t => t.status === 'pending');
    const toResume = lastPaused || firstPending;

    if (toResume) {
      this._session = {
        ...this._session,
        status: 'active',
        tasks: this._session.tasks.map(t =>
          t.id === toResume.id
            ? { ...t, status: 'active', activeStartedAt: new Date().toISOString() }
            : t
        )
      };
    } else {
      this._session = { ...this._session, status: 'active' };
    }

    saveActive(this._session);
    this._startTick();
    this._render();
    document.dispatchEvent(new CustomEvent('session:statechange', { detail: this._session }));
  },

  toggle() {
    if (!this._session)                        this._openNewSessionModal();
    else if (this._session.status === 'paused') this.resume();
    else                                        this.pause();
  },

  stop() {
    if (!this._session) return;
    clearInterval(_timer); _timer = null;
    clearTimeout(_notifTimer);

    const nowMs = Date.now();
    const nowISO = new Date(nowMs).toISOString();
    const session = {
      ...this._session,
      tasks: this._session.tasks.map(t => {
        if (t.status === 'active') {
          const addedSecs = t.activeStartedAt
            ? (nowMs - new Date(t.activeStartedAt).getTime()) / 1000 : 0;
          const closed = closeActiveSegment(t, nowISO, addedSecs);
          return { ...closed, status: 'paused', durationSeconds: (t.durationSeconds || 0) + addedSecs, activeStartedAt: null };
        }
        return t;
      })
    };
    const totalSecs = Math.round(session.tasks.reduce((s, t) => s + (t.durationSeconds || 0), 0));
    this._showStopModal(session, totalSecs);
  },

  /* ── Internal: new-session modal ── */

  _openNewSessionModal(presetSubjectId) {
    if (this._session) return;
    const subjects = State.getSubjects();
    const defaultSubj = presetSubjectId || subjects[0]?.id;

    const body = `
      <div class="field">
        <label>Fach</label>
        <div class="subject-picker" id="ns-subject-picker">
          ${subjects.map(s => `
            <button class="subject-pick-btn${s.id === defaultSubj ? ' selected' : ''}"
              data-subject="${s.id}" type="button"
              style="--clr:var(--subject-${s.id})">
              ${s.name}
            </button>`).join('')}
        </div>
      </div>
      <div class="field">
        <label for="ns-tasks">Tasks <span class="label-hint">(optional, eine pro Zeile)</span></label>
        <textarea class="textarea" id="ns-tasks" rows="4"
          placeholder="BAB Kostenstellenrechnung&#10;Theorie wiederholen&#10;Anki-Karten erstellen"></textarea>
        <div class="field-hint">Leer lassen für eine allgemeine Session</div>
      </div>`;

    const modal = Modal.open({
      title: 'Neue Session',
      body,
      footer: `
        <button class="btn btn-ghost" id="ns-cancel" type="button">Abbrechen</button>
        <button class="btn btn-primary" id="ns-start" type="button">
          <i data-lucide="play"></i> Session starten
        </button>`
    });

    renderIcons(modal.el);

    let selectedSubject = defaultSubj;

    modal.el.querySelectorAll('.subject-pick-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedSubject = btn.dataset.subject;
        modal.el.querySelectorAll('.subject-pick-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
      });
    });

    modal.el.querySelector('#ns-cancel')?.addEventListener('click', () => modal.close());
    modal.el.querySelector('#ns-start')?.addEventListener('click', () => {
      const raw    = modal.el.querySelector('#ns-tasks').value.trim();
      const titles = raw ? raw.split('\n').map(l => l.trim()).filter(Boolean) : [];
      modal.close();
      this.start(selectedSubject, titles);
    });
  },

  /* ── Internal: stop modal ── */

  _showStopModal(session, totalSecs) {
    const subject = State.getSubject(session.subjectId);
    let selectedTags = [];
    let rating = 0;

    const showTasks = session.tasks.length > 1 || session.tasks[0]?.title !== 'Allgemein';
    const taskRows  = session.tasks.map(t => {
      const done = t.status === 'done';
      return `<div class="stop-task-row${done ? ' done' : ''}">
        <span class="stop-task-icon">${done ? '✓' : '○'}</span>
        <span class="stop-task-title">${t.title}</span>
        <span class="stop-task-dur">${formatDuration(Math.round(t.durationSeconds || 0))}</span>
      </div>`;
    }).join('');

    const body = `
      <div class="stop-header">
        <div class="stop-subject">${subject?.name || ''}</div>
        <div class="stop-time num-display">${formatDuration(totalSecs, 'timer')}</div>
        <div class="stop-time-label">Gesamt</div>
      </div>
      ${showTasks ? `<div class="field"><label>Tasks</label><div class="stop-task-list">${taskRows}</div></div>` : ''}
      <div class="field">
        <label for="stop-note">Notiz</label>
        <textarea class="textarea" id="stop-note" rows="3" placeholder="Was hast du gemacht?" style="resize:none">${session.note || ''}</textarea>
      </div>
      <div class="field">
        <label>Tags</label>
        <div class="tag-options" id="stop-tags">
          ${['Theorie','Übung','Mock','Wiederholung','Klausurvorbereitung'].map(t =>
            `<button class="tag-opt" data-tag="${t}" type="button">${t}</button>`
          ).join('')}
        </div>
      </div>
      <div class="field">
        <label>Wie produktiv?</label>
        <div class="star-rating" id="stop-stars">
          ${[1,2,3,4,5].map(n =>
            `<button class="star-btn" data-val="${n}" type="button" aria-label="${n} Stern${n > 1 ? 'e' : ''}">★</button>`
          ).join('')}
        </div>
      </div>`;

    const modal = Modal.open({
      title: 'Session abschließen',
      body,
      footer: `
        <button class="btn btn-ghost" id="stop-continue"  type="button">Fortsetzen</button>
        <button class="btn btn-ghost" id="stop-discard"   type="button" style="color:var(--text-tertiary)">Verwerfen</button>
        <button class="btn btn-primary" id="stop-save"    type="button">Speichern</button>`
    });

    renderIcons(modal.el);

    /* Tags */
    modal.el.querySelectorAll('.tag-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        const tag = btn.dataset.tag;
        if (selectedTags.includes(tag)) selectedTags = selectedTags.filter(t => t !== tag);
        else selectedTags.push(tag);
        btn.classList.toggle('selected', selectedTags.includes(tag));
      });
    });

    /* Stars */
    const stars = modal.el.querySelectorAll('.star-btn');
    stars.forEach(star => {
      star.addEventListener('click', () => {
        rating = parseInt(star.dataset.val);
        stars.forEach((s, i) => { s.style.color = i < rating ? 'var(--warning)' : 'var(--text-disabled)'; });
      });
    });

    modal.el.querySelector('#stop-continue')?.addEventListener('click', () => {
      const note = modal.el.querySelector('#stop-note').value;
      this._session = { ...session, note, status: 'paused' };
      saveActive(this._session);
      this._render();
      modal.close();
    });

    modal.el.querySelector('#stop-discard')?.addEventListener('click', () => {
      this._session = null;
      saveActive(null);
      this._render();
      modal.close();
      document.dispatchEvent(new CustomEvent('session:statechange', { detail: null }));
    });

    modal.el.querySelector('#stop-save')?.addEventListener('click', () => {
      const note = modal.el.querySelector('#stop-note').value;
      if (totalSecs < 60) {
        Toast.warning('Zu kurz', 'Sessions unter 1 Minute werden nicht gespeichert.');
        return;
      }
      this._persistSession(session, totalSecs, note, selectedTags, rating);
      this._session = null;
      saveActive(null);
      this._render();
      modal.close();
      Toast.success('Session gespeichert', formatDuration(totalSecs));
      const settings = State.getSettings();
      if (settings.soundEnabled) playSound('stop');
      document.dispatchEvent(new CustomEvent('session:statechange', { detail: null }));
      document.dispatchEvent(new CustomEvent('session:saved'));
    });
  },

  async _persistSession(session, totalSecs, note, tags, rating) {
    const endedAt = new Date().toISOString();
    const saved = {
      id: session.id,
      subjectId: session.subjectId,
      startedAt: session.startedAt,
      endedAt,
      durationSeconds: Math.round(totalSecs),
      note: note || '',
      tags: tags || [],
      rating: rating || 0,
      isDemo: false,
      tasks: session.tasks.map(t => ({
        id: t.id,
        title: t.title,
        status: t.status,
        durationSeconds: Math.round(t.durationSeconds || 0),
        activeStartedAt: null,
        segments: t.segments || [],
        createdAt: t.createdAt,
        completedAt: t.completedAt || null,
        note: t.note || ''
      }))
    };
    State.addSession(saved);

    const sessions2 = State.getSessions();
    const settings2 = State.getSettings();
    const { getStreak: gs, sumDuration: sd } = await import('../util.js');
    const streak2     = gs(sessions2, settings2.dailyGoalMinutes);
    const totalHours2 = Math.round(sd(sessions2) / 3600 * 10) / 10;
    const prev        = State.getAchievements();
    const wasStreak   = prev.longestStreak || 0;
    State.updateAchievements({ longestStreak: Math.max(wasStreak, streak2), totalHours: totalHours2 });
    if (streak2 > wasStreak && streak2 > 1) launchConfetti(60);
  },

  /* ── Internal: render & tick ── */

  _render() {
    const widget   = this._widget;
    if (!widget) return;
    const subjects = State.getSubjects();
    const s        = this._session;

    if (!s) {
      widget.dataset.state = 'idle';
      widget.style.borderColor = '';
      widget.innerHTML = `
        <div class="widget-idle">
          <div class="widget-idle-label">Keine Session aktiv</div>
          <button class="btn btn-primary btn-sm widget-start" data-widget-action="new-session" type="button">
            <i data-lucide="play"></i> Neue Session
          </button>
        </div>`;
    } else {
      const subject = State.getSubject(s.subjectId);
      const paused  = s.status === 'paused';
      const total   = getSessionElapsed(s);

      const colorMap = { klr:'16,185,129', math:'139,92,246', prog:'6,182,212', kbs:'245,158,11' };
      const rgb = colorMap[s.subjectId] || '139,92,246';
      widget.style.borderColor = `rgba(${rgb},0.35)`;
      widget.dataset.state = paused ? 'paused' : 'running';

      const taskHtml = s.tasks.map(t => {
        const elapsed  = getTaskElapsed(t);
        const isActive = t.status === 'active';
        const isDone   = t.status === 'done';
        return `<div class="widget-task${isActive ? ' active' : ''}${isDone ? ' done' : ''}">
          <button class="widget-task-switch" data-widget-action="switch-task" data-task-id="${t.id}"
            type="button" title="Zu diesem Task wechseln" ${isDone ? 'disabled' : ''}>
            ${isActive ? '▶' : isDone ? '✓' : '○'}
          </button>
          <span class="widget-task-title">${t.title}</span>
          <span class="widget-task-time" data-task-timer="${t.id}">${formatDuration(elapsed, 'timer')}</span>
          ${!isDone ? `<button class="widget-task-done-btn" data-widget-action="done-task"
            data-task-id="${t.id}" type="button" title="Als erledigt markieren">✓</button>` : ''}
        </div>`;
      }).join('');

      widget.innerHTML = `
        <div class="widget-active">
          <div class="widget-top">
            <div class="widget-subject-pill">
              <div class="widget-dot" style="background:var(--subject-${s.subjectId})"></div>
              <span>${subject?.name || ''}</span>
              ${paused ? '<span class="badge badge-warning" style="margin-left:auto">Pause</span>' : ''}
            </div>
            <div class="widget-top-actions">
              ${paused
                ? `<button class="btn btn-primary btn-sm" data-widget-action="resume" type="button"><i data-lucide="play"></i></button>`
                : `<button class="btn btn-secondary btn-sm" data-widget-action="pause" type="button"><i data-lucide="pause"></i></button>`}
              <button class="btn btn-ghost btn-sm" data-widget-action="focus" type="button" title="Focus Mode (F)"><i data-lucide="maximize-2"></i></button>
              <button class="btn btn-danger btn-sm" data-widget-action="stop" type="button"><i data-lucide="square"></i></button>
            </div>
          </div>
          <div class="widget-tasks">${taskHtml}</div>
          <button class="widget-add-task-btn" data-widget-action="add-task" type="button">
            <i data-lucide="plus"></i> Task hinzufügen
          </button>
          <div class="widget-footer">
            <span class="widget-footer-label">Gesamt</span>
            <span class="widget-total-time num-display" data-session-timer>${formatDuration(total, 'timer')}</span>
          </div>
        </div>`;
    }
    renderIcons(widget);
  },

  _handleClick(e) {
    const btn    = e.target.closest('[data-widget-action]');
    if (!btn) return;
    const action = btn.dataset.widgetAction;
    const taskId = btn.dataset.taskId;

    switch (action) {
      case 'new-session':  this._openNewSessionModal(); break;
      case 'pause':        this.pause(); break;
      case 'resume':       this.resume(); break;
      case 'stop':         this.stop(); break;
      case 'focus':        document.dispatchEvent(new CustomEvent('app:focus')); break;
      case 'switch-task':  if (taskId) this.switchTask(taskId); break;
      case 'done-task':    if (taskId) this.completeTask(taskId); break;
      case 'add-task':     this._showAddTaskInline(); break;
    }
  },

  _showAddTaskInline() {
    const widget = this._widget;
    const addBtn = widget?.querySelector('[data-widget-action="add-task"]');
    if (!addBtn) return;

    const input = document.createElement('input');
    input.type        = 'text';
    input.className   = 'input widget-add-task-input';
    input.placeholder = 'Task-Titel, dann Enter…';
    addBtn.replaceWith(input);
    input.focus();

    let submitted = false;
    const submit = () => {
      if (submitted) return;
      submitted = true;
      if (input.value.trim()) this.addTask(input.value.trim());
      else this._render();
    };
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter')  { e.preventDefault(); submit(); }
      if (e.key === 'Escape') { submitted = true; this._render(); }
    });
    input.addEventListener('blur', () => setTimeout(submit, 120));
  },

  _startTick() {
    clearInterval(_timer);
    _timer = setInterval(() => {
      if (!this._session || this._session.status === 'paused') return;

      /* Update per-task displays */
      this._session.tasks?.forEach(t => {
        const el = this._widget?.querySelector(`[data-task-timer="${t.id}"]`);
        if (el) el.textContent = formatDuration(getTaskElapsed(t), 'timer');
      });

      /* Update session total */
      const totalEl = this._widget?.querySelector('[data-session-timer]');
      if (totalEl) totalEl.textContent = formatDuration(getSessionElapsed(this._session), 'timer');

      /* Focus mode */
      const ft = document.querySelector('.focus-timer');
      if (ft) ft.textContent = formatDuration(getSessionElapsed(this._session), 'timer');
    }, 1000);
  },

  _scheduleNotification() {
    clearTimeout(_notifTimer);
    const settings = State.getSettings();
    if (!settings.notificationsEnabled) return;
    _notifTimer = setTimeout(() => {
      if (Notification.permission === 'granted' && this._session) {
        new Notification('Lernpause?', { body: 'Du lernst seit 50 Minuten. Zeit für eine kurze Pause?' });
      }
    }, 50 * 60 * 1000);
  }
};
