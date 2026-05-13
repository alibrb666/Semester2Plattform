import { State } from '../state.js';
import { uuid, formatDuration, playSound, renderIcons } from '../util.js';
import { Modal } from './modal.js';
import { Toast } from './toast.js';
import { launchConfetti } from './confetti.js';

const STORAGE_KEY = 'learn.active_session';

let _timer = null;
let _notifTimer = null;
let _focusModeActive = false;

function loadActive() {
  try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY)); } catch { return null; }
}
function saveActive(s) {
  if (s) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  else sessionStorage.removeItem(STORAGE_KEY);
}

function getElapsed(session) {
  if (!session || !session.startedAt) return 0;
  const now = Date.now();
  let ms = now - session.startedAt - (session.totalPausedMs || 0);
  if (session.paused && session.pausedAt) ms -= (now - session.pausedAt);
  return Math.max(0, Math.floor(ms / 1000));
}

export const SessionTracker = {
  _session: null,

  init() {
    this._session = loadActive();
    this._render();
    this._bindGlobal();
    if (this._session?.active) this._startTick();
    document.dispatchEvent(new CustomEvent('session:statechange', { detail: this._session }));
  },

  getSession() { return this._session; },
  isActive() { return !!(this._session?.active && !this._session.paused); },
  isPaused() { return !!(this._session?.active && this._session.paused); },

  start(subjectId) {
    if (this._session?.active) return;
    this._session = {
      active: true,
      id: uuid(),
      subjectId,
      startedAt: Date.now(),
      pausedAt: null,
      totalPausedMs: 0,
      paused: false,
      note: ''
    };
    saveActive(this._session);
    this._render();
    this._startTick();
    this._scheduleNotification();
    const settings = State.getSettings();
    if (settings.soundEnabled) playSound('start');
    document.dispatchEvent(new CustomEvent('session:statechange', { detail: this._session }));
    document.dispatchEvent(new CustomEvent('session:started', { detail: this._session }));
  },

  pause() {
    if (!this._session?.active || this._session.paused) return;
    this._session = { ...this._session, paused: true, pausedAt: Date.now() };
    saveActive(this._session);
    clearInterval(_timer); _timer = null;
    this._render();
    document.dispatchEvent(new CustomEvent('session:statechange', { detail: this._session }));
  },

  resume() {
    if (!this._session?.active || !this._session.paused) return;
    const addedPause = Date.now() - this._session.pausedAt;
    this._session = {
      ...this._session,
      paused: false,
      pausedAt: null,
      totalPausedMs: (this._session.totalPausedMs || 0) + addedPause
    };
    saveActive(this._session);
    this._startTick();
    this._render();
    document.dispatchEvent(new CustomEvent('session:statechange', { detail: this._session }));
  },

  stop() {
    if (!this._session?.active) return;
    clearInterval(_timer); _timer = null;
    clearTimeout(_notifTimer);
    const session = this._session;
    const elapsed = getElapsed(session);

    this._showStopModal(session, elapsed);
  },

  _showStopModal(session, elapsed) {
    const subject = State.getSubject(session.subjectId);
    let selectedTags = [];
    let rating = 0;

    const body = `
      <div style="text-align:center;padding:8px 0 4px">
        <div style="font-size:13px;color:var(--text-secondary);margin-bottom:4px">${subject?.name || ''}</div>
        <div style="font-family:var(--font-mono);font-size:42px;font-weight:700;letter-spacing:-0.04em;color:var(--text-primary)">${formatDuration(elapsed,'timer')}</div>
        <div style="font-size:13px;color:var(--text-tertiary);margin-top:2px">${formatDuration(elapsed)}</div>
      </div>
      <div class="field">
        <label for="stop-note">Notiz</label>
        <textarea class="textarea" id="stop-note" rows="3" placeholder="Was hast du gemacht?" style="resize:none">${session.note || ''}</textarea>
      </div>
      <div class="field">
        <label>Tags</label>
        <div class="tag-options" id="tag-opts">
          ${['Theorie','Übung','Mock','Wiederholung'].map(t =>
            `<button class="tag-opt" data-tag="${t}">${t}</button>`
          ).join('')}
        </div>
      </div>
      <div class="field">
        <label>Wie produktiv?</label>
        <div class="star-rating" id="star-rating">
          ${[1,2,3,4,5].map(n => `<button class="star-btn" data-val="${n}" aria-label="${n} Stern${n>1?'e':''}" style="font-size:20px;background:none;border:none;cursor:pointer;padding:2px;color:var(--text-disabled);transition:color 100ms">★</button>`).join('')}
        </div>
      </div>
    `;

    const modal = Modal.open({
      title: 'Session abschließen',
      body,
      footer: `
        <button class="btn btn-ghost" id="stop-continue">Fortsetzen</button>
        <button class="btn btn-ghost btn-danger-text" id="stop-discard" style="color:var(--text-tertiary)">Verwerfen</button>
        <button class="btn btn-primary" id="stop-save">Speichern</button>
      `
    });

    renderIcons(modal.el);

    /* Tag selection */
    modal.el.querySelectorAll('.tag-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        const tag = btn.dataset.tag;
        if (selectedTags.includes(tag)) selectedTags = selectedTags.filter(t => t !== tag);
        else selectedTags.push(tag);
        btn.classList.toggle('selected', selectedTags.includes(tag));
      });
    });

    /* Star rating */
    const stars = modal.el.querySelectorAll('.star-btn');
    stars.forEach(star => {
      star.addEventListener('click', () => {
        rating = parseInt(star.dataset.val);
        stars.forEach((s,i) => { s.style.color = i < rating ? 'var(--warning)' : 'var(--text-disabled)'; });
      });
    });

    modal.el.querySelector('#stop-continue')?.addEventListener('click', () => {
      const note = modal.el.querySelector('#stop-note').value;
      this._session = { ...session, note };
      saveActive(this._session);
      this._startTick();
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
      if (elapsed < 60) { Toast.warning('Zu kurz', 'Sessions unter 1 Minute werden nicht gespeichert.'); return; }
      this._saveSession(session, elapsed, note, selectedTags, rating);
      this._session = null;
      saveActive(null);
      this._render();
      modal.close();
      Toast.success('Session gespeichert', formatDuration(elapsed));
      const settings = State.getSettings();
      if (settings.soundEnabled) playSound('stop');
      document.dispatchEvent(new CustomEvent('session:statechange', { detail: null }));
      document.dispatchEvent(new CustomEvent('session:saved'));
    });
  },

  async _saveSession(session, elapsed, note, tags, rating) {
    const endedAt = new Date().toISOString();
    const startedAt = new Date(session.startedAt).toISOString();
    const saved = {
      id: session.id,
      subjectId: session.subjectId,
      startedAt,
      endedAt,
      durationSeconds: elapsed,
      note: note || '',
      tags: tags || [],
      rating: rating || 0
    };
    State.addSession(saved);

    /* Update achievements */
    const sessions2 = State.getSessions();
    const settings2 = State.getSettings();
    const { getStreak: _gs, sumDuration: _sd } = await import('../util.js');
    const streak2 = _gs(sessions2, settings2.dailyGoalMinutes);
    const totalHours2 = Math.round(_sd(sessions2) / 3600 * 10) / 10;
    const prev2 = State.getAchievements();
    const wasStreak2 = prev2.longestStreak || 0;
    State.updateAchievements({ longestStreak: Math.max(wasStreak2, streak2), totalHours: totalHours2 });
    if (streak2 > wasStreak2 && streak2 > 1) launchConfetti(60);
  },

  toggle() {
    if (!this._session?.active) {
      const subjects = State.getSubjects();
      const widget = document.getElementById('session-widget');
      const sel = widget?.querySelector('.widget-subject-select');
      const id = sel?.value || subjects[0]?.id;
      if (id) this.start(id);
    } else if (this._session.paused) {
      this.resume();
    } else {
      this.pause();
    }
  },

  _startTick() {
    clearInterval(_timer);
    _timer = setInterval(() => {
      const el = document.querySelector('.widget-timer');
      if (el && this._session?.active) {
        el.textContent = formatDuration(getElapsed(this._session), 'timer');
      }
      /* Update focus mode timer if open */
      const ft = document.querySelector('.focus-timer');
      if (ft && this._session?.active) {
        ft.textContent = formatDuration(getElapsed(this._session), 'timer');
      }
    }, 1000);
  },

  _scheduleNotification() {
    clearTimeout(_notifTimer);
    const settings = State.getSettings();
    if (!settings.notificationsEnabled) return;
    _notifTimer = setTimeout(() => {
      if (Notification.permission === 'granted' && this._session?.active) {
        new Notification('Lernpause?', { body: 'Du lernst seit 50 Minuten. Zeit für eine kurze Pause?', icon: '' });
      }
    }, 50 * 60 * 1000);
  },

  _render() {
    const widget = document.getElementById('session-widget');
    if (!widget) return;
    const subjects = State.getSubjects();
    const s = this._session;

    if (!s?.active) {
      widget.dataset.state = 'idle';
      widget.innerHTML = `
        <div class="widget-idle">
          <select class="select widget-subject-select" aria-label="Fach wählen">
            ${subjects.map(sub => `<option value="${sub.id}">${sub.name}</option>`).join('')}
          </select>
          <button class="btn btn-primary widget-start btn-sm" data-widget-action="start">
            <i data-lucide="play"></i> Start
          </button>
        </div>`;
    } else {
      const subject = State.getSubject(s.subjectId);
      const subColor = `var(--subject-${s.subjectId})`;
      const paused = s.paused;
      widget.dataset.state = paused ? 'paused' : 'running';
      widget.style.setProperty('--pulse-rgb', subColor.replace('var(--subject-','').replace(')',''));
      widget.innerHTML = `
        <div class="widget-active">
          <div class="widget-subject-pill">
            <div class="widget-dot" style="background:${subColor}"></div>
            <span>${subject?.name || ''}</span>
            ${paused ? '<span class="badge badge-warning" style="margin-left:auto">Pause</span>' : ''}
          </div>
          <div class="widget-timer num-display">${formatDuration(getElapsed(s),'timer')}</div>
          <div class="widget-note-preview" id="widget-note" title="Klicken zum Bearbeiten">${s.note || 'Notiz hinzufügen...'}</div>
          <div class="widget-controls">
            ${paused
              ? `<button class="btn btn-primary btn-sm" data-widget-action="resume"><i data-lucide="play"></i> Weiter</button>`
              : `<button class="btn btn-secondary btn-sm" data-widget-action="pause"><i data-lucide="pause"></i> Pause</button>`}
            <button class="btn btn-ghost btn-sm" data-widget-action="focus" title="Focus Mode (F)"><i data-lucide="maximize-2"></i></button>
            <button class="btn btn-danger btn-sm" data-widget-action="stop"><i data-lucide="square"></i> Stop</button>
          </div>
        </div>`;
      widget.style.borderColor = `rgba(var(--pulse-rgb-raw,139,92,246),0.3)`;

      /* inline border color */
      const colorMap = { klr:'16,185,129', math:'139,92,246', prog:'6,182,212', kbs:'245,158,11' };
      const rgb = colorMap[s.subjectId] || '139,92,246';
      widget.style.borderColor = `rgba(${rgb},0.35)`;
    }

    renderIcons(widget);
    this._bindWidget(widget);
  },

  _bindWidget(widget) {
    widget.addEventListener('click', e => {
      const btn = e.target.closest('[data-widget-action]');
      if (!btn) return;
      switch (btn.dataset.widgetAction) {
        case 'start': {
          const sel = widget.querySelector('.widget-subject-select');
          this.start(sel?.value || State.getSubjects()[0]?.id);
          break;
        }
        case 'pause':  this.pause(); break;
        case 'resume': this.resume(); break;
        case 'stop':   this.stop(); break;
        case 'focus':  document.dispatchEvent(new CustomEvent('app:focus')); break;
      }
    });

    const noteEl = widget.querySelector('#widget-note');
    noteEl?.addEventListener('click', () => {
      if (!this._session) return;
      const input = document.createElement('textarea');
      input.className = 'textarea';
      input.value = this._session.note || '';
      input.rows = 2;
      input.style.cssText = 'font-size:12px;padding:6px;resize:none;margin-top:4px';
      noteEl.replaceWith(input);
      input.focus();
      const save = () => {
        this._session = { ...this._session, note: input.value };
        saveActive(this._session);
        this._render();
      };
      input.addEventListener('blur', save);
      input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(); } });
    });
  }
};
