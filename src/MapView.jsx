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

export function MapView({ coords, viewCenter, onBoundsChange, pulses, gridCells }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const userMarkerRef = useRef(null);
  const gridMarkersRef = useRef([]); // rács-aurák markerjei

  // Init map once
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
      onBoundsChange?.(bounds);
    };

    map.on('moveend', emitBounds);
    map.on('load', emitBounds);

    mapRef.current = map;

    return () => {
      // grid aurák takarítása
      gridMarkersRef.current.forEach(m => m.remove());
      gridMarkersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, [onBoundsChange]);

  // center map on GPS / keresett város
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

  // user location marker
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

  // pulses – rövid ideig villanó karikák
  useEffect(() => {
    if (!mapRef.current || !pulses || pulses.length === 0) return;
    const map = mapRef.current;

    pulses.forEach((p) => {
      const lat = typeof p.lat === 'number' ? p.lat : Number(p.lat);
      const lng = typeof p.lng === 'number' ? p.lng : Number(p.lng);

      if (Number.isNaN(lat) || Number.isNaN(lng)) {
        console.warn('Invalid pulse coords:', p);
        return;
      }

      const container = document.createElement('div');
      container.className = 'pulse-marker-container';

      const el = document.createElement('div');
      el.className = 'pulse-marker';
      container.appendChild(el);

      const color = EMOTION_COLORS[p.emotion] || 'rgba(255,255,255,0.9)';
      el.style.setProperty('--pulse-color', color);

      const marker = new maplibregl.Marker({ element: container })
        .setLngLat([lng, lat])
        .addTo(map);

      setTimeout(() => {
        marker.remove();
      }, 5000);
    });
  }, [pulses]);

  // GRID AURÁK – mindenki látja, ami a viewporton belül van
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // előző cella-markerek törlése
    gridMarkersRef.current.forEach((m) => m.remove());
    gridMarkersRef.current = [];

    if (!gridCells || gridCells.length === 0) return;

    gridCells.forEach((cell) => {
      const { lat, lng, color, intensity } = cell;
      if (
        typeof lat !== 'number' ||
        typeof lng !== 'number' ||
        !color
      ) return;

      const el = document.createElement('div');
      el.className = 'grid-aura';
      el.style.setProperty('--grid-color', color);
      // kicsit erősebb, de intensity-től függ
      const baseOpacity = 0.35;
      const extra = 0.55 * (intensity || 0);
      el.style.opacity = String(baseOpacity + extra);

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([lng, lat])
        .addTo(map);

      gridMarkersRef.current.push(marker);
    });
  }, [gridCells]);

  // zoom + back-to-me

  function handleZoomIn() {
    if (!mapRef.current) return;
    mapRef.current.zoomIn();
  }

  function handleZoomOut() {
    if (!mapRef.current) return;
    mapRef.current.zoomOut();
  }

  function handleBackToMe() {
    const map = mapRef.current;
    if (!map || !coords) return;
    map.flyTo({
      center: [coords.lng, coords.lat],
      zoom: 12,
      speed: 1.2,
      essential: true
    });
  }

  return (
    <div className="map-container" ref={mapContainerRef}>
      <div className="map-zoom-controls">
        <button onClick={handleZoomIn}>+</button>
        <button onClick={handleZoomOut}>−</button>
      </div>

      {coords && (
        <button
          className="back-to-me-btn"
          onClick={handleBackToMe}
          title="Back to my location"
        >
          📍
        </button>
      )}
    </div>
  );
}
