// src/moodGridUtils.js
// Shared grid-bucketing + color-blend logic used by both the live mood grid
// (useMoodGrid) and the 24h replay (useReplayData), so the two don't drift.
import { EMOTIONS } from './emotions';

function hexToRgbArray(hex) {
  const h = hex.replace('#', '');
  const num = parseInt(h, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

// Derived from emotions.js (the single source of truth for mood colors)
// instead of its own hardcoded copy — used to carry its own duplicate list
// that could (and did) drift out of sync with the actual palette.
export const EMOTION_RGB = EMOTIONS.reduce(
  (acc, e) => ({ ...acc, [e.id]: hexToRgbArray(e.color) }),
  {}
);

// Hard safety ceiling on rendered cells, independent of how much underlying
// data exists. Each cell becomes a real DOM node with a blur() filter and a
// running animation — that doesn't scale by itself, no matter how few grid
// cells geography would otherwise produce. If we ever exceed this, keep the
// most-active cells (the ones that actually matter visually) and drop the rest
// rather than degrading every device for everyone simultaneously voting.
export const MAX_RENDERED_CELLS = 400;

// A single live vote must already read as clearly visible — "I voted and
// nothing happened" is the worst first impression this app can give,
// especially with few users around (exactly the case most of the time at
// launch). Old formula (total/20) gave a lone vote 5% intensity — invisible
// in practice. Floor is now 0.45; it still climbs toward 1 as a cell fills
// up with more simultaneous (distinct-user) votes.
export function cellIntensity(total) {
  return Math.min(1, 0.45 + 0.55 * Math.min(1, (total - 1) / 9));
}

// Calibrated directly against the user's own two reference scenarios
// (2026-11-05): "open a big city like Berlin → one big pulse. Zoom in →
// more and more distinct pulses appear. Zoom into a single bar → tiny
// individual dots." That requires cell size to shrink FASTER than the
// viewport itself does (the viewport's degree-width exactly halves each
// zoom level) — a plain `base * 2^(ref - zoom)` curve shrinks at the SAME
// rate as the viewport, which keeps the number of cells visible on screen
// constant at every zoom instead of revealing more of them as you zoom in.
// Using two calibration points and log-linear interpolation between (and
// beyond) them gets both ends right at once: z10 ≈ a whole big city
// (~37km, reads as one or few blobs), z18 ≈ individual-person resolution
// (~12m, a single bar/stage separates into distinct dots).
const CAL_ZOOM_CITY = 10;
const CAL_SIZE_CITY_DEG = 0.33;   // ~37km
const CAL_ZOOM_BAR = 18;
const CAL_SIZE_BAR_DEG = 0.00011; // ~12m

export function calculateCellSize(zoomLevel) {
  // t is only calibrated for the [CAL_ZOOM_CITY, CAL_ZOOM_BAR] range — left
  // unclamped, zooming out further than "city" (e.g. a whole-continent
  // default view at zoom 4-5) drove t negative and the log-linear curve
  // extrapolated exponentially past the city size, hitting the old 10deg
  // safety clamp: a single vote rendered as a circle swallowing half of
  // Europe. Clamping t to [0, 1] caps the size at the two calibration
  // points themselves — city-level (~37km) is already the intended "one
  // big pulse" look for a zoomed-out view, it should never grow past that
  // no matter how far out the camera goes.
  const t = Math.max(0, Math.min(1, (zoomLevel - CAL_ZOOM_CITY) / (CAL_ZOOM_BAR - CAL_ZOOM_CITY)));
  const logSize = Math.log(CAL_SIZE_CITY_DEG) + t * (Math.log(CAL_SIZE_BAR_DEG) - Math.log(CAL_SIZE_CITY_DEG));
  return Math.exp(logSize);
}

// Formerly a k-anonymity floor requiring >=3 votes in a small cell before
// rendering anything — removed per explicit user direction (2026-11-05):
// each user now has exactly one live vote (see cast_vote in
// supabase_single_active_vote.sql) and stays jittered ~10m with no identity
// ever attached to a marker, so the floor's only remaining effect was
// hiding a lone early user's own vote from themselves. Kept as a no-op
// function (rather than deleted) so both call sites below don't need their
// own "is this still a thing" comment.
export function minSampleForCellSize() {
  return 1;
}

/**
 * Bucket raw {emotion, lat, lng} rows into colored grid cells.
 * Returns the same cell shape useMoodGrid has always returned.
 */
export function buildGridCells(rows, cellSizeDeg) {
  const grid = new Map();
  for (const row of rows) {
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

  const minSample = minSampleForCellSize(cellSizeDeg);
  const result = [];
  for (const [key, cell] of grid.entries()) {
    if (cell.count < minSample) continue;
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
      intensity: cellIntensity(total),
      size: cellSizeDeg,
      key,
    });
  }

  if (result.length > MAX_RENDERED_CELLS) {
    result.sort((a, b) => b.total - a.total);
    return result.slice(0, MAX_RENDERED_CELLS);
  }
  return result;
}
