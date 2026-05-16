import { renderIcons } from '../util.js';
import { translateDom } from '../i18n.js';

const root = () => document.getElementById('modal-root');
let _stack = [];

function close(id) {
  const entry = _stack.find(e => e.id === id);
  if (!entry) return;
  const { backdrop, onClose } = entry;
  backdrop.classList.add('leaving');
  backdrop.querySelector('.modal')?.classList.add('leaving');
  setTimeout(() => {
    backdrop.remove();
    _stack = _stack.filter(e => e.id !== id);
    if (onClose) onClose();
  }, 260);
}

function closeTop() {
  if (_stack.length) close(_stack[_stack.length - 1].id);
}

export const Modal = {
  open({ title, body, footer, size = '', onClose, id = Math.random().toString(36).slice(2) }) {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');
    backdrop.setAttribute('aria-labelledby', `modal-title-${id}`);
    backdrop.innerHTML = `
      <div class="modal ${size ? 'modal-' + size : ''}" role="document">
        <div class="modal-header">
          <h2 class="modal-title" id="modal-title-${id}">${title || ''}</h2>
          <button class="icon-btn modal-close-btn" aria-label="Schließen (Esc)">
            <i data-lucide="x"></i>
          </button>
        </div>
        <div class="modal-body">${body || ''}</div>
        ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
      </div>
    `;

    backdrop.addEventListener('click', e => { if (e.target === backdrop) close(id); });
    backdrop.querySelector('.modal-close-btn').addEventListener('click', () => close(id));

    root().appendChild(backdrop);
    translateDom(backdrop);
    renderIcons(backdrop);
    _stack.push({ id, backdrop, onClose });

    const firstFocusable = backdrop.querySelector('button, input, select, textarea, [tabindex]');
    firstFocusable?.focus();

    return {
      el: backdrop,
      close: () => close(id),
      update(newBody) {
        backdrop.querySelector('.modal-body').innerHTML = newBody;
        translateDom(backdrop);
        renderIcons(backdrop);
      }
    };
  },

  closeAll() { [..._stack].forEach(e => close(e.id)); },
  closeTop,
  hasOpen() { return _stack.length > 0; }
};
