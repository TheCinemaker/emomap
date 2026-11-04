// src/useReplay.js
// "Replay": fetch the last 24h of votes in the current view once, bucket
// them per hour, and hand back 24 pre-built grids so the UI can scrub/
// animate through them without re-querying. This is the other cold-start
// answer alongside the live global grid — a slow, hypnotic "how did the
// world's mood move in the last day" loop that's worth watching (and
// recording) even with very few real users.
import { useCallback, useState } from 'react';
import { supabase } from './supabaseClient';
import { calculateCellSize, buildGridCells } from './moodGridUtils';

export const REPLAY_HOURS = 24;
const HOURS = REPLAY_HOURS;
const MAX_FETCH_LIMIT = 20000;

export function useReplay() {
  const [hourlyGrids, setHourlyGrids] = useState(null); // Array<cells> | null
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async (bounds, mapZoom) => {
    if (!bounds) return;
    const { north, south, east, west } = bounds;
    setLoading(true);
    setError(null);

    try {
      const since = new Date(Date.now() - HOURS * 60 * 60 * 1000);

      const { data, error: err } = await supabase
        .from('emotions')
        .select('emotion, lat, lng, inserted_at')
        .gte('inserted_at', since.toISOString())
        .gte('lat', south).lte('lat', north)
        .gte('lng', west).lte('lng', east)
        .limit(MAX_FETCH_LIMIT);

      if (err) throw err;

      const cellSizeDeg = calculateCellSize(mapZoom);
      const buckets = Array.from({ length: HOURS }, () => []);

      for (const row of data || []) {
        const ageMs = Date.now() - new Date(row.inserted_at).getTime();
        const hourIndex = HOURS - 1 - Math.min(HOURS - 1, Math.floor(ageMs / (60 * 60 * 1000)));
        buckets[hourIndex].push(row);
      }

      setHourlyGrids(buckets.map((rows) => buildGridCells(rows, cellSizeDeg)));
    } catch (err) {
      console.error('[Replay] load error:', err);
      setError(err.message || 'Replay load error');
      setHourlyGrids(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => setHourlyGrids(null), []);

  return { hourlyGrids, loading, error, load, reset };
}
