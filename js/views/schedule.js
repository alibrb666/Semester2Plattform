import { State } from '../state.js';
import { uuid, getWeekMonday, getWeekDays, getDayName, isoDate, isSameDay,
  timeToMinutes, minutesToTime, snapMinutes, renderIcons, addDays } from '../util.js';
import { Modal } from '../components/modal.js';
import { Toast } from '../components/toast.js';

const HOUR_H  = 80;
const START_H = 6;
const END_H   = 22;
const TOTAL_H = END_H - START_H;
let _weekOffset = 0;
let _dragState   = null;
let _timeIndicator = null;
let _scheduleMinuteTimer = null;

const colorMap = { klr:'var(--subject-klr)', math:'var(--subject-math)', prog:'var(--subject-prog)', kbs:'var(--subject-kbs)' };

function timeToTop(timeStr) {
  const mins = timeToMinutes(timeStr);
  return (mins - START_H * 60) * (HOUR_H / 60);
}

function topToTime(px) {
  const mins = Math.round((px / (HOUR_H / 60)) + START_H * 60);
  return minutesToTime(snapMinutes(mins));
}

function blockHeight(start, end) {
  return (timeToMinutes(end) - timeToMinutes(start)) * (HOUR_H / 60);
}

function dayIndexToKey(i) {
  return ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'][i];
}
function dayKeyToIndex(key) {
  return ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].indexOf(key);
}

export function renderSchedule(container) {
  if (_scheduleMinuteTimer) {
    clearInterval(_scheduleMinuteTimer);
    _scheduleMinuteTimer = null;
  }
  const subjects = State.getSubjects();
  const weekDays = getWeekDays(addDays(getWeekMonday(), _weekOffset * 7));
  const todayIdx = weekDays.findIndex(d => isSameDay(d, new Date()));

  const dayNames = weekDays.map(d => getDayName(d,'short').toUpperCase());
  const dayNums  = weekDays.map(d => d.getDate());

  container.innerHTML = `
    <div class="schedule-view">
      <div class="schedule-header">
        <div class="view-title">Stundenplan</div>
        <div class="schedule-week-nav">
          <button class="btn btn-secondary btn-sm" id="btn-week-prev">
            <i data-lucide="chevron-left"></i>
          </button>
          <span class="schedule-week-label">${weekLabel(weekDays)}</span>
          <button class="btn btn-secondary btn-sm" id="btn-week-next">
            <i data-lucide="chevron-right"></i>
          </button>
          ${_weekOffset !== 0 ? `<button class="btn btn-ghost btn-sm" id="btn-week-today">Diese Woche</button>` : ''}
        </div>
        <button class="btn btn-primary btn-sm" id="btn-add-block">
          <i data-lucide="plus"></i> Lernblock
        </button>
      </div>

      <div class="schedule-day-headers">
        <div style="width:56px"></div>
        ${dayNames.map((n,i) => `
          <div class="schedule-day-header${i === todayIdx ? ' today' : ''}">
            <span>${n}</span>
            <span class="day-num">${dayNums[i]}</span>
          </div>`).join('')}
      </div>

      <div class="schedule-grid-wrap" id="schedule-wrap">
        <div class="schedule-grid" id="schedule-grid">
          <div class="schedule-time-col">
            ${buildTimeAxis()}
          </div>
          ${weekDays.map((d, di) => `
            <div class="schedule-day-col${di===todayIdx?' today':''}" data-day-index="${di}" data-day-date="${isoDate(d)}">
              ${buildHourLines()}
            </div>`).join('')}
        </div>
      </div>
    </div>`;

  renderIcons(container);
  _placeBlocks(container, weekDays);
  _updateTimeIndicator(container, todayIdx);
  _scheduleMinuteTimer = setInterval(() => _updateTimeIndicator(container, todayIdx), 60000);
  _bindEvents(container, weekDays, subjects);
}

function weekLabel(days) {
  const first = days[0], last = days[6];
  const fStr  = first.toLocaleDateString('de-DE', { day:'numeric', month:'short' });
  const lStr  = last.toLocaleDateString('de-DE', { day:'numeric', month:'short', year:'numeric' });
  return `${fStr} – ${lStr}`;
}

function buildTimeAxis() {
  let html = '';
  for (let h = START_H; h < END_H; h++) {
    html += `<div class="schedule-time-slot" style="height:${HOUR_H}px"><span>${String(h).padStart(2,'0')}:00</span></div>`;
  }
  return html;
}

function buildHourLines() {
  let html = '';
  for (let h = 0; h < TOTAL_H; h++) {
    html += `<div class="schedule-hour-line" style="top:${h*HOUR_H}px"></div>`;
    html += `<div class="schedule-hour-line half" style="top:${h*HOUR_H+HOUR_H/2}px"></div>`;
  }
  return html;
}

