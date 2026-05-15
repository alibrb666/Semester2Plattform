import { State } from '../state.js';
import { Storage } from '../storage.js';
import { uuid, getWeekMonday, getWeekDays, getDayName, isoDate, isSameDay,
  timeToMinutes, minutesToTime, snapMinutes, renderIcons, addDays, endOfDay } from '../util.js';
import { Modal } from '../components/modal.js';
import { Toast } from '../components/toast.js';
import { SessionTracker } from '../components/sessionTracker.js';
import * as scheduleSync from '../scheduleSync.js';

const HOUR_H     = 80;
const DAY_HOUR_H = 48;
const START_H = 6;
const END_H   = 22;
const TOTAL_H = END_H - START_H;

let _weekOffset = 0;
let _dragState   = null;
let _scheduleMinuteTimer = null;
let _viewMode = 'week';   // 'week' | 'day'
let _dayDate  = null;     // ISO string for day view
let _dayStartH = START_H; // dynamic compact range for day view
let _dayEndH   = END_H;
let _currentHourH = HOUR_H;

function getDayTimeRange(events, blocks) {
  if (!events.length && !blocks.length) return { start: 8, end: 18 };
  const allItems = [...events, ...blocks];
  const starts = allItems.map(e => {
    if (e.startsAt) { const d = new Date(e.startsAt); return d.getHours() + d.getMinutes() / 60; }
    if (e.startTime) return timeToMinutes(e.startTime) / 60;
    return 8;
  });
  const ends = allItems.map(e => {
    if (e.endsAt) { const d = new Date(e.endsAt); return d.getHours() + d.getMinutes() / 60; }
    if (e.endTime) return timeToMinutes(e.endTime) / 60;
    return 18;
  });
  const minH = Math.floor(Math.min(...starts)) - 1;
  const maxH = Math.ceil(Math.max(...ends)) + 1;
  return { start: Math.max(6, minH), end: Math.min(22, maxH) };
}

function getColor(subjectId) {
  if (!subjectId) return 'rgba(148,163,184,0.55)';
  const subj = State.getSubjects().find(s => s.id === subjectId);
  return subj?.colorHex || `var(--subject-${subjectId})`;
}

/* ── Time helpers ──────────────────────────────────────── */
function timeToTop(timeStr, hourH = HOUR_H)        { return (timeToMinutes(timeStr) - START_H * 60) * (hourH / 60); }
function timeToTopDay(timeStr, hourH = DAY_HOUR_H) { return (timeToMinutes(timeStr) - _dayStartH * 60) * (hourH / 60); }
function topToTime(px, hourH = HOUR_H)             { return minutesToTime(snapMinutes(Math.round(px / (hourH/60)) + START_H * 60)); }
function topToTimeDay(px, hourH = DAY_HOUR_H)      { return minutesToTime(snapMinutes(Math.round(px / (hourH/60)) + _dayStartH * 60)); }
function blockHeight(s, e, hourH = HOUR_H)         { return (timeToMinutes(e) - timeToMinutes(s)) * (hourH / 60); }
function dateToHm(iso)      { const d = new Date(iso); return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; }
function getDayDate()       { if (!_dayDate) _dayDate = new Date().toISOString().slice(0, 10); return _dayDate; }

function blockDateStrForWeek(block, weekDays) {
  if (block.date) return block.date.split('T')[0];
  const di = dayKeyToIndex(block.day);
  if (di < 0 || di > 6) return null;
  return isoDate(weekDays[di]);
}

function icsOverlapsBlock(block, weekDays, icsEvents) {
  const dateStr = blockDateStrForWeek(block, weekDays);
  if (!dateStr || !icsEvents?.length) return false;
  const b0 = timeToMinutes(block.startTime);
  const b1 = timeToMinutes(block.endTime);
  return icsEvents.some(ev => {
    if (ev.startsAt.slice(0, 10) !== dateStr) return false;
    const hm0 = timeToMinutes(dateToHm(ev.startsAt));
    const hm1 = timeToMinutes(dateToHm(ev.endsAt));
    return b0 < hm1 && b1 > hm0;
  });
}

function dayIndexToKey(i) { return ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'][i]; }
function dayKeyToIndex(key) { return ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].indexOf(key); }
function jsDateToDayKey(d)  { return dayIndexToKey((d.getDay() + 6) % 7); }

