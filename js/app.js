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
import * as ScheduleSync from './scheduleSync.js';
import { t, setLanguage, setLanguageSilent, getLanguage, initialLanguage, LANGUAGES, translateDom } from './i18n.js';

const USER_KEY = 'learn.user_id';

let _launchAppStarted = false;
let _routerVisualListener = false;
let _shortcutsDocBound = false;
let _sessionSavedDocBound = false;
let _actionDelegationBound = false;

function setActiveUser(userId) {
  State.setUserId(userId);
  Storage.setUserId(userId);
  ScheduleSync.setUserId(userId);
}

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
    translateDom(view);
    renderIcons(view);
  } catch (e) {
    console.error('[refreshCurrentView]', route, e);
    view.innerHTML = `<div class="view" style="padding:24px;max-width:520px">
      <div style="color:var(--danger);font-weight:600">Ansicht „${route}" fehlgeschlagen</div>
      <p style="color:var(--text-secondary);font-size:14px;margin-top:12px">${String(e?.message || e)}</p>
    </div>`;
  }
  renderIcons(document.querySelector('.topbar'));
  renderIcons(document.getElementById('sidebar-nav'));
  renderIcons(document.querySelector('.sidebar-foot'));
  renderIcons(document.getElementById('mobile-tabs'));
  renderIcons(document.getElementById('session-widget'));
}

function applyShellLanguage() {
  const nav = [
    ['dashboard', t('dashboard')],
    ['schedule', t('schedule')],
    ['sessions', t('sessions')],
    ['todos', t('todos')],
    ['statistics', t('statistics')],
    ['errors', t('errors')],
    ['mocks', t('mocks')],
    ['settings', t('settings')]
  ];
  document.querySelector('.brand-name') && (document.querySelector('.brand-name').textContent = t('appName'));
  document.querySelector('.sidebar-quick-capture span') && (document.querySelector('.sidebar-quick-capture span').textContent = t('quickCapture'));
  // Only target sidebar nav items — not .sidebar-brand which also has data-route="dashboard"
  nav.forEach(([route, label]) => {
    document.querySelectorAll(`#sidebar-nav [data-route="${route}"] span`).forEach(el => { el.textContent = label; });
  });
  const mobile = { dashboard: t('today'), schedule: t('plan'), statistics: t('stats'), settings: t('more') };
  Object.entries(mobile).forEach(([route, label]) => {
    const el = document.querySelector(`.mobile-tabs [data-route="${route}"] span`);
    if (el) el.textContent = label;
  });
  const avatar = document.getElementById('user-avatar');
  if (avatar) {
    avatar.setAttribute('aria-label', t('account'));
    avatar.dataset.tooltip = State.getSettings()?.name || t('account');
  }
}

