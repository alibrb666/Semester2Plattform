import { State } from '../state.js';
import { uuid, formatDateShort, renderIcons } from '../util.js';
import { Modal } from '../components/modal.js';
import { Toast } from '../components/toast.js';
import { t, translateDom } from '../i18n.js';

let _charts = [];

function destroyCharts() {
  _charts.forEach(c => { try { c.destroy(); } catch {} });
  _charts = [];
}

export function renderMocks(container) {
  destroyCharts();
  const subjects = State.getSubjects();

  container.innerHTML = `
    <div class="view">
      <div class="view-header">
        <div><div class="view-title">${t('Probeklausuren')}</div>
          <div class="view-sub">${t('Tracke deinen Fortschritt in allen Fächern')}</div>
        </div>
        <button class="btn btn-primary btn-sm" id="btn-add-mock">
          <i data-lucide="plus"></i> ${t('Mock eintragen')}
        </button>
      </div>
      <div class="mocks-layout" id="mocks-layout"></div>
    </div>`;

  renderIcons(container);
  translateDom(container);
  renderAll(container, subjects);

  container.querySelector('#btn-add-mock')?.addEventListener('click', () => openAddModal(subjects, () => renderAll(container, subjects)));
  document.addEventListener('mocks:new', () => openAddModal(subjects, () => renderAll(container, subjects)), { once:true });
}

function renderAll(container, subjects) {
  destroyCharts();
  const allMocks = State.getMocks();
  const layout   = container.querySelector('#mocks-layout');
  if (!layout) return;

  if (!allMocks.length && !subjects.some(s => allMocks.some(m => m.subjectId === s.id))) {
    layout.innerHTML = `<div class="empty-state">
      <i data-lucide="file-check-2" style="width:48px;height:48px"></i>
      <div class="empty-title">${t('noMocksYet')}</div>
      <div class="empty-sub">${t('addFirstMockHint')}</div>
      <button class="btn btn-primary btn-sm" onclick="this.dispatchEvent(new CustomEvent('mocks:new',{bubbles:true}))">${t('Mock eintragen')}</button>
    </div>`;
    return;
  }

  layout.innerHTML = subjects.map(s => {
    const mocks = allMocks.filter(m => m.subjectId === s.id).sort((a,b) => new Date(a.date)-new Date(b.date));
    return `<div class="mocks-subject-section" id="mock-section-${s.id}">
      <div class="mocks-subject-header">
        <div class="mocks-subject-name" style="color:var(--subject-${s.id})">${s.name}</div>
        <div class="mocks-count">${mocks.length} / 5 ${t('Mocks')}</div>
      </div>
      ${mocks.length ? `<div class="mocks-content">
        <div class="card" style="padding:12px">
          <div class="mocks-chart-wrap"><canvas id="mock-chart-${s.id}"></canvas></div>
        </div>
        <div class="card" style="padding:0;overflow:hidden">
          <div class="mock-list" id="mock-list-${s.id}">
            ${mocks.map((m,i) => buildMockItem(m,i,s)).join('')}
          </div>
        </div>
      </div>` : `<div class="card" style="padding:24px;text-align:center;color:var(--text-tertiary);font-size:13px">
        ${t('noMocksSubject')} <button class="btn btn-ghost btn-sm" style="margin-left:8px" data-add-mock="${s.id}">${t('Eintragen')}</button>
      </div>`}
    </div>`;
  }).join('');

  renderIcons(layout);
  subjects.forEach(s => {
    const mocks = allMocks.filter(m => m.subjectId === s.id).sort((a,b) => new Date(a.date)-new Date(b.date));
    if (mocks.length) buildMockChart(s, mocks);
  });

  layout.querySelectorAll('.mock-item').forEach(item => {
    item.addEventListener('click', () => {
      const mock = allMocks.find(m => m.id === item.dataset.mockId);
      if (mock) openDetailModal(mock, subjects, () => renderAll(container, subjects));
    });
  });
  layout.querySelectorAll('[data-mock-pdf]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const mock = allMocks.find(m => m.id === btn.dataset.mockPdf);
      if (!mock?.pdfAttachment?.dataUrl) return;
      Modal.open({
        title: mock.pdfAttachment.name || 'PDF',
        size: 'lg',
        body: `<iframe src="${mock.pdfAttachment.dataUrl}" style="width:100%;height:70vh;border:1px solid var(--border);border-radius:10px"></iframe>`
      });
    });
  });
  layout.querySelectorAll('[data-add-mock]').forEach(btn => {
    btn.addEventListener('click', () => openAddModal(subjects, () => renderAll(container, subjects), btn.dataset.addMock));
  });
}

