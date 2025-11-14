// src/useAreaMood.js
import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { EMOTIONS } from './emotions';

// segéd: hex → {r,g,b}
function hexToRgb(hex) {
  const cleaned = hex.replace('#', '');
  const num = parseInt(cleaned, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255
  };
}

// segéd: {r,g,b} → hex
function rgbToHex({ r, g, b }) {
  const toHex = (v) => v.toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
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

    let cancelled = false;

    async function fetchMood() {
      setState((s) => ({ ...s, loading: true }));

      try {
        const now = new Date();
        const fifteenAgo = new Date(now.getTime() - 15 * 60 * 1000);

        let query = supabase
          .from('emotions')
          .select('emotion, lat, lng, inserted_at', { count: 'exact', head: false })
          .eq('session_id', sessionId)
          .gte('inserted_at', fifteenAgo.toISOString())
          .gte('lat', bounds.south)
          .lte('lat', bounds.north)
          .gte('lng', bounds.west)
          .lte('lng', bounds.east);

        const { data, error } = await query;

        if (cancelled) return;

        if (error) {
          console.error('useAreaMood error:', error);
          setState({
            loading: false,
            color: null,
            intensity: 0,
            total: 0
          });
          return;
        }

        if (!data || data.length === 0) {
          setState({
            loading: false,
            color: null,
            intensity: 0,
            total: 0
          });
          return;
        }

        // számlálás emotion szerint
        const counts = {};
        data.forEach((row) => {
          if (!row.emotion) return;
          counts[row.emotion] = (counts[row.emotion] || 0) + 1;
        });

        const total = Object.values(counts).reduce((sum, v) => sum + v, 0);
        if (total === 0) {
          setState({
            loading: false,
            color: null,
            intensity: 0,
            total: 0
          });
          return;
        }

        // súlyozott szín keverés
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

        const mixedColor = rgbToHex({
          r: Math.round(accRgb.r),
          g: Math.round(accRgb.g),
          b: Math.round(accRgb.b)
        });

        // intenzitás: minél több katt az utolsó 15 percben, annál erősebb
        const intensity = Math.min(1, total / 20); // 0..1

        setState({
          loading: false,
          color: mixedColor,
          intensity,
          total
        });
      } catch (err) {
        if (cancelled) return;
        console.error('useAreaMood unexpected error:', err);
        setState({
          loading: false,
          color: null,
          intensity: 0,
          total: 0
        });
      }
    }

    // első hívás + polling (pl. 5 mp-ként)
    fetchMood();
    const interval = setInterval(fetchMood, 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [sessionId, JSON.stringify(bounds)]);

  return state;
}
