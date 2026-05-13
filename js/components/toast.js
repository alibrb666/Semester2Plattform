import { renderIcons } from '../util.js';

const ICONS = { success:'check-circle', error:'x-circle', warning:'alert-triangle', info:'info' };
const stack = () => document.getElementById('toast-stack');

export const Toast = {
  show({ title, msg = '', type = 'info', duration = 3000 }) {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.setAttribute('role', 'alert');
    el.innerHTML = `
      <i data-lucide="${ICONS[type] || 'info'}"></i>
      <div class="toast-body">
        <div class="toast-title">${title}</div>
        ${msg ? `<div class="toast-msg">${msg}</div>` : ''}
      </div>
      <button class="icon-btn" style="width:24px;height:24px" aria-label="Schließen">
        <i data-lucide="x"></i>
      </button>
    `;

    const dismiss = () => {
      el.classList.add('leaving');
      setTimeout(() => el.remove(), 260);
    };
    el.querySelector('button').addEventListener('click', dismiss);
    stack().appendChild(el);
    renderIcons(el);

    const timer = setTimeout(dismiss, duration);
    el.addEventListener('mouseenter', () => clearTimeout(timer));
    el.addEventListener('mouseleave', () => setTimeout(dismiss, 1000));
  },

  success(title, msg) { this.show({ title, msg, type: 'success' }); },
  error(title, msg)   { this.show({ title, msg, type: 'error', duration: 5000 }); },
  warning(title, msg) { this.show({ title, msg, type: 'warning' }); },
  info(title, msg)    { this.show({ title, msg, type: 'info' }); }
};
