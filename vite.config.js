import { defineConfig } from 'vite'

function icsProxyPlugin() {
  const handler = async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname !== '/api/ics') return false;

      const target = url.searchParams.get('url');
      if (!target) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: 'Missing url query parameter' }));
        return true;
      }
      let parsed;
      try { parsed = new URL(target); } catch {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: 'Invalid target URL' }));
        return true;
      }
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: 'Only http/https targets are allowed' }));
        return true;
      }

      const upstream = await fetch(parsed.toString(), {
        headers: { Accept: 'text/calendar, text/plain, */*' },
      });
      const text = await upstream.text();
      if (!upstream.ok) {
        res.statusCode = upstream.status;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: `Upstream returned ${upstream.status}` }));
        return true;
      }

      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(text);
      return true;
    } catch (err) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: String(err?.message || err) }));
      return true;
    }
  };

  return {
    name: 'ics-proxy',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const handled = await handler(req, res);
        if (!handled) next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const handled = await handler(req, res);
        if (!handled) next();
      });
    },
  };
}

function aiAssistantPlugin() {
  const json = (res, status, payload) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(payload));
  };

  const readBody = req => new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });

  const buildSourceContext = (materials = [], mocks = []) => {
    const MAX_PDF_CHARS_PER_SOURCE = 60000;
    const lines = [];
    materials.forEach((m, i) => {
      lines.push(`[Material ${i + 1}] subject=${m.subjectName || m.subjectId || '-'} kind=${m.kind || '-'} title=${m.title || '-'}`);
      if (m.note) lines.push(`note: ${m.note}`);
      if (m.pdfAttachment?.name) lines.push(`pdf: ${m.pdfAttachment.name}`);
      if (m.pdfText) lines.push(`pdf content (truncated):\n${String(m.pdfText).slice(0, MAX_PDF_CHARS_PER_SOURCE)}`);
    });
    mocks.forEach((m, i) => {
      lines.push(`[Mock ${i + 1}] subject=${m.subjectName || m.subjectId || '-'} score=${m.score ?? '-'} max=${m.maxScore ?? '-'}`);
      if (m.note) lines.push(`note: ${m.note}`);
      if (m.pdfAttachment?.name) lines.push(`pdf: ${m.pdfAttachment.name}`);
      if (m.pdfText) lines.push(`pdf content (truncated):\n${String(m.pdfText).slice(0, MAX_PDF_CHARS_PER_SOURCE)}`);
    });
    return lines.join('\n');
  };

  const toOpenAIInputs = (materials = [], mocks = []) => {
    const items = [];
    const safeName = name => {
      const cleaned = String(name || 'document.pdf')
        .normalize('NFKD')
        .replace(/[^\w.\-]+/g, '_')
        .replace(/_+/g, '_')
        .slice(0, 80);
      return cleaned.toLowerCase().endsWith('.pdf') ? cleaned : `${cleaned}.pdf`;
    };
    const normalizeDataUrl = raw => {
      if (!raw || typeof raw !== 'string' || !raw.startsWith('data:')) return null;
      const comma = raw.indexOf(',');
      if (comma < 0) return null;
      const header = raw.slice(5, comma); // after "data:"
      const payload = raw.slice(comma + 1).trim();
      if (!payload) return null;
      const b64 = payload.replace(/\s+/g, '');
      // Ensure valid base64 alphabet and padding-like shape.
      if (!/^[A-Za-z0-9+/=]+$/.test(b64)) return null;
      const mime = header.includes(';') ? header.split(';')[0] : header;
      const finalMime = mime && mime.includes('/') ? mime : 'application/pdf';
      return `data:${finalMime};base64,${b64}`;
    };
    for (const m of [...materials, ...mocks]) {
      const d = m?.pdfAttachment?.dataUrl;
      const normalized = normalizeDataUrl(d);
      if (!normalized) continue;
      items.push({
        type: 'input_file',
        filename: safeName(m?.pdfAttachment?.name || 'document.pdf'),
        file_data: normalized
      });
    }
    return items;
  };

  const callOllama = async ({ prompt, materials, mocks, mode, model }) => {
    const system = mode === 'mock'
      ? 'You are an exam generator. Prefer using the provided source context when generating questions. If the source is insufficient, supplement with reasonable general-knowledge questions on the same subject and mark them with "Allgemein (nicht aus Quelle)" in their header. Reply in the language used in the user request.'
      : 'You are a study tutor. Prefer evidence from the provided source content. If the source covers the question, answer strictly from it. If the source does NOT cover the topic, briefly note that the topic is not in the source, then provide a clear, concise general-knowledge explanation. Mark general-knowledge sections with a leading "Allgemein (nicht aus Quelle):" line so the reader knows the distinction. Reply in the language the user used in the question.';
    const textContext = buildSourceContext(materials, mocks);

    const resp = await fetch((process.env.OLLAMA_URL || 'http://127.0.0.1:11434') + '/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model || process.env.OLLAMA_MODEL || 'llama3.1:8b',
        stream: false,
        options: { temperature: mode === 'mock' ? 0.7 : 0.2 },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: `SOURCE SUMMARY:\n${textContext || 'No metadata available.'}\n\nTASK:\n${prompt}` }
        ]
      })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data?.error || `Ollama error ${resp.status}`);
    return data?.message?.content || 'No output.';
  };

  const callOpenAI = async ({ prompt, materials, mocks, mode, model }) => {
    const apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_APIKEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY is missing on server');
    const system = mode === 'mock'
      ? 'You are an exam generator. Prefer using the provided source context when generating questions. If the source is insufficient, supplement with reasonable general-knowledge questions on the same subject and mark them with "Allgemein (nicht aus Quelle)" in their header. Reply in the language used in the user request.'
      : 'You are a study tutor. Prefer evidence from the provided source content. If the source covers the question, answer strictly from it. If the source does NOT cover the topic, briefly note that the topic is not in the source, then provide a clear, concise general-knowledge explanation. Mark general-knowledge sections with a leading "Allgemein (nicht aus Quelle):" line so the reader knows the distinction. Reply in the language the user used in the question.';
    const textContext = buildSourceContext(materials, mocks);
    const fileInputs = toOpenAIInputs(materials, mocks);
    const input = [
      { role: 'system', content: [{ type: 'input_text', text: system }] },
      { role: 'user', content: [{ type: 'input_text', text: `SOURCE SUMMARY:\n${textContext || 'No metadata available.'}\n\nTASK:\n${prompt}` }, ...fileInputs] }
    ];
    const resp = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: model || process.env.OPENAI_MODEL || 'gpt-4.1-mini', input, temperature: mode === 'mock' ? 0.7 : 0.2 })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data?.error?.message || `OpenAI error ${resp.status}`);
    return data?.output_text || 'No output.';
  };

  const callModel = async ({ prompt, materials, mocks, mode, model }) => {
    const provider = (process.env.AI_PROVIDER || 'ollama').toLowerCase();
    if (provider === 'openai') return callOpenAI({ prompt, materials, mocks, mode, model });
    return callOllama({ prompt, materials, mocks, mode, model });
  };

  const listModels = async () => {
    const helpful = [
      { id: 'llama3.1:8b', provider: 'ollama', note: 'Fast baseline, good German/English tutoring' },
      { id: 'qwen2.5:14b', provider: 'ollama', note: 'Strong reasoning, good for exam generation' },
      { id: 'mistral-nemo:12b', provider: 'ollama', note: 'Balanced quality/speed' },
      { id: 'deepseek-r1:8b', provider: 'ollama', note: 'Reasoning-heavy answers' },
      { id: 'phi4:14b', provider: 'ollama', note: 'Compact and fast for local setups' }
    ];
    try {
      const resp = await fetch((process.env.OLLAMA_URL || 'http://127.0.0.1:11434') + '/api/tags');
      const data = await resp.json();
      const installed = (data?.models || []).map(m => ({ id: m.name, provider: 'ollama', installed: true }));
      return { helpful, installed };
    } catch {
      return { helpful, installed: [] };
    }
  };

  const handler = async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (!url.pathname.startsWith('/api/ai/')) return false;

      if (url.pathname === '/api/ai/models' && req.method === 'GET') {
        const models = await listModels();
        json(res, 200, { ok: true, ...models });
        return true;
      }
      if (req.method !== 'POST') {
        json(res, 405, { error: 'Method not allowed' });
        return true;
      }
      const body = await readBody(req);
      const materials = Array.isArray(body?.materials) ? body.materials : [];
      const mocks = Array.isArray(body?.mocks) ? body.mocks : [];
      const model = body?.model ? String(body.model) : undefined;

      if (url.pathname === '/api/ai/mock') {
        const subject = body?.subjectName || 'selected subject';
        const difficulty = body?.difficulty || 'medium';
        const prompt = `Generate one full mock exam for ${subject}. Difficulty: ${difficulty}. Include:\n1) Exam instructions\n2) 3 sections\n3) points per question\n4) full answer key\n5) short feedback checklist.`;
        const text = await callModel({ prompt, materials, mocks, mode: 'mock', model });
        json(res, 200, { ok: true, text });
        return true;
      }
      if (url.pathname === '/api/ai/ask') {
        const q = String(body?.question || '').trim();
        if (!q) {
          json(res, 400, { error: 'Missing question' });
          return true;
        }
        const text = await callModel({ prompt: q, materials, mocks, mode: 'qa', model });
        json(res, 200, { ok: true, text });
        return true;
      }
      json(res, 404, { error: 'Not found' });
      return true;
    } catch (err) {
      json(res, 500, { error: String(err?.message || err) });
      return true;
    }
  };

  return {
    name: 'ai-assistant-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const handled = await handler(req, res);
        if (!handled) next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const handled = await handler(req, res);
        if (!handled) next();
      });
    }
  };
}

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/Semester2Plattform/' : '/',
  plugins: [icsProxyPlugin(), aiAssistantPlugin()],
  build: {
    outDir: 'dist',
    assetsDir: 'assets'
  },
  envDir: '.',
})
