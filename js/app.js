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
import { renderTodos }     from './views/todos.js';
import { renderIcons, setPhases, applySubjectColors } from './util.js';
import { Auth } from './auth.js';
import * as Sync from './sync.js';

const USER_KEY = 'learn.user_id';
const DEFAULT_ICS_URL = 'https://calendar.google.com/calendar/ical/b4a4464084327a2a90ac105b62cd75812d520f372be512c64711d5a3a4848151%40group.calendar.google.com/public/basic.ics';

let _launchAppStarted = false;
let _routerVisualListener = false;
let _shortcutsDocBound = false;
let _sessionSavedDocBound = false;
let _actionDelegationBound = false;

function refreshCurrentView() {
  const route = Router.current() || 'dashboard';
  const view = document.getElementById('view-root');
  if (!view) return;
  const renders = {
    dashboard: renderDashboard,
    schedule: renderSchedule,
    sessions: renderSessions,
    todos: renderTodos,
    statistics: renderStatistics,
    errors: renderErrors,
    mocks: renderMocks,
    settings: renderSettings
  };
  const fn = renders[route] || renderDashboard;
  try {
    view.innerHTML = '';
    fn(view);
    renderIcons(view);
  } catch (e) {
    console.error('[refreshCurrentView]', route, e);
    view.innerHTML = `<div class="view" style="padding:24px;max-width:520px">
      <div style="color:var(--danger);font-weight:600">Ansicht „${route}" fehlgeschlagen</div>
      <p style="color:var(--text-secondary);font-size:14px;margin-top:12px">${String(e?.message || e)}</p>
    </div>`;
  }
  renderIcons(document.getElementById('sidebar-nav'));
  renderIcons(document.getElementById('mobile-tabs'));
  renderIcons(document.getElementById('session-widget'));
}

/* ── Default state ─────────────────────────────────────────── */
const DEFAULT_STATE = {
  version: 2,
  settings: {
    name: 'Nutzer', theme: 'dark', sidebarCollapsed: false,
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
  scheduleBlocks: [],
  errorLog: [],
  mocks: [],
  weeklyReviews: [],
  achievements: { longestStreak:0, totalHours:0 },
  todos: [],
  schedulePrefs: {
    source: 'ics-url',
    icsUrl: DEFAULT_ICS_URL,
    icsFileName: null,
    lastSyncedAt: null,
    lastError: null,
    eventCount: 0,
    syncIntervalMinutes: 60
  }
};

/* ── Boot ───────────────────────────────────────────────────── */
async function boot() {
  const savedUserId = localStorage.getItem(USER_KEY);

  if (savedUserId) {
    // Bekannter User – direkt starten
    const cached = Storage.load();
    const defaultBase = JSON.parse(JSON.stringify(DEFAULT_STATE));
    State.init(cached || defaultBase);
    launchApp();
    // Explizit aktuelle Route rendern, auch wenn der Hash bereits gesetzt ist.
    const initialRoute = window.location.hash.replace('#', '') || 'dashboard';
    Router.navigate(initialRoute);
    // Offline-Banner initial korrekt setzen
    if (navigator.onLine) document.getElementById('offline-banner')?.setAttribute('hidden', '');

    // Auth + Sync im Hintergrund
    Auth.getCurrentUser()
      .then(user => {
        if (!user) return Auth.getOrCreateUser();
        return user;
      })
      .then(user => {
        if (!user) return;
        State.setUserId(user.id);
        updateUserAvatar(user);
        // Offline-Handling erst hier, wenn userId bekannt
        Sync.initOfflineHandling(user.id);
        Sync.flushQueue(user.id);
        const base = cached || JSON.parse(JSON.stringify(DEFAULT_STATE));
        return Sync.loadAllData(user.id, base)
          .then(stateData => {
            State.init(stateData);
            Storage.saveNow(stateData);
            Sync.pushProfileState(State.get(), user.id);
            refreshCurrentView();
          });
      })
      .catch(e => console.warn('[Boot] Sync failed:', e));
  } else {
    // Neuer User – Name-Screen zeigen
    document.getElementById('app')?.removeAttribute('aria-busy');
    showNameScreen();
  }
}

function showNameScreen() {
  const screen = document.getElementById('name-screen');
  if (!screen) return;
  screen.removeAttribute('hidden');
  setTimeout(() => screen.querySelector('#input-name')?.focus(), 100);
  void waitForLucide(10000).then(() => renderIcons(screen));

  const showAuthError = message => {
    const el = screen.querySelector('#auth-error');
    if (!el) return;
    el.textContent = message || '';
    el.hidden = !message;
  };

  const startWithUser = async (user, name) => {
    State.setUserId(user.id);
    const cached = Storage.load();
    const defaultBase = cached || JSON.parse(JSON.stringify(DEFAULT_STATE));
    defaultBase.settings = {
      ...defaultBase.settings,
      name: defaultBase.settings?.name || name || user.user_metadata?.name || 'Nutzer'
    };
    State.init(defaultBase);
    Storage.saveNow(defaultBase);
    updateUserAvatar(user);
    Sync.initOfflineHandling(user.id);
    screen.setAttribute('hidden', '');
    launchApp();
    try {
      if (cached) await Sync.migrateLocalData(defaultBase, user.id);
      const stateData = await Sync.loadAllData(user.id, defaultBase);
      State.init(stateData);
      Storage.saveNow(stateData);
      Sync.pushProfileState(State.get(), user.id);
      refreshCurrentView();
    } catch (e) {
      console.warn('[Sync]', e);
    }
  };

  const withBusy = async (btn, label, fn) => {
    if (btn) { btn.disabled = true; btn.textContent = label; }
    showAuthError('');
    try { await fn(); }
    catch (e) { showAuthError(e.message || String(e)); }
    finally { if (btn) { btn.disabled = false; } }
  };

  screen.querySelector('#btn-start')?.addEventListener('click', async () => {
    const name = screen.querySelector('#input-name')?.value.trim() || 'Nutzer';
    const btn = screen.querySelector('#btn-start');
    await withBusy(btn, 'Öffne…', async () => {
      const user = await Auth.signInWithUsername(name);
      await startWithUser(user, name);
    });
    if (btn) btn.textContent = 'Öffnen';
  });

  screen.querySelector('#input-name')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') screen.querySelector('#btn-start')?.click();
  });
}

