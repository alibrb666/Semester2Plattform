const { json } = require('./_lib');

module.exports = async (req, res) => {
  try {
    if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
    const free = [
      { id: 'google/gemma-4-31b-it:free', tier: 'free', note: '30.7B dense multimodal, 256K context' },
      { id: 'google/gemma-4-26b-a4b-it:free', tier: 'free', note: 'MoE, ~31B quality with 3.8B active' },
      { id: 'deepseek/deepseek-v4-flash:free', tier: 'free', note: 'Fast reasoning, 1M-token context' },
      { id: 'arcee-ai/trinity-large-thinking:free', tier: 'free', note: 'Strong reasoning, open source' },
      { id: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free', tier: 'free', note: 'Multimodal reasoning, agentic' }
    ];
    const paid = [
      { id: 'qwen/qwen3.6-flash', tier: 'paid', note: 'Fast baseline, good tutoring quality' },
      { id: 'qwen/qwen3.5-flash', tier: 'paid', note: 'Alternative fast Qwen model' },
      { id: 'openai/gpt-5.4', tier: 'paid', note: 'OpenAI frontier, strong reasoning and coding' },
      { id: 'openai/gpt-5.4-mini', tier: 'paid', note: 'Fast and cheap OpenAI' },
      { id: 'openai/gpt-5.5', tier: 'paid', note: 'Next-gen OpenAI, stronger reasoning' },
      { id: 'anthropic/claude-opus-4.7', tier: 'paid', note: 'Anthropic flagship for long agentic tasks' },
      { id: 'anthropic/claude-opus-4.6-fast', tier: 'paid', note: 'Fast-mode Opus, ~6x output speed' },
      { id: 'google/gemini-3.1-flash-lite', tier: 'paid', note: 'Low-latency multimodal Google model' },
      { id: 'mistralai/mistral-medium-3.5', tier: 'paid', note: 'Dense 128B instruction-following' },
      { id: 'deepseek/deepseek-v4-pro', tier: 'paid', note: 'Strong reasoning for hard questions' },
      { id: 'deepseek/deepseek-v4-flash', tier: 'paid', note: 'Fast DeepSeek for cheap reasoning' }
    ];
    return json(res, 200, { ok: true, free, paid, helpful: [...free, ...paid], installed: [] });
  } catch (err) {
    return json(res, 500, { error: String(err?.message || err) });
  }
};
