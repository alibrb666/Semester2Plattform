import { State } from '../state.js';
import { Router } from '../router.js';
import { uuid, renderIcons } from '../util.js';
import { Toast } from './toast.js';
import { translateDom } from '../i18n.js';

let _el = null;

function close() {
  if (!_el) return;
  _el.classList.add('leaving');
  setTimeout(() => { _el?.remove(); _el = null; }, 210);
}

function buildFields(type, subjects) {
  const subOpts = subjects.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
  if (type === 'error') return `
    <div class="field">
      <label for="qc-subject">Fach</label>
      <select class="select" id="qc-subject">${subOpts}</select>
    </div>
    <div class="field">
      <label for="qc-topic">Thema</label>
      <input class="input" id="qc-topic" type="text" placeholder="z.B. Vollständige Induktion" autocomplete="off" />
    </div>
    <div class="field">
      <label for="qc-category">Kategorie</label>
      <select class="select" id="qc-category">
        <option value="concept">Konzept</option>
        <option value="fluke">Flüchtigkeit</option>
        <option value="calculation">Rechnen</option>
        <option value="understanding">Verständnis</option>
        <option value="time">Zeitproblem</option>
      </select>
    </div>
    <div class="field">
      <label for="qc-desc">Beschreibung</label>
      <textarea class="textarea" id="qc-desc" rows="2" placeholder="Was ist passiert?"></textarea>
    </div>`;
  if (type === 'note') return `
    <div class="field">
      <label for="qc-subject">Fach</label>
      <select class="select" id="qc-subject">${subOpts}</select>
    </div>
    <div class="field">
      <label for="qc-note-text">Notiz</label>
      <textarea class="textarea" id="qc-note-text" rows="3" placeholder="Schnelle Notiz…"></textarea>
    </div>`;
  if (type === 'todo') return `
    <div class="field">
      <label for="qc-todo-title">Aufgabe *</label>
      <input class="input" id="qc-todo-title" type="text"
        placeholder="Was muss erledigt werden?" autocomplete="off" />
    </div>
    <div class="field">
      <label for="qc-subject">Fach (optional)</label>
      <select class="select" id="qc-subject"><option value="">Keins</option>${subOpts}</select>
    </div>
    <div class="field">
      <label for="qc-todo-due">Fällig am (optional)</label>
      <input class="input" id="qc-todo-due" type="date" />
    </div>`;
  if (type === 'mock') return `
    <div class="field">
      <label for="qc-subject">Klausur</label>
      <select class="select" id="qc-subject">${subOpts}</select>
    </div>
    <div class="field-row">
      <div class="field">
        <label for="qc-score">Punkte</label>
        <input class="input" id="qc-score" type="number" min="0" max="200" placeholder="87" />
      </div>
      <div class="field">
        <label for="qc-max">von max.</label>
        <input class="input" id="qc-max" type="number" min="1" max="200" value="100" />
      </div>
    </div>
    <div class="field">
      <label for="qc-mock-note">Notiz</label>
      <input class="input" id="qc-mock-note" type="text" placeholder="Optional" />
    </div>`;
  return '';
}

export const QuickCapture = {
  init() {
    document.addEventListener('app:quick-capture', () => this.open());
  },

  open(defaultType = 'error') {
    if (_el) { close(); return; }
    const subjects = State.getSubjects();
    let currentType = defaultType;

    const backdrop = document.createElement('div');
    backdrop.className = 'qc-backdrop';
    backdrop.innerHTML = `
      <div class="qc-card">
        <div class="qc-type-tabs">
          <button class="qc-tab ${currentType==='error'?'active':''}" data-type="error">Fehler</button>
          <button class="qc-tab ${currentType==='note'?'active':''}" data-type="note">Notiz</button>
          <button class="qc-tab ${currentType==='mock'?'active':''}" data-type="mock">Mock</button>
          <button class="qc-tab ${currentType==='todo'?'active':''}" data-type="todo">Todo</button>
        </div>
        <div id="qc-fields">${buildFields(currentType, subjects)}</div>
        <div class="qc-actions">
          <button class="btn btn-ghost btn-sm" id="qc-cancel">Abbrechen</button>
          <button class="btn btn-primary btn-sm" id="qc-save">Speichern</button>
        </div>
      </div>`;

    backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });
    backdrop.querySelectorAll('.qc-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        currentType = tab.dataset.type;
        backdrop.querySelectorAll('.qc-tab').forEach(t => t.classList.toggle('active', t === tab));
        backdrop.querySelector('#qc-fields').innerHTML = buildFields(currentType, subjects);
        translateDom(backdrop.querySelector('#qc-fields'));
        backdrop.querySelector('#qc-fields input, #qc-fields textarea')?.focus();
      });
    });

    backdrop.querySelector('#qc-cancel')?.addEventListener('click', close);
    backdrop.querySelector('#qc-save')?.addEventListener('click', () => this._save(backdrop, currentType));
    backdrop.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });

    document.body.appendChild(backdrop);
    translateDom(backdrop);
    renderIcons(backdrop);
    backdrop.querySelector('input, textarea')?.focus();
    _el = backdrop;
  },

  _save(backdrop, type) {
    const subject = backdrop.querySelector('#qc-subject')?.value;
    if (type === 'error') {
      const topic = backdrop.querySelector('#qc-topic')?.value.trim();
      const desc  = backdrop.querySelector('#qc-desc')?.value.trim();
      const cat   = backdrop.querySelector('#qc-category')?.value;
      if (!topic) { backdrop.querySelector('#qc-topic')?.focus(); return; }
      State.addError({ id: uuid(), subjectId: subject, createdAt: new Date().toISOString(), topic, category: cat, description: desc, resolution: '', reviewedAt: [], repeated: 0 });
      Toast.success('Fehlereintrag gespeichert', topic);
    } else if (type === 'note') {
      const note = backdrop.querySelector('#qc-note-text')?.value.trim();
      if (!note) return;
      State.addError({ id: uuid(), subjectId: subject, createdAt: new Date().toISOString(), topic: note.slice(0,60), category: 'fluke', description: note, resolution: '', reviewedAt: [], repeated: 0 });
      Toast.success('Notiz gespeichert');
    } else if (type === 'todo') {
      const title = backdrop.querySelector('#qc-todo-title')?.value.trim();
      if (!title) { backdrop.querySelector('#qc-todo-title')?.focus(); return; }
      const subjectId = backdrop.querySelector('#qc-subject')?.value || null;
      const dueDate   = backdrop.querySelector('#qc-todo-due')?.value || null;
      State.addTodo({ id: uuid(), title, subjectId: subjectId || null, priority: 'medium',
        dueDate, note: '', done: false, doneAt: null, createdAt: new Date().toISOString() });
      Toast.success('Todo gespeichert', title);
    } else if (type === 'mock') {
      const score = parseInt(backdrop.querySelector('#qc-score')?.value);
      const max   = parseInt(backdrop.querySelector('#qc-max')?.value) || 100;
      const note  = backdrop.querySelector('#qc-mock-note')?.value.trim();
      if (isNaN(score)) { backdrop.querySelector('#qc-score')?.focus(); return; }
      State.addMock({ id: uuid(), subjectId: subject, date: new Date().toISOString(), score, maxScore: max, note: note || '' });
      Toast.success('Mock gespeichert', `${score}/${max} (${Math.round(score/max*100)}%)`);
    }
    close();
    document.dispatchEvent(new CustomEvent('data:changed'));
  }
};
