// src/MapView.jsx
import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { PIN_PATH_D } from './components/Icons';

// Individual per-vote pulse flashes only render at this zoom or closer —
// see the PULSES effect below for why.
const PULSE_MIN_ZOOM = 8;

const EMOTION_COLORS = {
  happy:     '#34c759',
  bored:     '#8e8e93',
  stressed:  '#ff3b30',
  tired:     '#ffcc00',
  motivated: '#0a84ff',
  love:      '#ff2d55',
  hype:      '#bf5af2'
};

// ── helpers ───────────────────────────────────────────────────────────────────

/** Pixels that correspond to `meters` at a given lat/zoom. */
function metersToPixels(lat, zoom, meters) {
  const mpx = (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);
  return meters / mpx;
}

/** Parse any CSS colour → {r,g,b} */
function cssToRgb(css) {
  const m = css.match(/\d+/g);
  if (m && m.length >= 3) return { r: +m[0], g: +m[1], b: +m[2] };
  const hex = css.replace('#', '');
  const full = hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex;
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/**
 * Group pulses that are within `threshDeg` degrees of each other.
 * Returns clusters: { lat, lng, color (blended), count }
 */
function clusterPulses(pulses, threshDeg = 0.005) {
  const used = new Set();
  const out  = [];

  for (let i = 0; i < pulses.length; i++) {
    if (used.has(i)) continue;
    const group = [pulses[i]];
    used.add(i);

    for (let j = i + 1; j < pulses.length; j++) {
      if (used.has(j)) continue;
      if (
        Math.abs(pulses[i].lat - pulses[j].lat) < threshDeg &&
        Math.abs(pulses[i].lng - pulses[j].lng) < threshDeg
      ) {
        group.push(pulses[j]);
        used.add(j);
      }
    }

    const lat = group.reduce((s, p) => s + p.lat, 0) / group.length;
    const lng = group.reduce((s, p) => s + p.lng, 0) / group.length;

    // Blend colours equally
    let sumR = 0, sumG = 0, sumB = 0;
    group.forEach(p => {
      const { r, g, b } = cssToRgb(EMOTION_COLORS[p.emotion] || '#ffffff');
      sumR += r; sumG += g; sumB += b;
    });
    const n = group.length;
    const color = `rgb(${Math.round(sumR/n)},${Math.round(sumG/n)},${Math.round(sumB/n)})`;

    out.push({ lat, lng, color, count: n });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────

export function MapView({
  coords,
  viewCenter,
  onBoundsChange,
  pulses,
  moodGridCells,
  venues,
  onVenueClick,
  onZoomChange
}) {
  const mapContainerRef    = useRef(null);
  const mapRef             = useRef(null);
  const userMarkerRef      = useRef(null);
  const moodGridMarkersRef = useRef(new Map());
  const venueMarkersRef    = useRef(new Map());

  // live pulse entries for zoom-resize: [{ marker, lat, el }]
  const activePulseMarkers = useRef([]);
  const renderedPulseIds   = useRef(new Set());

  // Tracks the map's actual pitch (not just what the button last set) so the
  // 3D toggle stays in sync if the user tilts manually via drag-rotate too.
  const [pitch, setPitch] = useState(0);

  // ── Init map ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      // OpenFreeMap's "liberty" style — the standard, full-detail light OSM
      // look (green parks, labeled streets, familiar like Google/Apple
      // Maps). Switched from the "dark" style on user feedback: a mood map
      // is only useful if you can actually recognize the area well enough
      // to go there, and the dark/minimal style fought that. Still
      // OpenFreeMap: free, keyless, verified live (style JSON, vector
      // tiles, glyphs, sprite all 200 with proper CORS) before using it.
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [19, 47],
      zoom: 4,
      pitch: 0,
      maxPitch: 60,
      attributionControl: false
    });

    map.dragPan.enable();
    map.scrollZoom.enable();
    map.touchZoomRotate.enable();
    // "liberty" already ships a real fill-extrusion building-3d layer
    // (verified in its style JSON: source-layer "building", heights from
    // render_height/render_min_height) — it just needs pitch > 0 to be
    // visible at all. Explicit, not relying on MapLibre's defaults, since
    // the whole point is this has to actually work.
    map.dragRotate.enable();
    map.touchPitch.enable();

    const emitBounds = () => {
      const b = map.getBounds();
      onBoundsChange?.({ north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() });
      onZoomChange?.(map.getZoom());
    };

    map.on('moveend', emitBounds);
    map.on('load',    emitBounds);
    map.on('zoomend', emitBounds);
    map.on('pitch', () => setPitch(map.getPitch()));
    mapRef.current = map;

    return () => { map.remove(); mapRef.current = null; };
  }, [onBoundsChange, onZoomChange]);

  // ── Fly to search result ───────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !viewCenter) return;
    mapRef.current.flyTo({ center: [viewCenter.lng, viewCenter.lat], zoom: viewCenter.zoom || 10, speed: 1.2 });
  }, [viewCenter]);

  // ── Auto-centre once on first GPS fix ─────────────────────────────────────
  const userInteracted    = useRef(false);
  const initialCenterDone = useRef(false);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const onI = () => { userInteracted.current = true; };
    map.on('dragstart', onI);
    map.on('zoomstart', onI);
    return () => { map.off('dragstart', onI); map.off('zoomstart', onI); };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !coords || viewCenter || userInteracted.current || initialCenterDone.current) return;
    map.flyTo({ center: [coords.lng, coords.lat], zoom: 12, speed: 1.2 });
    initialCenterDone.current = true;
  }, [coords, viewCenter]);

  // ── User dot marker ────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !coords) return;
    if (!userMarkerRef.current) {
      const el = document.createElement('div');
      el.className = 'user-marker';
      userMarkerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat([coords.lng, coords.lat]).addTo(map);
    } else {
      userMarkerRef.current.setLngLat([coords.lng, coords.lat]);
    }
  }, [coords]);

  // ── Pulse zoom-resize listener ─────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const onZoom = () => {
      const zoom = map.getZoom();
      activePulseMarkers.current.forEach(({ lat, el }) => {
        const basePx = Math.min(48, Math.max(4, metersToPixels(lat, zoom, 80)));
        el.style.setProperty('--pulse-base-px', `${basePx}px`);
      });
    };

    map.on('zoom', onZoom);
    return () => map.off('zoom', onZoom);
  }, []);

  // ── PULSES ─────────────────────────────────────────────────────────────────
  // Each pulse is a geo-anchored MapLibre Marker (anchor:'center').
  // Size = real-world 200 m radius → pixels at current zoom.
  // Nearby pulses are clustered and their colours blended.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !pulses || pulses.length === 0) return;

    const zoom = map.getZoom();

    // Only fresh, valid pulses
    const fresh = pulses.filter(p => {
      if (renderedPulseIds.current.has(p.id)) return false;
      return !Number.isNaN(Number(p.lat)) && !Number.isNaN(Number(p.lng));
    });
    if (fresh.length === 0) return;

    // Mark everything fresh as handled now, regardless of whether it's
    // actually drawn below — otherwise the same id gets re-filtered on
    // every subsequent pulses update until its 3s window passes.
    fresh.forEach(p => renderedPulseIds.current.add(p.id));

    // Below this zoom, an individual vote flash is noise, not signal — a
    // world/country view is supposed to read as one calm, aggregated mood
    // cloud (the mood-grid layer), not hundreds of simultaneous blinking
    // dots from everyone voting at once. Confirmed with an actual stress
    // test (demo mode, hundreds of events/sec): without this gate the
    // pulse layer visually drowns out the grid and looks like noise.
    if (zoom < PULSE_MIN_ZOOM) {
      setTimeout(() => {
        fresh.forEach(p => renderedPulseIds.current.delete(p.id));
      }, 3000);
      return;
    }

    const clusters = clusterPulses(fresh);

    clusters.forEach(({ lat, lng, color }) => {
      const idsInCluster = fresh
        .filter(p => Math.abs(p.lat - lat) < 0.005 && Math.abs(p.lng - lng) < 0.005)
        .map(p => p.id);

      const basePx = Math.min(48, Math.max(4, metersToPixels(lat, zoom, 80)));

      const container = document.createElement('div');
      container.className = 'pulse-geo-container';

      const dot   = document.createElement('div');
      dot.className = 'pulse-geo-dot';

      const ring1 = document.createElement('div');
      ring1.className = 'pulse-geo-ring';

      const ring2 = document.createElement('div');
      ring2.className = 'pulse-geo-ring pulse-geo-ring--delay';

      container.appendChild(dot);
      container.appendChild(ring1);
      container.appendChild(ring2);

      container.style.setProperty('--pulse-color', color);
      container.style.setProperty('--pulse-base-px', `${basePx}px`);

      // anchor:'center' → the marker's origin point sits exactly at [lng, lat]
      const marker = new maplibregl.Marker({ element: container, anchor: 'center' })
        .setLngLat([lng, lat])
        .addTo(map);

      const entry = { marker, lat, el: container };
      activePulseMarkers.current.push(entry);

      setTimeout(() => {
        marker.remove();
        // Was previously `renderedPulseIds.current.delete;` with no argument
        // and no call — a no-op that silently leaked every vote id for the
        // life of the page. Actually release the ids this entry owns.
        idsInCluster.forEach(id => renderedPulseIds.current.delete(id));
        activePulseMarkers.current = activePulseMarkers.current.filter(e => e !== entry);
      }, 3000);
    });
  }, [pulses]);

  // ── Mood Grid Cells ────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const markers = moodGridMarkersRef.current;
    const visibleKeys = new Set();
    const zoom = map.getZoom();

    moodGridCells?.forEach(cell => {
      const key = cell.key;
      visibleKeys.add(key);
      // Size the glow to the cell's ACTUAL real-world footprint (cell.size is in
      // degrees), not a hardcoded 20km — at low zoom cells are tens to hundreds
      // of km wide, so a fixed 20km glow renders as a tiny hard dot instead of
      // the intended soft, overlapping "weather" blob. A 1.4x factor lets
      // neighboring cells blend into each other instead of leaving visible gaps.
      const cellMeters = (cell.size || 0.01) * 111000;
      // Floor at 14px — now that cells can shrink to ~11m (see
      // calculateCellSize), a single person at a deep building-level zoom
      // must still render as a visible soft dot, not a sub-pixel speck.
      const px = Math.max(14, metersToPixels(cell.lat, zoom, cellMeters * 1.4));

      if (markers.has(key)) {
        const m = markers.get(key);
        m.setLngLat([cell.lng, cell.lat]);
        const inner = m.getElement().querySelector('.mood-grid-cell-inner');
        if (inner) {
          inner.style.setProperty('--cell-color', cell.color);
          inner.style.opacity = String(0.2 + 0.6 * cell.intensity);
          inner.style.width  = `${px}px`;
          inner.style.height = `${px}px`;
        }
      } else {
        const container = document.createElement('div');
        container.className = 'mood-grid-cell-container';
        const inner = document.createElement('div');
        inner.className = 'mood-grid-cell-inner';
        inner.style.setProperty('--cell-color', cell.color);
        inner.style.opacity = String(0.2 + 0.6 * cell.intensity);
        inner.style.width  = `${px}px`;
        inner.style.height = `${px}px`;
        container.appendChild(inner);
        markers.set(key, new maplibregl.Marker({ element: container })
          .setLngLat([cell.lng, cell.lat]).addTo(map));
      }
    });

    markers.forEach((m, key) => {
      if (!visibleKeys.has(key)) { m.remove(); markers.delete(key); }
    });
  }, [moodGridCells]);

  useEffect(() => {
    const markers = moodGridMarkersRef.current;
    return () => { markers.forEach(m => m.remove()); markers.clear(); };
  }, []);

  // ── Venues (partner POI pins — tier controls the zoom it appears at) ──────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const markers = venueMarkersRef.current;
    const visibleIds = new Set();

    // basic partners show up once you're at street level; vip (paid-up)
    // partners show from a whole-city zoom out, with a glowing ring — this
    // is literally the product the Boost tier sells.
    const updateVisibility = () => {
      const zoom = map.getZoom();
      markers.forEach((m, id) => {
        const v = venues?.find((x) => x.id === id);
        if (!v) return;
        const minZoom = v.tier === 'vip' ? 11 : 14;
        m.getElement().style.display = zoom >= minZoom ? '' : 'none';
      });
    };

    venues?.forEach((venue) => {
      visibleIds.add(venue.id);
      if (markers.has(venue.id)) {
        markers.get(venue.id).setLngLat([venue.lng, venue.lat]);
        return;
      }
      const el = document.createElement('div');
      el.className = `venue-pin${venue.tier === 'vip' ? ' venue-pin--vip' : ''}`;
      el.title = venue.name;
      if (venue.logo_url) {
        el.style.backgroundImage = `url(${venue.logo_url})`;
      } else {
        el.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="${PIN_PATH_D}"/></svg>`;
      }
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        onVenueClick?.(venue.id);
      });
      markers.set(venue.id, new maplibregl.Marker({ element: el })
        .setLngLat([venue.lng, venue.lat]).addTo(map));
    });

    markers.forEach((m, id) => {
      if (!visibleIds.has(id)) { m.remove(); markers.delete(id); }
    });

    updateVisibility();
    map.on('zoom', updateVisibility);
    return () => map.off('zoom', updateVisibility);
  }, [venues, onVenueClick]);

  useEffect(() => {
    const markers = venueMarkersRef.current;
    return () => { markers.forEach(m => m.remove()); markers.clear(); };
  }, []);

  // ── Controls ───────────────────────────────────────────────────────────────
  function handleBackToMe() {
    if (!mapRef.current || !coords) return;
    userInteracted.current = false;
    mapRef.current.flyTo({ center: [coords.lng, coords.lat], zoom: 12, speed: 1.2 });
  }

  const is3D = pitch > 5;
  function handleToggle3D() {
    const map = mapRef.current;
    if (!map) return;
    if (is3D) {
      map.easeTo({ pitch: 0, bearing: 0, duration: 500 });
    } else {
      // Buildings only render from zoom 14 — hop in a bit if we're zoomed
      // out further, or tilting just shows flat ground with nothing to see.
      const target = { pitch: 55, duration: 500 };
      if (map.getZoom() < 15) target.zoom = 16;
      map.easeTo(target);
    }
  }

  return (
    <div className="map-container" ref={mapContainerRef} style={{ width: '100%', height: '100%' }}>
      <div className="map-zoom-controls">
        <button onClick={() => mapRef.current?.zoomIn()}>+</button>
        <button onClick={() => mapRef.current?.zoomOut()}>−</button>
        <button
          className={`map-3d-btn${is3D ? ' is-active' : ''}`}
          onClick={handleToggle3D}
          title="3D"
        >
          3D
        </button>
      </div>
      <button
        className={`back-to-me-btn${!coords ? ' is-disabled' : ''}`}
        onClick={handleBackToMe}
        title={coords ? 'Back to Me' : 'Waiting for location…'}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
