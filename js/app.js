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
import { generateDemoData } from './demo.js';
import { renderIcons, setPhases, applySubjectColors } from './util.js';
import { Auth } from './auth.js';
import * as Sync from './sync.js';

let _launchAppStarted = false;
let _routerVisualListener = false;
let _shortcutsDocBound = false;
let _sessionSavedDocBound = false;
let _actionDelegationBound = false;

function refreshCurrentView() {
  console.log('[DEBUG] Refreshing current view');
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
      <div style="color:var(--danger);font-weight:600">Ansicht „${route}“ fehlgeschlagen</div>
      <p style="color:var(--text-secondary);font-size:14px;margin-top:12px">${String(e?.message || e)}</p>
    </div>`;
  }
  renderIcons(document.getElementById('sidebar-nav'));
  renderIcons(document.getElementById('mobile-tabs'));
  renderIcons(document.getElementById('session-widget'));
}

/* ── Default state ─────────────────────────────────────────── */
function defaultScheduleBlocks() {
  return [];
}

const DEFAULT_STATE = {
  version: 2,
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
  achievements: { longestStreak:0, totalHours:0 },
  todos: [],
  schedulePrefs: {
    source: 'manual',
    icsUrl: '',
    icsFileName: null,
    lastSyncedAt: null,
    lastError: null,
    eventCount: 0,
    syncIntervalMinutes: 60
  }
};

function showAccountModal() {
  const user = State.getUserId();
  const modal = Modal.open({
    title: 'Account',
    body: `
      <div style="display:flex;flex-direction:column;gap:12px">
        <div class="settings-row" style="border:none;padding:0">
          <div>
            <div class="settings-row-label">Eingeloggt als</div>
            <div class="settings-row-sub" id="account-email" style="font-family:var(--font-mono);font-size:12px">…</div>
          </div>
        </div>
      </div>`,
    footer: `<button class="btn btn-danger btn-sm" id="btn-signout">Abmelden</button>
             <button class="btn btn-ghost btn-sm" id="btn-account-close">Schließen</button>`
  });
  Auth.getUser().then(u => {
    const el = document.getElementById('account-email');
    if (el && u) el.textContent = u.email;
  });
  modal.el.querySelector('#btn-account-close')?.addEventListener('click', () => modal.close());
  modal.el.querySelector('#btn-signout')?.addEventListener('click', async () => {
    modal.close();
    try {
      await Auth.signOut();
    } catch (err) {
      Toast.error('Abmeldung fehlgeschlagen', err.message);
    }
  });
}

/* ── Boot ───────────────────────────────────────────────────── */
async function boot() {
  try {
    // Supabase Auth check
    const session = await Auth.getSession();
    if (session?.user) {
      await bootWithUser(session.user);
    } else {
      showAuthScreen();
    }

    // Listen for auth state changes (login / logout)
    Auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        hideAuthScreen();
        if (!_launchAppStarted) {
          await bootWithUser(session.user);
        }
      } else if (event === 'SIGNED_OUT') {
        _launchAppStarted = false;
        showAuthScreen();
        State.setUserId(null);
        State.init(JSON.parse(JSON.stringify(DEFAULT_STATE)));
      }
    });
  } catch (e) {
    console.error('[boot]', e);
    // Fallback: show auth screen on error
    showAuthScreen();
  }
}

async function bootWithUser(user) {
  try {
    State.setUserId(user.id);
    updateUserAvatar(user);

    // Load from Supabase, fallback to localStorage cache
    let stateData;
    try {
      const cached = Storage.load();
      const defaultBase = JSON.parse(JSON.stringify(DEFAULT_STATE));
      // Start with cache for instant render, then hydrate from Supabase
      if (cached) {
        State.init(cached);
        launchApp();
      }
      stateData = await Sync.loadAllData(user.id, cached || defaultBase);
      State.init(stateData);
      Storage.saveNow(stateData);
      if (!_launchAppStarted) launchApp();
      else refreshCurrentView();
    } catch (syncErr) {
      console.warn('[boot] Supabase load failed, using local cache:', syncErr.message);
      const cached = Storage.load();
      if (cached) {
        State.init(cached);
      } else {
        State.init(JSON.parse(JSON.stringify(DEFAULT_STATE)));
      }
      if (!_launchAppStarted) launchApp();
      Toast.error('Sync-Fehler', 'Lokale Daten werden genutzt.');
    }

    setPhases(State.getSettings().phases || null);
    applySubjectColors(State.getSubjects());
    Sync.initOfflineHandling(user.id);
    Sync.flushQueue(user.id);

    // Migration banner
    const localRaw = localStorage.getItem('learn.v1');
    if (localRaw) {
      try {
        const localData = JSON.parse(localRaw);
        const hasSessions = (localData.sessions || []).filter(s => !s.isDemo).length > 0;
        if (hasSessions) showMigrationBanner(localData, user.id);
      } catch {}
    }

    void waitForLucide(15000).then(() => {
      const vr = document.getElementById('view-root');
      if (vr) renderIcons(vr);
      renderIcons(document.getElementById('sidebar-nav'));
      renderIcons(document.getElementById('mobile-tabs'));
      renderIcons(document.getElementById('session-widget'));
    });
  } catch (e) {
    console.error('[bootWithUser]', e);
    document.getElementById('app')?.removeAttribute('aria-busy');
    const root = document.getElementById('view-root');
    if (root) root.innerHTML = `<div class="view" style="padding:24px;max-width:560px">
      <div class="view-title" style="color:var(--danger)">Start fehlgeschlagen</div>
      <p style="color:var(--text-secondary);font-size:14px;margin-top:12px">${String(e?.message || e)}</p>
    </div>`;
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
  if (_launchAppStarted) return;
  _launchAppStarted = true;

  const app = document.getElementById('app');
  app?.removeAttribute('aria-busy');

  /* Apply stored sidebar state */
  const settings = State.getSettings();
  if (settings.sidebarCollapsed) document.documentElement.dataset.sidebar = 'collapsed';

  /* Register views */
  Router.register('dashboard',  renderDashboard);
  Router.register('schedule',   renderSchedule);
  Router.register('sessions',   renderSessions);
  Router.register('todos',      renderTodos);
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

  if (!_shortcutsDocBound) {
    _shortcutsDocBound = true;
    document.addEventListener('app:shortcuts', () => showShortcuts());
  }

  /* Start router (triggers first render) */
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

  /* Render after session saved */
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

    // Sync wenn: Cache leer ODER Intervall abgelaufen
    if (!cacheEmpty && !shouldAutoSync(prefs.lastSyncedAt, intervalMinutes)) return;

    console.log('[App] Auto-sync Kalender…');
    const txt = await fetchIcsText(prefs.icsUrl.trim());
    const evs = parseIcsToEvents(txt, 'ics-url');
    saveCache(evs, new Date().toISOString());
    State.patchSchedulePrefs({
      lastSyncedAt: new Date().toISOString(),
      lastError: null,
      eventCount: evs.length
    });
    Storage.saveNow(State.get());
    console.log(`[App] Kalender synct: ${evs.length} Termine`);
  } catch (err) {
    console.warn('[App] Auto-sync fehlgeschlagen:', err.message);
    State.patchSchedulePrefs({ lastError: err.code || 'SYNC' });
    Storage.saveNow(State.get());
  }
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

/** Single global delegation for every `[data-action]` control (shell, FAB, future views). */
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

/* ── Auth Screen ────────────────────────────────────────────── */
function showAuthScreen() {
  document.getElementById('app')?.removeAttribute('aria-busy');
  const overlay = document.getElementById('auth-overlay');
  if (!overlay) return;
  overlay.removeAttribute('hidden');

  // Tab switching
  overlay.querySelectorAll('[data-auth-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.authTab;
      overlay.querySelectorAll('[data-auth-tab]').forEach(b => b.classList.toggle('active', b.dataset.authTab === tab));
      overlay.querySelector('#auth-form-login').hidden  = tab !== 'login';
      overlay.querySelector('#auth-form-register').hidden = tab !== 'register';
      clearAuthError();
    });
  });

  // Login
  overlay.querySelector('#auth-form-login')?.addEventListener('submit', async e => {
    e.preventDefault();
    const email    = overlay.querySelector('#login-email').value.trim();
    const password = overlay.querySelector('#login-password').value;
    setAuthLoading(true);
    try {
      await Auth.signIn(email, password);
      // onAuthStateChange fires → hideAuthScreen + bootWithUser
    } catch (err) {
      showAuthError(err.message || 'Anmeldung fehlgeschlagen.');
    } finally {
      setAuthLoading(false);
    }
  });

  // Register
  overlay.querySelector('#auth-form-register')?.addEventListener('submit', async e => {
    e.preventDefault();
    const name     = overlay.querySelector('#reg-name').value.trim();
    const email    = overlay.querySelector('#reg-email').value.trim();
    const password = overlay.querySelector('#reg-password').value;
    setAuthLoading(true);
    try {
      await Auth.signUp(email, password, name);
      showAuthHint('Bestätigungs-E-Mail gesendet! Bitte prüfe dein Postfach.');
    } catch (err) {
      showAuthError(err.message || 'Registrierung fehlgeschlagen.');
    } finally {
      setAuthLoading(false);
    }
  });

  void waitForLucide(10000).then(() => renderIcons(overlay));
}

function hideAuthScreen() {
  document.getElementById('auth-overlay')?.setAttribute('hidden', '');
}

function showAuthError(msg) {
  const el = document.getElementById('auth-error');
  if (!el) return;
  el.textContent = msg;
  el.removeAttribute('hidden');
}
function clearAuthError() {
  const el = document.getElementById('auth-error');
  if (el) { el.textContent = ''; el.setAttribute('hidden', ''); }
}
function showAuthHint(msg) {
  const el = document.getElementById('auth-hint');
  if (el) el.textContent = msg;
}
function setAuthLoading(on) {
  ['btn-login','btn-register'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.disabled = on;
  });
}

function updateUserAvatar(user) {
  const avatar  = document.getElementById('user-avatar');
  const initial = document.getElementById('user-initial');
  if (!avatar || !initial) return;
  const name = user.user_metadata?.name || user.email || '?';
  initial.textContent = name.charAt(0).toUpperCase();
  avatar.dataset.tooltip = name;
}

/* ── Migration banner ───────────────────────────────────────── */
function showMigrationBanner(localData, userId) {
  const banner = document.getElementById('migration-banner');
  if (!banner) return;
  banner.removeAttribute('hidden');
  void waitForLucide(10000).then(() => renderIcons(banner));

  banner.querySelector('#btn-migrate')?.addEventListener('click', async () => {
    banner.setAttribute('hidden', '');
    try {
      await Sync.migrateLocalData(localData, userId);
      Toast.success('Migration abgeschlossen', 'Lokale Daten wurden übertragen.');
    } catch (err) {
      Toast.error('Migration fehlgeschlagen', err.message);
    }
  });
  banner.querySelector('#btn-migrate-skip')?.addEventListener('click', () => {
    banner.setAttribute('hidden', '');
  });
}

/* ── Welcome Screen ─────────────────────────────────────────── */
function showWelcome() {
  const welcome = document.getElementById('welcome');
  if (!welcome) return;
  welcome.removeAttribute('hidden');

  renderIcons(welcome);

  welcome.querySelector('[data-welcome="demo"]')?.addEventListener('click', () => {
    const demoData = generateDemoData(JSON.parse(JSON.stringify(DEFAULT_STATE)));
    State.init(demoData);
    Storage.saveNow(demoData);
    welcome.setAttribute('hidden', '');
    refreshCurrentView();
  });

  welcome.querySelector('[data-welcome="empty"]')?.addEventListener('click', () => {
    const fresh = JSON.parse(JSON.stringify(DEFAULT_STATE));
    State.init(fresh);
    Storage.saveNow(fresh);
    welcome.setAttribute('hidden', '');
    refreshCurrentView();
  });
}

boot();
