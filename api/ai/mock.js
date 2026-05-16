const { json, getBody, callModel } = require('./_lib');

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
    const body = getBody(req);
    const materials = Array.isArray(body?.materials) ? body.materials : [];
    const mocks = Array.isArray(body?.mocks) ? body.mocks : [];
    const model = body?.model ? String(body.model) : undefined;
    const subject = body?.subjectName || 'selected subject';
    const difficulty = body?.difficulty || 'medium';

    const prompt = `Generate one full mock exam for ${subject}. Difficulty: ${difficulty}. Include:
1) Exam instructions
2) 3 sections
3) points per question
4) full answer key
5) short feedback checklist.`;

    const text = await callModel({
      model,
      materials,
      mocks,
      maxTokens: 1800,
      system: [
        'You are an exam generator.',
        'Prefer using the provided source context when generating questions.',
        'If the source is insufficient, supplement with reasonable general-knowledge questions on the same subject and mark them with "Allgemein (nicht aus Quelle)" in their header.',
        'Reply in the language used in the user request.'
      ].join(' '),
      prompt
    });
    return json(res, 200, { ok: true, text });
  } catch (err) {
    return json(res, 500, { error: String(err?.message || err) });
  }
};
