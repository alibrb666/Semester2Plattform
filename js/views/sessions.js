import { State } from '../state.js';
import { formatDuration, formatDateShort, isSameDay, renderIcons, sumDuration } from '../util.js';
import { Modal } from '../components/modal.js';
import { Toast } from '../components/toast.js';

/* Trash for undo-delete (last 10 items) */
const _trash = [];
function pushTrash(session) {
  _trash.push(session);
  if (_trash.length > 10) _trash.shift();
}
function popTrash(id) {
  const idx = _trash.findIndex(s => s.id === id);
  if (idx < 0) return null;
  return _trash.splice(idx, 1)[0];
}

export function renderSessions(container) {
  const sessions  = [...State.getSessions()].sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
  const subjects  = State.getSubjects();
  let filterSubj  = 'all';
  let filterRange = 'all';

  function getFiltered() {
    return sessions.filter(s => {
      if (filterSubj !== 'all' && s.subjectId !== filterSubj) return false;
      if (filterRange === 'week') {
        const d   = new Date(s.startedAt);
        const now = new Date();
        const mon = new Date(now);
        mon.setDate(now.getDate() - ((now.getDay() + 6) % 7));
        mon.setHours(0, 0, 0, 0);
        if (d < mon) return false;
      }
      if (filterRange === 'month') {
        if (new Date(s.startedAt) < new Date(Date.now() - 30 * 86400000)) return false;
      }
      return true;
    });
  }

  function grouped(list) {
    const groups = {};
    list.forEach(s => {
      const d   = new Date(s.startedAt);
      const key = isSameDay(d, new Date()) ? 'Heute'
        : isSameDay(d, new Date(Date.now() - 86400000)) ? 'Gestern'
        : d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      (groups[key] = groups[key] || []).push(s);
    });
    return groups;
  }

  function sessionSecondsTotal(s) {
    if (s.tasks?.length) {
      const sumT = s.tasks.reduce((acc, t) => acc + (t.durationSeconds || 0), 0);
      if (sumT > 0) return sumT;
    }
    return s.durationSeconds || 0;
  }

  function taskSummary(s) {
    const n = s.tasks?.length || 0;
    const total = sessionSecondsTotal(s);
    if (!n) return '';
    if (n === 1 && s.tasks[0]?.title === 'Allgemein') return formatDuration(total);
    return `${n} Task${n === 1 ? '' : 's'} · ${formatDuration(total)}`;
  }

  function renderList() {
    const list  = getFiltered();
    const grps  = grouped(list);
    const total = sumDuration(list);

    if (!list.length) {
      listEl.innerHTML = `<div class="empty-state">
        <i data-lucide="timer" style="width:48px;height:48px"></i>
        <div class="empty-title">Keine Sessions gefunden</div>
        <div class="empty-sub">Ändere die Filter oder starte deine erste Lernsession.</div>
      </div>`;
      renderIcons(listEl);
      summaryEl.textContent = '';
      return;
    }

    let html = '';
    Object.entries(grps).forEach(([day, daySess]) => {
      const dayTotal = sumDuration(daySess);
      html += `<div class="sessions-group-header">${day} · ${formatDuration(dayTotal)}</div>`;
      daySess.forEach(s => {
        const sub   = subjects.find(x => x.id === s.subjectId);
        const t     = new Date(s.startedAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
        const tsum  = taskSummary(s);
        const demo  = s.isDemo ? '<span class="badge badge-warning" style="font-size:10px">Demo</span>' : '';
        html += `<div class="session-row" data-session-id="${s.id}" role="button" tabindex="0"
            aria-label="${sub?.name} ${formatDuration(sessionSecondsTotal(s))}">
          <div class="session-row-bar" style="background:var(--subject-${s.subjectId})"></div>
          <div class="session-row-icon" style="background:var(--subject-${s.subjectId}22);color:var(--subject-${s.subjectId})">
            <i data-lucide="timer"></i>
          </div>
          <div class="session-row-info">
            <div class="session-row-subject">${sub?.name || s.subjectId} ${demo}</div>
            <div class="session-row-note">${s.note || 'Keine Notiz'}</div>
          </div>
          <div class="session-row-tags">
            ${(s.tags || []).map(tag => `<span class="badge badge-muted">${tag}</span>`).join('')}
          </div>
          <div class="session-row-rating">${s.rating ? '★'.repeat(s.rating) : ''}</div>
          ${tsum ? `<div class="session-row-tasks">${tsum}</div>` : ''}
          <div class="session-row-dur">${formatDuration(sessionSecondsTotal(s))}</div>
          <div class="session-row-date">${t}</div>
        </div>`;
      });
    });
    listEl.innerHTML = html;
    renderIcons(listEl);
    summaryEl.textContent = `${list.length} Sessions · ${formatDuration(total)} gesamt`;

    listEl.querySelectorAll('.session-row').forEach(row => {
      const open = () => openSessionDetail(row.dataset.sessionId, container, renderList);
      row.addEventListener('click', open);
      row.addEventListener('keydown', e => { if (e.key === 'Enter') open(); });
    });
  }

  container.innerHTML = `
    <div class="view">
      <div class="view-header">
        <div>
          <div class="view-title">Sessions</div>
          <div class="view-sub" id="sessions-summary"></div>
        </div>
      </div>
      <div class="sessions-filters">
        <div class="filter-group">
          <span class="filter-label">Fach:</span>
          <select class="select" id="filter-subj" style="padding:6px 28px 6px 10px">
            <option value="all">Alle</option>
            ${subjects.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
          </select>
        </div>
        <div class="filter-group">
          <span class="filter-label">Zeitraum:</span>
          <select class="select" id="filter-range" style="padding:6px 28px 6px 10px">
            <option value="all">Gesamt</option>
            <option value="week">Diese Woche</option>
            <option value="month">Letzter Monat</option>
          </select>
        </div>
      </div>
      <div class="sessions-table" id="sessions-list"></div>
    </div>`;

  renderIcons(container);
  const listEl    = container.querySelector('#sessions-list');
  const summaryEl = container.querySelector('#sessions-summary');

  container.querySelector('#filter-subj')?.addEventListener('change',  e => { filterSubj  = e.target.value; renderList(); });
  container.querySelector('#filter-range')?.addEventListener('change', e => { filterRange = e.target.value; renderList(); });

  renderList();
}

/* ── Session detail drawer (modal) ──────────────────────────── */
function openSessionDetail(id, container, onRefresh) {
  const s = State.getSessions().find(x => x.id === id);
  if (!s) return;

  const sub = State.getSubjects().find(x => x.id === s.subjectId);
  const d   = new Date(s.startedAt);

  _showDetailModal(s, sub, d, container, onRefresh);
}

function _showDetailModal(s, sub, d, container, onRefresh) {
  let editMode = false;

  function buildBody(session, inEdit) {
    const tasks = session.tasks || [];
    const showTasks = tasks.length > 1 || (tasks[0] && tasks[0].title !== 'Allgemein');
    const subjects = State.getSubjects();

    if (inEdit) {
      return `
        <div class="detail-edit-form">
          <div class="field">
            <label>Fach</label>
            <div class="subject-picker" id="edit-subject-picker">
              ${subjects.map(sub2 => `
                <button class="subject-pick-btn${sub2.id === session.subjectId ? ' selected' : ''}"
                  data-subject="${sub2.id}" type="button"
                  style="--clr:var(--subject-${sub2.id})">${sub2.name}</button>`).join('')}
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div class="field">
              <label for="edit-date">Datum</label>
              <input class="input" id="edit-date" type="date" value="${session.startedAt.slice(0,10)}" />
            </div>
            <div class="field">
              <label for="edit-time">Uhrzeit</label>
              <input class="input" id="edit-time" type="time" value="${new Date(session.startedAt).toTimeString().slice(0,5)}" />
            </div>
          </div>
          <div class="field">
            <label for="edit-note">Notiz</label>
            <textarea class="textarea" id="edit-note" rows="3">${session.note || ''}</textarea>
          </div>
          <div class="field">
            <label>Tags</label>
            <div class="tag-options" id="edit-tags">
              ${['Theorie','Übung','Mock','Wiederholung','Klausurvorbereitung'].map(t =>
                `<button class="tag-opt${(session.tags || []).includes(t) ? ' selected' : ''}"
                  data-tag="${t}" type="button">${t}</button>`).join('')}
            </div>
          </div>
          <div class="field">
            <label>Bewertung</label>
            <div class="star-rating" id="edit-stars">
              ${[1,2,3,4,5].map(n =>
                `<button class="star-btn" data-val="${n}" type="button"
                  style="font-size:20px;background:none;border:none;cursor:pointer;padding:2px;
                  color:${n <= (session.rating || 0) ? 'var(--warning)' : 'var(--text-disabled)'};
                  transition:color 100ms">★</button>`).join('')}
            </div>
          </div>
          ${showTasks ? `<div class="field"><label>Tasks</label><div class="detail-task-list edit">
            ${tasks.map(t => _buildEditableTask(t)).join('')}
          </div></div>` : ''}
        </div>`;
    }

    const durTotal = tasks.reduce((a, t) => a + (t.durationSeconds || 0), 0) || session.durationSeconds || 0;

    return `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
        <div class="card" style="text-align:center">
          <div class="stat-label">Dauer</div>
          <div class="stat-value">${formatDuration(Math.round(durTotal))}</div>
        </div>
        <div class="card" style="text-align:center">
          <div class="stat-label">Bewertung</div>
          <div class="stat-value">${session.rating ? '★'.repeat(session.rating) + '☆'.repeat(5 - session.rating) : '–'}</div>
        </div>
      </div>
      <div class="field">
        <label>Datum & Uhrzeit</label>
        <div style="font-size:14px;color:var(--text-secondary)">
          ${d.toLocaleDateString('de-DE', { weekday:'long', day:'numeric', month:'long', year:'numeric' })} ·
          ${d.toLocaleTimeString('de-DE', { hour:'2-digit', minute:'2-digit' })}
        </div>
      </div>
      ${session.note ? `<div class="field"><label>Notiz</label>
        <div style="font-size:14px;color:var(--text-secondary)">${session.note}</div></div>` : ''}
      ${session.tags?.length ? `<div class="field"><label>Tags</label>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${session.tags.map(t => `<span class="badge badge-muted">${t}</span>`).join('')}
        </div></div>` : ''}
      ${showTasks ? `<div class="field"><label>Tasks</label>
        <div class="detail-task-list">
          ${tasks.map(t => {
            const done = t.status === 'done';
            const segs = t.segments || [];
            const segBlock = segs.length ? `<details class="task-seg-details">
              <summary>Zeitverlauf (${segs.length})</summary>
              <div class="task-seg-list">
                ${segs.map(sg => `<div class="task-seg-row">
                  <span>${formatDateShort(sg.startedAt)} ${new Date(sg.startedAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</span>
                  <span>→ ${new Date(sg.endedAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</span>
                  <span class="num-display">${formatDuration(Math.round(sg.seconds || 0))}</span>
                </div>`).join('')}
              </div>
            </details>` : ''}
            return `<div class="detail-task-wrap">
            <div class="detail-task-row${done ? ' done' : ''}">
              <span class="detail-task-status">${done ? '✓' : '○'}</span>
              <span class="detail-task-title">${t.title}</span>
              <span class="detail-task-dur">${formatDuration(Math.round(t.durationSeconds || 0))}</span>
            </div>
            ${segBlock}
            </div>`;
          }).join('')}
        </div></div>` : ''}`;
  }

  const modal = Modal.open({
    title: sub?.name || 'Session',
    size: 'lg',
    body: buildBody(s, false),
    footer: `
      <button class="btn btn-danger btn-sm" id="detail-delete" type="button">
        <i data-lucide="trash-2"></i> Löschen
      </button>
      <div style="flex:1"></div>
      <button class="btn btn-ghost btn-sm" id="detail-cancel" type="button">Schließen</button>
      <button class="btn btn-secondary btn-sm" id="detail-edit" type="button">
        <i data-lucide="pencil"></i> Bearbeiten
      </button>`
  });

  renderIcons(modal.el);

  let currentSession = s;
  let editRating = s.rating || 0;
  let editTags   = [...(s.tags || [])];
  let editSubjectId = s.subjectId;

  function rebindEdit() {
    /* Subject picker */
    modal.el.querySelectorAll('.subject-pick-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        editSubjectId = btn.dataset.subject;
        modal.el.querySelectorAll('.subject-pick-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
      });
    });

    /* Tags */
    modal.el.querySelectorAll('#edit-tags .tag-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        const tag = btn.dataset.tag;
        if (editTags.includes(tag)) editTags = editTags.filter(t => t !== tag);
        else editTags.push(tag);
        btn.classList.toggle('selected', editTags.includes(tag));
      });
    });

    /* Stars */
    const stars = modal.el.querySelectorAll('#edit-stars .star-btn');
    stars.forEach(star => {
      star.addEventListener('click', () => {
        editRating = parseInt(star.dataset.val);
        stars.forEach((st, i) => { st.style.color = i < editRating ? 'var(--warning)' : 'var(--text-disabled)'; });
      });
    });

    /* Task duration inputs */
    modal.el.querySelectorAll('.task-dur-input').forEach(inp => {
      inp.addEventListener('blur', () => {
        const taskId = inp.dataset.taskId;
        const secs   = parseDurationInput(inp.value);
        if (secs >= 0) {
          currentSession = {
            ...currentSession,
            tasks: currentSession.tasks.map(t => t.id === taskId ? { ...t, durationSeconds: secs } : t)
          };
        }
      });
    });
  }

  /* Toggle edit mode */
  modal.el.querySelector('#detail-edit')?.addEventListener('click', () => {
    editMode    = !editMode;
    editRating  = currentSession.rating || 0;
    editTags    = [...(currentSession.tags || [])];
    editSubjectId = currentSession.subjectId;

    const editBtn = modal.el.querySelector('#detail-edit');
    editBtn.innerHTML = editMode
      ? '<i data-lucide="x"></i> Abbrechen'
      : '<i data-lucide="pencil"></i> Bearbeiten';

    const saveBtn = modal.el.querySelector('#detail-save');
    if (saveBtn) saveBtn.style.display = editMode ? '' : 'none';

    modal.el.querySelector('.modal-body').innerHTML = buildBody(currentSession, editMode);
    renderIcons(modal.el);
    if (editMode) rebindEdit();
  });

  /* Save button (added dynamically) */
  const footer = modal.el.querySelector('.modal-footer');
  const saveBtn = document.createElement('button');
  saveBtn.id        = 'detail-save';
  saveBtn.type      = 'button';
  saveBtn.className = 'btn btn-primary btn-sm';
  saveBtn.style.display = 'none';
  saveBtn.innerHTML = '<i data-lucide="check"></i> Speichern';
  footer.appendChild(saveBtn);
  renderIcons(footer);

  saveBtn.addEventListener('click', () => {
    const note     = modal.el.querySelector('#edit-note')?.value || '';
    const dateVal  = modal.el.querySelector('#edit-date')?.value;
    const timeVal  = modal.el.querySelector('#edit-time')?.value;
    let startedAt  = currentSession.startedAt;
    if (dateVal && timeVal) {
      startedAt = new Date(`${dateVal}T${timeVal}`).toISOString();
    }

    /* Collect task edits */
    const updatedTasks = (currentSession.tasks || []).map(t => {
      const titleInp = modal.el.querySelector(`.task-title-input[data-task-id="${t.id}"]`);
      const title = (titleInp?.value || '').trim() || t.title;
      const h = Math.max(0, parseInt(modal.el.querySelector(`.task-hms[data-part="h"][data-task-id="${t.id}"]`)?.value || '0', 10) || 0);
      const mi = Math.max(0, parseInt(modal.el.querySelector(`.task-hms[data-part="m"][data-task-id="${t.id}"]`)?.value || '0', 10) || 0);
      const se = Math.max(0, parseInt(modal.el.querySelector(`.task-hms[data-part="s"][data-task-id="${t.id}"]`)?.value || '0', 10) || 0);
      let secs = h * 3600 + Math.min(59, mi) * 60 + Math.min(59, se);
      const durInp = modal.el.querySelector(`.task-dur-input[data-task-id="${t.id}"]`);
      if (durInp?.value?.trim()) {
        const parsed = parseDurationInput(durInp.value);
        if (parsed >= 0) secs = parsed;
      }
      return { ...t, title, durationSeconds: secs };
    });

    const totalDur = updatedTasks.reduce((s, t) => s + (t.durationSeconds || 0), 0);
    const wallSec = currentSession.endedAt && currentSession.startedAt
      ? Math.max(0, (new Date(currentSession.endedAt) - new Date(currentSession.startedAt)) / 1000)
      : null;
    if (wallSec != null && totalDur > wallSec + 120) {
      Toast.warning('Zeit-Check', 'Die Task-Summe liegt über der Session-Zeitspanne — Speichern ist trotzdem möglich.');
    }

    const patch = {
      subjectId: editSubjectId,
      note,
      tags: editTags,
      rating: editRating,
      startedAt,
      tasks: updatedTasks,
      durationSeconds: Math.round(totalDur)
    };

    State.updateSession(currentSession.id, patch);
    currentSession = { ...currentSession, ...patch };
    Toast.success('Session aktualisiert');

    editMode = false;
    modal.el.querySelector('#detail-edit').innerHTML = '<i data-lucide="pencil"></i> Bearbeiten';
    saveBtn.style.display = 'none';
    modal.el.querySelector('.modal-body').innerHTML = buildBody(currentSession, false);
    renderIcons(modal.el);
    onRefresh?.();
  });

  modal.el.querySelector('#detail-cancel')?.addEventListener('click', () => modal.close());

  modal.el.querySelector('#detail-delete')?.addEventListener('click', () => {
    const confirmModal = Modal.open({
      title: 'Session löschen?',
      size: 'sm',
      body: `<p style="color:var(--text-secondary);font-size:14px">
        Diese Session${currentSession.tasks?.length > 0 ? ` und ihre ${currentSession.tasks.length} Tasks (${formatDuration(currentSession.durationSeconds)} gesamt)` : ''}
        werden unwiderruflich gelöscht.
      </p>`,
      footer: `
        <button class="btn btn-ghost" id="del-cancel" type="button">Abbrechen</button>
        <button class="btn btn-danger" id="del-confirm" type="button">Löschen</button>`
    });
    renderIcons(confirmModal.el);

    confirmModal.el.querySelector('#del-cancel')?.addEventListener('click', () => confirmModal.close());
    confirmModal.el.querySelector('#del-confirm')?.addEventListener('click', () => {
      pushTrash({ ...currentSession });
      State.removeSession(currentSession.id);
      confirmModal.close();
      modal.close();
      onRefresh?.();

      /* Undo toast */
      Toast.show({
        type: 'info',
        title: 'Session gelöscht',
        duration: 5000,
        action: {
          label: 'Rückgängig',
          handler: () => {
            const recovered = popTrash(currentSession.id);
            if (recovered) {
              State.addSession(recovered);
              onRefresh?.();
              Toast.success('Wiederhergestellt');
            }
          }
        }
      });
    });
  });
}

function _buildEditableTask(task) {
  const durStr = _secsToDurStr(Math.round(task.durationSeconds || 0));
  const ts = Math.round(task.durationSeconds || 0);
  const h = Math.floor(ts / 3600);
  const m = Math.floor((ts % 3600) / 60);
  const s = ts % 60;
  const safeTitle = String(task.title || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  return `<div class="detail-task-row edit-task-row" style="flex-wrap:wrap;gap:8px;align-items:center">
    <span class="detail-task-status">${task.status === 'done' ? '✓' : '○'}</span>
    <input class="input task-title-input" data-task-id="${task.id}" value="${safeTitle}" style="flex:1;min-width:140px" />
    <div class="task-time-edit" style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;font-size:12px;color:var(--text-tertiary)">
      <input type="number" min="0" class="input task-hms" data-part="h" data-task-id="${task.id}" value="${h}" style="width:50px;padding:4px 6px" title="h"/>
      <span>:</span>
      <input type="number" min="0" max="59" class="input task-hms" data-part="m" data-task-id="${task.id}" value="${m}" style="width:50px;padding:4px 6px" title="m"/>
      <span>:</span>
      <input type="number" min="0" max="59" class="input task-hms" data-part="s" data-task-id="${task.id}" value="${s}" style="width:50px;padding:4px 6px" title="s"/>
      <input class="input task-dur-input" data-task-id="${task.id}" value="${durStr}" placeholder="1h 5m"
        style="width:88px;font-size:12px;padding:4px 8px;font-family:var(--font-mono)" />
    </div>
  </div>`;
}

function _secsToDurStr(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0 && s === 0) return `${h}h ${m}m`;
  if (h > 0)            return `${h}h ${m}m ${s}s`;
  if (m > 0 && s === 0) return `${m}m`;
  if (m > 0)            return `${m}m ${s}s`;
  return `${s}s`;
}

function parseDurationInput(str) {
  if (!str?.trim()) return -1;
  str = str.trim().toLowerCase();
  let total = 0;
  const hMatch = str.match(/(\d+(?:\.\d+)?)\s*h/);
  const mMatch = str.match(/(\d+(?:\.\d+)?)\s*m(?!s)/);
  const sMatch = str.match(/(\d+(?:\.\d+)?)\s*s/);
  if (hMatch) total += parseFloat(hMatch[1]) * 3600;
  if (mMatch) total += parseFloat(mMatch[1]) * 60;
  if (sMatch) total += parseFloat(sMatch[1]);
  if (!hMatch && !mMatch && !sMatch) {
    const n = parseFloat(str);
    if (!isNaN(n)) total = n * 60;
  }
  return Math.round(total);
}
