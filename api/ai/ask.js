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
    const provider = body?.provider ? String(body.provider) : undefined;
    const history = Array.isArray(body?.history) ? body.history : [];

    const text = await callModel({
      model,
      provider,
      materials,
      mocks,
      history,
      maxTokens: 1500,
      system: [
        'You are a study tutor.',
        'Prefer evidence from the provided source content. If the source covers the question, answer strictly from it.',
        'If the source does NOT cover the topic, briefly note that the topic is not in the source, then provide a clear, concise general-knowledge explanation.',
        'Mark general-knowledge sections with a leading "Allgemein (nicht aus Quelle):" line so the reader knows the distinction.',
        'Reply in the language the user used in the question.'
      ].join(' '),
      prompt: question
    });
    return json(res, 200, { ok: true, text });
  } catch (err) {
    return json(res, 500, { error: String(err?.message || err) });
  }
};
