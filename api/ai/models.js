const { json } = require('./_lib');

module.exports = async (req, res) => {
  try {
    if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
    const helpful = [
      { id: 'qwen/qwen3.6-flash', provider: 'openrouter', note: 'Fast baseline, good tutoring quality' }
    ];
    return json(res, 200, { ok: true, helpful, installed: [] });
  } catch (err) {
    return json(res, 500, { error: String(err?.message || err) });
  }
};
