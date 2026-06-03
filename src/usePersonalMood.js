// src/usePersonalMood.js
import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { EMOTIONS } from './emotions';

// emotion -> color map
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
 * A saját lokációd körüli (pl. ~10km-es) „buborék” hangulata.
 * coords: { lat, lng }
 */
export function usePersonalMood(coords, sessionId) {
  const [mood, setMood] = useState({
    color: null,
    intensity: 0,
    total: 0,
    loading: false,
    error: null
  });

  useEffect(() => {
    if (!coords) return;
    let cancelled = false;

    async function fetchMood() {
      setMood(prev => ({ ...prev, loading: true, error: null }));

      const radiusDeg = 0.1; // kb. 10-12 km – finomhangolható
      const south = coords.lat - radiusDeg;
      const north = coords.lat + radiusDeg;
      const west = coords.lng - radiusDeg;
      const east = coords.lng + radiusDeg;

      const { data, error } = await supabase
        .from('emotions')
        .select('emotion')
        .eq('session_id', sessionId)
        .gte('lat', south)
        .lte('lat', north)
        .gte('lng', west)
        .lte('lng', east)
        .limit(1000);

      if (cancelled) return;

      if (error) {
        console.error('[PersonalMood] error:', error);
        setMood(prev => ({
          ...prev,
          loading: false,
          error: error.message || 'Error loading mood'
        }));
        return;
      }

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

      // intenzitás 0..1
      const intensity = Math.min(1, total / 20); // gyorsabban erősödjön

      setMood({
        color,
        intensity,
        total,
        loading: false,
        error: null
      });
    }

    fetchMood();
    const id = setInterval(fetchMood, 15000);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [coords?.lat, coords?.lng, sessionId]);

  return mood;
}
