const _handlers = new Map();
let _active = true;

function isInput(el) {
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
}

export const Keyboard = {
  init() {
    document.addEventListener('keydown', e => {
      if (!_active) return;
      const key = e.key;
      const ctrl = e.ctrlKey || e.metaKey;
      const inInput = isInput(e.target);

      if (ctrl && key === 'k') { e.preventDefault(); _fire('palette'); return; }
      if (key === 'Escape') { _fire('escape'); return; }
      if (key === '?') { e.preventDefault(); _fire('shortcuts'); return; }

      if (inInput) return;

      if (key === 's' || key === 'S') { e.preventDefault(); _fire('session-toggle'); return; }
      if (key === 'f' || key === 'F') { e.preventDefault(); _fire('focus'); return; }
      if (key === 'n' || key === 'N') { e.preventDefault(); _fire('quick-capture'); return; }
      if (key === 't' || key === 'T') { e.preventDefault(); _fire('theme'); return; }
      if (key >= '1' && key <= '7') { e.preventDefault(); _fire('nav-' + key); return; }
    });
  },

  on(event, fn) {
    if (!_handlers.has(event)) _handlers.set(event, new Set());
    _handlers.get(event).add(fn);
    return () => _handlers.get(event)?.delete(fn);
  },

  pause() { _active = false; },
  resume() { _active = true; }
};

function _fire(event) {
  _handlers.get(event)?.forEach(fn => fn());
}
