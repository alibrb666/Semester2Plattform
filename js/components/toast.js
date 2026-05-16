import { renderIcons } from '../util.js';
import { t } from '../i18n.js';

const ICONS = { success:'check-circle', error:'x-circle', warning:'alert-triangle', info:'info' };
const stack = () => document.getElementById('toast-stack');

export const Toast = {
  show({ title, msg = '', message = '', type = 'info', duration = 3000, action = null }) {
    const detail = message || msg;
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.setAttribute('role', 'alert');
    const actionHtml = action?.label
      ? `<button type="button" class="btn btn-secondary btn-sm toast-action">${action.label}</button>`
      : '';
    el.innerHTML = `
      <i data-lucide="${ICONS[type] || 'info'}"></i>
      <div class="toast-body">
        <div class="toast-title">${title}</div>
        ${detail ? `<div class="toast-msg">${detail}</div>` : ''}
      </div>
      ${actionHtml}
      <button class="icon-btn toast-dismiss" style="width:24px;height:24px" aria-label="${t('close')}">
        <i data-lucide="x"></i>
      </button>
    `;

    let timer;
    const dismiss = () => {
      clearTimeout(timer);
      el.classList.add('leaving');
      setTimeout(() => el.remove(), 260);
    };
    el.querySelector('.toast-dismiss')?.addEventListener('click', dismiss);
    const actBtn = el.querySelector('.toast-action');
    if (actBtn && action?.handler) {
      actBtn.addEventListener('click', () => {
        try { action.handler(); } catch (_) {}
        dismiss();
      });
    }
    stack().appendChild(el);
    renderIcons(el);

    timer = setTimeout(dismiss, duration);
    el.addEventListener('mouseenter', () => clearTimeout(timer));
    el.addEventListener('mouseleave', () => { timer = setTimeout(dismiss, 1000); });
  },

  success(title, msg) { this.show({ title, msg, type: 'success' }); },
  error(title, msg)   { this.show({ title, msg, type: 'error', duration: 5000 }); },
  warning(title, msg) { this.show({ title, msg, type: 'warning' }); },
  info(title, msg)    { this.show({ title, msg, type: 'info' }); }
};
