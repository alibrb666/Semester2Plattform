import fs from 'fs';
import path from 'path';

const root = process.cwd();

function read(p) { return fs.readFileSync(path.join(root, p), 'utf8'); }

const indexHtml = read('index.html');
const appJs = read('js/app.js');

const requiredDataActions = [
  'toggle-sidebar',
  'quick-capture',
  'open-palette',
  'toggle-theme',
  'open-shortcuts',
  'open-account'
];

const failures = [];

for (const action of requiredDataActions) {
  if (!indexHtml.includes(`data-action="${action}"`)) {
    failures.push(`index.html: missing data-action=\"${action}\"`);
  }
  if (!appJs.includes(`case '${action}':`)) {
    failures.push(`js/app.js: missing handler case for data-action=\"${action}\"`);
  }
}

const checks = [
  { file: 'js/views/materials.js', id: '#btn-ai-chat' },
  { file: 'js/views/materials.js', id: '#btn-add-material' },
  { file: 'js/views/materials.js', id: '#ai-chat-ask' },
  { file: 'js/views/materials.js', id: '#ai-chat-clear' },
  { file: 'js/views/mocks.js', id: '#btn-add-mock' },
  { file: 'js/views/mocks.js', id: '#mocks-empty-add' },
  { file: 'js/components/commandPalette.js', id: '#btn-add-mock', mode: 'clickProxy' },
  { file: 'js/views/sessions.js', id: '#filter-subj' },
  { file: 'js/views/sessions.js', id: '#filter-range' },
  { file: 'js/views/todos.js', id: '#btn-new-todo' },
  { file: 'js/views/settings.js', id: '#btn-add-subject' },
  { file: 'js/views/settings.js', id: '#btn-export' },
  { file: 'js/views/settings.js', id: '#btn-reset' },
  { file: 'js/views/dashboard.js', id: '#btn-review' },
  { file: 'js/views/schedule.js', id: '#btn-add-block' }
];

for (const c of checks) {
  const src = read(c.file);
  if (c.mode === 'clickProxy') {
    if (!src.includes(`document.getElementById('${c.id.slice(1)}')?.click()`)) {
      failures.push(`${c.file}: missing command palette click proxy for ${c.id}`);
    }
    continue;
  }
  if (!src.includes(`querySelector('${c.id}')`) && !src.includes(`querySelector(\"${c.id}\")`)) {
    failures.push(`${c.file}: missing querySelector for ${c.id}`);
  }
  if (!src.includes('addEventListener')) {
    failures.push(`${c.file}: no addEventListener found at all`);
  }
}

if (indexHtml.includes('onclick=')) failures.push('index.html contains inline onclick handlers');

if (failures.length) {
  console.error('BUTTON AUDIT FAILED');
  for (const f of failures) console.error('-', f);
  process.exit(1);
}

console.log('BUTTON AUDIT OK');
