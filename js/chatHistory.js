import { supabase } from './supabase.js';

async function currentUserId() {
  const { data } = await supabase.auth.getSession();
  return data?.session?.user?.id || null;
}

export async function loadHistory(sourceId, limit = 50) {
  const userId = await currentUserId();
  if (!userId || !sourceId) return [];
  const { data, error } = await supabase
    .from('ai_chat_messages')
    .select('role, content, created_at')
    .eq('user_id', userId)
    .eq('source_id', sourceId)
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) {
    console.warn('[chatHistory] load failed:', error.message);
    return [];
  }
  return data || [];
}

export async function appendMessage(sourceId, role, content, pdfName) {
  const userId = await currentUserId();
  if (!userId || !sourceId || !content) return null;
  const row = { user_id: userId, source_id: sourceId, role, content, pdf_name: pdfName || null };
  const { data, error } = await supabase
    .from('ai_chat_messages')
    .insert(row)
    .select('id, created_at')
    .single();
  if (error) {
    console.warn('[chatHistory] append failed:', error.message);
    return null;
  }
  return data;
}

export async function clearHistory(sourceId) {
  const userId = await currentUserId();
  if (!userId || !sourceId) return;
  const { error } = await supabase
    .from('ai_chat_messages')
    .delete()
    .eq('user_id', userId)
    .eq('source_id', sourceId);
  if (error) console.warn('[chatHistory] clear failed:', error.message);
}