/* ── Default state ─────────────────────────────────────────── */
const DEFAULT_STATE = {
  version: 2,
  settings: {
    name: 'Nutzer', theme: 'dark', sidebarCollapsed: false,
    dailyGoalMinutes: 240,
    weeklyGoals: {},
    soundEnabled: true, notificationsEnabled: false, streakFreezeUsed: false,
    language: 'de'
  },
  subjects: [],
  sessions: [],
  scheduleBlocks: [],
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

/* ── Boot ───────────────────────────────────────────────────── */
async function boot() {
  const savedUserId = localStorage.getItem(USER_KEY);

  if (savedUserId) {
    setActiveUser(savedUserId);
    const cached = Storage.load({ allowLegacy: false });
    const defaultBase = JSON.parse(JSON.stringify(DEFAULT_STATE));
    State.init(cached || defaultBase);
    // Apply cached language immediately so shell doesn't flash German
    const cachedLang = cached?.settings?.language || 'de';
    setLanguageSilent(cachedLang);
    launchApp();
    applyShellLanguage();
    const initialRoute = window.location.hash.replace('#', '') || 'dashboard';
    Router.navigate(initialRoute);
    if (navigator.onLine) document.getElementById('offline-banner')?.setAttribute('hidden', '');
    Auth.getCurrentUser()
      .then(user => { if (!user) return Auth.getOrCreateUser(); return user; })
      .then(user => {
        if (!user) return;
        setActiveUser(user.id);
        updateUserAvatar(user);
        Sync.initOfflineHandling(user.id);
        Sync.flushQueue(user.id);
        const base = cached || JSON.parse(JSON.stringify(DEFAULT_STATE));
        return Sync.loadAllData(user.id, base).then(stateData => {
          State.init(stateData);
          Storage.saveNow(stateData);
          Sync.pushProfileState(State.get(), user.id);
          setLanguageSilent(stateData.settings.language || cachedLang);
          applyShellLanguage();
          refreshCurrentView();
        });
      })
      .catch(e => console.warn('[Boot] Sync failed:', e));
  } else {
    document.getElementById('app')?.removeAttribute('aria-busy');
    showNameScreen();
  }
}

function showNameScreen() {
  const screen = document.getElementById('name-screen');
  if (!screen) return;
  screen.removeAttribute('hidden');
  void waitForLucide(10000).then(() => renderIcons(screen));

  const showAuthError = message => {
    const el = screen.querySelector('#auth-error');
    if (!el) return;
    el.textContent = message || '';
    el.hidden = !message;
  };

  const startWithUser = async (user, name) => {
    setActiveUser(user.id);
    const cached = Storage.load({ allowLegacy: false });
    const defaultBase = cached || JSON.parse(JSON.stringify(DEFAULT_STATE));
    // Always prefer the language the user selected on the profile screen (getLanguage())
    // over any hard-coded default, so non-German users see the correct language immediately.
    defaultBase.settings = {
      ...defaultBase.settings,
      name: defaultBase.settings?.name || name || user.user_metadata?.name || 'Nutzer',
      language: getLanguage() || defaultBase.settings?.language || 'de'
    };
    setLanguage(defaultBase.settings.language);
    State.init(defaultBase);
    Storage.saveNow(defaultBase);
    updateUserAvatar(user);
    Sync.initOfflineHandling(user.id);
    screen.setAttribute('hidden', '');
    // Remove auth inputs after successful login to prevent password-save prompts
    // on unrelated save actions elsewhere in the app.
    screen.innerHTML = '';
    launchApp();
    try {
      if (cached) await Sync.migrateLocalData(defaultBase, user.id);
      const stateData = await Sync.loadAllData(user.id, defaultBase);
      // If the user changed the language on the profile screen (getLanguage() differs
      // from the page-load default), their selection wins over the Supabase-stored value.
      // Otherwise use the Supabase-saved language so returning users on new devices
      // get their saved preference.
      const profileScreenChanged = getLanguage() !== initialLanguage;
      stateData.settings.language = profileScreenChanged
        ? getLanguage()
        : (stateData.settings.language || getLanguage());
      State.init(stateData);
      Auth.updateLocalProfile({ id: user.id, name: stateData.settings.name || name || 'Nutzer', language: stateData.settings.language });
      Storage.saveNow(stateData);
      Sync.pushProfileState(State.get(), user.id);
      // setLanguageSilent updates _lang without firing i18n:changed,
      // then applyShellLanguage + refreshCurrentView run exactly once.
      setLanguageSilent(stateData.settings.language);
      applyShellLanguage();
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

  function renderProfileScreen(mode = 'list', selected = null) {
    const profiles = Auth.listProfiles();
    const hasProfiles = profiles.length > 0;
    const langOptions = LANGUAGES.map(l => `<option value="${l.code}" ${getLanguage() === l.code ? 'selected' : ''}>${t(l.labelKey)}</option>`).join('');
    screen.innerHTML = `
      <div class="name-card profile-card">
        <div class="auth-logo"><span class="brand-mark">1.0</span></div>
        <h1 class="auth-title">${hasProfiles ? t('selectProfile') : t('welcome')}</h1>
        <p class="auth-sub">${hasProfiles ? t('selectProfileSub') : t('welcomeSub')}</p>
        <div class="profile-lang-row">
          <label for="profile-lang">${t('language')}</label>
          <select class="select" id="profile-lang">${langOptions}</select>
        </div>
        ${mode === 'create' || !hasProfiles ? `
          <div class="auth-form" id="profile-create-form">
            <div class="field">
              <label for="input-name">${t('username')}</label>
              <input class="input" id="input-name" type="text" placeholder="Ali" maxlength="30" autocomplete="off" autocapitalize="off" spellcheck="false" />
            </div>
            <div class="field">
              <label for="input-pin">${t('pin')}</label>
              <input class="input" id="input-pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="one-time-code" placeholder="1234" />
            </div>
            <button class="btn btn-primary" id="btn-start" type="button">${hasProfiles ? t('addProfile') : t('createFirstProfile')}</button>
            ${hasProfiles ? `<button class="btn btn-ghost" id="btn-cancel-create" type="button">${t('cancel')}</button>` : ''}
          </div>
        ` : `
          <div class="profile-list" aria-label="${t('knownProfiles')}">
            ${profiles.map(p => `
              <button class="profile-tile" type="button" data-profile-id="${p.id}">
                <span class="profile-avatar">${_esc(p.name).charAt(0).toUpperCase()}</span>
                <span class="profile-name">${_esc(p.name)}</span>
                <i data-lucide="${p.pinHash ? 'lock' : 'key-round'}"></i>
              </button>`).join('')}
          </div>
          ${selected ? `
            <div class="auth-form pin-panel">
              <div class="settings-row-label">${_esc(selected.name)}</div>
              <div class="field">
                <label for="input-pin">${selected.pinHash ? t('pin') : t('createPin')}</label>
                <input class="input" id="input-pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="one-time-code" autofocus />
              </div>
              <button class="btn btn-primary" id="btn-unlock" type="button">${selected.pinHash ? t('unlock') : t('createPin')}</button>
            </div>
          ` : ''}
          <button class="btn btn-secondary" id="btn-new-profile" type="button"><i data-lucide="plus"></i>${t('newProfile')}</button>
        `}
        <div class="auth-error" id="auth-error" hidden></div>
        <p class="auth-hint">${t('profileHint')}</p>
      </div>`;
    renderIcons(screen);
    screen.querySelector('#profile-lang')?.addEventListener('change', e => {
      setLanguage(e.target.value);
      renderProfileScreen(mode, selected);
    });
    screen.querySelector('#btn-new-profile')?.addEventListener('click', () => renderProfileScreen('create'));
    screen.querySelector('#btn-cancel-create')?.addEventListener('click', () => renderProfileScreen('list'));
    screen.querySelectorAll('[data-profile-id]').forEach(btn => {
      btn.addEventListener('click', () => renderProfileScreen('list', profiles.find(p => p.id === btn.dataset.profileId)));
    });
    screen.querySelector('#btn-start')?.addEventListener('click', async () => {
      const btn = screen.querySelector('#btn-start');
      await withBusy(btn, t('opening'), async () => {
        const name = screen.querySelector('#input-name')?.value.trim();
        const pin = screen.querySelector('#input-pin')?.value.trim();
        if (!name) throw new Error(t('nameRequired'));
        if (!/^\d{4}$/.test(pin || '')) throw new Error(t('pinRequired'));
        const user = await Auth.signInWithUsername(name, { pin, language: getLanguage() });
        await startWithUser(user, name);
      });
      if (btn) btn.textContent = hasProfiles ? t('addProfile') : t('createFirstProfile');
    });
    screen.querySelector('#btn-unlock')?.addEventListener('click', async () => {
      const btn = screen.querySelector('#btn-unlock');
      await withBusy(btn, selected?.pinHash ? t('unlock') : t('createPin'), async () => {
        const pin = screen.querySelector('#input-pin')?.value.trim();
        if (!/^\d{4}$/.test(pin || '')) throw new Error(t('pinRequired'));
        let profile = selected;
        if (!profile.pinHash) profile = await Auth.setProfilePin(profile, pin);
        // Prefer the profile screen selection if user changed it; otherwise use saved profile language.
        setLanguage(getLanguage() !== initialLanguage ? getLanguage() : (profile.language || getLanguage()));
        const user = await Auth.unlockProfile(profile, pin);
        await startWithUser(user, profile.name);
      });
    });
    screen.querySelectorAll('#input-name,#input-pin').forEach(input => {
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') screen.querySelector('#btn-start,#btn-unlock')?.click();
      });
    });
    setTimeout(() => screen.querySelector('input,button.profile-tile')?.focus(), 50);
  }

  renderProfileScreen();
}

function launchApp() {
  if (_launchAppStarted) return;
  _launchAppStarted = true;

  const app = document.getElementById('app');
  app?.removeAttribute('aria-busy');
  applyShellLanguage();

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
      renderIcons(document.querySelector('.topbar'));
      renderIcons(document.getElementById('sidebar-nav'));
      renderIcons(document.querySelector('.sidebar-foot'));
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
    renderIcons(document.querySelector('.topbar'));
    renderIcons(document.getElementById('sidebar-nav'));
    renderIcons(document.querySelector('.sidebar-foot'));
    renderIcons(document.getElementById('mobile-tabs'));
    renderIcons(document.getElementById('session-widget'));
  });
}

