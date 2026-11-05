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
    // order DESC + limit, then reverse client-side — ordering ASC with a
    // LIMIT returns the OLDEST N messages, not the most recent N, so any
    // conversation past 200 messages would load ancient history instead
    // of what was actually recent.
    const { data, error } = await supabase
      .from('messages')
      .select('id, sender_id, recipient_id, body, created_at, read_at')
      .or(`and(sender_id.eq.${userId},recipient_id.eq.${friendId}),and(sender_id.eq.${friendId},recipient_id.eq.${userId})`)
      .order('created_at', { ascending: false })
      .limit(HISTORY_LIMIT);

    if (error) { console.error('[Chat] load error:', error); setLoading(false); return; }
    setMessages((data || []).slice().reverse());
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
        setMessages((prev) => {
          if (prev.some((p) => p.id === m.id)) return prev; // already have the real row
          // If this is our own message, the realtime push can arrive before
          // the insert().select() HTTP response that normally swaps the
          // optimistic temp_ entry for the real one — in that order, the
          // temp entry is still in `prev` with a different id, so the dedupe
          // check above never catches it, and send()'s later swap plus this
          // append would otherwise both land, duplicating the bubble. Match
          // by the known temp_ prefix + sender + body and replace in place.
          const tempIdx = prev.findIndex(
            (p) => typeof p.id === 'string' && p.id.startsWith('temp_') && p.sender_id === m.sender_id && p.body === m.body
          );
          if (tempIdx !== -1) {
            const next = prev.slice();
            next[tempIdx] = m;
            return next;
          }
          return [...prev, m];
        });
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

// Per-friend conversation preview (last message + its time + unread count)
// for the Messenger-style friends list: which conversation to show at the
// top, and what snippet/badge to show on each row. Pulls the most recent
// PREVIEW_FETCH_LIMIT messages across ALL of the user's conversations in
// one query (same "take the most recent N, reduce client-side to one per
// key" pattern as useFriends' mood lookup), not one query per friend.
const PREVIEW_FETCH_LIMIT = 500;

export function useConversationPreviews(userId, friendIds) {
  const [previews, setPreviews] = useState({}); // otherId -> { lastMessage, lastAt, unreadCount }
  const friendIdsKey = friendIds.join(',');

  const load = useCallback(async () => {
    if (!userId || !friendIdsKey) { setPreviews({}); return; }
    const ids = friendIdsKey.split(',');
    const idSet = new Set(ids);

    const { data, error } = await supabase
      .from('messages')
      .select('sender_id, recipient_id, body, created_at, read_at')
      .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
      .order('created_at', { ascending: false })
      .limit(PREVIEW_FETCH_LIMIT);

    if (error) { console.error('[Chat] preview load error:', error); return; }

    const map = {};
    for (const m of data || []) {
      const otherId = m.sender_id === userId ? m.recipient_id : m.sender_id;
      if (!idSet.has(otherId)) continue;
      if (!map[otherId]) {
        map[otherId] = { lastMessage: m.body, lastAt: m.created_at, unreadCount: 0 };
      }
      if (m.recipient_id === userId && !m.read_at) {
        map[otherId].unreadCount += 1;
      }
    }
    setPreviews(map);
  }, [userId, friendIdsKey]);

  useEffect(() => {
    load();
    if (!userId) return;
    const channel = supabase
      .channel(`conv-previews-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, load)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [load, userId]);

  return previews;
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