/* ── Entry point ───────────────────────────────────────── */
export function renderSchedule(container) {
  if (_scheduleMinuteTimer) { clearInterval(_scheduleMinuteTimer); _scheduleMinuteTimer = null; }
  _viewMode = State.getSettings().scheduleViewMode || 'week';

  if (_viewMode === 'day') {
    _renderDayView(container);
  } else {
    _renderWeekView(container);
  }
}

/* ══════════════════════════════════════════════════════════
   WEEK VIEW
══════════════════════════════════════════════════════════ */
function _renderWeekView(container) {
  _currentHourH = HOUR_H;
  const subjects = State.getSubjects();
  const weekDays = getWeekDays(addDays(getWeekMonday(), _weekOffset * 7));
  const todayIdx = weekDays.findIndex(d => isSameDay(d, new Date()));
  const dayNames = weekDays.map(d => getDayName(d,'short').toUpperCase());
  const dayNums  = weekDays.map(d => d.getDate());

  container.innerHTML = `
    <div class="schedule-view">
      <div class="schedule-header">
        <div class="view-title">Stundenplan</div>
        <div class="schedule-view-toggle">
          <button class="btn btn-sm btn-primary" id="btn-view-week">Woche</button>
          <button class="btn btn-sm btn-secondary" id="btn-view-day">Tag</button>
        </div>
        <div class="schedule-week-nav">
          <button class="btn btn-secondary btn-sm" id="btn-week-prev">
            <i data-lucide="chevron-left"></i>
          </button>
          <span class="schedule-week-label">${_weekLabel(weekDays)}</span>
          <button class="btn btn-secondary btn-sm" id="btn-week-next">
            <i data-lucide="chevron-right"></i>
          </button>
          ${_weekOffset !== 0 ? `<button class="btn btn-ghost btn-sm" id="btn-week-today">Diese Woche</button>` : ''}
        </div>
        <button class="btn btn-primary btn-sm" id="btn-add-block">
          <i data-lucide="plus"></i> Lernblock
        </button>
      </div>
      <div class="schedule-sync-bar" id="schedule-sync-bar" style="display:none"></div>

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
          <div class="schedule-time-col">${_buildTimeAxis()}</div>
          ${weekDays.map((d, di) => `
            <div class="schedule-day-col${di===todayIdx?' today':''}" data-day-index="${di}" data-day-date="${isoDate(d)}">
              ${_buildHourLines()}
            </div>`).join('')}
        </div>
      </div>
    </div>`;

  renderIcons(container);
  _placeBlocks(container, weekDays);
  _placeIcsEvents(container, weekDays);
  _updateScheduleSyncBar(container);
  _updateTimeIndicator(container, todayIdx);
  _scheduleMinuteTimer = setInterval(() => _updateTimeIndicator(container, todayIdx), 60000);
  _bindWeekEvents(container, weekDays, subjects);
}

