// src/MapView.jsx
import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

export function MapView({ coords, onBoundsChange, pulses }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);

  // Térkép inicializálása egyszer
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: 'https://demotiles.maplibre.org/style.json',
      center: [16, 47], // default: Európa közepe
      zoom: 2,
      attributionControl: false
    });

    // ha elmozdul a map, jelezzük a bounds-ot felfelé
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

    // első bounds callback betöltéskor
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

  // ha megjön a user GPS, rászáll a map
  useEffect(() => {
    if (!coords || !mapRef.current) return;
    mapRef.current.flyTo({
      center: [coords.lng, coords.lat],
      zoom: 10,
      speed: 0.8
    });
  }, [coords]);

  // új impulzusok villantása
  useEffect(() => {
    if (!mapRef.current || !pulses || pulses.length === 0) return;

    const map = mapRef.current;

    pulses.forEach((p) => {
      if (typeof p.lng !== 'number' || typeof p.lat !== 'number') return;

      const el = document.createElement('div');
      el.className = 'pulse-marker';

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([p.lng, p.lat])
        .addTo(map);

      setTimeout(() => {
        marker.remove();
      }, 2200); // kicsivel tovább, mint az animáció
    });
  }, [pulses]);

  return <div className="map-container" ref={mapContainerRef} />;
}
