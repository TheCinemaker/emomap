// src/MapView.jsx
import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

const EMOTION_COLORS = {
  happy: '#22c55e',     // zöld
  bored: '#9ca3af',     // szürke
  stressed: '#ef4444',  // piros
  tired: '#facc15',     // sárga
  motivated: '#0ea5e9', // kék
  love: '#ec4899',      // pink
  hype: '#a855f7'       // lila
};

export function MapView({ coords, viewCenter, onBoundsChange, pulses, personalMood }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const userMarkerRef = useRef(null);
  const personalAuraRef = useRef(null);

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

    // enable interactions
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
      map.remove();
      mapRef.current = null;
    };
  }, [onBoundsChange]);

  // center map on user coords
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

  // show user position as a blue dot
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !coords) return;

    if (!userMarkerRef.current) {
      const el = document.createElement('div');
      el.className = 'user-marker';
      userMarkerRef.current = new maplibregl.Marker({
        element: el
      })
        .setLngLat([coords.lng, coords.lat])
        .addTo(map);
    } else {
      userMarkerRef.current.setLngLat([coords.lng, coords.lat]);
    }
  }, [coords]);

  // personal aura around user
useEffect(() => {
  const map = mapRef.current;
  if (!map || !coords) return;

  // ha nincs mood szín, távolítsuk el az aurát
  if (!personalMood || !personalMood.color || personalMood.total === 0) {
    if (personalAuraRef.current) {
      personalAuraRef.current.remove();
      personalAuraRef.current = null;
    }
    return;
  }

  const opacity = Math.min(1, 0.4 + 0.6 * personalMood.intensity);

  if (!personalAuraRef.current) {
    // létrehozzuk a marker elementet
    const container = document.createElement('div');
    container.className = 'personal-aura';

    const inner = document.createElement('div');
    inner.className = 'personal-aura-inner';
    container.appendChild(inner);

    inner.style.setProperty('--personal-color', personalMood.color);
    inner.style.opacity = String(opacity);

    const marker = new maplibregl.Marker({
      element: container
    })
      .setLngLat([coords.lng, coords.lat])
      .addTo(map);

    personalAuraRef.current = marker;
  } else {
    // frissítjük a meglévő aurát
    const marker = personalAuraRef.current;
    marker.setLngLat([coords.lng, coords.lat]);

    const el = marker.getElement().querySelector('.personal-aura-inner');
    if (el) {
      el.style.setProperty('--personal-color', personalMood.color);
      el.style.opacity = String(opacity);
    }
  }
}, [coords, personalMood]);


  // show pulses (new events)
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
      }, 6000);
    });
  }, [pulses]);

  // zoom controls
  function handleZoomIn() {
    if (!mapRef.current) return;
    mapRef.current.zoomIn();
  }
  
  function handleZoomOut() {
    if (!mapRef.current) return;
    mapRef.current.zoomOut();
  }

  // Vissza a saját pozícióhoz
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
      
      {/* Vissza hozzám gomb */}
      {coords && (
        <button 
          className="back-to-me-btn"
          onClick={handleBackToMe}
          title="Vissza a saját helyemhez"
        >
          📍
        </button>
      )}
    </div>
  );
}
