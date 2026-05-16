import { State } from '../state.js';
import { Storage } from '../storage.js';
import { uuid, renderIcons } from '../util.js';
import { Modal } from '../components/modal.js';
import { Toast } from '../components/toast.js';
import { translateDom } from '../i18n.js';

let _filter = 'all';

export function renderTodos(container) {
  const subjects = State.getSubjects();
  const todos    = State.getTodos();

  container.innerHTML = `
    <div class="view">
      <div class="view-header">
        <div><div class="view-title">Todos</div></div>
        <button class="btn btn-primary btn-sm" id="btn-new-todo">
          <i data-lucide="plus"></i> Neue Aufgabe
        </button>
      </div>
      <div class="todos-layout">
        <div class="todos-filter-pane">
          ${_buildFilterPane(todos, subjects)}
        </div>
        <div class="todos-list-pane" id="todos-list">
          ${_buildTodoList(todos, subjects, _filter)}
        </div>
      </div>
    </div>`;

  renderIcons(container);
  translateDom(container);
  _bindTodos(container, subjects);
}

/* ── Filter sidebar ─────────────────────────────────────── */
function _buildFilterPane(todos, subjects) {
  const todayStr = _today();
  const weekEnd  = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const open     = todos.filter(t => !t.done);

  const base = [
    { key: 'all',     label: 'Alle',        count: open.length },
    { key: 'today',   label: 'Heute',        count: open.filter(t => t.dueDate === todayStr).length },
    { key: 'week',    label: 'Diese Woche',  count: open.filter(t => t.dueDate && t.dueDate <= weekEnd).length },
    { key: 'overdue', label: 'Überfällig',   count: open.filter(t => t.dueDate && t.dueDate < todayStr).length },
  ];

  const bySubj = subjects.map(s => ({
    key: s.id,
    label: s.name.split(' ')[0],
    count: open.filter(t => t.subjectId === s.id).length
  }));

  return `
    <div class="todos-filter-section">
      ${base.map(f => `
        <div class="todos-filter-item${_filter === f.key ? ' active' : ''}" data-filter="${f.key}">
          <span>${f.label}</span>
          <span class="todos-filter-count">${f.count}</span>
        </div>`).join('')}
    </div>
    <div class="todos-filter-divider"></div>
    <div class="todos-filter-section">
      <div class="todos-filter-section-label">Fach</div>
      ${bySubj.map(f => `
        <div class="todos-filter-item${_filter === f.key ? ' active' : ''}" data-filter="${f.key}">
          <span>${f.label}</span>
          <span class="todos-filter-count">${f.count}</span>
        </div>`).join('')}
    </div>
    <div class="todos-filter-divider"></div>
    <div class="todos-filter-section">
      <div class="todos-filter-item${_filter === 'done' ? ' active' : ''}" data-filter="done">
        <span>✓ Erledigt</span>
        <span class="todos-filter-count">${todos.filter(t => t.done).length}</span>
      </div>
    </div>`;
}

/* ── Todo list ──────────────────────────────────────────── */
function _buildTodoList(todos, subjects, filter) {
  const todayStr = _today();
  const weekEnd  = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  let items;
  if (filter === 'done') {
    items = todos.filter(t => t.done)
      .sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || ''))
      .slice(0, 20);
    if (!items.length) return _empty('Noch nichts erledigt.');
    return items.map(t => _buildTodoItem(t, subjects)).join('');
  }

  items = todos.filter(t => {
    if (t.done) return false;
    if (filter === 'all')     return true;
    if (filter === 'today')   return t.dueDate === todayStr;
    if (filter === 'week')    return t.dueDate && t.dueDate <= weekEnd;
    if (filter === 'overdue') return t.dueDate && t.dueDate < todayStr;
    return t.subjectId === filter;
  });

  const po = { high: 0, medium: 1, low: 2 };
  items.sort((a, b) => {
    const ao = a.dueDate && a.dueDate < todayStr;
    const bo = b.dueDate && b.dueDate < todayStr;
    if (ao !== bo) return ao ? -1 : 1;
    const pd = (po[a.priority] ?? 1) - (po[b.priority] ?? 1);
    if (pd) return pd;
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    return a.dueDate ? -1 : b.dueDate ? 1 : 0;
  });

  if (!items.length) return _empty('Keine offenen Aufgaben ✓');

  const overdue  = items.filter(t => t.dueDate && t.dueDate < todayStr);
  const todayDue = items.filter(t => t.dueDate === todayStr);
  const rest     = items.filter(t => !t.dueDate || t.dueDate > todayStr);

  let html = '';
  if (overdue.length)  html += `<div class="todo-group-label" style="color:var(--danger)">Überfällig</div>${overdue.map(t => _buildTodoItem(t, subjects)).join('')}`;
  if (todayDue.length) html += `<div class="todo-group-label" style="color:var(--warning)">Heute fällig</div>${todayDue.map(t => _buildTodoItem(t, subjects)).join('')}`;
  if (rest.length) {
    if (overdue.length || todayDue.length) html += `<div class="todo-group-label">Offen</div>`;
    html += rest.map(t => _buildTodoItem(t, subjects)).join('');
  }
  return html;
}

