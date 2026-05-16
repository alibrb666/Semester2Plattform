const { json } = require('./_lib');

module.exports = async (req, res) => {
  try {
    if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
    const gemini = [
      { id: 'gemini-2.5-flash', provider: 'gemini', tier: 'free', note: 'Generous free quota (~1500/day), fast' },
      { id: 'gemini-2.5-flash-lite', provider: 'gemini', tier: 'free', note: 'Fastest Gemini, generous free quota' },
      { id: 'gemini-2.5-pro', provider: 'gemini', tier: 'free', note: 'Most capable Gemini, smaller free quota' }
    ];
    const openrouterFree = [
      { id: 'google/gemma-4-31b-it:free', provider: 'openrouter', tier: 'free', note: '30.7B dense multimodal, 256K context' },
      { id: 'google/gemma-4-26b-a4b-it:free', provider: 'openrouter', tier: 'free', note: 'MoE, ~31B quality with 3.8B active' },
      { id: 'deepseek/deepseek-v4-flash:free', provider: 'openrouter', tier: 'free', note: 'Fast reasoning, 1M-token context' },
      { id: 'arcee-ai/trinity-large-thinking:free', provider: 'openrouter', tier: 'free', note: 'Strong reasoning, open source' },
      { id: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free', provider: 'openrouter', tier: 'free', note: 'Multimodal reasoning, agentic' }
    ];
    const openrouterPaid = [
      { id: 'qwen/qwen3.6-flash', provider: 'openrouter', tier: 'paid', note: 'Fast baseline, good tutoring quality' },
      { id: 'qwen/qwen3.5-flash', provider: 'openrouter', tier: 'paid', note: 'Alternative fast Qwen model' },
      { id: 'openai/gpt-5.4', provider: 'openrouter', tier: 'paid', note: 'OpenAI frontier, strong reasoning and coding' },
      { id: 'openai/gpt-5.4-mini', provider: 'openrouter', tier: 'paid', note: 'Fast and cheap OpenAI' },
      { id: 'openai/gpt-5.5', provider: 'openrouter', tier: 'paid', note: 'Next-gen OpenAI, stronger reasoning' },
      { id: 'anthropic/claude-opus-4.7', provider: 'openrouter', tier: 'paid', note: 'Anthropic flagship for long agentic tasks' },
      { id: 'anthropic/claude-opus-4.6-fast', provider: 'openrouter', tier: 'paid', note: 'Fast-mode Opus, ~6x output speed' },
      { id: 'google/gemini-3.1-flash-lite', provider: 'openrouter', tier: 'paid', note: 'Low-latency multimodal Google model' },
      { id: 'mistralai/mistral-medium-3.5', provider: 'openrouter', tier: 'paid', note: 'Dense 128B instruction-following' },
      { id: 'deepseek/deepseek-v4-pro', provider: 'openrouter', tier: 'paid', note: 'Strong reasoning for hard questions' },
      { id: 'deepseek/deepseek-v4-flash', provider: 'openrouter', tier: 'paid', note: 'Fast DeepSeek for cheap reasoning' }
    ];
    return json(res, 200, {
      ok: true,
      gemini,
      openrouterFree,
      openrouterPaid,
      helpful: [...gemini, ...openrouterFree, ...openrouterPaid],
      installed: []
    });
  } catch (err) {
    return json(res, 500, { error: String(err?.message || err) });
  }
};