function buildMockItem(mock, i, subject) {
  const pct = Math.round(mock.score / mock.maxScore * 100);
  const grade = pct >= 92 ? '1.0' : pct >= 81 ? '2.0' : pct >= 67 ? '3.0' : pct >= 50 ? '4.0' : '5.0';
  return `<div class="mock-item" data-mock-id="${mock.id}" role="button" tabindex="0" style="border-radius:0;border-left:none;border-right:none;border-top:none">
    <div class="mock-num">#${i+1}</div>
    <div class="mock-info">
      <div class="mock-pct" style="color:var(--subject-${subject.id})">${pct}% · ${t('grade')} ~${grade}</div>
      <div class="mock-date">${formatDateShort(mock.date)}</div>
      ${mock.note ? `<div class="mock-note">${mock.note}</div>` : ''}
    </div>
    <div class="mock-score-big">
      ${mock.score}<span style="font-size:11px;color:var(--text-tertiary)">/${mock.maxScore}</span>
      <button class="btn btn-ghost btn-sm" type="button" data-mock-pdf="${mock.id}" style="margin-top:6px" ${mock.pdfAttachment?.dataUrl ? '' : 'disabled'}>PDF</button>
    </div>
  </div>`;
}

function buildMockChart(subject, mocks) {
  const canvas = document.getElementById(`mock-chart-${subject.id}`);
  if (!canvas || !window.Chart) return;
  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  const color  = isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)';
  const grid   = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const subColor = { klr:'#10B981', math:'#8B5CF6', prog:'#06B6D4', kbs:'#F59E0B' }[subject.id] || '#8B5CF6';

  const labels = mocks.map((_,i) => `${t('Mock')} ${i+1}`);
  const data   = mocks.map(m => Math.round(m.score/m.maxScore*100));
  const maxScore = mocks[0]?.maxScore || 100;

  const c = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label:t('resultPct'), data, borderColor: subColor, backgroundColor: subColor+'22',
          fill:true, tension:0.4, pointRadius:5, pointBackgroundColor:subColor },
        { label:t('target92'), data: labels.map(()=>92), borderColor:'rgba(255,255,255,0.2)',
          borderDash:[5,5], pointRadius:0, fill:false }
      ]
    },
    options: {
      animation: { duration:800 },
      plugins: { legend:{ labels:{ color, boxWidth:12 } } },
      scales: {
        x: { ticks:{color}, grid:{color:grid} },
        y: { min:0, max:100, ticks:{color, callback:v=>`${v}%`}, grid:{color:grid} }
      },
      responsive:true, maintainAspectRatio:false
    }
  });
  _charts.push(c);
}

