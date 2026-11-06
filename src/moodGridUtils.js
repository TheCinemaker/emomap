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

// A single vote's own fixed real-world halo (2026-11-06, user's explicit
// spec): "ha a legjobban belezoom-olok, maximum 5 méteres lehet az aurám" —
// a lone vote is ALWAYS a tiny 5m dot, never bigger, no matter the zoom
// level. When several votes land in the same grid bucket, the group's
// rendered radius is the farthest member's distance from the group's own
// centroid plus this halo — "mindenki 5 métereset kap, a kör szélén állók
// határozzák meg az aura méretét" — so size reflects how far the actual
// GPS points are spread out, not an arbitrary zoom-tied constant.
const AURA_POINT_RADIUS_M = 5;
const METERS_PER_DEG_LAT = 111320;

function metersBetween(lat1, lng1, lat2, lng2) {
  const dy = (lat1 - lat2) * METERS_PER_DEG_LAT;
  const dx = (lng1 - lng2) * METERS_PER_DEG_LAT * Math.cos((lat1 * Math.PI) / 180);
  return Math.sqrt(dx * dx + dy * dy);
}

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
// 2026-11-06: user reported the whole curve still reads as too big in
// practice (incl. the clamped city-scale end) — both reference points
// scaled to 1/4 of their original size. Scaling both endpoints by the same
// factor scales the entire log-linear curve by that same factor at every
// zoom level, not just the ends.
const CAL_ZOOM_CITY = 10;
const CAL_SIZE_CITY_DEG = 0.0825;   // ~9km (was 0.33 / ~37km)
const CAL_ZOOM_BAR = 18;
const CAL_SIZE_BAR_DEG = 0.0000275; // ~3m (was 0.00011 / ~12m)

// NOTE: this only controls the CLUSTERING bucket — how close two votes need
// to be before they're merged into one group as you zoom in/out. It no
// longer drives the rendered size directly; buildGridCells below computes
// that from the actual spread of points inside each bucket (see
// AURA_POINT_RADIUS_M above). A bucket can be city-sized at a low zoom
// without the rendered aura itself being city-sized — it only grows that
// big if real votes are actually spread across the city.
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
      cell = { latSum: 0, lngSum: 0, count: 0, emotionCounts: {}, points: [] };
      grid.set(key, cell);
    }
    cell.latSum += lat;
    cell.lngSum += lng;
    cell.count += 1;
    cell.points.push([lat, lng]);
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

    let maxDistM = 0;
    for (const [plat, plng] of cell.points) {
      const d = metersBetween(lat, lng, plat, plng);
      if (d > maxDistM) maxDistM = d;
    }

    result.push({
      lat,
      lng,
      color: `rgb(${Math.round(rSum)}, ${Math.round(gSum)}, ${Math.round(bSum)})`,
      total,
      intensity: cellIntensity(total),
      radiusMeters: maxDistM + AURA_POINT_RADIUS_M,
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