/* ══════════════════════════════════════════════════════════
   DAY VIEW
══════════════════════════════════════════════════════════ */
function _renderDayView(container) {
  const dateObj  = new Date(getDayDate() + 'T12:00:00');
  const dateStr  = isoDate(dateObj);
  const isToday  = isSameDay(dateObj, new Date());
  const subjects = State.getSubjects();
  const dayLabel = dateObj.toLocaleDateString('de-DE', { weekday:'long', day:'numeric', month:'long', year:'numeric' });

  // Compute compact time range from today's events
  const dayKey    = jsDateToDayKey(dateObj);
  const dayBlocks = State.getBlocks().filter(b => b.date ? b.date.split('T')[0] === dateStr : b.day === dayKey);
  const prefs0    = State.get().schedulePrefs || {};
  const cache0    = scheduleSync.loadCache();
  const useIcs0   = (prefs0.source === 'ics-url' || prefs0.source === 'ics-file')
    && Array.isArray(cache0.events) && cache0.events.length > 0;
  const dayIcsEvs = useIcs0 ? (cache0.events || []).filter(ev => ev.startsAt.slice(0, 10) === dateStr) : [];
  const range = getDayTimeRange(dayIcsEvs, dayBlocks);
  _dayStartH    = range.start;
  _dayEndH      = range.end;
  _currentHourH = DAY_HOUR_H;
  const dayTotalH = _dayEndH - _dayStartH;

  container.innerHTML = `
    <div class="schedule-view">
      <div class="schedule-header">
        <div class="view-title">Stundenplan</div>
        <div class="schedule-view-toggle">
          <button class="btn btn-sm btn-secondary" id="btn-view-week">Woche</button>
          <button class="btn btn-sm btn-primary" id="btn-view-day">Tag</button>
        </div>
        <div class="schedule-week-nav">
          <button class="btn btn-secondary btn-sm" id="btn-day-prev">
            <i data-lucide="chevron-left"></i>
          </button>
          <span class="schedule-week-label">${dayLabel}</span>
          <button class="btn btn-secondary btn-sm" id="btn-day-next">
            <i data-lucide="chevron-right"></i>
          </button>
          ${!isToday ? `<button class="btn btn-ghost btn-sm" id="btn-day-today">Heute</button>` : ''}
        </div>
        <button class="btn btn-primary btn-sm" id="btn-add-block">
          <i data-lucide="plus"></i> Lernblock
        </button>
      </div>
      <div class="schedule-sync-bar" id="schedule-sync-bar" style="display:none"></div>

      <div class="schedule-grid-wrap" id="schedule-wrap">
        <div class="schedule-grid schedule-grid-day" id="schedule-grid">
          <div class="schedule-time-col">${_buildTimeAxis(_dayStartH, _dayEndH, DAY_HOUR_H)}</div>
          <div class="schedule-day-col day-view-col${isToday ? ' today' : ''}"
            data-day-date="${getDayDate()}">${_buildHourLines(dayTotalH, DAY_HOUR_H)}</div>
        </div>
      </div>
    </div>`;

  renderIcons(container);
  _placeBlocksDay(container, dateObj);
  _placeIcsEventsDay(container, dateObj);
  _placeDaySeparators(container.querySelector('.schedule-day-col'));
  _updateScheduleSyncBar(container);
  if (isToday) _updateTimeIndicator(container, 0, _dayStartH, _dayEndH, DAY_HOUR_H);
  _scheduleMinuteTimer = setInterval(() => {
    if (isToday) _updateTimeIndicator(container, 0, _dayStartH, _dayEndH, DAY_HOUR_H);
  }, 60000);
  _bindDayEvents(container, dateObj, subjects);
}

/* ── Shared builders ───────────────────────────────────── */
function _weekLabel(days) {
  const fStr = days[0].toLocaleDateString('de-DE', { day:'numeric', month:'short' });
  const lStr = days[6].toLocaleDateString('de-DE', { day:'numeric', month:'short', year:'numeric' });
  return `${fStr} – ${lStr}`;
}

function _buildTimeAxis(startH = START_H, endH = END_H, hourH = HOUR_H) {
  let html = '';
  for (let h = startH; h < endH; h++)
    html += `<div class="schedule-time-slot" style="height:${hourH}px"><span>${String(h).padStart(2,'0')}:00</span></div>`;
  return html;
}

function _buildHourLines(totalH = TOTAL_H, hourH = HOUR_H) {
  let html = '';
  for (let h = 0; h < totalH; h++) {
    html += `<div class="schedule-hour-line" style="top:${h*hourH}px"></div>`;
    html += `<div class="schedule-hour-line half" style="top:${h*hourH+hourH/2}px"></div>`;
  }
  return html;
}

/* ── Block placement (week) ────────────────────────────── */
function _placeBlocks(container, weekDays) {
  const blocks = State.getBlocks();
  const wrap   = container.querySelector('#schedule-grid');
  if (!wrap) return;

  const prefs  = State.get().schedulePrefs || {};
  const cache  = scheduleSync.loadCache();
  const useIcs = (prefs.source === 'ics-url' || prefs.source === 'ics-file')
    && Array.isArray(cache.events) && cache.events.length > 0;
  const weekIcs = useIcs
    ? scheduleSync.filterEventsForRange(cache.events, weekDays[0], endOfDay(weekDays[6]))
    : [];

  wrap.querySelectorAll('.schedule-block:not(.ics-sync)').forEach(b => b.remove());

  blocks.forEach(block => {
    if (useIcs && block.locked) return;
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
    const color  = getColor(block.subjectId);
    const icsHit = useIcs && !block.locked && icsOverlapsBlock(block, weekDays, weekIcs);

    const el = document.createElement('div');
    el.className = `schedule-block${block.locked ? ' locked' : ''}${icsHit ? ' conflict' : ''}`;
    el.dataset.blockId = block.id;
    el.style.cssText = `top:${top}px;height:${Math.max(24,height)}px;background:${color}22;color:${color};border:1px solid ${color}44`;
    el.innerHTML = `
      <div class="schedule-block-label">${block.label || ''}</div>
      <div class="schedule-block-time">${block.startTime}–${block.endTime}</div>
      ${!block.locked ? '<div class="block-resize-handle" data-role="resize"></div>' : ''}`;
    col.appendChild(el);
  });
}

