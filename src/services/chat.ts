/** Messagerie temps réel — Supabase Realtime (postgres_changes sur `messages`, filtré par RLS). */
import { DEMO_MODE } from '@/lib/config';
import { requireSupabase } from '@/lib/supabase';
import { useApp } from '@/store/app';
import { conversations as demoConversations, messages as demoMessages, DEMO_USER_ID } from '@/data/mock';
import type { Conversation, Message } from '@/types';
import { photoUrl } from './meals';

const MESSAGE_COLUMNS = 'id, conversationId:conversation_id, senderId:sender_id, body, kind, createdAt:created_at, masked';

export async function fetchConversations(): Promise<Conversation[]> {
  if (DEMO_MODE) return demoConversations;
  const { data, error } = await requireSupabase().rpc('my_conversations');
  if (error) throw error;
  return ((data as Conversation[]) ?? []).map((c) => ({ ...c, mealPhoto: c.mealPhoto ? photoUrl(c.mealPhoto) : undefined }));
}

export async function fetchMessages(conversationId: string): Promise<Message[]> {
  if (DEMO_MODE) return [...(demoMessages[conversationId] ?? [])];
  const { data, error } = await requireSupabase()
    .from('messages')
    .select(MESSAGE_COLUMNS)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) throw error;
  return (data as unknown as Message[]) ?? [];
}

export async function sendMessage(conversationId: string, senderId: string, body: string): Promise<Message> {
  const trimmed = body.trim().slice(0, 2000);
  if (DEMO_MODE) {
    const m: Message = {
      id: `local-${Date.now()}`,
      conversationId,
      senderId: senderId || DEMO_USER_ID,
      body: trimmed,
      kind: 'text',
      createdAt: new Date().toISOString(),
    };
    (demoMessages[conversationId] ??= []).push(m);
    return m;
  }
  const { data, error } = await requireSupabase()
    .from('messages')
    .insert({ conversation_id: conversationId, sender_id: senderId, body: trimmed })
    .select(MESSAGE_COLUMNS)
    .single();
  if (error) throw error;
  return data as unknown as Message;
}

export async function markConversationRead(conversationId: string) {
  if (DEMO_MODE) return;
  await requireSupabase().rpc('mark_conversation_read', { p_conversation_id: conversationId });
}

export function subscribeToConversation(conversationId: string, onMessage: (m: Message) => void): () => void {
  if (DEMO_MODE) return () => {};
  const sb = requireSupabase();
  const channel = sb
    .channel(`conv:${conversationId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` }, (payload) => {
      const r = payload.new as Record<string, string | boolean>;
      onMessage({
        id: String(r.id),
        conversationId: String(r.conversation_id),
        senderId: String(r.sender_id),
        body: String(r.body),
        kind: r.kind as Message['kind'],
        createdAt: String(r.created_at),
        masked: r.masked === true,
      });
    })
    .subscribe();
  return () => {
    sb.removeChannel(channel);
  };
}

/** Recalcule le nombre total de messages non lus (pastille de l'onglet Messages). */
export async function refreshUnread() {
  if (DEMO_MODE) return useApp.getState().setUnread(1);
  const list = await fetchConversations();
  useApp.getState().setUnread(list.reduce((n, c) => n + Number(c.unread || 0), 0));
}

/** Tout nouveau message dans une de MES conversations (la RLS filtre le flux Realtime). */
export function subscribeToMyMessages(onChange: () => void): () => void {
  if (DEMO_MODE) return () => {};
  const sb = requireSupabase();
  const channel = sb
    .channel('my-messages')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => onChange())
    .subscribe();
  return () => {
    sb.removeChannel(channel);
  };
}
