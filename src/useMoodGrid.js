// src/useMoodGrid.js
import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

// kb. 1 km rácsdeg – ~0.009°, kerekítsük 0.01-re
const CELL_SIZE_DEG = 0.01;

// színek RGB-ben – az emotions.js hex-jeiből
const EMOTION_RGB = {
  happy:      [34, 197, 94],   // #22c55e
  bored:      [156, 163, 175], // #9ca3af
  stressed:   [239, 68, 68],   // #ef4444
  tired:      [250, 204, 21],  // #facc15
  motivated:  [14, 165, 233],  // #0ea5e9
  love:       [236, 72, 153],  // #ec4899
  hype:       [168, 85, 247],  // #a855f7
};

export function useMoodGrid(bounds, sessionId) {
  const [cells, setCells] = useState([]);
  const [loading, setLoading] = useState(false);
  const [totalPoints, setTotalPoints] = useState(0);

  useEffect(() => {
    if (!bounds || !sessionId) return;

    const { north, south, east, west } = bounds;
    if (
      typeof north !== 'number' ||
      typeof south !== 'number' ||
      typeof east !== 'number' ||
      typeof west !== 'number'
    ) {
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        // csak az elmúlt 24h
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        const { data, error } = await supabase
          .from('emotions')
          .select('emotion, lat, lng, inserted_at')
          .eq('session_id', sessionId)
          .gte('inserted_at', since)
          .gte('lat', south)
          .lte('lat', north)
          .gte('lng', west)
          .lte('lng', east);

        if (error) {
          console.error('[MoodGrid] supabase error:', error);
          if (!cancelled) {
            setCells([]);
            setTotalPoints(0);
            setLoading(false);
          }
          return;
        }

        if (cancelled || !data) return;

        setTotalPoints(data.length);

        // Rácsba pakolás
        const grid = new Map();

        for (const row of data) {
          const lat = typeof row.lat === 'number' ? row.lat : Number(row.lat);
          const lng = typeof row.lng === 'number' ? row.lng : Number(row.lng);
          if (Number.isNaN(lat) || Number.isNaN(lng)) continue;

          const gx = Math.floor(lat / CELL_SIZE_DEG);
          const gy = Math.floor(lng / CELL_SIZE_DEG);
          const key = `${gx}_${gy}`;

          let cell = grid.get(key);
          if (!cell) {
            cell = {
              latSum: 0,
              lngSum: 0,
              count: 0,
              emotionCounts: {}, // id -> count
            };
            grid.set(key, cell);
          }

          cell.latSum += lat;
          cell.lngSum += lng;
          cell.count += 1;
          cell.emotionCounts[row.emotion] =
            (cell.emotionCounts[row.emotion] || 0) + 1;
        }

        const result = [];
        for (const [, cell] of grid.entries()) {
          if (cell.count === 0) continue;

          const lat = cell.latSum / cell.count;
          const lng = cell.lngSum / cell.count;
          const total = cell.count;

          // szín keverés
          let rSum = 0;
          let gSum = 0;
          let bSum = 0;

          for (const [emotion, count] of Object.entries(cell.emotionCounts)) {
            const rgb = EMOTION_RGB[emotion];
            if (!rgb) continue;
            const weight = count / total;
            rSum += rgb[0] * weight;
            gSum += rgb[1] * weight;
            bSum += rgb[2] * weight;
          }

          const r = Math.round(rSum);
          const g = Math.round(gSum);
          const b = Math.round(bSum);

          const color = `rgb(${r}, ${g}, ${b})`;
          // intenzitás – 0..1, kb. 1 aura / 20+ click már max
          const intensity = Math.min(1, total / 20);

          result.push({
            lat,
            lng,
            color,
            total,
            intensity,
          });
        }

        if (!cancelled) {
          setCells(result);
          setLoading(false);
        }
      } catch (err) {
        console.error('[MoodGrid] unexpected error:', err);
        if (!cancelled) {
          setCells([]);
          setTotalPoints(0);
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [sessionId, JSON.stringify(bounds)]); // bounds-t stringesítve figyeljük

  return { cells, loading, totalPoints };
}
