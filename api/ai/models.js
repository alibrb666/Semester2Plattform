const { json } = require('./_lib');

module.exports = async (req, res) => {
  try {
    if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
    const helpful = [
      { id: 'qwen/qwen3.6-flash', provider: 'openrouter', note: 'Fast baseline, good tutoring quality' },
      { id: 'qwen/qwen3.5-flash', provider: 'openrouter', note: 'Alternative fast Qwen model' },
      { id: 'openai/gpt-5.4', provider: 'openrouter', note: 'OpenAI frontier, strong reasoning and coding' },
      { id: 'openai/gpt-5.4-mini', provider: 'openrouter', note: 'Fast and cheap OpenAI' },
      { id: 'openai/gpt-5.5', provider: 'openrouter', note: 'Next-gen OpenAI, stronger reasoning' },
      { id: 'anthropic/claude-opus-4.7', provider: 'openrouter', note: 'Anthropic flagship for long agentic tasks' },
      { id: 'anthropic/claude-opus-4.6-fast', provider: 'openrouter', note: 'Fast-mode Opus, ~6x output speed' },
      { id: 'google/gemini-3.1-flash-lite', provider: 'openrouter', note: 'Low-latency multimodal Google model' },
      { id: 'mistralai/mistral-medium-3.5', provider: 'openrouter', note: 'Dense 128B instruction-following' },
      { id: 'deepseek/deepseek-v4-pro', provider: 'openrouter', note: 'Strong reasoning for hard questions' },
      { id: 'deepseek/deepseek-v4-flash', provider: 'openrouter', note: 'Fast DeepSeek for cheap reasoning' }
    ];
    return json(res, 200, { ok: true, helpful, installed: [] });
  } catch (err) {
    return json(res, 500, { error: String(err?.message || err) });
  }
};