async function maybeRefreshIcsSchedule() {
  try {
    const prefs = State.get().schedulePrefs;
    if (!prefs || prefs.source !== 'ics-url' || !prefs.icsUrl?.trim()) return;

    const cache = ScheduleSync.loadCache();
    const cacheEmpty = !cache.events || cache.events.length === 0;
    const intervalMinutes = prefs.syncIntervalMinutes || 60;

    if (!cacheEmpty && !ScheduleSync.shouldAutoSync(prefs.lastSyncedAt, intervalMinutes)) return;

    const txt = await ScheduleSync.fetchIcsText(prefs.icsUrl.trim());
    const evs = ScheduleSync.parseIcsToEvents(txt, 'ics-url');
    ScheduleSync.saveCache(evs, new Date().toISOString());
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

document.addEventListener('i18n:changed', () => {
  applyShellLanguage();
  if (_launchAppStarted) refreshCurrentView();
});

function showAccountModal() {
  const modal = Modal.open({
    title: t('account'),
    body: `
      <div style="display:flex;flex-direction:column;gap:12px">
        <div class="settings-row" style="border:none;padding:0">
          <div>
            <div class="settings-row-label">${t('username')}</div>
            <div class="settings-row-sub" id="account-name">…</div>
          </div>
        </div>
        <div class="settings-row" style="border:none;padding:0">
          <div>
            <div class="settings-row-label">User-ID</div>
            <div class="settings-row-sub" id="account-uid" style="font-family:var(--font-mono);font-size:11px;word-break:break-all">…</div>
          </div>
        </div>
      </div>`,
    footer: `<button class="btn btn-secondary btn-sm" id="btn-switch-profile">${t('switchProfile')}</button>
             <button class="btn btn-danger btn-sm" id="btn-logout">${t('logout')}</button>
             <button class="btn btn-secondary btn-sm" id="btn-device-reset">${t('deviceReset')}</button>
             <button class="btn btn-ghost btn-sm" id="btn-account-close">${t('close')}</button>`
  });
  Auth.getCurrentUser().then(u => {
    const uid = document.getElementById('account-uid');
    const name = document.getElementById('account-name');
    if (uid && u) uid.textContent = u.id;
    if (name && u) name.textContent = u.user_metadata?.name || 'Nutzer';
  });
  modal.el.querySelector('#btn-account-close')?.addEventListener('click', () => modal.close());
  modal.el.querySelector('#btn-switch-profile')?.addEventListener('click', async () => {
    modal.close();
    Storage.saveNow(State.get());
    try { await Sync.pushProfileState(State.get(), State.getUserId()); } catch {}
    await Auth.signOut();
    location.reload();
  });
  modal.el.querySelector('#btn-logout')?.addEventListener('click', async () => {
    modal.close();
    try {
      await Sync.pushProfileState(State.get(), State.getUserId());
      await Auth.signOut();
    } catch (e) {
      console.warn('[Logout]', e);
    }
    Storage.saveNow(State.get());
    location.reload();
  });
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

function _esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

boot();
