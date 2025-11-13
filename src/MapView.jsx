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


export function MapView({ coords, onBoundsChange, pulses }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const userMarkerRef = useRef(null);

  // Init map once
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: 'https://demotiles.maplibre.org/style.json',
      center: [16, 47],
      zoom: 2,
      attributionControl: false
    });

    // enable interactions
    map.dragPan.enable();
    map.scrollZoom.enable();
    map.touchZoomRotate.enable();

   map.on('moveend', () => {
  const b = map.getBounds();
  const bounds = {
    north: b.getNorth(),
    south: b.getSouth(),
    east: b.getEast(),
    west: b.getWest()
  };
  onBoundsChange?.(bounds);
});


    map.on('load', () => {
      const b = map.getBounds();
      const bounds = {
        north: b.getNorth(),
        south: b.getSouth(),
        east: b.getEast(),
        west: b.getWest()
      };
      onBoundsChange?.(bounds);
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [onBoundsChange]);

  // center map on user coords
  useEffect(() => {
  if (!coords || !mapRef.current) return;
  mapRef.current.flyTo({
    center: [coords.lng, coords.lat],
    zoom: 10,
    speed: 0.9
  });
}, [coords?.lat, coords?.lng]);
  
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

      // 1. Külső konténer a pozicionáláshoz
      const container = document.createElement('div');
      container.className = 'pulse-marker-container';

      // 2. Belső elem az animációhoz
      const el = document.createElement('div');
      el.className = 'pulse-marker';
      
      container.appendChild(el);

      // A színt a belső, animált elemen állítjuk be
      const color = EMOTION_COLORS[p.emotion] || 'rgba(255,255,255,0.9)';
      el.style.setProperty('--pulse-color', color);

      // A külső konténert adjuk át a Markernek
      const marker = new maplibregl.Marker({ element: container })
        .setLngLat([lng, lat])
        .addTo(map);

      // A marker eltávolítása az animáció után
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

  return (
    <div className="map-container" ref={mapContainerRef}>
      <div className="map-zoom-controls">
        <button onClick={handleZoomIn}>+</button>
        <button onClick={handleZoomOut}>−</button>
      </div>
    </div>
  );
}
