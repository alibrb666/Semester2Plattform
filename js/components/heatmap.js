import { addDays, isoDate, isSameDay, formatDateDE, formatDuration, groupByDay, sumDuration, localeTag } from '../util.js';

export function renderHeatmap(container, sessions, onDayClick) {
  const today = new Date();
  const DAYS = 91;
  const byDay = groupByDay(sessions);

  /* Find max for scaling */
  const vals = Object.values(byDay).map(s => sumDuration(s));
  const max = vals.length ? Math.max(...vals) : 1;

  /* Build columns (weeks from left) */
  const start = addDays(today, -(DAYS - 1));
  /* Align to Monday */
  const startMon = new Date(start);
  startMon.setDate(start.getDate() - ((start.getDay() + 6) % 7));

  const weeks = [];
  let cur = new Date(startMon);
  while (cur <= today) {
    const week = [];
    for (let d = 0; d < 7; d++) {
      const day = new Date(cur);
      day.setDate(cur.getDate() + d);
      if (day > today) { week.push(null); continue; }
      week.push(new Date(day));
    }
    weeks.push(week);
    cur.setDate(cur.getDate() + 7);
  }

  /* Month labels */
  let lastMonth = -1;
  const monthLabels = weeks.map(week => {
    const first = week.find(d => d !== null);
    if (!first) return '';
    const m = first.getMonth();
    if (m !== lastMonth) { lastMonth = m; return first.toLocaleDateString(localeTag(), { month: 'short' }); }
    return '';
  });

  let labelsHtml = '<div class="heatmap-month-labels">';
  monthLabels.forEach(l => {
    labelsHtml += `<div class="heatmap-month-label" style="width:15px">${l}</div>`;
  });
  labelsHtml += '</div>';

  let gridHtml = '<div class="heatmap">';
  weeks.forEach(week => {
    gridHtml += '<div class="heatmap-col">';
    week.forEach(day => {
      if (!day) { gridHtml += '<div style="width:12px;height:12px"></div>'; return; }
      const key = isoDate(day);
      const secs = sumDuration(byDay[key] || []);
      const level = secs === 0 ? 0 : secs < 3600 ? 1 : secs < 7200 ? 2 : secs < 10800 ? 3 : 4;
      const isToday = isSameDay(day, today);
      const label = `${day.toLocaleDateString(localeTag(), { day:'numeric', month:'long', year:'numeric' })} – ${secs > 0 ? formatDuration(secs) : 'kein Lerntag'}`;
      gridHtml += `<div class="heatmap-cell${isToday?' today':''}" data-level="${level}" data-day="${key}" title="${label}" aria-label="${label}" role="button" tabindex="0"></div>`;
    });
    gridHtml += '</div>';
  });
  gridHtml += '</div>';

  container.innerHTML = `<div class="heatmap-container">${labelsHtml}${gridHtml}</div>`;

  container.querySelectorAll('.heatmap-cell').forEach(cell => {
    cell.addEventListener('click', () => onDayClick?.(cell.dataset.day));
    cell.addEventListener('keydown', e => { if (e.key === 'Enter') onDayClick?.(cell.dataset.day); });
  });
}
