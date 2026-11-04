// src/useMoodGrid.js
import { useEffect, useRef, useState } from 'react';
import { supabase } from './supabaseClient';
import { calculateCellSize, buildGridCells, EMOTION_RGB, MAX_RENDERED_CELLS } from './moodGridUtils';

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
      intensity: Math.min(1, cell.total / 20),
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

    load();
    // 15s, not 10s — same reasoning as useEmotionsPolling: this RPC re-runs
    // per viewer of this area, so the real load driver at a packed venue is
    // concurrent viewers, not vote volume. A longer interval directly cuts
    // query-rate-per-viewer; the 24h-window aggregate doesn't need sub-15s
    // freshness anyway.
    const interval = setInterval(load, 15000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [bounds?.north, bounds?.south, bounds?.east, bounds?.west, mapZoom, sessionId]);

  return { cells, loading, totalPoints, warning };
}
