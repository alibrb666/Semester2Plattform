const { json, getBody, callModel } = require('./_lib');

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
    const body = getBody(req);
    const question = String(body?.question || '').trim();
    if (!question) return json(res, 400, { error: 'Missing question' });

    const materials = Array.isArray(body?.materials) ? body.materials : [];
    const mocks = Array.isArray(body?.mocks) ? body.mocks : [];
    const model = body?.model ? String(body.model) : undefined;

    const text = await callModel({
      model,
      materials,
      mocks,
      system: 'You are a study tutor. Answer only with evidence from provided source content. If uncertain, say so.',
      prompt: question
    });
    return json(res, 200, { ok: true, text });
  } catch (err) {
    return json(res, 500, { error: String(err?.message || err) });
  }
};

