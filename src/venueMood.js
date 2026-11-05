// src/venueMood.js
// Shared "what's the vibe at this specific venue right now" query — used by
// both the public VenueModal and the partner's own VenueCRM stats panel.
import { supabase } from './supabaseClient';

const RADIUS_METERS = 200;
// 1h: this is displayed as "X% Hype right now" — it was inconsistent with
// its own label at 24h. Matches the app-wide "live, not stale" window.
const WINDOW_HOURS = 1;
const MIN_SAMPLE = 3; // k-anonymity floor, consistent with the rest of the app

export async function fetchVenueMood(lat, lng) {
  // ~meters -> degrees; good enough at this small radius, no need for exact geodesics.
  const latDeg = RADIUS_METERS / 111000;
  const lngDeg = RADIUS_METERS / (111000 * Math.cos((lat * Math.PI) / 180));
  const since = new Date(Date.now() - WINDOW_HOURS * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('emotions')
    .select('emotion')
    .gte('inserted_at', since)
    .gte('lat', lat - latDeg).lte('lat', lat + latDeg)
    .gte('lng', lng - lngDeg).lte('lng', lng + lngDeg)
    .limit(1000);

  if (error || !data || data.length < MIN_SAMPLE) return null;

  const counts = {};
  for (const row of data) counts[row.emotion] = (counts[row.emotion] || 0) + 1;
  const [dominant, dominantCount] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const percent = Math.round((dominantCount / data.length) * 100);
  return { dominant, percent, total: data.length };
}

export function venueMoodLabel(mood, t) {
  if (!mood) return null;
  return `${mood.percent}% ${t(`emotion_${mood.dominant}`)}`;
}
