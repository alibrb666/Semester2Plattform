import { SessionTracker } from './sessionTracker.js';
import { State } from '../state.js';
import { formatDuration } from '../util.js';

let _el = null;
let _ticker = null;

function getElapsed() {
  const s = SessionTracker.getSession();
  if (!s?.active) return 0;
  const now = Date.now();
  let ms = now - s.startedAt - (s.totalPausedMs || 0);
  if (s.paused && s.pausedAt) ms -= (now - s.pausedAt);
  return Math.max(0, Math.floor(ms / 1000));
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
      <div class="focus-subject">${subject?.name || 'Keine aktive Session'}</div>
      <div class="focus-timer num-display">${formatDuration(getElapsed(),'timer')}</div>
      <input class="focus-note" type="text" placeholder="Woran arbeitest du gerade?"
        value="${session?.note || ''}" aria-label="Aktuelle Aufgabe" />
      <div class="focus-exit">
        Drücke <kbd>Esc</kbd> oder <button class="btn btn-ghost btn-sm">Beenden</button>
      </div>
    `;

    el.addEventListener('click', e => { if (e.target === el) this.close(); });
    el.querySelector('.focus-exit button')?.addEventListener('click', () => this.close());
    el.addEventListener('keydown', e => { if (e.key === 'Escape') this.close(); });

    const noteInput = el.querySelector('.focus-note');
    noteInput.addEventListener('input', () => {
      const s = SessionTracker.getSession();
      if (s) {
        SessionTracker._session = { ...SessionTracker._session, note: noteInput.value };
      }
    });

    document.body.appendChild(el);
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
