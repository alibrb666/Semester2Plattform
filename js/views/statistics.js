import { State } from '../state.js';
import { formatDuration, sumDuration, getStreak, getWeekSessions, getWeekMonday,
  addDays, isoDate, cssVar, renderIcons } from '../util.js';
import { translateDom } from '../i18n.js';

let _charts = [];

function destroyCharts() {
  _charts.forEach(c => { try { c.destroy(); } catch {} });
  _charts = [];
}

export function renderStatistics(container) {
  destroyCharts();
  const sessions  = State.getSessions();
  const subjects  = State.getSubjects();
  const settings  = State.getSettings();
  let filterRange = 'all';
  let filterSubj  = 'all';

  function filteredSessions() {
    let s = sessions;
    if (filterSubj !== 'all') s = s.filter(x => x.subjectId === filterSubj);
    if (filterRange === 'week')  s = s.filter(x => new Date(x.startedAt) >= getWeekMonday());
    if (filterRange === 'month') s = s.filter(x => new Date(x.startedAt) >= new Date(Date.now()-30*86400000));
    if (filterRange === 'phase1') s = s.filter(x => new Date(x.startedAt) >= new Date('2026-05-13') && new Date(x.startedAt) <= new Date('2026-06-14'));
    if (filterRange === 'phase2') s = s.filter(x => new Date(x.startedAt) >= new Date('2026-06-15') && new Date(x.startedAt) <= new Date('2026-06-30'));
    if (filterRange === 'phase3') s = s.filter(x => new Date(x.startedAt) >= new Date('2026-07-01'));
    return s;
  }

  const totalSec  = sumDuration(sessions);
  const weekMon   = getWeekMonday();
  const weekSec   = sumDuration(getWeekSessions(sessions, weekMon));
  const streak    = getStreak(sessions, settings.dailyGoalMinutes || 240);
  const longestStreak = State.getAchievements().longestStreak || streak;

  container.innerHTML = `
    <div class="view">
      <div class="view-header">
        <div><div class="view-title">Statistik</div></div>
      </div>

      <!-- Overview -->
      <div class="stats-overview">
        <div class="card"><div class="stat-label">Gesamte Lernzeit</div>
          <div class="stat-value">${formatDuration(totalSec,'long')}</div></div>
        <div class="card"><div class="stat-label">Diese Woche</div>
          <div class="stat-value">${formatDuration(weekSec,'long')}</div></div>
        <div class="card"><div class="stat-label">Längste Streak</div>
          <div class="stat-value">${longestStreak}d 🔥</div></div>
        <div class="card"><div class="stat-label">Sessions gesamt</div>
          <div class="stat-value">${sessions.length}</div></div>
      </div>

      <!-- Weekly subject goals -->
      <div class="subject-goals-grid" id="subject-goals"></div>

      <!-- Filters -->
      <div class="stats-filters">
        <select class="select" id="stats-range" style="padding:6px 28px 6px 10px">
          <option value="all">Gesamt</option>
          <option value="week">Diese Woche</option>
          <option value="month">Letzter Monat</option>
          <option value="phase1">Phase 1</option>
          <option value="phase2">Phase 2</option>
          <option value="phase3">Phase 3</option>
        </select>
        <select class="select" id="stats-subj" style="padding:6px 28px 6px 10px">
          <option value="all">Alle Fächer</option>
          ${subjects.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
        </select>
      </div>

      <!-- Charts -->
      <div class="stats-charts">
        <div class="card chart-card">
          <div class="chart-title">Lernzeit pro Fach (Wochenvergleich)</div>
          <div class="chart-sub">Gestapelt, letzte 8 Wochen</div>
          <div class="chart-wrap"><canvas id="chart-weekly"></canvas></div>
        </div>
        <div class="card chart-card">
          <div class="chart-title">Lernzeit nach Tageszeit</div>
          <div class="chart-sub">Morgens / Vormittags / Nachmittags / Abends</div>
          <div class="chart-wrap"><canvas id="chart-daytime"></canvas></div>
        </div>
        <div class="card chart-card">
          <div class="chart-title">Wochenvergleich Soll vs. Ist</div>
          <div class="chart-sub">Diese Woche in Stunden</div>
          <div class="chart-wrap"><canvas id="chart-sollist"></canvas></div>
        </div>
        <div class="card chart-card">
          <div class="chart-title">Session-Längen</div>
          <div class="chart-sub">Verteilung in Minuten</div>
          <div class="chart-wrap"><canvas id="chart-lengths"></canvas></div>
        </div>
      </div>
    </div>`;

  renderIcons(container);
  translateDom(container);
  renderSubjectGoals(container, subjects, sessions, settings, weekMon);

  function build() {
    destroyCharts();
    const f = filteredSessions();
    buildWeeklyChart(f, subjects);
    buildDaytimeChart(f);
    buildSollIstChart(sessions, subjects, settings, weekMon);
    buildLengthsChart(f);
  }

  container.querySelector('#stats-range')?.addEventListener('change', e => { filterRange = e.target.value; build(); });
  container.querySelector('#stats-subj')?.addEventListener('change', e => { filterSubj = e.target.value; build(); });
  build();
}

