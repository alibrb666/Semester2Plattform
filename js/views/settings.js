import { State } from '../state.js';
import { Storage } from '../storage.js';
import { Theme } from '../theme.js';
import { renderIcons } from '../util.js';
import { Toast } from '../components/toast.js';
import { Modal } from '../components/modal.js';

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
              <div class="danger-sub">Sessions, Fehlerbuch, Mocks und alle anderen Daten werden unwiderruflich gelöscht.</div>
            </div>
            <button class="btn btn-danger btn-sm" id="btn-reset">Zurücksetzen</button>
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
    const modal = Modal.open({
      title: 'Alle Daten löschen?',
      size: 'sm',
      body: '<p style="color:var(--text-secondary);font-size:14px">Diese Aktion kann nicht rückgängig gemacht werden. Alle Sessions, Fehler, Mocks und Einstellungen werden gelöscht.</p>',
      footer: `<button class="btn btn-ghost" id="reset-cancel">Abbrechen</button>
               <button class="btn btn-danger" id="reset-confirm">Alles löschen</button>`
    });
    renderIcons(modal.el);
    modal.el.querySelector('#reset-cancel')?.addEventListener('click', () => modal.close());
    modal.el.querySelector('#reset-confirm')?.addEventListener('click', () => {
      Storage.clear();
      modal.close();
      location.reload();
    });
  });
}

function exportData() {
  const data = State.get();
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
