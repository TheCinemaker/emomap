// src/useMoodGrid.js
import { useEffect, useRef, useState } from 'react';
import { supabase } from './supabaseClient';
import { calculateCellSize, buildGridCells } from './moodGridUtils';

const MAX_FETCH_LIMIT = 20000;

export function useMoodGrid(bounds, sessionId, mapZoom, extraData = []) {
  const [cells, setCells] = useState([]);
  const [loading, setLoading] = useState(false);
  const [totalPoints, setTotalPoints] = useState(0);
  const [warning, setWarning] = useState(null);

  // Keep the latest extraData in a ref so the effect can read it without re-subscribing
  const extraDataRef = useRef(extraData);
  useEffect(() => { extraDataRef.current = extraData; }, [extraData]);

  useEffect(() => {
    if (!bounds || mapZoom === undefined) return;
    const { north, south, east, west } = bounds;
    if (
      typeof north !== 'number' ||
      typeof south !== 'number' ||
      typeof east !== 'number' ||
      typeof west !== 'number'
    ) {
      return;
    }

    const cellSizeDeg = calculateCellSize(mapZoom);
    let cancelled = false;

    async function load() {
      setLoading(true);
      setWarning(null);

      try {
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        const { data, error } = await supabase
          .from('emotions')
          .select('emotion, lat, lng')
          .gte('inserted_at', since)
          .gte('lat', south)
          .lte('lat', north)
          .gte('lng', west)
          .lte('lng', east)
          .limit(MAX_FETCH_LIMIT);

        if (cancelled) return;

        if (error) {
          console.error('[MoodGrid] supabase error:', error);
          setCells([]);
          setTotalPoints(0);
          setLoading(false);
          return;
        }

        if (!data) return;

        const relevantExtraData = extraDataRef.current.filter(d =>
          d.lat >= south && d.lat <= north &&
          d.lng >= west && d.lng <= east
        );

        const allData = [...data, ...relevantExtraData];

        if (data.length === MAX_FETCH_LIMIT) {
          setWarning(`Data limited to ${MAX_FETCH_LIMIT}+ points — zoom in for accuracy`);
        }

        setTotalPoints(allData.length);

        const result = buildGridCells(allData, cellSizeDeg);

        if (!cancelled) {
          setCells(result);
          setLoading(false);
        }
      } catch (err) {
        if (cancelled) return;
        console.error('[MoodGrid] unexpected error:', err);
        setCells([]);
        setTotalPoints(0);
        setLoading(false);
        setWarning('Data fetch error');
      }
    }

    load();
    const interval = setInterval(load, 10000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [bounds?.north, bounds?.south, bounds?.east, bounds?.west, mapZoom, sessionId]);

  return { cells, loading, totalPoints, warning };
}
