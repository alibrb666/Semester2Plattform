import { State } from '../state.js';
import { Router } from '../router.js';
import { getPhase, getStreak, getTodaySessions, sumDuration, formatDuration, renderIcons } from '../util.js';

const ROUTES = ['dashboard','schedule','sessions','todos','statistics','errors','mocks','settings'];

let _sidebarInited = false;
export const Sidebar = {
  init() {
    if (!_sidebarInited) {
      Router.onChange(route => this._setActive(route));
      State.subscribe(() => this._updateFoot());
      _sidebarInited = true;
    }
    this._setActive(Router.current());
    this._updateFoot();
    renderIcons(document.getElementById('sidebar-nav'));
    renderIcons(document.querySelector('.sidebar-brand'));
  },

  _setActive(route) {
    document.querySelectorAll('.nav-item, .mobile-tabs .tab').forEach(el => {
      el.classList.toggle('active', el.dataset.route === route);
    });
  },

  _updateFoot() {
    const settings = State.getSettings();
    const sessions = State.getSessions();
    const streak = getStreak(sessions, settings.dailyGoalMinutes || 240);
    const todaySecs = sumDuration(getTodaySessions(sessions));
    const phase = getPhase();

    const phasePill = document.getElementById('phase-pill');
    if (phasePill) {
      phasePill.dataset.phase = phase.num;
      phasePill.querySelector('.phase-label').textContent = `Phase ${phase.num}`;
      phasePill.setAttribute('data-tooltip', phase.label);
    }

    const streakEl = document.getElementById('sidebar-streak');
    if (streakEl) streakEl.textContent = `🔥 ${streak}`;

    const todayEl = document.getElementById('sidebar-today');
    if (todayEl) todayEl.textContent = formatDuration(todaySecs);
  }
};
