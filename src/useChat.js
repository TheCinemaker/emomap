// src/useChat.js
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabaseClient';

const HISTORY_LIMIT = 200;

export function useChat(userId, friendId) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const channelRef = useRef(null);

  const markRead = useCallback(async (rows) => {
    const unreadIds = rows.filter((m) => m.recipient_id === userId && !m.read_at).map((m) => m.id);
    if (!unreadIds.length) return;
    await supabase.from('messages').update({ read_at: new Date().toISOString() }).in('id', unreadIds);
  }, [userId]);

  const load = useCallback(async () => {
    if (!userId || !friendId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('messages')
      .select('id, sender_id, recipient_id, body, created_at, read_at')
      .or(`and(sender_id.eq.${userId},recipient_id.eq.${friendId}),and(sender_id.eq.${friendId},recipient_id.eq.${userId})`)
      .order('created_at', { ascending: true })
      .limit(HISTORY_LIMIT);

    if (error) { console.error('[Chat] load error:', error); setLoading(false); return; }
    setMessages(data || []);
    setLoading(false);
    markRead(data || []);
  }, [userId, friendId, markRead]);

  useEffect(() => {
    load();
    if (!userId || !friendId) return;

    const channel = supabase
      .channel(`chat-${[userId, friendId].sort().join('-')}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const m = payload.new;
        const isThisConversation =
          (m.sender_id === userId && m.recipient_id === friendId) ||
          (m.sender_id === friendId && m.recipient_id === userId);
        if (!isThisConversation) return;
        setMessages((prev) => (prev.some((p) => p.id === m.id) ? prev : [...prev, m]));
        if (m.recipient_id === userId) markRead([m]);
      })
      .subscribe();

    channelRef.current = channel;
    return () => supabase.removeChannel(channel);
  }, [load, userId, friendId, markRead]);

  const send = useCallback(async (body) => {
    const text = body.trim();
    if (!text || !userId || !friendId) return;
    setSending(true);
    const tempId = `temp_${Date.now()}`;
    const optimistic = { id: tempId, sender_id: userId, recipient_id: friendId, body: text, created_at: new Date().toISOString(), read_at: null };
    setMessages((prev) => [...prev, optimistic]);

    const { data, error } = await supabase
      .from('messages')
      .insert({ sender_id: userId, recipient_id: friendId, body: text })
      .select()
      .single();

    setSending(false);
    if (error) {
      console.error('[Chat] send error:', error);
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      return;
    }
    setMessages((prev) => prev.map((m) => (m.id === tempId ? data : m)));
  }, [userId, friendId]);

  return { messages, loading, sending, send };
}

// Total unread count across all conversations — for a header badge.
export function useUnreadMessageCount(userId) {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const { count: c } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_id', userId)
      .is('read_at', null);
    setCount(c ?? 0);
  }, [userId]);

  useEffect(() => {
    refresh();
    if (!userId) return;
    const channel = supabase
      .channel(`unread-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, refresh)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [userId, refresh]);

  return count;
}
