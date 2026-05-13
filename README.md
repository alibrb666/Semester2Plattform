# 1.0 — Persönliche Lernplattform

Produktionsreife Web-App für die Klausurvorbereitung im DHBW-Studium.  
Vier Klausuren · 11 Wochen · eine App.

---

## Start

Doppelklick auf `index.html` → öffnet in Chrome.  
Kein Build-Step, kein npm, kein Server nötig.

---

## Keyboard Shortcuts

| Taste | Aktion |
|---|---|
| `⌘/Ctrl + K` | Befehlspalette öffnen |
| `S` | Session starten / pausieren / stoppen |
| `F` | Focus Mode aktivieren |
| `N` | Quick Capture (Fehler / Notiz / Mock) |
| `T` | Theme umschalten (Dark ↔ Light) |
| `1` – `7` | Views wechseln (Dashboard → Einstellungen) |
| `?` | Shortcut-Übersicht |
| `Esc` | Modal schließen / Focus Mode beenden |

---

## Views

| # | Route | Inhalt |
|---|---|---|
| 1 | `#dashboard` | Hero, Tagesziel-Ring, Quick-Start, Heatmap, Klausur-Status |
| 2 | `#schedule` | Wochenkalender mit Vorlesungen + eigenen Lernblöcken |
| 3 | `#sessions` | Alle Sessions, filterbar nach Fach und Zeitraum |
| 4 | `#statistics` | Charts: Wochenvergleich, Tageszeit, Soll/Ist, Session-Längen |
| 5 | `#errors` | Fehlerbuch – Master-Detail mit Spaced Repetition |
| 6 | `#mocks` | Probeklausur-Tracker mit Trendlinien |
| 7 | `#settings` | Name, Theme, Wochenziele, Export/Import, Reset |

---

## Daten exportieren / importieren

**Einstellungen → Daten → Exportieren**  
Speichert alle Daten als `lernplattform-YYYY-MM-DD.json`.

**Importieren**: Dieselbe Seite → "Importieren" → JSON-Datei auswählen.  
Überschreibt alle vorhandenen Daten (die App lädt danach neu).

---

## Architektur

```
lernplattform/
├── index.html          Shell, CDN-Links, Theme-Bootstrap-Script
├── styles.css          Design Tokens + komplettes UI-System
├── README.md
└── js/
    ├── app.js          Entry Point – Boot, Router-Registrierung, Keyboard
    ├── storage.js      localStorage: load / save (throttled) / migrate
    ├── state.js        Global State – pub/sub, convenience-Mutators
    ├── util.js         Pure Utilities (Zeit, Datum, fuzzy, Streak, ...)
    ├── theme.js        Dark/Light Toggle mit View Transitions API
    ├── router.js       Hash-basierter Router (#dashboard → renderFn)
    ├── keyboard.js     Globale Shortcuts – event bus
    ├── demo.js         Demo-Daten Generator (3 Wochen Sessions, Fehler, Mocks)
    ├── components/
    │   ├── modal.js            Modal-Stack (beliebig tief stapelbar)
    │   ├── toast.js            Toast-Notifications (4 Typen)
    │   ├── confetti.js         Canvas-Konfetti für Streak-Meilensteine
    │   ├── heatmap.js          GitHub-style 90-Tage-Heatmap
    │   ├── topbar.js           Countdown-Pills + Actions
    │   ├── sidebar.js          Active State, Phase-Pill, Foot-Stats
    │   ├── sessionTracker.js   Floating Widget – das Kernfeature
    │   ├── commandPalette.js   ⌘K Palette mit Fuzzy-Search
    │   ├── quickCapture.js     FAB → Fehler / Notiz / Mock ohne View-Wechsel
    │   └── focusMode.js        Vollbild-Timer mit Aufgaben-Notiz
    └── views/
        ├── dashboard.js        Hero, Ring, Heatmap, Sessions, Klausur-Status
        ├── schedule.js         Wochenkalender mit Drag & Drop
        ├── sessions.js         Gefilterte Session-Liste
        ├── statistics.js       4× Chart.js Charts
        ├── errors.js           Fehlerbuch Master-Detail
        ├── mocks.js            Mock-Tracker mit Trendlinien
        └── settings.js         Alle User-Einstellungen
```

