// src/useFriends.js
import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

const MOOD_SAMPLE_LIMIT = 500;

export function useFriends(userId) {
  const [friends, setFriends] = useState([]);   // accepted: { friendshipId, otherId, profile, mood }
  const [incoming, setIncoming] = useState([]); // pending, addressed to me
  const [outgoing, setOutgoing] = useState([]); // pending, sent by me
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setLoading(true);

    const { data: rows, error } = await supabase
      .from('friendships')
      .select('id, requester_id, addressee_id, status, created_at, responded_at')
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);

    if (error) {
      console.error('[Friends] fetch error:', error);
      setLoading(false);
      return;
    }

    const accepted = [];
    const inc = [];
    const out = [];
    for (const row of rows || []) {
      const otherId = row.requester_id === userId ? row.addressee_id : row.requester_id;
      // sinceAt: when this became a friendship (falls back to the request's
      // created_at for older rows from before responded_at existed) — used
      // to bubble a freshly-accepted friend to the top of the conversation
      // list even before any messages exist.
      const entry = { friendshipId: row.id, otherId, sinceAt: row.responded_at || row.created_at };
      if (row.status === 'accepted') accepted.push(entry);
      else if (row.status === 'pending') {
        if (row.addressee_id === userId) inc.push(entry);
        else out.push(entry);
      }
    }

    const allIds = [...new Set([...accepted, ...inc, ...out].map((r) => r.otherId))];
    let profileById = {};
    if (allIds.length) {
      const { data: profiles } = await supabase.from('profiles').select('id, username, avatar_url').in('id', allIds);
      profileById = (profiles || []).reduce((acc, p) => ({ ...acc, [p.id]: p }), {});
    }

    let moodById = {};
    const friendIds = accepted.map((f) => f.otherId);
    if (friendIds.length) {
      // is_active, not "most recent ever": a friend's mood should mean
      // "what they're feeling right now" (one active vote per user, see
      // supabase_single_active_vote.sql), not whatever they posted days
      // ago — showing a stale mood as if current would be misleading.
      let { data: moods, error: moodErr } = await supabase
        .from('emotions')
        .select('user_id, emotion, inserted_at')
        .in('user_id', friendIds)
        .eq('is_active', true)
        .order('inserted_at', { ascending: false })
        .limit(MOOD_SAMPLE_LIMIT);
      // is_active doesn't exist until supabase_single_active_vote.sql has
      // run on this project — fall back rather than erroring the whole
      // friends list out.
      if (moodErr?.code === '42703') {
        ({ data: moods } = await supabase
          .from('emotions')
          .select('user_id, emotion, inserted_at')
          .in('user_id', friendIds)
          .gte('inserted_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())
          .order('inserted_at', { ascending: false })
          .limit(MOOD_SAMPLE_LIMIT));
      }
      for (const m of moods || []) {
        if (!moodById[m.user_id]) moodById[m.user_id] = m; // first hit per user = most recent (desc order)
      }
    }

    setFriends(accepted.map((f) => ({ ...f, profile: profileById[f.otherId], mood: moodById[f.otherId] || null })));
    setIncoming(inc.map((f) => ({ ...f, profile: profileById[f.otherId] })));
    setOutgoing(out.map((f) => ({ ...f, profile: profileById[f.otherId] })));
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    refresh();
    if (!userId) return;
    // friendships has Realtime enabled — without this, a new/accepted
    // request only shows up the next time Friends.jsx happens to remount.
    const channel = supabase
      .channel(`friendships-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, refresh)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [refresh, userId]);

  // Live, partial-match discovery — "findable like on Facebook", not a
  // blind exact-username submit. Excludes yourself; the caller (Friends.jsx)
  // filters out people who are already friends/pending.
  const searchUsers = useCallback(async (term) => {
    const q = term.trim();
    if (q.length < 2 || !userId) return [];
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, avatar_url')
      .ilike('username', `%${q}%`)
      .neq('id', userId)
      .limit(8);
    if (error) {
      console.error('[Friends] search error:', error);
      return [];
    }
    return data || [];
  }, [userId]);

  const sendRequestTo = useCallback(async (targetId) => {
    const { error } = await supabase.from('friendships').insert({ requester_id: userId, addressee_id: targetId });
    if (error) {
      if (error.code === '23505') throw new Error('already_requested');
      // RLS WITH CHECK failure (42501) covers more than just the rate
      // limit, but check_friend_request_rate_limit() is the only check()
      // clause on this policy likely to fail for an otherwise-valid
      // request, so it's a safe-enough signal to show a specific message.
      if (error.code === '42501') throw new Error('rate_limited');
      throw error;
    }
    await refresh();
  }, [userId, refresh]);

  const respond = useCallback(async (friendshipId, accept) => {
    if (accept) {
      await supabase.from('friendships')
        .update({ status: 'accepted', responded_at: new Date().toISOString() })
        .eq('id', friendshipId);
    } else {
      await supabase.from('friendships').delete().eq('id', friendshipId);
    }
    await refresh();
  }, [refresh]);

  const removeFriend = useCallback(async (friendshipId) => {
    await supabase.from('friendships').delete().eq('id', friendshipId);
    await refresh();
  }, [refresh]);

  const cancelRequest = removeFriend;

  return { friends, incoming, outgoing, loading, searchUsers, sendRequestTo, respond, removeFriend, cancelRequest };
}

// Lightweight — just a count, for a header badge, without the full
// friends/profiles/moods join useFriends() does.
export function useIncomingRequestCount(userId) {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const { count: c } = await supabase
      .from('friendships')
      .select('id', { count: 'exact', head: true })
      .eq('addressee_id', userId)
      .eq('status', 'pending');
    setCount(c ?? 0);
  }, [userId]);

  useEffect(() => {
    refresh();
    if (!userId) return;
    const channel = supabase
      .channel(`friend-requests-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, refresh)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [userId, refresh]);

  return count;
}
