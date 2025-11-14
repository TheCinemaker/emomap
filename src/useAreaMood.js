// src/useAreaMood.js
import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { EMOTIONS } from './emotions';

// emotion -> color map az emotions.js alapján
const COLOR_MAP = EMOTIONS.reduce((acc, e) => {
  acc[e.id] = e.color;
  return acc;
}, {});

function hexToRgb(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  }
  const num = parseInt(h, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255
  };
}

/**
 * bounds + sessionId alapján:
 *  - lekéri az adott terület ÖSSZES eseményét (max 1000)
 *  - emotion count
 *  - súlyozott átlag szín + intenzitás
 */
export function useAreaMood(bounds, sessionId) {
  const [mood, setMood] = useState({
    color: null,
    intensity: 0,
    total: 0,
    loading: false,
    error: null
  });

  useEffect(() => {
    if (!bounds) return;
    let cancelled = false;

    async function fetchMood() {
      setMood(prev => ({ ...prev, loading: true, error: null }));

      console.log('[AreaMood] bounds:', bounds);

      const { data, error } = await supabase
        .from('emotions')
        .select('emotion, lat, lng')
        .eq('session_id', sessionId)
        .gte('lat', bounds.south)
        .lte('lat', bounds.north)
        .gte('lng', bounds.west)
        .lte('lng', bounds.east)
        .limit(1000); // MVP

      if (cancelled) return;

      if (error) {
        console.error('[AreaMood] error:', error);
        setMood(prev => ({
          ...prev,
          loading: false,
          error: error.message || 'Error loading mood'
        }));
        return;
      }

      console.log('[AreaMood] rows:', data?.length);

      const counts = {};
      for (const row of data || []) {
        if (!row.emotion) continue;
        counts[row.emotion] = (counts[row.emotion] || 0) + 1;
      }

      const total = Object.values(counts).reduce((a, v) => a + v, 0);
      if (!total) {
        setMood({
          color: null,
          intensity: 0,
          total: 0,
          loading: false,
          error: null
        });
        return;
      }

      let sumR = 0, sumG = 0, sumB = 0;

      for (const [emotion, count] of Object.entries(counts)) {
        const hex = COLOR_MAP[emotion];
        if (!hex) continue;
        const { r, g, b } = hexToRgb(hex);
        sumR += r * count;
        sumG += g * count;
        sumB += b * count;
      }

      const r = Math.round(sumR / total);
      const g = Math.round(sumG / total);
      const b = Math.round(sumB / total);
      const color = `rgb(${r}, ${g}, ${b})`;

      // intenzitás 0..1 (kb. 30 pulse ~ max glow)
      const intensity = Math.min(1, total / 30);

      console.log('[AreaMood] mood:', { color, total, intensity });

      setMood({
        color,
        intensity,
        total,
        loading: false,
        error: null
      });
    }

    fetchMood();
    const id = setInterval(fetchMood, 15000); // 15 mp-enként frissítünk

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [bounds, sessionId]);

  return mood;
}
