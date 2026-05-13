import { renderIcons } from './util.js';

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
    window.location.hash = route;
  },

  current() { return _current; },

  _handle() {
    const hash = window.location.hash.slice(1) || 'dashboard';
    const [route] = hash.split('?');
    const view = document.getElementById('view-root');
    if (!view) return;
    const name = Object.keys(_routes).find(r => r === route) || 'dashboard';
    if (name === _current) {
      renderIcons(view);
      return;
    }
    _current = name;
    const renderFn = _routes[name];
    if (renderFn) {
      view.innerHTML = '';
      try {
        renderFn(view);
        renderIcons(view);
      } catch (err) {
        console.error('[Router] render failed:', name, err);
        view.innerHTML = `<div class="view" style="padding:24px;max-width:560px">
          <div class="view-title" style="color:var(--danger)">Ansicht konnte nicht geladen werden</div>
          <p style="color:var(--text-secondary);font-size:14px;margin-top:12px;line-height:1.5">
            Route „${name}“ ist fehlgeschlagen: <code style="font-size:12px;word-break:break-all">${String(err?.message || err)}</code>
          </p>
          <p style="color:var(--text-tertiary);font-size:13px;margin-top:16px">
            Bitte die Browser-Konsole öffnen (Safari: Entwickler → Konsole anzeigen) und die Seite mit <strong>⌘R</strong> neu laden.
          </p>
        </div>`;
      }
    }
    _listeners.forEach(fn => fn(name));
  },

  onChange(fn) {
    _listeners.add(fn);
    return () => _listeners.delete(fn);
  }
};
