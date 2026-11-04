// src/useEmotionalMirror.js
// The "Emotional Mirror": right after a vote, tell the user how many people
// near them feel the same thing right now. This is the immediate-dopamine
// loop the three-AI synthesis converged on (Gemini's "Waze argument") — the
// whole point of voting daily can't be "so the city dashboard gets data".
import { useCallback, useRef, useState } from 'react';
import { supabase } from './supabaseClient';

const RADIUS_DEG = 0.1; // ~10-12km, same convention as usePersonalMood
const WINDOW_MINUTES = 60;
const MIN_SAMPLE = 3; // k-anonymity floor, consistent with useMoodGrid
const DISPLAY_MS = 6000;

export function useEmotionalMirror() {
  const [mirror, setMirror] = useState(null); // { emotion, percent, total } | null
  const hideTimer = useRef(null);

  const trigger = useCallback(async (coords, emotion) => {
    if (!coords) return;

    const south = coords.lat - RADIUS_DEG;
    const north = coords.lat + RADIUS_DEG;
    const west = coords.lng - RADIUS_DEG;
    const east = coords.lng + RADIUS_DEG;
    const since = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('emotions')
      .select('emotion')
      .gte('inserted_at', since)
      .gte('lat', south).lte('lat', north)
      .gte('lng', west).lte('lng', east)
      .limit(2000);

    if (error || !data || data.length < MIN_SAMPLE) {
      setMirror(null);
      return;
    }

    const total = data.length;
    const matching = data.filter((r) => r.emotion === emotion).length;
    const percent = Math.max(1, Math.round((matching / total) * 100));

    clearTimeout(hideTimer.current);
    setMirror({ emotion, percent, total });
    hideTimer.current = setTimeout(() => setMirror(null), DISPLAY_MS);
  }, []);

  return { mirror, trigger };
}
