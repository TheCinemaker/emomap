// src/useEmotionsPolling.js
import { useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';

/**
 * bounds: { north, south, east, west }
 * sessionId: string
 * onBatch: function(events[])
 */
export function useEmotionsPolling(bounds, sessionId, onBatch) {
  const lastFetchRef = useRef(null);

  useEffect(() => {
    if (!bounds) return;
    let cancelled = false;

    async function fetchOnce() {
      const sinceIso =
        lastFetchRef.current ||
        new Date(Date.now() - 10 * 1000).toISOString(); // az első kör: utolsó 10 mp

      let query = supabase
        .from('emotions')
        .select('*')
        .gt('inserted_at', sinceIso)
        .eq('session_id', sessionId)
        .order('inserted_at', { ascending: true })
        .limit(200);

      query = query
        .gte('lat', bounds.south)
        .lte('lat', bounds.north)
        .gte('lng', bounds.west)
        .lte('lng', bounds.east);

      const { data, error } = await query;

      if (cancelled) return;
      if (error) {
        console.error('Polling error:', error);
        return;
      }

      if (data && data.length > 0) {
        lastFetchRef.current = data[data.length - 1].inserted_at;
        onBatch?.(data);
      }
    }

    // első lehúzás azonnal
    fetchOnce();

    // 3 mp-enként poll
    const id = setInterval(fetchOnce, 3000);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [bounds, sessionId, onBatch]);
}
