import { State } from '../state.js';
import { uuid, formatDateShort, renderIcons } from '../util.js';
import { Modal } from '../components/modal.js';
import { Toast } from '../components/toast.js';
import { t, translateDom } from '../i18n.js';
import { loadHistory, appendMessage, clearHistory } from '../chatHistory.js';

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
          <option value="gemini-2.5-flash">gemini-2.5-flash</option>
        </select>
      </div>
      <div id="ai-chat-log" style="height:44vh;overflow:auto;border:1px solid var(--border);border-radius:10px;padding:10px;background:var(--bg-elevated);display:flex;flex-direction:column;gap:8px"></div>
      <div style="display:grid;grid-template-columns:1fr auto auto;gap:8px;margin-top:10px">
        <input class="input" id="ai-chat-input" type="text" placeholder="Ask something from the selected PDF..." />
        <button class="btn btn-secondary btn-sm" id="ai-chat-ask">Ask</button>
        <button class="btn btn-primary btn-sm" id="ai-chat-mock">Generate Mock</button>
      </div>
    `,
    footer: `<button class="btn btn-ghost btn-sm" id="ai-chat-clear">Clear history</button>
             <button class="btn btn-ghost btn-sm" id="ai-chat-close">${t('Schließen')}</button>`
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
    return el;
  };

  const HISTORY_TURNS = 6;
  const historyBySource = new Map();

  const renderHistory = (sourceId) => {
    log.innerHTML = '';
    const msgs = historyBySource.get(sourceId) || [];
    msgs.forEach(m => append(m.role, m.content));
  };

  const recordMessage = (sourceId, role, content, pdfName) => {
    if (!sourceId) return;
    if (!historyBySource.has(sourceId)) historyBySource.set(sourceId, []);
    historyBySource.get(sourceId).push({ role, content });
    appendMessage(sourceId, role, content, pdfName).catch(() => {});
  };

  const historyForRequest = (sourceId) => {
    const msgs = historyBySource.get(sourceId) || [];
    return msgs.slice(-HISTORY_TURNS * 2);
  };

  const loadAndRenderHistory = async (sourceId) => {
    if (!sourceId) return;
    if (historyBySource.has(sourceId)) {
      renderHistory(sourceId);
      return;
    }
    historyBySource.set(sourceId, []);
    try {
      const rows = await loadHistory(sourceId);
      historyBySource.set(sourceId, rows.map(r => ({ role: r.role, content: r.content })));
    } catch {}
    renderHistory(sourceId);
    if (!historyBySource.get(sourceId).length) {
      append('assistant', 'Select a PDF source and ask your question.');
    }
  };

  const PDF_TEXT_LIMIT = 40000;
  const PDFJS_WORKER_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
  const pdfTextCache = new Map();

  const waitForPdfJs = async () => {
    if (window.pdfjsLib) return window.pdfjsLib;
    for (let i = 0; i < 50; i++) {
      await new Promise(r => setTimeout(r, 100));
      if (window.pdfjsLib) return window.pdfjsLib;
    }
    throw new Error('PDF.js failed to load');
  };

  const extractPdfText = async (dataUrl) => {
    if (!dataUrl) throw new Error('PDF has no data');
    const pdfjs = await waitForPdfJs();
    if (!pdfjs.GlobalWorkerOptions.workerSrc) {
      pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
    }
    const comma = dataUrl.indexOf(',');
    const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const pdf = await pdfjs.getDocument({ data: bytes }).promise;
    let out = '';
    for (let p = 1; p <= pdf.numPages; p++) {
      if (out.length >= PDF_TEXT_LIMIT) break;
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      const pageText = content.items.map(i => i.str).join(' ');
      out += `\n--- Page ${p} ---\n${pageText}`;
    }
    return out.slice(0, PDF_TEXT_LIMIT);
  };

  const stripItem = (m, pdfText = '') => ({
    id: m?.id,
    subjectId: m?.subjectId,
    subjectName: m?.subjectName,
    kind: m?.kind,
    title: m?.title,
    note: m?.note,
    score: m?.score,
    maxScore: m?.maxScore,
    pdfAttachment: m?.pdfAttachment ? { name: m.pdfAttachment.name } : undefined,
    pdfText: pdfText || undefined
  });

  const withSelected = async () => {
    const selected = sources.find(s => s.id === srcSel.value);
    if (!selected) return { materials: [], mocks: [], sourceName: 'PDF', error: 'No source selected.' };
    let pdfText = pdfTextCache.get(selected.id) || '';
    let extractError = '';
    if (!pdfText) {
      try {
        pdfText = await extractPdfText(selected.item?.pdfAttachment?.dataUrl);
        if (pdfText.trim()) {
          pdfTextCache.set(selected.id, pdfText);
        } else {
          extractError = 'PDF contains no extractable text (image-only or empty).';
        }
      } catch (e) {
        extractError = `PDF text extraction failed: ${e?.message || e}`;
      }
    }
    const slim = stripItem(selected.item, pdfText);
    const payload = selected.type === 'material'
      ? { materials: [slim], mocks: [] }
      : { materials: [], mocks: [slim] };
    return { ...payload, sourceName: selected.fileName, error: extractError, pdfChars: pdfText.length };
  };

  const selectedModel = () => modelSel?.value || 'qwen/qwen3.6-flash';
  const selectedProvider = () => providerByModel.get(modelSel?.value) || 'openrouter';

  const parseAiResponse = async (res) => {
    const raw = await res.text();
    try {
      return { data: JSON.parse(raw), raw };
    } catch {
      return { data: null, raw };
    }
  };

  const TRANSIENT_ERROR_RE = /provider returned error|rate.?limit|timeout|429|502|503|504/i;

  const callAi = async (url, payload, onAttempt) => {
    for (let attempt = 1; attempt <= 2; attempt++) {
      if (onAttempt) onAttempt(attempt);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const { data, raw } = await parseAiResponse(res);
      if (res.ok && data?.ok) return { ok: true, text: data.text };
      const errMsg = data?.error || (raw ? `HTTP ${res.status}: ${raw.slice(0, 200)}` : `HTTP ${res.status}`);
      if (attempt === 1 && TRANSIENT_ERROR_RE.test(errMsg)) {
        await new Promise(r => setTimeout(r, 1500));
        continue;
      }
      return { ok: false, error: errMsg };
    }
    return { ok: false, error: 'Unknown error' };
  };

  const askNow = async () => {
    const q = input.value.trim();
    if (!q) return;
    const sourceId = srcSel.value;
    append('user', q);
    input.value = '';
    const placeholder = append('assistant', 'Reading PDF...');
    const selected = await withSelected();
    if (!selected.materials.length && !selected.mocks.length) {
      placeholder.textContent = 'Please select a PDF source first.';
      return;
    }
    if (selected.error) {
      placeholder.textContent = `Cannot answer: ${selected.error}`;
      return;
    }
    recordMessage(sourceId, 'user', q, selected.sourceName);
    placeholder.textContent = `Using source: ${selected.sourceName} (${selected.pdfChars} chars)\n...`;
    try {
      const result = await callAi('/api/ai/ask',
        {
          question: q,
          materials: selected.materials,
          mocks: selected.mocks,
          model: selectedModel(),
          provider: selectedProvider(),
          history: historyForRequest(sourceId).slice(0, -1)
        },
        attempt => { if (attempt > 1) placeholder.textContent = `Retrying (provider was busy)...`; }
      );
      if (result.ok) {
        placeholder.textContent = result.text;
        recordMessage(sourceId, 'assistant', result.text, selected.sourceName);
      } else {
        placeholder.textContent = formatAiError(result.error, 'ask');
      }
    } catch (e) {
      placeholder.textContent = formatAiError(String(e?.message || e), 'ask');
    }
  };

  const mockNow = async () => {
    const sourceId = srcSel.value;
    append('user', `Generate mock from selected PDF`);
    const placeholder = append('assistant', 'Reading PDF...');
    const selected = await withSelected();
    if (!selected.materials.length && !selected.mocks.length) {
      placeholder.textContent = 'Please select a PDF source first.';
      return;
    }
    if (selected.error) {
      placeholder.textContent = `Cannot generate mock: ${selected.error}`;
      return;
    }
    const subjectName = subjects.find(s => s.id === (selected.materials[0]?.subjectId || selected.mocks[0]?.subjectId))?.name || 'Subject';
    recordMessage(sourceId, 'user', `Generate mock from selected PDF`, selected.sourceName);
    placeholder.textContent = `Generating from ${selected.sourceName} (${selected.pdfChars} chars)...`;
    try {
      const result = await callAi('/api/ai/mock',
        {
          subjectName,
          difficulty: 'medium',
          materials: selected.materials,
          mocks: selected.mocks,
          model: selectedModel(),
          provider: selectedProvider(),
          history: historyForRequest(sourceId).slice(0, -1)
        },
        attempt => { if (attempt > 1) placeholder.textContent = `Retrying (provider was busy)...`; }
      );
      if (result.ok) {
        placeholder.textContent = result.text;
        recordMessage(sourceId, 'assistant', result.text, selected.sourceName);
      } else {
        placeholder.textContent = formatAiError(result.error, 'mock');
      }
    } catch (e) {
      placeholder.textContent = formatAiError(String(e?.message || e), 'mock');
    }
  };

  modal.el.querySelector('#ai-chat-ask')?.addEventListener('click', askNow);
  modal.el.querySelector('#ai-chat-mock')?.addEventListener('click', mockNow);
  modal.el.querySelector('#ai-chat-close')?.addEventListener('click', () => modal.close());
  modal.el.querySelector('#ai-chat-clear')?.addEventListener('click', async () => {
    const sourceId = srcSel.value;
    if (!sourceId) return;
    if (!confirm('Chat history for this PDF will be deleted. Continue?')) return;
    await clearHistory(sourceId).catch(() => {});
    historyBySource.set(sourceId, []);
    renderHistory(sourceId);
    append('assistant', 'History cleared.');
  });
  srcSel?.addEventListener('change', () => loadAndRenderHistory(srcSel.value));
  input?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); askNow(); } });

  if (sources.length) {
    loadAndRenderHistory(srcSel.value);
  } else {
    append('assistant', 'No PDF found. Upload PDFs in Materials or Mocks first.');
  }

  const providerByModel = new Map([['gemini-2.5-flash', 'gemini']]);

  const fallbackGemini = [
    { id: 'gemini-2.5-flash', provider: 'gemini' },
    { id: 'gemini-2.5-flash-lite', provider: 'gemini' },
    { id: 'gemini-2.5-pro', provider: 'gemini' }
  ];
  const fallbackOpenrouterFree = [
    { id: 'google/gemma-4-31b-it:free', provider: 'openrouter' },
    { id: 'google/gemma-4-26b-a4b-it:free', provider: 'openrouter' },
    { id: 'deepseek/deepseek-v4-flash:free', provider: 'openrouter' },
    { id: 'arcee-ai/trinity-large-thinking:free', provider: 'openrouter' },
    { id: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free', provider: 'openrouter' }
  ];
  const fallbackOpenrouterPaid = [
    { id: 'qwen/qwen3.6-flash', provider: 'openrouter' },
    { id: 'qwen/qwen3.5-flash', provider: 'openrouter' },
    { id: 'openai/gpt-5.4', provider: 'openrouter' },
    { id: 'openai/gpt-5.4-mini', provider: 'openrouter' },
    { id: 'openai/gpt-5.5', provider: 'openrouter' },
    { id: 'anthropic/claude-opus-4.7', provider: 'openrouter' },
    { id: 'anthropic/claude-opus-4.6-fast', provider: 'openrouter' },
    { id: 'google/gemini-3.1-flash-lite', provider: 'openrouter' },
    { id: 'mistralai/mistral-medium-3.5', provider: 'openrouter' },
    { id: 'deepseek/deepseek-v4-pro', provider: 'openrouter' },
    { id: 'deepseek/deepseek-v4-flash', provider: 'openrouter' }
  ];

  const renderGroups = (gemini, orFree, orPaid) => {
    if (!modelSel) return;
    providerByModel.clear();
    const opt = m => {
      providerByModel.set(m.id, m.provider || 'openrouter');
      return `<option value="${escapeHtml(m.id)}">${escapeHtml(m.id)}</option>`;
    };
    const geminiGroup = gemini.length
      ? `<optgroup label="Google Gemini (free, ~1500/day)">${gemini.map(opt).join('')}</optgroup>`
      : '';
    const orFreeGroup = orFree.length
      ? `<optgroup label="OpenRouter Free (shared 200/day)">${orFree.map(opt).join('')}</optgroup>`
      : '';
    const orPaidGroup = orPaid.length
      ? `<optgroup label="OpenRouter Paid (credits required)">${orPaid.map(opt).join('')}</optgroup>`
      : '';
    modelSel.innerHTML = geminiGroup + orFreeGroup + orPaidGroup;
  };

  fetch('/api/ai/models')
    .then(r => r.json())
    .then(data => {
      if (!data?.ok) return renderGroups(fallbackGemini, fallbackOpenrouterFree, fallbackOpenrouterPaid);
      const gemini = (data.gemini || []).map(m => ({ id: m.id, provider: 'gemini' }));
      const orFree = (data.openrouterFree || []).map(m => ({ id: m.id, provider: 'openrouter' }));
      const orPaid = (data.openrouterPaid || []).map(m => ({ id: m.id, provider: 'openrouter' }));
      renderGroups(gemini, orFree, orPaid);
    })
    .catch(() => renderGroups(fallbackGemini, fallbackOpenrouterFree, fallbackOpenrouterPaid));
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
  if (/GEMINI_API_KEY missing on server/i.test(text)) {
    return `${base}: Vercel is missing GEMINI_API_KEY. Get one at aistudio.google.com/apikey (free) and add it in Vercel env vars.`;
  }
  if (/not a valid model ID/i.test(text)) {
    return `${base}: the selected model ID is not valid for the current provider.`;
  }
  if (/requires more credits/i.test(text) || /credit/i.test(text)) {
    return `${base}: the OpenRouter account has insufficient credits or the token limit is too high.`;
  }
  if (/provider returned error/i.test(text)) {
    return `${base}: upstream provider is busy or rate-limited. Try again, switch model (paid qwen/qwen3.6-flash is most reliable), or wait a minute.`;
  }
  if (/rate.?limit|429/i.test(text)) {
    return `${base}: rate limit hit (free models are capped per minute/day). Switch to a paid model or wait.`;
  }
  if (/fetch/i.test(text) || /network/i.test(text)) {
    return `${base}: network error while contacting the AI endpoint.`;
  }
  return `${base}: ${text}`;
}
