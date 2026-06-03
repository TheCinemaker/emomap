// src/useAreaMood.js
import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { EMOTIONS } from './emotions';

function hexToRgb(hex) {
  const cleaned = hex.replace('#', '');
  const num = parseInt(cleaned, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255
  };
}

const EMOTION_COLOR_MAP = EMOTIONS.reduce((acc, e) => {
  acc[e.id] = e.color;
  return acc;
}, {});

export function useAreaMood(bounds, sessionId) {
  const [state, setState] = useState({
    loading: false,
    color: null,
    intensity: 0,
    total: 0
  });

  useEffect(() => {
    if (!bounds) return;
    const { north, south, east, west } = bounds;

    let cancelled = false;

    async function fetchMood() {
      setState((s) => ({ ...s, loading: true }));

      try {
        const fifteenAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();

        const { data, error } = await supabase
          .from('emotions')
          .select('emotion')
          .gte('inserted_at', fifteenAgo)
          .gte('lat', south)
          .lte('lat', north)
          .gte('lng', west)
          .lte('lng', east)
          .limit(5000);

        if (cancelled) return;

        if (error) {
          console.error('useAreaMood error:', error);
          setState({ loading: false, color: null, intensity: 0, total: 0 });
          return;
        }

        if (!data || data.length === 0) {
          setState({ loading: false, color: null, intensity: 0, total: 0 });
          return;
        }

        const counts = {};
        for (const row of data) {
          if (!row.emotion) continue;
          counts[row.emotion] = (counts[row.emotion] || 0) + 1;
        }

        const total = Object.values(counts).reduce((sum, v) => sum + v, 0);
        if (total === 0) {
          setState({ loading: false, color: null, intensity: 0, total: 0 });
          return;
        }

        let accRgb = { r: 0, g: 0, b: 0 };
        Object.entries(counts).forEach(([emotionId, count]) => {
          const colorHex = EMOTION_COLOR_MAP[emotionId];
          if (!colorHex) return;
          const rgb = hexToRgb(colorHex);
          const weight = count / total;
          accRgb.r += rgb.r * weight;
          accRgb.g += rgb.g * weight;
          accRgb.b += rgb.b * weight;
        });

        const mixedColor = `rgb(${Math.round(accRgb.r)}, ${Math.round(accRgb.g)}, ${Math.round(accRgb.b)})`;
        const intensity = Math.min(1, total / 20);

        setState({ loading: false, color: mixedColor, intensity, total });
      } catch (err) {
        if (cancelled) return;
        console.error('useAreaMood unexpected error:', err);
        setState({ loading: false, color: null, intensity: 0, total: 0 });
      }
    }

    fetchMood();
    const interval = setInterval(fetchMood, 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [bounds?.north, bounds?.south, bounds?.east, bounds?.west, sessionId]);

  return state;
}
