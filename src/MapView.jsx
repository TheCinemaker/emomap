// src/MapView.jsx
import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

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
  personalMood,
  personalAuraLocation,
  moodGridCells,
  onZoomChange
}) {
  const mapContainerRef    = useRef(null);
  const mapRef             = useRef(null);
  const userMarkerRef      = useRef(null);
  const personalAuraRef    = useRef(null);
  const moodGridMarkersRef = useRef(new Map());

  // live pulse entries for zoom-resize: [{ marker, lat, el }]
  const activePulseMarkers = useRef([]);
  const renderedPulseIds   = useRef(new Set());

  // ── Init map ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: {
        version: 8,
        sources: {
          'osm-tiles': {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors'
          }
        },
        layers: [{ id: 'osm-tiles', type: 'raster', source: 'osm-tiles', minzoom: 0, maxzoom: 19 }]
      },
      center: [19, 47],
      zoom: 4,
      attributionControl: false
    });

    map.dragPan.enable();
    map.scrollZoom.enable();
    map.touchZoomRotate.enable();

    const emitBounds = () => {
      const b = map.getBounds();
      onBoundsChange?.({ north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() });
      onZoomChange?.(map.getZoom());
    };

    map.on('moveend', emitBounds);
    map.on('load',    emitBounds);
    map.on('zoomend', emitBounds);
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

  // ── Personal Aura (zoom-aware size) ───────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    const loc = personalAuraLocation;

    if (!map || !loc || !personalMood?.color || personalMood.total === 0) {
      if (personalAuraRef.current) { personalAuraRef.current.remove(); personalAuraRef.current = null; }
      return;
    }

    const updateAura = () => {
      if (!personalAuraRef.current) return;
      const px = metersToPixels(loc.lat, map.getZoom(), 2000);
      const inner = personalAuraRef.current.getElement().querySelector('.personal-aura-inner');
      if (inner) {
        inner.style.setProperty('--personal-color', personalMood.color);
        inner.style.opacity = String(Math.min(1, 0.4 + 0.6 * personalMood.intensity));
        inner.style.width  = `${px}px`;
        inner.style.height = `${px}px`;
      }
    };

    if (!personalAuraRef.current) {
      const container = document.createElement('div');
      container.className = 'personal-aura';
      const inner = document.createElement('div');
      inner.className = 'personal-aura-inner';
      container.appendChild(inner);
      personalAuraRef.current = new maplibregl.Marker({ element: container })
        .setLngLat([loc.lng, loc.lat]).addTo(map);
    } else {
      personalAuraRef.current.setLngLat([loc.lng, loc.lat]);
    }

    updateAura();
    map.on('zoom', updateAura);
    return () => map.off('zoom', updateAura);
  }, [personalAuraLocation, personalMood]);

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

    // Only fresh, valid pulses
    const fresh = pulses.filter(p => {
      if (renderedPulseIds.current.has(p.id)) return false;
      return !Number.isNaN(Number(p.lat)) && !Number.isNaN(Number(p.lng));
    });
    if (fresh.length === 0) return;

    const clusters = clusterPulses(fresh);
    const zoom = map.getZoom();

    clusters.forEach(({ lat, lng, color }) => {
      // Mark all contributing pulse IDs as rendered
      fresh.forEach(p => {
        if (Math.abs(p.lat - lat) < 0.005 && Math.abs(p.lng - lng) < 0.005) {
          renderedPulseIds.current.add(p.id);
        }
      });

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
        renderedPulseIds.current.delete; // allow re-use after 3 s
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
      const px = metersToPixels(cell.lat, zoom, 20000);

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

  // ── Controls ───────────────────────────────────────────────────────────────
  function handleBackToMe() {
    if (!mapRef.current || !coords) return;
    userInteracted.current = false;
    mapRef.current.flyTo({ center: [coords.lng, coords.lat], zoom: 12, speed: 1.2 });
  }

  return (
    <div className="map-container" ref={mapContainerRef} style={{ width: '100%', height: '100%' }}>
      <div className="map-zoom-controls">
        <button onClick={() => mapRef.current?.zoomIn()}>+</button>
        <button onClick={() => mapRef.current?.zoomOut()}>−</button>
      </div>
      {coords && (
        <button className="back-to-me-btn" onClick={handleBackToMe} title="Back to Me">⌖</button>
      )}
    </div>
  );
}
