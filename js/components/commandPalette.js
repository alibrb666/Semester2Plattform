import { State } from '../state.js';
import { Router } from '../router.js';
import { Theme } from '../theme.js';
import { fuzzyMatch, renderIcons } from '../util.js';
import { SessionTracker } from './sessionTracker.js';

const VIEWS = [
  { id:'dashboard',   label:'Dashboard öffnen',      icon:'layout-dashboard', action: ()=>Router.navigate('dashboard') },
  { id:'schedule',    label:'Stundenplan',            icon:'calendar-days',    action: ()=>Router.navigate('schedule') },
  { id:'sessions',    label:'Sessions',               icon:'timer',            action: ()=>Router.navigate('sessions') },
  { id:'statistics',  label:'Statistik',              icon:'line-chart',       action: ()=>Router.navigate('statistics') },
  { id:'errors',      label:'Fehlerbuch',             icon:'book-open',        action: ()=>Router.navigate('errors') },
  { id:'mocks',       label:'Probeklausuren',         icon:'file-check-2',     action: ()=>Router.navigate('mocks') },
  { id:'settings',    label:'Einstellungen',          icon:'settings',         action: ()=>Router.navigate('settings') },
];

function getActions() {
  const subjects = State.getSubjects();
  const startActions = subjects.map(s => ({
    id: 'start-'+s.id,
    label: `Session starten – ${s.name}`,
    icon: 'play',
    action: () => SessionTracker.openNewSession(s.id)
  }));
  return [
    ...startActions,
    { id:'new-error', label:'Neuer Fehlerbuch-Eintrag', icon:'plus-circle',
      action: () => { Router.navigate('errors'); document.dispatchEvent(new CustomEvent('errors:new')); } },
    { id:'new-mock', label:'Mock einloggen', icon:'file-plus',
      action: () => { Router.navigate('mocks'); document.dispatchEvent(new CustomEvent('mocks:new')); } },
    { id:'theme', label:'Theme umschalten', icon:'sun-moon',
      action: () => Theme.toggle() },
    { id:'export', label:'Daten exportieren', icon:'download',
      action: () => { Router.navigate('settings'); document.dispatchEvent(new CustomEvent('settings:export')); } },
    ...VIEWS
  ];
}

let _el = null;
let _selected = 0;
let _items = [];
let _recentIds = [];

export const CommandPalette = {
  init() {
    document.addEventListener('app:palette', () => this.open());
  },

  open() {
    if (_el) return;
    _items = getActions();
    _selected = 0;

    const backdrop = document.createElement('div');
    backdrop.className = 'cmd-backdrop';
    backdrop.innerHTML = `
      <div class="cmd-box" role="dialog" aria-label="Befehlspalette" aria-modal="true">
        <div class="cmd-input-wrap">
          <i data-lucide="search"></i>
          <input class="cmd-input" id="cmd-input" type="text" placeholder="Suchen oder Befehl eingeben…" autocomplete="off" spellcheck="false" />
          <kbd style="font-size:11px;color:var(--text-disabled);font-family:var(--font-mono);flex-shrink:0">Esc</kbd>
        </div>
        <div class="cmd-list" id="cmd-list"></div>
        <div class="cmd-footer">
          <span class="hint"><kbd>↑↓</kbd> navigieren</span>
          <span class="hint"><kbd>↵</kbd> ausführen</span>
          <span class="hint"><kbd>Esc</kbd> schließen</span>
        </div>
      </div>`;

    backdrop.addEventListener('click', e => { if (e.target === backdrop) this.close(); });
    document.body.appendChild(backdrop);
    renderIcons(backdrop);
    _el = backdrop;

    const input = backdrop.querySelector('#cmd-input');
    input.focus();

    input.addEventListener('input', () => this._filter(input.value));
    backdrop.addEventListener('keydown', e => {
      if (e.key === 'Escape') { this.close(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); this._move(1); }
      if (e.key === 'ArrowUp')   { e.preventDefault(); this._move(-1); }
      if (e.key === 'Enter')     { e.preventDefault(); this._exec(); }
    });

    this._filter('');
  },

  close() {
    if (!_el) return;
    _el.classList.add('leaving');
    _el.querySelector('.cmd-box')?.classList.add('leaving');
    setTimeout(() => { _el?.remove(); _el = null; }, 190);
  },

  _filter(q) {
    const list = document.getElementById('cmd-list');
    if (!list) return;

    const filtered = _items.filter(item => fuzzyMatch(q, item.label));
    _selected = 0;

    if (!filtered.length) {
      list.innerHTML = `<div class="cmd-empty">Keine Ergebnisse für "${q}"</div>`;
      return;
    }

    let html = '';
    if (!q && _recentIds.length) {
      html += `<div class="cmd-section-label">Zuletzt</div>`;
      _recentIds.slice(0,3).forEach(id => {
        const item = _items.find(x => x.id === id);
        if (item) html += this._itemHtml(item);
      });
      html += `<div class="cmd-section-label">Alle Aktionen</div>`;
    }
    filtered.forEach(item => { html += this._itemHtml(item); });
    list.innerHTML = html;

    list.querySelectorAll('.cmd-item').forEach((el, i) => {
      el.addEventListener('mouseenter', () => { _selected = i; this._highlight(); });
      el.addEventListener('click', () => { _selected = i; this._exec(); });
    });
    this._highlight();
  },

  _itemHtml(item) {
    return `<div class="cmd-item" data-id="${item.id}" role="option">
      <i data-lucide="${item.icon}"></i>
      <span class="cmd-item-label">${item.label}</span>
    </div>`;
  },

  _move(delta) {
    const items = document.querySelectorAll('#cmd-list .cmd-item');
    if (!items.length) return;
    _selected = (_selected + delta + items.length) % items.length;
    this._highlight();
    items[_selected]?.scrollIntoView({ block: 'nearest' });
  },

  _highlight() {
    document.querySelectorAll('#cmd-list .cmd-item').forEach((el, i) => {
      el.classList.toggle('selected', i === _selected);
    });
    renderIcons(document.getElementById('cmd-list'));
  },

  _exec() {
    const items = document.querySelectorAll('#cmd-list .cmd-item');
    const el = items[_selected];
    if (!el) return;
    const id = el.dataset.id;
    const action = _items.find(x => x.id === id);
    if (!action) return;
    _recentIds = [id, ..._recentIds.filter(x => x !== id)].slice(0, 5);
    this.close();
    setTimeout(() => action.action(), 50);
  }
};