function _placeIcsEvents(container, weekDays) {
  const prefs = State.get().schedulePrefs || {};
  const cache = scheduleSync.loadCache();
  const wrap  = container.querySelector('#schedule-grid');
  if (!wrap) return;
  wrap.querySelectorAll('.schedule-block.ics-sync').forEach(b => b.remove());
  if (prefs.source === 'manual' || !cache.events?.length) return;

  const overrides = scheduleSync.loadOverrides();
  const events = scheduleSync
    .filterEventsForRange(cache.events, weekDays[0], endOfDay(weekDays[6]))
    .map(e => scheduleSync.enrichEvent(e, overrides));

  events.forEach(ev => {
    const dayIdx = weekDays.findIndex(d => isoDate(d) === ev.startsAt.slice(0, 10));
    if (dayIdx < 0) return;
    const col = wrap.querySelectorAll('.schedule-day-col')[dayIdx];
    if (!col) return;
    const st = dateToHm(ev.startsAt);
    const en = dateToHm(ev.endsAt);
    const top = timeToTop(st);
    const height = Math.max(24, blockHeight(st, en));
    const color = getColor(ev.subjectId);

    const el = document.createElement('div');
    el.className = 'schedule-block ics-sync locked';
    el.dataset.icsId = ev.id;
    el.style.cssText = `top:${top}px;height:${height}px;background:${color}18;color:${color};border:1px solid ${color}55`;
    el.innerHTML = `
      <div class="schedule-block-label">${ev.title || 'Termin'}</div>
      <div class="schedule-block-time">${st}–${en}</div>
      ${ev.location ? `<div style="font-size:10px;opacity:.85">${ev.location}</div>` : ''}`;
    col.appendChild(el);
  });
}

/* ── Block placement (day) ─────────────────────────────── */
function _placeBlocksDay(container, dateObj) {
  const dateStr = isoDate(dateObj);
  const dayKey  = jsDateToDayKey(dateObj);
  const blocks  = State.getBlocks();
  const col     = container.querySelector('.schedule-day-col');
  if (!col) return;
  col.querySelectorAll('.schedule-block:not(.ics-sync)').forEach(b => b.remove());

  const prefs  = State.get().schedulePrefs || {};
  const cache  = scheduleSync.loadCache();
  const useIcs = (prefs.source === 'ics-url' || prefs.source === 'ics-file')
    && Array.isArray(cache.events) && cache.events.length > 0;

  blocks.forEach(block => {
    if (useIcs && block.locked) return;
    const isForDate = block.date
      ? block.date.split('T')[0] === dateStr
      : block.day === dayKey;
    if (!isForDate) return;

    const top    = timeToTopDay(block.startTime);
    const height = blockHeight(block.startTime, block.endTime, DAY_HOUR_H);
    const color  = getColor(block.subjectId);

    const el = document.createElement('div');
    el.className = `schedule-block day-view-block${block.locked ? ' locked' : ''}`;
    el.dataset.blockId = block.id;
    el.style.cssText = `top:${top}px;height:${Math.max(40,height)}px;background:${color}22;color:${color};border:1px solid ${color}44`;
    el.innerHTML = `
      <div class="schedule-block-label" style="white-space:normal;font-weight:600">${block.label || ''}</div>
      <div class="schedule-block-time" style="font-size:12px">${block.startTime} – ${block.endTime}</div>
      ${!block.locked ? '<div class="block-resize-handle" data-role="resize"></div>' : ''}`;
    col.appendChild(el);
  });
}

