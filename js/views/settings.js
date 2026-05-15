import { State } from '../state.js';
import { Storage } from '../storage.js';
import { Theme } from '../theme.js';
import { renderIcons, setPhases, applySubjectColors } from '../util.js';
import { Toast } from '../components/toast.js';
import { Modal } from '../components/modal.js';
import * as scheduleSync from '../scheduleSync.js';

export function renderSettings(container) {
  const settings = State.getSettings();
  const subjects = State.getSubjects();

  container.innerHTML = `
    <div class="view">
      <div class="view-header">
        <div><div class="view-title">Einstellungen</div></div>
      </div>
      <div class="settings-layout">

        <!-- Profil -->
        <section class="settings-section">
          <div class="settings-section-title">Profil</div>
          <div class="settings-row">
            <div>
              <div class="settings-row-label">Name</div>
              <div class="settings-row-sub">Wird in der Begrüßung angezeigt</div>
            </div>
            <input class="input" id="set-name" type="text" value="${settings.name||'Lukas'}" style="max-width:200px" />
          </div>
          <div class="settings-row">
            <div>
              <div class="settings-row-label">Tagesziel</div>
              <div class="settings-row-sub">Lernzeit pro Tag in Stunden</div>
            </div>
            <input class="input" id="set-daily" type="number" min="1" max="16" step="0.5"
              value="${(settings.dailyGoalMinutes||240)/60}" style="max-width:100px" />
          </div>
        </section>

        <!-- Fächer & Klausuren -->
        <section class="settings-section" id="settings-subjects-section">
          <div class="settings-section-title">Fächer &amp; Klausuren</div>
          ${_buildSubjectCards(subjects)}
          <button class="btn btn-secondary btn-sm" id="btn-add-subject" type="button" style="margin-top:4px">
            <i data-lucide="plus"></i> Fach hinzufügen
          </button>
        </section>

        <!-- Lernphasen -->
        <section class="settings-section" id="settings-phases-section">
          <div class="settings-section-title">Lernphasen</div>
          ${_buildPhasesEditor(settings)}
        </section>

        <!-- Klausur-Reihenfolge -->
        <section class="settings-section">
          <div class="settings-section-title">Klausur-Reihenfolge</div>
          <div style="display:flex;flex-direction:column;gap:8px">
            ${[...subjects].sort((a,b) => (a.examDate||'').localeCompare(b.examDate||'')).map(s => `
              <div style="display:flex;align-items:center;gap:10px;font-size:13px;color:var(--text-secondary)">
                <div style="width:10px;height:10px;border-radius:50%;background:${s.colorHex||`var(--subject-${s.id})`};flex-shrink:0"></div>
                <span style="flex:1">${s.name}</span>
                <span style="font-family:var(--font-mono);font-size:12px;color:var(--text-tertiary)">${s.examDate ? new Date(s.examDate+'T12:00:00').toLocaleDateString('de-DE',{day:'numeric',month:'short',year:'numeric'}) : '—'}</span>
              </div>`).join('')}
          </div>
        </section>

        <!-- Theme -->
        <section class="settings-section">
          <div class="settings-section-title">Darstellung</div>
          <div class="settings-row">
            <div><div class="settings-row-label">Theme</div></div>
            <div class="theme-picker">
              <div class="theme-option${settings.theme!=='light'?' active':''}" data-theme-opt="dark" tabindex="0" role="button" aria-label="Dark Mode">
                <i data-lucide="moon"></i>
              </div>
              <div class="theme-option${settings.theme==='light'?' active':''}" data-theme-opt="light" tabindex="0" role="button" aria-label="Light Mode">
                <i data-lucide="sun"></i>
              </div>
            </div>
          </div>
        </section>

        <!-- Wochenziele -->
        <section class="settings-section">
          <div class="settings-section-title">Wochenziele</div>
          <div class="goal-sliders">
            ${subjects.map(s => {
              const goalH = Math.round((settings.weeklyGoals?.[s.id]||360)/60);
              return `<div class="goal-slider-row">
                <label class="goal-slider-label" for="goal-${s.id}">
                  <div class="goal-slider-dot" style="background:var(--subject-${s.id})"></div>
                  ${s.name.split(' ')[0]}
                </label>
                <input class="goal-slider-input" id="goal-${s.id}" type="range" min="1" max="20" step="0.5"
                  value="${goalH}" data-subj="${s.id}" />
                <span class="goal-slider-val" id="goal-val-${s.id}">${goalH}h</span>
              </div>`;
            }).join('')}
          </div>
        </section>

        <!-- Stundenplan-Quelle -->
        <section class="settings-section" id="settings-schedule-section">
          <div class="settings-section-title">Stundenplan-Quelle</div>
          <div class="settings-row" style="flex-direction:column;align-items:stretch;gap:12px">
            <div class="schedule-source-row">
              <label class="radio-line"><input type="radio" name="sched-src" value="manual" ${(State.get().schedulePrefs?.source||'manual')==='manual'?'checked':''} /> Manuell (Vorlagen wie bisher)</label>
              <label class="radio-line"><input type="radio" name="sched-src" value="ics-url" ${State.get().schedulePrefs?.source==='ics-url'?'checked':''} /> ICS-URL (Live-Sync)</label>
              <label class="radio-line"><input type="radio" name="sched-src" value="ics-file" ${State.get().schedulePrefs?.source==='ics-file'?'checked':''} /> ICS-Datei (Upload, nicht live)</label>
            </div>
            <div id="sched-panel-url" style="display:none">
              <div class="field" style="margin:0">
                <label for="sched-ics-url">ICS-URL deines Kalenders</label>
                <input class="input" id="sched-ics-url" type="url" placeholder="https://calendar.google.com/calendar/ical/…" value="" />
              </div>
              <details class="sched-help-acc" style="margin-top:8px">
                <summary style="cursor:pointer;font-size:13px;color:var(--text-secondary)">Wie bekomme ich die URL?</summary>
                <div style="font-size:12px;color:var(--text-tertiary);margin-top:8px;line-height:1.55">
                  <p><strong>Google Calendar:</strong> Nur die PRIVATE Adresse funktioniert (nicht die öffentliche). Einstellungen → Kalender → ganz nach unten → „Privatadresse im iCal-Format”. Die URL muss mit <code>secret=</code> enden.</p>
                  <p style="margin-top:6px"><strong>DHBW Rapla:</strong> In der Wochenansicht eine .ics-URL verwenden oder „Kalender abonnieren” / Rechtsklick → Link der Abonnement-URL.</p>
                  <p style="margin-top:6px"><strong>Wiederkehrende Termine</strong> werden automatisch für ±6 Monate expandiert. Falls Termine fehlen → ICS-Datei direkt hochladen (Google Calendar → Einstellungen → Import &amp; Export → Exportieren).</p>
                  <p style="margin-top:6px"><strong>CORS-Problem:</strong> Google blockiert direkte Browser-Anfragen. Die App versucht automatisch 3 verschiedene Proxy-Server. Wenn alle scheitern → Datei-Upload nutzen.</p>
                </div>
              </details>
              <div class="sched-btn-row">
                <button type="button" class="btn btn-primary btn-sm" id="sched-btn-sync">
                  Verbinden &amp; jetzt synchronisieren
                </button>
                <button type="button" class="btn btn-ghost btn-sm" id="sched-btn-disconnect">
                  Verbindung trennen
                </button>
              </div>
              <div class="field" style="margin-top:12px" id="sched-interval-wrap">
                <label for="sched-interval">Automatische Synchronisation alle</label>
                <div style="display:flex;align-items:center;gap:12px">
                  <select class="select" id="sched-interval" style="max-width:160px">
                    <option value="15">15 Minuten</option>
                    <option value="30">30 Minuten</option>
                    <option value="60">1 Stunde</option>
                    <option value="180">3 Stunden</option>
                    <option value="360">6 Stunden</option>
                    <option value="720">12 Stunden</option>
                    <option value="1440">1 mal täglich</option>
                  </select>
                  <button type="button" class="btn btn-secondary btn-sm" id="sched-btn-sync-now">Jetzt synchronisieren</button>
                </div>
                <div class="field-hint" id="sched-last-sync" style="margin-top:6px;font-size:12px;color:var(--text-tertiary)"></div>
              </div>
            </div>
            <div id="sched-panel-file" style="display:none">
              <div class="field" style="margin:0">
                <label for="sched-ics-file">.ics-Datei</label>
                <input class="input" id="sched-ics-file" type="file" accept=".ics,text/calendar" />
              </div>
              <p style="font-size:12px;color:var(--text-tertiary);margin:8px 0 0">Nicht live — du musst die Datei bei Änderungen erneut hochladen.</p>
            </div>
            <div id="sched-status" class="sched-status-line" style="font-size:12px;color:var(--text-secondary)"></div>
          </div>
        </section>

        <!-- Töne & Benachrichtigungen -->
        <section class="settings-section">
          <div class="settings-section-title">Töne & Benachrichtigungen</div>
          <div class="settings-row">
            <div>
              <div class="settings-row-label">Sound-Effekte</div>
              <div class="settings-row-sub">Beim Start und Ende einer Session</div>
            </div>
            <label class="toggle">
              <input type="checkbox" id="set-sound" ${settings.soundEnabled?'checked':''} />
              <div class="toggle-track"></div>
            </label>
          </div>
          <div class="settings-row">
            <div>
              <div class="settings-row-label">Browser-Notifications</div>
              <div class="settings-row-sub">Erinnerung nach 50 Minuten Lernzeit</div>
            </div>
            <label class="toggle">
              <input type="checkbox" id="set-notif" ${settings.notificationsEnabled?'checked':''} />
              <div class="toggle-track"></div>
            </label>
          </div>
        </section>

        <!-- Demo-Daten -->
        <section class="settings-section" id="settings-demo-section">
          <div class="settings-section-title">Demo-Ansicht</div>
          <div class="settings-row">
            <div>
              <div class="settings-row-label">Demo-Daten löschen</div>
              <div class="settings-row-sub">Entfernt nur als Demo markierte Sessions, Fehler und Mocks. Eigene Einträge bleiben erhalten.</div>
            </div>
            <button class="btn btn-secondary btn-sm" id="btn-demo-clear" type="button">Demo-Daten löschen</button>
          </div>
        </section>

        <!-- Export / Import -->
        <section class="settings-section">
          <div class="settings-section-title">Daten</div>
          <div class="export-zone">
            <i data-lucide="database" style="width:32px;height:32px;color:var(--text-disabled)"></i>
            <div class="export-zone-title">Daten exportieren & importieren</div>
            <div class="export-zone-sub">Alle Daten als JSON-Datei sichern oder aus einer Sicherung wiederherstellen.</div>
            <div class="export-actions">
              <button class="btn btn-secondary btn-sm" id="btn-export"><i data-lucide="download"></i> Exportieren</button>
              <label class="btn btn-secondary btn-sm" style="cursor:pointer">
                <i data-lucide="upload"></i> Importieren
                <input type="file" id="btn-import" accept=".json" style="display:none" />
              </label>
            </div>
          </div>
        </section>

        <!-- Danger zone -->
        <section class="settings-section">
          <div class="settings-section-title">Gefahrenzone</div>
          <div class="danger-zone">
            <div>
              <div class="danger-title">Alle Daten zurücksetzen</div>
              <div class="danger-sub">Sessions, Fehlerbuch, Mocks, Stundenplan-Anpassungen und alle Einstellungen werden gelöscht. Der Willkommensbildschirm erscheint wieder.</div>
            </div>
            <button class="btn btn-danger btn-sm" id="btn-reset" type="button">Alle Daten zurücksetzen</button>
          </div>
        </section>

        <!-- App-Info -->
        <section class="settings-section" style="padding-bottom:32px">
          <div class="settings-section-title">Info</div>
          <div style="font-size:13px;color:var(--text-tertiary);line-height:1.8">
            <div>Version 1.0 · Lernplattform für DHBW-Klausurvorbereitung</div>
            <div>Daten werden lokal gecacht und über den Username mit Supabase synchronisiert.</div>
            <div style="margin-top:8px">Klausuren: KLR/FiBu 21.07. · Mathe II 24.07. · Prog II 27.07. · KBS/IT 31.07.2026</div>
          </div>
        </section>
      </div>
    </div>`;

  renderIcons(container);
  _bindSettings(container, subjects);
  document.addEventListener('settings:export', () => exportData(), { once:true });
}