function renderSubjectGoals(container, subjects, sessions, settings, weekMon) {
  const weekSessions = getWeekSessions(sessions, weekMon);
  const el = container.querySelector('#subject-goals');
  if (!el) return;
  el.innerHTML = subjects.map(s => {
    const secs = sumDuration(weekSessions.filter(x => x.subjectId === s.id));
    const goal = (settings.weeklyGoals?.[s.id] || 360) * 60;
    const pct  = Math.min(100, Math.round(secs/goal*100));
    return `<div class="card subject-goal-card">
      <div class="subject-goal-header">
        <div class="subject-goal-dot" style="background:var(--subject-${s.id})"></div>
        <div class="subject-goal-name">${s.name}</div>
      </div>
      <div class="subject-goal-val">${formatDuration(secs)}</div>
      <div class="subject-goal-target">Ziel: ${formatDuration(goal)} · ${pct}%</div>
      <div class="subject-goal-bar">
        <div class="subject-goal-fill" style="width:${pct}%;background:var(--subject-${s.id})"></div>
      </div>
    </div>`;
  }).join('');
}

function chartDefaults() {
  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  return {
    color: isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)',
    grid:  isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
    bg:    isDark ? '#0F1011' : '#FFFFFF'
  };
}

function subjectColor(id) {
  const map = { klr:'#10B981', math:'#8B5CF6', prog:'#06B6D4', kbs:'#F59E0B' };
  return map[id] || '#8B5CF6';
}

function buildWeeklyChart(sessions, subjects) {
  const canvas = document.getElementById('chart-weekly');
  if (!canvas || !window.Chart) return;
  const { color, grid } = chartDefaults();

  const weeks = Array.from({length:8}, (_,i) => addDays(getWeekMonday(), -(7-i) * (i < 7 ? 1 : 0)));
  const labels = Array.from({length:8}, (_,i) => {
    const mon = addDays(getWeekMonday(), -(7-i)*7);
    return mon.toLocaleDateString(undefined,{day:'numeric',month:'short'});
  });

  const datasets = subjects.map(s => ({
    label: s.name.split(' ')[0],
    backgroundColor: subjectColor(s.id) + 'CC',
    data: Array.from({length:8}, (_,i) => {
      const mon = addDays(getWeekMonday(), -(7-i)*7);
      const wsess = getWeekSessions(sessions, mon);
      return Math.round(sumDuration(wsess.filter(x => x.subjectId === s.id)) / 3600 * 10) / 10;
    })
  }));

  const c = new Chart(canvas, {
    type:'bar',
    data: { labels, datasets },
    options: {
      animation: { duration:800 },
      plugins: { legend: { labels: { color, boxWidth:12 } } },
      scales: {
        x: { stacked:true, ticks:{color}, grid:{color:grid} },
        y: { stacked:true, ticks:{color, callback:v=>`${v}h`}, grid:{color:grid} }
      },
      responsive:true, maintainAspectRatio:false
    }
  });
  _charts.push(c);
}