function _placeBlocks(container, weekDays) {
  const blocks = State.getBlocks();
  const wrap   = container.querySelector('#schedule-grid');
  if (!wrap) return;

  /* Remove existing blocks */
  wrap.querySelectorAll('.schedule-block').forEach(b => b.remove());

  blocks.forEach(block => {
    let dayIdx;
    if (block.date) {
      dayIdx = weekDays.findIndex(d => isoDate(d) === block.date.split('T')[0]);
    } else {
      dayIdx = dayKeyToIndex(block.day);
    }
    if (dayIdx < 0 || dayIdx >= 7) return;

    const col = wrap.querySelectorAll('.schedule-day-col')[dayIdx];
    if (!col) return;

    const top    = timeToTop(block.startTime);
    const height = blockHeight(block.startTime, block.endTime);
    const color  = colorMap[block.subjectId] || 'var(--accent)';
    const isConflict = checkConflict(blocks, block);

    const el = document.createElement('div');
    el.className = `schedule-block${block.locked ? ' locked' : ''}${isConflict ? ' conflict' : ''}`;
    el.dataset.blockId = block.id;
    el.style.cssText = `top:${top}px;height:${Math.max(24,height)}px;background:${color}22;color:${color};border:1px solid ${color}44`;
    el.innerHTML = `
      <div class="schedule-block-label">${block.label || ''}</div>
      <div class="schedule-block-time">${block.startTime}–${block.endTime}</div>
      ${!block.locked ? '<div class="block-resize-handle" data-role="resize"></div>' : ''}`;
    col.appendChild(el);
  });
}

function checkConflict(blocks, block) {
  const startA = timeToMinutes(block.startTime);
  const endA   = timeToMinutes(block.endTime);
  return blocks.some(b => {
    if (b.id === block.id) return false;
    const sameDay = block.date ? b.date === block.date : b.day === block.day;
    if (!sameDay) return false;
    const startB = timeToMinutes(b.startTime);
    const endB   = timeToMinutes(b.endTime);
    return startA < endB && endA > startB;
  });
}

function _updateTimeIndicator(container, todayIdx) {
  const old = container.querySelector('.time-indicator');
  old?.remove();
  if (todayIdx < 0) return;

  const now    = new Date();
  const mins   = now.getHours() * 60 + now.getMinutes();
  if (mins < START_H*60 || mins > END_H*60) return;

  const top  = (mins - START_H*60) * (HOUR_H/60);
  const col  = container.querySelectorAll('.schedule-day-col')[todayIdx];
  if (!col) return;

  const ind = document.createElement('div');
  ind.className = 'time-indicator';
  ind.style.top = `${top}px`;
  col.appendChild(ind);
}

function _bindEvents(container, weekDays, subjects) {
  container.querySelector('#btn-week-prev')?.addEventListener('click', () => { _weekOffset--; renderSchedule(container); });
  container.querySelector('#btn-week-next')?.addEventListener('click', () => { _weekOffset++; renderSchedule(container); });
  container.querySelector('#btn-week-today')?.addEventListener('click', () => { _weekOffset = 0; renderSchedule(container); });
  container.querySelector('#btn-add-block')?.addEventListener('click', () => openBlockModal(null, subjects, weekDays, container));

  /* Click on existing block */
  container.addEventListener('click', e => {
    const block = e.target.closest('.schedule-block');
    if (!block || e.target.closest('[data-role="resize"]')) return;
    const id = block.dataset.blockId;
    const data = State.getBlocks().find(b => b.id === id);
    if (data) openBlockModal(data, subjects, weekDays, container);
  });

  /* Drag to move */
  container.addEventListener('mousedown', e => {
    const block = e.target.closest('.schedule-block:not(.locked)');
    if (!block || e.target.closest('[data-role="resize"]')) return;
    e.preventDefault();
    const id   = block.dataset.blockId;
    const data = State.getBlocks().find(b => b.id === id);
    if (!data) return;
    _dragState = { id, startY: e.clientY, origStart: data.startTime, origEnd: data.endTime, type:'move' };
    block.classList.add('dragging');
  });

  /* Drag to resize */
  container.addEventListener('mousedown', e => {
    const handle = e.target.closest('[data-role="resize"]');
    if (!handle) return;
    e.preventDefault();
    const block = handle.closest('.schedule-block');
    const id    = block.dataset.blockId;
    const data  = State.getBlocks().find(b => b.id === id);
    if (!data || data.locked) return;
    _dragState = { id, startY: e.clientY, origStart: data.startTime, origEnd: data.endTime, type:'resize' };
    block.classList.add('dragging');
  });

  document.addEventListener('mousemove', e => {
    if (!_dragState) return;
    const data = State.getBlocks().find(b => b.id === _dragState.id);
    if (!data) return;
    const deltaMin = Math.round((e.clientY - _dragState.startY) / (HOUR_H/60) / 15) * 15;
    if (_dragState.type === 'move') {
      const newStart = snapMinutes(timeToMinutes(_dragState.origStart) + deltaMin);
      const dur = timeToMinutes(_dragState.origEnd) - timeToMinutes(_dragState.origStart);
      const newEnd = newStart + dur;
      if (newStart >= START_H*60 && newEnd <= END_H*60) {
        State.updateBlock(_dragState.id, { startTime: minutesToTime(newStart), endTime: minutesToTime(newEnd) });
      }
    } else {
      const newEnd = snapMinutes(timeToMinutes(_dragState.origEnd) + deltaMin);
      const minEnd = timeToMinutes(_dragState.origStart) + 15;
      if (newEnd > minEnd && newEnd <= END_H*60) {
        State.updateBlock(_dragState.id, { endTime: minutesToTime(newEnd) });
      }
    }
    _placeBlocks(container, weekDays);
  });

  document.addEventListener('mouseup', () => {
    if (!_dragState) return;
    container.querySelectorAll('.schedule-block.dragging').forEach(b => b.classList.remove('dragging'));
    _dragState = null;
  });

  /* Click on empty col to add block */
  container.querySelectorAll('.schedule-day-col').forEach((col, di) => {
    col.addEventListener('dblclick', e => {
      if (e.target.closest('.schedule-block')) return;
      const rect = col.getBoundingClientRect();
      const relY = e.clientY - rect.top + col.closest('.schedule-grid-wrap').scrollTop;
      const startMins = snapMinutes(relY / (HOUR_H/60) + START_H*60);
      const endMins   = startMins + 90;
      const prefill = {
        startTime: minutesToTime(Math.max(START_H*60, Math.min(startMins, END_H*60-90))),
        endTime:   minutesToTime(Math.min(END_H*60, endMins)),
        date: isoDate(weekDays[di])
      };
      openBlockModal(prefill, subjects, weekDays, container, true);
    });
  });
}

