// src/useMoodGrid.js
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabaseClient';
import { calculateCellSize, buildGridCells, EMOTION_RGB, MAX_RENDERED_CELLS, cellIntensity } from './moodGridUtils';

// Turns the RPC's one-row-per-(cell,emotion) result into the same
// {lat,lng,color,total,intensity,size,key} shape buildGridCells produces for
// the client-side (demo-mode) path, so MapView never needs to know which
// path the data came from.
function rowsToCells(rows, cellSizeDeg) {
  const byKey = new Map();
  for (const row of rows) {
    let cell = byKey.get(row.cell_key);
    if (!cell) {
      cell = { lat: Number(row.center_lat), lng: Number(row.center_lng), total: Number(row.cell_total), emotionCounts: {} };
      byKey.set(row.cell_key, cell);
    }
    cell.emotionCounts[row.emotion] = Number(row.emotion_count);
  }

  const result = [];
  for (const [key, cell] of byKey.entries()) {
    let rSum = 0, gSum = 0, bSum = 0;
    for (const [emotion, count] of Object.entries(cell.emotionCounts)) {
      const rgb = EMOTION_RGB[emotion];
      if (!rgb) continue;
      const weight = count / cell.total;
      rSum += rgb[0] * weight;
      gSum += rgb[1] * weight;
      bSum += rgb[2] * weight;
    }
    result.push({
      lat: cell.lat,
      lng: cell.lng,
      color: `rgb(${Math.round(rSum)}, ${Math.round(gSum)}, ${Math.round(bSum)})`,
      total: cell.total,
      intensity: cellIntensity(cell.total),
      size: cellSizeDeg,
      key,
    });
  }
  return result;
}

export function useMoodGrid(bounds, sessionId, mapZoom, extraData = []) {
  const [cells, setCells] = useState([]);
  const [loading, setLoading] = useState(false);
  const [totalPoints, setTotalPoints] = useState(0);
  const [warning, setWarning] = useState(null);

  // Keep the latest extraData in a ref so the effect can read it without re-subscribing
  const extraDataRef = useRef(extraData);
  useEffect(() => { extraDataRef.current = extraData; }, [extraData]);

  // Always points at the current effect run's `load`, so `refetch` can
  // force an immediate poll (e.g. right after casting a vote) instead of
  // the caller waiting up to 15s for the next scheduled one.
  const loadRef = useRef(null);

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
        // 1h, not 24h: the whole point of the map is the CURRENT mood, not a
        // stale blend of this morning with right now. User's own framing:
        // fantastic in a bar, then an hour later something awful happens —
        // the map has to reflect "now", not average that away. 1h was their
        // explicit call after considering (and rejecting) 3-4h too.
        const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();

        // Aggregation happens in Postgres (supabase_mood_grid_rpc.sql) — the
        // client only ever gets one row per (cell, emotion actually present),
        // so payload size tracks the number of map cells, not vote count.
        const { data, error } = await supabase.rpc('get_mood_grid', {
          p_south: south,
          p_north: north,
          p_west: west,
          p_east: east,
          p_cell_size: cellSizeDeg,
          p_since: since,
        });

        if (cancelled) return;

        if (error) {
          console.error('[MoodGrid] rpc error:', error);
          setWarning('Data fetch error');
        }
        // Don't bail out on an RPC error — demo-mode cells are independent of
        // the real-data query and should still render even if, say, the RPC
        // migration hasn't been run on this Supabase project yet.
        const realCells = error ? [] : rowsToCells(data || [], cellSizeDeg);

        const relevantExtraData = extraDataRef.current.filter(d =>
          d.lat >= south && d.lat <= north &&
          d.lng >= west && d.lng <= east
        );
        // Demo-mode synthetic points never touch the DB, so they can't go
        // through the RPC — bucket them client-side the same way they always
        // were, and merge them in alongside the real, server-aggregated cells.
        const demoCells = relevantExtraData.length ? buildGridCells(relevantExtraData, cellSizeDeg) : [];

        const merged = [...realCells, ...demoCells];
        const capped = merged.length > MAX_RENDERED_CELLS
          ? [...merged].sort((a, b) => b.total - a.total).slice(0, MAX_RENDERED_CELLS)
          : merged;

        const totalPointsCount = realCells.reduce((sum, c) => sum + c.total, 0) + relevantExtraData.length;
        setTotalPoints(totalPointsCount);

        if (!cancelled) {
          setCells(capped);
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

    loadRef.current = load;
    load();
    // 15s, not 10s — same reasoning as useEmotionsPolling: this RPC re-runs
    // per viewer of this area, so the real load driver at a packed venue is
    // concurrent viewers, not vote volume. A longer interval directly cuts
    // query-rate-per-viewer; the 24h-window aggregate doesn't need sub-15s
    // freshness anyway. `refetch` (below) covers the "I just voted, don't
    // make me wait" case instead of shortening this for everyone.
    const interval = setInterval(load, 15000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [bounds?.north, bounds?.south, bounds?.east, bounds?.west, mapZoom, sessionId]);

  const refetch = useCallback(() => { loadRef.current?.(); }, []);

  return { cells, loading, totalPoints, warning, refetch };
}
