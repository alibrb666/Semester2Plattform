import { supabase, isSupabaseFallback } from './supabase.js';

const BUCKET = 'materials';

function extFromName(name = '') {
  const i = String(name).lastIndexOf('.');
  return i >= 0 ? String(name).slice(i).toLowerCase() : '.pdf';
}

function safeSegment(v) {
  return String(v || '').replace(/[^a-zA-Z0-9_-]/g, '_');
}

export async function uploadPdfFile({ userId, subjectId = 'general', file }) {
  if (!file) throw new Error('Datei fehlt.');
  if (isSupabaseFallback) throw new Error('Cloud ist nicht aktiv.');
  const uid = safeSegment(userId);
  const sid = safeSegment(subjectId || 'general');
  const path = `${uid}/${sid}/${crypto.randomUUID()}${extFromName(file.name)}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || 'application/pdf'
  });
  if (error) throw error;
  return {
    name: file.name || 'Dokument.pdf',
    storagePath: path,
    mimeType: file.type || 'application/pdf',
    size: Number(file.size || 0),
    uploadedAt: new Date().toISOString()
  };
}

export async function getPdfPreviewUrl(attachment) {
  if (!attachment) return null;
  if (attachment.dataUrl) return attachment.dataUrl;
  if (!attachment.storagePath || isSupabaseFallback) return null;
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(attachment.storagePath, 60 * 60);
  if (error) throw error;
  return data?.signedUrl || null;
}

