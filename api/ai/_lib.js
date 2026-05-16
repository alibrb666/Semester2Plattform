function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function getBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return {};
}

function buildSourceContext(materials = [], mocks = []) {
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
}

async function callOpenRouter({ model, system, prompt, materials, mocks, maxTokens }) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY missing on server');

  const body = {
    model: model || process.env.OPENROUTER_MODEL || 'qwen/qwen3.6-flash',
    messages: [
      { role: 'system', content: system },
      {
        role: 'user',
        content: `SOURCE SUMMARY:\n${buildSourceContext(materials, mocks) || 'No metadata available.'}\n\nTASK:\n${prompt}`
      }
    ],
    max_completion_tokens: maxTokens || 1200,
    temperature: 0.3
  };

  const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://vercel.app',
      'X-Title': process.env.OPENROUTER_APP_NAME || 'Lernplattform'
    },
    body: JSON.stringify(body)
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data?.error?.message || `OpenRouter error ${resp.status}`);
  return data?.choices?.[0]?.message?.content || 'No output.';
}

async function callOpenAI({ model, system, prompt, materials, mocks, maxTokens }) {
  const apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_APIKEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY missing on server');
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: model || process.env.OPENAI_MODEL || 'gpt-4.1-mini',
      messages: [
        { role: 'system', content: system },
        {
          role: 'user',
          content: `SOURCE SUMMARY:\n${buildSourceContext(materials, mocks) || 'No metadata available.'}\n\nTASK:\n${prompt}`
        }
      ],
      max_tokens: maxTokens || 1200,
      temperature: 0.3
    })
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data?.error?.message || `OpenAI error ${resp.status}`);
  return data?.choices?.[0]?.message?.content || 'No output.';
}

async function callModel(args) {
  const provider = (process.env.AI_PROVIDER || 'openrouter').toLowerCase();
  if (provider === 'openai') return callOpenAI(args);
  return callOpenRouter(args);
}

module.exports = {
  json,
  getBody,
  callModel
};