function buildDaytimeChart(sessions) {
  const canvas = document.getElementById('chart-daytime');
  if (!canvas || !window.Chart) return;
  const { color } = chartDefaults();

  const slots = { Morgens:0, Vormittags:0, Nachmittags:0, Abends:0 };
  sessions.forEach(s => {
    const h = new Date(s.startedAt).getHours();
    const key = h < 9 ? 'Morgens' : h < 12 ? 'Vormittags' : h < 17 ? 'Nachmittags' : 'Abends';
    slots[key] += s.durationSeconds;
  });

  const c = new Chart(canvas, {
    type:'doughnut',
    data: {
      labels: Object.keys(slots),
      datasets:[{ data: Object.values(slots).map(v=>Math.round(v/3600*10)/10),
        backgroundColor:['#10B981','#8B5CF6','#06B6D4','#F59E0B'],
        borderWidth:0, hoverOffset:4 }]
    },
    options: {
      animation:{duration:800},
      plugins:{ legend:{ labels:{ color, boxWidth:12 } } },
      responsive:true, maintainAspectRatio:false,
      cutout:'60%'
    }
  });
  _charts.push(c);
}

function buildSollIstChart(sessions, subjects, settings, weekMon) {
  const canvas = document.getElementById('chart-sollist');
  if (!canvas || !window.Chart) return;
  const { color, grid } = chartDefaults();
  const weekSess = getWeekSessions(sessions, weekMon);

  const labels = subjects.map(s => s.name.split(' ')[0]);
  const ist  = subjects.map(s => Math.round(sumDuration(weekSess.filter(x=>x.subjectId===s.id))/3600*10)/10);
  const soll = subjects.map(s => Math.round((settings.weeklyGoals?.[s.id]||360)/60*10)/10);

  const c = new Chart(canvas, {
    type:'bar',
    data:{
      labels,
      datasets:[
        { label:'Ist', data:ist, backgroundColor: subjects.map(s=>subjectColor(s.id)+'CC'), borderRadius:6 },
        { label:'Soll', data:soll, type:'line', borderColor:'rgba(255,255,255,0.3)', backgroundColor:'transparent',
          borderDash:[4,4], pointStyle:'circle', pointRadius:4, pointBackgroundColor:'rgba(255,255,255,0.5)' }
      ]
    },
    options:{
      animation:{duration:800},
      plugins:{legend:{labels:{color,boxWidth:12}}},
      scales:{ x:{ticks:{color},grid:{color:grid}}, y:{ticks:{color,callback:v=>`${v}h`},grid:{color:grid}} },
      responsive:true, maintainAspectRatio:false
    }
  });
  _charts.push(c);
}

function buildLengthsChart(sessions) {
  const canvas = document.getElementById('chart-lengths');
  if (!canvas || !window.Chart) return;
  const { color, grid } = chartDefaults();

  const bins = [0,30,60,90,120,150,180,999];
  const labels = ['<30','30-60','60-90','90-120','120-150','150-180','180+'];
  const counts = new Array(7).fill(0);
  sessions.forEach(s => {
    const min = s.durationSeconds / 60;
    for (let i = 0; i < bins.length-1; i++) {
      if (min >= bins[i] && min < bins[i+1]) { counts[i]++; break; }
    }
  });

  const c = new Chart(canvas, {
    type:'bar',
    data:{ labels, datasets:[{ label:'Sessions', data:counts,
      backgroundColor:'rgba(139,92,246,0.7)', borderRadius:6 }] },
    options:{
      animation:{duration:800},
      plugins:{legend:{display:false}},
      scales:{ x:{ticks:{color},grid:{color:grid}}, y:{ticks:{color,stepSize:1},grid:{color:grid}} },
      responsive:true, maintainAspectRatio:false
    }
  });
  _charts.push(c);
}
