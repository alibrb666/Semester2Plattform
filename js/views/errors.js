import { State } from '../state.js';
import { uuid, formatDateShort, isReviewDue, reviewDates, renderIcons } from '../util.js';
import { Modal } from '../components/modal.js';
import { Toast } from '../components/toast.js';

const CAT_LABELS = { concept:'Konzept', fluke:'Flüchtigkeit', calculation:'Rechnen', understanding:'Verständnis', time:'Zeit' };
const CAT_BADGES = { concept:'badge-accent', fluke:'badge-warning', calculation:'badge-danger', understanding:'badge-muted', time:'badge-muted' };

let _selectedId = null;
let _filterSubj = 'all';
let _filterCat  = 'all';
let _search     = '';

export function renderErrors(container) {
  const subjects = State.getSubjects();

  function getFiltered() {
    return State.getErrors().filter(e => {
      if (_filterSubj !== 'all' && e.subjectId !== _filterSubj) return false;
      if (_filterCat  !== 'all' && e.category  !== _filterCat)  return false;
      if (_search) {
        const q = _search.toLowerCase();
        if (!e.topic?.toLowerCase().includes(q) && !e.description?.toLowerCase().includes(q)) return false;
      }
      return true;
    }).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  function renderPane() {
    const listEl   = container.querySelector('#error-list');
    const detailEl = container.querySelector('#error-detail');
    if (!listEl || !detailEl) return;

    const filtered = getFiltered();

    if (!filtered.length) {
      listEl.innerHTML = `<div class="empty-state" style="padding:32px 16px">
        <i data-lucide="book-open" style="width:36px;height:36px"></i>
        <div class="empty-title">Keine Einträge</div>
        <div class="empty-sub">Erstelle einen neuen Eintrag über den Button oder Quick Capture (N).</div>
      </div>`;
      renderIcons(listEl);
      detailEl.innerHTML = `<div class="errors-detail-empty"><div class="empty-state">
        <i data-lucide="arrow-left" style="width:32px;height:32px"></i>
        <div class="empty-sub">Eintrag auswählen</div>
      </div></div>`;
      renderIcons(detailEl);
      return;
    }

    listEl.innerHTML = filtered.map(e => {
      const due = isReviewDue(e);
      const sub = subjects.find(s => s.id === e.subjectId);
      return `<div class="error-list-item${_selectedId===e.id?' active':''}" data-id="${e.id}" role="button" tabindex="0">
        <div class="error-bar" style="background:var(--subject-${e.subjectId})"></div>
        <div class="error-item-info">
          <div class="error-item-topic">${e.topic}</div>
          <div class="error-item-sub">
            ${sub?.name?.split(' ')[0] || ''} · ${formatDateShort(e.createdAt)}
            ${due ? '<div class="error-due-dot" title="Wiederholung fällig"></div>' : ''}
          </div>
        </div>
        <span class="badge ${CAT_BADGES[e.category]||'badge-muted'}" style="font-size:10px;flex-shrink:0">${CAT_LABELS[e.category]||e.category}</span>
      </div>`;
    }).join('');
    renderIcons(listEl);

    if (_selectedId) {
      const entry = State.getErrors().find(e => e.id === _selectedId);
      if (entry) renderDetail(detailEl, entry, subjects);
    } else if (filtered.length) {
      _selectedId = filtered[0].id;
      renderDetail(detailEl, filtered[0], subjects);
      listEl.querySelector('.error-list-item')?.classList.add('active');
    }

    listEl.querySelectorAll('.error-list-item').forEach(item => {
      item.addEventListener('click', () => {
        _selectedId = item.dataset.id;
        listEl.querySelectorAll('.error-list-item').forEach(x => x.classList.remove('active'));
        item.classList.add('active');
        const entry = State.getErrors().find(e => e.id === _selectedId);
        if (entry) renderDetail(detailEl, entry, subjects);
      });
      item.addEventListener('keydown', e => { if (e.key==='Enter') item.click(); });
    });
  }

  container.innerHTML = `
    <div class="view">
      <div class="view-header">
        <div><div class="view-title">Fehlerbuch</div></div>
        <button class="btn btn-primary btn-sm" id="btn-new-error">
          <i data-lucide="plus"></i> Neuer Eintrag
        </button>
      </div>

      <div class="errors-layout">
        <!-- List pane -->
        <div class="errors-list-pane">
          <div class="errors-list-header">
            <input class="input" id="error-search" type="search" placeholder="Suchen…" value="${_search}" style="font-size:13px;padding:7px 10px" />
            <div style="display:flex;gap:8px">
              <select class="select" id="error-filter-subj" style="flex:1;font-size:12px;padding:5px 24px 5px 8px">
                <option value="all">Alle Fächer</option>
                ${subjects.map(s=>`<option value="${s.id}"${_filterSubj===s.id?' selected':''}>${s.name}</option>`).join('')}
              </select>
              <select class="select" id="error-filter-cat" style="flex:1;font-size:12px;padding:5px 24px 5px 8px">
                <option value="all">Alle Typen</option>
                ${Object.entries(CAT_LABELS).map(([v,l])=>`<option value="${v}"${_filterCat===v?' selected':''}>${l}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="errors-list-scroll" id="error-list"></div>
        </div>
        <!-- Detail pane -->
        <div class="errors-detail-pane" id="error-detail">
          <div class="errors-detail-empty"><div class="empty-state">
            <i data-lucide="book-open" style="width:48px;height:48px"></i>
            <div class="empty-title">Fehlerbuch</div>
            <div class="empty-sub">Wähle einen Eintrag aus der Liste oder erstelle einen neuen.</div>
          </div></div>
        </div>
      </div>
    </div>`;

  renderIcons(container);
  renderPane();

  container.querySelector('#btn-new-error')?.addEventListener('click', () => openNewEntryModal(subjects, () => { _selectedId = null; renderPane(); }));
  document.addEventListener('errors:new', () => openNewEntryModal(subjects, () => { _selectedId = null; renderPane(); }), { once:true });
  container.querySelector('#error-search')?.addEventListener('input', e => { _search = e.target.value; renderPane(); });
  container.querySelector('#error-filter-subj')?.addEventListener('change', e => { _filterSubj = e.target.value; renderPane(); });
  container.querySelector('#error-filter-cat')?.addEventListener('change', e => { _filterCat = e.target.value; renderPane(); });
}

function renderDetail(detailEl, entry, subjects) {
  const sub = subjects.find(s => s.id === entry.subjectId);
  const due = isReviewDue(entry);
  const nextDue = reviewDates(entry);
  detailEl.innerHTML = `
    <div class="errors-detail-content">
      <div class="detail-topic">${entry.topic}</div>
      <div class="detail-meta">
        <span class="subject-tag ${entry.subjectId}" style="background:var(--subject-${entry.subjectId}22);color:var(--subject-${entry.subjectId})">${sub?.name||''}</span>
        <span class="badge ${CAT_BADGES[entry.category]||'badge-muted'}">${CAT_LABELS[entry.category]||entry.category}</span>
        <span style="font-size:12px;color:var(--text-tertiary)">${new Date(entry.createdAt).toLocaleDateString('de-DE',{day:'numeric',month:'long',year:'numeric'})}</span>
        ${entry.repeated > 0 ? `<span class="badge badge-warning">${entry.repeated}× wiederholt</span>` : ''}
        ${due ? `<span class="badge badge-danger" style="animation:pulse-border 2s infinite">Wiederholung fällig</span>` : ''}
      </div>

      ${entry.description ? `<div>
        <div class="detail-section-title">Fehler</div>
        <div class="detail-description">${entry.description.replace(/\n/g,'<br>')}</div>
      </div>` : ''}

      ${entry.resolution ? `<div>
        <div class="detail-section-title">Lösung / Merkhilfe</div>
        <div class="detail-resolution">${entry.resolution.replace(/\n/g,'<br>')}</div>
      </div>` : ''}

      ${entry.reviewedAt?.length ? `<div>
        <div class="detail-section-title">Wiederholt am</div>
        <div class="review-dates">
          ${entry.reviewedAt.map(d=>`<span class="review-date-pill">${new Date(d).toLocaleDateString('de-DE',{day:'numeric',month:'short'})}</span>`).join('')}
        </div>
      </div>` : ''}

      ${nextDue ? `<div style="font-size:12px;color:var(--text-tertiary)">
        Nächste Wiederholung: <strong style="color:var(--text-secondary)">${new Date(nextDue).toLocaleDateString('de-DE',{weekday:'long',day:'numeric',month:'long'})}</strong>
      </div>` : ''}

      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
        <button class="btn btn-primary btn-sm" id="detail-review">Als wiederholt markieren</button>
        <button class="btn btn-secondary btn-sm" id="detail-edit">Bearbeiten</button>
        <button class="btn btn-danger btn-sm" id="detail-del" style="margin-left:auto">Löschen</button>
      </div>
    </div>`;

  renderIcons(detailEl);

  detailEl.querySelector('#detail-review')?.addEventListener('click', () => {
    const reviewed = [...(entry.reviewedAt||[]), new Date().toISOString()];
    State.updateError(entry.id, { reviewedAt: reviewed });
    Toast.success('Als wiederholt markiert');
    const updated = State.getErrors().find(e => e.id === entry.id);
    if (updated) renderDetail(detailEl, updated, subjects);
  });

  detailEl.querySelector('#detail-edit')?.addEventListener('click', () => openEditModal(entry, subjects, (updated) => {
    renderDetail(detailEl, updated, subjects);
  }));

  detailEl.querySelector('#detail-del')?.addEventListener('click', () => {
    State.removeError(entry.id);
    _selectedId = null;
    Toast.success('Eintrag gelöscht');
    const root = document.getElementById('view-root');
    if (root) renderErrors(root);
  });
}

function openNewEntryModal(subjects, onSave) {
  const body = `
    <div class="field">
      <label for="ne-subject">Fach</label>
      <select class="select" id="ne-subject">${subjects.map(s=>`<option value="${s.id}">${s.name}</option>`).join('')}</select>
    </div>
    <div class="field">
      <label for="ne-topic">Thema *</label>
      <input class="input" id="ne-topic" type="text" placeholder="z.B. Vollständige Induktion" />
    </div>
    <div class="field">
      <label for="ne-cat">Kategorie</label>
      <select class="select" id="ne-cat">
        ${Object.entries(CAT_LABELS).map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}
      </select>
    </div>
    <div class="field">
      <label for="ne-desc">Beschreibung</label>
      <textarea class="textarea" id="ne-desc" rows="3" placeholder="Was ist passiert?"></textarea>
    </div>
    <div class="field">
      <label for="ne-res">Lösung / Merkhilfe</label>
      <textarea class="textarea" id="ne-res" rows="3" placeholder="Wie vermeidest du den Fehler künftig?"></textarea>
    </div>`;

  const modal = Modal.open({
    title: 'Neuer Fehlerbuch-Eintrag',
    body,
    footer: `<button class="btn btn-ghost" id="ne-cancel">Abbrechen</button>
             <button class="btn btn-primary" id="ne-save">Speichern</button>`
  });
  renderIcons(modal.el);

  modal.el.querySelector('#ne-cancel')?.addEventListener('click', () => modal.close());
  modal.el.querySelector('#ne-save')?.addEventListener('click', () => {
    const topic = modal.el.querySelector('#ne-topic')?.value.trim();
    if (!topic) { modal.el.querySelector('#ne-topic')?.focus(); return; }
    const entry = {
      id: uuid(),
      subjectId: modal.el.querySelector('#ne-subject')?.value,
      createdAt: new Date().toISOString(),
      topic,
      category: modal.el.querySelector('#ne-cat')?.value,
      description: modal.el.querySelector('#ne-desc')?.value.trim(),
      resolution: modal.el.querySelector('#ne-res')?.value.trim(),
      reviewedAt: [],
      repeated: 0
    };
    State.addError(entry);
    _selectedId = entry.id;
    modal.close();
    Toast.success('Eintrag gespeichert', topic);
    onSave?.();
  });
}

function openEditModal(entry, subjects, onSave) {
  const body = `
    <div class="field">
      <label for="ee-subject">Fach</label>
      <select class="select" id="ee-subject">${subjects.map(s=>`<option value="${s.id}"${s.id===entry.subjectId?' selected':''}>${s.name}</option>`).join('')}</select>
    </div>
    <div class="field">
      <label for="ee-topic">Thema</label>
      <input class="input" id="ee-topic" type="text" value="${entry.topic}" />
    </div>
    <div class="field">
      <label for="ee-cat">Kategorie</label>
      <select class="select" id="ee-cat">${Object.entries(CAT_LABELS).map(([v,l])=>`<option value="${v}"${v===entry.category?' selected':''}>${l}</option>`).join('')}</select>
    </div>
    <div class="field">
      <label for="ee-desc">Beschreibung</label>
      <textarea class="textarea" id="ee-desc" rows="3">${entry.description||''}</textarea>
    </div>
    <div class="field">
      <label for="ee-res">Lösung / Merkhilfe</label>
      <textarea class="textarea" id="ee-res" rows="3">${entry.resolution||''}</textarea>
    </div>`;

  const modal = Modal.open({ title:'Eintrag bearbeiten', body,
    footer:`<button class="btn btn-ghost" id="ee-cancel">Abbrechen</button>
            <button class="btn btn-primary" id="ee-save">Speichern</button>`
  });
  renderIcons(modal.el);
  modal.el.querySelector('#ee-cancel')?.addEventListener('click', () => modal.close());
  modal.el.querySelector('#ee-save')?.addEventListener('click', () => {
    const patch = {
      subjectId:   modal.el.querySelector('#ee-subject')?.value,
      topic:       modal.el.querySelector('#ee-topic')?.value.trim(),
      category:    modal.el.querySelector('#ee-cat')?.value,
      description: modal.el.querySelector('#ee-desc')?.value.trim(),
      resolution:  modal.el.querySelector('#ee-res')?.value.trim()
    };
    State.updateError(entry.id, patch);
    modal.close();
    Toast.success('Eintrag aktualisiert');
    onSave?.({ ...entry, ...patch });
  });
}
