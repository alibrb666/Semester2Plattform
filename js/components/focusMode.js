import { SessionTracker } from './sessionTracker.js';
import { State } from '../state.js';
import { formatDuration } from '../util.js';
import { t, translateDom } from '../i18n.js';

let _el = null;
let _ticker = null;

function getElapsed() {
  return SessionTracker.getTotalElapsedSeconds();
}

export const FocusMode = {
  init() {
    document.addEventListener('app:focus', () => this.open());
  },

  open() {
    if (_el) { this.close(); return; }
    const session = SessionTracker.getSession();
    const subject = session ? State.getSubject(session.subjectId) : null;
    const colorMap = { klr:'var(--subject-klr)', math:'var(--subject-math)', prog:'var(--subject-prog)', kbs:'var(--subject-kbs)' };
    const color = subject ? (colorMap[subject.id] || 'var(--accent)') : 'var(--accent)';

    const el = document.createElement('div');
    el.className = 'focus-mode';
    el.style.setProperty('--focus-color', color);
    el.innerHTML = `
      <div class="focus-subject">${subject?.name || t('Keine aktive Session')}</div>
      <div class="focus-timer num-display">${formatDuration(getElapsed(),'timer')}</div>
      <input class="focus-note" type="text" placeholder="${t('Woran arbeitest du gerade?')}"
        value="${session?.note || ''}" aria-label="${t('Aktuelle Aufgabe')}" />
      <div class="focus-exit">
        ${t('Drücke')} <kbd>Esc</kbd> ${t('oder')} <button class="btn btn-ghost btn-sm">${t('Beenden')}</button>
      </div>
    `;

    el.addEventListener('click', e => { if (e.target === el) this.close(); });
    el.querySelector('.focus-exit button')?.addEventListener('click', () => this.close());
    el.addEventListener('keydown', e => { if (e.key === 'Escape') this.close(); });

    const noteInput = el.querySelector('.focus-note');
    noteInput.addEventListener('input', () => {
      SessionTracker.updateSessionNote(noteInput.value);
    });

    document.body.appendChild(el);
    translateDom(el);
    _el = el;
    el.focus();

    _ticker = setInterval(() => {
      const t = el.querySelector('.focus-timer');
      if (t) t.textContent = formatDuration(getElapsed(), 'timer');
    }, 1000);
  },

  close() {
    if (!_el) return;
    clearInterval(_ticker);
    _el.classList.add('leaving');
    setTimeout(() => { _el?.remove(); _el = null; }, 260);
  },

  isOpen() { return !!_el; }
};
