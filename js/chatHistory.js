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

export async function listConversations({ limit = 500 } = {}) {
  const userId = await currentUserId();
  if (!userId) return [];
  const { data, error } = await supabase
    .from('ai_chat_messages')
    .select('source_id, pdf_name, role, content, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.warn('[chatHistory] listConversations failed:', error.message);
    return [];
  }
  const map = new Map();
  for (const row of data || []) {
    const cur = map.get(row.source_id);
    if (!cur) {
      map.set(row.source_id, {
        source_id: row.source_id,
        pdf_name: row.pdf_name || '',
        last_at: row.created_at,
        count: 1,
        first_user_message: row.role === 'user' ? row.content : ''
      });
    } else {
      cur.count++;
      if (row.role === 'user') cur.first_user_message = row.content;
      if (!cur.pdf_name && row.pdf_name) cur.pdf_name = row.pdf_name;
    }
  }
  return Array.from(map.values()).sort((a, b) => new Date(b.last_at) - new Date(a.last_at));
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