function openBlockModal(block, subjects, weekDays, container, isNew = !block?.id) {
  const readonly = block?.locked;
  const body = `
    <div class="field">
      <label for="blk-subject">Fach</label>
      <select class="select" id="blk-subject" ${readonly?'disabled':''}>
        ${subjects.map(s => `<option value="${s.id}"${block?.subjectId===s.id?' selected':''}>${s.name}</option>`).join('')}
      </select>
    </div>
    <div class="field">
      <label for="blk-label">Bezeichnung</label>
      <input class="input" id="blk-label" type="text" value="${block?.label||''}" placeholder="z.B. Lernblock" ${readonly?'readonly':''} />
    </div>
    <div class="field-row">
      <div class="field">
        <label for="blk-start">Start</label>
        <input class="input" id="blk-start" type="time" value="${block?.startTime||'09:00'}" ${readonly?'readonly':''} />
      </div>
      <div class="field">
        <label for="blk-end">Ende</label>
        <input class="input" id="blk-end" type="time" value="${block?.endTime||'11:00'}" ${readonly?'readonly':''} />
      </div>
    </div>
    ${!block?.date ? `<div class="field">
      <label for="blk-day">Tag</label>
      <select class="select" id="blk-day" ${readonly?'disabled':''}>
        ${['monday','tuesday','wednesday','thursday','friday','saturday','sunday']
          .map((d,i) => `<option value="${d}"${block?.day===d?' selected':''}>${['Mo','Di','Mi','Do','Fr','Sa','So'][i]}</option>`).join('')}
      </select>
    </div>` : ''}
    ${readonly ? '<div class="badge badge-muted" style="display:inline-flex">Vorlesung (nicht bearbeitbar)</div>' : ''}`;

  const footer = readonly ? '' : `
    ${!isNew ? `<button class="btn btn-danger btn-sm" id="blk-delete">Löschen</button>` : ''}
    <button class="btn btn-ghost btn-sm" id="blk-cancel">Abbrechen</button>
    <button class="btn btn-primary btn-sm" id="blk-save">Speichern</button>`;

  const modal = Modal.open({
    title: isNew ? 'Lernblock hinzufügen' : 'Lernblock bearbeiten',
    body,
    footer
  });
  renderIcons(modal.el);

  modal.el.querySelector('#blk-cancel')?.addEventListener('click', () => modal.close());
  modal.el.querySelector('#blk-delete')?.addEventListener('click', () => {
    State.removeBlock(block.id);
    _placeBlocks(container, weekDays);
    modal.close();
    Toast.success('Lernblock gelöscht');
  });
  modal.el.querySelector('#blk-save')?.addEventListener('click', () => {
    const subjectId  = modal.el.querySelector('#blk-subject')?.value;
    const label      = modal.el.querySelector('#blk-label')?.value.trim();
    const startTime  = modal.el.querySelector('#blk-start')?.value;
    const endTime    = modal.el.querySelector('#blk-end')?.value;
    const dayEl      = modal.el.querySelector('#blk-day');
    if (!startTime || !endTime || startTime >= endTime) {
      Toast.error('Ungültige Zeit', 'Endzeit muss nach Startzeit liegen.');
      return;
    }
    if (isNew) {
      const newBlock = {
        id: uuid(), subjectId, label, startTime, endTime, type:'study', locked:false,
        ...(block?.date ? { date: block.date } : { day: dayEl?.value || 'monday' })
      };
      State.addBlock(newBlock);
      Toast.success('Lernblock gespeichert');
    } else {
      State.updateBlock(block.id, { subjectId, label, startTime, endTime });
      Toast.success('Lernblock aktualisiert');
    }
    _placeBlocks(container, weekDays);
    modal.close();
  });
}
