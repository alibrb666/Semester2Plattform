import { renderIcons } from './util.js';
import { t, translateDom } from './i18n.js';

const _routes = {};
let _current = null;
const _listeners = new Set();
let _hashListenerBound = false;

export const Router = {
  register(name, renderFn) {
    _routes[name] = renderFn;
  },

  init() {
    if (!_hashListenerBound) {
      window.addEventListener('hashchange', () => this._handle());
      _hashListenerBound = true;
    }
    this._handle();
  },

  navigate(route) {
    const nextRoute = route || 'dashboard';
    const currentHash = window.location.hash.replace('#', '');
    if (currentHash === nextRoute) {
      this._handle(true);
      return;
    }
    window.location.hash = nextRoute;
  },

  current() { return _current; },

  _handle(forceRender = false) {
    const hash = window.location.hash.slice(1) || 'dashboard';
    const [route] = hash.split('?');
    const view = document.getElementById('view-root');
    if (!view) return;
    const name = Object.keys(_routes).find(r => r === route) || 'dashboard';
    if (name === _current && !forceRender) {
      translateDom(view);
      renderIcons(view);
      return;
    }
    _current = name;
    const renderFn = _routes[name];
    if (renderFn) {
      view.innerHTML = '';
      try {
        renderFn(view);
        translateDom(view);
        renderIcons(view);
      } catch (err) {
        console.error('[Router] render failed:', name, err);
        view.innerHTML = `<div class="view" style="padding:24px;max-width:560px">
          <div class="view-title" style="color:var(--danger)">${t('Ansicht konnte nicht geladen werden')}</div>
          <p style="color:var(--text-secondary);font-size:14px;margin-top:12px;line-height:1.5">
            ${t('Route')} "${name}" ${t('ist fehlgeschlagen')}: <code style="font-size:12px;word-break:break-all">${String(err?.message || err)}</code>
          </p>
          <p style="color:var(--text-tertiary);font-size:13px;margin-top:16px">
            ${t('Bitte die Browser-Konsole öffnen (Safari: Entwickler → Konsole anzeigen) und die Seite mit')} <strong>⌘R</strong> ${t('neu laden.')}
          </p>
        </div>`;
      }
    } else {
      console.error('[Router] missing render for route:', name, 'registered:', Object.keys(_routes));
      view.innerHTML = `<div class="view" style="padding:24px;max-width:560px">
        <div class="view-title" style="color:var(--danger)">${t('Interner Router-Fehler')}</div>
        <p style="color:var(--text-secondary);font-size:14px;margin-top:12px">${t('Keine Render-Funktion für')} "${name}".</p>
      </div>`;
    }
    _listeners.forEach(fn => fn(name));
  },

  onChange(fn) {
    _listeners.add(fn);
    return () => _listeners.delete(fn);
  }
};
