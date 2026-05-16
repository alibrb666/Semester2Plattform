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
        <div style="display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap">
          <div style="font-size:12px;color:var(--text-tertiary)">Choose one PDF in chat. The assistant will use only that file.</div>
          <button class="btn btn-primary btn-sm" id="btn-ai-chat">Open Chatbot</button>
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
  container.querySelector('#btn-ai-chat')?.addEventListener('click', () => {
    openAssistantChat(State.getMaterials(), mocks, subjects);
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

function openAssistantChat(materials, mocks, subjects) {
  const sources = collectPdfSources(materials, mocks, subjects);
  const modal = Modal.open({
    title: 'LLM Chatbot',
    size: 'lg',
    body: `
      <div class="field">
        <label for="ai-source">PDF Source</label>
        <select class="select" id="ai-source">
          ${sources.map(s => `<option value="${s.id}">${escapeHtml(s.label)}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label for="ai-model">LLM Model</label>
        <select class="select" id="ai-model">
          <option value="qwen/qwen3.6-flash">qwen/qwen3.6-flash</option>
        </select>
      </div>
      <div id="ai-chat-log" style="height:44vh;overflow:auto;border:1px solid var(--border);border-radius:10px;padding:10px;background:var(--bg-elevated);display:flex;flex-direction:column;gap:8px"></div>
      <div style="display:grid;grid-template-columns:1fr auto auto;gap:8px;margin-top:10px">
        <input class="input" id="ai-chat-input" type="text" placeholder="Ask something from the selected PDF..." />
        <button class="btn btn-secondary btn-sm" id="ai-chat-ask">Ask</button>
        <button class="btn btn-primary btn-sm" id="ai-chat-mock">Generate Mock</button>
      </div>
    `,
    footer: `<button class="btn btn-ghost btn-sm" id="ai-chat-close">${t('Schließen')}</button>`
  });

  const log = modal.el.querySelector('#ai-chat-log');
  const input = modal.el.querySelector('#ai-chat-input');
  const srcSel = modal.el.querySelector('#ai-source');
  const modelSel = modal.el.querySelector('#ai-model');

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
  };

  const stripItem = (m) => ({
    id: m?.id,
    subjectId: m?.subjectId,
    subjectName: m?.subjectName,
    kind: m?.kind,
    title: m?.title,
    note: m?.note,
    score: m?.score,
    maxScore: m?.maxScore,
    pdfAttachment: m?.pdfAttachment ? { name: m.pdfAttachment.name } : undefined
  });

  const withSelected = () => {
    const selected = sources.find(s => s.id === srcSel.value);
    if (!selected) return { materials: [], mocks: [], sourceName: 'PDF' };
    const slim = stripItem(selected.item);
    const payload = selected.type === 'material'
      ? { materials: [slim], mocks: [] }
      : { materials: [], mocks: [slim] };
    return { ...payload, sourceName: selected.fileName };
  };

  const selectedModel = () => modelSel?.value || 'qwen/qwen3.6-flash';

  const parseAiResponse = async (res) => {
    const raw = await res.text();
    try {
      return { data: JSON.parse(raw), raw };
    } catch {
      return { data: null, raw };
    }
  };

  const askNow = async () => {
    const q = input.value.trim();
    if (!q) return;
    const selected = withSelected();
    if (!selected.materials.length && !selected.mocks.length) {
      append('assistant', 'Please select a PDF source first.');
      return;
    }
    append('user', q);
    input.value = '';
    append('assistant', `Using source: ${selected.sourceName}\n...`);
    const placeholder = log.lastElementChild;
    try {
      const res = await fetch('/api/ai/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, materials: selected.materials, mocks: selected.mocks, model: selectedModel() })
      });
      const { data, raw } = await parseAiResponse(res);
      if (res.ok && data?.ok) {
        placeholder.textContent = data.text;
      } else {
        const errMsg = data?.error || (raw ? `HTTP ${res.status}: ${raw.slice(0, 200)}` : `HTTP ${res.status}`);
        placeholder.textContent = formatAiError(errMsg, 'ask');
      }
    } catch (e) {
      placeholder.textContent = formatAiError(String(e?.message || e), 'ask');
    }
  };

  const mockNow = async () => {
    const selected = withSelected();
    if (!selected.materials.length && !selected.mocks.length) {
      append('assistant', 'Please select a PDF source first.');
      return;
    }
    const subjectName = subjects.find(s => s.id === (selected.materials[0]?.subjectId || selected.mocks[0]?.subjectId))?.name || 'Subject';
    append('user', `Generate mock from: ${selected.sourceName}`);
    append('assistant', 'Generating...');
    const placeholder = log.lastElementChild;
    try {
      const res = await fetch('/api/ai/mock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subjectName, difficulty: 'medium', materials: selected.materials, mocks: selected.mocks, model: selectedModel() })
      });
      const { data, raw } = await parseAiResponse(res);
      if (res.ok && data?.ok) {
        placeholder.textContent = data.text;
      } else {
        const errMsg = data?.error || (raw ? `HTTP ${res.status}: ${raw.slice(0, 200)}` : `HTTP ${res.status}`);
        placeholder.textContent = formatAiError(errMsg, 'mock');
      }
    } catch (e) {
      placeholder.textContent = formatAiError(String(e?.message || e), 'mock');
    }
  };

  modal.el.querySelector('#ai-chat-ask')?.addEventListener('click', askNow);
  modal.el.querySelector('#ai-chat-mock')?.addEventListener('click', mockNow);
  modal.el.querySelector('#ai-chat-close')?.addEventListener('click', () => modal.close());
  input?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); askNow(); } });

  append('assistant', sources.length
    ? 'Select a PDF source and ask your question.'
    : 'No PDF found. Upload PDFs in Materials or Mocks first.');

  const fallbackModels = ['qwen/qwen3.6-flash'];
  fetch('/api/ai/models')
    .then(r => r.json())
    .then(data => {
      if (!modelSel) return;
      if (!data?.ok) {
        modelSel.innerHTML = fallbackModels.map(m => `<option value="${m}">${m}</option>`).join('');
        return;
      }
      const all = [...(data.installed || []), ...(data.helpful || [])];
      const seen = new Set();
      modelSel.innerHTML = all
        .filter(m => {
          if (!m?.id || seen.has(m.id)) return false;
          seen.add(m.id);
          return true;
        })
        .map(m => `<option value="${escapeHtml(m.id)}">${escapeHtml(m.id)}${m.installed ? ' (installed)' : ''}</option>`)
        .join('');
    })
    .catch(() => {
      if (!modelSel) return;
      modelSel.innerHTML = fallbackModels.map(m => `<option value="${m}">${m}</option>`).join('');
    });
  translateDom(modal.el);
  renderIcons(modal.el);
}

function collectPdfSources(materials, mocks, subjects) {
  const sMap = new Map(subjects.map(s => [s.id, s.name]));
  const out = [];
  materials.forEach(m => {
    if (!m?.pdfAttachment?.dataUrl) return;
    out.push({
      id: `mat:${m.id}`,
      type: 'material',
      item: m,
      fileName: m.pdfAttachment.name || 'material.pdf',
      label: `[Material] ${sMap.get(m.subjectId) || '-'} · ${m.title || '-'} · ${m.pdfAttachment.name || 'PDF'}`
    });
  });
  mocks.forEach(m => {
    if (!m?.pdfAttachment?.dataUrl) return;
    out.push({
      id: `mock:${m.id}`,
      type: 'mock',
      item: m,
      fileName: m.pdfAttachment.name || 'mock.pdf',
      label: `[Mock] ${sMap.get(m.subjectId) || '-'} · ${m.pdfAttachment.name || 'PDF'}`
    });
  });
  return out;
}

function formatAiError(message, mode) {
  const text = String(message || 'Unknown error');
  const base = mode === 'mock' ? 'Mock generation failed' : 'AI answer failed';
  if (/OPENROUTER_API_KEY missing on server/i.test(text)) {
    return `${base}: Vercel is missing OPENROUTER_API_KEY.`;
  }
  if (/OPENAI_API_KEY missing on server/i.test(text)) {
    return `${base}: Vercel is missing OPENAI_API_KEY.`;
  }
  if (/not a valid model ID/i.test(text)) {
    return `${base}: the selected model ID is not valid for the current provider.`;
  }
  if (/requires more credits/i.test(text) || /credit/i.test(text)) {
    return `${base}: the OpenRouter account has insufficient credits or the token limit is too high.`;
  }
  if (/fetch/i.test(text) || /network/i.test(text)) {
    return `${base}: network error while contacting the AI endpoint.`;
  }
  return `${base}: ${text}`;
}
