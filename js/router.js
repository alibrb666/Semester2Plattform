import { renderIcons } from './util.js';

const _routes = {};
let _current = null;
const _listeners = new Set();

export const Router = {
  register(name, renderFn) {
    _routes[name] = renderFn;
  },

  init() {
    window.addEventListener('hashchange', () => this._handle());
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
      renderFn(view);
      renderIcons(view);
    }
    _listeners.forEach(fn => fn(name));
  },

  onChange(fn) {
    _listeners.add(fn);
    return () => _listeners.delete(fn);
  }
};