function launchApp() {
  if (_launchAppStarted) return;
  _launchAppStarted = true;

  const app = document.getElementById('app');
  app?.removeAttribute('aria-busy');

  const settings = State.getSettings();
  if (settings.sidebarCollapsed) document.documentElement.dataset.sidebar = 'collapsed';

  setPhases(settings.phases || null);
  applySubjectColors(State.getSubjects());

  Router.register('dashboard',  renderDashboard);
  Router.register('schedule',   renderSchedule);
  Router.register('sessions',   renderSessions);
  Router.register('todos',      renderTodos);
  Router.register('statistics', renderStatistics);
  Router.register('errors',     renderErrors);
  Router.register('mocks',      renderMocks);
  Router.register('settings',   renderSettings);

  TopBar.init();
  Sidebar.init();
  SessionTracker.init();
  CommandPalette.init();
  QuickCapture.init();
  FocusMode.init();
  initKeyboard();
  initActionDelegation();

  if (!_shortcutsDocBound) {
    _shortcutsDocBound = true;
    document.addEventListener('app:shortcuts', () => showShortcuts());
  }

  Router.init();

  if (!_routerVisualListener) {
    _routerVisualListener = true;
    Router.onChange(() => {
      const vr = document.getElementById('view-root');
      if (vr) renderIcons(vr);
      renderIcons(document.getElementById('sidebar-nav'));
      renderIcons(document.getElementById('mobile-tabs'));
      renderIcons(document.getElementById('session-widget'));
    });
  }

  if (!_sessionSavedDocBound) {
    _sessionSavedDocBound = true;
    document.addEventListener('session:saved', () => {
      const route = Router.current();
      if (route === 'dashboard') {
        const root = document.getElementById('view-root');
        if (root) renderDashboard(root);
      }
    });
  }

  maybeRefreshIcsSchedule();

  void waitForLucide(15000).then(() => {
    const vr = document.getElementById('view-root');
    if (vr) renderIcons(vr);
    renderIcons(document.getElementById('sidebar-nav'));
    renderIcons(document.getElementById('mobile-tabs'));
    renderIcons(document.getElementById('session-widget'));
  });
}