function _buildTodoItem(todo, subjects) {
  const todayStr    = _today();
  const tomorrowStr = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const subj = subjects.find(s => s.id === todo.subjectId);

  let dueClass = 'soon', dueLabel = '';
  if (todo.dueDate) {
    if (todo.dueDate < todayStr)         { dueClass = 'overdue'; dueLabel = `Überfällig · ${_fmtDate(todo.dueDate)}`; }
    else if (todo.dueDate === todayStr)  { dueClass = 'today';   dueLabel = 'Heute'; }
    else if (todo.dueDate === tomorrowStr) { dueClass = 'soon';  dueLabel = 'Morgen'; }
    else                                 { dueClass = 'soon';    dueLabel = _fmtDate(todo.dueDate); }
  }

  return `
    <div class="todo-item${todo.done ? ' done' : ''}" data-todo-id="${todo.id}">
      <div class="todo-checkbox${todo.done ? ' checked' : ''}" data-todo-check="${todo.id}"
        role="checkbox" aria-checked="${todo.done}" tabindex="0"></div>
      <div class="todo-body">
        <div class="todo-title">${_esc(todo.title)}</div>
        <div class="todo-meta">
          <div class="todo-priority-dot ${todo.priority || 'medium'}"></div>
          ${dueLabel ? `<span class="todo-due ${dueClass}">${dueLabel}</span>` : ''}
          ${subj ? `<span class="badge" style="background:var(--subject-${subj.id})22;color:var(--subject-${subj.id});font-size:10px;padding:2px 6px;border-radius:4px">${subj.name.split(' ')[0]}</span>` : ''}
        </div>
      </div>
      <button class="icon-btn" data-todo-menu="${todo.id}" aria-label="Optionen"
        style="opacity:.5;flex-shrink:0;width:28px;height:28px">
        <i data-lucide="more-horizontal"></i>
      </button>
    </div>`;
}

function _empty(msg) {
  return `<div style="text-align:center;color:var(--text-tertiary);font-size:13px;padding:40px 16px">${msg}</div>`;
}

/* ── Bindings ───────────────────────────────────────────── */
function _bindTodos(container, subjects) {
  container.querySelector('#btn-new-todo')?.addEventListener('click', () =>
    _openTodoModal(null, subjects, container)
  );

  container.querySelectorAll('.todos-filter-item[data-filter]').forEach(el => {
    el.addEventListener('click', () => { _filter = el.dataset.filter; renderTodos(container); });
  });

  container.querySelectorAll('[data-todo-check]').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      const id = el.dataset.todoCheck;
      const todo = State.getTodos().find(t => t.id === id);
      if (!todo) return;
      const nowDone = !todo.done;
      State.updateTodo(id, { done: nowDone, doneAt: nowDone ? new Date().toISOString() : null });
      Storage.saveNow(State.get());
      if (nowDone) {
        Toast.show({ title: 'Erledigt ✓', msg: todo.title, type: 'success', duration: 5000,
          action: { label: 'Rückgängig', handler: () => {
            State.updateTodo(id, { done: false, doneAt: null });
            Storage.saveNow(State.get());
            renderTodos(container);
          }}
        });
        setTimeout(() => renderTodos(container), 350);
      } else {
        renderTodos(container);
      }
    });
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); } });
  });

  container.querySelectorAll('[data-todo-menu]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const todo = State.getTodos().find(t => t.id === btn.dataset.todoMenu);
      if (todo) _openContextMenu(btn, todo, subjects, container);
    });
  });

  container.querySelectorAll('.todo-item').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.closest('[data-todo-check]') || e.target.closest('[data-todo-menu]')) return;
      const todo = State.getTodos().find(t => t.id === el.dataset.todoId);
      if (todo) _openTodoModal(todo, subjects, container);
    });
  });
}

/* ── Context menu ───────────────────────────────────────── */
function _openContextMenu(anchor, todo, subjects, container) {
  document.querySelector('.todo-context-menu')?.remove();
  const menu = document.createElement('div');
  menu.className = 'todo-context-menu';
  menu.innerHTML = `
    <button class="todo-menu-item" data-a="edit"><i data-lucide="pencil"></i> Bearbeiten</button>
    <button class="todo-menu-item todo-menu-danger" data-a="del"><i data-lucide="trash-2"></i> Löschen</button>`;
  document.body.appendChild(menu);
  renderIcons(menu);

  const rect = anchor.getBoundingClientRect();
  menu.style.cssText = `position:fixed;top:${rect.bottom + 4}px;right:${window.innerWidth - rect.right}px;z-index:9999`;

  const close = () => menu.remove();
  menu.querySelector('[data-a="edit"]').addEventListener('click', () => { close(); _openTodoModal(todo, subjects, container); });
  menu.querySelector('[data-a="del"]').addEventListener('click', () => {
    close();
    State.removeTodo(todo.id);
    Storage.saveNow(State.get());
    Toast.show({ title: 'Aufgabe gelöscht', msg: todo.title, type: 'info', duration: 5000,
      action: { label: 'Rückgängig', handler: () => {
        State.addTodo(todo);
        Storage.saveNow(State.get());
        renderTodos(container);
      }}
    });
    renderTodos(container);
  });
  setTimeout(() => document.addEventListener('click', close, { once: true }), 10);
}