/* ── Farb-Optionen ──────────────────────────────────────── */
const SUBJECT_COLORS = [
  { hex: '#10B981', label: 'Grün' },
  { hex: '#8B5CF6', label: 'Violett' },
  { hex: '#06B6D4', label: 'Cyan' },
  { hex: '#F59E0B', label: 'Amber' },
  { hex: '#EF4444', label: 'Rot' },
  { hex: '#3B82F6', label: 'Blau' },
];

function _buildSubjectCards(subjects) {
  return subjects.map(s => {
    const color = s.colorHex || `var(--subject-${s.id})`;
    const dateLabel = s.examDate
      ? new Date(s.examDate + 'T12:00:00').toLocaleDateString('de-DE', { day:'numeric', month:'long', year:'numeric' })
      : 'Kein Datum';
    return `
      <div class="subject-edit-card">
        <div class="subject-edit-dot" style="background:${color}"></div>
        <div class="subject-edit-info">
          <div class="subject-edit-name">${_esc(s.name)}</div>
          <div class="subject-edit-date">Klausur: ${dateLabel}</div>
        </div>
        <button class="btn btn-secondary btn-sm" data-edit-subject="${s.id}" type="button">Bearbeiten</button>
      </div>`;
  }).join('');
}

function _buildPhasesEditor(settings) {
  const ph = settings.phases || {};
  const rows = [
    { key: '1', label: 'Phase 1 – Stoff aufbauen', startKey: 'p1Start', endKey: 'p1End',
      startDef: '2026-01-01', endDef: '2026-06-14' },
    { key: '2', label: 'Phase 2 – Vertiefung',     startKey: 'p2Start', endKey: 'p2End',
      startDef: '2026-06-15', endDef: '2026-06-30' },
    { key: '3', label: 'Phase 3 – Klausurmodus',   startKey: 'p3Start', endKey: 'p3End',
      startDef: '2026-07-01', endDef: '2026-07-31' },
  ];
  return rows.map(r => `
    <div class="phase-edit-row">
      <div class="phase-edit-label">${r.label}</div>
      <div class="field" style="margin:0">
        <label style="font-size:11px;color:var(--text-tertiary)">Von</label>
        <input class="input" type="date" id="phase-${r.startKey}"
          value="${ph[r.startKey] || r.startDef}" style="font-size:12px;padding:5px 8px" />
      </div>
      <div class="field" style="margin:0">
        <label style="font-size:11px;color:var(--text-tertiary)">Bis</label>
        <input class="input" type="date" id="phase-${r.endKey}"
          value="${ph[r.endKey] || r.endDef}" style="font-size:12px;padding:5px 8px" />
      </div>
    </div>`).join('');
}

