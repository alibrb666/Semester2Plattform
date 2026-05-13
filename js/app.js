import { Storage }  from './storage.js';
import { State }    from './state.js';
import { Router }   from './router.js';
import { Theme }    from './theme.js';
import { Keyboard } from './keyboard.js';
import { TopBar }   from './components/topbar.js';
import { Sidebar }  from './components/sidebar.js';
import { SessionTracker } from './components/sessionTracker.js';
import { CommandPalette } from './components/commandPalette.js';
import { QuickCapture }   from './components/quickCapture.js';
import { FocusMode }      from './components/focusMode.js';
import { Modal }   from './components/modal.js';
import { Toast }   from './components/toast.js';
import { renderDashboard } from './views/dashboard.js';
import { renderSchedule }  from './views/schedule.js';
import { renderSessions }  from './views/sessions.js';
import { renderStatistics }from './views/statistics.js';
import { renderErrors }    from './views/errors.js';
import { renderMocks }     from './views/mocks.js';
import { renderSettings }  from './views/settings.js';
import { generateDemoData } from './demo.js';
import { renderIcons } from './util.js';

/* ── Default state ─────────────────────────────────────────── */
function defaultScheduleBlocks() {
  const mk = (id, subjectId, day, s, e, label) =>
    ({ id, subjectId, day, startTime:s, endTime:e, type:'lecture', locked:true, label });
  return [
    mk('sb-1','klr',  'monday',    '08:30','12:00','VL KLR'),
    mk('sb-2','prog', 'monday',    '15:30','20:00','Prog II'),
    mk('sb-3','kbs',  'tuesday',   '08:30','13:15','KBS / IT'),
    mk('sb-4','math', 'wednesday', '09:30','13:00','Mathe'),
    mk('sb-5','prog', 'wednesday', '14:00','17:45','Programmierkonzepte'),
    mk('sb-6','klr',  'thursday',  '09:00','12:45','FiBu'),
    mk('sb-7','kbs',  'friday',    '08:30','12:00','Systemanalyse'),
  ];
}

const DEFAULT_STATE = {
  version: 1,
  settings: {
    name: 'Lukas', theme: 'dark', sidebarCollapsed: false,
    dailyGoalMinutes: 240,
    weeklyGoals: { klr:360, math:390, prog:360, kbs:300 },
    soundEnabled: true, notificationsEnabled: false, streakFreezeUsed: false
  },
  subjects: [
    { id:'klr',  name:'KLR / FiBu',       color:'var(--subject-klr)',  examDate:'2026-07-21' },
    { id:'math', name:'Mathe II',          color:'var(--subject-math)', examDate:'2026-07-24' },
    { id:'prog', name:'Programmierung II', color:'var(--subject-prog)', examDate:'2026-07-27' },
    { id:'kbs',  name:'KBS / IT',          color:'var(--subject-kbs)',  examDate:'2026-07-31' },
  ],
  sessions: [],
  scheduleBlocks: defaultScheduleBlocks(),
  errorLog: [],
  mocks: [],
  weeklyReviews: [],
  achievements: { longestStreak:0, totalHours:0 }
};

function waitForGlobal(prop, ms = 3000) {
  return new Promise(resolve => {
    const t0 = Date.now();
    const tick = () => {
      if (window[prop]) { resolve(); return; }
      if (Date.now() - t0 >= ms) { resolve(); return; }
      requestAnimationFrame(tick);
    };
    tick();
  });
}

/* ── Boot ───────────────────────────────────────────────────── */
async function boot() {
  await Promise.all([waitForLucide(5000), waitForGlobal('Chart', 3000)]);

  const stored = Storage.load();
  if (!stored) {
    showWelcome();
  } else {
    State.init(stored);
    launchApp();
  }
}

function waitForLucide(ms = 5000) {
  return new Promise(resolve => {
    if (window.lucide) { resolve(); return; }
    const interval = setInterval(() => {
      if (window.lucide) { clearInterval(interval); resolve(); }
    }, 50);
    setTimeout(() => { clearInterval(interval); resolve(); }, ms);
  });
}