function _placeIcsEventsDay(container, dateObj) {
  const dateStr = isoDate(dateObj);
  const prefs   = State.get().schedulePrefs || {};
  const cache   = scheduleSync.loadCache();
  const col     = container.querySelector('.schedule-day-col');
  if (!col) return;
  col.querySelectorAll('.schedule-block.ics-sync').forEach(b => b.remove());
  if (prefs.source === 'manual' || !cache.events?.length) return;

  const overrides = scheduleSync.loadOverrides();
  const events = cache.events
    .filter(ev => ev.startsAt.slice(0, 10) === dateStr)
    .map(e => scheduleSync.enrichEvent(e, overrides));

  events.forEach(ev => {
    const st = dateToHm(ev.startsAt);
    const en = dateToHm(ev.endsAt);
    const top    = timeToTopDay(st);
    const height = Math.max(48, blockHeight(st, en, DAY_HOUR_H));
    const color  = getColor(ev.subjectId);

    const el = document.createElement('div');
    el.className = 'schedule-block ics-sync locked day-view-block';
    el.dataset.icsId = ev.id;
    el.style.cssText = `top:${top}px;height:${height}px;background:${color}18;color:${color};border:1px solid ${color}55;cursor:pointer`;
    el.innerHTML = `
      <div class="schedule-block-label" style="white-space:normal;font-weight:600;font-size:13px">${ev.title || 'Termin'}</div>
      <div class="schedule-block-time" style="font-size:12px;margin-top:2px">${st} – ${en}</div>
      ${ev.location ? `<div style="font-size:11px;opacity:.8;margin-top:2px">${ev.location}</div>` : ''}`;
    col.appendChild(el);
  });
}

/* ── Day gap separators ────────────────────────────────── */
function _placeDaySeparators(col) {
  if (!col) return;
  col.querySelectorAll('.day-gap-line').forEach(el => el.remove());
  const gapPx = 30 * (DAY_HOUR_H / 60); // 30 min threshold
  const items = [...col.querySelectorAll('.schedule-block')]
    .map(el => ({ top: parseFloat(el.style.top) || 0, height: parseFloat(el.style.height) || 0 }))
    .sort((a, b) => a.top - b.top);
  for (let i = 0; i < items.length - 1; i++) {
    const endOfCurrent  = items[i].top + items[i].height;
    const startOfNext   = items[i + 1].top;
    const gap = startOfNext - endOfCurrent;
    if (gap >= 0 && gap < gapPx) {
      const line = document.createElement('div');
      line.className = 'day-gap-line';
      line.style.top = `${endOfCurrent}px`;
      col.appendChild(line);
    }
  }
}

/* ── Sync bar ──────────────────────────────────────────── */
function _updateScheduleSyncBar(container) {
  const bar = container.querySelector('#schedule-sync-bar');
  if (!bar) return;
  const prefs = State.get().schedulePrefs || {};
  const cache = scheduleSync.loadCache();
  if (prefs.source === 'manual') {
    bar.innerHTML = `
      <span style="font-size:12px;color:var(--text-tertiary)">
        Manueller Modus — Vorlesungszeiten aus dem Lernplan vorausgefüllt.
        <a href="#settings" style="color:var(--accent)">Google Calendar verbinden →</a>
      </span>`;
    bar.style.display = 'flex';
    return;
  }
  bar.style.display = 'flex';
  const n = cache.events?.length ?? prefs.eventCount ?? 0;
  const t = prefs.lastSyncedAt
    ? new Date(prefs.lastSyncedAt).toLocaleString('de-DE', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })
    : '—';
  const err = prefs.lastError ? ' · <span style="color:var(--danger)">Fehler beim Sync</span>' : '';
  const srcLabel = prefs.source === 'ics-file' ? 'Datei' : 'Live';
  bar.innerHTML = `
    <span class="sync-dot" aria-hidden="true"></span>
    <span style="flex:1">${srcLabel} · ${n} Events · zuletzt ${t}${err}</span>
    <button type="button" class="btn btn-ghost btn-sm" id="sched-view-refresh">Aktualisieren</button>`;
  renderIcons(bar);

  bar.querySelector('#sched-view-refresh')?.addEventListener('click', async () => {
    const p2 = State.get().schedulePrefs || {};
    if (p2.source === 'ics-url' && p2.icsUrl?.trim()) {
      try {
        const txt = await scheduleSync.fetchIcsText(p2.icsUrl.trim());
        const evs = scheduleSync.parseIcsToEvents(txt, 'ics-url');
        scheduleSync.saveCache(evs, new Date().toISOString());
        State.patchSchedulePrefs({ lastSyncedAt: new Date().toISOString(), lastError: null, eventCount: evs.length });
        Storage.saveNow(State.get());
        Toast.success('Aktualisiert', `${evs.length} Termine`);
      } catch {
        State.patchSchedulePrefs({ lastError: 'SYNC' });
        Storage.saveNow(State.get());
        Toast.error('Sync fehlgeschlagen', 'CORS möglich — nutze Datei-Upload.');
      }
    } else {
      Toast.info('Kein Live-Kalender', 'Bitte in den Einstellungen eine ICS-URL verbinden.');
    }
    renderSchedule(container);
  });
}

