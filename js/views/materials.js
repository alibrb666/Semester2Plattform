import { State } from '../state.js';
import { uuid, formatDateShort, renderIcons } from '../util.js';
import { Modal } from '../components/modal.js';
import { Toast } from '../components/toast.js';
import { t, translateDom } from '../i18n.js';
import { loadHistory, appendMessage, clearHistory, listConversations } from '../chatHistory.js';

export function renderMaterials(container) {
  const subjects = State.getSubjects();
  const items = State.getMaterials().slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  container.innerHTML = `
    <div class="view">
      <div class="view-header">
        <div>
          <div class="view-title">${t('materials')}</div>
          <div class="view-sub">${t('materialsModuleSub')}</div>
        </div>
        <button class="btn btn-primary btn-sm" id="btn-add-material">
          <i data-lucide="plus"></i> ${t('addEntry')}
        </button>
      </div>
      <div class="card" style="padding:14px;margin-bottom:12px">
        <div class="section-header">
          <div class="section-title">Internal Data Assistant</div>
        </div>
        <div style="display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap">
          <div style="font-size:12px;color:var(--text-tertiary)">Frage nach deinen internen Lern-Daten, Sessions, Fortschritt und App-Features.</div>
          <button class="btn btn-primary btn-sm" id="btn-ai-chat">Open Assistant</button>
        </div>
      </div>
      <div id="materials-list"></div>
    </div>`;

  const list = container.querySelector('#materials-list');
  if (!list) return;

  if (!items.length) {
    list.innerHTML = `<div class="empty-state">
      <i data-lucide="folder-open" style="width:48px;height:48px"></i>
      <div class="empty-title">${t('noMaterialsYet')}</div>
      <div class="empty-sub">${t('noMaterialsHint')}</div>
    </div>`;
  } else {
    const groups = [];
    subjects.forEach(sub => {
      const entries = items.filter(item => item.subjectId === sub.id);
      if (entries.length) groups.push({ subject: sub, entries });
    });
    const withoutSubject = items.filter(item => !subjects.some(s => s.id === item.subjectId));
    if (withoutSubject.length) groups.push({ subject: null, entries: withoutSubject });

    list.innerHTML = groups.map(group => {
      const subjectName = group.subject?.name || 'Ohne Fach';
      const subjectColor = group.subject ? `var(--subject-${group.subject.id})` : 'var(--text-tertiary)';
      const pdfs = group.entries.filter(item => item.pdfAttachment?.dataUrl);
      return `<div class="card" style="padding:14px;margin-bottom:12px">
        <div class="section-header" style="margin-bottom:10px">
          <div class="section-title" style="display:flex;align-items:center;gap:8px">
            <span style="width:10px;height:10px;border-radius:50%;background:${subjectColor}"></span>
            ${subjectName}
          </div>
        </div>
        <div style="margin-bottom:10px">
          <div style="font-size:12px;color:var(--text-tertiary);margin-bottom:6px">PDFs</div>
          ${pdfs.length ? `<div style="display:flex;flex-wrap:wrap;gap:6px">
            ${pdfs.map(item => `<button class="btn btn-secondary btn-sm" type="button" data-pdf-preview="${item.id}">${escapeHtml(item.pdfAttachment?.name || item.title)}</button>`).join('')}
          </div>` : `<div style="font-size:12px;color:var(--text-tertiary)">Keine PDFs hochgeladen.</div>`}
        </div>
        <div>
          ${group.entries.map(item => {
            const typeLabel = item.kind === 'task' ? t('task') : t('material');
            return `<div class="session-item" data-material-id="${item.id}" style="cursor:pointer">
              <div class="session-color-bar" style="background:${subjectColor}"></div>
              <div class="session-info">
                <div class="session-note">${item.title}</div>
                <div class="session-subject">${typeLabel}${item.dueDate ? ` · ${formatDateShort(item.dueDate)}` : ''}</div>
                ${item.note ? `<div class="session-note" style="font-size:12px;color:var(--text-tertiary)">${item.note}</div>` : ''}
              </div>
              <div class="session-meta">
                ${item.pdfAttachment?.dataUrl ? `<button class="btn btn-secondary btn-sm" type="button" data-pdf-preview="${item.id}">PDF</button>` : ''}
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>`;
    }).join('');
  }

  container.querySelector('#btn-add-material')?.addEventListener('click', () => openCreateModal(subjects, () => renderMaterials(container)));
  container.querySelector('#btn-ai-chat')?.addEventListener('click', () => {
    openAssistantChat();
  });
  list.querySelectorAll('[data-material-id]').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.closest('[data-pdf-preview]')) return;
      const item = State.getMaterials().find(m => m.id === el.dataset.materialId);
      if (item) openDetail(item, subjects, () => renderMaterials(container));
    });
  });
  list.querySelectorAll('[data-pdf-preview]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const item = State.getMaterials().find(m => m.id === btn.dataset.pdfPreview);
      if (!item?.pdfAttachment?.dataUrl) return;
      Modal.open({
        title: item.pdfAttachment.name || 'PDF',
        size: 'lg',
        body: `<iframe src="${item.pdfAttachment.dataUrl}" style="width:100%;height:70vh;border:1px solid var(--border);border-radius:10px"></iframe>`
      });
    });
  });

  translateDom(container);
  renderIcons(container);
}

function openCreateModal(subjects, onSave) {
  const body = `
    <div class="field">
      <label for="mat-subj">${t('Fach')}</label>
      <select class="select" id="mat-subj">${subjects.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}</select>
    </div>
    <div class="field-row">
      <div class="field">
        <label for="mat-kind">${t('Kategorie')}</label>
        <select class="select" id="mat-kind">
          <option value="task">${t('task')}</option>
          <option value="material">${t('material')}</option>
        </select>
      </div>
      <div class="field">
        <label for="mat-due">${t('dueDateOptional')}</label>
        <input class="input" id="mat-due" type="date" />
      </div>
    </div>
    <div class="field">
      <label for="mat-title">${t('Thema')}</label>
      <input class="input" id="mat-title" type="text" />
    </div>
    <div class="field">
      <label for="mat-note">${t('Notiz')}</label>
      <input class="input" id="mat-note" type="text" placeholder="${t('Optional')}" />
    </div>
    <div class="field">
      <label for="mat-pdf">${t('pdfOptional')}</label>
      <input class="input" id="mat-pdf" type="file" accept="application/pdf" />
    </div>`;

  const modal = Modal.open({
    title: t('addEntry'),
    body,
    footer: `<button class="btn btn-ghost" id="mat-cancel">${t('Abbrechen')}</button>
             <button class="btn btn-primary" id="mat-save">${t('Speichern')}</button>`
  });

  modal.el.querySelector('#mat-cancel')?.addEventListener('click', () => modal.close());
  modal.el.querySelector('#mat-save')?.addEventListener('click', () => {
    const title = modal.el.querySelector('#mat-title')?.value.trim();
    if (!title) return;
    const pdfFile = modal.el.querySelector('#mat-pdf')?.files?.[0] || null;
    const create = pdfAttachment => ({
      id: uuid(),
      subjectId: modal.el.querySelector('#mat-subj')?.value,
      kind: modal.el.querySelector('#mat-kind')?.value || 'material',
      title,
      note: modal.el.querySelector('#mat-note')?.value.trim() || '',
      dueDate: modal.el.querySelector('#mat-due')?.value || null,
      pdfAttachment,
      createdAt: new Date().toISOString()
    });
    const finish = pdfAttachment => {
      State.addMaterial(create(pdfAttachment));
      Toast.success(t('Speichern'));
      modal.close();
      onSave?.();
    };
    if (!pdfFile) return finish(null);
    const reader = new FileReader();
    reader.onload = () => finish({ name: pdfFile.name, dataUrl: String(reader.result || '') });
    reader.onerror = () => finish(null);
    reader.readAsDataURL(pdfFile);
  });

  translateDom(modal.el);
  renderIcons(modal.el);
}

function openDetail(item, subjects, onSave) {
  const sub = subjects.find(s => s.id === item.subjectId);
  const modal = Modal.open({
    title: item.title,
    body: `<div class="detail-kv">
      <div class="detail-kv-row"><span>${t('Fach')}</span><strong>${sub?.name || '—'}</strong></div>
      <div class="detail-kv-row"><span>${t('Kategorie')}</span><strong>${item.kind === 'task' ? t('task') : t('material')}</strong></div>
      ${item.dueDate ? `<div class="detail-kv-row"><span>${t('Fällig am')}</span><strong>${formatDateShort(item.dueDate)}</strong></div>` : ''}
    </div>
    ${item.note ? `<div class="detail-description">${item.note}</div>` : ''}
    ${item.pdfAttachment?.dataUrl ? `<div style="margin-top:12px"><button class="btn btn-secondary btn-sm" id="mat-preview-pdf">${t('PDF Vorschau')}</button></div>` : ''}`,
    footer: `<button class="btn btn-danger btn-sm" id="mat-del">${t('Löschen')}</button>
             <button class="btn btn-ghost btn-sm" id="mat-close">${t('Schließen')}</button>`
  });

  modal.el.querySelector('#mat-close')?.addEventListener('click', () => modal.close());
  modal.el.querySelector('#mat-del')?.addEventListener('click', () => {
    State.removeMaterial(item.id);
    modal.close();
    Toast.success(t('Löschen'));
    onSave?.();
  });
  modal.el.querySelector('#mat-preview-pdf')?.addEventListener('click', () => {
    Modal.open({
      title: item.pdfAttachment.name || 'PDF',
      size: 'lg',
      body: `<iframe src="${item.pdfAttachment.dataUrl}" style="width:100%;height:70vh;border:1px solid var(--border);border-radius:10px"></iframe>`
    });
  });
}

function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function openAssistantChat() {
  const sourceId = 'internal:user-data-assistant';
  const modal = Modal.open({
    title: 'Internal Data Assistant',
    size: 'lg',
    body: `
      <div class="field">
        <label for="ai-history">Previous chats</label>
        <select class="select" id="ai-history">
          <option value="">— loading… —</option>
        </select>
      </div>
      <div id="ai-chat-log" style="height:44vh;overflow:auto;border:1px solid var(--border);border-radius:10px;padding:10px;background:var(--bg-elevated);display:flex;flex-direction:column;gap:8px"></div>
      <div style="display:grid;grid-template-columns:1fr auto;gap:8px;margin-top:10px">
        <input class="input" id="ai-chat-input" type="text" placeholder="Frag zu deinen internen Lern-Daten (z. B. Mathe-Statistik oder letzte Sessions)..." />
        <button class="btn btn-secondary btn-sm" id="ai-chat-ask">Ask</button>
      </div>
    `,
    footer: `<button class="btn btn-ghost btn-sm" id="ai-chat-clear">Clear history</button>
             <button class="btn btn-ghost btn-sm" id="ai-chat-close">${t('Schließen')}</button>`
  });

  const log = modal.el.querySelector('#ai-chat-log');
  const input = modal.el.querySelector('#ai-chat-input');
  const historySel = modal.el.querySelector('#ai-history');

  const append = (role, txt) => {
    const side = role === 'user' ? 'flex-end' : 'flex-start';
    const bg = role === 'user' ? 'var(--accent)' : 'var(--bg-card)';
    const color = role === 'user' ? '#fff' : 'var(--text-primary)';
    const el = document.createElement('div');
    el.style.maxWidth = '92%';
    el.style.alignSelf = side;
    el.style.background = bg;
    el.style.color = color;
    el.style.border = '1px solid var(--border-subtle)';
    el.style.borderRadius = '10px';
    el.style.padding = '8px 10px';
    el.style.fontSize = '13px';
    el.style.whiteSpace = 'pre-wrap';
    el.textContent = txt;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return el;
  };

  const renderHistory = async () => {
    log.innerHTML = '';
    const rows = await loadHistory(sourceId).catch(() => []);
    const msgs = rows.map(r => ({ role: r.role, content: r.content }));
    msgs.forEach(m => append(m.role, m.content));
    if (!msgs.length) {
      append('assistant', 'Ich arbeite nur mit deinen internen App-Daten. Frag z. B. "Was habe ich in Mathe gelernt?"');
    }
  };

  const recordMessage = (role, content) => {
    appendMessage(sourceId, role, content, 'Internal Data Assistant')
      .then(() => { if (role === 'assistant') refreshHistoryDropdown(); })
      .catch(() => {});
  };

  const refreshHistoryDropdown = async () => {
    if (!historySel) return;
    try {
      const convs = await listConversations();
      const items = convs.filter(c => c.source_id === sourceId);
      const placeholderOpt = '<option value="">— start a new chat —</option>';
      if (!items.length) {
        historySel.innerHTML = placeholderOpt;
        return;
      }
      historySel.innerHTML = placeholderOpt + items.map(c => {
        const time = new Date(c.last_at).toLocaleDateString();
        const snippet = (c.first_user_message || '').slice(0, 50).replace(/\s+/g, ' ');
        const label = `Internal Data Assistant · ${time} · ${c.count} msgs · ${snippet}`;
        return `<option value="${escapeHtml(c.source_id)}">${escapeHtml(label)}</option>`;
      }).join('');
    } catch {
      historySel.innerHTML = '<option value="">— history unavailable —</option>';
    }
  };

  const askNow = async () => {
    const q = input.value.trim();
    if (!q) return;
    append('user', q);
    input.value = '';
    const placeholder = append('assistant', 'Prüfe deine internen Daten...');
    recordMessage('user', q);
    try {
      const res = await fetch('/api/ai/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: q,
          internalData: {
            subjects: State.getSubjects(),
            sessions: State.getSessions(),
            todos: State.getTodos(),
            mocks: State.getMocks(),
            materials: State.getMaterials(),
            errors: State.getErrors(),
            settings: State.getSettings()
          }
        })
      });
      const raw = await res.text();
      let data = null;
      try { data = raw ? JSON.parse(raw) : null; } catch {}
      if (!res.ok || !data?.ok) {
        let fallback = raw?.slice(0, 180) || 'Unknown error';
        if (res.status === 404) fallback = 'API route /api/ai/ask nicht gefunden (lokaler Dev-Server ohne API).';
        placeholder.textContent = `Antwort fehlgeschlagen: ${data?.error || fallback}`;
        return;
      }
      placeholder.textContent = data.text;
      recordMessage('assistant', data.text);
    } catch (e) {
      placeholder.textContent = `Antwort fehlgeschlagen: ${String(e?.message || e)}`;
    }
  };

  modal.el.querySelector('#ai-chat-ask')?.addEventListener('click', askNow);
  modal.el.querySelector('#ai-chat-close')?.addEventListener('click', () => modal.close());
  modal.el.querySelector('#ai-chat-clear')?.addEventListener('click', async () => {
    if (!confirm('Chat history for this assistant will be deleted. Continue?')) return;
    await clearHistory(sourceId).catch(() => {});
    await renderHistory();
    append('assistant', 'History cleared.');
    refreshHistoryDropdown();
  });
  historySel?.addEventListener('change', () => {
    renderHistory();
  });
  input?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); askNow(); } });

  renderHistory();
  refreshHistoryDropdown();
  translateDom(modal.el);
  renderIcons(modal.el);
}