/* ── Modal ──────────────────────────────────────────────── */
function _openTodoModal(todo, subjects, container) {
  const isNew = !todo?.id;
  const body = `
    <div class="field">
      <label for="td-title">Titel *</label>
      <input class="input" id="td-title" type="text" value="${_esc(todo?.title || '')}"
        placeholder="Aufgabe beschreiben…" autocomplete="off" />
    </div>
    <div class="field">
      <label>Fach (optional)</label>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px">
        <button type="button" class="btn btn-sm${!todo?.subjectId ? ' btn-primary' : ' btn-secondary'}" data-sp="">Keins</button>
        ${subjects.map(s => `
          <button type="button" class="btn btn-sm${todo?.subjectId === s.id ? ' btn-primary' : ' btn-secondary'}" data-sp="${s.id}">
            ${s.name.split(' ')[0]}
          </button>`).join('')}
      </div>
      <input type="hidden" id="td-subject" value="${todo?.subjectId || ''}" />
    </div>
    <div class="field-row">
      <div class="field">
        <label>Priorität</label>
        <div style="display:flex;gap:6px;margin-top:4px">
          ${[['high','Hoch'],['medium','Mittel'],['low','Niedrig']].map(([v,l]) =>
            `<button type="button" class="btn btn-sm${(todo?.priority||'medium') === v ? ' btn-primary' : ' btn-secondary'}" data-pp="${v}">${l}</button>`
          ).join('')}
        </div>
        <input type="hidden" id="td-priority" value="${todo?.priority || 'medium'}" />
      </div>
      <div class="field">
        <label for="td-due">Fällig am</label>
        <input class="input" id="td-due" type="date" value="${todo?.dueDate || ''}" />
      </div>
    </div>
    <div class="field">
      <label for="td-note">Notiz</label>
      <textarea class="textarea" id="td-note" rows="2" placeholder="Optional…">${_esc(todo?.note || '')}</textarea>
    </div>`;

  const modal = Modal.open({
    title: isNew ? 'Neue Aufgabe' : 'Aufgabe bearbeiten',
    body,
    footer: `${!isNew ? '<button class="btn btn-danger btn-sm" id="td-del">Löschen</button>' : ''}
      <button class="btn btn-ghost btn-sm" id="td-cancel">Abbrechen</button>
      <button class="btn btn-primary btn-sm" id="td-save">Speichern</button>`
  });
  renderIcons(modal.el);
  modal.el.querySelector('#td-title')?.focus();

  modal.el.querySelectorAll('[data-sp]').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.sp;
      modal.el.querySelector('#td-subject').value = val;
      modal.el.querySelectorAll('[data-sp]').forEach(b =>
        b.className = `btn btn-sm${b.dataset.sp === val ? ' btn-primary' : ' btn-secondary'}`
      );
    });
  });
  modal.el.querySelectorAll('[data-pp]').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.pp;
      modal.el.querySelector('#td-priority').value = val;
      modal.el.querySelectorAll('[data-pp]').forEach(b =>
        b.className = `btn btn-sm${b.dataset.pp === val ? ' btn-primary' : ' btn-secondary'}`
      );
    });
  });

  modal.el.querySelector('#td-cancel')?.addEventListener('click', () => modal.close());
  modal.el.querySelector('#td-del')?.addEventListener('click', () => {
    State.removeTodo(todo.id);
    Storage.saveNow(State.get());
    modal.close();
    Toast.success('Aufgabe gelöscht');
    renderTodos(container);
  });
  modal.el.querySelector('#td-save')?.addEventListener('click', () => {
    const title     = modal.el.querySelector('#td-title')?.value.trim();
    if (!title) { modal.el.querySelector('#td-title')?.focus(); return; }
    const subjectId = modal.el.querySelector('#td-subject')?.value || null;
    const priority  = modal.el.querySelector('#td-priority')?.value || 'medium';
    const dueDate   = modal.el.querySelector('#td-due')?.value || null;
    const note      = modal.el.querySelector('#td-note')?.value.trim() || '';

    if (isNew) {
      State.addTodo({ id: uuid(), title, subjectId: subjectId || null, priority, dueDate, note,
        done: false, doneAt: null, createdAt: new Date().toISOString() });
      Toast.success('Aufgabe gespeichert');
    } else {
      State.updateTodo(todo.id, { title, subjectId: subjectId || null, priority, dueDate, note });
      Toast.success('Aufgabe aktualisiert');
    }
    Storage.saveNow(State.get());
    modal.close();
    renderTodos(container);
  });
}

/* ── Helpers ────────────────────────────────────────────── */
function _today()      { return new Date().toISOString().slice(0, 10); }
function _fmtDate(iso) { return new Date(iso + 'T12:00:00').toLocaleDateString(undefined, { day:'numeric', month:'short' }); }
function _esc(s)       { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

export { _openTodoModal as openTodoModalFromDash };