function openAddModal(subjects, onSave, prefillSubject) {
  const body = `
    <div class="field">
      <label for="am-subject">${t('Fach')}</label>
      <select class="select" id="am-subject">
        ${subjects.map(s=>`<option value="${s.id}"${s.id===prefillSubject?' selected':''}>${s.name}</option>`).join('')}
      </select>
    </div>
    <div class="field-row">
      <div class="field">
        <label for="am-score">${t('earnedPoints')}</label>
        <input class="input" id="am-score" type="number" min="0" placeholder="87" />
      </div>
      <div class="field">
        <label for="am-max">${t('maxPoints')}</label>
        <input class="input" id="am-max" type="number" min="1" value="100" />
      </div>
    </div>
    <div class="field">
      <label for="am-date">${t('Datum')}</label>
      <input class="input" id="am-date" type="date" value="${new Date().toISOString().split('T')[0]}" />
    </div>
    <div class="field">
      <label for="am-note">${t('Notiz')}</label>
      <input class="input" id="am-note" type="text" placeholder="${t('Optional')}" />
    </div>
    <div class="field">
      <label for="am-pdf">PDF</label>
      <input class="input" id="am-pdf" type="file" accept="application/pdf" />
    </div>`;

  const modal = Modal.open({
    title: t('Mock eintragen'),
    body,
    footer:`<button class="btn btn-ghost" id="am-cancel">${t('Abbrechen')}</button>
            <button class="btn btn-primary" id="am-save">${t('Speichern')}</button>`
  });
  renderIcons(modal.el);

  modal.el.querySelector('#am-cancel')?.addEventListener('click', () => modal.close());
  modal.el.querySelector('#am-save')?.addEventListener('click', () => {
    const score = parseFloat(modal.el.querySelector('#am-score')?.value);
    const max   = parseFloat(modal.el.querySelector('#am-max')?.value) || 100;
    if (isNaN(score)) { modal.el.querySelector('#am-score')?.focus(); return; }
    const pdfFile = modal.el.querySelector('#am-pdf')?.files?.[0] || null;
    const createMock = pdfAttachment => ({
      id: uuid(),
      subjectId: modal.el.querySelector('#am-subject')?.value,
      date: new Date(modal.el.querySelector('#am-date')?.value || Date.now()).toISOString(),
      score, maxScore: max,
      note: modal.el.querySelector('#am-note')?.value.trim(),
      pdfAttachment
    });
    const finish = pdfAttachment => {
      State.addMock(createMock(pdfAttachment));
      modal.close();
      Toast.success(t('Mock gespeichert'), `${Math.round(score/max*100)}%`);
      onSave?.();
    };
    if (!pdfFile) {
      finish(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => finish({ name: pdfFile.name, dataUrl: String(reader.result || '') });
    reader.onerror = () => finish(null);
    reader.readAsDataURL(pdfFile);
  });
}

function openDetailModal(mock, subjects, onSave) {
  const sub = subjects.find(s => s.id === mock.subjectId);
  const pct = Math.round(mock.score/mock.maxScore*100);
  const modal = Modal.open({
    title: `${sub?.name} – ${t('Mock')}`,
    body:`<div style="text-align:center;padding:8px 0 16px">
      <div style="font-family:var(--font-mono);font-size:48px;font-weight:700;color:var(--subject-${mock.subjectId})">${pct}%</div>
      <div style="font-size:14px;color:var(--text-secondary)">${mock.score} / ${mock.maxScore} ${t('Punkte')} · ${formatDateShort(mock.date)}</div>
    </div>
    ${mock.note ? `<div class="detail-description">${mock.note}</div>` : ''}
    ${mock.pdfAttachment?.dataUrl ? `<div style="margin-top:12px"><button class="btn btn-secondary btn-sm" id="md-preview-pdf">PDF Vorschau</button></div>` : ''}`,
    footer:`<button class="btn btn-danger btn-sm" id="md-del">${t('Löschen')}</button>
            <button class="btn btn-ghost btn-sm" id="md-close">${t('Schließen')}</button>`
  });
  modal.el.querySelector('#md-close')?.addEventListener('click', () => modal.close());
  modal.el.querySelector('#md-preview-pdf')?.addEventListener('click', () => {
    Modal.open({
      title: mock.pdfAttachment?.name || 'PDF',
      size: 'lg',
      body: `<iframe src="${mock.pdfAttachment?.dataUrl || ''}" style="width:100%;height:70vh;border:1px solid var(--border);border-radius:10px"></iframe>`
    });
  });
  modal.el.querySelector('#md-del')?.addEventListener('click', () => {
    State.removeMock(mock.id);
    modal.close();
    Toast.success(t('Mock gelöscht'));
    onSave?.();
  });
}
