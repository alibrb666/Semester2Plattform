import { State } from '../state.js';
import { Storage } from '../storage.js';
import { Theme } from '../theme.js';
import { renderIcons } from '../util.js';
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
                  <p><strong>Google Calendar:</strong> Kalendereinstellungen → „Privatadresse im iCal-Format“ kopieren (nicht die öffentliche Adresse).</p>
                  <p><strong>DHBW Rapla:</strong> In der Wochenansicht eine .ics-URL verwenden oder „Kalender abonnieren“ / Rechtsklick → Link der Abonnement-URL.</p>
                </div>
              </details>
              <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px">
                <button type="button" class="btn btn-primary btn-sm" id="sched-btn-sync">Verbinden &amp; jetzt synchronisieren</button>
                <button type="button" class="btn btn-ghost btn-sm" id="sched-btn-disconnect">Verbindung trennen</button>
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
            <div>Daten werden lokal im Browser gespeichert (localStorage).</div>
            <div style="margin-top:8px">Klausuren: KLR/FiBu 21.07. · Mathe II 24.07. · Prog II 27.07. · KBS/IT 31.07.2026</div>
          </div>
        </section>
      </div>
    </div>`;

  renderIcons(container);
  _bindSettings(container, subjects);
  document.addEventListener('settings:export', () => exportData(), { once:true });
}

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
    const url = container.querySelector('#sched-ics-url')?.value?.trim() || '';
    if (!url) { Toast.warning('URL fehlt', 'Bitte eine ICS-URL eintragen.'); return; }
    try {
      const txt = await scheduleSync.fetchIcsText(url);
      const events = scheduleSync.parseIcsToEvents(txt, 'ics-url');
      scheduleSync.saveCache(events, new Date().toISOString());
      State.patchSchedulePrefs({
        source: 'ics-url',
        icsUrl: url,
        lastSyncedAt: new Date().toISOString(),
        lastError: null,
        eventCount: events.length
      });
      Storage.saveNow(State.get());
      Toast.success('Kalender synchronisiert', `${events.length} Termine`);
      updateSchedStatus();
    } catch {
      State.patchSchedulePrefs({ lastError: 'SYNC', icsUrl: url });
      Storage.saveNow(State.get());
      Toast.error('Sync fehlgeschlagen', 'CORS möglich — nutze ICS-Datei-Upload.');
      updateSchedStatus();
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

  refreshSchedulePanels();
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