/* ── Time indicator ────────────────────────────────────── */
function _updateTimeIndicator(container, todayIdx, startH = START_H, endH = END_H, hourH = HOUR_H) {
  container.querySelector('.time-indicator')?.remove();
  if (todayIdx < 0) return;
  const now  = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  if (mins < startH*60 || mins > endH*60) return;
  const top = (mins - startH*60) * (hourH/60);
  const col = container.querySelectorAll('.schedule-day-col')[todayIdx];
  if (!col) return;
  const ind = document.createElement('div');
  ind.className = 'time-indicator';
  ind.style.top = `${top}px`;
  col.appendChild(ind);
}

/* ══════════════════════════════════════════════════════════
   WEEK VIEW EVENTS
══════════════════════════════════════════════════════════ */
function _bindWeekEvents(container, weekDays, subjects) {
  // Toggle
  container.querySelector('#btn-view-week')?.addEventListener('click', () => {});
  container.querySelector('#btn-view-day')?.addEventListener('click', () => {
    State.updateSettings({ scheduleViewMode: 'day' });
    _dayDate = new Date().toISOString().slice(0, 10);
    renderSchedule(container);
  });

  // Week nav
  container.querySelector('#btn-week-prev')?.addEventListener('click', () => { _weekOffset--; renderSchedule(container); });
  container.querySelector('#btn-week-next')?.addEventListener('click', () => { _weekOffset++; renderSchedule(container); });
  container.querySelector('#btn-week-today')?.addEventListener('click', () => { _weekOffset = 0; renderSchedule(container); });
  container.querySelector('#btn-add-block')?.addEventListener('click', () => openBlockModal(null, subjects, weekDays, container));

  // Click on existing block / ICS event
  container.addEventListener('click', e => {
    const icsEl = e.target.closest('.schedule-block.ics-sync');
    if (icsEl?.dataset?.icsId) {
      openIcsSubjectModal(icsEl.dataset.icsId, subjects, container);
      return;
    }
    const block = e.target.closest('.schedule-block');
    if (!block || e.target.closest('[data-role="resize"]')) return;
    const id   = block.dataset.blockId;
    const data = State.getBlocks().find(b => b.id === id);
    if (data) openBlockModal(data, subjects, weekDays, container);
  });

  // Drag to move
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

  // Drag to resize
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
      if (newStart >= START_H*60 && newEnd <= END_H*60)
        State.updateBlock(_dragState.id, { startTime: minutesToTime(newStart), endTime: minutesToTime(newEnd) });
    } else {
      const newEnd = snapMinutes(timeToMinutes(_dragState.origEnd) + deltaMin);
      const minEnd = timeToMinutes(_dragState.origStart) + 15;
      if (newEnd > minEnd && newEnd <= END_H*60)
        State.updateBlock(_dragState.id, { endTime: minutesToTime(newEnd) });
    }
    _placeBlocks(container, weekDays);
    _placeIcsEvents(container, weekDays);
  });

  document.addEventListener('mouseup', () => {
    if (!_dragState) return;
    container.querySelectorAll('.schedule-block.dragging').forEach(b => b.classList.remove('dragging'));
    _dragState = null;
  });

  // Dblclick on empty col to add block
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