### Design System

Alle Farben als CSS Custom Properties unter `:root` (Dark) und `[data-theme="light"]`.  
Niemals Hex-Werte direkt im CSS — immer über Tokens wie `var(--accent)`.

**Fach-Farben:** `--subject-klr` (Emerald) · `--subject-math` (Violet) · `--subject-prog` (Cyan) · `--subject-kbs` (Amber)

### Daten-Schema (v2)

```js
{
  version: 2,
  schedulePrefs: { source: 'manual'|'ics-url'|'ics-file', icsUrl, icsFileName, lastSyncedAt, lastError, eventCount },
  settings: { … },
  subjects: [{ id, name, color, examDate }],
  sessions: [{
    id, subjectId, startedAt, endedAt, durationSeconds, note, tags, rating, isDemo?,
    tasks: [{ id, title, status, durationSeconds, activeStartedAt, segments[], createdAt, completedAt, note }]
  }],
  scheduleBlocks: […],
  …
}
```

Zusätzlich (nicht im Haupt-JSON): `localStorage['learn.v1.scheduleCache']` (ICS-Termine), `localStorage['learn.v1.eventSubjectMap']` (UID → `subjectId`).

### Stundenplan / ICS

- Quelle wählbar unter **Einstellungen → Stundenplan-Quelle** (manuell, ICS-URL mit Live-Sync inkl. CORS-Proxy-Fallback, oder ICS-Datei-Upload).
- Parser: **ical.js** (CDN). Nach Sync werden Termine in der Wochenansicht als **read-only** Blöcke dargestellt; Klick öffnet **Fach zuordnen** (Override in `eventSubjectMap`).
- Auto-Refresh der URL beim App-Start, wenn die letzte Synchronisation älter als 6 h ist.

### Event-Handling-Architektur

Alle Shell- und FAB-Aktionen nutzen **`data-action`** am klickbaren Element (nicht am Lucide-`<i>`).  
Ein **einzelner** `click`-Listener auf `document` delegiert über `event.target.closest('[data-action]')` an die passende Aktion (`toggle-sidebar`, `toggle-theme`, `open-palette`, `open-shortcuts`, `quick-capture`). So funktionieren Buttons auch dann, wenn Lucide die Icons nach dem ersten Paint durch `<svg>` ersetzt.

Spezialfälle:

- **Session-Widget:** nutzt eigenes `data-widget-action` mit Delegation auf dem Widget-Container (häufige Re-Renders).
- **Modals:** schließen per direkt am gemounteten Backdrop gebundenen Listenern; Body-Inhalt kann zusätzlich `data-action` nutzen, wenn die Buttons im `#app`-Subtree liegen.
- **Nach View-Wechsel:** der Router ruft `renderIcons(view-root)` auf; `Router.onChange` aktualisiert zudem Sidebar, Mobile-Tabs und Session-Widget.


## Features (Übersicht)

- **Session Tracker**: Floating Widget, Background-Tab-sicher (Date.now()-basiert), Pause/Resume, Stop-Modal mit Tags + Rating
- **Focus Mode**: Vollbild-Timer, Aufgaben-Notiz live bearbeitbar, `Esc` zum Beenden
- **Command Palette**: Fuzzy-Search, Recent Actions, Keyboard-Navigation
- **Fehlerbuch**: Spaced Repetition (1d / 3d / 7d / 14d), Master-Detail, Volltextsuche
- **Phasen-Awareness**: Phase 1 (Aufbau bis 14.06.) · Phase 2 (Vertiefung bis 30.06.) · Phase 3 (Klausurmodus ab 01.07.)
- **Streak**: Konfetti-Animation bei neuem Rekord, tagesgenau berechnet
- **Wöchentlicher Review**: Sonntags prominenter Banner → Modal mit Fach-Vergleich + Freitext
- **Stundenplan**: Drag & Drop, Resize, Conflict Detection, Heute-Indikator
- **Demo-Daten**: 3 Wochen realistische Sessions auf Knopfdruck

---

## Browser-Kompatibilität

Getestet in Chrome (Desktop) und Safari iOS.  
ES Modules (type="module") werden für alle modernen Browser (Chrome 61+, Safari 14+, Firefox 60+) unterstützt.
