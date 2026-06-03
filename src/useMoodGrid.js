// src/useMoodGrid.js
import { useEffect, useRef, useState } from 'react';
import { supabase } from './supabaseClient';

const MAX_FETCH_LIMIT = 20000;

const EMOTION_RGB = {
  happy: [0, 255, 0],
  bored: [160, 160, 160],
  stressed: [255, 0, 0],
  tired: [255, 255, 0],
  motivated: [0, 204, 255],
  love: [255, 0, 255],
  hype: [191, 0, 255],
};

function calculateCellSize(zoomLevel) {
  const baseSizeDeg = 0.01;
  const size = baseSizeDeg * Math.pow(2, 10 - zoomLevel);
  return Math.max(0.005, Math.min(10, size));
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

        const grid = new Map();
        for (const row of allData) {
          const lat = typeof row.lat === 'number' ? row.lat : Number(row.lat);
          const lng = typeof row.lng === 'number' ? row.lng : Number(row.lng);
          if (Number.isNaN(lat) || Number.isNaN(lng)) continue;

          const gx = Math.floor(lat / cellSizeDeg);
          const gy = Math.floor(lng / cellSizeDeg);
          const key = `${gx}_${gy}`;

          let cell = grid.get(key);
          if (!cell) {
            cell = { latSum: 0, lngSum: 0, count: 0, emotionCounts: {} };
            grid.set(key, cell);
          }
          cell.latSum += lat;
          cell.lngSum += lng;
          cell.count += 1;
          cell.emotionCounts[row.emotion] = (cell.emotionCounts[row.emotion] || 0) + 1;
        }

        const result = [];
        for (const [key, cell] of grid.entries()) {
          if (cell.count === 0) continue;
          const lat = cell.latSum / cell.count;
          const lng = cell.lngSum / cell.count;
          const total = cell.count;

          let rSum = 0, gSum = 0, bSum = 0;
          for (const [emotion, count] of Object.entries(cell.emotionCounts)) {
            const rgb = EMOTION_RGB[emotion];
            if (!rgb) continue;
            const weight = count / total;
            rSum += rgb[0] * weight;
            gSum += rgb[1] * weight;
            bSum += rgb[2] * weight;
          }

          result.push({
            lat,
            lng,
            color: `rgb(${Math.round(rSum)}, ${Math.round(gSum)}, ${Math.round(bSum)})`,
            total,
            intensity: Math.min(1, total / 20),
            size: cellSizeDeg,
            key
          });
        }

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