/* ══════════════════════════════════════════════════════════
   DAY VIEW EVENTS
══════════════════════════════════════════════════════════ */
function _bindDayEvents(container, dateObj, subjects) {
  // Toggle back to week
  container.querySelector('#btn-view-week')?.addEventListener('click', () => {
    State.updateSettings({ scheduleViewMode: 'week' });
    // Compute weekOffset for the week containing _dayDate
    const today   = getWeekMonday();
    const target  = getWeekMonday(dateObj);
    _weekOffset   = Math.round((target - today) / (7 * 86400000));
    renderSchedule(container);
  });
  container.querySelector('#btn-view-day')?.addEventListener('click', () => {});

  // Day navigation
  container.querySelector('#btn-day-prev')?.addEventListener('click', () => {
    const d = new Date(getDayDate() + 'T12:00:00');
    d.setDate(d.getDate() - 1);
    _dayDate = d.toISOString().slice(0, 10);
    renderSchedule(container);
  });
  container.querySelector('#btn-day-next')?.addEventListener('click', () => {
    const d = new Date(getDayDate() + 'T12:00:00');
    d.setDate(d.getDate() + 1);
    _dayDate = d.toISOString().slice(0, 10);
    renderSchedule(container);
  });
  container.querySelector('#btn-day-today')?.addEventListener('click', () => {
    _dayDate = new Date().toISOString().slice(0, 10);
    renderSchedule(container);
  });

  container.querySelector('#btn-add-block')?.addEventListener('click', () => {
    openBlockModal({ date: getDayDate() }, subjects, [dateObj], container, true);
  });

  // Click on ICS event → detail modal
  const col = container.querySelector('.schedule-day-col');
  col?.addEventListener('click', e => {
    const icsEl = e.target.closest('.schedule-block.ics-sync');
    if (icsEl?.dataset?.icsId) {
      openIcsDayDetailModal(icsEl.dataset.icsId, subjects, container);
      return;
    }
    const block = e.target.closest('.schedule-block');
    if (!block || e.target.closest('[data-role="resize"]')) return;
    const id   = block.dataset.blockId;
    const data = State.getBlocks().find(b => b.id === id);
    if (data) openBlockModal(data, subjects, [dateObj], container);
  });

  // Dblclick on empty col to add block
  col?.addEventListener('dblclick', e => {
    if (e.target.closest('.schedule-block')) return;
    const rect = col.getBoundingClientRect();
    const relY = e.clientY - rect.top + col.closest('.schedule-grid-wrap').scrollTop;
    const startMins = snapMinutes(relY / (DAY_HOUR_H/60) + _dayStartH*60);
    const endMins   = startMins + 90;
    const prefill = {
      startTime: minutesToTime(Math.max(_dayStartH*60, Math.min(startMins, _dayEndH*60-90))),
      endTime:   minutesToTime(Math.min(_dayEndH*60, endMins)),
      date: getDayDate()
    };
    openBlockModal(prefill, subjects, [dateObj], container, true);
  });
}

