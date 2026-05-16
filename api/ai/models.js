const { json } = require('./_lib');

module.exports = async (req, res) => {
  try {
    if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
    const helpful = [
      { id: 'qwen/qwen3.6-flash', provider: 'openrouter', note: 'Fast baseline, good tutoring quality' },
      { id: 'meta-llama/llama-3.1-8b-instruct', provider: 'openrouter', note: 'Reliable small model for tutoring' },
      { id: 'qwen/qwen3.6-plus', provider: 'openrouter', note: 'Strong reasoning and structure' },
      { id: 'mistralai/mistral-medium-3.5', provider: 'openrouter', note: 'Balanced quality and speed' },
      { id: 'deepseek/deepseek-v3.2', provider: 'openrouter', note: 'Strong reasoning for hard questions' },
      { id: 'microsoft/phi-4-mini-instruct', provider: 'openrouter', note: 'Compact model for low cost' }
    ];
    return json(res, 200, { ok: true, helpful, installed: [] });
  } catch (err) {
    return json(res, 500, { error: String(err?.message || err) });
  }
};