function launchApp() {
  const app = document.getElementById('app');
  app?.removeAttribute('aria-busy');

  /* Apply stored sidebar state */
  const settings = State.getSettings();
  if (settings.sidebarCollapsed) document.documentElement.dataset.sidebar = 'collapsed';

  /* Register views */
  Router.register('dashboard',  renderDashboard);
  Router.register('schedule',   renderSchedule);
  Router.register('sessions',   renderSessions);
  Router.register('statistics', renderStatistics);
  Router.register('errors',     renderErrors);
  Router.register('mocks',      renderMocks);
  Router.register('settings',   renderSettings);

  /* Init components */
  TopBar.init();
  Sidebar.init();
  SessionTracker.init();
  CommandPalette.init();
  QuickCapture.init();
  FocusMode.init();
  initKeyboard();
  initActionDelegation();

  document.addEventListener('app:shortcuts', () => showShortcuts());

  /* Start router (triggers first render) */
  Router.init();

  Router.onChange(() => {
    const vr = document.getElementById('view-root');
    if (vr) renderIcons(vr);
    renderIcons(document.getElementById('sidebar-nav'));
    renderIcons(document.getElementById('mobile-tabs'));
    renderIcons(document.getElementById('session-widget'));
  });

  /* Render after session saved */
  document.addEventListener('session:saved', () => {
    const route = Router.current();
    if (route === 'dashboard') {
      const root = document.getElementById('view-root');
      if (root) renderDashboard(root);
    }
  });
}

function initKeyboard() {
  Keyboard.init();
  const ROUTES = ['dashboard','schedule','sessions','statistics','errors','mocks','settings'];

  Keyboard.on('palette',        () => document.dispatchEvent(new CustomEvent('app:palette')));
  Keyboard.on('theme',          () => Theme.toggle());
  Keyboard.on('session-toggle', () => SessionTracker.toggle());
  Keyboard.on('focus',          () => document.dispatchEvent(new CustomEvent('app:focus')));
  Keyboard.on('quick-capture',  () => document.dispatchEvent(new CustomEvent('app:quick-capture')));
  Keyboard.on('escape',         () => { Modal.closeTop(); });
  Keyboard.on('shortcuts',      () => showShortcuts());

  ROUTES.forEach((r, i) => {
    Keyboard.on(`nav-${i+1}`, () => Router.navigate(r));
  });
}

/** Single global delegation for every `[data-action]` control (shell, FAB, future views). */
function initActionDelegation() {
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    switch (btn.dataset.action) {
      case 'toggle-sidebar': TopBar.toggleSidebar(); break;
      case 'toggle-theme':   Theme.toggle(); break;
      case 'open-palette':   document.dispatchEvent(new CustomEvent('app:palette')); break;
      case 'open-shortcuts': showShortcuts(); break;
      case 'quick-capture':  document.dispatchEvent(new CustomEvent('app:quick-capture')); break;
      default: break;
    }
  });
}

function showShortcuts() {
  Modal.open({
    title: 'Tastatur-Shortcuts',
    size: 'lg',
    body: `
      <div class="shortcuts-grid">
        <div>
          <div class="shortcut-section-title">Navigation</div>
          ${[
            ['1–7', 'Zwischen Views wechseln'],
            ['⌘K', 'Befehlspalette öffnen'],
            ['T', 'Theme umschalten'],
            ['?', 'Shortcuts anzeigen'],
          ].map(([k,d]) => `<div class="shortcut-row">
            <span class="shortcut-desc">${d}</span>
            <span class="shortcut-keys"><kbd>${k}</kbd></span>
          </div>`).join('')}
        </div>
        <div>
          <div class="shortcut-section-title">Session & Capture</div>
          ${[
            ['S', 'Session starten / stoppen'],
            ['F', 'Focus Mode'],
            ['N', 'Schnell erfassen'],
            ['Esc', 'Modal schließen / Focus beenden'],
          ].map(([k,d]) => `<div class="shortcut-row">
            <span class="shortcut-desc">${d}</span>
            <span class="shortcut-keys"><kbd>${k}</kbd></span>
          </div>`).join('')}
        </div>
      </div>`
  });
  renderIcons(document.querySelector('.modal'));
}

/* ── Welcome Screen ─────────────────────────────────────────── */
function showWelcome() {
  const welcome = document.getElementById('welcome');
  if (!welcome) return;
  welcome.hidden = false;

  renderIcons(welcome);

  welcome.querySelector('[data-welcome="demo"]')?.addEventListener('click', () => {
    const demoData = generateDemoData(DEFAULT_STATE);
    State.init(demoData);
    Storage.saveNow(demoData);
    welcome.hidden = true;
    launchApp();
  });

  welcome.querySelector('[data-welcome="empty"]')?.addEventListener('click', () => {
    const fresh = JSON.parse(JSON.stringify(DEFAULT_STATE));
    State.init(fresh);
    Storage.saveNow(fresh);
    welcome.hidden = true;
    launchApp();
  });
}

boot();