/* ══════════════════════════════════════════════════════════
   MODALS
══════════════════════════════════════════════════════════ */
function openIcsDayDetailModal(icsId, subjects, container) {
  const cache = scheduleSync.loadCache();
  const ev = (cache.events || []).find(x => x.id === icsId);
  if (!ev) return;

  const overrides  = scheduleSync.loadOverrides();
  const inferred   = scheduleSync.inferSubjectId(ev.title, ev.description);
  const subjectId  = overrides[icsId] || inferred || null;
  const subj       = subjects.find(s => s.id === subjectId);

  const startDate  = new Date(ev.startsAt);
  const endDate    = new Date(ev.endsAt);
  const durMs      = endDate - startDate;
  const durH       = Math.floor(durMs / 3600000);
  const durM       = Math.round((durMs % 3600000) / 60000);
  const durLabel   = durH > 0 ? (durM > 0 ? `${durH}h ${durM}m` : `${durH}h`) : `${durM}m`;
  const dateLabel  = startDate.toLocaleDateString('de-DE', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  const timeLabel  = `${dateToHm(ev.startsAt)} – ${dateToHm(ev.endsAt)} (${durLabel})`;

  const body = `
    <div style="display:flex;flex-direction:column;gap:12px">
      <div style="display:flex;align-items:center;gap:10px">
        <i data-lucide="calendar" style="width:16px;height:16px;color:var(--text-tertiary);flex-shrink:0"></i>
        <span style="font-size:14px;color:var(--text-secondary)">${dateLabel}</span>
      </div>
      <div style="display:flex;align-items:center;gap:10px">
        <i data-lucide="clock" style="width:16px;height:16px;color:var(--text-tertiary);flex-shrink:0"></i>
        <span style="font-size:14px;color:var(--text-secondary)">${timeLabel}</span>
      </div>
      ${ev.location ? `
      <div style="display:flex;align-items:center;gap:10px">
        <i data-lucide="map-pin" style="width:16px;height:16px;color:var(--text-tertiary);flex-shrink:0"></i>
        <span style="font-size:14px;color:var(--text-secondary)">${ev.location}</span>
      </div>` : ''}
      ${subj ? `
      <div>
        <span class="badge" style="background:var(--subject-${subj.id})22;color:var(--subject-${subj.id});padding:4px 12px;font-size:12px;border-radius:var(--r-md)">
          ${subj.name}
        </span>
      </div>` : ''}
    </div>`;

  const modal = Modal.open({
    title: ev.title || 'Termin',
    body,
    footer: `
      ${subj ? `<button class="btn btn-primary btn-sm" id="ics-d-session">Session starten</button>` : ''}
      <button class="btn btn-ghost btn-sm" id="ics-d-map">Fach zuordnen</button>
      <button class="btn btn-ghost btn-sm" id="ics-d-close">Schließen</button>`
  });
  renderIcons(modal.el);

  modal.el.querySelector('#ics-d-close')?.addEventListener('click', () => modal.close());
  modal.el.querySelector('#ics-d-session')?.addEventListener('click', () => {
    modal.close();
    SessionTracker.openNewSession(subjectId);
  });
  modal.el.querySelector('#ics-d-map')?.addEventListener('click', () => {
    modal.close();
    openIcsSubjectModal(icsId, subjects, container);
  });
}

function openIcsSubjectModal(icsId, subjects, container) {
  const cache    = scheduleSync.loadCache();
  const ev       = (cache.events || []).find(x => x.id === icsId);
  if (!ev) return;
  const overrides = scheduleSync.loadOverrides();
  const inferred  = scheduleSync.inferSubjectId(ev.title, ev.description);
  const cur       = overrides[icsId] || inferred || '';
  const body = `
    <p style="font-size:13px;color:var(--text-secondary);margin-bottom:12px">${ev.title}</p>
    <div class="field">
      <label for="ics-subject">Fach zuordnen</label>
      <select class="select" id="ics-subject">
        <option value="">Neutral (grau)</option>
        ${subjects.map(s => `<option value="${s.id}"${cur === s.id ? ' selected' : ''}>${s.name}</option>`).join('')}
      </select>
    </div>`;
  const modal = Modal.open({
    title: 'Kalendereintrag',
    body,
    footer: `<button type="button" class="btn btn-ghost btn-sm" id="ics-cancel">Abbrechen</button>
      <button type="button" class="btn btn-primary btn-sm" id="ics-save">Speichern</button>`
  });
  renderIcons(modal.el);
  modal.el.querySelector('#ics-cancel')?.addEventListener('click', () => modal.close());
  modal.el.querySelector('#ics-save')?.addEventListener('click', () => {
    const v = modal.el.querySelector('#ics-subject')?.value || '';
    scheduleSync.setEventSubjectOverride(icsId, v || null);
    State.syncProfileData();
    modal.close();
    Toast.success('Zuordnung gespeichert');
    renderSchedule(container);
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
    modal.close();
    Toast.success('Lernblock gelöscht');
    renderSchedule(container);
  });
  modal.el.querySelector('#blk-save')?.addEventListener('click', () => {
    const subjectId = modal.el.querySelector('#blk-subject')?.value;
    const label     = modal.el.querySelector('#blk-label')?.value.trim();
    const startTime = modal.el.querySelector('#blk-start')?.value;
    const endTime   = modal.el.querySelector('#blk-end')?.value;
    const dayEl     = modal.el.querySelector('#blk-day');
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
    modal.close();
    renderSchedule(container);
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
