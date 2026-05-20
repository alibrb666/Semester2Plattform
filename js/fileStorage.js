import { supabase, isSupabaseFallback } from './supabase.js';

const BUCKET = 'materials';

function extFromName(name = '') {
  const i = String(name).lastIndexOf('.');
  return i >= 0 ? String(name).slice(i).toLowerCase() : '.pdf';
}

function safeSegment(v) {
  return String(v || '').replace(/[^a-zA-Z0-9_-]/g, '_');
}

async function fileToDataUrl(file) {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden.'));
    reader.readAsDataURL(file);
  });
}

export async function uploadPdfFile({ userId, subjectId = 'general', file }) {
  if (!file) throw new Error('Datei fehlt.');
  if (isSupabaseFallback) {
    return {
      name: file.name || 'Dokument.pdf',
      dataUrl: await fileToDataUrl(file),
      mimeType: file.type || 'application/pdf',
      size: Number(file.size || 0),
      uploadedAt: new Date().toISOString()
    };
  }
  const { data, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  const authUid = data?.user?.id;
  const uid = safeSegment(authUid || userId);
  if (!uid) throw new Error('Keine gültige Nutzer-ID gefunden.');
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
