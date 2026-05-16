const { json } = require('./_lib');

module.exports = async (req, res) => {
  try {
    if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
    const helpful = [
      { id: 'meta-llama/llama-3.1-8b-instruct', provider: 'openrouter', note: 'Fast baseline, good tutoring quality' },
      { id: 'qwen/qwen-2.5-14b-instruct', provider: 'openrouter', note: 'Strong reasoning and structure' },
      { id: 'mistralai/mistral-nemo', provider: 'openrouter', note: 'Balanced quality/speed' },
      { id: 'deepseek/deepseek-r1-distill-llama-70b', provider: 'openrouter', note: 'Great reasoning for hard questions' },
      { id: 'microsoft/phi-4', provider: 'openrouter', note: 'Compact model for low cost' }
    ];
    return json(res, 200, { ok: true, helpful, installed: [] });
  } catch (err) {
    return json(res, 500, { error: String(err?.message || err) });
  }
};

