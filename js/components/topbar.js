import { State } from '../state.js';
import { daysUntil, formatDuration, sumDuration, getSubjectSessions, renderIcons,
  formatDateFull, formatTime } from '../util.js';
import { Modal } from './modal.js';

let _interval = null;
let _topBarInited = false;

export const TopBar = {
  init() {
    if (_topBarInited) return;
    _topBarInited = true;
    this._render();
    _interval = setInterval(() => this._renderCountdowns(), 60000);
    State.subscribe(() => this._render());
    document.addEventListener('subjects:changed', () => this._renderCountdowns());
  },

  /** Called from central `data-action` delegation in app.js */
  toggleSidebar() {
    const html = document.documentElement;
    const collapsed = html.dataset.sidebar === 'collapsed';
    if (collapsed) delete html.dataset.sidebar;
    else html.dataset.sidebar = 'collapsed';
    State.updateSettings({ sidebarCollapsed: !collapsed });
  },

  _render() {
    this._renderCountdowns();
  },

  _renderCountdowns() {
    const container = document.getElementById('topbar-countdowns');
    if (!container) return;
    const subjects = State.getSubjects();
    const sessions = State.getSessions();
    container.innerHTML = subjects.map(s => {
      const days = daysUntil(s.examDate);
      const totalSec = sumDuration(getSubjectSessions(sessions, s.id));
      const urgent = days <= 7;
      const critical = days <= 2;
      const cls = critical ? 'critical' : urgent ? 'urgent' : '';
      const subColor = `var(--subject-${s.id})`;
      return `
        <button class="countdown-pill ${cls}" data-subject-id="${s.id}"
          style="border-left-color:${subColor}"
          aria-label="${s.name}: noch ${days} Tage">
          <span class="pill-name">${s.name.split(' ')[0]}</span>
          <span class="pill-days">${days}d</span>
          <span class="pill-hours">${formatDuration(totalSec)}</span>
        </button>`;
    }).join('');

    container.querySelectorAll('.countdown-pill').forEach(pill => {
      pill.addEventListener('click', () => this._showSubjectDetail(pill.dataset.subjectId));
    });
  },

  _showSubjectDetail(subjectId) {
    const subject = State.getSubject(subjectId);
    if (!subject) return;
    const sessions = getSubjectSessions(State.getSessions(), subjectId)
      .sort((a,b) => new Date(b.startedAt) - new Date(a.startedAt))
      .slice(0, 10);
    const mocks = State.getMocks().filter(m => m.subjectId === subjectId);
    const errors = State.getErrors().filter(e => e.subjectId === subjectId);
    const totalSec = sumDuration(getSubjectSessions(State.getSessions(), subjectId));
    const days = daysUntil(subject.examDate);

    Modal.open({
      title: subject.name,
      size: 'lg',
      body: `
        <div style="display:flex;gap:24px;margin-bottom:20px;flex-wrap:wrap">
          <div class="card" style="flex:1;min-width:120px;text-align:center">
            <div class="stat-label">Klausur in</div>
            <div class="stat-value" style="font-size:36px;color:var(--subject-${subjectId})">${days}d</div>
            <div class="card-sub">${formatDateFull(subject.examDate)}</div>
          </div>
          <div class="card" style="flex:1;min-width:120px;text-align:center">
            <div class="stat-label">Gelernt gesamt</div>
            <div class="stat-value">${formatDuration(totalSec, 'long')}</div>
          </div>
          <div class="card" style="flex:1;min-width:120px;text-align:center">
            <div class="stat-label">Mocks</div>
            <div class="stat-value">${mocks.length}</div>
          </div>
          <div class="card" style="flex:1;min-width:120px;text-align:center">
            <div class="stat-label">Fehler</div>
            <div class="stat-value">${errors.length}</div>
          </div>
        </div>
        <div class="section-title" style="margin-bottom:12px">Letzte Sessions</div>
        ${sessions.length ? sessions.map(s => `
          <div class="session-item" style="margin-bottom:6px">
            <div class="session-color-bar" style="background:var(--subject-${subjectId})"></div>
            <div class="session-info">
              <div class="session-note">${s.note || 'Keine Notiz'}</div>
              <div class="session-subject">${formatDateFull(s.startedAt)} · ${formatTime(s.startedAt)}</div>
            </div>
            <div class="session-meta">
              <div class="session-duration">${formatDuration(s.durationSeconds)}</div>
            </div>
          </div>`).join('') : '<div class="empty-sub">Noch keine Sessions.</div>'}
      `
    });
    renderIcons(document.querySelector('.modal'));
  }
};