function _colorPicker(selectedHex) {
  return `<div class="color-picker">
    ${SUBJECT_COLORS.map(c => `
      <div class="color-option${c.hex === selectedHex ? ' selected' : ''}"
        style="background:${c.hex}" data-color="${c.hex}" title="${c.label}"
        role="radio" aria-checked="${c.hex === selectedHex}" tabindex="0"></div>`).join('')}
  </div>
  <input type="hidden" id="subj-color" value="${selectedHex || SUBJECT_COLORS[0].hex}" />`;
}

function _slugify(name) {
  const slug = name.toLowerCase()
    .replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss')
    .replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0, 20);
  return slug || 's' + Date.now().toString(36);
}

function _esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function _bindSettings(container, subjects) {
  /* Name & daily goal – save on blur */
  container.querySelector('#set-name')?.addEventListener('blur', e => {
    State.updateSettings({ name: e.target.value.trim() || 'Lukas' });
    Toast.success('Name gespeichert');
  });
  container.querySelector('#set-daily')?.addEventListener('blur', e => {
    const v = parseFloat(e.target.value);
    if (!isNaN(v) && v > 0) {
      State.updateSettings({ dailyGoalMinutes: Math.round(v * 60) });
      Toast.success('Tagesziel gespeichert');
    }
  });

  /* Theme */
  container.querySelectorAll('[data-theme-opt]').forEach(opt => {
    opt.addEventListener('click', () => {
      Theme.set(opt.dataset.themeOpt);
      container.querySelectorAll('[data-theme-opt]').forEach(o => o.classList.toggle('active', o === opt));
    });
    opt.addEventListener('keydown', e => { if (e.key==='Enter') opt.click(); });
  });

  /* Goal sliders */
  subjects.forEach(s => {
    const slider = container.querySelector(`#goal-${s.id}`);
    const valEl  = container.querySelector(`#goal-val-${s.id}`);
    if (!slider) return;
    slider.addEventListener('input', () => {
      const v = parseFloat(slider.value);
      if (valEl) valEl.textContent = `${v}h`;
    });
    slider.addEventListener('change', () => {
      const v = parseFloat(slider.value);
      const goals = { ...State.getSettings().weeklyGoals, [s.id]: Math.round(v * 60) };
      State.updateSettings({ weeklyGoals: goals });
    });
  });

  /* ── Fach bearbeiten ─────────────────────────────── */
  container.querySelectorAll('[data-edit-subject]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id   = btn.dataset.editSubject;
      const subj = State.getSubjects().find(s => s.id === id);
      if (!subj) return;
      _openSubjectModal(subj, false, container);
    });
  });

  container.querySelector('#btn-add-subject')?.addEventListener('click', () => {
    _openSubjectModal(null, true, container);
  });

  /* ── Lernphasen ──────────────────────────────────── */
  const phaseKeys = ['p1Start','p1End','p2Start','p2End','p3Start','p3End'];
  phaseKeys.forEach(key => {
    container.querySelector(`#phase-${key}`)?.addEventListener('change', () => {
      const newPhases = {};
      phaseKeys.forEach(k => {
        const el = container.querySelector(`#phase-${k}`);
        if (el?.value) newPhases[k] = el.value;
      });
      State.updateSettings({ phases: newPhases });
      Storage.saveNow(State.get());
      setPhases(newPhases);
      Toast.success('Phasen gespeichert');
    });
  });

  /* Toggles */
  container.querySelector('#set-sound')?.addEventListener('change', e => {
    State.updateSettings({ soundEnabled: e.target.checked });
  });
  container.querySelector('#set-notif')?.addEventListener('change', e => {
    if (e.target.checked) {
      Notification.requestPermission().then(perm => {
        State.updateSettings({ notificationsEnabled: perm === 'granted' });
        if (perm !== 'granted') { e.target.checked = false; Toast.error('Berechtigung verweigert'); }
      });
    } else {
      State.updateSettings({ notificationsEnabled: false });
    }
  });

  /* Demo löschen */
  container.querySelector('#btn-demo-clear')?.addEventListener('click', () => {
    if (!State.hasDemoEntries()) {
      Toast.info('Keine Demo-Daten', 'Es sind keine Demo-Einträge vorhanden.');
      return;
    }
    const modal = Modal.open({
      title: 'Demo-Daten löschen?',
      size: 'sm',
      body: '<p style="color:var(--text-secondary);font-size:14px">Alle als Demo markierten Sessions, Fehlerbuch-Einträge und Mocks werden entfernt. Deine eigenen Daten bleiben erhalten.</p>',
      footer: `<button class="btn btn-ghost" id="demo-clear-cancel" type="button">Abbrechen</button>
               <button class="btn btn-danger" id="demo-clear-confirm" type="button">Demo löschen</button>`
    });
    renderIcons(modal.el);
    modal.el.querySelector('#demo-clear-cancel')?.addEventListener('click', () => modal.close());
    modal.el.querySelector('#demo-clear-confirm')?.addEventListener('click', () => {
      State.removeDemoEntries();
      modal.close();
      Toast.success('Demo-Daten entfernt');
      Storage.saveNow(State.get());
      renderSettings(container);
    });
  });

  /* Export */
  container.querySelector('#btn-export')?.addEventListener('click', exportData);

  /* Import */
  container.querySelector('#btn-import')?.addEventListener('change', e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!data.version || !data.sessions) throw new Error('Ungültiges Format');
        State.init(data);
        Storage.saveNow(data);
        Toast.success('Import erfolgreich', `${data.sessions.length} Sessions geladen`);
        location.reload();
      } catch (err) {
        Toast.error('Import fehlgeschlagen', err.message);
      }
    };
    reader.readAsText(file);
  });

  /* Reset */
  container.querySelector('#btn-reset')?.addEventListener('click', () => {
    const nSess = State.getSessions().length;
    const nErr  = State.getErrors().length;
    const nMock = State.getMocks().length;
    const modal = Modal.open({
      title: 'Alle Daten zurücksetzen?',
      size: 'sm',
      body: `<p style="color:var(--text-secondary);font-size:14px;line-height:1.55">Wirklich? Es gehen verloren:</p>
        <ul style="margin:8px 0 0 18px;color:var(--text-secondary);font-size:14px;line-height:1.6">
          <li><strong>${nSess}</strong> Session${nSess === 1 ? '' : 's'}</li>
          <li><strong>${nErr}</strong> Fehlerbuch-Eintrag${nErr === 1 ? '' : 'e'}</li>
          <li><strong>${nMock}</strong> Mock${nMock === 1 ? '' : 's'}</li>
        </ul>
        <p style="color:var(--text-secondary);font-size:14px;margin-top:12px">Danach erscheint der Willkommensbildschirm wieder.</p>`,
      footer: `<button class="btn btn-ghost" id="reset-cancel" type="button">Abbrechen</button>
               <button class="btn btn-danger" id="reset-confirm" type="button">Alles löschen</button>`
    });
    renderIcons(modal.el);
    modal.el.querySelector('#reset-cancel')?.addEventListener('click', () => modal.close());
    modal.el.querySelector('#reset-confirm')?.addEventListener('click', () => {
      Storage.clear();
      localStorage.removeItem('learn.user_id');
      modal.close();
      location.reload();
    });
  });

  /* Stundenplan / ICS */
  const urlInp = container.querySelector('#sched-ics-url');
  if (urlInp) urlInp.value = State.get().schedulePrefs?.icsUrl || '';

  function updateSchedStatus() {
    const el = container.querySelector('#sched-status');
    if (!el) return;
    const sp = State.get().schedulePrefs || {};
    const cache = scheduleSync.loadCache();
    if (sp.source === 'manual') {
      el.textContent = 'Manueller Stundenplan (Vorlagen im Kalender).';
      return;
    }
    if (sp.lastError) {
      el.innerHTML = '<span style="color:var(--danger)">Letzter Sync fehlgeschlagen (oft CORS). Bitte .ics-Datei hochladen.</span>';
      return;
    }
    const n = cache.events?.length ?? sp.eventCount ?? 0;
    const t = sp.lastSyncedAt
      ? new Date(sp.lastSyncedAt).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
      : '—';
    el.textContent = `Zuletzt synchronisiert: ${t} · ${n} Termine`;
  }

  function refreshSchedulePanels() {
    const sp = State.get().schedulePrefs || {};
    const src = sp.source || 'manual';
    container.querySelectorAll('input[name="sched-src"]').forEach(r => { r.checked = r.value === src; });
    const pUrl = container.querySelector('#sched-panel-url');
    const pFile = container.querySelector('#sched-panel-file');
    if (pUrl) pUrl.style.display = src === 'ics-url' ? 'block' : 'none';
    if (pFile) pFile.style.display = src === 'ics-file' ? 'block' : 'none';
    updateSchedStatus();
  }

  container.querySelectorAll('input[name="sched-src"]').forEach(r => {
    r.addEventListener('change', () => {
      State.patchSchedulePrefs({ source: r.value });
      refreshSchedulePanels();
    });
  });

  container.querySelector('#sched-btn-sync')?.addEventListener('click', async () => {
    const urlInput = container.querySelector('#sched-ics-url');
    const url = scheduleSync.normalizeIcsUrl(urlInput?.value?.trim() || '');

    if (!url) {
      Toast.warning('URL fehlt', 'Bitte eine ICS-URL eintragen.');
      urlInput?.focus();
      return;
    }

    // URL sofort speichern, noch vor dem Sync-Versuch
    State.patchSchedulePrefs({ source: 'ics-url', icsUrl: url });
    Storage.saveNow(State.get());
    if (urlInput) urlInput.value = url;

    const btn = container.querySelector('#sched-btn-sync');
    const originalText = btn?.textContent || '';
    if (btn) { btn.disabled = true; btn.textContent = 'Verbinde…'; }

    try {
      const txt = await scheduleSync.fetchIcsText(url);
      const evs = scheduleSync.parseIcsToEvents(txt, 'ics-url');
      scheduleSync.saveCache(evs, new Date().toISOString());
      State.patchSchedulePrefs({
        source: 'ics-url',
        icsUrl: url,
        lastSyncedAt: new Date().toISOString(),
        lastError: null,
        eventCount: evs.length
      });
      Storage.saveNow(State.get());
      Toast.success('Kalender verbunden', `${evs.length} Termine geladen`);
      updateLastSyncLabel();
      updateSchedStatus();
      refreshSchedulePanels();
    } catch (err) {
      console.error('[Sync]', err);
      // URL trotzdem behalten, nur Fehler markieren
      State.patchSchedulePrefs({
        source: 'ics-url',
        icsUrl: url,
        lastError: err.code || 'SYNC'
      });
      Storage.saveNow(State.get());
      Toast.error(
        'Sync fehlgeschlagen',
        'CORS blockiert den Zugriff. Lade die .ics-Datei direkt hoch (Google Calendar → Einstellungen → Exportieren).'
      );
      updateLastSyncLabel();
      updateSchedStatus();
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = originalText; }
    }
  });

  container.querySelector('#sched-btn-disconnect')?.addEventListener('click', () => {
    scheduleSync.saveCache([], null);
    State.patchSchedulePrefs({
      source: 'manual',
      icsUrl: '',
      icsFileName: null,
      lastSyncedAt: null,
      lastError: null,
      eventCount: 0
    });
    Storage.saveNow(State.get());
    if (urlInp) urlInp.value = '';
    container.querySelectorAll('input[name="sched-src"]').forEach(r => { r.checked = r.value === 'manual'; });
    refreshSchedulePanels();
    Toast.success('Kalender-Verbindung getrennt');
  });

  container.querySelector('#sched-ics-file')?.addEventListener('change', async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const txt = await file.text();
      const events = scheduleSync.parseIcsToEvents(txt, 'ics-file');
      scheduleSync.saveCache(events, new Date().toISOString());
      State.set({ scheduleBlocks: State.getBlocks().filter(b => !b.locked) });
      State.patchSchedulePrefs({
        source: 'ics-file',
        icsFileName: file.name,
        lastSyncedAt: new Date().toISOString(),
        lastError: null,
        eventCount: events.length
      });
      Storage.saveNow(State.get());
      Toast.success('ICS eingelesen', `${events.length} Termine`);
      refreshSchedulePanels();
    } catch (err) {
      Toast.error('ICS ungültig', err.message || String(err));
    }
    e.target.value = '';
  });

  /* Intervall-Selector */
  const intervalSel = container.querySelector('#sched-interval');
  if (intervalSel) {
    const cur = State.get().schedulePrefs?.syncIntervalMinutes || 60;
    intervalSel.value = String(cur);
    intervalSel.addEventListener('change', () => {
      State.patchSchedulePrefs({ syncIntervalMinutes: parseInt(intervalSel.value) });
      Storage.saveNow(State.get());
      Toast.success('Sync-Intervall gespeichert');
    });
  }

  function updateLastSyncLabel() {
    const el = container.querySelector('#sched-last-sync');
    if (!el) return;
    const sp = State.get().schedulePrefs || {};
    if (!sp.lastSyncedAt) { el.textContent = 'Noch nie synchronisiert'; return; }
    const d = new Date(sp.lastSyncedAt);
    el.textContent = `Zuletzt: ${d.toLocaleDateString('de-DE')} um ${d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} · ${sp.eventCount || 0} Termine`;
  }
  updateLastSyncLabel();

  /* Jetzt synchronisieren Button */
  container.querySelector('#sched-btn-sync-now')?.addEventListener('click', async () => {
    const url = State.get().schedulePrefs?.icsUrl?.trim();
    if (!url) { Toast.warning('Keine URL', 'Bitte erst eine ICS-URL eintragen und verbinden.'); return; }
    const btn = container.querySelector('#sched-btn-sync-now');
    if (btn) { btn.disabled = true; btn.textContent = 'Synchronisiere…'; }
    try {
      const txt = await scheduleSync.fetchIcsText(url);
      const evs = scheduleSync.parseIcsToEvents(txt, 'ics-url');
      scheduleSync.saveCache(evs, new Date().toISOString());
      State.patchSchedulePrefs({
        lastSyncedAt: new Date().toISOString(),
        lastError: null,
        eventCount: evs.length
      });
      Storage.saveNow(State.get());
      Toast.success('Synchronisiert', `${evs.length} Termine geladen`);
      updateLastSyncLabel();
      updateSchedStatus();
    } catch {
      State.patchSchedulePrefs({ lastError: 'SYNC' });
      Storage.saveNow(State.get());
      Toast.error('Sync fehlgeschlagen', 'CORS möglich — nutze ICS-Datei-Upload als Fallback.');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Jetzt synchronisieren'; }
    }
  });

  refreshSchedulePanels();
}

