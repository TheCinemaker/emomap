// src/useEmotionsPolling.js
import { useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';

/**
 * bounds: { north, south, east, west }
 * sessionId: string
 * onBatch: (events[]) => void  — must be stable (wrap with useCallback)
 */
export function useEmotionsPolling(bounds, sessionId, onBatch) {
  const lastFetchRef = useRef(null);

  useEffect(() => {
    if (!bounds) return;
    const { north, south, east, west } = bounds;
    let cancelled = false;

    async function fetchOnce() {
      const sinceIso =
        lastFetchRef.current ||
        new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const { data, error } = await supabase
        .from('emotions')
        .select('id, emotion, lat, lng, inserted_at')
        .gt('inserted_at', sinceIso)
        .eq('session_id', sessionId)
        .gte('lat', south)
        .lte('lat', north)
        .gte('lng', west)
        .lte('lng', east)
        .order('inserted_at', { ascending: true })
        .limit(200);

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

    fetchOnce();
    // 5s, not 3s: this query re-runs per *viewer*, not per voter. At a packed
    // venue/festival, the real scaling risk isn't vote volume (Postgres
    // handles that fine) — it's thousands of phones all polling the same
    // small area simultaneously. A longer interval is a cheap, safe way to
    // cut that load by ~40% with no visible loss of "liveness".
    const id = setInterval(fetchOnce, 5000);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [bounds?.north, bounds?.south, bounds?.east, bounds?.west, sessionId, onBatch]);
}
