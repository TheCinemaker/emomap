// src/MapView.jsx
import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

const EMOTION_COLORS = {
  happy: '#22c55e',
  bored: '#9ca3af',
  stressed: '#ef4444',
  tired: '#facc15',
  motivated: '#0ea5e9',
  love: '#ec4899',
  hype: '#a855f7'
};

// Global map to hold grid markers for easy removal
const moodGridMarkers = new Map();

export function MapView({
  coords,
  viewCenter,
  onBoundsChange,
  pulses,
  personalMood,
  moodGridCells,
  onZoomChange
}) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const userMarkerRef = useRef(null);
  const personalAuraRef = useRef(null);
  const zoomLevelRef = useRef(null);

  // Initialize Map
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
        layers: [
          {
            id: 'osm-tiles',
            type: 'raster',
            source: 'osm-tiles',
            minzoom: 0,
            maxzoom: 19
          }
        ]
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
      const bounds = {
        north: b.getNorth(),
        south: b.getSouth(),
        east: b.getEast(),
        west: b.getWest()
      };
      const zoom = map.getZoom();
      onBoundsChange?.(bounds);
      onZoomChange?.(zoom);
    };

    map.on('moveend', emitBounds);
    map.on('load', emitBounds);
    map.on('zoomend', emitBounds);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [onBoundsChange, onZoomChange]);

  // Move/center map
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const target = viewCenter || coords;
    if (!target) return;

    map.flyTo({
      center: [target.lng, target.lat],
      zoom: viewCenter?.zoom || 10,
      speed: 0.9
    });
  }, [coords?.lat, coords?.lng, viewCenter?.lat, viewCenter?.lng, viewCenter?.zoom]);

  // User Marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !coords) return;

    if (!userMarkerRef.current) {
      const el = document.createElement('div');
      el.className = 'user-marker';
      userMarkerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat([coords.lng, coords.lat])
        .addTo(map);
    } else {
      userMarkerRef.current.setLngLat([coords.lng, coords.lat]);
    }
  }, [coords]);

  // Personal Aura
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !coords) return;

    if (!personalMood || !personalMood.color || personalMood.total === 0) {
      if (personalAuraRef.current) {
        personalAuraRef.current.remove();
        personalAuraRef.current = null;
      }
      return;
    }

    const opacity = Math.min(1, 0.4 + 0.6 * personalMood.intensity);

    if (!personalAuraRef.current) {
      const container = document.createElement('div');
      container.className = 'personal-aura';

      const inner = document.createElement('div');
      inner.className = 'personal-aura-inner';
      container.appendChild(inner);

      inner.style.setProperty('--personal-color', personalMood.color);
      inner.style.opacity = String(opacity);

      const marker = new maplibregl.Marker({ element: container })
        .setLngLat([coords.lng, coords.lat])
        .addTo(map);

      personalAuraRef.current = marker;
    } else {
      const marker = personalAuraRef.current;
      marker.setLngLat([coords.lng, coords.lat]);

      const el = marker.getElement().querySelector('.personal-aura-inner');
      if (el) {
        el.style.setProperty('--personal-color', personalMood.color);
        el.style.opacity = String(opacity);
      }
    }
  }, [coords, personalMood]);

  // Pulse Effects
  useEffect(() => {
    if (!mapRef.current || !pulses || pulses.length === 0) return;
    const map = mapRef.current;

    pulses.forEach((p) => {
      const lat = Number(p.lat);
      const lng = Number(p.lng);
      if (Number.isNaN(lat) || Number.isNaN(lng)) return;

      const container = document.createElement('div');
      container.className = 'pulse-marker-container';

      const el = document.createElement('div');
      el.className = 'pulse-marker';
      container.appendChild(el);

      const color = EMOTION_COLORS[p.emotion] || '#fff';
      el.style.setProperty('--pulse-color', color);

      const marker = new maplibregl.Marker({ element: container })
        .setLngLat([lng, lat])
        .addTo(map);

      setTimeout(() => marker.remove(), 6000);
    });
  }, [pulses]);

  // Mood Grid Cells
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const visibleKeys = new Set();
    const currentZoom = map.getZoom();

    moodGridCells?.forEach((cell) => {
      const key = cell.key;
      visibleKeys.add(key);

      const calculatePixelSize = (zoom) =>
        Math.max(10, Math.min(250, 100 * Math.pow(2, zoom - 10)));

      const pixelSize = calculatePixelSize(currentZoom);

      if (moodGridMarkers.has(key)) {
        const marker = moodGridMarkers.get(key);
        marker.setLngLat([cell.lng, cell.lat]);

        const el = marker.getElement().querySelector('.mood-grid-cell-inner');
        if (el) {
          el.style.setProperty('--cell-color', cell.color);
          el.style.opacity = String(0.1 + 0.8 * cell.intensity);
          el.style.width = `${pixelSize}px`;
          el.style.height = `${pixelSize}px`;
        }
      } else {
        const container = document.createElement('div');
        container.className = 'mood-grid-cell-container';

        const inner = document.createElement('div');
        inner.className = 'mood-grid-cell-inner';
        container.appendChild(inner);

        inner.style.setProperty('--cell-color', cell.color);
        inner.style.opacity = String(0.1 + 0.8 * cell.intensity);
        inner.style.width = `${pixelSize}px`;
        inner.style.height = `${pixelSize}px`;

        const marker = new maplibregl.Marker({ element: container, anchor: 'center' })
          .setLngLat([cell.lng, cell.lat])
          .addTo(map);

        moodGridMarkers.set(key, marker);
      }
    });

    moodGridMarkers.forEach((marker, key) => {
      if (!visibleKeys.has(key)) {
        marker.remove();
        moodGridMarkers.delete(key);
      }
    });
  }, [moodGridCells]);

  // Zoom controls
  function handleZoomIn() {
    mapRef.current?.zoomIn();
  }
  function handleZoomOut() {
    mapRef.current?.zoomOut();
  }

  function handleBackToMe() {
    const map = mapRef.current;
    if (!map || !coords) return;

    map.flyTo({
      center: [coords.lng, coords.lat],
      zoom: 12,
      speed: 1.2
    });
  }

  return (
    <div className="map-container" ref={mapContainerRef}>
      <div className="map-zoom-controls">
        <button onClick={handleZoomIn}>+</button>
        <button onClick={handleZoomOut}>−</button>
      </div>

      {coords && (
        <button className="back-to-me-btn" onClick={handleBackToMe}>
          📍
        </button>
      )}
    </div>
  );
}