function _openSubjectModal(subj, isNew, container) {
  const defaultColor = SUBJECT_COLORS[0].hex;
  const curColor = subj?.colorHex || defaultColor;

  const body = `
    <div class="field">
      <label for="subj-name">Name *</label>
      <input class="input" id="subj-name" type="text" value="${_esc(subj?.name || '')}"
        placeholder="z.B. Analysis" autocomplete="off" />
    </div>
    <div class="field">
      <label for="subj-exam">Klausurdatum</label>
      <input class="input" id="subj-exam" type="date" value="${subj?.examDate || ''}" />
    </div>
    <div class="field">
      <label>Farbe</label>
      ${_colorPicker(curColor)}
    </div>
    ${!isNew ? `<div class="field-hint" style="font-size:11px;color:var(--text-tertiary)">ID: <code>${subj?.id}</code> (intern, nicht änderbar)</div>` : ''}`;

  const modal = Modal.open({
    title: isNew ? 'Fach hinzufügen' : 'Fach bearbeiten',
    body,
    footer: `
      ${!isNew ? `<button class="btn btn-danger btn-sm" id="subj-del">Löschen</button>` : ''}
      <button class="btn btn-ghost btn-sm" id="subj-cancel">Abbrechen</button>
      <button class="btn btn-primary btn-sm" id="subj-save">Speichern</button>`
  });
  renderIcons(modal.el);
  modal.el.querySelector('#subj-name')?.focus();

  // Color picker interaction
  modal.el.querySelectorAll('.color-option').forEach(opt => {
    opt.addEventListener('click', () => {
      modal.el.querySelectorAll('.color-option').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      modal.el.querySelector('#subj-color').value = opt.dataset.color;
    });
    opt.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') opt.click(); });
  });

  modal.el.querySelector('#subj-cancel')?.addEventListener('click', () => modal.close());

  modal.el.querySelector('#subj-del')?.addEventListener('click', () => {
    const sessionCount = State.getSessions().filter(s => s.subjectId === subj.id).length;
    if (sessionCount > 0) {
      Toast.error('Fach hat Sessions', `${sessionCount} Session${sessionCount===1?'':'s'} sind diesem Fach zugeordnet — erst Sessions löschen oder Fach umbenennen.`);
      return;
    }
    State.removeSubject(subj.id);
    Storage.saveNow(State.get());
    modal.close();
    Toast.success('Fach gelöscht');
    renderSettings(container);
  });

  modal.el.querySelector('#subj-save')?.addEventListener('click', () => {
    const name     = modal.el.querySelector('#subj-name')?.value.trim();
    const examDate = modal.el.querySelector('#subj-exam')?.value || null;
    const colorHex = modal.el.querySelector('#subj-color')?.value || defaultColor;
    if (!name) { modal.el.querySelector('#subj-name')?.focus(); return; }

    if (isNew) {
      const id = _slugify(name);
      if (State.getSubjects().find(s => s.id === id)) {
        Toast.error('ID-Konflikt', `Ein Fach mit ähnlichem Namen existiert bereits (ID: ${id}).`);
        return;
      }
      State.addSubject({ id, name, color: `var(--subject-${id})`, colorHex, examDate,
        weeklyGoal: 360 });
    } else {
      State.updateSubject(subj.id, { name, examDate, colorHex });
    }
    applySubjectColors(State.getSubjects());
    Storage.saveNow(State.get());
    modal.close();
    Toast.success(isNew ? 'Fach hinzugefügt' : 'Fach gespeichert');
    // Refresh TopBar countdowns
    document.dispatchEvent(new CustomEvent('subjects:changed'));
    renderSettings(container);
  });
}

function exportData() {
  const data = {
    ...State.get(),
    _exportMeta: {
      scheduleCache: scheduleSync.loadCache(),
      eventSubjectMap: scheduleSync.loadOverrides()
    }
  };
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type:'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `lernplattform-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
  Toast.success('Export erfolgreich');
}
