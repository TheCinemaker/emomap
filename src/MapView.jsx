// src/MapView.jsx
import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

const EMOTION_COLORS = {
  happy: '#00ff00',
  bored: '#a0a0a0',
  stressed: '#ff0000',
  tired: '#ffff00',
  motivated: '#00ccff',
  love: '#ff00ff',
  hype: '#bf00ff'
};

// Global map to hold grid markers for easy removal
const moodGridMarkers = new Map();

export function MapView({
  coords,
  viewCenter,
  onBoundsChange,
  pulses,
  personalMood,
  personalAuraLocation, // New prop
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
  // Move/center map on Search Result (viewCenter)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !viewCenter) return;

    map.flyTo({
      center: [viewCenter.lng, viewCenter.lat],
      zoom: viewCenter.zoom || 10,
      speed: 1.2
    });
  }, [viewCenter]);

  // Initial Center on User Location (only once)
  const userInteracted = useRef(false);
  const initialCenterDone = useRef(false);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const onInteraction = () => {
      userInteracted.current = true;
    };

    map.on('dragstart', onInteraction);
    map.on('zoomstart', onInteraction);
    map.on('pitchstart', onInteraction);

    return () => {
      map.off('dragstart', onInteraction);
      map.off('zoomstart', onInteraction);
      map.off('pitchstart', onInteraction);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !coords) return;

    // Only center if we haven't done it yet and no search result is active
    // AND the user hasn't interacted with the map yet
    if (!viewCenter && !userInteracted.current && !initialCenterDone.current) {
      map.flyTo({
        center: [coords.lng, coords.lat],
        zoom: 12,
        speed: 1.2
      });
      initialCenterDone.current = true;
    }
  }, [coords, viewCenter]);

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

  // Helper to calculate pixel size for a given radius in meters
  const getPixelSize = (lat, zoom, meters) => {
    const metersPerPixel = 156543.03392 * Math.cos((lat * Math.PI) / 180) / Math.pow(2, zoom);
    return meters / metersPerPixel;
  };

  // Personal Aura
  useEffect(() => {
    const map = mapRef.current;
    // Use personalAuraLocation if available, otherwise fallback to coords (only if no vote yet)
    const targetLoc = personalAuraLocation;

    if (!map || !targetLoc) {
      // If we have no vote location, remove aura
      if (personalAuraRef.current) {
        personalAuraRef.current.remove();
        personalAuraRef.current = null;
      }
      return;
    }

    if (!personalMood || !personalMood.color || personalMood.total === 0) {
      if (personalAuraRef.current) {
        personalAuraRef.current.remove();
        personalAuraRef.current = null;
      }
      return;
    }

    const updateAuraVisuals = () => {
      if (!personalAuraRef.current) return;

      const zoom = map.getZoom();
      // Calculate size for ~2km diameter (1000m radius * 2)
      const sizePx = getPixelSize(targetLoc.lat, zoom, 2000);

      const el = personalAuraRef.current.getElement().querySelector('.personal-aura-inner');
      if (el) {
        el.style.setProperty('--personal-color', personalMood.color);
        el.style.opacity = String(Math.min(1, 0.4 + 0.6 * personalMood.intensity));
        el.style.width = `${sizePx}px`;
        el.style.height = `${sizePx}px`;
      }
    };

    if (!personalAuraRef.current) {
      const container = document.createElement('div');
      container.className = 'personal-aura';
      // Center the inner element
      container.style.display = 'flex';
      container.style.justifyContent = 'center';
      container.style.alignItems = 'center';

      const inner = document.createElement('div');
      inner.className = 'personal-aura-inner';
      container.appendChild(inner);

      const marker = new maplibregl.Marker({ element: container })
        .setLngLat([targetLoc.lng, targetLoc.lat])
        .addTo(map);

      personalAuraRef.current = marker;
    } else {
      personalAuraRef.current.setLngLat([targetLoc.lng, targetLoc.lat]);
    }

    updateAuraVisuals();

    // Update size on zoom
    const onZoom = () => updateAuraVisuals();
    map.on('zoom', onZoom);

    return () => {
      map.off('zoom', onZoom);
    };
  }, [personalAuraLocation, personalMood]);

  // Pulse Effects - Optimized
  const renderedPulses = useRef(new Set());

  useEffect(() => {
    if (!mapRef.current || !pulses || pulses.length === 0) return;
    const map = mapRef.current;

    pulses.forEach((p) => {
      if (renderedPulses.current.has(p.id)) return; // Skip if already rendered

      const lat = Number(p.lat);
      const lng = Number(p.lng);
      if (Number.isNaN(lat) || Number.isNaN(lng)) return;

      renderedPulses.current.add(p.id);

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

      // Remove after animation
      setTimeout(() => {
        marker.remove();
        renderedPulses.current.delete(p.id); // Cleanup ID from set
      }, 2000); // Match CSS animation duration
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

      // Dynamic size for grid cells too (approx 20km to overlap nicely and form a cloud)
      const pixelSize = getPixelSize(cell.lat, currentZoom, 20000);

      if (moodGridMarkers.has(key)) {
        const marker = moodGridMarkers.get(key);
        marker.setLngLat([cell.lng, cell.lat]);

        const el = marker.getElement().querySelector('.mood-grid-cell-inner');
        if (el) {
          el.style.setProperty('--cell-color', cell.color);
          el.style.opacity = String(0.2 + 0.6 * cell.intensity);
          el.style.width = `${pixelSize}px`;
          el.style.height = `${pixelSize}px`;
        }
      } else {
        const container = document.createElement('div');
        container.className = 'mood-grid-cell-container';
        container.style.display = 'flex';
        container.style.justifyContent = 'center';
        container.style.alignItems = 'center';

        const inner = document.createElement('div');
        inner.className = 'mood-grid-cell-inner';
        container.appendChild(inner);

        inner.style.setProperty('--cell-color', cell.color);
        inner.style.opacity = String(0.2 + 0.6 * cell.intensity);
        inner.style.width = `${pixelSize}px`;
        inner.style.height = `${pixelSize}px`;

        const marker = new maplibregl.Marker({ element: container })
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

    userInteracted.current = false; // Reset interaction flag
    map.flyTo({
      center: [coords.lng, coords.lat],
      zoom: 12,
      speed: 1.2
    });
  }

  return (
    <div className="map-container" ref={mapContainerRef} style={{ width: '100%', height: '100%' }}>
      <div className="map-zoom-controls">
        <button onClick={handleZoomIn}>+</button>
        <button onClick={handleZoomOut}>−</button>
      </div>

      {coords && (
        <button className="back-to-me-btn" onClick={handleBackToMe} title="Back to Me">
          ⌖
        </button>
      )}
    </div>
  );
}
