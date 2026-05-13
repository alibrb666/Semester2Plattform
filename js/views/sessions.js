import { State } from '../state.js';
import { formatDuration, formatDateShort, isSameDay, renderIcons, sumDuration } from '../util.js';
import { Modal } from '../components/modal.js';
import { Toast } from '../components/toast.js';

export function renderSessions(container) {
  const sessions  = [...State.getSessions()].sort((a,b) => new Date(b.startedAt) - new Date(a.startedAt));
  const subjects  = State.getSubjects();
  let filterSubj  = 'all';
  let filterRange = 'all';

  function getFiltered() {
    return sessions.filter(s => {
      if (filterSubj !== 'all' && s.subjectId !== filterSubj) return false;
      if (filterRange === 'week') {
        const d = new Date(s.startedAt);
        const now = new Date();
        const mon = new Date(now); mon.setDate(now.getDate() - ((now.getDay()+6)%7)); mon.setHours(0,0,0,0);
        if (d < mon) return false;
      }
      if (filterRange === 'month') {
        const d = new Date(s.startedAt);
        if (d < new Date(Date.now() - 30*86400000)) return false;
      }
      return true;
    });
  }

  function grouped(list) {
    const groups = {};
    list.forEach(s => {
      const d = new Date(s.startedAt);
      const key = isSameDay(d, new Date()) ? 'Heute'
        : isSameDay(d, new Date(Date.now()-86400000)) ? 'Gestern'
        : d.toLocaleDateString('de-DE', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
      if (!groups[key]) groups[key] = [];
      groups[key].push(s);
    });
    return groups;
  }

  function renderList() {
    const list   = getFiltered();
    const grps   = grouped(list);
    const total  = sumDuration(list);
    let html = '';

    if (!list.length) {
      listEl.innerHTML = `<div class="empty-state">
        <i data-lucide="timer" style="width:48px;height:48px"></i>
        <div class="empty-title">Keine Sessions gefunden</div>
        <div class="empty-sub">Ändere die Filter oder starte deine erste Lernsession.</div>
      </div>`;
      renderIcons(listEl);
      return;
    }

    Object.entries(grps).forEach(([day, daySess]) => {
      const dayTotal = sumDuration(daySess);
      html += `<div class="sessions-group-header">${day} · ${formatDuration(dayTotal)}</div>`;
      daySess.forEach(s => {
        const sub = subjects.find(x => x.id === s.subjectId);
        const t   = new Date(s.startedAt).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'});
        html += `<div class="session-row" data-session-id="${s.id}" role="button" tabindex="0" aria-label="${sub?.name} ${formatDuration(s.durationSeconds)}">
          <div class="session-row-bar" style="background:var(--subject-${s.subjectId})"></div>
          <div class="session-row-icon" style="background:var(--subject-${s.subjectId}22);color:var(--subject-${s.subjectId})">
            <i data-lucide="timer"></i>
          </div>
          <div class="session-row-info">
            <div class="session-row-subject">${sub?.name || s.subjectId}</div>
            <div class="session-row-note">${s.note || 'Keine Notiz'}</div>
          </div>
          <div class="session-row-tags">
            ${(s.tags||[]).map(tag => `<span class="badge badge-muted">${tag}</span>`).join('')}
          </div>
          <div class="session-row-rating">${s.rating ? '★'.repeat(s.rating) : ''}</div>
          <div class="session-row-dur">${formatDuration(s.durationSeconds)}</div>
          <div class="session-row-date">${t}</div>
        </div>`;
      });
    });
    listEl.innerHTML = html;
    renderIcons(listEl);

    /* Summary bar */
    summaryEl.textContent = `${list.length} Sessions · ${formatDuration(total)} gesamt`;

    listEl.querySelectorAll('.session-row').forEach(row => {
      row.addEventListener('click', () => openSessionDetail(row.dataset.sessionId, sessions, subjects));
      row.addEventListener('keydown', e => { if (e.key==='Enter') openSessionDetail(row.dataset.sessionId, sessions, subjects); });
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

  container.querySelector('#filter-subj')?.addEventListener('change', e => { filterSubj = e.target.value; renderList(); });
  container.querySelector('#filter-range')?.addEventListener('change', e => { filterRange = e.target.value; renderList(); });

  renderList();
}

function openSessionDetail(id, sessions, subjects) {
  const s   = sessions.find(x => x.id === id);
  if (!s) return;
  const sub = subjects.find(x => x.id === s.subjectId);
  const d   = new Date(s.startedAt);

  const modal = Modal.open({
    title: sub?.name || 'Session',
    body: `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
        <div class="card" style="text-align:center">
          <div class="stat-label">Dauer</div>
          <div class="stat-value">${formatDuration(s.durationSeconds)}</div>
        </div>
        <div class="card" style="text-align:center">
          <div class="stat-label">Bewertung</div>
          <div class="stat-value">${s.rating ? '★'.repeat(s.rating) + '☆'.repeat(5-s.rating) : '–'}</div>
        </div>
      </div>
      <div class="field">
        <label>Datum & Uhrzeit</label>
        <div style="font-size:14px;color:var(--text-secondary)">${d.toLocaleDateString('de-DE',{weekday:'long',day:'numeric',month:'long',year:'numeric'})} · ${d.toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'})}</div>
      </div>
      <div class="field">
        <label for="detail-note">Notiz</label>
        <textarea class="textarea" id="detail-note" rows="3">${s.note || ''}</textarea>
      </div>
      ${s.tags?.length ? `<div class="field"><label>Tags</label><div style="display:flex;gap:6px;flex-wrap:wrap">${s.tags.map(t=>`<span class="badge badge-muted">${t}</span>`).join('')}</div></div>` : ''}
    `,
    footer: `<button class="btn btn-danger btn-sm" id="detail-delete">Löschen</button>
             <button class="btn btn-ghost btn-sm" id="detail-cancel">Schließen</button>
             <button class="btn btn-primary btn-sm" id="detail-save">Speichern</button>`
  });

  renderIcons(modal.el);
  modal.el.querySelector('#detail-cancel')?.addEventListener('click', () => modal.close());
  modal.el.querySelector('#detail-save')?.addEventListener('click', () => {
    const note = modal.el.querySelector('#detail-note')?.value;
    State.updateSession(id, { note });
    modal.close();
    Toast.success('Session aktualisiert');
  });
  modal.el.querySelector('#detail-delete')?.addEventListener('click', () => {
    State.removeSession(id);
    modal.close();
    Toast.success('Session gelöscht');
    const parent = document.getElementById('view-root');
    if (parent) renderSessions(parent);
  });
}