async function maybeRefreshIcsSchedule() {
  try {
    const { fetchIcsText, parseIcsToEvents, saveCache,
            shouldAutoSync, loadCache } = await import('./scheduleSync.js');

    const prefs = State.get().schedulePrefs;
    if (!prefs || prefs.source !== 'ics-url' || !prefs.icsUrl?.trim()) return;

    const cache = loadCache();
    const cacheEmpty = !cache.events || cache.events.length === 0;
    const intervalMinutes = prefs.syncIntervalMinutes || 60;

    if (!cacheEmpty && !shouldAutoSync(prefs.lastSyncedAt, intervalMinutes)) return;

    const txt = await fetchIcsText(prefs.icsUrl.trim());
    const evs = parseIcsToEvents(txt, 'ics-url');
    saveCache(evs, new Date().toISOString());
    State.patchSchedulePrefs({
      lastSyncedAt: new Date().toISOString(),
      lastError: null,
      eventCount: evs.length
    });
    Storage.saveNow(State.get());
  } catch (err) {
    console.warn('[App] Auto-sync fehlgeschlagen:', err.message);
    State.patchSchedulePrefs({ lastError: err.code || 'SYNC' });
    Storage.saveNow(State.get());
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

function initKeyboard() {
  Keyboard.init();
  const ROUTES = ['dashboard','schedule','sessions','todos','statistics','errors','mocks','settings'];

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

function initActionDelegation() {
  if (_actionDelegationBound) return;
  _actionDelegationBound = true;
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    switch (btn.dataset.action) {
      case 'toggle-sidebar': TopBar.toggleSidebar(); break;
      case 'toggle-theme':   Theme.toggle(); break;
      case 'open-palette':   document.dispatchEvent(new CustomEvent('app:palette')); break;
      case 'open-shortcuts': showShortcuts(); break;
      case 'quick-capture':  document.dispatchEvent(new CustomEvent('app:quick-capture')); break;
      case 'open-account':   showAccountModal(); break;
      default: break;
    }
  });
}

function showAccountModal() {
  const modal = Modal.open({
    title: 'Gerät',
    body: `
      <div style="display:flex;flex-direction:column;gap:12px">
        <div class="settings-row" style="border:none;padding:0">
          <div>
            <div class="settings-row-label">Nutzer-ID</div>
            <div class="settings-row-sub" id="account-uid" style="font-family:var(--font-mono);font-size:11px;word-break:break-all">…</div>
          </div>
        </div>
      </div>`,
    footer: `<button class="btn btn-danger btn-sm" id="btn-device-reset">Gerät zurücksetzen</button>
             <button class="btn btn-ghost btn-sm" id="btn-account-close">Schließen</button>`
  });
  Auth.getCurrentUser().then(u => {
    const el = document.getElementById('account-uid');
    if (el && u) el.textContent = u.id;
  });
  modal.el.querySelector('#btn-account-close')?.addEventListener('click', () => modal.close());
  modal.el.querySelector('#btn-device-reset')?.addEventListener('click', async () => {
    modal.close();
    const confirmModal = Modal.open({
      title: 'Gerät zurücksetzen?',
      size: 'sm',
      body: '<p style="color:var(--text-secondary);font-size:14px;line-height:1.55">Alle lokalen Daten werden gelöscht. Beim nächsten Start erscheint der Name-Screen wieder.<br><br>Daten in der Cloud bleiben erhalten — du kannst dich auf einem anderen Gerät wieder einloggen.</p>',
      footer: `<button class="btn btn-ghost" id="device-reset-cancel">Abbrechen</button>
               <button class="btn btn-danger" id="device-reset-confirm">Zurücksetzen</button>`
    });
    confirmModal.el.querySelector('#device-reset-cancel')?.addEventListener('click', () => confirmModal.close());
    confirmModal.el.querySelector('#device-reset-confirm')?.addEventListener('click', async () => {
      confirmModal.close();
      try { await Auth.signOut(); } catch {}
      Storage.clear();
      location.reload();
    });
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
            ['1–8', 'Zwischen Views wechseln'],
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

function updateUserAvatar(user) {
  const avatar  = document.getElementById('user-avatar');
  const initial = document.getElementById('user-initial');
  if (!avatar || !initial) return;
  const name = State.getSettings()?.name || user.user_metadata?.name || '?';
  initial.textContent = name.charAt(0).toUpperCase();
  avatar.dataset.tooltip = name;
}

boot();
