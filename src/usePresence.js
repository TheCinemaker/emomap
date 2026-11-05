// src/usePresence.js
// Who's online right now — Supabase Realtime Presence, not a DB table.
// Mount this ONCE for the logged-in user (App.jsx, for the whole session),
// not per-screen: it tracks yourself as "online" for as long as it's
// mounted, so mounting it only inside FriendsPage would make you look
// offline to friends the moment you leave that tab.
import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

const PRESENCE_CHANNEL = 'presence:online';

export function usePresence(userId) {
  const [onlineIds, setOnlineIds] = useState(new Set());

  useEffect(() => {
    if (!userId) return;

    const channel = supabase.channel(PRESENCE_CHANNEL, {
      config: { presence: { key: userId } },
    });

    channel.on('presence', { event: 'sync' }, () => {
      setOnlineIds(new Set(Object.keys(channel.presenceState())));
    });

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({ online_at: new Date().toISOString() });
      }
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return onlineIds;
}
