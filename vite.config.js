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
    const lines = [];
    materials.forEach((m, i) => {
      lines.push(`[Material ${i + 1}] subject=${m.subjectName || m.subjectId || '-'} kind=${m.kind || '-'} title=${m.title || '-'}`);
      if (m.note) lines.push(`note: ${m.note}`);
      if (m.pdfAttachment?.name) lines.push(`pdf: ${m.pdfAttachment.name}`);
    });
    mocks.forEach((m, i) => {
      lines.push(`[Mock ${i + 1}] subject=${m.subjectName || m.subjectId || '-'} score=${m.score ?? '-'} max=${m.maxScore ?? '-'}`);
      if (m.note) lines.push(`note: ${m.note}`);
      if (m.pdfAttachment?.name) lines.push(`pdf: ${m.pdfAttachment.name}`);
    });
    return lines.join('\n');
  };

  const toOpenAIInputs = (materials = [], mocks = []) => {
    const items = [];
    for (const m of [...materials, ...mocks]) {
      const d = m?.pdfAttachment?.dataUrl;
      if (!d || typeof d !== 'string' || !d.startsWith('data:')) continue;
      const comma = d.indexOf(',');
      if (comma < 0) continue;
      const b64 = d.slice(comma + 1);
      items.push({
        type: 'input_file',
        filename: m?.pdfAttachment?.name || 'document.pdf',
        file_data: b64
      });
    }
    return items;
  };

  const callOpenAI = async ({ prompt, materials, mocks, mode }) => {
    const apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_APIKEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY is missing on server');

    const system = mode === 'mock'
      ? 'You are an exam generator. Create a realistic mock exam with points, sections, answer key and grading rubric. Use only provided source content. If source is insufficient, say what is missing.'
      : 'You are a study tutor. Answer only with evidence from provided source content. If uncertain, say so and ask for more source PDFs.';

    const textContext = buildSourceContext(materials, mocks);
    const fileInputs = toOpenAIInputs(materials, mocks);

    const input = [
      { role: 'system', content: [{ type: 'input_text', text: system }] },
      {
        role: 'user',
        content: [
          { type: 'input_text', text: `SOURCE SUMMARY:\n${textContext || 'No metadata available.'}\n\nTASK:\n${prompt}` },
          ...fileInputs
        ]
      }
    ];

    const resp = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
        input,
        temperature: mode === 'mock' ? 0.7 : 0.2
      })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data?.error?.message || `OpenAI error ${resp.status}`);
    return data?.output_text || 'No output.';
  };

  const handler = async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (!url.pathname.startsWith('/api/ai/')) return false;
      if (req.method !== 'POST') {
        json(res, 405, { error: 'Method not allowed' });
        return true;
      }
      const body = await readBody(req);
      const materials = Array.isArray(body?.materials) ? body.materials : [];
      const mocks = Array.isArray(body?.mocks) ? body.mocks : [];

      if (url.pathname === '/api/ai/mock') {
        const subject = body?.subjectName || 'selected subject';
        const difficulty = body?.difficulty || 'medium';
        const prompt = `Generate one full mock exam for ${subject}. Difficulty: ${difficulty}. Include:\n1) Exam instructions\n2) 3 sections\n3) points per question\n4) full answer key\n5) short feedback checklist.`;
        const text = await callOpenAI({ prompt, materials, mocks, mode: 'mock' });
        json(res, 200, { ok: true, text });
        return true;
      }
      if (url.pathname === '/api/ai/ask') {
        const q = String(body?.question || '').trim();
        if (!q) {
          json(res, 400, { error: 'Missing question' });
          return true;
        }
        const text = await callOpenAI({ prompt: q, materials, mocks, mode: 'qa' });
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
