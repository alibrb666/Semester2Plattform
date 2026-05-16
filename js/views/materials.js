import { State } from '../state.js';
import { uuid, formatDateShort, renderIcons } from '../util.js';
import { Modal } from '../components/modal.js';
import { Toast } from '../components/toast.js';
import { t, translateDom } from '../i18n.js';

export function renderMaterials(container) {
  const subjects = State.getSubjects();
  const items = State.getMaterials().slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const mocks = State.getMocks();

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
          <div class="section-title">LLM Assistant</div>
        </div>
        <div style="display:grid;grid-template-columns:1fr auto auto;gap:10px;align-items:center">
          <input class="input" id="ai-question" type="text" placeholder="Ask a question about your PDFs…" />
          <button class="btn btn-secondary btn-sm" id="btn-ai-ask">Ask PDF</button>
          <button class="btn btn-primary btn-sm" id="btn-ai-mock">Generate Mock</button>
        </div>
        <div style="font-size:12px;color:var(--text-tertiary);margin-top:8px">Uses uploaded PDFs from this account.</div>
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
    list.innerHTML = items.map(item => {
      const sub = subjects.find(s => s.id === item.subjectId);
      const typeLabel = item.kind === 'task' ? t('task') : t('material');
      return `<div class="session-item" data-material-id="${item.id}" style="cursor:pointer">
        <div class="session-color-bar" style="background:var(--subject-${item.subjectId})"></div>
        <div class="session-info">
          <div class="session-note">${item.title}</div>
          <div class="session-subject">${sub?.name || '—'} · ${typeLabel}${item.dueDate ? ` · ${formatDateShort(item.dueDate)}` : ''}</div>
          ${item.note ? `<div class="session-note" style="font-size:12px;color:var(--text-tertiary)">${item.note}</div>` : ''}
        </div>
        <div class="session-meta">
          ${item.pdfAttachment?.dataUrl ? `<button class="btn btn-secondary btn-sm" type="button" data-pdf-preview="${item.id}">PDF</button>` : ''}
        </div>
      </div>`;
    }).join('');
  }

  container.querySelector('#btn-add-material')?.addEventListener('click', () => openCreateModal(subjects, () => renderMaterials(container)));
  container.querySelector('#btn-ai-ask')?.addEventListener('click', async () => {
    const q = container.querySelector('#ai-question')?.value?.trim();
    if (!q) return;
    await runAssistantAsk({ question: q, items: State.getMaterials(), mocks });
  });
  container.querySelector('#btn-ai-mock')?.addEventListener('click', async () => {
    const subject = subjects[0];
    if (!subject) return;
    await runAssistantMock({ subjectName: subject.name, items: State.getMaterials(), mocks });
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

async function runAssistantAsk({ question, items, mocks }) {
  const loading = Modal.open({
    title: 'LLM Assistant',
    body: `<div style="font-size:14px;color:var(--text-secondary)">Running PDF Q&A…</div>`
  });
  try {
    const res = await fetch('/api/ai/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, materials: items, mocks })
    });
    const data = await res.json();
    loading.close();
    if (!res.ok || !data?.ok) {
      Modal.open({ title: 'LLM Assistant Error', body: `<pre style="white-space:pre-wrap">${data?.error || 'Unknown error'}</pre>` });
      return;
    }
    Modal.open({ title: 'Assistant Answer', size: 'lg', body: `<pre style="white-space:pre-wrap;font-size:13px;line-height:1.5">${escapeHtml(data.text)}</pre>` });
  } catch (e) {
    loading.close();
    Modal.open({ title: 'LLM Assistant Error', body: `<pre>${escapeHtml(String(e?.message || e))}</pre>` });
  }
}

async function runAssistantMock({ subjectName, items, mocks }) {
  const loading = Modal.open({
    title: 'LLM Assistant',
    body: `<div style="font-size:14px;color:var(--text-secondary)">Generating mock exam from PDFs…</div>`
  });
  try {
    const res = await fetch('/api/ai/mock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subjectName, difficulty: 'medium', materials: items, mocks })
    });
    const data = await res.json();
    loading.close();
    if (!res.ok || !data?.ok) {
      Modal.open({ title: 'LLM Assistant Error', body: `<pre style="white-space:pre-wrap">${data?.error || 'Unknown error'}</pre>` });
      return;
    }
    Modal.open({ title: `Mock Exam · ${subjectName}`, size: 'lg', body: `<pre style="white-space:pre-wrap;font-size:13px;line-height:1.5">${escapeHtml(data.text)}</pre>` });
  } catch (e) {
    loading.close();
    Modal.open({ title: 'LLM Assistant Error', body: `<pre>${escapeHtml(String(e?.message || e))}</pre>` });
  }
}

function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
